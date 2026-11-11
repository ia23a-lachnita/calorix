"""Independent full-cohort audit; no training, remote calls or model forward passes.
Run with the pinned task venv from the repository root after continuation completes.
"""
import csv, hashlib, io, json, math, os, statistics, subprocess, sys
from decimal import Decimal, getcontext
from pathlib import Path
import numpy as np
from PIL import Image
from independent_read_grams import read_grams
getcontext().prec=50
repo=Path.cwd();task=Path(sys.argv[1]);audit=Path(sys.argv[2]);audit.mkdir()
base=repo/'functions/eval/tier1-public';profile=json.loads((base/'calorie-lens-profile-v1.json').read_text());amend=json.loads((base/'calorie-lens-runtime-amendment-v1.json').read_text());manifest=json.loads((base/'manifest-calorie-lens-v1.json').read_text());cases=manifest['cases'];config=json.loads((repo/profile['configPath']).read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
D=lambda n:Decimal(str(n))
checks={k:0 for k in ['rawRecordHashes','inputTensorHashes','workerImageOnlyCases','publisherSummaryFields','rawNutritionDotFields','independentGramReadoutFields','directHeadFields','decimalMetricFields','routingCases','sourcePins']}
def near(a,b,tol='1e-9'):
 assert abs(D(a)-D(b))<=D(tol),(a,b,tol)
def quantile(values,p):
 v=sorted(values);x=D(len(v)-1)*D(p);lo=int(x);hi=min(lo+1,len(v)-1);return v[lo]+(v[hi]-v[lo])*(x-lo)
def summary(pairs,energy=False):
 if not pairs:return None
 errors=[D(p)-D(r) for r,p in pairs];a=[abs(x) for x in errors];n=D(len(a))
 return {'mae':sum(a)/n,'bias':sum(errors)/n,'p90':quantile(a,'.9'),'median':quantile(a,'.5'),**({'normalized':sum(abs(D(p)-D(r))/max(D(r),D(200)) for r,p in pairs)/n} if energy else {})}
def checkscore(rows,predicted,report):
 valid=[(c,predicted[c['id']]) for c in rows if predicted.get(c['id']) is not None]
 assert report['selected']==len(rows) and report['scored']==len(valid) and report['failed']==len(rows)-len(valid)
 near(report['coverage'],len(valid)/len(rows) if rows else 0)
 fields={'mae':'mae_kcal','bias':'bias_kcal','p90':'p90_absolute_error_kcal','median':'median_absolute_error_kcal','normalized':'mean_normalized_absolute_error'}
 values=summary([(c['reference']['kcal'],v['kcal']) for c,v in valid],True)
 for key,name in fields.items():
  if values is None:assert report['served'][name] is None
  else:near(values[key],report['served'][name]);checks['decimalMetricFields']+=1
 for k in ['massG','proteinG','carbsG','fatG']:
  v=summary([(c['reference'][k],p[k]) for c,p in valid])
  for key,name in [('mae','mae'),('bias','bias'),('p90','p90_absolute_error')]:
   if v is None:assert report['amounts'][k][name] is None
   else:near(v[key],report['amounts'][k][name]);checks['decimalMetricFields']+=1
def massscore(rows,pred,report):
 pairs=[(c['reference']['massG'],pred.get(c['id'])) for c in rows if pred.get(c['id']) is not None];v=summary(pairs);assert report['attempted']==len(rows) and report['scored']==len(pairs) and report['failed']==len(rows)-len(pairs)
 for key,name in [('mae','maeG'),('bias','biasG'),('median','medianAbsoluteErrorG'),('p90','p90AbsoluteErrorG')]:
  if not v:assert report[name] is None
  else:near(v[key],report[name]);checks['decimalMetricFields']+=1
# Validate both source stages and immutable input/profile pins.
assert sha(base/'calorie-lens-profile-v1.json')==amend['originalProfileSha256'];assert sha(base/'manifest-calorie-lens-v1.json')==profile['manifestSha256'];assert sha(task/'experiment/result.json')==amend['originalPartialResultSha256']
for file in profile['sourceFiles']:
 p=repo/file['path'];assert sha(p)==file['sha256'] and p.stat().st_size==file['bytes'];checks['sourcePins']+=1
for c in cases:
 assert sha(task/'assets'/c['inputPath'])==c['inputSha256']
 if c.get('a1ReceiptPath'):assert sha(repo/c['a1ReceiptPath'])==c['a1ReceiptSha256']
for owncode in ['tool/calorie_lens_routes.py','tool/run_calorie_lens_eval.py','tool/run_open_model_eval.py','tool/open_model_adapters.py']:
 old=subprocess.check_output(['git','show',amend['originalSourceCommit']+':'+owncode]);assert old==(repo/owncode).read_bytes();checks['sourcePins']+=1
completed=json.loads((task/'continuation/runtime-result.json').read_text());assert completed['workerExitCode']==0 and completed['resourceStop'] is None
for path in [task/'experiment/plate-vision/worker-input.json',task/'experiment/calorie-lens/worker-input.json',task/'continuation/calorie-lens/worker-input.json']:
 for c in json.loads(path.read_text())['cases']:assert set(c)=={'id','inputFile','inputSha256'};checks['workerImageOnlyCases']+=1
original_result=json.loads((task/'experiment/result.json').read_text());predictions={};origins={}
for model in ['plate-vision','calorie-lens']:
 rows={};where={}
 if model=='plate-vision':
  for p in profile['retainedPlateRecords']:
   file=repo/p['path'];assert sha(file)==p['sha256'];rows[p['id']]=json.loads(file.read_text());where[p['id']]=str(file);checks['rawRecordHashes']+=1
 for c in cases:
  candidates=[task/'experiment'/model/(c['id']+'.json')]
  if model=='calorie-lens':candidates.append(task/'continuation'/model/(c['id']+'.json'))
  present=[p for p in candidates if p.exists()];assert len(present)<=1
  if present:
   file=present[0];r=json.loads(file.read_text());assert r['id']==c['id'];rows[c['id']]=r;where[c['id']]=str(file);checks['rawRecordHashes']+=1
 assert len(rows)==42 and set(rows)=={c['id'] for c in cases};predictions[model]=rows;origins[model]=where
for p in amend['originalFoodRecordPins']:
 file=task/'experiment'/p['model']/(p['id']+'.json');assert sha(file)==p['sha256']
# Independent publisher recomputation from saved Lens tensors.
dens=np.asarray(config['densities'],np.float32);vectors={};csvrows=[]
for model,rows in predictions.items():
 vectors[model]={}
 for c in cases:
  r=rows[c['id']];assert r['status']=='ok' and r['inferenceEntered'] is True
  vectors[model][c['id']]={**r['totals'],'massG':r['massG']} if r.get('totals') else None
  path=task/'assets'/c['inputPath'];im=Image.open(path).convert('RGB')
  if model=='plate-vision':
   x=np.asarray(im,np.uint8)[None].copy()
   bundle=json.loads((base/profile['plate']['metadataPath']).read_text());out=[]
   for i in range(5):
    out.append(sorted((D(z)*D(bundle['target_transform']['std'][i])+D(bundle['target_transform']['mean'][i])).exp()-1 for z in r['raw']['nutrition_quantiles'][0][i])[1])
   for expected,actual in zip(out,[r['totals'][k] for k in ['kcal','proteinG','fatG','carbsG']]+[r['massG']]):near(expected,actual,'1e-8');checks['publisherSummaryFields']+=1
  else:
   height,width=config['image_size'];scale=min(width/im.width,height/im.height);nw,nh=max(1,round(im.width*scale)),max(1,round(im.height*scale));canvas=Image.new('RGB',(width,height),tuple(round(255*m) for m in [.485,.456,.406]));canvas.paste(im.resize((nw,nh),Image.Resampling.BICUBIC),((width-nw)//2,(height-nh)//2));x=np.asarray(canvas,np.uint8).transpose(2,0,1)[None].astype(np.float32)/np.float32(255)
   raw=r['raw'];independent_g,independent_gap=read_grams(raw,config);assert float(np.max(np.abs(independent_g-np.asarray(raw['grams']))))<.01 and float(np.max(np.abs(independent_gap-np.asarray(raw['mass_gap']))))<.01;checks['independentGramReadoutFields']+=len(config['ingredients'])+1;g=np.asarray(raw['grams'],np.float32)[0];logits=np.asarray(raw['logits'],np.float64)[0];prob=1/(1+np.exp(-logits));gap=float(raw['mass_gap'][0]);shown=[int(i) for i in np.argsort(-g) if prob[i]>=config['presence_threshold'] and g[i]>=config['display_min_grams']][:12];rest=np.setdiff1d(np.arange(len(g)),shown);other_g=float(g[rest].sum())+gap;other_n=g[rest]@dens[rest]+gap*np.asarray(config['mean_density']);other_density=other_n/other_g if other_g>0 else np.zeros(8);s=r['publisherSummary']
   assert [config['ingredients'][i] for i in shown]==[item['name'] for item in s['ingredients']]
   keys=['kcal','fat_g','carb_g','protein_g','fiber_g','sugars_g','sat_fat_g','sodium_mg'];expected_rows=[]
   for i,item in zip(shown,s['ingredients']):
    near(round(float(g[i]),1),item['grams']);checks['publisherSummaryFields']+=1
    vals={k:round(float(g[i])*float(d),2) for k,d in zip(keys,dens[i])};expected_rows.append(vals)
    for k,v in vals.items():near(v,item[k]);checks['publisherSummaryFields']+=1
   other={k:round(other_g*float(d),2) for k,d in zip(keys,other_density)}
   for k,v in other.items():near(v,s['other'][k],'0.011');checks['publisherSummaryFields']+=1
   for k in keys:near(round(sum(v[k] for v in expected_rows)+other[k],2),s['totals'][k],'0.011');checks['publisherSummaryFields']+=1
   near(round(float(g.sum())+gap,1),s['totals']['mass_g']);checks['publisherSummaryFields']+=1
   dots=g@dens
   for expected,actual in zip(dots,raw['totals'][0]):near(float(expected),actual,'0.002');checks['rawNutritionDotFields']+=1
   for i,key in [(0,'kcal'),(1,'mass_g'),(2,'fat_g'),(3,'carb_g'),(4,'protein_g')]:
    mathematical=(max(D(raw['log_totals'][0][i]),D(0))).exp()-1;near(mathematical,s['direct_estimate'][key],'.051' if i==1 else '.011');checks['directHeadFields']+=1
  tensor={'dtype':str(x.dtype),'shape':list(x.shape),'sha256':hashlib.sha256(np.ascontiguousarray(x).tobytes()).hexdigest()}
  assert r['inputTensor']==tensor,(model,c['id'],r['inputTensor'],tensor);checks['inputTensorHashes']+=1
# Recreate scoring with frozen repository helper, then independently audit every metric via Decimal.
from tool.calorie_lens_routes import summarize_routes
reports={model:summarize_routes(cases,rows) for model,rows in predictions.items()}
F=['kcal','proteinG','carbsG','fatG']
def baseline(c):
 a=c.get('a1Estimate')
 return {**a['totals'],'massG':sum(D(p['massG']) for p in a['components'])} if a else None
def independent_routes(model,c):
 a=baseline(c);p=vectors[model][c['id']];r=predictions[model][c['id']];eligible=bool(a and a['massG']>=150 and len(c['a1Estimate']['components'])>=2)
 gated=p if eligible and p is not None else a;fusion=None
 if a and r.get('massG'):
  ratio=D(r['massG'])/a['massG'];fusion={'massG':D(r['massG']),**{k:sum(D(part['nutrients'][k])*ratio for part in c['a1Estimate']['components']) for k in F}}
 head=r.get('directHead');head={**head['totals'],'massG':head['massG']} if head else None
 if a:
  gate=reports[model]['routing'][c['id']];assert gate['eligible']==eligible;assert gate['selectedSource']==('specialist' if eligible and p else 'A1')
  near(gate['massG'],gated['massG']);checks['routingCases']+=1
 return {'baseline':a,'direct':p,'gated':gated,'massFusion':fusion,'directHead':head}
eligible_reports={}
for model,report in reports.items():
 vr={route:{} for route in ['baseline','direct','gated','massFusion','directHead']}
 for c in cases:
  for route,value in independent_routes(model,c).items():vr[route][c['id']]=value
  p=predictions[model][c['id']];gate=report['routing'].get(c['id'])
  csvrows.append({'model':model,'id':c['id'],'group':c['group'],'referenceMassG':c['reference']['massG'],'referenceKcal':c['reference'].get('kcal'),'a1MassG':baseline(c)['massG'] if baseline(c) else None,'directMassG':p.get('massG'),'directKcal':(p.get('totals') or {}).get('kcal'),'gatedSource':gate['selectedSource'] if gate else None,'gatedKcal':gate['totals']['kcal'] if gate else None,'eligible':gate['eligible'] if gate else None,'status':p['status'],'wallMs':p.get('wallMs')})
 for group in ['discovery10','validation20']:
  subset=[c for c in cases if c['group']==group]
  for route in vr:checkscore(subset,vr[route],report[group][route])
 old=[c for c in cases if c['group']=='ecust-old'];fresh=[c for c in cases if c['group']=='ecust-fresh']
 for route in ['baseline','direct','gated']:massscore(old,{c['id']:vr[route][c['id']]['massG'] for c in old},report['ecust']['old'][route])
 massscore(fresh,{c['id']:predictions[model][c['id']]['massG'] for c in fresh},report['ecust']['fresh']['direct'])
 assert report['ecust']['fresh']['hybrid'] is None and report['ecust']['energy'] is None and report['productionPromotable'] is False
 eligible=[c for c in cases if c['group']=='validation20' and report['routing'][c['id']]['eligible']];assert len(eligible)==4
 eligible_reports[model]={'cases':[c['id'] for c in eligible],'baseline':{k:str(v) for k,v in summary([(c['reference']['kcal'],vr['baseline'][c['id']]['kcal']) for c in eligible],True).items()},'gated':{k:str(v) for k,v in summary([(c['reference']['kcal'],vr['gated'][c['id']]['kcal']) for c in eligible],True).items()},'improved':sum(abs(D(vr['gated'][c['id']]['kcal'])-D(c['reference']['kcal']))<abs(D(vr['baseline'][c['id']]['kcal'])-D(c['reference']['kcal'])) for c in eligible)}
# Save primary replay and all row-level provenance without model binaries/photos.
def encode(obj):
 if isinstance(obj,Decimal):return float(obj)
 raise TypeError
with (audit/'per-case.csv').open('x',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(csvrows[0]),lineterminator='\n');w.writeheader();w.writerows(csvrows)
(audit/'metrics.json').write_text(json.dumps(reports,indent=2,default=encode)+'\n')
(audit/'eligible-four.json').write_text(json.dumps(eligible_reports,indent=2)+'\n')
(audit/'record-origins.json').write_text(json.dumps({m:{i:{'path':p,'sha256':sha(Path(p))} for i,p in rows.items()} for m,rows in origins.items()},indent=2)+'\n')
receipt={'status':'PASS','checks':checks,'newModelForwardCalls':0,'distinctComparedModelFoodRecords':84,'distinctNewFoodRecords':62,'priorPlateRecords':22,'continuedLensFoodRecords':len(amend['remainingLensFoodIds']),'qualifications':2,'atMostOneInterruptedForwardUnknown':True,'metricTolerance':'1e-9','publisherSummaryRoundingTolerance':'0.011','directHeadRoundingTolerance':'0.011 nutrients/0.051g','rawMatrixFp32Tolerance':'0.002','independentFloat64GramReadoutTolerance':'0.01g','sourceScope':'Pinned artifacts and all rows, no Android/medical/generalization or visual identity adjudication claim'}
(audit/'independent-verification.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
