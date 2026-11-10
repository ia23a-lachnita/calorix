"""Same-meal paired metrics with fixed attempt and paired-valid denominators."""
import statistics
from tool.portion_calibration import _score,finite,VECTOR

def _prediction(answer):
 if answer.get('status')=='failed':
  if answer.get('failure') not in ('no_food','invalid_model_output','dataset_input_failure'):raise ValueError('Systemic/incomplete failure cannot be scored as completed study')
  return None
 if answer.get('status')!='ok':raise ValueError('Completed arm required')
 p={**answer['predicted'],'massG':answer['massG']}
 for k in VECTOR:finite(p[k])
 if p['massG']<=0:raise ValueError('Positive predicted mass required')
 return p

def _metrics(rows):
 score=_score(rows,1);errors=[abs(r['predicted']['kcal']-r['reference']['kcal']) for r in rows if r['predicted'] is not None];score['served']['median_absolute_error_kcal']=statistics.median(errors) if errors else None
 return score

def summarize_pairs(cases,rows):
 ids=[c['id'] for c in cases]
 if len(set(ids))!=len(ids) or set(ids)!=set(rows):raise ValueError('Exact unique case/receipt membership required')
 arms={'single':[],'paired':[]};paired={'single':[],'paired':[]};details=[]
 for c in cases:
  if set(rows[c['id']])!={'single','paired'}:raise ValueError('Both fixed arms required')
  pred={a:_prediction(rows[c['id']][a]) for a in arms};detail={'id':c['id'],'auditRole':c['auditRole'],'singleStatus':rows[c['id']]['single']['status'],'pairedStatus':rows[c['id']]['paired']['status'],
   'deltaAbsoluteKcalTwoMinusOne':None,'deltaAbsoluteMassGTwoMinusOne':None,'macroAbsoluteErrorDeltasG':None}
  for arm in arms:
   row={'id':c['id'],'reference':c['reference'],'predicted':pred[arm]};arms[arm].append(row)
   if all(pred.values()):paired[arm].append(row)
  if all(pred.values()):
   error=lambda arm,key:pred[arm][key]-c['reference'][key]
   detail.update(reference=c['reference'],single=pred['single'],paired=pred['paired'],singleErrorKcal=error('single','kcal'),pairedErrorKcal=error('paired','kcal'),
    deltaAbsoluteKcalTwoMinusOne=abs(error('paired','kcal'))-abs(error('single','kcal')),deltaAbsoluteMassGTwoMinusOne=abs(error('paired','massG'))-abs(error('single','massG')),
    macroAbsoluteErrorDeltasG={k:abs(error('paired',k))-abs(error('single',k)) for k in ('proteinG','carbsG','fatG')})
  details.append(detail)
 deltas=[r['deltaAbsoluteKcalTwoMinusOne'] for r in details if r['deltaAbsoluteKcalTwoMinusOne'] is not None]
 return {'selectedCases':len(cases),'allAttempts':{a:_metrics(arms[a]) for a in arms},
  'pairedValid':{'scoredPairs':len(deltas),**{a:_metrics(paired[a]) for a in paired},'improved':sum(d<0 for d in deltas),'worsened':sum(d>0 for d in deltas),'tied':sum(d==0 for d in deltas)},
  'cases':details,'productionPromotable':False,'representativeAccuracy':False,
  'interpretation':'Outcome-selected development probe. Negative paired absolute-error delta favors added view. All fixed cases/failures remain in coverage; paired comparisons use identical valid cases. Small-N P90 descriptive only, no confidence/significance/causal geometry/transfer claim.'}
