"""Score a completed locked experiment without any model calls."""
import argparse,hashlib,json
from pathlib import Path
from evaluate_public_weighed import read_json,write_json,validate_bundle
from tool.fit_portion_calibration import prediction_rows
from tool.portion_calibration import compare,fit_scale

OLD_SHA='0b78b33438d7b3c66647a0a2403b7f4686909be5a47e50b936a590bf84b2bea6'

def verify_profile(raw,digest,train_ids,test_ids):
    if hashlib.sha256(raw).hexdigest()!=digest:raise ValueError('Locked profile hash mismatch')
    p=json.loads(raw)
    if set(p['training_ids'])!=train_ids or train_ids&test_ids or len(p['training_ids'])!=len(train_ids):raise ValueError('Profile training IDs mismatch or test leakage')
    if p['selected_training_scans']!=20 or p['usable_training_scans']<16:raise ValueError('Insufficient training profile')
    if type(p['scale']) not in (int,float) or not .5<=p['scale']<=2:raise ValueError('Invalid scale')
    return p

def main():
    a=argparse.ArgumentParser();a.add_argument('--experiment',type=Path,required=True);a.add_argument('--output',type=Path,required=True);a.add_argument('--repo',type=Path,default=Path.cwd());args=a.parse_args()
    root=args.experiment;receipt,receiptsha=read_json(root/'experiment.json')
    if receipt['status']!='completed' or receipt['unknownInFlight'] or receipt['completedSdkEntries']>31 or receipt['maxSdkEntries']!=31:raise ValueError('Completed bounded experiment required')
    base=args.repo/'functions/eval/tier1-public';manifests={};rows={}
    for arm in ['train','test']:
        manifests[arm],_=read_json(base/f'portion-scale-{arm}-v1.json',receipt[arm+'ManifestSha256'])
        rows[arm]=prediction_rows(manifests[arm],root/arm)
    raw=(root/'profile.json').read_bytes();profile=verify_profile(raw,receipt['profileSha256'],{c['id'] for c in rows['train']},{c['id'] for c in rows['test']})
    fit=fit_scale(rows['train'])
    if fit['scale']!=profile['scale'] or fit['usable_training_scans']!=profile['usable_training_scans']:raise ValueError('Profile does not reproduce TRAIN fit')
    if profile['trainingReceipts']!=[{'id':r['id'],'sha256':r['receiptSha256']} for r in rows['train']]:raise ValueError('TRAIN receipt pin mismatch')
    old,_=read_json(args.repo/'docs/tier1-public-weighed-2026-11-10/bundle.json',OLD_SHA);validate_bundle(old)
    dev=[{'id':r['id'],'reference':r['reference'],'predicted':({**r['predictions']['A1']['predicted'],'massG':r['predictions']['A1']['massG']} if r['predictions']['A1']['status']=='ok' else None)} for r in old['cases']]
    development=compare(dev,profile['scale']);confirmation=compare(rows['test'],profile['scale'])
    result={'schema_version':'portion-calibration-result-1','engineCommit':receipt['engineCommit'],'experimentReceiptSha256':receiptsha,'profileSha256':receipt['profileSha256'],
        'oldDevelopmentBundleSha256':OLD_SHA,'scale':profile['scale'],'train':fit,'development40':development,'freshConfirmation10':confirmation,
        'passes_both':development['passes'] and confirmation['passes'],'sdk_entries':receipt['completedSdkEntries'],'extra_sdk_entries_for_calibration':0,
        'consumed_reference_meals':0,'android_weighed_meals':0,'independent_physical_plates':'unknown','inference_cost_usd':None,
        'interpretation':'Engineering guard thresholds, not statistical or clinical significance. Pretraining exposure unknown; old40 exposed development; new confirmation labels not used in fit.',
        'confirmation_cases':rows['test']}
    write_json(args.output,result)
    print(json.dumps({'scale':profile['scale'],'passes_both':result['passes_both'],'development':development['guards'],'confirmation':confirmation['guards']}))
if __name__=='__main__':main()
