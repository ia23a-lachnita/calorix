from decimal import Decimal as D
from pathlib import Path
import json
root=Path('/home/agent-runner/.local/share/calorix-thinking-level-20261110');r=json.loads((root/'result.json').read_text(),parse_float=D);manifest=json.loads((Path.cwd()/'functions/eval/tier1-public/manifest-mealrange-v1.json').read_text(),parse_float=D);checks=0

def q(values,f):
 v=sorted(values);i=D(len(v)-1)*f;lo=int(i);hi=lo if i==lo else lo+1
 return v[lo]+(v[hi]-v[lo])*(i-lo)

def close(a,b):
 global checks
 assert abs(D(str(a))-b)<D('1e-9'),(a,b);checks+=1

refs={c['id']:c['reference'] for c in manifest['cases']};decoded={}
for c in manifest['cases']:
 decoded[c['id']]={}
 for arm in ['low','high']:
  row=json.loads((root/'experiment'/c['id']/arm/(c['id']+'.json')).read_text(),parse_float=D)
  if row['A1']['status']=='ok':
   p=dict(row['estimate']['totals'],massG=sum(D(str(c['massG'])) for c in row['estimate']['components']));decoded[c['id']][arm]=p
  else:decoded[c['id']][arm]=None
paired=[i for i,p in decoded.items() if all(p.values())]
for group in ['allAttempts','pairedValid']:
 for arm in ['low','high']:
  ids=[i for i,p in decoded.items() if p[arm] is not None and (group=='allAttempts' or i in paired)]
  if not ids:continue
  errors={key:[D(str(decoded[i][arm][key]))-D(str(refs[i][key])) for i in ids] for key in ['kcal','massG','proteinG','carbsG','fatG']};e=errors['kcal'];a=list(map(abs,e));m=r[group][arm]
  for key,v in {'mae_kcal':sum(a)/len(a),'median_absolute_error_kcal':q(a,D('.5')),'p90_absolute_error_kcal':q(a,D('.9')),'bias_kcal':sum(e)/len(e),'mean_normalized_absolute_error':sum(abs(D(str(decoded[i][arm]['kcal']))-D(str(refs[i]['kcal'])))/max(D(200),D(str(refs[i]['kcal']))) for i in ids)/len(ids)}.items():close(m['served'][key],v)
  for key in ['massG','proteinG','carbsG','fatG']:
   e=errors[key];a=list(map(abs,e))
   for field,v in {'mae':sum(a)/len(a),'bias':sum(e)/len(e),'p90_absolute_error':q(a,D('.9'))}.items():close(m['amounts'][key][field],v)
for c in r['cases']:
 if c['id'] not in paired:continue
 for key,field in [('kcal','deltaAbsoluteKcalHighMinusLow'),('massG','deltaAbsoluteMassGHighMinusLow')]:close(c[field],abs(D(str(decoded[c['id']]['high'][key]))-D(str(refs[c['id']][key])))-abs(D(str(decoded[c['id']]['low'][key]))-D(str(refs[c['id']][key]))))
receipt={'independentDecimalChecks':checks,'tolerance':'1e-9','allPassed':True,'generateContentCalls':0,'pairedValid':len(paired)};(root/'decimal-replay.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
