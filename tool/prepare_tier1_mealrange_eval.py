"""Freeze a meal-energy-stratified public sample before fetching images."""
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

SEED='calorix-tier1-mealrange-20261108-v1'
STRATA=[(600,1000,4),(400,600,3),(200,400,3)]


def select_mealrange(dishes,test_ids,legacy_ids,recent_ids,vocabulary):
    validated=base.select_sample(dishes,test_ids,legacy_ids,vocabulary,count=1,seed=SEED)
    excluded={r['id'] for r in validated['selection']['excluded']}
    eligible=[r for r in dishes if r['id'] in test_ids and r['id'] not in excluded and r['id'] not in recent_ids
              and 200<=r['reference']['kcal']<1000 and r['reference']['massG']>=150 and len(r['ingredients'])>=2]
    cases=[];used_dates=set();availability=[]
    for low,high,count in STRATA:
        pool=[r for r in eligible if low<=r['reference']['kcal']<high]
        by_date=collections.defaultdict(list)
        for row in pool:
            if row['captureDate'] not in used_dates:by_date[row['captureDate']].append(row)
        if len(by_date)<count:raise ValueError('Insufficient unused dates for frozen stratum quota; no fallback')
        prefix=f'{SEED}|{low}-{high}|'
        dates=sorted(by_date,key=lambda day:(base.sha((prefix+day).encode()),day))[:count]
        for day in dates:
            row=min(by_date[day],key=lambda r:(base.sha((prefix+day+'|'+r['id']).encode()),r['id']))
            cases.append(row);used_dates.add(day)
        availability.append({'lowInclusive':low,'highExclusive':high,'quota':count,'eligibleScans':len(pool),
                             'eligibleDates':len({r['captureDate'] for r in pool})})
    return {'cases':cases,'selection':{'seed':SEED,'strata':availability,'eligibleScans':len(eligible),
            'eligibleDates':len({r['captureDate'] for r in eligible}),'legacyIds':sorted(legacy_ids),
            'legacyDates':validated['selection']['previousDates'],'recentExcludedIds':sorted(recent_ids),
            'selectedDates':[r['captureDate'] for r in cases],
            'sourceExclusions':validated['selection']['excluded'],
            'rule':'High then mid then low quotas; SHA256-rank unique dates then IDs, no replacement. Reference-energy selection, not outcome selection. Recent capture dates may recur; independent completed plates not established.'}}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root',type=Path,required=True);parser.add_argument('--overhead-split',type=Path,required=True)
    parser.add_argument('--previous-manifest',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();texts={};sources=[]
    for name,(remote,expected) in base.SOURCES.items():
        raw=(args.source_root/name).read_bytes()
        if base.sha(raw)!=expected:raise ValueError('Pinned source drift: '+name)
        texts[name]=raw.decode('utf-8-sig');sources.append({'url':base.BASE+remote,'sha256':expected,'bytes':len(raw)})
    split=args.overhead_split.read_bytes()
    if base.sha(split)!=base.DEPTH_SHA:raise ValueError('Official overhead split drift')
    test_ids=set(split.decode().split())
    if not test_ids<=set(texts['phase-a-qualified-proof-47b607e/research-rgb-test-ids.txt'].split()) or test_ids&set(texts['rgb_train_ids.txt'].split()):raise ValueError('Invalid official split')
    sources.append({'url':base.BASE+'dish_ids/splits/depth_test_ids.txt','sha256':base.DEPTH_SHA,'bytes':len(split)})
    previous=json.loads(args.previous_manifest.read_text())
    vocabulary={f"ingr_{int(r['id']):010d}":r['ingr'] for r in csv.DictReader(io.StringIO(texts['ingredients_metadata.csv']))}
    rows=base.parse_dishes(texts['metadataCafe1.csv'],'metadataCafe1.csv')+base.parse_dishes(texts['metadataCafe2.csv'],'metadataCafe2.csv')
    sample=select_mealrange(rows,test_ids,set(previous['selection']['previousIds']),{r['id'] for r in previous['cases']},vocabulary)
    preprocessing={'pillow':base.PIL.__version__,'jpegLibrary':base.Image.core.jpeglib_version,
                   'jpegTurbo':getattr(base.Image.core,'libjpeg_turbo_version',None),'format':'RGB JPEG',
                   'quality':85,'subsampling':2,'exif':'removed','resize':False}
    protocol={'schemaVersion':1,'scope':'public_dataset','datasetId':'nutrition5k','split':'official overhead-available TEST; RGB only',
              'sampleCount':10,'sources':sources,'license':previous['license'],'preprocessing':preprocessing,
              'questionPolicy':'Unanswered; no owner/reference-derived preparation answers','androidWeighedMeals':0,
              'pretrainingExposure':'unknown','referenceBasis':previous['referenceBasis'],**sample}
    args.output.mkdir();base.write_new(args.output/'selection.json',protocol) # Before image/network outcomes.
    (args.output/'originals').mkdir();(args.output/'inputs').mkdir()
    for case in protocol['cases']:
        identifier=case['id'];url=base.BASE+f'imagery/realsense_overhead/{identifier}/rgb.png';case['sourceImageUrl']=url
        try:
            with urllib.request.urlopen(url,timeout=30) as response:raw=response.read(8*1024*1024+1)
            if len(raw)>8*1024*1024:raise ValueError('Oversize source')
            with base.Image.open(io.BytesIO(raw)) as image:
                if image.format!='PNG':raise ValueError('Expected PNG')
                case['width'],case['height']=image.size
            jpeg=base.convert_jpeg(raw)
            if len(jpeg)>4*1024*1024:raise ValueError('Oversize JPEG')
            (args.output/'originals'/f'{identifier}.png').write_bytes(raw)
            (args.output/'inputs'/f'{identifier}.jpg').write_bytes(jpeg)
            case.update(sourceImageSha256=base.sha(raw),inputSha256=base.sha(jpeg),inputPath=f'inputs/{identifier}.jpg',inputStatus='ready',inputFailure=None)
        except (OSError,ValueError) as error:
            reason=f'http_{error.code}' if isinstance(error,urllib.error.HTTPError) else 'image_preparation_failure'
            case.update(inputPath=None,inputSha256=None,inputStatus='dataset_failure',inputFailure=reason)
    base.write_new(args.output/'manifest.json',protocol)
    print(json.dumps({'selected':10,'ready':sum(r['inputStatus']=='ready' for r in protocol['cases']),'strata':sample['selection']['strata']}))


if __name__=='__main__':main()
