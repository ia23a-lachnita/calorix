"""Ground-truth-weight counterfactual, never a photo-only predictor or bound."""
import argparse,copy,json
from pathlib import Path
from evaluate_meals import metrics
from evaluate_public_weighed import read_json,write_json,validate_bundle
from tool.portion_calibration import finite,VECTOR
from tool.fit_portion_calibration import prediction_rows
from tool.evaluate_portion_calibration import OLD_SHA,verify_profile

def diagnose(rows):
    cases=[];raw=[];oracle=[];seen=set()
    for r in rows:
        if r['id'] in seen:raise ValueError('Duplicate ID')
        seen.add(r['id']);ref=r['reference']
        for k in VECTOR:finite(ref[k])
        if ref['massG']<=0:raise ValueError('Positive measured reference mass required')
        p=r['predicted']
        if p is None:
            cases.append({'id':r['id'],'status':'failed_original_prediction','oracleKcal':None});continue
        for k in VECTOR:finite(p[k])
        if p['massG']<=0:raise ValueError('Positive predicted mass required')
        factor=ref['massG']/p['massG'];energy=finite(p['kcal']*factor)
        raw.append((p['kcal'],ref['kcal']));oracle.append((energy,ref['kcal']))
        cases.append({'id':r['id'],'status':'ok','referenceMassG':ref['massG'],'predictedMassG':p['massG'],
          'referenceKcal':ref['kcal'],'rawKcal':p['kcal'],'oracleKcal':energy,'massCorrectionFactor':factor,
          'rawErrorKcal':p['kcal']-ref['kcal'],'oracleErrorKcal':energy-ref['kcal']})
    return {'selected':len(rows),'scored':len(raw),'failed':len(rows)-len(raw),'coverage':len(raw)/len(rows) if rows else 0,
      'raw':metrics(raw),'oracle':metrics(oracle),'cases':cases,'sdk_entries':0,'promotable':False,'upper_bound':False,
      'interpretation':'ORACLE DIAGNOSTIC: replaces estimated aggregate mass with measured reference mass while retaining predicted aggregate energy density. Requires unavailable ground truth; not photo-only accuracy, not an accuracy bound or causal attribution. Can worsen error by removing compensating mistakes. Aggregate mass can conceal missing foods or wrong mixtures.'}

def main():
    p=argparse.ArgumentParser();p.add_argument('--experiment',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--repo',type=Path,default=Path.cwd());a=p.parse_args()
    old,_=read_json(a.repo/'docs/tier1-public-weighed-2026-11-10/bundle.json',OLD_SHA);validate_bundle(old)
    dev=[{'id':r['id'],'reference':r['reference'],'predicted':({**r['predictions']['A1']['predicted'],'massG':r['predictions']['A1']['massG']} if r['predictions']['A1']['status']=='ok' else None)} for r in old['cases']]
    receipt,receiptsha=read_json(a.experiment/'experiment.json')
    if receipt['status']!='completed' or receipt['unknownInFlight']:raise ValueError('Completed experiment required')
    rows={}
    for arm in ['train','test']:
        manifest,_=read_json(a.repo/f'functions/eval/tier1-public/portion-scale-{arm}-v1.json',receipt[arm+'ManifestSha256'])
        rows[arm]=prediction_rows(manifest,a.experiment/arm)
    verify_profile((a.experiment/'profile.json').read_bytes(),receipt['profileSha256'],{r['id'] for r in rows['train']},{r['id'] for r in rows['test']})
    result={'schema_version':'known-mass-oracle-diagnostic-1','experimentReceiptSha256':receiptsha,'oldBundleSha256':OLD_SHA,
      'development40':diagnose(dev),'freshConfirmation10':diagnose(rows['test']),'training20_diagnostic_only':diagnose(rows['train']),
      'not_used_to_fit_or_select_calibration':True,'extra_sdk_entries':0,'independent_physical_plates':'unknown'}
    write_json(a.output,result)
    print(json.dumps({k:{'raw':v['raw'],'oracle':v['oracle']} for k,v in result.items() if isinstance(v,dict) and 'oracle' in v}))
if __name__=='__main__':main()
