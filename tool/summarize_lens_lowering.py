"""Offline strict-candidate report, inseparable from both original failed protocols."""
import argparse,hashlib,json
from pathlib import Path
from tool.summarize_lens_onnx import timing_summary,read_bytes
from tool.lens_onnx_contract import compatibility_report
from tool.calorie_lens_routes import summarize_routes
from tool.run_calorie_lens_eval import BASE,sha,write
from tool.run_lens_lowering import PROFILE,VERDICTS

def main(repo,execution,output):
 p=json.loads((repo/PROFILE).read_text());base=json.loads((repo/BASE/'lens-onnx-profile-v1.json').read_text());assert sha(repo/BASE/'lens-onnx-profile-v1.json')==p['baseRuntimeProfileSha256'];cases=json.loads((repo/BASE/'manifest-calorie-lens-v1.json').read_text())['cases'];cfg=json.loads((repo/BASE/'calorie-lens/config.json').read_text());old={};records={};predictions={};checks=[];pins=[]
 for c in base['cases']:
  data=read_bytes(repo/'docs/tier1-calorie-lens-2026-11-11'/c['expectedPath']);assert hashlib.sha256(data).hexdigest()==c['expectedSha256'];e=json.loads(data);old[c['id']]=e
  for engine in ['ort','torch']:
   path=execution/'benchmark'/(c['id']+'-'+engine+'.json')
   if not path.exists() and not path.with_name(path.name+'.gz').exists():continue
   data=read_bytes(path);r=json.loads(data);assert r['id']==c['id'] and r['runtime']==engine and r['inputSha256']==c['inputSha256'] and r['expectedSha256']==c['expectedSha256'];assert all(r[k]==v for k,v in VERDICTS.items());result=compatibility_report(e,r,cfg);assert result==r['compatibility'] and result['rawV1']==r['parity'];records[(c['id'],engine)]=r;checks.append({'id':c['id'],'runtime':engine,**result});pins.append({'id':c['id'],'runtime':engine,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
   if engine=='ort':predictions[c['id']]=r
 baseline=summarize_routes(cases,old);candidate=summarize_routes(cases,predictions);metric_guards=[];energy={};mass={}
 for group,n in [('discovery10',10),('validation20',20)]:
  b=baseline[group]['direct'];a=candidate[group]['direct'];delta={key:abs(a['served'][key]-b['served'][key]) if a['served'][key] is not None and b['served'][key] is not None else None for key in ['mae_kcal','bias_kcal','median_absolute_error_kcal','p90_absolute_error_kcal','mean_normalized_absolute_error']};passed=a['scored']==n and b['scored']==n and all(v is not None and v<=(.0005 if key=='mean_normalized_absolute_error' else .1)+1e-12 for key,v in delta.items());metric_guards.append(passed);energy[group]={**VERDICTS,'oldTorch':b,'newOrt':a,'absoluteMetricDifferences':delta,'passesBounds':passed}
 for group in ['old','fresh']:
  b=baseline['ecust'][group]['direct'];a=candidate['ecust'][group]['direct'];delta={key:abs(a[key]-b[key]) if a[key] is not None and b[key] is not None else None for key in ['maeG','biasG','medianAbsoluteErrorG','p90AbsoluteErrorG']};passed=a['scored']==6 and b['scored']==6 and all(v is not None and v<=.1+1e-12 for v in delta.values());metric_guards.append(passed);mass[group]={**VERDICTS,'oldTorch':b,'newOrt':a,'absoluteMetricDifferences':delta,'passesBounds':passed}
 timing=timing_summary(base['controls'],records);runtime=json.loads(read_bytes(execution/'benchmark/supervision.json'));spec=json.loads(read_bytes(execution/'benchmark/worker-input.json'));assert spec['controls']==base['controls'] and [c['id'] for c in spec['cases']]==[c['id'] for c in base['cases']];assert all(set(c)=={'id','inputFile','inputSha256','expectedFile','expectedSha256'} for c in spec['cases']);ort=[r for r in checks if r['runtime']=='ort'];torch=[r for r in checks if r['runtime']=='torch'];passed=len(ort)==42 and len(torch)==6 and all(r['rawV1']['passes'] and r['endpointV2']['passes'] for r in checks) and all(metric_guards) and runtime['workerExitCode']==0 and runtime['resourceStop'] is None;ratio=timing['medianPairedImageWallRatio'];selected=json.loads(read_bytes(execution/'selected.json'));assert selected['profileSha256']==sha(repo/PROFILE)
 result={**VERDICTS,'experiment':'lens-onnx-v3-stable-sigmoid','profileSha256':sha(repo/PROFILE),'baseProfileSha256':p['baseRuntimeProfileSha256'],'sourceCommit':selected['sourceCommit'],'strictCandidate':{'passes':passed,'ortScored':len(ort),'ortStrictPassed':sum(r['rawV1']['passes'] for r in ort),'ortDecisionsAndEndpointsPassed':sum(r['endpointV2']['passes'] for r in ort),'plannedOrt':42,'controlScored':len(torch),'plannedControls':6,'metricGuards':metric_guards},'v3_material_speed_qualified':passed and ratio is not None and ratio>=1.25,'v3_strong_speed_qualified':passed and ratio is not None and ratio>=2,'pairedTiming':timing,'servedCalorieMetrics':energy,'massOnlyMetrics':mass,'allRecordChecks':checks,'recordPins':pins,'supervision':runtime,'newLocalFoodPredictions':len(records),'plannedLocalFoodPredictions':48,'newMealVlmCalls':0,'productionPromotable':False};write(output,result);print(json.dumps({k:result[k] for k in list(VERDICTS)+['strictCandidate','v3_material_speed_qualified','v3_strong_speed_qualified','newLocalFoodPredictions']}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path.cwd());p.add_argument('--execution',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();main(a.repo,a.execution,a.output)
