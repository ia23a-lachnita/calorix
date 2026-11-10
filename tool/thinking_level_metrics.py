"""Fixed same-case LOW/HIGH thinking comparison; no claim of deployed accuracy."""
from tool.paired_view_metrics import _prediction,_metrics

def summarize_thinking(cases,rows):
 ids=[c['id'] for c in cases]
 if len(ids)!=10 or len(set(ids))!=10 or set(ids)!=set(rows):raise ValueError('Exact ten unique fixed cases required')
 arms={a:[] for a in ('low','high')};paired={a:[] for a in arms};details=[]
 for c in cases:
  if set(rows[c['id']])!=set(arms):raise ValueError('Both fixed arms required')
  p={a:_prediction(rows[c['id']][a]) for a in arms};d={'id':c['id'],'reference':c['reference'],'low':p['low'],'high':p['high'],'deltaAbsoluteKcalHighMinusLow':None,'deltaAbsoluteMassGHighMinusLow':None}
  for arm in arms:
   row={'id':c['id'],'reference':c['reference'],'predicted':p[arm]};arms[arm].append(row)
   if all(p.values()):paired[arm].append(row)
  if all(p.values()):
   error=lambda arm,key:p[arm][key]-c['reference'][key]
   d.update(deltaAbsoluteKcalHighMinusLow=abs(error('high','kcal'))-abs(error('low','kcal')),deltaAbsoluteMassGHighMinusLow=abs(error('high','massG'))-abs(error('low','massG')))
  details.append(d)
 allmetrics={a:_metrics(v) for a,v in arms.items()};pairedmetrics={a:_metrics(v) for a,v in paired.items()};deltas=[d['deltaAbsoluteKcalHighMinusLow'] for d in details if d['deltaAbsoluteKcalHighMinusLow'] is not None];valid=len(deltas)==10
 lo=pairedmetrics['low']['served'];hi=pairedmetrics['high']['served'];guards={'all10valid_both_arms':valid,'mae_at_least10percent_better':valid and lo['mae_kcal']>0 and hi['mae_kcal']<=.9*lo['mae_kcal'],'p90_not_worse':valid and hi['p90_absolute_error_kcal']<=lo['p90_absolute_error_kcal'],'normalized_not_worse':valid and hi['mean_normalized_absolute_error']<=lo['mean_normalized_absolute_error']}
 return {'selectedCases':10,'allAttempts':allmetrics,'pairedValid':{'scoredPairs':len(deltas),**pairedmetrics,'improved':sum(d<0 for d in deltas),'worsened':sum(d>0 for d in deltas),'tied':sum(d==0 for d in deltas)},'cases':details,'considerationGate':{'guards':guards,'passesAll':all(guards.values()),'meaning':'Only qualifies frozen configuration for fresh validation; not adequate absolute accuracy or production approval.'},'productionPromotable':False,'representativeAccuracy':False,'interpretation':'Existing ten development meals; same single JPEG/original prompt/catalog/schema/model/default media/8192 and60s in both arms. Only thinking level differs; model stochasticity/pretraining/physical independence unknown. All fixed failures retained in coverage; matched-valid comparisons only. Small-N P90 descriptive; no clinical/transfer claim.'}
