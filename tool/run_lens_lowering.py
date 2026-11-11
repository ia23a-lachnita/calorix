"""Single versioned stable-Sigmoid candidate; preserve all original failed experiments."""
import argparse,json,os,platform,signal,subprocess,sys,time
from pathlib import Path
from tool.lens_sigmoid_lowering import lower_once,cohort_budget_ms
from tool.run_lens_onnx import available_memory,require_start_memory,tree_rss,resource_stop,successful_attempt,load_torch,ort_session,context,prediction,make_spec,preflight as base_preflight,safe_external_path
from tool.run_calorie_lens_eval import BASE,sha,verify_file,write,installed
PROFILE=BASE/'lens-onnx-lowering-profile-v3.json'
VERDICTS={'originalRawV1':'FAILED','originalEndpointV2':'FAILED','raw_speed_qualified':False,'candidate':'v3-stable-sigmoid'}
def supervise(repo,root,spec,kind,limits):
 require_start_memory(available_memory(),spec['preflightMinAvailableBytes']);out=Path(spec['outputDir']);path=out/'worker-input.json';write(path,spec);start=last=time.monotonic();peak=0;stop=None;seen=None
 env=os.environ.copy();env.update(TMPDIR=str(root/'tmp'),OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1',OMP_WAIT_POLICY='PASSIVE',HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',HF_HOME=str(root/'tmp/hf-cache'),TOKENIZERS_PARALLELISM='false',PYTHONDONTWRITEBYTECODE='1')
 with (out/'worker.txt').open('x') as log:
  process=subprocess.Popen([sys.executable,'-m','tool.run_lens_lowering','--worker',kind,'--spec',str(path)],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  while process.poll() is None:
   rss=tree_rss(process.pid);peak=max(peak,rss);progress=tuple(sorted(p.name for p in out.glob('*.json') if p.name!='worker-input.json'))
   if progress!=seen:seen=progress;last=time.monotonic()
   directory=Path(spec['candidateDir']);size=sum(p.stat().st_size for p in directory.rglob('*') if p.is_file()) if directory.exists() else 0;stop=resource_stop(rss,available_memory(),time.monotonic()-start,time.monotonic()-last,size,limits)
   if stop:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
    break
   time.sleep(.25)
 receipt={**VERDICTS,'workerExitCode':process.returncode,'resourceStop':stop,'sampledPeakProcessTreeRssBytes':peak,'hostWallMs':(time.monotonic()-start)*1000};write(out/'supervision.json',receipt);return receipt

def qualified(row):return row['parity']['passes'] and row['compatibility']['endpointV2']['passes'] and row['imageWallMs']<=128000

def qualification_worker(spec):
 if 'cases' in spec or 'controls' in spec:raise ValueError('Blank only before candidate acceptance')
 out=Path(spec['outputDir']);graph,structure=lower_once(Path(spec['parentGraph']),Path(spec['candidateDir']),spec['parentGraphFiles']);write(out/'graph.json',structure);cfg,sources=context(spec);session,load_ms=ort_session(graph,'disabled');write(out/'session.json',{**VERDICTS,'ortLoadMs':load_ms,'optimization':'disabled','providers':session.get_providers()});row=prediction(spec['qualification'],cfg,sources,session=session);row.update(VERDICTS);write(out/'qualification.json',row);budget=cohort_budget_ms(row['imageWallMs'],spec['retainedTorchBlankMs']);write(out/'budget.json',{'projectedMs':budget,'limitMs':3600000,'factor':1.2,'retainedTorchBlankMs':spec['retainedTorchBlankMs'],'actualWorkerStillBounded':True})
 if not qualified(row) or budget>3600000:raise ValueError('Single candidate failed strict blank or projected cohort budget; no retries/food permitted')
 write(out/'accepted.json',{**VERDICTS,'strictRawParity':row['parity'],'endpointCompatibility':row['compatibility']['endpointV2'],'graph':structure,'qualificationMs':row['imageWallMs'],'projectedCohortMs':budget})

def benchmark_worker(spec):
 out=Path(spec['outputDir']);torch,module,model,torch_load=load_torch(spec);cfg,sources=context(spec);session,ort_load=ort_session(Path(spec['graphFile']),'disabled');write(out/'session.json',{**VERDICTS,'python':platform.python_version(),'versions':installed(spec['versions']),'torchLoadMs':torch_load,'ortLoadMs':ort_load,'torchIntra':torch.get_num_threads(),'torchInter':torch.get_num_interop_threads(),'ortIntra':2,'ortInter':1,'optimization':'disabled','providers':session.get_providers(),'combinedProcess':True,'strictStateLoad':True,'ttaViews':model.tta_views,'totalGramsPassed':False})
 for engine in ['torch','ort']:
  row=prediction(spec['qualification'],cfg,sources,session=session if engine=='ort' else None,torch_model=(torch,model) if engine=='torch' else None);row.update(VERDICTS);write(out/('qualification-'+engine+'.json'),row)
  if not qualified(row):raise ValueError('Strict warmup qualification failed; no food permitted')
 controls={c['id']:c['order'] for c in spec['controls']}
 for case in spec['cases']:
  for engine in controls.get(case['id'],['ort']):
   row=prediction(case,cfg,sources,session=session if engine=='ort' else None,torch_model=(torch,model) if engine=='torch' else None);row.update(VERDICTS);write(out/(case['id']+'-'+engine+'.json'),row);print(json.dumps({**VERDICTS,'id':case['id'],'runtime':engine,'strictRaw':row['parity']['passes'],'endpointCompatibility':row['compatibility']['endpointV2']['passes'],'wallMs':row['imageWallMs']}),flush=True)
  if case['id'] in controls:time.sleep(10)

def main(a):
 repo=a.repo.absolute();root=a.root.absolute();previous=a.previous.absolute();parent=a.parent_execution.absolute();base=base_preflight(repo,root,previous);p=json.loads((repo/PROFILE).read_text())
 if sha(repo/BASE/'lens-onnx-profile-v1.json')!=p['baseRuntimeProfileSha256']:raise ValueError('Original runtime profile changed')
 for f in p['sourceFiles']:verify_file(repo/f['path'],f['sha256'],f['bytes'])
 for f in p['parentGraphFiles']:verify_file(safe_external_path(parent/'export-dynamo',f['name']),f['sha256'],f['bytes'])
 if a.mode=='preflight':print(json.dumps({**VERDICTS,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'cases':42,'controls':6,'availableBytes':available_memory()}));return
 out=root/('qualification' if a.mode=='qualify' else 'benchmark');out.mkdir();spec=make_spec(repo,previous,base,out);spec.update(candidateDir=str(root/'model'),parentGraph=str(parent/'export-dynamo/model.onnx'),parentGraphFiles=p['parentGraphFiles'],retainedTorchBlankMs=p['retainedTorchBlankMs'])
 if a.mode=='qualify':
  spec.pop('cases');spec.pop('controls');receipt=supervise(repo,root,spec,'qualification',p['qualificationLimits'])
  if not successful_attempt(receipt,(out/'accepted.json').exists()):raise RuntimeError('Candidate rejected; retain evidence and stop, no retry')
  write(root/'selected.json',{**VERDICTS,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'profileSha256':sha(repo/PROFILE),'receipt':json.loads((out/'accepted.json').read_text())});return
 selected=json.loads((root/'selected.json').read_text())
 if selected['candidate']!=VERDICTS['candidate'] or selected['profileSha256']!=sha(repo/PROFILE) or not selected['receipt']['strictRawParity']['passes'] or not selected['receipt']['endpointCompatibility']['passes']:raise ValueError('Pinned accepted strict candidate required')
 for f in selected['receipt']['graph']['files']:verify_file(safe_external_path(root/'model',f['name']),f['sha256'],f['bytes'])
 spec['graphFile']=str(root/'model/model.onnx');receipt=supervise(repo,root,spec,'benchmark',p['benchmarkLimits'])
 if not successful_attempt(receipt,True):raise RuntimeError('Candidate cohort incomplete; fixed denominators and failures retained')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--worker',choices=['qualification','benchmark']);p.add_argument('--spec',type=Path);p.add_argument('--repo',type=Path,default=Path.cwd());p.add_argument('--root',type=Path);p.add_argument('--previous',type=Path);p.add_argument('--parent-execution',type=Path);p.add_argument('--mode',choices=['preflight','qualify','benchmark'],default='preflight');a=p.parse_args()
 if a.worker:{'qualification':qualification_worker,'benchmark':benchmark_worker}[a.worker](json.loads(a.spec.read_text()))
 else:
  if not a.root or not a.previous or not a.parent_execution:p.error('Explicit task root, retained baseline, and parent execution paths required')
  main(a)
