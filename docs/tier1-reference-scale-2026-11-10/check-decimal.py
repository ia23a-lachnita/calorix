from decimal import Decimal as D
from pathlib import Path
import json
root=Path('/home/agent-runner/.local/share/calorix-reference-scale-20261110');r=json.loads((root/'result.json').read_text(),parse_float=D);manifest=json.loads((Path.cwd()/'functions/eval/tier1-public/manifest-reference-scale-v1.json').read_text(),parse_float=D)
checks=0
for arm in ['neutral','metric']:
 errors=[]
 for case in manifest['cases']:
  row=json.loads((root/'experiment'/case['id']/arm/'record.json').read_text(),parse_float=D)
  if row['status']!='ok':raise ValueError('Independent complete-pairs Decimal check requires all valid')
  mass=sum(D(str(c['massG'])) for c in row['estimate']['components']);err=mass-case['referenceMassG'];errors.append(err)
  reported=next(c for c in r['cases'] if c['id']==case['id'])[arm+'MassG'];assert abs(reported-mass)<D('1e-9');checks+=1
 a=sorted(abs(e) for e in errors);n=len(a);med=(a[(n-1)//2]+a[n//2])/2;i=D(n-1)*D('.9');lo=int(i);hi=lo+1 if i!=lo else lo
 values={'maeG':sum(a)/n,'medianAbsoluteErrorG':med,'p90AbsoluteErrorG':a[lo]+(a[hi]-a[lo])*(i-lo),'biasG':sum(errors)/n}
 for group in ['allAttempts','pairedValid']:
  for key,v in values.items():assert abs(r[group][arm][key]-v)<D('1e-9'),(group,arm,key);checks+=1
for case in r['cases']:
 delta=abs(case['metricMassG']-case['referenceMassG'])-abs(case['neutralMassG']-case['referenceMassG']);assert abs(case['deltaAbsoluteErrorG']-delta)<D('1e-9');checks+=1
receipt={'independentDecimalChecks':checks,'tolerance':'1e-9','allPassed':True,'input':'published raw component masses, original reference grams and paired result','generateContentCalls':0}
(root/'decimal-replay.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
