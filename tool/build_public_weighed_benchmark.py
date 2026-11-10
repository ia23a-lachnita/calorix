"""Build the pinned 40-scan bundle from existing local receipts; never infer."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from evaluate_public_weighed import read_json,validate_bundle,write_json

INDEX_SHA256='2a18ef5677cf5a128f0034c3003c1dc9d56727792f4966c5988d6cd50b84dfe3'
PROFILE={'model':'gemini-3.8-flash','catalogVersion':'usda-sr-2019-tier1-20261108-v1',
    'promptSha256':'7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566',
    'schemaSha256':'4306216d1b1b075e3994265d84527e1fc32fa29f80591201b1aab63d47288185'}


def build(index_path,source_root,expected_sha256=INDEX_SHA256):
    index,index_sha=read_json(index_path,expected_sha256);root=Path(source_root).resolve()
    if index.get('schema_version')!='public-weighed-inputs-1' or not isinstance(index.get('cohorts'),list):raise ValueError('Invalid frozen index')
    def path(name):
        if not isinstance(name,str) or Path(name).is_absolute():raise ValueError('Relative source path required')
        p=(root/name).resolve()
        if not p.is_relative_to(root):raise ValueError('Source path escapes root')
        return p
    def pinned(name,digest):return read_json(path(name),digest)[0]
    cases=[]
    for cohort in index['cohorts']:
        manifest=pinned(cohort['manifestPath'],cohort['manifestSha256']);run=pinned(cohort['runPath'],cohort['runSha256'])
        run_manifest=pinned(cohort['runManifestPath'],cohort['runManifestSha256'])
        if run.get('manifestSha256')!=cohort['runManifestSha256'] or any(run.get(k)!=v for k,v in PROFILE.items()):raise ValueError('Original run manifest/profile mismatch')
        if manifest.get('schemaVersion')!=1 or manifest.get('scope')!='public_dataset' or manifest.get('datasetId')!='nutrition5k':raise ValueError('Expected published Nutrition5k references')
        expected={c['id']:c for c in cohort['cases']};originals={c['id']:c for c in manifest['cases']};runtime={c['id']:c for c in run_manifest['cases']}
        if len(expected)!=len(cohort['cases']) or len(originals)!=len(manifest['cases']) or len(runtime)!=len(run_manifest['cases']) or set(expected)!=set(originals) or set(expected)!=set(runtime):raise ValueError('Cohort membership changed')
        for identity,pin in expected.items():
            case=originals[identity];other=runtime[identity]
            if any(case[k]!=other[k] for k in ['reference','ingredients','inputSha256']):raise ValueError('Run/reference input mismatch')
            if pin['inputSha256']!=case['inputSha256']:raise ValueError('Image pin mismatch')
            with path(pin['inputPath']).open('rb') as handle:image=handle.read(4*1024*1024+1)
            if len(image)>4*1024*1024 or hashlib.sha256(image).hexdigest()!=pin['inputSha256']:raise ValueError('Original image bytes changed')
            receipt=pinned(pin['receiptPath'],pin['receiptSha256'])
            if receipt.get('id')!=identity:raise ValueError('Receipt scan mismatch')
            provenance=receipt.get('estimate',{}).get('provenance',{})
            if any(k in provenance and provenance[k]!=v for k,v in PROFILE.items() if k!='schemaSha256'):raise ValueError('Receipt profile mismatch')
            cases.append({'id':identity,'cohort':cohort['name'],'captureDate':case['captureDate'],
                'reference':case['reference'],'ingredients':case['ingredients'],'inputSha256':pin['inputSha256'],'receiptSha256':pin['receiptSha256'],
                'sourceImageUrl':case['sourceImageUrl'],'sourceMetadataFile':case['sourceMetadataFile'],'rowFieldsSha256':case['rowFieldsSha256'],
                'predictions':{r:receipt[r] for r in ['A0','A1']},'provenance':{**PROFILE,'sourceCommit':run['sourceCommit']},
                'latencyMs':provenance.get('latencyMs'),'costUsd':provenance.get('costUsd'),
                'questionProposed':receipt.get('estimate',{}).get('question') is not None})
    result={'schema_version':'public-weighed-1','scope':'frozen_existing_40_public_scans' if index_sha==INDEX_SHA256 else 'custom_pinned_inputs',
            'source_index_sha256':index_sha,'cases':cases}
    validate_bundle(result);return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index',type=Path,default=Path(__file__).resolve().parent.parent/'docs/tier1-public-weighed-2026-11-10/input-index.json')
    parser.add_argument('--index-sha256',default=INDEX_SHA256);parser.add_argument('--source-root',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();write_json(args.output,build(args.index,args.source_root,args.index_sha256))


if __name__=='__main__':main()
