"""Oracle annotation rectangles/planar scale proxies, never physical volume or mass."""
import argparse,hashlib,json,re,xml.etree.ElementTree as ET
from decimal import Decimal,ROUND_HALF_UP
from pathlib import Path
from tool.reference_scale import summarize_mass_pairs

KEYS=('schemaVersion','imageSizePx','coinBoxCornersPx','coinBoxCornerSpansPx','coinMeanCornerSpanPx','foodBoxCornersPx','foodBoxCornerSpansPx','projectedFoodBoxSpansMm','coinDiameterMm')

def fixed6(numerator,denominator):
 if type(numerator) is not int or numerator<0 or type(denominator) is not int or denominator<=0:raise ValueError('Nonnegative integer ratio required')
 return format((Decimal(numerator)/Decimal(denominator)).quantize(Decimal('.000001'),rounding=ROUND_HALF_UP),'.6f')

def empty_geometry(image_size):
 if len(image_size)!=2 or any(type(v) is not int or not 0<v<=10000 for v in image_size):raise ValueError('Valid image dimensions required')
 return dict(zip(KEYS,[1,list(image_size),None,None,None,None,None,None,25]))

def parse_geometry(raw,image_size,expected_class):
 try:root=ET.fromstring(raw)
 except ET.ParseError as e:raise ValueError('Invalid XML') from e
 def number(element,key):
  entries=element.findall(key)
  if len(entries)!=1 or not re.fullmatch(r'-?[0-9]+',(entries[0].text or '').strip()):raise ValueError('Exactly one integer coordinate required')
  return int(entries[0].text)
 size=[number(root,'size/width'),number(root,'size/height')];g=empty_geometry(image_size)
 if size!=list(image_size):raise ValueError('XML/JPEG size mismatch')
 objects=root.findall('object');names=[o.findtext('name') for o in objects]
 if not expected_class or expected_class=='coin' or len(objects)!=2 or sorted(names,key=str)!=sorted([expected_class,'coin']):raise ValueError('One expected food plus coin required')
 def box(obj):
  v=[number(obj,'bndbox/'+key) for key in ('xmin','ymin','xmax','ymax')]
  if not (0<=v[0]<v[2]<=size[0] and 0<=v[1]<v[3]<=size[1]):raise ValueError('Invalid or out-of-bounds rectangle')
  return v
 coin=box(objects[names.index('coin')]);food=box(objects[names.index(expected_class)]);cs=[coin[2]-coin[0],coin[3]-coin[1]];fs=[food[2]-food[0],food[3]-food[1]]
 return dict(zip(KEYS,[1,size,coin,cs,fixed6(sum(cs),2),food,fs,[fixed6(v*50,sum(cs)) for v in fs],25]))

def summarize_geometry(cases,rows):
 if len(cases)!=6 or any(set(v)!={'control','geometry'} for v in rows.values()):raise ValueError('Six fixed paired cases required')
 old=summarize_mass_pairs(cases,{i:{'neutral':v['control'],'metric':v['geometry']} for i,v in rows.items()})
 result={**old,'allAttempts':{'control':old['allAttempts']['neutral'],'geometry':old['allAttempts']['metric']}}
 paired=old['pairedValid'];result['pairedValid']={k:v for k,v in paired.items() if k not in ('neutral','metric')};result['pairedValid'].update(control=paired['neutral'],geometry=paired['metric'])
 result['cases']=[{('controlMassG' if k=='neutralMassG' else 'geometryMassG' if k=='metricMassG' else k):v for k,v in c.items()} for c in old['cases']]
 lo=result['pairedValid']['control'];hi=result['pairedValid']['geometry'];valid=paired['scoredPairs']==6
 guards={'all6validBothArms':valid,'maeAtLeast10PercentBetter':valid and lo['maeG']>0 and hi['maeG']<=.9*lo['maeG'],'medianNotWorse':valid and hi['medianAbsoluteErrorG']<=lo['medianAbsoluteErrorG'],'p90NotWorse':valid and hi['p90AbsoluteErrorG']<=lo['p90AbsoluteErrorG']}
 result.update(considerationGate={'guards':guards,'passesAll':all(guards.values()),'meaning':'Fresh oracle validation candidate only; no automatic/app/calorie accuracy approval.'},oracleAnnotationLocalization=True,physicalScaleValidated=False,interpretation='Existing six simple development portions, same JPEG and25mm information both arms. Only annotation rectangles/projected-ratio arithmetic cue added; assumes common planar scale, not measured physical dimensions/volume/height/mass. No food labels or reference grams input. Descriptive small-N mass comparison, no causal/representative/calorie/Android claim.')
 return result

def prepare(source_root,manifest):
 from PIL import Image
 from tool.verify_reference_scale import verify
 verification=verify(source_root,manifest);cases=[]
 for c in manifest['cases']:
  with Image.open(source_root/'originals'/(c['id']+'.jpg')) as image:size=image.size
  g=parse_geometry((source_root/'annotations'/(c['id']+'.xml')).read_bytes(),size,c['sourceClass'])
  cases.append({'id':c['id'],'geometry':g,'imageSha256':c['imageSha256'],'annotationSha256':c['annotationSha256']})
 with Image.open(source_root/'owned-blank.jpg') as image:probe=empty_geometry(image.size)
 return {'schemaVersion':1,'verification':verification,'cases':cases,'probeGeometry':probe,'referenceWeightsInGeometry':False,'volumeReferenceUsed':False,'calorieReference':None}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source-root',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--output',type=Path);a=p.parse_args();value=prepare(a.source_root,json.loads(a.manifest.read_text()));raw=json.dumps(value,indent=2)+'\n'
 if a.output:
  with a.output.open('x') as file:file.write(raw)
 else:print(raw,end='')
