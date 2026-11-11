"""Prepare author-group-disjoint public references, never inference labels."""
import argparse
import csv
import hashlib
import json
import re
import urllib.request
from pathlib import Path

from tool.prepare_tier1_public_eval import (SOURCES, BASE, DEPTH_SHA, parse_dishes,
                                          select_sample, convert_jpeg, write_new)

GROUP_SHA = '87d1b4ebc9db79ec3e1a558d0b3731a154c7724c4de7d71561d836bd7b09d0ec'
DATASET_REVISION = 'ed6c9cef52238fec71a70c51d7d9043814a78d8a'
SEED = 'calorix-food-agreement-clean-groups-v1-20261111'
EXCLUSIONS = [
    'functions/eval/nutrition/public-manifest.json',
    'functions/eval/nutrition/calibration-manifest.json',
    'functions/eval/nutrition/accuracy-development-manifest-v1.json',
    'functions/eval/tier1-public/manifest-calorie-lens-v1.json',
    'docs/tier1-public-weighed-2026-11-10/bundle.json',
]


def validate_groups(rows):
    result = {}
    for r in rows:
        identifier = r['dish_id']; group = r['group']
        if (not re.fullmatch(r'dish_[0-9]{10}', identifier) or identifier in result
                or not isinstance(group, str) or not re.fullmatch(r'0|[1-9][0-9]*', group)
                or r['split'] not in ('train', 'val', 'test')
                or r['test_clean'] not in ('0', '1') or r['has_overhead'] not in ('0', '1')):
            raise ValueError('Invalid or duplicate author group metadata')
        result[identifier] = dict(group=int(group), split=r['split'],
                                  clean=r['test_clean']=='1', overhead=r['has_overhead']=='1')
    train = {v['group'] for v in result.values() if v['split']=='train'}
    val = {v['group'] for v in result.values() if v['split']=='val'}
    if train & val or any(v['clean'] and (v['split']!='test' or v['group'] in train|val)
                          for v in result.values()):
        raise ValueError('Author clean/split flags contradict group membership')
    return result


def exclude_prior_groups(dishes, metadata, prior_ids):
    if prior_ids-set(metadata):
        raise ValueError('Missing previous scan group metadata')
    excluded = {metadata[i]['group'] for i in prior_ids}
    return [r for r in dishes if r['id'] in metadata
            and metadata[r['id']]['split']=='test' and metadata[r['id']]['clean']
            and metadata[r['id']]['overhead'] and metadata[r['id']]['group'] not in excluded]


def prepare(repo, source, group_file, output):
    import PIL
    pins = []; texts = {}
    for name, (remote, expected) in {**SOURCES, 'depth_test_ids.txt':
                                   ('dish_ids/splits/depth_test_ids.txt', DEPTH_SHA)}.items():
        data = (source/name).read_bytes()
        if hashlib.sha256(data).hexdigest()!=expected:
            raise ValueError('Official metadata pin mismatch')
        texts[name] = data.decode('utf-8-sig')
        pins.append(dict(url=BASE+remote, sha256=expected, bytes=len(data)))
    if hashlib.sha256(group_file.read_bytes()).hexdigest()!=GROUP_SHA:
        raise ValueError('Pinned group projection required')
    metadata = validate_groups(csv.DictReader(group_file.open()))
    if len(metadata)!=5005:
        raise ValueError('Complete pinned author metadata required')
    prior = set(); prior_pins = []
    for name in EXCLUSIONS:
        raw = (repo/name).read_bytes(); data = json.loads(raw)
        prior_pins.append(dict(path=name,sha256=hashlib.sha256(raw).hexdigest()))
        for c in data['cases']:
            if c.get('source',{}).get('dataset')=='nutrition5k':
                prior.add(c['source']['objectId'])
            elif c['id'].startswith('dish_'):
                prior.add(c['id'])
    dishes = sum([parse_dishes(texts[n],n) for n in ('metadataCafe1.csv','metadataCafe2.csv')], [])
    eligible = exclude_prior_groups(dishes,metadata,prior)
    vocabulary = {f"ingr_{int(r['id']):010d}":r['ingr'] for r in
                  csv.DictReader(texts['ingredients_metadata.csv'].splitlines())}
    sample = select_sample(eligible,set(texts['depth_test_ids.txt'].split()),set(),vocabulary,count=20,seed=SEED)
    chosen_groups = [metadata[c['id']]['group'] for c in sample['cases']]
    if len(set(chosen_groups))!=20:
        raise ValueError('Twenty distinct author plate groups required')
    for c in sample['cases']:
        c['authorGroup'] = metadata[c['id']]['group']
        c['authorTestClean'] = True
    manifest = dict(schemaVersion=1,scope='public_dataset',datasetId='nutrition5k',sampleCount=20,
                    split='official overhead TEST; author test_clean; excluded prior groups',
                    sources=pins,license={'id':'CC-BY-4.0','attribution':'Thames et al., Nutrition5k, CVPR2021'},
                    authorDatasetRevision=DATASET_REVISION,groupProjectionSha256=GROUP_SHA,
                    checkpointTrainingLineageVerified=False,priorManifestPins=prior_pins,
                    excludedPriorIds=sorted(prior),excludedPriorGroups=sorted({metadata[i]['group'] for i in prior}),
                    questionPolicy='Unanswered; no reference-derived preparation answers',
                    androidWeighedMeals=0,pretrainingExposure='A1 unknown; Lens author metadata only',
                    referenceBasis='Original recipe-derived nutrients and weighed ingredient masses, unchanged',
                    preprocessing={'pillow':PIL.__version__,'jpegLibrary':PIL.Image.core.jpeglib_version,
                                   'format':'RGB JPEG','quality':85,'subsampling':2,'resize':False}, **sample)
    output.mkdir()
    write_new(output/'selection.json',manifest)  # Freeze before fetching any pixels.
    (output/'inputs').mkdir(); (output/'originals').mkdir()
    for c in manifest['cases']:
        url=BASE+f"imagery/realsense_overhead/{c['id']}/rgb.png";c['sourceImageUrl']=url
        try:
            with urllib.request.urlopen(url,timeout=45) as h:data=h.read(8*1024*1024+1)
            if len(data)>8*1024*1024:raise ValueError('Public image budget exceeded')
            jpeg=convert_jpeg(data)
            if len(jpeg)>4*1024*1024:raise ValueError('Cloud image budget exceeded')
            (output/'originals'/f"{c['id']}.png").write_bytes(data)
            (output/'inputs'/f"{c['id']}.jpg").write_bytes(jpeg)
            c.update(inputPath=f"inputs/{c['id']}.jpg",inputSha256=hashlib.sha256(jpeg).hexdigest(),
                     sourceImageSha256=hashlib.sha256(data).hexdigest(),inputStatus='ready',inputFailure=None)
        except Exception as error:
            c.update(inputPath=None,inputSha256=None,inputStatus='dataset_failure',inputFailure=type(error).__name__)
    write_new(output/'manifest.json',manifest)
    return manifest


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for key in ('repo','source','groups','output'):p.add_argument('--'+key,type=Path,required=True)
    a=p.parse_args();m=prepare(a.repo,a.source,a.groups,a.output)
    print(json.dumps({'cases':m['sampleCount'],'ready':sum(c['inputStatus']=='ready' for c in m['cases'])}))
