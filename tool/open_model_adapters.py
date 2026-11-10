"""Research adapters for pinned third-party ONNX models; no reference labels in inference."""
import copy,io,math
import numpy as np
from PIL import Image,ImageOps
from tool.paired_view_metrics import _metrics
from tool.reference_scale import metrics as mass_metrics

FIELDS=('kcal','proteinG','fatG','carbsG')
def number(value,positive=False):
 if isinstance(value,(bool,np.bool_)) or not isinstance(value,(int,float,np.integer,np.floating)) or not math.isfinite(float(value)) or float(value)<0 or (positive and float(value)<=0):raise ValueError('Invalid finite physical quantity')
 return float(value)

def preprocess(model_id,image_bytes,metadata):
 with Image.open(io.BytesIO(image_bytes)) as image:
  image=ImageOps.exif_transpose(image)
  if image.mode in ('RGBA','LA') or (image.mode=='P' and 'transparency' in image.info):
   rgba=image.convert('RGBA');bg=Image.new('RGBA',rgba.size,(255,255,255,255));image=Image.alpha_composite(bg,rgba)
  image=image.convert('RGB')
  if model_id=='plate-vision':return np.asarray(image,dtype=np.uint8)[None].copy()
  if model_id!='dish2calories':raise ValueError('Unsupported pinned model')
  size=metadata['img_size']
  if type(size) is not int or not 0<size<=1024:raise ValueError('Invalid source image size')
  x=np.asarray(image.resize((size,size),Image.Resampling.BILINEAR),dtype=np.float32)/np.float32(255)
  x=(x-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)
  return np.ascontiguousarray(x.transpose(2,0,1)[None])

def decode_plate(raw,bundle):
 if bundle.get('heads_trained',{}).get('nutrition_quantiles') is not True:raise ValueError('Trained nutrition head required')
 t=bundle['target_transform'];keys=['energy','protein','fat','carbohydrate','mass']
 if t['keys']!=keys or len(t['mean'])!=5 or len(t['std'])!=5:raise ValueError('Pinned target transform required')
 x=np.asarray(raw)
 if x.shape!=(1,5,3) or not np.isfinite(x).all():raise ValueError('Unexpected quantile tensor')
 values=[]
 for i in range(5):
  mean=float(t['mean'][i]);std=number(t['std'][i],True)
  if not math.isfinite(mean):raise ValueError('Invalid target mean')
  try:triple=sorted(math.expm1(float(v)*std+mean) for v in x[0,i])
  except OverflowError as e:raise ValueError('Nonfinite inverse target') from e
  values.append(triple[1])
 mass=number(values[4],True);totals=dict(zip(['kcal','proteinG','fatG','carbsG'],values[:4]))
 try:totals={k:number(v) for k,v in totals.items()};failure=None
 except ValueError:totals=None;failure='invalid_nutrition_output'
 return {'massG':mass,'totals':totals,'directFailure':failure,'pointDecoder':'inverse_standardized_log_then_sort_three_take_middle','intervalsUsed':False}

def decode_dish(logits,raw_mass,config):
 logits=np.asarray(logits);raw_mass=np.asarray(raw_mass)
 classes=config['num_classes'];densities=np.asarray(config['norm_ingr'],np.float32)
 if logits.shape!=(1,classes) or raw_mass.size!=1 or densities.shape!=(classes,3) or not np.isfinite(logits).all() or not np.isfinite(raw_mass).all() or not np.isfinite(densities).all() or (densities<0).any():raise ValueError('Invalid model tensor/ingredient table')
 sc=config['scalers']['total_mass'];mean=float(sc['mean_'][0]) if sc.get('with_mean',True) else 0;scale=float(sc['scale_'][0]) if sc.get('with_std',True) else 1
 if not math.isfinite(mean):raise ValueError('Invalid mass mean')
 number(scale,True);mass=number(np.maximum(raw_mass.reshape(-1).astype(np.float32)*scale+mean,0)[0],True)
 z=logits.astype(np.float64);p=np.empty_like(z);positive=z>=0;p[positive]=1/(1+np.exp(-z[positive]));exp=np.exp(z[~positive]);p[~positive]=exp/(1+exp);p=p.astype(np.float32);mask=(p>=.5).astype(np.float32)
 scores=np.clip(np.log(np.clip(p,1e-12,None)/.5),-20,None)+(mask-1)*1e9;scores-=scores.max(axis=1,keepdims=True);exps=np.exp(scores)*mask;weights=exps/np.clip(exps.sum(axis=1,keepdims=True),1,None)
 macros=(weights@densities)[0]*np.float32(mass);protein,fat,carbs=map(float,macros);totals={'kcal':4*protein+9*fat+4*carbs,'proteinG':protein,'fatG':fat,'carbsG':carbs};count=int(mask.sum())
 return {'massG':mass,'totals':totals if count else None,'publisherRawTotals':totals,'directFailure':None if count else 'vocabulary_failure','selectedIngredients':count,'pointDecoder':'published_probability_weighted_ingredient_density_times_unstandardized_mass'}

def fuse_mass(estimate,predicted_mass,model_provenance):
 target=number(predicted_mass,True);parts=estimate['components']
 if not parts:raise ValueError('A1 components required')
 original=math.fsum(number(c['massG'],True) for c in parts);factor=target/original;out=[]
 for component in parts:
  c=copy.deepcopy(component);c['massG']=number(c['massG'],True)*factor;c['nutrients']={k:number(c['nutrients'][k])*factor for k in FIELDS};out.append(c)
 return {'massG':target,'totals':{k:math.fsum(c['nutrients'][k] for c in out) for k in FIELDS},'components':out,'massProvenance':{'kind':'unverified_pretrained_model_estimate','model':model_provenance,'originalA1EstimatedMassG':original,'scaleFactor':factor},'foodAndNutrientSources':'retained_A1_component_identities_proportions_and_source_records','referenceMassUsed':False}

def score_open_models(cases,predictions):
 if len({c['id'] for c in cases})!=len(cases) or set(predictions)-{c['id'] for c in cases}:raise ValueError('Exact unique case membership required')
 n5=[c for c in cases if c['dataset']=='nutrition5k'];ec=[c for c in cases if c['dataset']=='ecust']
 def row(c,route):
  p=predictions.get(c['id'],{});a=c.get('a1') if route=='baseline' else p.get('fusion') if route=='fusion' else p
  vector=None
  if a and a.get('massG') is not None and a.get('totals') is not None and (route=='baseline' or p.get('status')=='ok'):
   vector={**{k:number(a['totals'][k]) for k in FIELDS},'massG':number(a['massG'],True)}
  return {'id':c['id'],'reference':c['reference'],'predicted':vector}
 nmetrics={route:_metrics([row(c,route) for c in n5]) for route in ('baseline','direct','fusion')}
 for route,key in [('direct','matchedDirect'),('fusion','matchedFusion')]:
  subset=[c for c in n5 if row(c,route)['predicted'] is not None and row(c,'baseline')['predicted'] is not None];nmetrics[key]={'scoredPairs':len(subset),'baseline':_metrics([row(c,'baseline') for c in subset]),route:_metrics([row(c,route) for c in subset])}
 def mass(c):
  p=predictions.get(c['id'],{});return p.get('massG') if p.get('status')=='ok' else None
 def mscore(subset):return mass_metrics([(c['reference']['massG'],mass(c)) for c in subset])
 old=[c for c in ec if c.get('a1') is not None];fresh=[c for c in ec if c.get('a1') is None];base_mass=mass_metrics([(c['reference']['massG'],c['a1']['massG']) for c in old]);oldmass=mscore(old)
 lo=nmetrics['baseline'];hi=nmetrics['fusion'];valid=len(n5)==10 and lo['scored']==10 and hi['scored']==10
 guards={'all10N5BaselineAndFusionValid':valid,'n5FusionMaeAtLeast10PercentBetter':valid and lo['served']['mae_kcal']>0 and hi['served']['mae_kcal']<=.9*lo['served']['mae_kcal'],'n5FusionP90NotWorse':valid and hi['served']['p90_absolute_error_kcal']<=lo['served']['p90_absolute_error_kcal'],'n5FusionNormalizedNotWorse':valid and hi['served']['mean_normalized_absolute_error']<=lo['served']['mean_normalized_absolute_error'],'old6EcustCoverageNotWorse':len(old)==6 and oldmass['scored']==6,'old6EcustMassMaeNotWorse':len(old)==6 and oldmass['scored']==6 and oldmass['maeG']<=base_mass['maeG'],'old6EcustMassP90NotWorse':len(old)==6 and oldmass['scored']==6 and oldmass['p90AbsoluteErrorG']<=base_mass['p90AbsoluteErrorG']}
 return {'nutrition5k':nmetrics,'ecust':{'mass':mscore(ec),'old6Mass':oldmass,'fresh6Mass':mscore(fresh),'old6A1BaselineMass':base_mass,'energy':None},'descriptiveScreen':{'guards':guards,'passesAll':all(guards.values()),'meaning':'Exploratory next-validation screen only; source training exposure/licensing still separate.'},'productionPromotable':False,'calorieGoldOnlyNutrition5k':True,'referencesUsedForInference':False}
