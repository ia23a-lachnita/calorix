"""Frozen image-only inference and fixed-denominator exploratory evaluation."""
import argparse
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import time
from pathlib import Path

from tool.calorie_lens_routes import route_specialist, vector, decode_lens
from tool.food_agreement_routes import route_food_agreement
from tool.paired_view_metrics import _metrics
from tool.run_calorie_lens_eval import sha, verify_file, write, installed, supervise

BASE = Path('functions/eval/tier1-public')
PROFILE = BASE/'food-agreement-profile-v1.json'


def image_case(case):
    if (set(case)!={'id','inputFile','inputSha256'}
            or not re.fullmatch(r'dish_[0-9]{10}',case['id'])
            or not re.fullmatch(r'[a-f0-9]{64}',case['inputSha256'])
            or not Path(case['inputFile']).is_absolute()):
        raise ValueError('Only a pinned image and safe output ID are permitted')
    return case


def score_routes(cases, a1_records, lens_records):
    ids={c['id'] for c in cases}
    if len(ids)!=len(cases) or (set(a1_records)|set(lens_records))-ids:
        raise ValueError('Exact fixed unique membership required')
    routes={name:[] for name in ['A0','A1','Lens','old','agreement']};details=[]
    for c in cases:
        record=a1_records.get(c['id'],{})
        a=record.get('estimate') if record.get('A1',{}).get('status')=='ok' else None
        s=lens_records.get(c['id'],{})
        old=route_specialist(a,s);new=route_food_agreement(a,s)
        a0=record.get('A0',{})
        predictions={'A0':{'status':a0.get('status'),'massG':a0.get('massG'),'totals':a0.get('predicted')},
                     'A1':route_food_agreement(a,None),'Lens':s,'old':old,'agreement':new}
        points={}
        for name,p in predictions.items():
            try:
                if p.get('status')!='ok':raise ValueError('Failed prediction')
                v=vector(p);point=dict(v['totals'],massG=v['massG'])
            except (KeyError,ValueError,TypeError):point=None
            routes[name].append(dict(id=c['id'],reference=c['reference'],predicted=point));points[name]=point
        details.append(dict(id=c['id'],reference=c['reference'],predictions=points,
                            selectedSource=new['selectedSource'],reason=new['reason'],agreement=new['agreement']))
    metrics={name:{**_metrics(rs),'attempted':len(cases)} for name,rs in routes.items()}
    b=metrics['A1'];n=metrics['agreement'];valid=len(cases)==20 and b['scored']==20 and n['scored']==20
    guards={'all20Valid':valid,'maeAtLeast10PercentBetter':valid and n['served']['mae_kcal']<=.9*b['served']['mae_kcal']}
    for field in ('median_absolute_error_kcal','p90_absolute_error_kcal','mean_normalized_absolute_error'):
        guards[field+'NotWorse']=valid and n['served'][field]<=b['served'][field]
    return dict(routes=metrics,cases=details,screen={'guards':guards,'passesAll':all(guards.values()),
                'ecustRegressionStillRequired':True},productionPromotable=False,
                uncertainty='Small public, author-group-disjoint screen; checkpoint lineage not independently verified')


def worker(spec):
    # This spec is built by the parent after all source/runtime/input checks.
    from tool.run_lens_onnx import ort_session, context, validate_outputs
    from tool.lens_onnx_contract import OUTPUTS, preprocess, publisher_summary
    graph=Path(spec['graphFile']);verify_file(graph,spec['graphSha256'])
    verify_file(graph.parent/'model.onnx.data',spec['dataSha256'])
    cfg,sources=context(spec);session,load_ms=ort_session(graph,'disabled')
    out=Path(spec['outputDir'])
    write(out/'session.json',{'loadMs':load_ms,'versions':installed(spec['versions']),
                            'optimization':'disabled','providers':session.get_providers(),
                            'totalGramsPassed':False,'referencesPassed':False,'sourceCommit':spec['sourceCommit']})
    for case in spec['cases']:
        image_case(case);started=time.monotonic();path=Path(case['inputFile']);verify_file(path,case['inputSha256'])
        x=preprocess(path.read_bytes(),cfg['image_size']);forward=time.monotonic()
        try:
            values=session.run(list(OUTPUTS),{'image':x});validate_outputs(values)
            raw={k:v.tolist() for k,v in zip(OUTPUTS,values)};summary=publisher_summary(raw,cfg)
            result=decode_lens(summary,raw,cfg,sources)
            row=dict(id=case['id'],status='ok',runtime='qualified-ort-stable-sigmoid',raw=raw,
                     publisherSummary=summary,inputSha256=case['inputSha256'],
                     inputTensor={'shape':list(x.shape),'dtype':str(x.dtype),'sha256':hashlib.sha256(x.tobytes()).hexdigest()},
                     forwardAndDecodeMs=(time.monotonic()-forward)*1000,imageWallMs=(time.monotonic()-started)*1000,**result)
        except Exception as error:
            write(out/(case['id']+'.json'),dict(id=case['id'],status='failed',failure=type(error).__name__))
            raise  # Preserve partial records; no repeat or systemic-failure loop.
        write(out/(case['id']+'.json'),row);print(json.dumps({'id':case['id'],'status':'ok'}),flush=True)


def run(repo,assets,graph,output,tmp):
    from tool.run_lens_onnx import require_start_memory, available_memory
    if subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip():
        raise ValueError('Commit clean source before inference')
    head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
    upstream=subprocess.check_output(['git','rev-parse','@{upstream}'],cwd=repo,text=True).strip()
    if head!=upstream:raise ValueError('Push exact source before inference')
    profile=json.loads((repo/PROFILE).read_text())
    for pin in profile['sourceFiles']:verify_file(repo/pin['path'],pin['sha256'],pin['bytes'])
    original=json.loads((repo/BASE/'lens-onnx-profile-v1.json').read_text())
    lowering=json.loads((repo/BASE/'lens-onnx-lowering-profile-v3.json').read_text())
    if sha(repo/BASE/'lens-onnx-profile-v1.json')!=lowering['baseRuntimeProfileSha256']:
        raise ValueError('Retained runtime profile drift')
    for pin in original['sourceFiles']+lowering['sourceFiles']:
        verify_file(repo/pin['path'],pin['sha256'],pin['bytes'])
    if platform.python_version()!=original['python'] or installed(original['versions'])!=original['versions']:
        raise ValueError('Qualified pinned runtime required')
    verify_file(graph,profile['graphSha256']);verify_file(graph.parent/'model.onnx.data',profile['dataSha256'])
    manifest=json.loads((repo/BASE/'manifest-food-agreement-v1.json').read_text())
    if len(manifest['cases'])!=20 or len({c['id'] for c in manifest['cases']})!=20:
        raise ValueError('Frozen20 required')
    cases=[]
    for c in manifest['cases']:
        if c['inputStatus']!='ready':continue
        path=(assets/c['inputPath']).resolve()
        if not path.is_relative_to(assets.resolve()):raise ValueError('Image outside assets')
        verify_file(path,c['inputSha256'])
        cases.append(image_case(dict(id=c['id'],inputFile=str(path),inputSha256=c['inputSha256'])))
    old=json.loads((repo/BASE/'calorie-lens-profile-v1.json').read_text())
    require_start_memory(available_memory(),original['preflightMinAvailableBytes'])
    output.mkdir();tmp.mkdir(exist_ok=True)
    spec=dict(cases=cases,graphFile=str(graph),graphSha256=profile['graphSha256'],dataSha256=profile['dataSha256'],
              configPath=str(repo/old['configPath']),nutrientMetadataPath=str(repo/old['nutrientMetadataPath']),
              nutrientMetadataSha256=old['nutrientMetadataSha256'],outputDir=str(output),versions=list(original['versions']),
              sourceCommit=head)
    write(output/'worker-input.json',spec)
    os.environ['OMP_WAIT_POLICY']='PASSIVE'
    receipt=supervise([sys.executable,'-m','tool.run_food_agreement_eval','--worker',str(output/'worker-input.json')],
                       repo,output,cases,profile['limits'],tmp)
    write(output/'supervision.json',receipt)
    print(json.dumps(receipt))
    if receipt['workerExitCode']!=0 or receipt['resourceStop']:raise RuntimeError('Partial inference; inspect receipts, no retry')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--worker',type=Path)
    for key in ('repo','assets','graph','output','tmp'):p.add_argument('--'+key,type=Path)
    p.add_argument('--score',action='store_true')
    for key in ('manifest','a1','lens','summary'):p.add_argument('--'+key,type=Path)
    a=p.parse_args()
    if a.worker:worker(json.loads(a.worker.read_text()))
    elif a.score:
        if any(getattr(a,key) is None for key in ('manifest','a1','lens','summary')):p.error('Explicit score paths required')
        m=json.loads(a.manifest.read_text())
        records=lambda root:{f.stem:json.loads(f.read_text()) for f in root.glob('dish_*.json')}
        write(a.summary,score_routes(m['cases'],records(a.a1),records(a.lens)))
    else:
        if any(getattr(a,key) is None for key in ('repo','assets','graph','output','tmp')):p.error('Explicit paths required')
        run(*[getattr(a,key).resolve() for key in ('repo','assets','graph','output','tmp')])
