"""Source-faithful array adapter and frozen numerical contract for Lens ONNX."""
import hashlib, io, math
import numpy as np
from PIL import Image

OUTPUTS=('logits','log_grams','soft','log_totals','grams','mass_gap','totals')
NUTRIENTS=('kcal','fat_g','carb_g','protein_g','fiber_g','sugars_g','sat_fat_g','sodium_mg')
BASELINE_VERSIONS={'torch':'2.13.0+cpu','torchvision':'0.28.0+cpu','transformers':'5.22.2','huggingface-hub':'2.4.0','safetensors':'0.8.0','numpy':'2.2.4','Pillow':'11.1.0'}
def preprocess(image_bytes,size):
 with Image.open(io.BytesIO(image_bytes)) as image:
  image=image.convert('RGB');height,width=size
  factor=min(width/image.width,height/image.height);w,h=max(1,round(image.width*factor)),max(1,round(image.height*factor))
  canvas=Image.new('RGB',(width,height),tuple(round(255*m) for m in [.485,.456,.406]))
  canvas.paste(image.resize((w,h),Image.Resampling.BICUBIC),((width-w)//2,(height-h)//2))
  return np.ascontiguousarray(np.asarray(canvas,np.uint8).transpose(2,0,1)[None].astype(np.float32)/np.float32(255))
def publisher_summary(raw,config):
 k=len(config['ingredients']);g=np.asarray(raw['grams'],np.float32);z=np.asarray(raw['logits'],np.float32);gap=np.asarray(raw['mass_gap'],np.float32);direct=np.asarray(raw['log_totals'],np.float32);density=np.asarray(config['densities'],np.float32)
 if g.shape!=(1,k) or z.shape!=g.shape or gap.shape!=(1,) or direct.shape!=(1,5) or density.shape!=(k,8):raise ValueError('Unexpected published model shape')
 if any(not np.isfinite(x).all() for x in [g,z,gap,direct,density]) or (g<0).any() or (gap<0).any():raise ValueError('Nonfinite/negative model output')
 g=g[0];z=z[0].astype(np.float64);p=np.empty_like(z);positive=z>=0;p[positive]=1/(1+np.exp(-z[positive]));exp=np.exp(z[~positive]);p[~positive]=exp/(1+exp);p=p.astype(np.float32)
 shown=[int(i) for i in np.argsort(-g) if p[i]>=config['presence_threshold'] and g[i]>=config['display_min_grams']][:12]
 def row(name,grams,pergram,**extra):
  return {'name':name,'grams':round(float(grams),1),**extra,**{key:round(float(grams)*float(value),2) for key,value in zip(NUTRIENTS,pergram)}}
 items=[row(config['ingredients'][i],g[i],density[i],confidence=round(float(p[i]),3),extended=config['density_sources'][i]) for i in shown]
 rest=np.setdiff1d(np.arange(k),shown);gap=float(gap[0]);other_g=float(g[rest].sum())+gap;other_n=g[rest]@density[rest]+gap*np.asarray(config['mean_density'])
 other=row('other (unidentified)',other_g,other_n/other_g if other_g>0 else np.zeros(8))
 d=np.expm1(np.maximum(direct[0],np.float32(0)))
 if not np.isfinite(d).all():raise ValueError('Nonfinite direct head')
 return {'ingredients':items,'other':other,'totals':{'mass_g':round(float(g.sum())+gap,1),**{key:round(sum(r[key] for r in items)+other[key],2) for key in NUTRIENTS}},'direct_estimate':{'mass_g':round(float(d[1]),1),**{key:round(float(d[i]),2) for i,key in [(0,'kcal'),(2,'fat_g'),(3,'carb_g'),(4,'protein_g')]}}}
def parity_report(expected,actual):
 failures=[];heads={};point={}
 try:
  if expected['inputTensor']!=actual['inputTensor']:failures.append('input_tensor')
  if [r['name'] for r in expected['publisherSummary']['ingredients']]!=[r['name'] for r in actual['publisherSummary']['ingredients']]:failures.append('display_names_or_order')
  for name in OUTPUTS:
   e=np.asarray(expected['raw'][name],np.float64);a=np.asarray(actual['raw'][name],np.float64)
   if e.shape!=a.shape or not np.isfinite(e).all() or not np.isfinite(a).all():failures.append(name+':shape_or_nonfinite');continue
   if name in ['logits','log_grams','log_totals']:atol=.0001
   elif name=='totals':atol=np.asarray([.05,.005,.005,.005,.005,.005,.005,.5])
   else:atol=.005
   difference=np.abs(a-e);bad=difference>atol+.0001*np.abs(e);heads[name]={'shape':list(e.shape),'maxAbsoluteDifference':float(difference.max()) if e.size else 0,'outsideTolerance':int(bad.sum())}
   if bad.any():failures.append(name+':numeric')
  for name,tolerance in [('massG',.10),('kcal',.10),('proteinG',.02),('carbsG',.02),('fatG',.02)]:
   e=expected['massG'] if name=='massG' else expected['totals'][name];a=actual['massG'] if name=='massG' else actual['totals'][name]
   if type(e) not in (int,float) or type(a) not in (int,float) or not math.isfinite(e) or not math.isfinite(a):failures.append(name+':nonfinite');continue
   delta=abs(a-e);point[name]=delta
   if delta>tolerance+1e-12:failures.append(name+':point')
 except (KeyError,TypeError,ValueError,OverflowError):failures.append('invalid_record')
 return {'passes':not failures,'failures':failures,'heads':heads,'pointAbsoluteDifferences':point}
def compatibility_report(expected,actual,config):
 """Separate pre-food v2 contract; never reclassifies the failed raw-v1 experiment."""
 raw=parity_report(expected,actual);failures=[f for f in raw['failures'] if f!='logits:numeric'];maximum=None;presence_changes=None;mass_changes=None
 try:
  k=len(config['ingredients']);e=np.asarray(expected['raw']['logits'],np.float64);a=np.asarray(actual['raw']['logits'],np.float64)
  if e.shape!=(1,k) or a.shape!=e.shape or not np.isfinite(e).all() or not np.isfinite(a).all():raise ValueError('Finite aligned logits required')
  def probability(z):
   p=np.empty_like(z);positive=z>=0;p[positive]=1/(1+np.exp(-z[positive]));v=np.exp(z[~positive]);p[~positive]=v/(1+v);return p
  ep=probability(e);ap=probability(a);maximum=float(np.max(np.abs(ep-ap)))
  if np.any(np.abs(ep-ap)>1e-6+1e-4*np.abs(ep)):failures.append('presence_probability:numeric')
  presence_changes=int(np.count_nonzero((ep.astype(np.float32)>=config['presence_threshold'])!=(ap.astype(np.float32)>=config['presence_threshold'])))
  eg=np.asarray(expected['raw']['grams'],np.float32);ag=np.asarray(actual['raw']['grams'],np.float32)
  if eg.shape!=(1,k) or ag.shape!=eg.shape or not np.isfinite(eg).all() or not np.isfinite(ag).all():raise ValueError('Finite aligned grams required')
  mass_changes=int(np.count_nonzero((eg>=config['display_min_grams'])!=(ag>=config['display_min_grams'])))
  if presence_changes:failures.append('presence_decisions')
  if mass_changes:failures.append('mass_display_eligibility')
 except (KeyError,TypeError,ValueError,OverflowError):failures.append('invalid_compatibility_record')
 return {'rawV1':raw,'endpointV2':{'protocol':'endpoint-compatibility-v2','passes':not failures,'failures':failures,'maxProbabilityAbsoluteDifference':maximum,'presenceDecisionChanges':presence_changes,'massDisplayEligibilityChanges':mass_changes},'raw_speed_qualified':False}
def select_controls(cases,seed):
 if not seed or len({c['id'] for c in cases})!=len(cases):raise ValueError('Unique cases and fixed seed required')
 def rank(c,part):return hashlib.sha256((seed+'|'+part+'|'+c['id']).encode()).hexdigest(),c['id']
 selected=[]
 for group,n in [('discovery10',2),('validation20',2),('ecust-old',1),('ecust-fresh',1)]:
  pool=sorted([{'id':c['id'],'group':c['group']} for c in cases if c['group']==group],key=lambda c:rank(c,group))
  if len(pool)<n:raise ValueError('Missing frozen control stratum')
  selected.extend(pool[:n])
 return sorted(selected,key=lambda c:rank(c,'order'))
