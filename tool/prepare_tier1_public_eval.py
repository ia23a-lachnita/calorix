#!/usr/bin/env python3
"""Freeze a small public reference sample before images or model results exist."""
import argparse
import collections
import csv
import hashlib
import io
import json
import math
from datetime import datetime, timezone
from pathlib import Path
import urllib.request
import urllib.error
import PIL
from PIL import Image

SEED='calorix-tier1-public-v1-20261108'
BASE='https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/'
SOURCES={
 'metadataCafe1.csv':('metadata/dish_metadata_cafe1.csv','881df31f27c2343d0ce219964527e0796f6ddadd60701ce6840fa801e8c2a960'),
 'metadataCafe2.csv':('metadata/dish_metadata_cafe2.csv','ef9f800d7b9c2e7e9a9e7cda5cbb4cfe51c760a8c1af4c05786ccf051bf5d77d'),
 'ingredients_metadata.csv':('metadata/ingredients_metadata.csv','87a9bbd1fd2e28f09f16305a04946ddbe31eb7d9d03686d7e2fb3d8f19f3effb'),
 'rgb_train_ids.txt':('dish_ids/splits/rgb_train_ids.txt','efd34a682b5483b01e6bd0a7c1267efec28440a8194985f9d3817d8ebc8169bd'),
 'phase-a-qualified-proof-47b607e/research-rgb-test-ids.txt':('dish_ids/splits/rgb_test_ids.txt','560ff0eedb1a2027c21f5da3a4c38a53fa201c87d108e76b11cceaa1d956ac8e')}
DEPTH_SHA='6e43a5334a72bd06fa9c0d4b3bc86e2f57e5342b0b260d3fa003a76f7e39eca2'

def sha(data):return hashlib.sha256(data).hexdigest()
def date_of(identifier):return datetime.fromtimestamp(int(identifier.removeprefix('dish_')),timezone.utc).date().isoformat()
def vector(fields):
    kcal,mass,fat,carbs,protein=map(float,fields)
    return dict(kcal=kcal,massG=mass,fatG=fat,carbsG=carbs,proteinG=protein)

def parse_dishes(text, source):
    result=[]
    for fields in csv.reader(io.StringIO(text)):
        if not fields:continue
        if fields[0]=='dish_id':continue
        if len(fields)<13 or (len(fields)-6)%7:raise ValueError('Expected six fixed and seven ingredient columns')
        identifier=fields[0]
        if not identifier.startswith('dish_') or len(identifier)!=15 or not identifier[5:].isdigit():raise ValueError('Invalid source dish ID')
        ingredients=[]
        for i in range(6,len(fields),7):
            ingredients.append(dict(id=fields[i],name=fields[i+1],**vector([fields[i+3],fields[i+2],*fields[i+4:i+7]])))
        result.append(dict(id=identifier,captureDate=date_of(identifier),reference=vector(fields[1:6]),ingredients=ingredients,
                           sourceMetadataFile=source,rowFieldsSha256=sha(json.dumps(fields,ensure_ascii=False,separators=(',',':')).encode())))
    return result

def select_sample(dishes, test_ids, previous_ids, vocabulary, count=20, seed=SEED):
    previous_dates={date_of(i) for i in previous_ids}
    counts=collections.Counter();excluded=[];eligible=[];seen=set()
    for row in dishes:
        identifier=row['id']
        if identifier in seen:raise ValueError('Duplicate metadata dish ID')
        seen.add(identifier)
        if identifier not in test_ids:continue
        ref=row['reference'];parts=row['ingredients'];reason=None
        if identifier in previous_ids:reason='previous_id'
        elif row['captureDate'] in previous_dates:reason='previous_date'
        elif not all(math.isfinite(v) and v>=0 for v in ref.values()) or ref['kcal']<=0 or ref['massG']<=0:reason='invalid_total'
        elif any(p['id'] not in vocabulary for p in parts):reason='unknown_ingredient'
        elif any('deprecated' in vocabulary[p['id']].lower() for p in parts):reason='deprecated_ingredient'
        elif any(not all(math.isfinite(p[k]) and p[k]>=0 for k in ref) or p['massG']<=0 for p in parts):reason='invalid_ingredient'
        elif abs(sum(p['massG'] for p in parts)-ref['massG'])>.01:reason='mass_sum_mismatch'
        elif any(abs(sum(p[k] for p in parts)-ref[k])>.01 for k in ['kcal','fatG','carbsG','proteinG']):reason='nutrient_sum_mismatch'
        if reason:counts[reason]+=1;excluded.append({'id':identifier,'reason':reason})
        else:eligible.append(row)
    by_date=collections.defaultdict(list)
    for row in eligible:by_date[row['captureDate']].append(row)
    if count<1 or count>20 or len(by_date)<count:raise ValueError('Need 1..20 available distinct capture dates')
    dates=sorted(by_date,key=lambda date:(sha((seed+'|'+date).encode()),date))
    chosen=[min(by_date[date],key=lambda r:(sha((seed+'|'+date+'|'+r['id']).encode()),r['id'])) for date in dates[:count]]
    return {'cases':chosen,'selection':{'seed':seed,'previousIds':sorted(previous_ids),'previousDates':sorted(previous_dates),
            'eligibleScans':len(eligible),'eligibleDates':len(dates),'selectedDates':dates[:count],
            'exclusionCounts':dict(sorted(counts.items())),'excluded':sorted(excluded,key=lambda r:r['id']),
            'rule':'One scan per SHA256-ranked UTC date, then SHA256-ranked ID; date thinning is a heuristic, not independent final-plate proof'}}

def convert_jpeg(data):
    with Image.open(io.BytesIO(data)) as source:
        rgb=source.convert('RGB');out=io.BytesIO();rgb.save(out,format='JPEG',quality=85,subsampling=2,exif=b'')
        return out.getvalue()

def write_new(path,value):
    with path.open('x') as out:json.dump(value,out,indent=2,allow_nan=False);out.write('\n')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',required=True,type=Path);parser.add_argument('--overhead-split',required=True,type=Path)
    parser.add_argument('--repo-root',default=Path.cwd(),type=Path);parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args();texts={};provenance=[]
    for name,(remote,expected) in SOURCES.items():
        data=(args.source_root/name).read_bytes()
        if sha(data)!=expected:raise ValueError('Pinned source hash mismatch: '+name)
        texts[name]=data.decode('utf-8-sig');provenance.append({'url':BASE+remote,'sha256':expected,'bytes':len(data)})
    split=args.overhead_split.read_bytes()
    if sha(split)!=DEPTH_SHA:raise ValueError('Official overhead TEST hash mismatch')
    ids=set(split.decode().split());rgb=set(texts['phase-a-qualified-proof-47b607e/research-rgb-test-ids.txt'].split())
    if not ids<=rgb or ids & set(texts['rgb_train_ids.txt'].split()):raise ValueError('Official split overlap/mismatch')
    provenance.append({'url':BASE+'dish_ids/splits/depth_test_ids.txt','sha256':DEPTH_SHA,'bytes':len(split)})
    vocabulary={f"ingr_{int(r['id']):010d}":r['ingr'] for r in csv.DictReader(io.StringIO(texts['ingredients_metadata.csv']))}
    old=set()
    for name in ['public-manifest.json','calibration-manifest.json','accuracy-development-manifest-v1.json']:
        manifest=json.loads((args.repo_root/'functions/eval/nutrition'/name).read_text())
        old.update(c['source']['objectId'] for c in manifest['cases'] if c.get('source',{}).get('dataset')=='nutrition5k')
    rows=parse_dishes(texts['metadataCafe1.csv'],'metadataCafe1.csv')+parse_dishes(texts['metadataCafe2.csv'],'metadataCafe2.csv')
    sample=select_sample(rows,ids,old,vocabulary)
    args.output.mkdir()  # Exclusive directory claim: never overwrite an earlier selection/run.
    protocol={'schemaVersion':1,'scope':'public_dataset','datasetId':'nutrition5k','split':'official overhead-available TEST; RGB image only',
              'sampleCount':20,'sources':provenance,'license':{'id':'CC-BY-4.0','url':'https://creativecommons.org/licenses/by/4.0/','attribution':'Thames et al., Nutrition5k, CVPR2021'},
              'preprocessing':{'pillow':PIL.__version__,'jpegLibrary':Image.core.jpeglib_version,'jpegTurbo':getattr(Image.core,'libjpeg_turbo_version',None),'format':'RGB JPEG','quality':85,'subsampling':2,'exif':'removed','resize':False},
              'questionPolicy':'Unanswered; no owner preparation knowledge and no reference-derived answers',
              'androidWeighedMeals':0,'pretrainingExposure':'unknown','referenceBasis':'Original dataset recipe-derived nutrients and measured component masses',**sample}
    write_new(args.output/'selection.json',protocol)  # Frozen BEFORE fetching images.
    (args.output/'originals').mkdir();(args.output/'inputs').mkdir()
    for case in protocol['cases']:
        identifier=case['id'];url=BASE+f'imagery/realsense_overhead/{identifier}/rgb.png';case['sourceImageUrl']=url
        try:
            with urllib.request.urlopen(url,timeout=30) as response:data=response.read(8*1024*1024+1)
            if len(data)>8*1024*1024:raise ValueError('Image exceeds source size limit')
            with Image.open(io.BytesIO(data)) as image:
                if image.format!='PNG':raise ValueError('Expected source PNG')
                case['width'],case['height']=image.size
            jpeg=convert_jpeg(data)
            if len(jpeg)>4*1024*1024:raise ValueError('JPEG exceeds inference size limit')
            (args.output/'originals'/f'{identifier}.png').write_bytes(data)
            (args.output/'inputs'/f'{identifier}.jpg').write_bytes(jpeg)
            case.update(sourceImageSha256=sha(data),inputSha256=sha(jpeg),inputPath=f'inputs/{identifier}.jpg',inputStatus='ready',inputFailure=None)
        except (OSError,ValueError) as error:
            category=f'http_{error.code}' if isinstance(error,urllib.error.HTTPError) else 'image_preparation_failure'
            case.update(inputPath=None,inputSha256=None,inputStatus='dataset_failure',inputFailure=category)
    write_new(args.output/'manifest.json',protocol)
    print(json.dumps({'sampleCount':20,'ready':sum(c['inputStatus']=='ready' for c in protocol['cases']),'eligibleScans':sample['selection']['eligibleScans'],'eligibleDates':sample['selection']['eligibleDates'],'output':str(args.output)}))

if __name__=='__main__':main()
