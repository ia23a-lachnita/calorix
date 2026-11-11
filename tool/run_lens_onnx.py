"""Bounded same-checkpoint export and matched CPU measurement; no app deployment."""
import argparse, hashlib, importlib.util, json, os, platform, signal, subprocess, sys, time
from pathlib import Path
import numpy as np
from tool.lens_onnx_contract import OUTPUTS, preprocess, publisher_summary, parity_report
from tool.calorie_lens_routes import density_records, decode_lens
from tool.run_calorie_lens_eval import BASE, installed, sha, verify_file, write

PROFILE=BASE/'lens-onnx-profile-v1.json'
SHAPES=((1,253),(1,253),(1,253),(1,5),(1,253),(1,),(1,8))
def successful_attempt(supervision,receipt_exists):
 return supervision['workerExitCode']==0 and supervision['resourceStop'] is None and receipt_exists
def safe_external_path(root,name):
 if not name or '\\' in name or Path(name).is_absolute() or '..' in Path(name).parts:raise ValueError('Unsafe graph external data location')
 result=root/name
 if not result.resolve().is_relative_to(root.resolve()):raise ValueError('External data escapes attempt')
 return result
def validate_outputs(values):
 if len(values)!=7:raise ValueError('Seven outputs required')
 for value,shape in zip(values,SHAPES):
  if value.shape!=shape or value.dtype!=np.float32 or not np.isfinite(value).all():raise ValueError('Fixed finite float32 output required')
def resource_stop(rss,available,wall,idle,size,limits):
 for hit,reason in [(rss>limits['rssBytes'],'sampled_rss'),(available<limits['minAvailableBytes'],'available_memory'),(wall>limits['wallSeconds'],'wall_timeout'),(idle>limits['idleSeconds'],'idle_timeout'),(size>limits['artifactBytes'],'artifact_limit')]:
  if hit:return reason
 return None
def available_memory():return int(next(l.split()[1] for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))*1024
def require_start_memory(available,minimum):
 if available<minimum:raise ValueError('Insufficient available memory before worker start')
def telemetry():
 result={}
 for name,path in [('thermalMilliC','/sys/class/thermal/thermal_zone0/temp'),('cpu0KHz','/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq')]:
  try:result[name]=int(Path(path).read_text())
  except (ValueError,OSError):result[name]=None
 return result
def tree_rss(pid):
 parents={};sizes={}
 for path in Path('/proc').glob('[0-9]*/status'):
  try:
   lines=dict(line.split(':',1) for line in path.read_text().splitlines() if ':' in line);n=int(path.parent.name);parents[n]=int(lines['PPid']);sizes[n]=int(lines.get('VmRSS','0').split()[0])*1024
  except (OSError,ValueError,KeyError):continue
 owned={pid}
 while True:
  added={n for n,p in parents.items() if p in owned}-owned
  if not added:break
  owned|=added
 return sum(sizes.get(n,0) for n in owned)
def supervise(repo,root,spec,kind,limits):
 require_start_memory(available_memory(),spec['preflightMinAvailableBytes'])
 start=last=time.monotonic();peak=0;stop=None;seen=None
 env=os.environ.copy();env.update(TMPDIR=str(root/'tmp'),OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1',OMP_WAIT_POLICY='PASSIVE',HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',HF_HOME=str(root/'tmp/hf-cache'),TOKENIZERS_PARALLELISM='false',PYTHONDONTWRITEBYTECODE='1')
 out=Path(spec['outputDir']);specpath=out/'worker-input.json';write(specpath,spec)
 with (out/'worker.txt').open('x') as log:
  process=subprocess.Popen([sys.executable,'-m','tool.run_lens_onnx','--worker',kind,'--spec',str(specpath)],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  while process.poll() is None:
   rss=tree_rss(process.pid);peak=max(peak,rss)
   progress=tuple(sorted(p.name for p in out.glob('*.json') if p.name!='worker-input.json'))
   if progress!=seen:seen=progress;last=time.monotonic()
   size=sum(p.stat().st_size for p in out.rglob('*') if p.is_file() and (p.name.endswith('.onnx') or p.name.endswith('.data')))
   stop=resource_stop(rss,available_memory(),time.monotonic()-start,time.monotonic()-last,size,limits)
   if stop:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
    break
   time.sleep(.25)
 result={'workerExitCode':process.returncode,'resourceStop':stop,'sampledPeakProcessTreeRssBytes':peak,'hostWallMs':(time.monotonic()-start)*1000}
 write(out/'supervision.json',result);return result
def load_torch(spec):
 import torch
 from safetensors.torch import load_model
 torch.set_num_threads(2);torch.set_num_interop_threads(1)
 start=time.monotonic();loader=importlib.util.spec_from_file_location('pinned_lens',spec['sourcePath']);module=importlib.util.module_from_spec(loader);sys.modules[loader.name]=module;loader.loader.exec_module(module)
 cfg=json.loads(Path(spec['configPath']).read_text());model=module.CalorieLens(**cfg)
 missing,unexpected=load_model(model,spec['modelFile'],strict=True,device='cpu')
 if missing or unexpected:raise ValueError('Strict state load required')
 model.eval();return torch,module,model,(time.monotonic()-start)*1000
def ort_session(graph):
 import onnxruntime as ort
 start=time.monotonic();options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1;options.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL;options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL
 options.add_session_config_entry('session.intra_op.allow_spinning','0');options.add_session_config_entry('session.inter_op.allow_spinning','0')
 session=ort.InferenceSession(str(graph),sess_options=options,providers=['CPUExecutionProvider'])
 if session.get_providers()!=['CPUExecutionProvider']:raise ValueError('CPU-only provider required')
 inputs=session.get_inputs();outputs=session.get_outputs()
 if len(inputs)!=1 or inputs[0].name!='image' or inputs[0].shape!=[1,3,378,504] or inputs[0].type!='tensor(float)':raise ValueError('Fixed input contract required')
 if [o.name for o in outputs]!=list(OUTPUTS) or any(o.type!='tensor(float)' for o in outputs):raise ValueError('Named float output contract required')
 return session,(time.monotonic()-start)*1000
def context(spec):
 cfg=json.loads(Path(spec['configPath']).read_text());sources=density_records(cfg,Path(spec['nutrientMetadataPath']).read_bytes(),spec['nutrientMetadataSha256']);return cfg,sources
def prediction(case,cfg,sources,session=None,torch_model=None):
 if set(case)!={'id','inputFile','inputSha256','expectedFile','expectedSha256'}:raise ValueError('Image and saved model output only; no references permitted')
 verify_file(Path(case['inputFile']),case['inputSha256']);verify_file(Path(case['expectedFile']),case['expectedSha256'])
 start=time.monotonic();before=telemetry();x=preprocess(Path(case['inputFile']).read_bytes(),cfg['image_size']);tensor={'shape':list(x.shape),'dtype':str(x.dtype),'sha256':hashlib.sha256(x.tobytes()).hexdigest()};forward=time.monotonic()
 if session is not None:values=session.run(list(OUTPUTS),{'image':x})
 else:
  torch,model=torch_model
  with torch.inference_mode():output=model(torch.from_numpy(x),total_grams=None,return_attn=False)
  values=[output[k].float().cpu().numpy() for k in OUTPUTS]
 validate_outputs(values);raw={k:v.tolist() for k,v in zip(OUTPUTS,values)};summary=publisher_summary(raw,cfg);decoded=decode_lens(summary,raw,cfg,sources)
 row={'id':case['id'],'runtime':'ort' if session is not None else 'torch','status':'ok','raw':raw,'publisherSummary':summary,'inputTensor':tensor,**decoded,'forwardAndDecodeMs':(time.monotonic()-forward)*1000,'imageWallMs':(time.monotonic()-start)*1000,'before':before,'after':telemetry(),'inputSha256':case['inputSha256'],'expectedSha256':case['expectedSha256']}
 row['parity']=parity_report(json.loads(Path(case['expectedFile']).read_text()),row);return row
def inspect_graph(path):
 import onnx
 from onnx.external_data_helper import _get_all_tensors
 model=onnx.load(str(path),load_external_data=False);paths={path}
 if [(x.domain,x.version) for x in model.opset_import if x.domain in ('','ai.onnx')]!=[('',18)]:raise ValueError('Expected standard opset18')
 if [x.name for x in model.graph.output]!=list(OUTPUTS):raise ValueError('Output name drift')
 for tensor in _get_all_tensors(model):
  if tensor.data_location==onnx.TensorProto.EXTERNAL:
   fields={x.key:x.value for x in tensor.external_data};paths.add(safe_external_path(path.parent,fields.get('location','')))
 onnx.checker.check_model(str(path),full_check=True)
 return {'irVersion':model.ir_version,'opsets':{x.domain:x.version for x in model.opset_import},'files':[{'name':str(p.relative_to(path.parent)),'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(paths)]}
def export_worker(spec):
 torch,module,model,load_ms=load_torch(spec);out=Path(spec['outputDir']);cfg,sources=context(spec)
 write(out/'loaded.json',{'strictStateLoad':True,'loadMs':load_ms,'ttaViews':model.tta_views,'totalGramsPassed':False})
 class Wrapper(torch.nn.Module):
  def __init__(self,inner):super().__init__();self.inner=inner
  def forward(self,image):
   result=self.inner(image,total_grams=None,return_attn=False);return tuple(result[k] for k in OUTPUTS)
 wrapper=Wrapper(model).eval();x=torch.from_numpy(preprocess(Path(spec['qualification']['inputFile']).read_bytes(),cfg['image_size']));graph=out/'model.onnx';start=time.monotonic()
 with torch.inference_mode():torch.onnx.export(wrapper,(x,),str(graph),input_names=['image'],output_names=list(OUTPUTS),opset_version=18,dynamo=spec['route']=='dynamo',external_data=True,optimize=True,verify=False)
 write(out/'exported.json',{'route':spec['route'],'exportMs':(time.monotonic()-start)*1000})
 structure=inspect_graph(graph);write(out/'graph.json',structure)
 session,load_ms=ort_session(graph);row=prediction(spec['qualification'],cfg,sources,session=session);write(out/'qualification.json',row)
 if not row['parity']['passes']:raise ValueError('Owned-blank parity failed')
 if row['imageWallMs']>128000:raise ValueError('Owned-blank runtime exceeds fixed full-evaluation budget')
 write(out/'accepted.json',{'route':spec['route'],'ortLoadMs':load_ms,'qualificationMs':row['imageWallMs'],'graph':structure})
def benchmark_worker(spec):
 out=Path(spec['outputDir']);torch,module,model,torch_load=load_torch(spec);cfg,sources=context(spec);session,ort_load=ort_session(Path(spec['graphFile']))
 write(out/'session.json',{'python':platform.python_version(),'versions':installed(spec['versions']),'torchLoadMs':torch_load,'ortLoadMs':ort_load,'torchIntra':torch.get_num_threads(),'torchInter':torch.get_num_interop_threads(),'ortIntra':2,'ortInter':1,'providers':session.get_providers(),'combinedProcess':True,'ttaViews':model.tta_views,'totalGramsPassed':False})
 for engine in ['torch','ort']:
  row=prediction(spec['qualification'],cfg,sources,session=session if engine=='ort' else None,torch_model=(torch,model) if engine=='torch' else None);write(out/('qualification-'+engine+'.json'),row)
  if not row['parity']['passes'] or row['imageWallMs']>128000:raise ValueError('Warmup parity or runtime qualification failed')
 controls={c['id']:c['order'] for c in spec['controls']}
 for case in spec['cases']:
  for engine in controls.get(case['id'],['ort']):
   row=prediction(case,cfg,sources,session=session if engine=='ort' else None,torch_model=(torch,model) if engine=='torch' else None);write(out/(case['id']+'-'+engine+'.json'),row);print(json.dumps({'id':case['id'],'runtime':engine,'parity':row['parity']['passes'],'wallMs':row['imageWallMs']}),flush=True)
  if case['id'] in controls:time.sleep(10)
def preflight(repo,root,previous):
 if subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True).strip():raise ValueError('Commit clean source before model code')
 p=json.loads((repo/PROFILE).read_text())
 if platform.python_version()!=p['python'] or installed(p['versions'])!=p['versions']:raise ValueError('Pinned isolated runtime required')
 for f in p['sourceFiles']:verify_file(repo/f['path'],f['sha256'],f['bytes'])
 for f in p['previousFiles']:verify_file(previous/f['path'],f['sha256'],f['bytes'])
 require_start_memory(available_memory(),p['preflightMinAvailableBytes'])
 if not (root/'tmp').is_dir() or subprocess.check_output(['stat','-f','-c','%T',str(root)],text=True).strip()=='tmpfs':raise ValueError('Disk-backed task root required')
 return p
def make_spec(repo,previous,p,out):
 old=json.loads((repo/BASE/'calorie-lens-profile-v1.json').read_text());spec={k:str(repo/old[k]) for k in ['modelSourcePath','configPath','nutrientMetadataPath']};spec['sourcePath']=spec.pop('modelSourcePath');spec.update(modelFile=str(previous/'models/calorie-lens/model.safetensors'),outputDir=str(out),nutrientMetadataSha256=old['nutrientMetadataSha256'],versions=list(p['versions']))
 def project(c):return {'id':c['id'],'inputFile':str(previous/c['inputPath']),'inputSha256':c['inputSha256'],'expectedFile':str(previous/c['expectedPath']),'expectedSha256':c['expectedSha256']}
 spec['qualification']=project(p['qualification']);spec['cases']=[project(c) for c in p['cases']];spec['controls']=p['controls'];spec['preflightMinAvailableBytes']=p['preflightMinAvailableBytes'];return spec
def main(a):
 repo=a.repo.absolute();root=a.root.absolute();previous=a.previous.absolute();p=preflight(repo,root,previous)
 if a.mode=='preflight':print(json.dumps({'cleanSource':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'cases':len(p['cases']),'controls':p['controls'],'availableBytes':available_memory()}));return
 if a.mode=='export':
  for route in ['dynamo','legacy']:
   out=root/('export-'+route);out.mkdir();spec=make_spec(repo,previous,p,out);spec['route']=route;supervision=supervise(repo,root,spec,'export',p['exportLimits'])
   if successful_attempt(supervision,(out/'accepted.json').exists()):
    write(root/'selected.json',{'route':route,'graphFile':str(out/'model.onnx'),'receipt':json.loads((out/'accepted.json').read_text()),'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()});return
  raise RuntimeError('Both predeclared exports failed; inspect retained worker diagnostics')
 selected=json.loads((root/'selected.json').read_text());graph=Path(selected['graphFile'])
 for f in selected['receipt']['graph']['files']:verify_file(safe_external_path(graph.parent,f['name']),f['sha256'],f['bytes'])
 out=root/'benchmark';out.mkdir();spec=make_spec(repo,previous,p,out);spec['graphFile']=str(graph);supervision=supervise(repo,root,spec,'benchmark',p['benchmarkLimits'])
 if not successful_attempt(supervision,True):raise RuntimeError('Benchmark incomplete; inspect retained worker diagnostics and fixed denominators')
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--worker',choices=['export','benchmark']);parser.add_argument('--spec',type=Path);parser.add_argument('--repo',type=Path,default=Path.cwd());parser.add_argument('--root',type=Path);parser.add_argument('--previous',type=Path);parser.add_argument('--mode',choices=['preflight','export','benchmark'],default='preflight');args=parser.parse_args()
 if args.worker:
  spec=json.loads(args.spec.read_text());export_worker(spec) if args.worker=='export' else benchmark_worker(spec)
 else:
  if not args.root or not args.previous:parser.error('Explicit disk-backed task root and retained baseline root required')
  main(args)
