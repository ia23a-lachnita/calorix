"""Private, bounded transfer-cohort preparation behind an explicit rights gate."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import urllib.request

from PIL import Image, ImageOps
import PIL
from tool.transfer_dataset import parse_nv_csv, associate_images, select_transfer_cases
from tool.run_transfer_lens import require_transfer_rights

METADATA='nutritionverse_dish_metadata3.csv'
SPLITS='nutritionverse-manual/nutritionverse-manual/updated-manual-dataset-splits.csv'
SEED='calorix-nutritionverse-transfer-v1-20261111'
ENDPOINT='https://api.kaggle.com/v1/datasets.DatasetApiService/DownloadDataset'


def download_file(name,budget):
    body={'ownerSlug':'nutritionverse','datasetSlug':'nutritionverse-real',
          'datasetVersionNumber':2,'fileName':name,'raw':True}
    request=urllib.request.Request(ENDPOINT,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=45) as response:
        length=response.headers.get('Content-Length')
        if length and int(length)>budget:raise ValueError('Source file exceeds bounded download budget')
        data=response.read(budget+1)
    if len(data)>budget:raise ValueError('Source file exceeds bounded download budget')
    return data


def _write(path,value):
    with path.open('x') as f:json.dump(value,f,indent=2,sort_keys=True,allow_nan=False);f.write('\n')


def prepare_transfer(rights_path, files_path, output, count=20, fetch=None):
    rights_bytes=rights_path.read_bytes();rights=json.loads(rights_bytes);require_transfer_rights(rights)
    if output.exists():raise FileExistsError('Use a fresh private output directory')
    if type(count) is not int or not 1<=count<=20:raise ValueError('Bounded cohort required')
    listing_bytes=files_path.read_bytes();listing=json.loads(listing_bytes)
    entries={f['name']:f for f in listing}
    if len(entries)!=len(listing):raise ValueError('Unique published file listing required')
    for name in (METADATA,SPLITS):
        if name not in entries:raise ValueError('Source reference files missing')
    output.mkdir();(output/'sources').mkdir();sources={};pins=[];fetch=fetch or download_file
    def get(name,budget):
        expected=entries[name].get('totalBytes')
        if type(expected) is not int or not 0<expected<=budget:raise ValueError('Invalid published source size')
        data=fetch(name,budget)
        if not isinstance(data,bytes) or len(data)!=expected:raise ValueError('Published source size mismatch')
        return data
    for name in (METADATA,SPLITS):
        data=get(name,1024*1024);sources[name]=data
        (output/'sources'/Path(name).name).write_bytes(data)
        pins.append({'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    metadata=parse_nv_csv(sources[METADATA].decode('utf-8-sig'))
    reader=csv.DictReader(io.StringIO(sources[SPLITS].decode('utf-8-sig')),strict=True)
    if not reader.fieldnames or 'file_name' not in reader.fieldnames:raise ValueError('Actual split file_name column required')
    split_rows=list(reader);associated=associate_images(metadata,split_rows,listing)
    chosen=select_transfer_cases(associated,SEED,count)
    selected={r['id'] for r in associated}
    manifest={'schemaVersion':1,'datasetId':'nutritionverse-real','scope':'licensed_local_public_dataset_evaluation',
              'datasetVersion':2,'sampleCount':count,'seed':SEED,'sourceFiles':pins,
              'fileListingSha256':hashlib.sha256(listing_bytes).hexdigest(),
              'rightsDecisionSha256':hashlib.sha256(rights_bytes).hexdigest(),
              'rights':rights['rights'],'referenceBasis':'Author weighed ingredients and recipe-derived packaging/Canada Nutrient File nutrition; original labels unchanged',
              'checkpointTrainingExposure':'Not listed in specialist training sources; general pretraining exposure unknown',
              'metadataAudit':{'sourceDishes':len(metadata),'availableDishes':len(associated),'sourceSplitViews':len(split_rows),
                               'unavailableDishIds':[r['id'] for r in metadata if r['id'] not in selected],
                               'actualReferenceColumns':list(NV_SOURCE_COLUMNS),'mixedDishCounts':'unqualified; inspect original source ingredient metadata before claiming strata'},
              'questionPolicy':'Unanswered; never use reference labels to answer preparation questions',
              'preprocessing':{'pillow':PIL.__version__,'jpegLibrary':Image.core.jpeglib_version,'jpegTurbo':getattr(Image.core,'libjpeg_turbo_version',None),
                               'exifTranspose':True,'format':'RGB JPEG','quality':85,'subsampling':2,'resize':False,'crop':False},
              'cases':chosen}
    _write(output/'selection.json',manifest)  # Private, frozen BEFORE any photograph fetch.
    manifest['selectionSha256']=hashlib.sha256((output/'selection.json').read_bytes()).hexdigest()
    (output/'originals').mkdir();(output/'inputs').mkdir()
    for c in manifest['cases']:
        try:
            raw=get(c['sourceImagePath'],8*1024*1024)
            (output/'originals'/(c['id']+'.jpg')).write_bytes(raw)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format!='JPEG' or source.width*source.height>20000000:raise ValueError('Bounded original JPEG required')
                rgb=ImageOps.exif_transpose(source).convert('RGB');encoded=io.BytesIO()
                rgb.save(encoded,format='JPEG',quality=85,subsampling=2,exif=b'');data=encoded.getvalue()
                width,height=rgb.size
            if len(data)>4*1024*1024:raise ValueError('Prepared inference image exceeds4MiB')
            relative='inputs/'+c['id']+'.jpg';(output/relative).write_bytes(data)
            c.update(inputPath=relative,inputSha256=hashlib.sha256(data).hexdigest(),inputStatus='ready',inputFailure=None,
                     sourceImageSha256=hashlib.sha256(raw).hexdigest(),width=width,height=height)
        except Exception as error:
            c.update(inputPath=None,inputSha256=None,inputStatus='dataset_failure',inputFailure=type(error).__name__)
    _write(output/'manifest.json',manifest)
    return manifest


NV_SOURCE_COLUMNS=('dish_id','total_calories','total_food_weight','total_fats','total_carbohydrates','total_protein')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for key in ('rights','files','output'):p.add_argument('--'+key,type=Path,required=True)
    a=p.parse_args();m=prepare_transfer(a.rights,a.files,a.output)
    print(json.dumps({'selected':m['sampleCount'],'ready':sum(c['inputStatus']=='ready' for c in m['cases'])}))
