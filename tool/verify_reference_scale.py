"""Verify original ECUSTFD grams, frozen hash-ranked selection and photo bytes locally."""
import argparse,hashlib,json,re,xml.etree.ElementTree as ET
from pathlib import Path
from tool.reference_scale import gram_rows

def verify(root,manifest):
 import xlrd  # pinned task environment only, not an app dependency
 if xlrd.__version__!='2.0.2':raise ValueError('Pinned xlrd2.0.2 required')
 digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
 for name,sha in manifest['sourceFileSha256'].items():
  if digest(root/name)!=sha:raise ValueError('Source metadata hash drift: '+name)
 book=xlrd.open_workbook(str(root/'density.xls'));stems=(root/'ImageSets_Main_test.txt').read_text().splitlines()
 tree=json.loads((root/'tree.json').read_text());objects={v['path'] for v in tree['tree']['tree']};seed=manifest['seed'];rank=lambda v:hashlib.sha256((seed+'|'+v).encode()).hexdigest()
 actual=[]
 for cls in manifest['classes']:
  sheet=book.sheet_by_name(cls);weights=gram_rows([sheet.row_values(i) for i in range(sheet.nrows)])
  photos=[s for s in stems if re.fullmatch(re.escape(cls)+r'\d+T\(\d+\)',s) and 'JPEGImages/'+s+'.JPG' in objects and 'Annotations/'+s+'.xml' in objects]
  ids={re.match(r'(.+)T\(',s)[1] for s in photos};chosen=min(ids,key=rank);stem=min((s for s in photos if s.startswith(chosen+'T(')),key=rank)
  actual.append((chosen,stem,weights[chosen]))
 expected=[(c['id'],c['sourceImageStem'],c['referenceMassG']) for c in manifest['cases']]
 if actual!=expected:raise ValueError('Frozen portion/image/weight mapping drift')
 for c in manifest['cases']:
  if digest(root/'originals'/(c['id']+'.jpg'))!=c['imageSha256'] or digest(root/'annotations'/(c['id']+'.xml'))!=c['annotationSha256']:raise ValueError('Photo/XML hash drift')
  annotation=ET.parse(root/'annotations'/(c['id']+'.xml')).getroot()
  if sorted(o.findtext('name') for o in annotation.findall('object'))!=sorted([c['sourceClass'],'coin']):raise ValueError('One food plus one reference coin required')
 return {'cases':len(actual),'portionImageMassMappingVerified':True,'originalPhotosVerified':True,'volumeReferenceUsed':False,'calorieReference':None}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source-root',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);a=p.parse_args();print(json.dumps(verify(a.source_root,json.loads(a.manifest.read_text()))))
