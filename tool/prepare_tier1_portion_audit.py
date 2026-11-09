"""Freeze ten new public scan IDs before a bounded paired prompt comparison."""
import argparse
import collections
import csv
import io
import json
import urllib.error
import urllib.request
from pathlib import Path
if __package__:
    from . import prepare_tier1_public_eval as base
else:
    import prepare_tier1_public_eval as base

SEED='calorix-tier1-portion-audit-20261109-v1'
STRATA=[(600,1000,4),(200,600,3),(0,200,3)]


def select_portion_audit(dishes,test_ids,legacy_ids,recent_ids,recent_dates,vocabulary):
    validated=base.select_sample(dishes,test_ids,legacy_ids,vocabulary,count=1,seed=SEED)
    excluded={r['id'] for r in validated['selection']['excluded']}
    eligible=[r for r in dishes if r['id'] in test_ids and r['id'] not in excluded|recent_ids
              and 0<r['reference']['kcal']<1000]
    selected=[];used_dates=set();availability=[]
    for low,high,count in STRATA:
        pool=[r for r in eligible if low<=r['reference']['kcal']<high]
        by_date=collections.defaultdict(list)
        for row in pool:
            if row['captureDate'] not in used_dates:by_date[row['captureDate']].append(row)
        if len(by_date)<count:raise ValueError('Insufficient distinct dates for fixed quota; no fallback')
        prefix=f'{SEED}|{low}-{high}|'
        dates=sorted(by_date,key=lambda d:(base.sha((prefix+d).encode()),d))[:count]
        for day in dates:
            selected.append(min(by_date[day],key=lambda r:(base.sha((prefix+day+'|'+r['id']).encode()),r['id'])))
            used_dates.add(day)
        availability.append({'lowInclusive':low,'highExclusive':high,'quota':count,
                             'eligibleScans':len(pool),'eligibleDates':len({r['captureDate'] for r in pool})})
    return {'cases':selected,'selection':{'seed':SEED,'strata':availability,
            'eligibleScans':len(eligible),'eligibleDates':len({r['captureDate'] for r in eligible}),
            'legacyIds':sorted(legacy_ids),'legacyDates':validated['selection']['previousDates'],
            'recentExcludedIds':sorted(recent_ids),'selectedDates':[r['captureDate'] for r in selected],
            'overlapWithPreviousDates':sorted(used_dates&recent_dates),
            'independentCompletedMealsEstablished':False,'sourceExclusions':validated['selection']['excluded'],
            'rule':'Fixed high/mid/low quotas; SHA256-ranked dates then IDs; no replacement. Exclude legacy dates/IDs and previous30IDs, permit disclosed cross-batch date overlap. Not independent held-out plates.'}}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,required=True);parser.add_argument('--overhead-split',type=Path,required=True)
    parser.add_argument('--previous-manifest',type=Path,required=True)
    parser.add_argument('--exclude-manifest',type=Path,action='append',default=[])
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();texts={};sources=[]
    if base.PIL.__version__!='11.1.0':raise ValueError('Use pinned Pillow11.1.0 before preparing inputs')
    for name,(remote,expected) in base.SOURCES.items():
        raw=(args.source_root/name).read_bytes()
        if base.sha(raw)!=expected:raise ValueError('Pinned source drift: '+name)
        texts[name]=raw.decode('utf-8-sig');sources.append({'url':base.BASE+remote,'sha256':expected,'bytes':len(raw)})
    split=args.overhead_split.read_bytes()
    if base.sha(split)!=base.DEPTH_SHA:raise ValueError('Official overhead split drift')
    test_ids=set(split.decode().split())
    if not test_ids<=set(texts['phase-a-qualified-proof-47b607e/research-rgb-test-ids.txt'].split()) or test_ids&set(texts['rgb_train_ids.txt'].split()):raise ValueError('Invalid official split')
    sources.append({'url':base.BASE+'dish_ids/splits/depth_test_ids.txt','sha256':base.DEPTH_SHA,'bytes':len(split)})
    previous=json.loads(args.previous_manifest.read_text());recent_ids=set();recent_dates=set()
    for manifest in [previous,*[json.loads(p.read_text()) for p in args.exclude_manifest]]:
        recent_ids.update(r['id'] for r in manifest['cases']);recent_dates.update(r['captureDate'] for r in manifest['cases'])
    vocabulary={f"ingr_{int(r['id']):010d}":r['ingr'] for r in csv.DictReader(io.StringIO(texts['ingredients_metadata.csv']))}
    rows=base.parse_dishes(texts['metadataCafe1.csv'],'metadataCafe1.csv')+base.parse_dishes(texts['metadataCafe2.csv'],'metadataCafe2.csv')
    sample=select_portion_audit(rows,test_ids,set(previous['selection']['previousIds']),recent_ids,recent_dates,vocabulary)
    protocol={'schemaVersion':1,'scope':'public_dataset','datasetId':'nutrition5k',
              'split':'official overhead-available TEST; RGB only','sampleCount':10,'sources':sources,
              'license':previous['license'],'preprocessing':{'pillow':base.PIL.__version__,
                  'jpegLibrary':base.Image.core.jpeglib_version,'jpegTurbo':getattr(base.Image.core,'libjpeg_turbo_version',None),
                  'format':'RGB JPEG','quality':85,'subsampling':2,'exif':'removed','resize':False,'maxPixels':4194304},
              'questionPolicy':'Unanswered; no owner/reference-derived preparation answers','androidWeighedMeals':0,
              'pretrainingExposure':'unknown','referenceBasis':previous['referenceBasis'],
              'experiment':{'profiles':['original','portion-audit-v1'],'maxSdkInvocations':20,'maxPerProfile':10,
                  'promotion':'No automatic promotion; both10valid, servedMAE/norm improve, P90 not worse, no failure increase',
                  'latencyInterpretation':'Descriptive only; sequential runs and caching confounded'},**sample}
    args.output.mkdir();base.write_new(args.output/'selection.json',protocol)
    (args.output/'originals').mkdir();(args.output/'inputs').mkdir()
    for case in protocol['cases']:
        identity=case['id'];url=base.BASE+f'imagery/realsense_overhead/{identity}/rgb.png';case['sourceImageUrl']=url
        try:
            with urllib.request.urlopen(url,timeout=30) as response:raw=response.read(8*1024*1024+1)
            if len(raw)>8*1024*1024:raise ValueError('Oversize source')
            with base.Image.open(io.BytesIO(raw)) as image:
                if image.format!='PNG' or image.width*image.height>4194304:raise ValueError('Invalid or oversize PNG')
                case['width'],case['height']=image.size
            jpeg=base.convert_jpeg(raw)
            if len(jpeg)>4*1024*1024:raise ValueError('Oversize JPEG')
            (args.output/'originals'/f'{identity}.png').write_bytes(raw);(args.output/'inputs'/f'{identity}.jpg').write_bytes(jpeg)
            case.update(sourceImageSha256=base.sha(raw),inputSha256=base.sha(jpeg),inputPath=f'inputs/{identity}.jpg',inputStatus='ready',inputFailure=None)
        except (OSError,ValueError) as error:
            case.update(inputPath=None,inputSha256=None,inputStatus='dataset_failure',
                        inputFailure=f'http_{error.code}' if isinstance(error,urllib.error.HTTPError) else 'image_preparation_failure')
    base.write_new(args.output/'manifest.json',protocol)
    print(json.dumps({'selected':10,'ready':sum(r['inputStatus']=='ready' for r in protocol['cases']),
                      'previousDateOverlap':len(sample['selection']['overlapWithPreviousDates'])}))


if __name__=='__main__':main()
