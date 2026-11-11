"""Bounded image-only transfer evaluation of the already qualified graph."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import time

from tool.transfer_dataset import image_inputs
from tool.run_calorie_lens_eval import write, verify_file, installed, supervise

BASE=Path('functions/eval/tier1-public')


def require_transfer_rights(profile):
    rights=profile.get('rights',{})
    if (rights.get('evaluationAllowed') is not True
            or rights.get('purpose') not in ('personal_noncommercial_evaluation','separate_permission')
            or not isinstance(rights.get('decisionEvidence'),str) or not rights['decisionEvidence'].strip()):
        raise ValueError('Compatible dataset-purpose decision required before data use')

def validate_image_case(case):
    if (not isinstance(case,dict) or set(case)!={'id','inputFile','inputSha256'}
            or not isinstance(case['id'],str) or not re.fullmatch(r'nv-dish-(0|[1-9][0-9]*)',case['id'])
            or not isinstance(case['inputFile'],str) or not Path(case['inputFile']).is_absolute()
            or not isinstance(case['inputSha256'],str) or not re.fullmatch(r'[a-f0-9]{64}',case['inputSha256'])):
        raise ValueError('Only canonical ID and pinned image fields permitted in worker')
    return case


def worker(spec):
    from tool.run_lens_onnx import ort_session, context, validate_outputs
    from tool.lens_onnx_contract import OUTPUTS, preprocess, publisher_summary
    from tool.calorie_lens_routes import decode_lens
    graph=Path(spec['graphFile']);verify_file(graph,spec['graphSha256'])
    verify_file(graph.parent/'model.onnx.data',spec['dataSha256'])
    cfg,sources=context(spec);session,load_ms=ort_session(graph,'disabled');out=Path(spec['outputDir'])
    write(out/'session.json',dict(sourceCommit=spec['sourceCommit'],loadMs=load_ms,
          versions=installed(spec['versions']),providers=session.get_providers(),optimization='disabled',
          totalGramsPassed=False,referencesPassed=False))
    for case in spec['cases']:
        validate_image_case(case);entered=False;started=time.monotonic()
        try:
            data=Path(case['inputFile']).read_bytes()
            if hashlib.sha256(data).hexdigest()!=case['inputSha256']:raise ValueError('Frozen image drift')
            x=preprocess(data,cfg['image_size']);forward=time.monotonic();entered=True
            values=session.run(list(OUTPUTS),{'image':x});validate_outputs(values)
            raw={k:v.tolist() for k,v in zip(OUTPUTS,values)};summary=publisher_summary(raw,cfg)
            decoded=decode_lens(summary,raw,cfg,sources)
            result=dict(id=case['id'],status='ok',runtime='qualified-ort-stable-sigmoid',
                        inputSha256=case['inputSha256'],inferenceEntered=entered,raw=raw,publisherSummary=summary,
                        inputTensor={'shape':list(x.shape),'dtype':str(x.dtype),'sha256':hashlib.sha256(x.tobytes()).hexdigest()},
                        forwardAndDecodeMs=(time.monotonic()-forward)*1000,imageWallMs=(time.monotonic()-started)*1000,**decoded)
        except Exception as error:
            write(out/(case['id']+'.json'),dict(id=case['id'],status='failed',inferenceEntered=entered,failure=type(error).__name__))
            raise  # Stop systemic failures. Preserve missing attempts; no retry.
        write(out/(case['id']+'.json'),result);print(json.dumps({'id':case['id'],'status':'ok'}),flush=True)


def run(repo,profile_path,manifest_path,assets,graph,output,tmp):
    from tool.run_lens_onnx import available_memory, require_start_memory
    git=lambda *args:subprocess.check_output(['git',*args],cwd=repo,text=True).strip()
    if git('status','--porcelain') or git('rev-parse','HEAD')!=git('rev-parse','@{upstream}'):
        raise ValueError('Commit and push clean source before inference')
    profile_path=profile_path.resolve()
    if not profile_path.is_relative_to(repo):raise ValueError('Committed profile required')
    git('ls-files','--error-unmatch','--',str(profile_path.relative_to(repo)))
    profile_bytes=profile_path.read_bytes()
    if subprocess.check_output(['git','show','HEAD:'+str(profile_path.relative_to(repo))],cwd=repo)!=profile_bytes:
        raise ValueError('Frozen profile drift')
    profile=json.loads(profile_bytes);require_transfer_rights(profile)
    for pin in profile['sourceFiles']:
        p=Path(pin['path'])
        if p.is_absolute() or '..' in p.parts:raise ValueError('Invalid source pin path')
        file=(repo/p).resolve()
        if not file.is_relative_to(repo):raise ValueError('Escaped source pin')
        git('ls-files','--error-unmatch','--',str(p));verify_file(file,pin['sha256'],pin['bytes'])
        if subprocess.check_output(['git','show','HEAD:'+str(p)],cwd=repo)!=file.read_bytes():
            raise ValueError('Git source pin drift')
    verify_file(manifest_path,profile['manifestSha256']);manifest=json.loads(manifest_path.read_text())
    if manifest.get('selectionSha256')!=profile.get('selectionSha256') or not isinstance(profile.get('selectionSha256'),str):
        raise ValueError('Frozen selection receipt mismatch')
    verify_file(manifest_path.parent/'selection.json',profile['selectionSha256'])
    cases=manifest['cases'];count=profile['sampleCount']
    if (manifest.get('schemaVersion')!=1 or manifest.get('datasetId')!='nutritionverse-real'
            or type(count) is not int or not 1<=count<=20 or manifest['sampleCount']!=count
            or len(cases)!=count or len({c['physicalMealId'] for c in cases})!=count
            or len({c['id'] for c in cases})!=count):raise ValueError('Frozen physical meal membership required')
    for c in cases:
        if c.get('inputStatus') not in ('ready','dataset_failure'):raise ValueError('Explicit input status required')
        if c.get('physicalMealId')!='nutritionverse-real/dish/'+c['id'].removeprefix('nv-dish-'):
            raise ValueError('Physical meal mismatch')
    projected=[validate_image_case(c) for c in image_inputs([c for c in cases if c['inputStatus']=='ready'],assets)]
    original=json.loads((repo/BASE/'lens-onnx-profile-v1.json').read_text())
    lowering=json.loads((repo/BASE/'lens-onnx-lowering-profile-v3.json').read_text())
    verify_file(repo/BASE/'lens-onnx-profile-v1.json',lowering['baseRuntimeProfileSha256'])
    for pin in original['sourceFiles']+lowering['sourceFiles']:verify_file(repo/pin['path'],pin['sha256'],pin['bytes'])
    if platform.python_version()!=original['python'] or installed(original['versions'])!=original['versions']:
        raise ValueError('Qualified pinned Python/runtime required')
    if profile['graphSha256']!=lowering['candidateGraphSha256']:raise ValueError('Qualified graph required')
    if profile['dataSha256']!='f660f737f7780254f8b553aba05ad1a2332f095ce0eb65556ce603440231c276':raise ValueError('Qualified weights required')
    verify_file(graph,profile['graphSha256']);verify_file(graph.parent/'model.onnx.data',profile['dataSha256'])
    require_start_memory(available_memory(),original['preflightMinAvailableBytes'])
    old=json.loads((repo/BASE/'calorie-lens-profile-v1.json').read_text());output.mkdir();tmp.mkdir(exist_ok=True)
    spec=dict(sourceCommit=git('rev-parse','HEAD'),cases=projected,graphFile=str(graph),
              graphSha256=profile['graphSha256'],dataSha256=profile['dataSha256'],
              configPath=str(repo/old['configPath']),nutrientMetadataPath=str(repo/old['nutrientMetadataPath']),
              nutrientMetadataSha256=old['nutrientMetadataSha256'],outputDir=str(output),versions=list(original['versions']))
    write(output/'worker-input.json',spec);os.environ['OMP_WAIT_POLICY']='PASSIVE'
    receipt=supervise([sys.executable,'-m','tool.run_transfer_lens','--worker',str(output/'worker-input.json')],
                       repo,output,projected,profile['limits'],tmp)
    write(output/'supervision.json',receipt);print(json.dumps(receipt))
    if receipt['workerExitCode']!=0 or receipt['resourceStop']:raise RuntimeError('Partial run; inspect private receipts, no retry')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--worker',type=Path)
    for key in ('repo','profile','private-manifest','assets','graph','output','tmp'):p.add_argument('--'+key,type=Path)
    a=p.parse_args()
    try:
        if a.worker:worker(json.loads(a.worker.read_text()))
        else:
            keys=('repo','profile','private_manifest','assets','graph','output','tmp')
            if any(getattr(a,key) is None for key in keys):p.error('Explicit paths required')
            run(*[getattr(a,key).resolve() for key in keys])
    except Exception as error:
        print(json.dumps({'status':'failed','category':type(error).__name__,'detail':'Inspect private receipts; no retry performed'}),file=sys.stderr)
        sys.exit(1)
