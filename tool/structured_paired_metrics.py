"""Frozen whole-meal comparison; failures retain denominators, not zero energy."""
import math,re
from collections import Counter
from tool.paired_view_metrics import _metrics

FIELDS=('kcal','massG','proteinG','carbsG','fatG')
TERMINAL={'no_food','invalid_model_output','dataset_input_failure','http_408','http_504'}

def quantity(value,positive=False):
    if type(value) not in (int,float) or not math.isfinite(value) or value<0 or (positive and value<=0):raise ValueError('Finite physical quantity required')
    return value

def point(estimate):
    try:
        parts=estimate['components']
        if not isinstance(parts,list) or not parts:raise ValueError('Complete component estimate required')
        mass=math.fsum(quantity(c['massG'],True) for c in parts)
        totals={k:quantity(estimate['totals'][k]) for k in FIELDS if k!='massG'}
        for key in totals:
            if abs(math.fsum(quantity(c['nutrients'][key]) for c in parts)-totals[key])>1e-8:raise ValueError('Component/meal totals mismatch')
        return {**totals,'massG':quantity(mass,True)}
    except (TypeError,KeyError,AttributeError,OverflowError) as error:raise ValueError('Complete finite estimate required') from error

def score_paired(cases,records,run_status):
    if run_status.get('selected')!=20 or run_status.get('halted') is not False or run_status.get('unknownInFlight') is not False or run_status.get('pending')!=0 or run_status.get('notAttempted')!=0:raise ValueError('Incomplete/systemic run cannot be scored as completed study')
    ids=[c['id'] for c in cases]
    if len(ids)!=20 or len(set(ids))!=20 or set(ids)!=set(records):raise ValueError('Exact twenty-case receipt membership required')
    rows={name:[] for name in ('A1','StructuredRaw','OperationalV2')};details=[];failures={'A1':Counter(),'Structured':Counter()};routing=Counter()
    for case in cases:
        identifier=case['id']
        if not isinstance(identifier,str) or not re.fullmatch(r'nv-dish-(0|[1-9][0-9]*)',identifier) or case.get('physicalMealId')!='nutritionverse-real/dish/'+identifier[8:]:raise ValueError('Canonical physical dish required')
        reference=case['reference']
        if not isinstance(reference,dict) or set(reference)!=set(FIELDS):raise ValueError('Complete original reference required')
        for key in FIELDS:quantity(reference[key],key in ('kcal','massG'))
        count=case.get('sourceFoodItemCount')
        if type(count) is not int or count<1:raise ValueError('Original source food-item count required')
        record=records[identifier]
        if record.get('id')!=identifier or set(record.get('arms',{}))!={'A1','Structured'}:raise ValueError('Both fixed arm receipts required')
        predictions={name:None for name in rows};decision=None
        for name,arm in record['arms'].items():
            if arm.get('status')=='failed':
                if arm.get('failure') not in TERMINAL:raise ValueError('Systemic/incomplete outcome is not a terminal case result')
                failures[name][arm['failure']]+=1;continue
            if arm.get('status')!='ok' or arm.get('failure') is not None:raise ValueError('Completed semantic arm required')
            if name=='A1':predictions['A1']=point(arm['estimate'])
            else:
                predictions['StructuredRaw']=point(arm['receipt']['estimate']);decision=arm['decision']
                if decision.get('status') not in ('applied','fallback'):raise ValueError('Explicit prior/fallback decision required')
                predictions['OperationalV2']=point(decision['estimate']);routing[decision['status']]+=1
        for name,prediction in predictions.items():rows[name].append({'id':identifier,'reference':reference,'predicted':prediction})
        details.append({'id':identifier,'reference':reference,'predictions':predictions,'sourceFoodItemCount':count,'decisionStatus':decision['status'] if decision else 'failed','decisionReason':decision.get('reason') if decision else None})
    routes={name:_metrics(values) for name,values in rows.items()}
    paired=[d for d in details if d['predictions']['A1'] is not None and d['predictions']['OperationalV2'] is not None]
    matched=[d for d in paired if d['decisionStatus']=='applied']
    def subset(ds,name):return _metrics([{'id':d['id'],'reference':d['reference'],'predicted':d['predictions'][name]} for d in ds])
    paired_metrics={'count':len(paired),**{name:subset(paired,name) for name in rows}}
    matched_metrics={'count':len(matched),**{name:subset(matched,name) for name in rows}}
    source_strata={key:{name:subset([d for d in details if (d['sourceFoodItemCount']==1)==single],name) for name in rows} for key,single in [('oneSourceItem',True),('multipleSourceItems',False)]}
    a=routes['A1'];b=routes['OperationalV2'];complete=a['scored']==b['scored']==len(paired)==20
    guards={'all20PairsValid':complete,'maeAtLeast10PercentBetter':complete and a['served']['mae_kcal']>0 and b['served']['mae_kcal']<=.9*a['served']['mae_kcal'],'coverageNonworse':b['coverage']>=a['coverage']}
    for field in ('median_absolute_error_kcal','p90_absolute_error_kcal','mean_normalized_absolute_error'):guards[field+'Nonworse']=complete and b['served'][field]<=a['served'][field]
    guards['absoluteBiasNonworse']=complete and abs(b['served']['bias_kcal'])<=abs(a['served']['bias_kcal'])
    deltas=[abs(d['predictions']['OperationalV2']['kcal']-d['reference']['kcal'])-abs(d['predictions']['A1']['kcal']-d['reference']['kcal']) for d in paired]
    paired_metrics.update(improved=sum(d<0 for d in deltas),worsened=sum(d>0 for d in deltas),tied=sum(d==0 for d in deltas))
    return {'routes':routes,'pairedValid':paired_metrics,'matchedPrior':matched_metrics,'sourceItemStrata':source_strata,'routing':dict(routing),'failures':{name:dict(c) for name,c in failures.items()},'cases':details,'screen':{'guards':guards,'passes':all(guards.values())},'normalizedDenominatorFloorKcal':200,'productionPromotable':False,'scope':'ProjectunusedNVphotos; knownmetadata/publicandmodeltrainingexposureunknown; originalauthorrecipe-derivedreferences; no Android/clinical/universal accuracy claim','consumedReference':None}
