"""Independent scalar/Decimal replay of the frozen runtime experiment; no neural calls."""
import argparse,gzip,hashlib,importlib.util,json,math,statistics,struct,sys
from decimal import Decimal,getcontext
from pathlib import Path
getcontext().prec=50
D=lambda x:Decimal(str(x))
def digest(data):return hashlib.sha256(data).hexdigest()
def read(path):return path.read_bytes() if path.exists() else gzip.decompress(path.with_name(path.name+'.gz').read_bytes())
def f32(x):return struct.unpack('<f',struct.pack('<f',x))[0]
def q(values,p):
 s=sorted(values);pos=D(len(s)-1)*D(p);lo=int(pos);hi=min(lo+1,len(s)-1);return s[lo]+(s[hi]-s[lo])*(pos-lo)
def metrics(pairs,energy=False):
 if not pairs:return None
 errors=[D(p)-D(r) for r,p in pairs];a=[abs(v) for v in errors];n=D(len(a));out={'mae':sum(a)/n,'bias':sum(errors)/n,'median':q(a,'.5'),'p90':q(a,'.9')}
 if energy:out['normalized']=sum(abs(D(p)-D(r))/max(D(r),D(200)) for r,p in pairs)/n
 return out
def near(a,b,tol='1e-9'):assert abs(D(a)-D(b))<=D(tol),(a,b,tol)
def main(a):
 repo=a.repo.absolute();doc=repo/'docs/tier1-lens-onnx-2026-11-11';sys.path.insert(0,str(doc));from audit_qualification import compare,sigmoid
 import numpy as np
 from PIL import Image
 loader=importlib.util.spec_from_file_location('independent_gram_oracle',repo/'docs/tier1-calorie-lens-2026-11-11/independent_read_grams.py');oracle=importlib.util.module_from_spec(loader);loader.loader.exec_module(oracle)
 p=json.loads((repo/'functions/eval/tier1-public/lens-onnx-profile-v1.json').read_text());cfg=json.loads((repo/'functions/eval/tier1-public/calorie-lens/config.json').read_text());cases=json.loads((repo/'functions/eval/tier1-public/manifest-calorie-lens-v1.json').read_text())['cases'];summary=json.loads(a.summary.read_text());assert summary['profileSha256']==digest((repo/'functions/eval/tier1-public/lens-onnx-profile-v1.json').read_bytes());assert summary['raw_speed_qualified'] is False and summary['rawV1']['qualification']=='FAILED'
 counts={k:0 for k in ['sourcePins','baselineHashes','recordHashes','inputTensorHashes','rawHeadScalars','presenceDecisions','massDisplayDecisions','independentGramFields','nutrientProducts','publisherFields','decimalMetricFields','timingRatios']};old={};records={};v2={};rawpasses={};allpins={(r['id'],r['runtime']):r for r in summary['recordPins']};changes=[]
 for f in p['sourceFiles']:
  data=(repo/f['path']).read_bytes();assert digest(data)==f['sha256'] and len(data)==f['bytes'];counts['sourcePins']+=1
 densities=np.asarray(cfg['densities'],np.float32);keys=['kcal','fat_g','carb_g','protein_g','fiber_g','sugars_g','sat_fat_g','sodium_mg'];max_g_delta=0
 for c in p['cases']:
  data=read(repo/'docs/tier1-calorie-lens-2026-11-11'/c['expectedPath']);assert digest(data)==c['expectedSha256'];e=json.loads(data);old[c['id']]=e;counts['baselineHashes']+=1
  tensor=None
  if a.assets:
   imagepath=a.assets/Path(c['inputPath']).relative_to('assets');data=imagepath.read_bytes();assert digest(data)==c['inputSha256'];image=Image.open(imagepath).convert('RGB');h,w=cfg['image_size'];factor=min(w/image.width,h/image.height);nw,nh=max(1,round(image.width*factor)),max(1,round(image.height*factor));canvas=Image.new('RGB',(w,h),tuple(round(255*v) for v in [.485,.456,.406]));canvas.paste(image.resize((nw,nh),Image.Resampling.BICUBIC),((w-nw)//2,(h-nh)//2));x=np.asarray(canvas,np.uint8).transpose(2,0,1)[None].astype(np.float32)/np.float32(255);tensor={'shape':list(x.shape),'dtype':str(x.dtype),'sha256':digest(x.tobytes())};assert tensor==e['inputTensor']
  for engine in ['ort','torch']:
   path=a.execution/'benchmark-v2'/(c['id']+'-'+engine+'.json')
   if not path.exists() and not path.with_name(path.name+'.gz').exists():continue
   data=read(path);r=json.loads(data);pin=allpins[(c['id'],engine)];assert digest(data)==pin['sha256'] and len(data)==pin['bytes'];counts['recordHashes']+=1;assert r['inputTensor']==e['inputTensor'] and (tensor is None or r['inputTensor']==tensor);counts['inputTensorHashes']+=1;assert r['inputSha256']==c['inputSha256'] and r['expectedSha256']==c['expectedSha256'];assert r['id']==c['id'] and r['runtime']==engine
   strict=compare(e,r);assert strict['passes']==r['parity']['passes'] and strict['failures']==r['parity']['failures'];counts['rawHeadScalars']+=sum(v['elements'] for v in strict['heads'].values());failure=[v for v in strict['failures'] if v!='logits:numeric'];probs=[(sigmoid(x),sigmoid(y)) for x,y in zip(e['raw']['logits'][0],r['raw']['logits'][0])];pc=sum((f32(x)>=f32(cfg['presence_threshold']))!=(f32(y)>=f32(cfg['presence_threshold'])) for x,y in probs);mc=sum((x>=cfg['display_min_grams'])!=(y>=cfg['display_min_grams']) for x,y in zip(e['raw']['grams'][0],r['raw']['grams'][0]));counts['presenceDecisions']+=len(probs);counts['massDisplayDecisions']+=len(probs)
   if any(abs(x-y)>1e-6+1e-4*abs(x) for x,y in probs):failure.append('presence_probability:numeric')
   if pc:failure.append('presence_decisions')
   if mc:failure.append('mass_display_eligibility')
   v=r['compatibility']['endpointV2'];assert v['passes']==(not failure) and v['presenceDecisionChanges']==pc and v['massDisplayEligibilityChanges']==mc;near(v['maxProbabilityAbsoluteDifference'],max(abs(x-y) for x,y in probs),'1e-14');assert r['compatibility']['raw_speed_qualified'] is False;v2[(c['id'],engine)]=not failure;rawpasses[(c['id'],engine)]=strict['passes']
   g,gap=oracle.read_grams(r['raw'],cfg);delta=max(float(np.max(np.abs(g-np.asarray(r['raw']['grams'])))),float(np.max(np.abs(gap-np.asarray(r['raw']['mass_gap'])))));max_g_delta=max(max_g_delta,delta);assert delta<.01;counts['independentGramFields']+=254
   grams=np.asarray(r['raw']['grams'],np.float32)[0];dot=grams@densities
   for index,(x,y) in enumerate(zip(dot,r['raw']['totals'][0])):near(float(x),y,str([.05,.005,.005,.005,.005,.005,.005,.5][index]));counts['nutrientProducts']+=1
   assert len(r['components'])==len(cfg['ingredients']) and r['referenceMassUsed'] is False and r['identityAndPortionVerified'] is False
   for i,component in enumerate(r['components']):
    assert component['name']==cfg['ingredients'][i] and component['massG']==r['raw']['grams'][0][i] and component['source']==e['components'][i]['source'];assert component['foodIdentityVerified'] is False and component['amountVerified'] is False
   prob=np.asarray([f32(y) for x,y in probs],np.float32);shown=[int(i) for i in np.argsort(-grams) if prob[i]>=cfg['presence_threshold'] and grams[i]>=cfg['display_min_grams']][:12];s=r['publisherSummary'];assert [cfg['ingredients'][i] for i in shown]==[v['name'] for v in s['ingredients']];rest=np.setdiff1d(np.arange(253),shown);otherg=float(grams[rest].sum())+r['raw']['mass_gap'][0];othern=grams[rest]@densities[rest]+r['raw']['mass_gap'][0]*np.asarray(cfg['mean_density']);otherdensity=othern/otherg if otherg>0 else np.zeros(8);expected=[]
   for i,item in zip(shown,s['ingredients']):
    near(round(float(grams[i]),1),item['grams']);values={key:round(float(grams[i])*float(d),2) for key,d in zip(keys,densities[i])};expected.append(values)
    for key,value in values.items():near(value,item[key]);counts['publisherFields']+=1
   other={key:round(otherg*float(d),2) for key,d in zip(keys,otherdensity)}
   for key in keys:near(other[key],s['other'][key],'.011');near(round(sum(x[key] for x in expected)+other[key],2),s['totals'][key],'.011');counts['publisherFields']+=2
   near(round(float(grams.sum())+r['raw']['mass_gap'][0],1),r['massG']);assert s['totals']['mass_g']==r['massG']
   for k,v in [('kcal','kcal'),('proteinG','protein_g'),('carbsG','carb_g'),('fatG','fat_g')]:assert r['totals'][k]==s['totals'][v]
   assert r['imageWallMs']>=r['forwardAndDecodeMs']>0;records[(c['id'],engine)]=r
   if not v2[(c['id'],engine)]:changes.append({'id':c['id'],'runtime':engine,'rawV1':strict['passes'],'endpointV2':False,'failures':failure})
 metric_ok=[]
 for group,n in [('discovery10',10),('validation20',20)]:
  cohort=[c for c in cases if c['group']==group];report=summary['servedCalorieMetrics'][group];group_values={}
  for engine,label in [('old','oldTorch'),('ort','newOrt')]:
   pairs=[(c['reference']['kcal'],(old[c['id']] if engine=='old' else records[(c['id'],'ort')])['totals']['kcal']) for c in cohort if engine=='old' or (c['id'],'ort') in records];m=metrics(pairs,True);group_values[label]=m;assert report[label]['selected']==n and report[label]['scored']==len(pairs)
   for key,field in [('mae','mae_kcal'),('bias','bias_kcal'),('median','median_absolute_error_kcal'),('p90','p90_absolute_error_kcal'),('normalized','mean_normalized_absolute_error')]:near(m[key],report[label]['served'][field]);counts['decimalMetricFields']+=1
  metric_ok.append(all(abs(group_values['oldTorch'][k]-group_values['newOrt'][k])<=D('.0005' if k=='normalized' else '.1') for k in group_values['oldTorch']))
 for group,source in [('old','ecust-old'),('fresh','ecust-fresh')]:
  cohort=[c for c in cases if c['group']==source];report=summary['massOnlyMetrics'][group];vals={}
  for engine,label in [('old','oldTorch'),('ort','newOrt')]:
   pairs=[(c['reference']['massG'],(old[c['id']] if engine=='old' else records[(c['id'],'ort')])['massG']) for c in cohort if engine=='old' or (c['id'],'ort') in records];m=metrics(pairs);vals[label]=m
   for key,field in [('mae','maeG'),('bias','biasG'),('median','medianAbsoluteErrorG'),('p90','p90AbsoluteErrorG')]:near(m[key],report[label][field]);counts['decimalMetricFields']+=1
  metric_ok.append(all(abs(vals['oldTorch'][k]-vals['newOrt'][k])<=D('.1') for k in vals['oldTorch']))
 ratios=[]
 for c,row in zip(p['controls'],summary['pairedTiming']['rows']):
  assert c['id']==row['id'] and c['order']==row['order'];t=records.get((c['id'],'torch'));o=records.get((c['id'],'ort'))
  if not t or not o:continue
  ratio=D(t['imageWallMs'])/D(o['imageWallMs']);near(ratio,row['imageWallRatio'],'1e-12');near(D(t['forwardAndDecodeMs'])/D(o['forwardAndDecodeMs']),row['forwardAndDecodeRatio'],'1e-12');ratios.append(ratio);counts['timingRatios']+=1
 ratio=q(ratios,'.5') if len(ratios)==6 else None
 if ratio is not None:near(ratio,summary['pairedTiming']['medianPairedImageWallRatio'],'1e-12')
 supervision=json.loads(read(a.execution/'benchmark-v2/supervision.json'));expected_pass=len(records)==48 and all(v2.values()) and all(metric_ok) and supervision['workerExitCode']==0 and supervision['resourceStop'] is None;assert expected_pass==summary['endpointV2']['passes'];assert summary['v2_material_speed_qualified']==(expected_pass and ratio is not None and ratio>=D('1.25'));assert summary['v2_strong_speed_qualified']==(expected_pass and ratio is not None and ratio>=D(2));assert summary['rawV1']['foodPassed']==sum(rawpasses.get((c['id'],'ort'),False) for c in p['cases'])
 result={'checks':counts,'allChecksPass':True,'rawV1Qualification':'FAILED','raw_speed_qualified':False,'endpointV2Passes':expected_pass,'v2Failures':changes,'metricGuards':metric_ok,'medianPairedRatio':float(ratio) if ratio is not None else None,'maximumIndependentGramDifferenceG':max_g_delta,'inputPixelRecomputed':a.assets is not None,'ortFoodScored':sum(engine=='ort' for case,engine in records),'torchControlsScored':sum(engine=='torch' for case,engine in records),'neuralCallsByAuditor':0};a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--execution',type=Path,required=True);p.add_argument('--summary',type=Path,required=True);p.add_argument('--assets',type=Path);p.add_argument('--output',type=Path,required=True);main(p.parse_args())
