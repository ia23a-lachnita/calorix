"""Offline fixed-cohort comparison. Raw-v1 failure and v2 verdict stay inseparable."""
import argparse,gzip,hashlib,json,math,statistics
from pathlib import Path
from tool.lens_onnx_contract import compatibility_report
from tool.calorie_lens_routes import summarize_routes
from tool.run_calorie_lens_eval import BASE,sha,write
def timing_summary(controls,records):
 rows=[]
 for c in controls:
  row={'id':c['id'],'order':c['order'],'imageWallRatio':None,'forwardAndDecodeRatio':None}
  try:
   t=records[(c['id'],'torch')];o=records[(c['id'],'ort')]
   for k in ['imageWallMs','forwardAndDecodeMs']:
    if any(type(v[k]) not in (int,float) or not math.isfinite(v[k]) or v[k]<=0 for v in [t,o]):raise ValueError('Positive finite timing required')
   row.update(torchImageWallMs=t['imageWallMs'],ortImageWallMs=o['imageWallMs'],imageWallRatio=t['imageWallMs']/o['imageWallMs'],forwardAndDecodeRatio=t['forwardAndDecodeMs']/o['forwardAndDecodeMs'])
  except (ValueError,KeyError,TypeError,ZeroDivisionError):pass
  rows.append(row)
 valid=[r for r in rows if r['imageWallRatio'] is not None];complete=len(controls)==6 and len(valid)==6
 return {'planned':6,'scored':len(valid),'rows':rows,'medianPairedImageWallRatio':statistics.median(r['imageWallRatio'] for r in valid) if complete else None,'medianPairedForwardRatio':statistics.median(r['forwardAndDecodeRatio'] for r in valid) if complete else None,'ratioOfImageWallMedians':statistics.median(r['torchImageWallMs'] for r in valid)/statistics.median(r['ortImageWallMs'] for r in valid) if complete else None}
def read_bytes(path):return path.read_bytes() if path.exists() else gzip.decompress(path.with_name(path.name+'.gz').read_bytes())
def main(repo,execution,output):
 profile=json.loads((repo/BASE/'lens-onnx-profile-v1.json').read_text());cases=json.loads((repo/BASE/'manifest-calorie-lens-v1.json').read_text())['cases'];cfg=json.loads((repo/BASE/'calorie-lens/config.json').read_text());records={};baseline={};predictions={};checks=[];pins=[]
 for c in profile['cases']:
  data=read_bytes(repo/'docs/tier1-calorie-lens-2026-11-11'/c['expectedPath']);assert hashlib.sha256(data).hexdigest()==c['expectedSha256'];e=json.loads(data);baseline[c['id']]=e
  for engine in ['ort','torch']:
   path=execution/'benchmark-v2'/(c['id']+'-'+engine+'.json')
   if not path.exists() and not path.with_name(path.name+'.gz').exists():continue
   data=read_bytes(path);a=json.loads(data);assert a['id']==c['id'] and a['runtime']==engine and a['inputSha256']==c['inputSha256'] and a['expectedSha256']==c['expectedSha256'];result=compatibility_report(e,a,cfg);assert result==a['compatibility'] and result['rawV1']==a['parity'];records[(c['id'],engine)]=a;checks.append({'id':c['id'],'runtime':engine,**result});pins.append({'id':c['id'],'runtime':engine,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
   if engine=='ort':predictions[c['id']]=a
 old=summarize_routes(cases,baseline);new=summarize_routes(cases,predictions);metric_guards=[];energy={}
 for group,n in [('discovery10',10),('validation20',20)]:
  b=old[group]['direct'];a=new[group]['direct'];d={key:abs(a['served'][key]-b['served'][key]) if a['served'][key] is not None and b['served'][key] is not None else None for key in ['mae_kcal','bias_kcal','median_absolute_error_kcal','p90_absolute_error_kcal','mean_normalized_absolute_error']};valid=a['scored']==n and b['scored']==n and all(v is not None and v<=(.0005 if k=='mean_normalized_absolute_error' else .1)+1e-12 for k,v in d.items());metric_guards.append(valid);energy[group]={'selected':n,'oldTorch':b,'newOrt':a,'absoluteMetricDifferences':d,'passesBounds':valid,'rawV1Protocol':'FAILED qualification','endpointV2Verdict':'pending aggregate'}
 mass={}
 for group in ['old','fresh']:
  b=old['ecust'][group]['direct'];a=new['ecust'][group]['direct'];d={key:abs(a[key]-b[key]) if a[key] is not None and b[key] is not None else None for key in ['maeG','biasG','medianAbsoluteErrorG','p90AbsoluteErrorG']};valid=b['scored']==6 and a['scored']==6 and all(v is not None and v<=.1+1e-12 for v in d.values());metric_guards.append(valid);mass[group]={'oldTorch':b,'newOrt':a,'absoluteMetricDifferences':d,'passesBounds':valid,'rawV1Protocol':'FAILED qualification','endpointV2Verdict':'pending aggregate'}
 timing=timing_summary(profile['controls'],records);ort_checks=[r for r in checks if r['runtime']=='ort'];torch_checks=[r for r in checks if r['runtime']=='torch'];runtime=json.loads(read_bytes(execution/'benchmark-v2/supervision.json'));spec=json.loads(read_bytes(execution/'benchmark-v2/worker-input.json'));assert spec['controls']==profile['controls'] and [c['id'] for c in spec['cases']]==[c['id'] for c in profile['cases']];assert all(set(c)=={'id','inputFile','inputSha256','expectedFile','expectedSha256'} for c in spec['cases']);v2=len(ort_checks)==42 and len(torch_checks)==6 and all(r['endpointV2']['passes'] for r in checks) and all(metric_guards) and runtime['workerExitCode']==0 and runtime['resourceStop'] is None
 for group in list(energy.values())+list(mass.values()):group['endpointV2Verdict']='PASS' if v2 else 'FAIL_OR_INCOMPLETE'
 ratio=timing['medianPairedImageWallRatio'];result={'experiment':'lens-onnx-endpoint-compatibility-v2','profileSha256':sha(repo/BASE/'lens-onnx-profile-v1.json'),'rawV1':{'qualification':'FAILED','foodScored':len(ort_checks),'foodPassed':sum(r['rawV1']['passes'] for r in ort_checks),'foodPlanned':42},'endpointV2':{'passes':v2,'foodScored':len(ort_checks),'foodPassed':sum(r['endpointV2']['passes'] for r in ort_checks),'foodPlanned':42,'controlScored':len(torch_checks),'metricGuards':metric_guards},'raw_speed_qualified':False,'v2_material_speed_qualified':v2 and ratio is not None and ratio>=1.25,'v2_strong_speed_qualified':v2 and ratio is not None and ratio>=2,'pairedTiming':timing,'servedCalorieMetrics':energy,'massOnlyMetrics':mass,'allRecordChecks':checks,'recordPins':pins,'supervision':runtime,'newLocalFoodPredictions':len(records),'plannedLocalFoodPredictions':48,'newMealVlmCalls':0,'productionPromotable':False}
 write(output,result);print(json.dumps({k:result[k] for k in ['rawV1','endpointV2','raw_speed_qualified','v2_material_speed_qualified','v2_strong_speed_qualified','newLocalFoodPredictions']}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path.cwd());p.add_argument('--execution',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();main(a.repo,a.execution,a.output)
