from pathlib import Path
from fractions import Fraction
import json,xml.etree.ElementTree as ET
root=Path('/home/agent-runner/.local/share/calorix-annotation-geometry-20261110');source=Path('/home/agent-runner/.local/share/calorix-reference-scale-20261110');facts=json.loads((root/'facts.json').read_text());checks=0

def text6(value):
 n,d=value.numerator,value.denominator;v=(2*n*1000000+d)//(2*d)
 return str(v//1000000)+'.'+str(v%1000000).zfill(6)
for c in facts['cases']:
 tree=ET.parse(source/'annotations'/(c['id']+'.xml')).getroot();objects=tree.findall('object');coin=next(o for o in objects if o.findtext('name')=='coin');food=next(o for o in objects if o.findtext('name')!='coin')
 box=lambda o:[int(o.findtext('bndbox/'+k)) for k in ['xmin','ymin','xmax','ymax']]
 cb,fb=box(coin),box(food);cs=[cb[2]-cb[0],cb[3]-cb[1]];fs=[fb[2]-fb[0],fb[3]-fb[1]];g=c['geometry']
 for field,value in [('coinBoxCornersPx',cb),('foodBoxCornersPx',fb),('coinBoxCornerSpansPx',cs),('foodBoxCornerSpansPx',fs),('coinMeanCornerSpanPx',text6(Fraction(sum(cs),2))),('projectedFoodBoxSpansMm',[text6(Fraction(s*50,sum(cs))) for s in fs])]:assert g[field]==value,(c['id'],field);checks+=1
r={'cases':6,'independentFractionSourceFieldChecks':checks,'allPassed':True,'rounding':'integer rational half-up six places','sdkCalls':0,'physicalDimensionsVerified':False};(root/'source-geometry-replay.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
