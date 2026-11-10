"""Research-only mass references and paired metrics. Volume/calorie gold is absent."""
import math,statistics

def positive(value):
 if type(value) not in (int,float) or not math.isfinite(value) or value<=0:raise ValueError('Positive finite grams required')
 return value

def gram_rows(rows):
 if not rows or rows[0]!=['id','type','volume(mm^3)','weight(g)']:raise ValueError('Explicit original gram header required')
 result={}
 for row in rows[1:]:
  if not row or all(v=='' for v in row):continue
  if len(row)!=4 or not isinstance(row[0],str) or not row[0] or row[0] in result:raise ValueError('Unique portion IDs required')
  result[row[0]]=positive(row[3])
 return result

def prediction(answer):
 if answer.get('status')=='failed' and answer.get('failure') in ('no_food','invalid_model_output') and answer.get('massG') is None:return None
 if answer.get('status')!='ok' or answer.get('failure') is not None:raise ValueError('Completed mass outcome required')
 return positive(answer.get('massG'))

def metrics(rows):
 errors=[p-r for r,p in rows if p is not None];absolute=sorted(abs(e) for e in errors);n=len(errors)
 if n:
  index=(n-1)*.9;lo=math.floor(index);hi=math.ceil(index);p90=absolute[lo]+(absolute[hi]-absolute[lo])*(index-lo)
 else:p90=None
 return dict(attempted=len(rows),scored=n,failed=len(rows)-n,coverage=n/len(rows) if rows else 0,maeG=statistics.mean(absolute) if n else None,medianAbsoluteErrorG=statistics.median(absolute) if n else None,p90AbsoluteErrorG=p90,biasG=statistics.mean(errors) if n else None)

def summarize_mass_pairs(cases,rows):
 ids=[c['id'] for c in cases]
 if not ids or len(ids)!=len(set(ids)) or set(ids)!=set(rows):raise ValueError('Exact unique fixed cases required')
 allrows={a:[] for a in ('neutral','metric')};paired={a:[] for a in allrows};details=[]
 for c in cases:
  ref=positive(c['referenceMassG'])
  if set(rows[c['id']])!=set(allrows):raise ValueError('Both arms required')
  p={a:prediction(rows[c['id']][a]) for a in allrows}
  d=dict(id=c['id'],referenceMassG=ref,neutralMassG=p['neutral'],metricMassG=p['metric'],deltaAbsoluteErrorG=None)
  for arm in allrows:
   allrows[arm].append((ref,p[arm]))
   if all(v is not None for v in p.values()):paired[arm].append((ref,p[arm]))
  if all(v is not None for v in p.values()):d['deltaAbsoluteErrorG']=abs(p['metric']-ref)-abs(p['neutral']-ref)
  details.append(d)
 deltas=[d['deltaAbsoluteErrorG'] for d in details if d['deltaAbsoluteErrorG'] is not None]
 return dict(selectedCases=len(cases),allAttempts={a:metrics(v) for a,v in allrows.items()},pairedValid=dict(scoredPairs=len(deltas),improved=sum(d<0 for d in deltas),worsened=sum(d>0 for d in deltas),tied=sum(d==0 for d in deltas),**{a:metrics(v) for a,v in paired.items()}),cases=details,calorieReference=None,volumeReferenceUsed=False,productionPromotable=False,representativeAccuracy=False,interpretation='Same photo with visible coin in both arms; explicit known-diameter/use-scale cue only. Six simple portions; descriptive P90; unknown foundation-model exposure. No calorie, calibrated geometry, Android transfer or population accuracy claim.')
