"""Bounded CPU-only evaluation of already-published ONNX weights. No remote inference."""
import argparse,hashlib,importlib.metadata,json,os,subprocess,sys,time
from pathlib import Path
from tool.open_model_adapters import preprocess,decode_plate,decode_dish,fuse_mass,score_open_models

BASE=Path('functions/eval/tier1-public')
def digest(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 with path.open('x') as f:json.dump(value,f,indent=2,allow_nan=False);f.write('\n')
def versions():return {n:importlib.metadata.version(n) for n in ['onnxruntime','numpy','Pillow']}
def worker(spec_file):
 import onnxruntime as ort
 ort.disable_telemetry_events()
 spec=json.loads(spec_file.read_text());meta=spec['metadata'];model=spec['model'];out=Path(spec['outputDir']);options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1;options.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
 started=time.monotonic();session=ort.InferenceSession(spec['modelFile'],sess_options=options,providers=['CPUExecutionProvider']);inputmeta=session.get_inputs();outputs={o.name for o in session.get_outputs()}
 if len(inputmeta)!=1 or inputmeta[0].name!='image' or inputmeta[0].type!=('tensor(uint8)' if model['id']=='plate-vision' else 'tensor(float)') or outputs!=({'logits','nutrition_quantiles'} if model['id']=='plate-vision' else {'classification','mass'}):raise ValueError('Published ONNX contract mismatch')
 write(out/'session.json',{'providers':session.get_providers(),'loadMs':(time.monotonic()-started)*1000,'inputs':[{'name':i.name,'type':i.type,'shape':i.shape} for i in inputmeta],'outputs':sorted(outputs),'versions':versions(),'intraOpThreads':2,'interOpThreads':1,'execution':'ORT_SEQUENTIAL'})
 for c in spec['cases']:
  if set(c)!={'id','inputFile','inputSha256'}:raise ValueError('Only image cases permitted in inference worker')
  begin=time.monotonic();record={'id':c['id'],'model':model['id'],'inputSha256':c['inputSha256'],'artifactSha256':model['artifactSha256'],'status':'failed','massG':None,'totals':None,'failure':'inference_failure','raw':None,'inferenceEntered':False,'directNutrientSourceKind':'unverified_published_model_estimate'}
  try:
   path=Path(c['inputFile'])
   if digest(path)!=c['inputSha256']:raise ValueError('Image hash mismatch')
   x=preprocess(model['id'],path.read_bytes(),meta);record['inputTensor']={'dtype':str(x.dtype),'shape':list(x.shape),'sha256':hashlib.sha256(x.tobytes()).hexdigest()};forward=time.monotonic();record['inferenceEntered']=True
   if model['id']=='plate-vision':
    raw=session.run(['nutrition_quantiles'],{'image':x})[0];record['raw']={'nutrition_quantiles':raw.tolist()};prediction=decode_plate(raw,meta)
   else:
    logits,mass=session.run(['classification','mass'],{'image':x});record['raw']={'classification':logits.tolist(),'mass':mass.tolist()};prediction=decode_dish(logits,mass,meta)
   record.update(prediction,status='ok',failure=None,forwardAndDecodeMs=(time.monotonic()-forward)*1000)
  except Exception as error:
   record['failure']='invalid_model_or_input_output';record['raw']=None;record['errorType']=type(error).__name__ if type(error).__name__ in ['ValueError','RuntimeError','OverflowError','InvalidArgument','RuntimeException','Fail','OSError','MemoryError'] else 'inference_error'
   if isinstance(error,MemoryError):write(out/(c['id']+'.json'),record);raise
  record['wallMs']=(time.monotonic()-begin)*1000;write(out/(c['id']+'.json'),record);print(json.dumps({'id':c['id'],'model':model['id'],'status':record['status'],'massG':record['massG']}),flush=True)

def main(a):
 repo=a.repo.resolve();base=repo/BASE;manifest_path=base/'manifest-open-models-v1.json';profile_path=base/'open-model-profile-v1.json';profile=json.loads(profile_path.read_text());manifest=json.loads(manifest_path.read_text())
 if subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip():raise ValueError('Commit clean source before model inference')
 if digest(manifest_path)!=profile['manifestSha256'] or len(manifest['cases'])!=22 or len({c['id'] for c in manifest['cases']})!=22:raise ValueError('Frozen22 case manifest required')
 actual=versions()
 if any(actual[k]!=profile['runtime'][k] for k in actual):raise ValueError('Runtime version drift')
 for c in manifest['cases']:
  p=(a.assets_root/c['inputPath']).resolve()
  if not p.is_relative_to(a.assets_root.resolve()) or digest(p)!=c['inputSha256']:raise ValueError('Frozen asset hash/path drift')
  if c.get('a1ReceiptPath') and digest(repo/c['a1ReceiptPath'])!=c['a1ReceiptSha256']:raise ValueError('Retained A1 baseline drift')
 for m in profile['models']:
  p=a.models_root/m['artifactName'];meta=base/m['metadataPath']
  if p.stat().st_size!=m['artifactBytes'] or digest(p)!=m['artifactSha256'] or digest(meta)!=m['metadataSha256']:raise ValueError('Published model/metadata drift')
 if a.preflight_only:print(json.dumps({'cases':22,'models':2,'versions':actual,'newVlmSdkInvocations':0,'referenceLabelsToModels':False}));return
 a.output.mkdir();source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();results={};record_pins=[]
 for m in profile['models']:
  model_dir=a.output/m['id'];model_dir.mkdir();spec={'model':m,'modelFile':str((a.models_root/m['artifactName']).resolve()),'metadata':json.loads((base/m['metadataPath']).read_text()),'outputDir':str(model_dir.resolve()),'cases':[{'id':c['id'],'inputFile':str((a.assets_root/c['inputPath']).resolve()),'inputSha256':c['inputSha256']} for c in manifest['cases']]};spec_path=model_dir/'worker-input.json';write(spec_path,spec)
  env=os.environ.copy();env.update(OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1',TMPDIR=str(a.tmpdir.resolve()));start=time.monotonic();peak=0;stop=None;last=time.monotonic();seen=0
  with (model_dir/'worker.log').open('w') as log:
   proc=subprocess.Popen([sys.executable,'-m','tool.run_open_model_eval','--worker',str(spec_path.resolve())],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT)
   while proc.poll() is None:
    try:rss=int(next(s.split()[1] for s in Path('/proc/'+str(proc.pid)+'/status').read_text().splitlines() if s.startswith('VmRSS:')))*1024
    except (OSError,StopIteration):rss=0
    peak=max(peak,rss);count=sum((model_dir/(c['id']+'.json')).exists() for c in manifest['cases'])
    if count!=seen:seen=count;last=time.monotonic()
    if rss>profile['runtime']['rssLimitBytes']:stop='rss_limit'
    if time.monotonic()-last>120:stop='no_progress_timeout'
    if time.monotonic()-start>600:stop='model_wall_limit'
    if stop:
     proc.terminate()
     try:proc.wait(timeout=5)
     except subprocess.TimeoutExpired:proc.kill();proc.wait()
     break
    time.sleep(.2)
  predictions={}
  for c in manifest['cases']:
   file=model_dir/(c['id']+'.json')
   row=json.loads(file.read_text()) if file.exists() else {'id':c['id'],'status':'unattempted','failure':stop or 'worker_exit','massG':None,'totals':None}
   if row['status']=='ok' and c.get('a1Estimate'):
    try:row['fusion']=fuse_mass(c['a1Estimate'],row['massG'],{'id':m['id'],'artifactSha256':m['artifactSha256']})
    except ValueError:row['fusion']=None;row['fusionFailure']='invalid_original_a1_estimate'
   predictions[c['id']]=row
   if file.exists():record_pins.append({'model':m['id'],'id':c['id'],'sha256':digest(file)})
  write(model_dir/'predictions.json',predictions);score=score_open_models(manifest['cases'],predictions);score.update(upstreamCommit=m['upstreamCommit'],artifactSha256=m['artifactSha256'],trainingExposure=m['trainingExposure'],heldoutComparisonEligible=m['heldoutComparisonEligible'],weightUse=m['weightUse'],sampledPeakWorkerRssBytes=peak,workerExitCode=proc.returncode,resourceStop=stop,hostWallMs=(time.monotonic()-start)*1000);results[m['id']]=score
 write(a.output/'result.json',{'schemaVersion':'open-model-result-1','sourceCommit':source,'manifestSha256':digest(manifest_path),'profileSha256':digest(profile_path),'versions':actual,'models':results,'recordPins':record_pins,'newVlmSdkInvocations':0,'newTraining':False,'productionPromotable':False});print(json.dumps({'source':source,'models':{i:{'n5Direct':v['nutrition5k']['direct']['served'],'n5Fusion':v['nutrition5k']['fusion']['served'],'ecustMass':v['ecust']['mass']} for i,v in results.items()}}))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--worker',type=Path);p.add_argument('--repo',type=Path,default=Path.cwd());p.add_argument('--assets-root',type=Path);p.add_argument('--models-root',type=Path);p.add_argument('--tmpdir',type=Path);p.add_argument('--output',type=Path);p.add_argument('--preflight-only',action='store_true');a=p.parse_args()
 if a.worker:worker(a.worker)
 else:
  if any(getattr(a,k) is None for k in ['assets_root','models_root','tmpdir','output']):p.error('Explicit assets/models/tmp/output paths required')
  main(a)
