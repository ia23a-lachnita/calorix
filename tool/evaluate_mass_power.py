"""Replay three separately reported cohorts against a locked mass-only fit."""
import argparse,json,hashlib
from pathlib import Path
from evaluate_public_weighed import read_json,write_json,validate_bundle
from tool.evaluate_portion_calibration import OLD_SHA
from tool.fit_portion_calibration import prediction_rows
from tool.mass_power_calibration import fit_mass_power,compare_power

def main():
 p=argparse.ArgumentParser();p.add_argument('--experiment',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--repo',type=Path,default=Path.cwd());a=p.parse_args();base=a.repo/'functions/eval/tier1-public'
 receipt,receiptsha=read_json(a.experiment/'experiment.json')
 if receipt['status']!='completed' or receipt['unknownInFlight'] or receipt['maxSdkEntries']!=11 or not 1<=receipt['completedSdkEntries']<=11:raise ValueError('Completed bounded11 experiment required')
 config,_=read_json(base/'mass-power-protocol-v1.json',receipt['protocolSha256'])
 profile,_=read_json(a.experiment/'profile.json',receipt['profileSha256']);training,_=read_json(base/'mass-power-training-v1.json',receipt['trainingInputSha256'])
 expected=fit_mass_power(training['rows']);expected['trainingInputSha256']=receipt['trainingInputSha256']
 if profile!=expected or len(training['rows'])!=20:raise ValueError('Frozen TRAIN-only profile does not reproduce')
 old,_=read_json(a.repo/'docs/tier1-public-weighed-2026-11-10/bundle.json',OLD_SHA);validate_bundle(old)
 dev=[{'id':r['id'],'reference':r['reference'],'predicted':({**r['predictions']['A1']['predicted'],'massG':r['predictions']['A1']['massG']} if r['predictions']['A1']['status']=='ok' else None)} for r in old['cases']]
 first,_=read_json(a.repo/'docs/tier1-portion-calibration-2026-11-10/result.json',config['firstConfirmationResultSha256']);prior=first['confirmation_cases']
 manifest,_=read_json(base/'mass-power-test-v1.json',receipt['manifestSha256']);new=prediction_rows(manifest,a.experiment/'test')
 sets=[{r['id'] for r in rows} for rows in [dev,prior,new]];train={r['id'] for r in training['rows']}
 if any(sets[i]&sets[j] for i in range(3) for j in range(i+1,3)) or any(s&train for s in sets):raise ValueError('Training/evaluation overlap')
 cohorts={'development40':compare_power(dev,profile),'firstConfirmation10_nowDevelopment':compare_power(prior,profile),'newConfirmation10':compare_power(new,profile)}
 result={'schema_version':'mass-power-result-1','sourceCommit':receipt['sourceCommit'],'engineCommit':receipt['engineCommit'],'experimentReceiptSha256':receiptsha,
  'profileSha256':receipt['profileSha256'],'trainingInputSha256':receipt['trainingInputSha256'],'profile':profile,**cohorts,'passes_all':all(c['passes'] for c in cohorts.values()),
  'sdk_entries':receipt['completedSdkEntries'],'new_food_sdk_entries':receipt['completedSdkEntries']-1,'extra_candidate_sdk_entries':0,'new_confirmation_cases':new,
  'inference_cost_usd':None,'android_weighed_meals':0,'consumed_reference_meals':0,'independent_physical_plates':'unknown',
  'interpretation':'Old40 and firstfresh10 are development; only new10 remained unqueried before this fit. All3 must meet fixed engineering guards. Not statistical/clinical significance; pretraining exposure unknown. No measured reference value is used by the prediction transform.'}
 write_json(a.output,result);print(json.dumps({'profile':profile,'passes_all':result['passes_all'],'guards':{k:v['guards'] for k,v in cohorts.items()}}))
if __name__=='__main__':main()
