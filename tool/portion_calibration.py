"""Small, offline, TRAIN-only calibration. Never called by production inference."""
import hashlib
import math
from evaluate_meals import metrics,quantile

VECTOR=('kcal','massG','proteinG','carbsG','fatG')

def finite(value):
    if type(value) not in (int,float) or not math.isfinite(value) or value<0:raise ValueError('Finite nonnegative number required')
    return value

def select_stratified(rows,split_ids,excluded_ids,excluded_dates,strata,seed,meal_range=False):
    if len({r['id'] for r in rows})!=len(rows):raise ValueError('Duplicate metadata ID')
    result=[];used=set(excluded_dates)
    def rank(value):return (hashlib.sha256((seed+'|'+value).encode()).hexdigest(),value)
    for band,count in strata:
        if band not in ('low','mid','high') or type(count)!=int or count<1:raise ValueError('Invalid fixed stratum')
        pool={}
        for row in rows:
            e=finite(row['reference']['kcal']);m=finite(row['reference']['massG'])
            actual='low' if e<200 else 'mid' if e<=600 else 'high'
            if row['id'] not in split_ids or row['id'] in excluded_ids or row['captureDate'] in used or e<=0 or e>1200 or m<=0 or actual!=band:continue
            if meal_range and (m<150 or len(row['ingredients'])<2):continue
            pool.setdefault(row['captureDate'],[]).append(row)
        if len(pool)<count:raise ValueError('Insufficient distinct dates in '+band)
        for date in sorted(pool,key=rank)[:count]:
            result.append(min(pool[date],key=lambda r:rank(date+'|'+r['id'])));used.add(date)
    return result

def fit_scale(rows,minimum=16):
    if type(minimum)!=int or minimum<1:raise ValueError('Positive minimum required')
    ratios=[];seen=set()
    for row in rows:
        if not isinstance(row['id'],str) or row['id'] in seen:raise ValueError('Duplicate/invalid training ID')
        seen.add(row['id']);ref=finite(row['reference']['kcal']);p=row['predicted']
        if p is None:continue
        pred=finite(p['kcal'])
        if pred==0:continue
        ratio=ref/pred
        if not math.isfinite(ratio):raise ValueError('Invalid ratio')
        ratios.append((ratio,pred,row['id']))
    if len(ratios)<minimum:raise ValueError('Insufficient valid positive TRAIN predictions')
    ratios.sort();total=math.fsum(r[1] for r in ratios)
    if not math.isfinite(total):raise ValueError('Overflow')
    acc=0
    for i,(ratio,weight,_) in enumerate(ratios):
        acc+=weight
        if acc>=total/2:
            upper=ratios[i+1][0] if acc==total/2 and i+1<len(ratios) else ratio
            scale=max(.5,min(2,max(ratio,min(1,upper))))
            break
    return {'schema_version':'portion-scale-1','scale':scale,'bounds':[.5,2],
            'fit':'TRAIN weighted median(ref/pred), weights=pred; median interval nearest1; then clamp',
            'training_ids':sorted(seen),'selected_training_scans':len(rows),'usable_training_scans':len(ratios),
            'excluded_training_scans':len(rows)-len(ratios),'minimum_usable':minimum}

def _score(rows,scale):
    pairs=[];amounts={k:[] for k in VECTOR if k!='kcal'};seen=set()
    for r in rows:
        if r['id'] in seen:raise ValueError('Duplicate evaluation ID')
        seen.add(r['id'])
        for k in VECTOR:finite(r['reference'][k])
        if r['predicted'] is None:continue
        p={k:finite(finite(r['predicted'][k])*scale) for k in VECTOR}
        pairs.append((p['kcal'],r['reference']['kcal']))
        for k in amounts:amounts[k].append(p[k]-r['reference'][k])
    return {'selected':len(rows),'scored':len(pairs),'failed':len(rows)-len(pairs),'coverage':len(pairs)/len(rows) if rows else 0,
            'served':metrics(pairs), 'amounts':{k:{'mae':math.fsum(map(abs,es))/len(es) if es else None,
              'bias':math.fsum(es)/len(es) if es else None,'p90_absolute_error':quantile([abs(e) for e in es],.9)} for k,es in amounts.items()}}

def compare(rows,scale):
    if not .5<=finite(scale)<=2:raise ValueError('Scale outside fixed bounds')
    raw=_score(rows,1);cal=_score(rows,scale);r=raw['served'];c=cal['served'];valid=bool(raw['scored'])
    guards={'minimum_8_scored':raw['scored']>=8,
      'mae_at_least_10_percent_and_10_kcal':valid and r['mae_kcal']-c['mae_kcal']>=10 and c['mae_kcal']<=.9*r['mae_kcal'],
      'normalized_not_worse':valid and c['mean_normalized_absolute_error']<=r['mean_normalized_absolute_error'],
      'p90_not_worse':valid and c['p90_absolute_error_kcal']<=r['p90_absolute_error_kcal'],
      'absolute_bias_not_worse':valid and abs(c['bias_kcal'])<=abs(r['bias_kcal']),
      'no_additional_failures':cal['failed']==raw['failed'] and cal['coverage']==raw['coverage']}
    for k in ('proteinG','carbsG','fatG'):guards[k+'_mae_within_10_percent']=valid and cal['amounts'][k]['mae']<=1.10*raw['amounts'][k]['mae']
    return {'scale':scale,'raw':raw,'calibrated':cal,'guards':guards,'passes':all(guards.values()),
            'extra_sdk_calls_for_transform':0,'confidence_intervals':None}
