from pathlib import Path
from decimal import Decimal as D
import json
root=Path('/home/agent-runner/.local/share/calorix-thinking-level-20261110');r=json.loads((root/'result.json').read_text(),parse_float=D);oracle=json.loads((root/'reference-mass-diagnostic.json').read_text(),parse_float=D);checks=0
for arm in ['low','high']:
 errors=[]
 for c in r['cases']:
  p=c[arm];ref=c['reference'];errors.append(D(str(p['kcal']))*D(str(ref['massG']))/D(str(p['massG']))-D(str(ref['kcal'])))
 a=sorted(map(abs,errors));n=len(a);values={'referenceMassSubstitutionMaeKcal':sum(a)/n,'medianAbsoluteErrorKcal':(a[4]+a[5])/2,'p90AbsoluteErrorKcal':a[8]+D('.1')*(a[9]-a[8]),'biasKcal':sum(errors)/n}
 for key,value in values.items():assert abs(oracle[arm][key]-value)<D('1e-9');checks+=1
receipt={'independentOracleDecimalChecks':checks,'allPassed':True,'tolerance':'1e-9','automaticAccuracy':False,'generateContentCalls':0};(root/'oracle-decimal-replay.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
