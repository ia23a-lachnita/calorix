"""Offline, conditional first-correction pairs; no inference or invented references."""
import argparse
from collections import Counter
from datetime import datetime, timedelta
import json
import re
from pathlib import Path
from evaluate_meals import keyed, metrics, number, quantile, reference_energy

KINDS=set('editor_opened editor_closed analysis_started analysis_returned analysis_saved analysis_failed analysis_discarded result_frame preparation_available preparation_answered portion_opened portion_rejected portion_cancelled portion_unchanged portion_saved portion_conflict portion_failed manual_saved repeat_saved export_opened export_closed'.split())
BASE={'kind','sessionId','sequence','atUtc','timingValid','elapsedMs','foregroundMs','waitingMs'}
TIMES={'dialogForegroundMs','clientAnalysisMs','shutterToResponseMs','shutterToSavedMs','shutterToFrameMs'}
NUMBERS={'beforeKcal','afterKcal','fromG','toG'}
COUNTS={'portionIndex','priorPortionAdjustmentCount'}
BOOLS={'beforeFromOriginalAnalysis','questionProposed','afterNavigation'}
EXTRA=TIMES|NUMBERS|COUNTS|BOOLS|{'model','promptSha256','answerCode'}
MAX_MS=365*24*60*60*1000


def shape(value,allowed,required):
    if not isinstance(value,dict) or not required<=set(value) or set(value)-allowed:
        raise ValueError('Unsupported or incomplete workflow fields')


def integer(value,name,maximum=MAX_MS):
    if type(value) is not int or not 0<=value<=maximum:raise ValueError(name+': bounded integer required')


def utc(value):
    try:
        d=datetime.fromisoformat(value)
        if d.utcoffset()!=timedelta(0):raise ValueError('UTC required')
    except (TypeError,ValueError):raise ValueError('UTC timestamp required') from None


def event_valid(event):
    shape(event,BASE|EXTRA,BASE)
    if event['kind'] not in KINDS or not isinstance(event['sessionId'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',event['sessionId']):raise ValueError('Invalid event identity')
    integer(event['sequence'],'sequence',2**53-1);utc(event['atUtc'])
    if type(event['timingValid']) is not bool:raise ValueError('Timing-valid flag required')
    for key in ['elapsedMs','foregroundMs','waitingMs']:
        if event['timingValid']:integer(event[key],key)
        elif event[key] is not None:raise ValueError('Invalid timing must remain null')
    if event['timingValid'] and not event['waitingMs']<=event['foregroundMs']<=event['elapsedMs']:raise ValueError('Inconsistent timing')
    for key in TIMES&event.keys():
        if event[key] is not None:
            if not event['timingValid']:raise ValueError('Invalid duration must remain null')
            integer(event[key],key)
    for key in NUMBERS&event.keys():
        if event[key] is not None:number(event[key],key,maximum=100000 if key in {'fromG','toG'} else 1000000)
    for key in COUNTS&event.keys():integer(event[key],key,19 if key=='portionIndex' else 2**53-1)
    for key in BOOLS&event.keys():
        if type(event[key]) is not bool:raise ValueError('Boolean event field required')
    if 'model' in event and (not isinstance(event['model'],str) or not re.fullmatch(r'gemini-[a-z0-9][a-z0-9.-]{0,79}',event['model'])):raise ValueError('Invalid model ID')
    if 'promptSha256' in event and (not isinstance(event['promptSha256'],str) or not re.fullmatch('[0-9a-f]{64}',event['promptSha256'])):raise ValueError('Invalid prompt hash')
    if 'answerCode' in event and event['answerCode'] not in {'none','oil_5g','oil_10g','oil_15g'}:raise ValueError('Invalid answer code')


def validate_export(data):
    keys={'schemaVersion','scope','exportedAtUtc','referenceIsWeighed','timingDefinition','measurementEnabled','currentProcessWriteFailures','meals'}
    shape(data,keys,keys)
    if type(data['schemaVersion']) is not int or data['schemaVersion']!=1 or data['scope']!='currently_retained_meals' or data['referenceIsWeighed'] is not False or data['timingDefinition']!='editor_foreground_minus_analysis_wait_proxy_v1' or type(data['measurementEnabled']) is not bool:raise ValueError('Unsupported workflow export')
    utc(data['exportedAtUtc']);integer(data['currentProcessWriteFailures'],'write failures',2**53-1)
    if not isinstance(data['meals'],list):raise ValueError('Expected meal list')
    rows=keyed(data['meals'],'mealId')
    row_keys={'mealId','source','currentServedKcal','events','missingMeasurements','readFailure','droppedEvents','truncated'}
    for identity,row in rows.items():
        shape(row,row_keys,row_keys)
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',identity) or row['source'] not in {'manual','photo','A1','manual_correction','portion_correction','confirmed_repeat','unknown'}:raise ValueError('Invalid meal identity/source')
        if row['currentServedKcal'] is not None:number(row['currentServedKcal'],'current kcal',maximum=1000000)
        if type(row['missingMeasurements']) is not bool or type(row['readFailure']) is not bool:raise ValueError('Unknown log status')
        if row['droppedEvents'] is not None:integer(row['droppedEvents'],'dropped events',2**53-1)
        if row['truncated'] is not None and type(row['truncated']) is not bool:raise ValueError('Invalid truncation flag')
        if not row['missingMeasurements'] and not row['readFailure']:
            if row['droppedEvents'] is None or row['truncated']!=(row['droppedEvents']>0):raise ValueError('Inconsistent truncation')
        if not isinstance(row['events'],list) or len(row['events'])>256:raise ValueError('Invalid bounded event list')
        sequences={}
        for event in row['events']:
            event_valid(event)
            if event['sequence']<=sequences.get(event['sessionId'],-1):raise ValueError('Duplicate/out-of-order session sequence')
            sequences[event['sessionId']]=event['sequence']
    return rows


def paired(rows):
    before=metrics([(p['before'],p['reference']) for p in rows]);after=metrics([(p['after'],p['reference']) for p in rows])
    return {'scored_meals':len(rows),'before':before,'after':after,
        'mean_absolute_error_reduction_kcal':before['mae_kcal']-after['mae_kcal'] if rows else None}


def evaluate_workflows(workflow,references):
    exported=validate_export(workflow)
    if not isinstance(references,dict) or references.get('schema_version')!='1.0' or not isinstance(references.get('meals'),list):raise ValueError('Expected separate meal_schema references')
    ref_rows=keyed(references['meals'],'meal_id');keyed(references['meals'],'physical_meal_id')
    refs={identity:reference_energy(row)['served_kcal'] for identity,row in ref_rows.items()}
    coverage={'reference_meals':len(refs),'exported_meals':len(exported),
        'references_without_export':len(refs.keys()-exported.keys()),'exports_without_reference':len(exported.keys()-refs.keys()),
        'unscorable_reference_meals':sum(v is None for v in refs.values()),'incomplete_measurement_meals':0,
        'meals_without_eligible_initial_correction':0,'later_portion_adjustments':0,'current_process_write_failures':workflow['currentProcessWriteFailures']}
    reasons=Counter();selected=[];durations=[];action_counts=Counter()
    for identity,row in exported.items():
        action_counts.update(e['kind'] for e in row['events'])
        if row['readFailure'] or row['missingMeasurements'] or row['truncated']:
            coverage['incomplete_measurement_meals']+=1;reasons['incomplete_measurements']+=1;continue
        corrections=[e for e in row['events'] if e['kind']=='portion_saved']
        coverage['later_portion_adjustments']+=max(0,len(corrections)-1)
        first=corrections[0] if corrections else None
        eligible=(workflow['measurementEnabled'] and first is not None and first.get('beforeFromOriginalAnalysis') is True and
            first.get('priorPortionAdjustmentCount')==0 and all(first.get(k) is not None for k in ['beforeKcal','afterKcal','fromG','toG']) and first['fromG']!=first['toG'])
        if not eligible:
            coverage['meals_without_eligible_initial_correction']+=1;reasons['no_eligible_initial_correction']+=1;continue
        if first.get('dialogForegroundMs') is not None:durations.append(first['dialogForegroundMs'])
        if identity not in refs:reasons['missing_reference']+=1;continue
        if refs[identity] is None:reasons['unscorable_reference']+=1;continue
        selected.append({'meal_id':identity,'grade':ref_rows[identity]['reference_served_grade'],
            'reference':refs[identity],'before':first['beforeKcal'],'after':first['afterKcal']})
    primary=[p for p in selected if p['grade']=='A'];sensitivity=[p for p in selected if p['grade'] in {'A','B'}]
    a=sum(row['reference_served_grade']=='A' and refs[i] is not None for i,row in ref_rows.items())
    ab=sum(row['reference_served_grade'] in {'A','B'} and refs[i] is not None for i,row in ref_rows.items())
    coverage['paired_served_A_coverage']=len(primary)/a if a else 0
    coverage['paired_served_A_B_coverage']=len(sensitivity)/ab if ab else 0
    return {'schema_version':'1.0','scope':'Conditional first-correction pairs on currently retained exported meals; not all-time attempts or population accuracy',
        'coverage':coverage,'exclusion_reasons':dict(reasons),'action_counts':dict(action_counts),
        'paired_served_A':paired(primary),'paired_served_A_B':paired(sensitivity),'pairs':selected,
        'timing':{'portion_dialog_foreground_proxy_ms':{'measured':len(durations),'p50':quantile(durations,.5),'p90':quantile(durations,.9)},
            'definition':'Foreground dialog duration includes reading/idle/animations; excludes background; not validated touch-active time. Timing can be measured without reference availability.',
            'actual_active_user_ms':None},'consumed_accuracy':None,'cost_usd':None,
        'interpretation':'Separate weighed references required. A repeated/unverified estimate is not reference truth. Synthetic fixtures validate arithmetic only.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('workflow',type=Path);parser.add_argument('references',type=Path);parser.add_argument('--output',type=Path)
    args=parser.parse_args();result=evaluate_workflows(json.loads(args.workflow.read_text()),json.loads(args.references.read_text()))
    text=json.dumps(result,indent=2,allow_nan=False)+'\n'
    if args.output:
        with args.output.open('x') as handle:handle.write(text)
    else:print(text,end='')


if __name__=='__main__':main()
