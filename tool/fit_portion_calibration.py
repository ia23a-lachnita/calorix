"""Fit from TRAIN-only manifest and immutable raw receipts; no TEST input."""
import argparse,json
from pathlib import Path
from tool.portion_calibration import fit_scale
from evaluate_public_weighed import read_json

def prediction_rows(manifest,run):
    rows=[]
    for c in manifest['cases']:
        r,digest=read_json(run/(c['id']+'.json'))
        if r['id']!=c['id'] or type(r.get('sdkInvoked')) is not bool:raise ValueError('Receipt identity/invocation mismatch')
        p=r['A1'];pred=None
        if p['status']=='ok':
            if not r['sdkInvoked']:raise ValueError('Success without SDK call')
            pred={**p['predicted'],'massG':p['massG']}
        elif p['status']!='failed' or p['failure'] not in ('no_food','invalid_model_output','dataset_input_failure'):raise ValueError('Systemic/incomplete receipt')
        rows.append({'id':c['id'],'reference':c['reference'],'predicted':pred,'receiptSha256':digest})
    return rows

def main():
    a=argparse.ArgumentParser();a.add_argument('--manifest',type=Path,required=True);a.add_argument('--run-dir',type=Path,required=True);args=a.parse_args()
    manifest,digest=read_json(args.manifest)
    if manifest.get('split')!='official RGB and overhead TRAIN' or manifest['sampleCount']!=20:raise ValueError('Exact TRAIN20 required')
    rows=prediction_rows(manifest,args.run_dir);profile=fit_scale(rows)
    profile.update(trainManifestSha256=digest,trainingReceipts=[{'id':r['id'],'sha256':r['receiptSha256']} for r in rows])
    print(json.dumps(profile,allow_nan=False))
if __name__=='__main__':main()
