"""Offline scores for published weighed scans, with explicit correction links.

A link is an operator attestation, not independent proof of image identity or
blinding. These trials start from imported frozen estimates, not live capture.
"""
import argparse
from collections import Counter
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import re
from evaluate_meals import metrics,number,quantile
from evaluate_workflows import validate_export

VECTOR=('kcal','massG','proteinG','carbsG','fatG')
HASH=re.compile(r'^[0-9a-f]{64}$')
MODES={'reference_blind_user','diagnostic','oracle'}


def read_json(path,expected_sha256=None):
    path=Path(path)
    with path.open('rb') as handle:raw=handle.read(8*1024*1024+1)
    if len(raw)>8*1024*1024:raise ValueError('Input exceeds 8 MiB bound')
    digest=hashlib.sha256(raw).hexdigest()
    if expected_sha256 is not None and digest!=expected_sha256:raise ValueError('Pinned input SHA256 mismatch')
    return json.loads(raw),digest


def write_json(path,value):
    text=json.dumps(value,sort_keys=True,indent=2,allow_nan=False)+'\n'
    with Path(path).open('x') as handle:handle.write(text)


def _hash(value):
    if not isinstance(value,str) or not HASH.fullmatch(value):raise ValueError('SHA256 required')


def _vector(value,mass=True):
    keys=VECTOR if mass else tuple(k for k in VECTOR if k!='massG')
    if not isinstance(value,dict) or set(value)!=set(keys):raise ValueError('Complete reference vector required')
    for key in keys:number(value[key],key,positive=key=='massG')


def validate_bundle(bundle):
    if not isinstance(bundle,dict) or bundle.get('schema_version')!='public-weighed-1' or bundle.get('scope') not in {'frozen_existing_40_public_scans','custom_pinned_inputs'}:raise ValueError('Unsupported public reference bundle')
    _hash(bundle.get('source_index_sha256'))
    cases=bundle.get('cases')
    if not isinstance(cases,list) or len(cases)>1000 or (bundle['scope']=='frozen_existing_40_public_scans' and len(cases)!=40):raise ValueError('Invalid public case count')
    seen=set()
    for case in cases:
        identity=case.get('id')
        if not isinstance(identity,str) or not re.fullmatch(r'dish_[0-9]{10}',identity) or identity in seen:raise ValueError('Duplicate/invalid scan ID')
        seen.add(identity);date.fromisoformat(case['captureDate'])
        if not isinstance(case.get('cohort'),str) or not case['cohort']:raise ValueError('Cohort required')
        for key in ['inputSha256','receiptSha256','rowFieldsSha256']:_hash(case.get(key))
        _vector(case['reference']);ingredients=case.get('ingredients')
        if not isinstance(ingredients,list) or not ingredients or len(ingredients)>100:raise ValueError('Measured ingredient vectors required')
        names=set()
        for ingredient in ingredients:
            if not isinstance(ingredient.get('id'),str) or not ingredient['id'] or ingredient['id'] in names:raise ValueError('Duplicate/invalid ingredient ID')
            names.add(ingredient['id']);_vector({k:ingredient[k] for k in VECTOR})
        for key in VECTOR:
            if abs(sum(i[key] for i in ingredients)-case['reference'][key])>.001:raise ValueError('Published ingredient/aggregate closure mismatch')
        if set(case.get('predictions',{}))!={'A0','A1'}:raise ValueError('Both original baseline routes required')
        for p in case['predictions'].values():
            if p.get('status') not in ('ok','failed','abstained'):raise ValueError('Invalid prediction status')
            if p.get('predicted') is not None:_vector(p['predicted'],mass=False)
            if p.get('massG') is not None:number(p['massG'],'predicted mass',positive=True)
            if p['status']=='ok' and (p.get('predicted') is None or p.get('massG') is None):raise ValueError('Successful prediction needs mass and nutrients')
        for key in ['latencyMs','costUsd']:
            if case.get(key) is not None:number(case[key],key)
        if type(case.get('questionProposed')) is not bool:raise ValueError('Question flag required')
        provenance=case.get('provenance')
        if not isinstance(provenance,dict) or not all(isinstance(provenance.get(k),str) and provenance[k] for k in ['model','catalogVersion','sourceCommit']):raise ValueError('Original provenance required')
        for key in ['promptSha256','schemaSha256']:_hash(provenance.get(key))
    return cases


def _kcal(pairs):
    result=metrics(pairs);result['scored_scans']=result.pop('scored_meals');return result


def _amount(pairs):
    errors=[a-b for a,b in pairs]
    return {'scored_scans':len(errors),'mae':sum(map(abs,errors))/len(errors) if errors else None,
            'bias':sum(errors)/len(errors) if errors else None,'p90_absolute_error':quantile([abs(e) for e in errors],.9)}


def _route(cases,route):
    ok=[c for c in cases if c['predictions'][route]['status']=='ok']
    def kcal(rows):return _kcal([(c['predictions'][route]['predicted']['kcal'],c['reference']['kcal']) for c in rows])
    counts=Counter(c['predictions'][route]['status'] for c in cases)
    return {'eligible_attempts':len(cases),'automatic_answers':len(ok),'coverage':len(ok)/len(cases) if cases else 0,
        'failed':counts['failed'],'abstained':counts['abstained'],'served':kcal(ok),
        'mass_g':_amount([(c['predictions'][route]['massG'],c['reference']['massG']) for c in ok]),
        'macros_g':{k:_amount([(c['predictions'][route]['predicted'][k],c['reference'][k]) for c in ok]) for k in ['proteinG','carbsG','fatG']},
        'energy_bins':{'under_200':kcal([c for c in ok if c['reference']['kcal']<200]),
            '200_to_600':kcal([c for c in ok if 200<=c['reference']['kcal']<=600]),'over_600':kcal([c for c in ok if c['reference']['kcal']>600])},
        'ingredient_count_proxy':{'one_ingredient':kcal([c for c in ok if len(c['ingredients'])==1]),'multiple_ingredients':kcal([c for c in ok if len(c['ingredients'])>1])}}


def benchmark(bundle):
    cases=validate_bundle(bundle);paired=[c for c in cases if all(c['predictions'][r]['status']=='ok' for r in ['A0','A1'])]
    residual={k:max((abs(sum(i[k] for i in c['ingredients'])-c['reference'][k]) for c in cases),default=0) for k in VECTOR}
    latencies=[c['latencyMs'] for c in cases if c['latencyMs'] is not None]
    return {'schema_version':'public-weighed-report-1','scope':bundle['scope'],'public_scans':len(cases),
        'capture_dates':len({c['captureDate'] for c in cases}),'independent_physical_plates':None,
        'reference_basis':'Published weighed masses and recipe/USDA-derived nutrients; aggregate retained unchanged',
        'routes':{r:_route(cases,r) for r in ['A0','A1']},'paired':{r:_route(paired,r)['served'] for r in ['A0','A1']},
        'cohorts':{name:{r:_route([c for c in cases if c['cohort']==name],r) for r in ['A0','A1']} for name in sorted({c['cohort'] for c in cases})},
        'question_proposals':sum(c['questionProposed'] for c in cases),'max_absolute_closure_residual':residual,
        'raw_sdk_latency_ms':{'measured':len(latencies),'p50':quantile(latencies,.5),'p90':quantile(latencies,.9)},
        'cost_usd_total':sum(c['costUsd'] for c in cases) if cases and all(c['costUsd'] is not None for c in cases) else None,
        'gold_mixed_dish_breakdown':None,'consumed_accuracy':None,'actual_active_user_ms':None,
        'interpretation':'Exposed development scans from separate original baseline runs; no new inference, independent-plate, Android-transfer or correction-benefit claim. Ingredient counts are not gold mixed-dish labels.'}


def _paired(rows):
    before=_kcal([(r['before'],r['reference']) for r in rows]);after=_kcal([(r['after'],r['reference']) for r in rows])
    return {'scored_scans':len(rows),'before':before,'after':after,
        'mean_absolute_error_reduction_kcal':before['mae_kcal']-after['mae_kcal'] if rows else None}


def score_corrections(workflow,bundle,links):
    cases={c['id']:c for c in validate_bundle(bundle)};exported=validate_export(workflow)
    if not isinstance(links,dict) or set(links)!={'schema_version','links'} or links['schema_version']!='public-workflow-links-1' or not isinstance(links['links'],list):raise ValueError('Explicit public workflow links required')
    by_meal={};scan_ids=set()
    keys={'mealId','scanId','inputSha256','receiptSha256','mode'}
    for link in links['links']:
        if not isinstance(link,dict) or set(link)!=keys or not isinstance(link['mealId'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',link['mealId']):raise ValueError('Invalid explicit link fields')
        if not isinstance(link['scanId'],str) or link['scanId'] not in cases or not isinstance(link['mode'],str) or link['mode'] not in MODES:raise ValueError('Unknown scan or attestation mode')
        if link['mealId'] in by_meal or link['scanId'] in scan_ids:raise ValueError('Links must have unique meals and scans')
        case=cases[link['scanId']]
        if any(link[k]!=case[k] for k in ['inputSha256','receiptSha256']):raise ValueError('Linked image/receipt hash mismatch')
        by_meal[link['mealId']]=link;scan_ids.add(link['scanId'])
    reasons=Counter();selected=[];durations=[]
    mutations={'food_saved','portion_saved','preparation_answered','manual_saved','analysis_saved'}
    for identity,row in exported.items():
        link=by_meal.get(identity)
        if link is None:reasons['missing_link']+=1;continue
        if link['mode']!='reference_blind_user':reasons[link['mode']]+=1;continue
        if not workflow['measurementEnabled'] or workflow['currentProcessWriteFailures'] or row['readFailure'] or row['missingMeasurements'] or row['truncated']:
            reasons['incomplete_measurements']+=1;continue
        case=cases[link['scanId']];baseline=case['predictions']['A1']
        first=next((e for e in row['events'] if e['kind'] in mutations),None)
        if baseline['status']!='ok' or first is None or first['kind'] not in {'food_saved','portion_saved'}:
            reasons['no_initial_correction']+=1;continue
        if first.get('afterNavigation') or first.get('beforeKcal') is None or first.get('afterKcal') is None or abs(first['beforeKcal']-baseline['predicted']['kcal'])>1e-6:
            reasons['baseline_or_navigation_mismatch']+=1;continue
        kind=first['kind']
        if kind=='portion_saved' and not (first.get('beforeFromOriginalAnalysis') is True and first.get('priorPortionAdjustmentCount')==0 and first.get('fromG') is not None and first.get('toG') is not None and first['fromG']!=first['toG']):
            reasons['not_initial_portion']+=1;continue
        selected.append({'mealId':identity,'scanId':case['id'],'type':'portion_only' if kind=='portion_saved' else 'food_assisted',
            'before':first['beforeKcal'],'after':first['afterKcal'],'reference':case['reference']['kcal']})
        if first.get('dialogForegroundMs') is not None:durations.append(first['dialogForegroundMs'])
    return {'schema_version':'public-workflow-report-1','link_assurance':'Operator attestation only; image identity, imported baseline and reference blinding are not independently proven',
        'coverage':{'reference_scans':len(cases),'exported_meals':len(exported),'links':len(by_meal),'exports_without_link':len(exported.keys()-by_meal.keys()),'links_without_export':len(by_meal.keys()-exported.keys()),'scored_scans':len(selected)},
        'exclusion_reasons':dict(reasons),'portion_only':_paired([r for r in selected if r['type']=='portion_only']),
        'food_assisted':_paired([r for r in selected if r['type']=='food_assisted']),'pairs':selected,
        'dialog_foreground_proxy_ms':{'measured':len(durations),'p50':quantile(durations,.5),'p90':quantile(durations,.9)},
        'actual_active_user_ms':None,'consumed_accuracy':None,'cost_usd':None,
        'interpretation':'Conditional first edits to imported frozen baselines. Diagnostic/oracle links excluded. No live-capture analysis stream or authenticated human-benefit claim.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('bundle',type=Path);parser.add_argument('--bundle-sha256',required=True)
    parser.add_argument('--workflow',type=Path);parser.add_argument('--links',type=Path);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();bundle,digest=read_json(args.bundle,args.bundle_sha256)
    if (args.workflow is None)!=(args.links is None):parser.error('--workflow and --links must be supplied together')
    result={'bundle_sha256':digest,'baseline':benchmark(bundle)}
    if args.workflow is not None:result['corrections']=score_corrections(read_json(args.workflow)[0],bundle,read_json(args.links)[0])
    write_json(args.output,result)


if __name__=='__main__':main()
