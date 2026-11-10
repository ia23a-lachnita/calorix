#!/usr/bin/env python3
"""Freeze TRAIN20/TEST10 before image retrieval. No model calls."""
import argparse,csv,io,json,hashlib,urllib.request,urllib.error
from pathlib import Path
import PIL
from PIL import Image
from tool.prepare_tier1_public_eval import SOURCES,BASE,parse_dishes,convert_jpeg,write_new,sha,date_of
from tool.portion_calibration import select_stratified,VECTOR

DEPTH={'train':'d9702b71ade32b012fcb272f1f58b1d19178acd4536eccc651857760eab4bc30','test':'6e43a5334a72bd06fa9c0d4b3bc86e2f57e5342b0b260d3fa003a76f7e39eca2'}
SEED='calorix-portion-scale-v1-20261110'

def main():
    a=argparse.ArgumentParser();a.add_argument('--source-root',type=Path,required=True);a.add_argument('--split-root',type=Path,required=True);a.add_argument('--output',type=Path,required=True);a.add_argument('--repo',type=Path,default=Path.cwd());args=a.parse_args()
    text={};pins=[]
    for name,(remote,digest) in SOURCES.items():
        raw=(args.source_root/name).read_bytes()
        if sha(raw)!=digest:raise ValueError('Source drift: '+name)
        text[name]=raw.decode('utf-8-sig');pins.append({'url':BASE+remote,'sha256':digest,'bytes':len(raw)})
    splits={}
    for arm,digest in DEPTH.items():
        raw=(args.split_root/f'depth_{arm}_ids.txt').read_bytes()
        if sha(raw)!=digest:raise ValueError('Overhead split drift')
        splits[arm]=set(raw.decode().split());pins.append({'url':BASE+f'dish_ids/splits/depth_{arm}_ids.txt','sha256':digest,'bytes':len(raw)})
    rgbtrain=set(text['rgb_train_ids.txt'].split());rgbtest=set(text['phase-a-qualified-proof-47b607e/research-rgb-test-ids.txt'].split())
    if rgbtrain&rgbtest or splits['train']&splits['test'] or not splits['train']<=rgbtrain or not splits['test']<=rgbtest:raise ValueError('Split overlap/mismatch')
    oldpath=args.repo/'docs/tier1-public-weighed-2026-11-10/bundle.json';oldraw=oldpath.read_bytes()
    if sha(oldraw)!='0b78b33438d7b3c66647a0a2403b7f4686909be5a47e50b936a590bf84b2bea6':raise ValueError('Old40 pin drift')
    old=json.loads(oldraw);oldids={r['id'] for r in old['cases']};oldDates={date_of(i) for i in oldids}
    priorpath=args.repo/'functions/eval/tier1-public/manifest-v1.json';priorraw=priorpath.read_bytes();prior=set(json.loads(priorraw)['selection']['previousIds']);excluded=oldids|prior
    if len(excluded)!=116 or len(oldDates)!=25:raise ValueError('Prior exclusion drift')
    vocab={f"ingr_{int(r['id']):010d}":r['ingr'] for r in csv.DictReader(io.StringIO(text['ingredients_metadata.csv']))}
    rows=sum([parse_dishes(text[n],n) for n in ['metadataCafe1.csv','metadataCafe2.csv']],[]);quality=[];bad=[]
    import math
    for r in rows:
        ref=r['reference'];parts=r['ingredients']
        valid=all(math.isfinite(v) and v>=0 for v in ref.values()) and ref['kcal']>0 and ref['massG']>0
        valid=valid and all(p['id'] in vocab and 'deprecated' not in vocab[p['id']].lower() and p['massG']>0 and all(math.isfinite(p[k]) and p[k]>=0 for k in VECTOR) for p in parts)
        valid=valid and all(abs(sum(p[k] for p in parts)-ref[k])<=.01 for k in VECTOR)
        (quality if valid else bad).append(r)
    test=select_stratified(quality,splits['test'],excluded,oldDates,[('high',5),('mid',5)],SEED+'|test',meal_range=True)
    train=select_stratified(quality,splits['train'],excluded,oldDates|{r['captureDate'] for r in test},[('high',4),('mid',10),('low',6)],SEED+'|train')
    protocol={'schemaVersion':1,'scope':'public_dataset','datasetId':'nutrition5k','seed':SEED,'sources':pins,
      'oldBundleSha256':sha(oldraw),'priorManifestSha256':sha(priorraw),'excludedIds':sorted(excluded),'excludedOld40Dates':sorted(oldDates),'invalidMetadataRows':len(bad),
      'license':{'id':'CC-BY-4.0','attribution':'Thames et al., Nutrition5k, CVPR2021','url':'https://creativecommons.org/licenses/by/4.0/'},
      'selectionRule':'TEST high5/mid5 first; TRAIN high4/mid10/low6 excludes newTESTdates; one SHA256-ranked date then ID per stratum. No replacements.',
      'questionPolicy':'Unanswered; no reference-derived preparation answers','androidWeighedMeals':0,'pretrainingExposure':'unknown',
      'preprocessing':{'pillow':PIL.__version__,'jpegLibrary':Image.core.jpeglib_version,'format':'RGB JPEG','quality':85,'subsampling':2,'exif':'removed','resize':False}}
    args.output.mkdir();write_new(args.output/'selection.json',{**protocol,'train':train,'test':test})
    (args.output/'originals').mkdir();(args.output/'inputs').mkdir()
    for arm,cases in [('train',train),('test',test)]:
        for case in cases:
            url=BASE+f"imagery/realsense_overhead/{case['id']}/rgb.png";case['sourceImageUrl']=url
            try:
                with urllib.request.urlopen(url,timeout=30) as resp:raw=resp.read(8*1024*1024+1)
                if len(raw)>8*1024*1024:raise ValueError('Image too large')
                with Image.open(io.BytesIO(raw)) as im:
                    if im.format!='PNG':raise ValueError('Expected PNG')
                    case['width'],case['height']=im.size
                jpeg=convert_jpeg(raw)
                if len(jpeg)>4*1024*1024:raise ValueError('JPEG too large')
                (args.output/'originals'/f"{case['id']}.png").write_bytes(raw);(args.output/'inputs'/f"{case['id']}.jpg").write_bytes(jpeg)
                case.update(inputPath=f"inputs/{case['id']}.jpg",inputSha256=sha(jpeg),sourceImageSha256=sha(raw),inputStatus='ready',inputFailure=None)
            except (OSError,ValueError) as error:
                case.update(inputPath=None,inputSha256=None,inputStatus='dataset_failure',inputFailure=f'http_{error.code}' if isinstance(error,urllib.error.HTTPError) else 'image_preparation_failure')
        write_new(args.output/f'{arm}.json',{**protocol,'split':'official RGB and overhead '+arm.upper(),'sampleCount':len(cases),'cases':cases})
    print(json.dumps({'train':len(train),'test':len(test),'ready':sum(c['inputStatus']=='ready' for c in train+test)}))
if __name__=='__main__':main()
