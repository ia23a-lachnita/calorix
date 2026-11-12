"""Pinned, zero-inference execution of the author-box portion diagnostic."""
import argparse
import hashlib
import importlib.metadata
import io
import json
from pathlib import Path
import platform
import subprocess
from PIL import Image
from tool.oracle_box_scale import parse_boxes,fit_priors,evaluate_boxes


def digest(data):return hashlib.sha256(data).hexdigest()
def checked_asset(root,row,kind):
    if kind not in ('annotation','image'):raise ValueError('Unknown source asset kind')
    root=root.resolve();relative=Path(row[kind+'Path'])
    if relative.is_absolute() or '..' in relative.parts:raise ValueError('Escaped source asset')
    p=(root/relative).resolve()
    if not p.is_relative_to(root):raise ValueError('Escaped source asset')
    limit=65536 if kind=='annotation' else 2097152
    if not p.is_file() or not 0<p.stat().st_size<=limit:raise ValueError('Missing or oversized source asset')
    raw=p.read_bytes()
    if digest(raw)!=row[kind+'Sha256'] or hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()!=row[kind+'GitBlobSha']:raise ValueError('Frozen source asset drift')
    return raw

def validate_manifest(manifest,protocol):
    if not isinstance(manifest.get('train'),list) or not isinstance(manifest.get('comparison'),list) or len(manifest['train'])!=protocol['trainCount'] or len(manifest['comparison'])!=protocol['comparisonCount']:raise ValueError('Exact frozen cohort counts required')
    train=[r.get('id') for r in manifest['train']];comparison=[r.get('id') for r in manifest['comparison']]
    if any(not isinstance(i,str) or not i for i in train+comparison) or len(set(train))!=len(train) or len(set(comparison))!=len(comparison) or set(train)&set(comparison) or set(manifest['baselineA1'])!=set(comparison):raise ValueError('Exact disjoint portion and baseline membership required')

def write(path,value):
    with path.open('x') as f:json.dump(value,f,indent=2,allow_nan=False);f.write('\n')

def run(repo,protocol_path,manifest_path,assets_root,output):
    git=lambda *args:subprocess.check_output(['git',*args],cwd=repo,text=True).strip()
    if git('status','--porcelain') or git('rev-parse','HEAD')!=git('rev-parse','@{upstream}'):raise ValueError('Commit and push clean source before fitting')
    relative=protocol_path.relative_to(repo);protocol_raw=protocol_path.read_bytes()
    if subprocess.check_output(['git','show','HEAD:'+str(relative)],cwd=repo)!=protocol_raw:raise ValueError('Committed protocol required')
    p=json.loads(protocol_raw)
    for pin in p['sourceFiles']:
        name=Path(pin['path'])
        if name.is_absolute() or '..' in name.parts:raise ValueError('Unsafe source pin')
        raw=(repo/name).read_bytes()
        if digest(raw)!=pin['sha256'] or subprocess.check_output(['git','show','HEAD:'+str(name)],cwd=repo)!=raw:raise ValueError('Frozen committed source drift')
    if platform.python_version()!=p['pythonVersion'] or importlib.metadata.version('Pillow')!=p['pillowVersion']:raise ValueError('Pinned numerical/image runtime required')
    manifest_raw=manifest_path.read_bytes();selection=(manifest_path.parent/'selection.json').read_bytes()
    if digest(manifest_raw)!=p['manifestSha256'] or digest(selection)!=p['selectionSha256']:raise ValueError('Frozen source cohort drift')
    m=json.loads(manifest_raw);validate_manifest(m,p)
    if m['selectionSha256']!=p['selectionSha256']:raise ValueError('Source selection receipt drift')
    output.mkdir()  # Exclusive, no resume or overwrite.
    failures=[]
    def features(row):
        if row['sourceStatus']!='ready':failures.append({'id':row['id'],'failure':row.get('sourceFailure','source_unavailable')});return None
        raw=checked_asset(assets_root,row,'annotation');image_raw=checked_asset(assets_root,row,'image')
        try:
            f=parse_boxes(raw,row['filename'],row['sourceClass'])
            with Image.open(io.BytesIO(image_raw)) as image:
                if image.format!='JPEG' or image.size!=(f['width'],f['height']):raise ValueError('Source image/XML dimensions mismatch')
            return f
        except ValueError as error:failures.append({'id':row['id'],'failure':str(error)});return None
    train=[]
    for row in m['train']:
        f=features(row)
        if f is not None:train.append({'id':row['id'],'sourceClass':row['sourceClass'],'referenceMassG':row['referenceMassG'],'features':f})
    comparison_ids={r['id'] for r in m['comparison']};priors=fit_priors(train,comparison_ids,minimum=3)
    if set(priors['classes'])!=set(m['classes']):raise ValueError('Every fixed class needs sufficient fitting groups')
    write(output/'priors.json',priors)  # Persist TRAIN-only fit BEFORE reading comparison features.
    write(output/'training-features.json',train)
    cases=[]
    for row in m['comparison']:
        f=features(row);cases.append({'id':row['id'],'sourceClass':row['sourceClass'],'referenceMassG':row['referenceMassG'],'features':f,'sourceFailure':next((e['failure'] for e in failures if e['id']==row['id']),None)})
    result=evaluate_boxes(cases,priors,m['baselineA1']);result.update(sourceCommit=git('rev-parse','HEAD'),protocolSha256=digest(protocol_raw),manifestSha256=digest(manifest_raw),selectionSha256=p['selectionSha256'],fitGroups=len(train),sourceFailures=failures,sourceSelectionCount=len(m['train'])+len(cases),newSdkInvocations=0,newLocalForwards=0)
    write(output/'comparison-features.json',cases);write(output/'result.json',result)
    print(json.dumps({'fittingGroups':len(train),'comparisonGroups':len(cases),'sourceFailures':len(failures),'newModelCalls':0}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ('repo','protocol','manifest','assets-root','output'):parser.add_argument('--'+key,type=Path,required=True)
    a=parser.parse_args();run(a.repo.resolve(),a.protocol.resolve(),a.manifest.resolve(),a.assets_root.resolve(),a.output.resolve())
