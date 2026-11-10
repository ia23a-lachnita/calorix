"""Independent artifact audit: Decimal metrics, raw-head decoding and tensor hashes.
Run from repository root with task NumPy/Pillow venv; performs no model inference.
"""
import csv, hashlib, io, json, math, sys
from decimal import Decimal, getcontext
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps
getcontext().prec=50
root=Path(__file__).resolve().parents[2]
task=Path(sys.argv[1]).resolve()
audit_out=Path(sys.argv[2]).resolve();audit_out.mkdir()
exp=task/'experiment'
base=root/'functions/eval/tier1-public'
manifest=json.loads((base/'manifest-open-models-v1.json').read_text())
result=json.loads((exp/'result.json').read_text())
plate=json.loads((base/'open-models/plate-bundle.json').read_text())
dish=json.loads((base/'open-models/dish-config.json').read_text())
cases=manifest['cases']; n5=[c for c in cases if c['dataset']=='nutrition5k']
fields=['kcal','proteinG','fatG','carbsG']
counts={'rawHeadFields':0,'fusionFields':0,'decimalMetricFields':0,'inputTensorHashes':0,'rawRecordHashes':0,'workerCasesWithoutLabels':0}
D=lambda x:Decimal(str(x))
def close(a,b,tolerance='1e-9'):
 assert abs(D(a)-D(b))<=D(tolerance),(a,b,tolerance)
def avg(v):return sum(v)/len(v)
def q(v,p):
 v=sorted(v); index=D(len(v)-1)*D(p);lo=int(index);hi=min(lo+1,len(v)-1)
 return v[lo]+(v[hi]-v[lo])*(index-lo)
def values(errors,refs=None):
 a=[abs(e) for e in errors]
 return {'mae':avg(a),'bias':avg(errors),'p90':q(a,'.9'),'median':q(a,'.5'),
         **({'norm':avg([x/max(r,D(200)) for x,r in zip(a,refs)])} if refs else {})}
def checkmetrics(pairs,reported,energy=False):
 es=[D(p)-D(r) for r,p in pairs];refs=[D(r) for r,p in pairs]
 v=values(es,refs if energy else None)
 names={'mae':'mae_kcal','bias':'bias_kcal','p90':'p90_absolute_error_kcal','median':'median_absolute_error_kcal','norm':'mean_normalized_absolute_error'} if energy else {'mae':'mae','bias':'bias','p90':'p90_absolute_error'}
 for k,name in names.items():close(v[k],reported[name]);counts['decimalMetricFields']+=1
def auditmass(cases,preds,reported,baseline=False):
 pairs=[(c['reference']['massG'],c['a1']['massG'] if baseline else preds[c['id']]['massG']) for c in cases]
 es=[D(p)-D(r) for r,p in pairs];v=values(es)
 for k,name in [('mae','maeG'),('bias','biasG'),('p90','p90AbsoluteErrorG'),('median','medianAbsoluteErrorG')]:close(v[k],reported[name]);counts['decimalMetricFields']+=1
 assert reported['coverage']==1 and reported['failed']==0 and reported['scored']==len(cases)
csvrows=[]
for model,score in result['models'].items():
 preds=json.loads((exp/model/'predictions.json').read_text())
 spec=json.loads((exp/model/'worker-input.json').read_text())
 assert len(spec['cases'])==22
 for w in spec['cases']:assert set(w)=={'id','inputFile','inputSha256'};counts['workerCasesWithoutLabels']+=1
 for c in cases:
  row=preds[c['id']];assert row['status']=='ok' and row['inferenceEntered'] is True
  rawfile=exp/model/(c['id']+'.json')
  pin=next(p for p in result['recordPins'] if p['model']==model and p['id']==c['id'])
  assert hashlib.sha256(rawfile.read_bytes()).hexdigest()==pin['sha256'];counts['rawRecordHashes']+=1
  im=ImageOps.exif_transpose(Image.open(io.BytesIO((task/'assets'/c['inputPath']).read_bytes()))).convert('RGB')
  if model=='plate-vision':
   x=np.asarray(im,dtype=np.uint8)[None].copy()
   t=plate['target_transform'];out=[]
   for i in range(5):
    v=sorted(((D(z)*D(t['std'][i])+D(t['mean'][i])).exp()-1) for z in row['raw']['nutrition_quantiles'][0][i])[1]
    out.append(v)
   for expected,actual in zip(out,[row['totals'][k] for k in fields]+[row['massG']]):close(expected,actual,'1e-8');counts['rawHeadFields']+=1
  else:
   x=np.asarray(im.resize((dish['img_size'],dish['img_size']),Image.Resampling.BILINEAR),np.float32)/255.0
   x=((x-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)).transpose(2,0,1)[None].astype(np.float32)
   sc=dish['scalers']['total_mass'];mass=float(np.clip(np.asarray(row['raw']['mass'],np.float32).reshape(-1)*sc['scale_'][0]+sc['mean_'][0],0,None)[0])
   close(mass,row['massG']);counts['rawHeadFields']+=1
   p=(1/(1+np.exp(-np.asarray(row['raw']['classification'],np.float64)))).astype(np.float32)
   mask=p>=.5
   if mask.any():
    # Independent algebraic equivalent of publisher masked log-probability softmax.
    weights=np.where(mask,p,0);weights/=weights.sum(axis=1,keepdims=True)
    macros=(weights@np.asarray(dish['norm_ingr'],np.float32))[0]*np.float32(mass)
    protein,fat,carbs=map(float,macros)
    for k,value in zip(fields,[4*protein+9*fat+4*carbs,protein,fat,carbs]):close(value,row['totals'][k],'0.0001');counts['rawHeadFields']+=1
   else:assert row['totals'] is None and row['directFailure']=='vocabulary_failure' and row['publisherRawTotals']['kcal']==0
  assert row['inputTensor']=={'shape':list(x.shape),'dtype':str(x.dtype),'sha256':hashlib.sha256(np.ascontiguousarray(x).tobytes()).hexdigest()};counts['inputTensorHashes']+=1
  if c.get('a1Estimate'):
   parts=c['a1Estimate']['components'];factor=D(row['massG'])/sum(D(p['massG']) for p in parts);f=row['fusion'];assert f['referenceMassUsed'] is False
   close(f['massG'],row['massG']);counts['fusionFields']+=1
   for k in fields:close(sum(D(p['nutrients'][k])*factor for p in parts),f['totals'][k]);counts['fusionFields']+=1
   for old,new in zip(parts,f['components']):assert old['source']==new['source'] and old['name']==new['name']
  csvrows.append({'model':model,'id':c['id'],'dataset':c['dataset'],'referenceMassG':c['reference']['massG'],'predictedMassG':row['massG'],'referenceKcal':c['reference'].get('kcal'),'directKcal':(row['totals'] or {}).get('kcal'),'fusionKcal':(row.get('fusion') or {}).get('totals',{}).get('kcal'),'directFailure':row.get('directFailure'),'wallMs':row['wallMs']})
 for route in ['baseline','direct','fusion']:
  def pred(c):return c['a1'] if route=='baseline' else preds[c['id']]['fusion'] if route=='fusion' else preds[c['id']]
  report=score['nutrition5k'][route];assert report['coverage']==1 and report['scored']==10
  checkmetrics([(c['reference']['kcal'],pred(c)['totals']['kcal']) for c in n5],report['served'],True)
  for k in ['massG','proteinG','carbsG','fatG']:checkmetrics([(c['reference'][k],pred(c)['massG'] if k=='massG' else pred(c)['totals'][k]) for c in n5],report['amounts'][k])
 ec=[c for c in cases if c['dataset']=='ecust'];old=[c for c in ec if c.get('a1')];fresh=[c for c in ec if not c.get('a1')]
 for subset,key in [(ec,'mass'),(old,'old6Mass'),(fresh,'fresh6Mass')]:auditmass(subset,preds,score['ecust'][key])
 auditmass(old,preds,score['ecust']['old6A1BaselineMass'],True);assert score['ecust']['energy'] is None
 assert score['descriptiveScreen']['passesAll'] is False
assert result['newVlmSdkInvocations']==0 and not result['newTraining'] and result['productionPromotable'] is False
with (audit_out/'per-case.csv').open('x',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(csvrows[0]));w.writeheader();w.writerows(csvrows)
summary={'status':'PASS','sourceCommit':result['sourceCommit'],'checks':counts,'tolerances':{'metrics':'1e-9','plateDecimalInverse':'1e-8','dishFloat32EquivalentMacros':'0.0001'},'newInferenceCalls':0,'scope':'All 44 raw records and input tensors, all head outputs, 20 fusions, full fixed-cohort Decimal metrics. No Android or legal/medical validation.'}
(audit_out/'independent-verification.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
