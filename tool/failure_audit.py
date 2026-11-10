"""Selected error diagnostics; no accuracy claim from outcome-selected images."""
import copy,math,statistics
from tool.portion_calibration import finite,_score,VECTOR

def select_extremes(rows,worst=8,controls=2):
 if type(worst)!=int or type(controls)!=int or worst<1 or controls<1:raise ValueError('Positive fixed selection counts required')
 seen=set()
 for r in rows:
  if not isinstance(r['id'],str) or not r['id'] or r['id'] in seen:raise ValueError('Duplicate/invalid ID')
  seen.add(r['id']);v=r['correctedErrorKcal']
  if type(v) not in (int,float) or not math.isfinite(v):raise ValueError('Finite error required')
 chosen=[];dates=set()
 for count,role,sign in [(worst,'large_error',-1),(controls,'small_error_control',1)]:
  selected=0
  for r in sorted(rows,key=lambda r:(sign*abs(r['correctedErrorKcal']),r['id'])):
   if r['captureDate'] in dates:continue
   chosen.append({**copy.deepcopy(r),'auditRole':role});dates.add(r['captureDate']);selected+=1
   if selected==count:break
  if selected!=count:raise ValueError('Insufficient distinct dates; no replacement/relaxation')
 return chosen

def diagnostic(reference,predicted):
 for value in [reference,predicted]:
  for k in VECTOR:finite(value[k])
  if value['massG']<=0:raise ValueError('Positive aggregate mass required')
 oracle=finite(predicted['kcal']*(reference['massG']/predicted['massG']))
 factors=4*reference['proteinG']+4*reference['carbsG']+9*reference['fatG']
 return {'rawErrorKcal':predicted['kcal']-reference['kcal'],'massErrorG':predicted['massG']-reference['massG'],
  'predictedMassG':predicted['massG'],'referenceMassG':reference['massG'],'referenceToPredictedMassRatio':reference['massG']/predicted['massG'],
  'predictedKcalPerG':predicted['kcal']/predicted['massG'],'referenceKcalPerG':reference['kcal']/reference['massG'],
  'referenceMassOracleKcal':oracle,'referenceMassOracleErrorKcal':oracle-reference['kcal'],
  'referenceGeneralFactorEnergyKcal':factors,'referenceEnergyMinusGeneralFactorsKcal':reference['kcal']-factors,
  'causalAttribution':False,'oraclePromotable':False,'referenceAutomaticallyInvalidated':False}

def summarize(rows):
 transformed=[]
 for r in rows:
  new=copy.deepcopy(r)
  if r['predicted'] is not None:
   factor=finite(r['factor'])
   if factor<=0:raise ValueError('Positive historical factor required')
   diagnostic(r['reference'],r['predicted'])
   new['predicted']={k:finite(r['predicted'][k]*factor) for k in VECTOR}
  transformed.append(new)
 result={}
 for name,source in [('raw',rows),('historicalCalibrated',transformed)]:
  score=_score(source,1);errors=[abs(r['predicted']['kcal']-r['reference']['kcal']) for r in source if r['predicted'] is not None]
  score['served']['median_absolute_error_kcal']=statistics.median(errors) if errors else None;result[name]=score
 return {'selected':len(rows),**result,'representativeAccuracy':False,'extraSdkEntries':0,
  'interpretation':'Existing exposed benchmark and diagnostic selection; preserve coverage. Historical correction is unchanged. General-factor residuals are screening only; oracle values require reference mass and are not causal or deployable.'}
