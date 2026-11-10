"""Experimental two-parameter mass-only fit. Never a production default."""
import math,re,copy
from tool.portion_calibration import finite,_score,VECTOR
LIMIT=math.log(2)

def fit_mass_power(rows,minimum=16):
    if type(minimum)!=int or minimum<1:raise ValueError('Positive minimum required')
    xs=[];ys=[];seen=set()
    for r in rows:
        if set(r)!={'id','predictedMassG','referenceMassG','rawReceiptSha256'}:raise ValueError('Strict mass-only training row required')
        if not isinstance(r['id'],str) or not r['id'] or r['id'] in seen:raise ValueError('Duplicate/invalid TRAIN ID')
        seen.add(r['id'])
        if not isinstance(r['rawReceiptSha256'],str) or not re.fullmatch('[0-9a-f]{64}',r['rawReceiptSha256']):raise ValueError('Source receipt SHA256 required')
        p=finite(r['predictedMassG']);t=finite(r['referenceMassG'])
        if p<=0 or t<=0:raise ValueError('Positive masses required')
        xs.append(math.log(p)-math.log(200));ys.append(math.log(t)-math.log(p))
    if len(xs)<minimum:raise ValueError('Insufficient positive TRAIN pairs')
    mx=math.fsum(xs)/len(xs);my=math.fsum(ys)/len(ys)
    variance=math.fsum((x-mx)**2 for x in xs)/len(xs)
    covariance=math.fsum((x-mx)*(y-my) for x,y in zip(xs,ys))/len(xs)
    slope=0 if variance<1e-12 else max(-.5,min(.5,covariance/variance))
    intercept=max(-LIMIT,min(LIMIT,my-slope*mx))
    return {'schemaVersion':'mass-power-1','anchorG':200,'bounds':[.5,2],'slopeLog':slope,'interceptLog':intercept,
      'trainingIds':sorted(seen),'selectedTrainingScans':len(rows),'usableTrainingScans':len(xs),'minimumUsable':minimum,
      'fit':'Mass-only log ratio OLS; slope clipped/recentered intercept clipped; fixed bounded estimator, not exact constrained optimum'}

def mass_factor(mass,profile):
    m=finite(mass)
    if m<=0:raise ValueError('Positive predicted mass required')
    if profile.get('schemaVersion')!='mass-power-1' or profile.get('anchorG')!=200 or profile.get('bounds')!=[.5,2]:raise ValueError('Profile contract mismatch')
    a=profile.get('interceptLog');b=profile.get('slopeLog')
    if type(a) not in (float,int) or not math.isfinite(a) or abs(a)>LIMIT or type(b) not in (float,int) or not math.isfinite(b) or abs(b)>.5:raise ValueError('Invalid bounded parameters')
    return math.exp(max(-LIMIT,min(LIMIT,a+b*(math.log(m)-math.log(200)))))

def compare_power(rows,profile):
    transformed=[];factors=[]
    for r in rows:
        p=r['predicted'];new=copy.deepcopy(r)
        if p is not None:
            factor=mass_factor(p['massG'],profile);new['predicted']={k:finite(finite(p[k])*factor) for k in VECTOR};factors.append({'id':r['id'],'factor':factor})
        transformed.append(new)
    raw=_score(rows,1);cal=_score(transformed,1);r=raw['served'];c=cal['served'];valid=bool(raw['scored'])
    guards={'minimum_8_scored':raw['scored']>=8,
      'mae_at_least_10_percent_and_10_kcal':valid and r['mae_kcal']-c['mae_kcal']>=10 and c['mae_kcal']<=.9*r['mae_kcal'],
      'normalized_not_worse':valid and c['mean_normalized_absolute_error']<=r['mean_normalized_absolute_error'],
      'p90_not_worse':valid and c['p90_absolute_error_kcal']<=r['p90_absolute_error_kcal'],
      'absolute_bias_not_worse':valid and abs(c['bias_kcal'])<=abs(r['bias_kcal']),
      'no_additional_failures':cal['failed']==raw['failed'] and cal['coverage']==raw['coverage']}
    for k in ('proteinG','carbsG','fatG'):guards[k+'_mae_within_10_percent']=valid and cal['amounts'][k]['mae']<=1.10*raw['amounts'][k]['mae']
    return {'raw':raw,'calibrated':cal,'factors':factors,'guards':guards,'passes':all(guards.values()),'extra_sdk_entries':0}

def main():
    import argparse,json,hashlib
    from pathlib import Path
    from evaluate_public_weighed import read_json
    p=argparse.ArgumentParser();p.add_argument('--verify-input',type=Path,required=True);p.add_argument('--input-sha256',required=True);p.add_argument('--profile',type=Path,required=True);a=p.parse_args()
    value,_=read_json(a.verify_input,a.input_sha256)
    if set(value)!={'schemaVersion','rows'} or value['schemaVersion']!='mass-only-training-1' or len(value['rows'])!=20:raise ValueError('Exact mass-only TRAIN20 input required')
    expected=fit_mass_power(value['rows']);expected['trainingInputSha256']=a.input_sha256
    profile,_=read_json(a.profile)
    if profile!=expected:raise ValueError('Frozen profile does not reproduce mass-only TRAIN fit')
    print(json.dumps({'verified':True,'usableTrainingScans':expected['usableTrainingScans']}))
if __name__=='__main__':main()
