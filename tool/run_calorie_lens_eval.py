"""Run the frozen Calorie Lens / serving-route comparison on local CPU workers."""
import argparse, hashlib, importlib.metadata, importlib.util, json, os, platform, subprocess, sys, time
from pathlib import Path
from tool.calorie_lens_routes import density_records, decode_lens, summarize_routes

BASE=Path('functions/eval/tier1-public')
def sha(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def verify_file(path,expected_sha,expected_bytes=None):
 if sha(path)!=expected_sha or (expected_bytes is not None and path.stat().st_size!=expected_bytes):raise ValueError('Published file pin mismatch')
def write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 with path.open('x') as f:json.dump(value,f,indent=2,allow_nan=False);f.write('\n')
def installed(names):return {n:importlib.metadata.version(n) for n in names}
def lens_worker(spec_path):
 spec=json.loads(spec_path.read_text());out=Path(spec['outputDir'])
 import torch
 from safetensors.torch import load_model
 torch.set_num_threads(2);torch.set_num_interop_threads(1)
 start=time.monotonic();loader=importlib.util.spec_from_file_location('pinned_calorie_lens',spec['sourcePath']);module=importlib.util.module_from_spec(loader);sys.modules[loader.name]=module;loader.loader.exec_module(module)
 config=json.loads(Path(spec['configPath']).read_text());model=module.CalorieLens(**config);missing,unexpected=load_model(model,spec['modelFile'],strict=True,device='cpu')
 if missing or unexpected:raise ValueError('Strict checkpoint contract required')
 model.to('cpu').eval();predictor=object.__new__(module.Predictor);predictor.model=model;predictor.device=torch.device('cpu')
 sources=density_records(config,Path(spec['nutrientMetadataPath']).read_bytes(),spec['nutrientMetadataSha256'])
 write(out/'session.json',{'device':'cpu','loadMs':(time.monotonic()-start)*1000,'versions':installed(spec['versionNames']),'python':platform.python_version(),'threads':2,'interOpThreads':1,'strictStateLoad':True,'missingKeys':sorted(missing),'unexpectedKeys':sorted(unexpected),'ttaViews':model.tta_views,'measuredTotalGramsPassed':False,'nutrientRows':len(sources),'coreNutrientMatches':sum(s['coreNutrientsMatched'] for s in sources),'extendedUsdaVerified':False})
 for c in spec['cases']:
  if set(c)!={'id','inputFile','inputSha256'}:raise ValueError('Image-only worker specification required')
  start=time.monotonic();r={'id':c['id'],'model':'calorie-lens','status':'failed','failure':'inference_failure','inputSha256':c['inputSha256'],'artifactSha256':spec['artifactSha256'],'inferenceEntered':False,'massG':None,'totals':None,'raw':None}
  try:
   path=Path(c['inputFile'])
   if sha(path)!=c['inputSha256']:raise ValueError('Pinned image required')
   with torch.inference_mode():
    x=module.preprocess(path,model.image_size)[None].float()/255.0
    r['inputTensor']={'shape':list(x.shape),'dtype':str(x.numpy().dtype),'sha256':hashlib.sha256(x.numpy().tobytes()).hexdigest()};r['inferenceEntered']=True;forward=time.monotonic()
    output=model(x,total_grams=None,return_attn=False)
    raw={k:output[k].float().cpu().tolist() for k in ['grams','mass_gap','logits','log_grams','soft','log_totals','totals']}
    summary=predictor._summarise(output,12,None);prediction=decode_lens(summary,raw,config,sources)
   r.update(prediction,status='ok',failure=None,raw=raw,publisherSummary=summary,forwardAndDecodeMs=(time.monotonic()-forward)*1000)
  except Exception as error:
   r['failure']='invalid_model_or_input_output';r['errorType']=type(error).__name__ if type(error).__name__ in ['ValueError','RuntimeError','MemoryError','OSError','KeyError','TypeError'] else 'inference_error'
   if isinstance(error,MemoryError):write(out/(c['id']+'.json'),r);raise
  r['wallMs']=(time.monotonic()-start)*1000;write(out/(c['id']+'.json'),r);print(json.dumps({'id':c['id'],'status':r['status'],'massG':r['massG']}),flush=True)
  if c['id']=='__qualification__' and r['status']!='ok':raise ValueError('Qualification failed; no food calls permitted')
def supervise(command,cwd,output,cases,runtime,tmpdir):
 env=os.environ.copy();env.update(TMPDIR=str(tmpdir),OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1',HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TOKENIZERS_PARALLELISM='false',HF_HOME=str(tmpdir/'hf-cache'),PYTHONDONTWRITEBYTECODE='1')
 peak=0;stop=None;start=last=time.monotonic();seen=0
 with (output/'worker.log').open('w') as log:
  process=subprocess.Popen(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
  while process.poll() is None:
   try:rss=int(next(l.split()[1] for l in Path('/proc/'+str(process.pid)+'/status').read_text().splitlines() if l.startswith('VmRSS:')))*1024
   except (OSError,StopIteration):rss=0
   peak=max(peak,rss);count=sum((output/(c['id']+'.json')).exists() for c in cases)
   if count!=seen:seen=count;last=time.monotonic()
   if rss>runtime['rssLimitBytes']:stop='sampled_rss_limit'
   if time.monotonic()-last>runtime['noProgressTimeoutSeconds']:stop='no_progress_timeout'
   if time.monotonic()-start>runtime['perModelTimeoutSeconds']:stop='model_wall_limit'
   if stop:
    process.terminate()
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:process.kill();process.wait()
    break
   time.sleep(.2)
 return {'workerExitCode':process.returncode,'resourceStop':stop,'sampledPeakWorkerRssBytes':peak,'hostWallMs':(time.monotonic()-start)*1000}
def main(a):
 repo=a.repo.absolute();base=repo/BASE;profile_path=base/'calorie-lens-profile-v1.json';profile=json.loads(profile_path.read_text());manifest_path=base/'manifest-calorie-lens-v1.json';manifest=json.loads(manifest_path.read_text());cases=manifest['cases']
 if subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip():raise ValueError('Commit clean source before model code execution')
 if sha(manifest_path)!=profile['manifestSha256'] or len(cases)!=42 or len({c['id'] for c in cases})!=42 or {g:sum(c['group']==g for c in cases) for g in profile['groups']}!=profile['groups']:raise ValueError('Frozen42 manifest drift')
 if platform.python_version()!=profile['runtime']['python'] or installed(profile['runtime']['versions'])!=profile['runtime']['versions']:raise ValueError('Pinned Lens runtime required')
 ort_versions=json.loads(subprocess.check_output([str(a.onnx_python.absolute()),'-c','import importlib.metadata as m,json;print(json.dumps({n:m.version(n) for n in ["onnxruntime","numpy","Pillow"]}))'],text=True))
 if ort_versions!=profile['plateRuntime']:raise ValueError('Pinned Plate runtime required')
 for file in profile['sourceFiles']:
  p=repo/file['path']
  if sha(p)!=file['sha256'] or p.stat().st_size!=file['bytes']:raise ValueError('Pinned source/table/runtime lock drift')
 verify_file(base/profile['plate']['metadataPath'],profile['plate']['metadataSha256'])
 lens=a.models_root/profile['artifactName']
 if sha(lens)!=profile['artifactSha256'] or lens.stat().st_size!=profile['artifactBytes']:raise ValueError('Pinned safetensors required')
 if sha(a.plate_model)!=profile['plate']['artifactSha256'] or a.plate_model.stat().st_size!=profile['plate']['artifactBytes']:raise ValueError('Pinned ONNX required')
 for c in cases:
  p=(a.assets_root/c['inputPath']).absolute()
  if not p.resolve().is_relative_to(a.assets_root.resolve()) or sha(p)!=c['inputSha256']:raise ValueError('Pinned image/path required')
  if c.get('a1ReceiptPath') and sha(repo/c['a1ReceiptPath'])!=c['a1ReceiptSha256']:raise ValueError('A1 receipt drift')
 for p in profile['retainedPlateRecords']:
  if sha(repo/p['path'])!=p['sha256']:raise ValueError('Retained Plate record drift')
 blank=a.assets_root/'qualification.png'
 if sha(blank)!=profile['qualificationSha256']:raise ValueError('Pinned owned qualification image required')
 available=int(next(l.split()[1] for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))*1024
 if available<profile['runtime']['minAvailableBytes']:raise ValueError('Insufficient available memory for frozen resource preflight')
 if a.preflight_only:print(json.dumps({'cases':42,'newLocalFoodPredictions':62,'newVlmCalls':0,'referenceLabelsToWorkers':False,'versions':profile['runtime']['versions'],'availableMemoryBytes':available}));return
 a.output.mkdir();source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();allresults={};recordpins=[]
 for model in ['plate-vision','calorie-lens']:
  directory=a.output/model;directory.mkdir();subset=[c for c in cases if c['group']=='validation20'] if model=='plate-vision' else cases
  projected=[{'id':c['id'],'inputFile':str((a.assets_root/c['inputPath']).absolute()),'inputSha256':c['inputSha256']} for c in subset]
  if model=='plate-vision':
   spec={'model':profile['plate'],'modelFile':str(a.plate_model.absolute()),'metadata':json.loads((base/profile['plate']['metadataPath']).read_text()),'outputDir':str(directory.absolute()),'cases':projected}
   specfile=directory/'worker-input.json';write(specfile,spec);command=[str(a.onnx_python.absolute()),'-m','tool.run_open_model_eval','--worker',str(specfile.absolute())]
  else:
   spec={'sourcePath':str(repo/profile['modelSourcePath']),'configPath':str(repo/profile['configPath']),'nutrientMetadataPath':str(repo/profile['nutrientMetadataPath']),'nutrientMetadataSha256':profile['nutrientMetadataSha256'],'modelFile':str(lens.absolute()),'artifactSha256':profile['artifactSha256'],'versionNames':list(profile['runtime']['versions']),'outputDir':str(directory.absolute()),'cases':[{'id':'__qualification__','inputFile':str(blank.absolute()),'inputSha256':profile['qualificationSha256']}]+projected}
   specfile=directory/'worker-input.json';write(specfile,spec);command=[sys.executable,'-m','tool.run_calorie_lens_eval','--worker',str(specfile.absolute())]
  runtime=supervise(command,repo,directory,spec['cases'],profile['runtime'],a.tmpdir.absolute());predictions={}
  if model=='plate-vision':
   for pin in profile['retainedPlateRecords']:predictions[pin['id']]=json.loads((repo/pin['path']).read_text())
  for c in subset:
   f=directory/(c['id']+'.json');row=json.loads(f.read_text()) if f.exists() else {'id':c['id'],'model':model,'status':'unattempted','massG':None,'totals':None,'failure':runtime['resourceStop'] or 'worker_exit'};predictions[c['id']]=row
   if f.exists():recordpins.append({'model':model,'id':c['id'],'sha256':sha(f)})
  write(directory/'predictions.json',predictions);scored=summarize_routes(cases,predictions);allresults[model]={'metrics':scored,'runtime':runtime}
 result={'experiment':profile['experiment'],'sourceCommit':source,'manifestSha256':sha(manifest_path),'profileSha256':sha(profile_path),'models':allresults,'recordPins':recordpins,'newLocalFoodPredictions':sum(p['id']!='__qualification__' for p in recordpins),'plannedLocalFoodPredictions':62,'qualificationForwardCalls':1 if (a.output/'calorie-lens/__qualification__.json').exists() else 0,'newVlmCalls':0,'training':False,'productionPromotable':False}
 write(a.output/'result.json',result);print(json.dumps({k:{'validation':v['metrics']['validation20'],'screen':v['metrics']['screen'],'runtime':v['runtime']} for k,v in allresults.items()}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--worker',type=Path);p.add_argument('--repo',type=Path,default=Path.cwd())
 for name in ['assets-root','models-root','plate-model','onnx-python','tmpdir','output']:p.add_argument('--'+name,type=Path)
 p.add_argument('--preflight-only',action='store_true');a=p.parse_args()
 if a.worker:lens_worker(a.worker)
 else:
  if any(getattr(a,n) is None for n in ['assets_root','models_root','plate_model','onnx_python','tmpdir','output']):p.error('Explicit input/runtime/output paths required')
  main(a)
