"""Freeze a mass-only TRAIN input and new10 TEST scans. No inference."""
import argparse,collections,csv,hashlib,io,json,math,urllib.request,urllib.error
from pathlib import Path
import PIL
from PIL import Image
from tool.prepare_tier1_public_eval import SOURCES,BASE,sha,parse_dishes,write_new,convert_jpeg,date_of
from tool.prepare_portion_calibration import DEPTH
from tool.portion_calibration import select_stratified,VECTOR
from tool.mass_power_calibration import fit_mass_power

def main():
 a=argparse.ArgumentParser();a.add_argument('--source-root',type=Path,required=True);a.add_argument('--split-root',type=Path,required=True);a.add_argument('--output',type=Path,required=True);a.add_argument('--repo',type=Path,default=Path.cwd());args=a.parse_args()
 text={};pins=[]
 for name,(remote,digest) in SOURCES.items():
  raw=(args.source_root/name).read_bytes()
  if sha(raw)!=digest:raise ValueError('Metadata/RGB split drift')
  text[name]=raw.decode('utf-8-sig');pins.append({'url':BASE+remote,'sha256':digest,'bytes':len(raw)})
 raw=(args.split_root/'depth_test_ids.txt').read_bytes()
 if sha(raw)!=DEPTH['test']:raise ValueError('Overhead TEST drift')
 ids=set(raw.decode().split());pins.append({'url':BASE+'dish_ids/splits/depth_test_ids.txt','sha256':sha(raw),'bytes':len(raw)})
 if not ids<=set(text['phase-a-qualified-proof-47b607e/research-rgb-test-ids.txt'].split()) or ids&set(text['rgb_train_ids.txt'].split()):raise ValueError('Split mismatch')
 base=args.repo/'functions/eval/tier1-public';old40=json.loads((args.repo/'docs/tier1-public-weighed-2026-11-10/bundle.json').read_text());excluded=set(json.loads((base/'manifest-v1.json').read_text())['selection']['previousIds'])
 used={c['id'] for c in old40['cases']}
 for arm in ['train','test']:used|={c['id'] for c in json.loads((base/f'portion-scale-{arm}-v1.json').read_text())['cases']}
 excluded|=used;dates={date_of(i) for i in used}
 if len(excluded)!=146 or len(dates)!=55:raise ValueError('Exclusion drift')
 vocab={f"ingr_{int(r['id']):010d}":r['ingr'] for r in csv.DictReader(io.StringIO(text['ingredients_metadata.csv']))};rows=sum([parse_dishes(text[n],n) for n in ['metadataCafe1.csv','metadataCafe2.csv']],[]);quality=[]
 for r in rows:
  ref=r['reference'];parts=r['ingredients']
  valid=all(math.isfinite(v) and v>=0 for v in ref.values()) and ref['kcal']>0 and ref['massG']>0
  valid=valid and all(p['id'] in vocab and 'deprecated' not in vocab[p['id']].lower() and p['massG']>0 and all(math.isfinite(p[k]) and p[k]>=0 for k in VECTOR) for p in parts)
  if valid and all(abs(sum(p[k] for p in parts)-ref[k])<=.01 for k in VECTOR):quality.append(r)
 cases=select_stratified(quality,ids,excluded,dates,[('high',5),('mid',5)],'mass-power-v1-20261110',meal_range=True)
 old=args.repo/'docs/tier1-portion-calibration-2026-11-10';oldpins=json.loads((old/'file-sha256.json').read_text());train=[]
 manifest=json.loads((base/'portion-scale-train-v1.json').read_text())
 for c in manifest['cases']:
  relative='train/'+c['id']+'.json';raw=(old/relative).read_bytes()
  if sha(raw)!=oldpins[relative]:raise ValueError('Published TRAIN receipt drift')
  row=json.loads(raw)
  if row['id']!=c['id'] or row['A1']['status']!='ok':raise ValueError('Exact20 successful TRAIN rows required')
  train.append({'id':c['id'],'predictedMassG':row['A1']['massG'],'referenceMassG':c['reference']['massG'],'rawReceiptSha256':sha(raw)})
 args.output.mkdir();write_new(args.output/'training-mass-only.json',{'schemaVersion':'mass-only-training-1','rows':train})
 trainsha=sha((args.output/'training-mass-only.json').read_bytes());profile=fit_mass_power(train);profile['trainingInputSha256']=trainsha;write_new(args.output/'profile.json',profile)
 common={'schemaVersion':1,'scope':'public_dataset','datasetId':'nutrition5k','sampleCount':10,'split':'official RGB and overhead TEST','sources':pins,'selection':{'seed':'mass-power-v1-20261110','excludedIds':sorted(excluded),'excludedDates':sorted(dates),'rule':'High5 then mid5; one SHA256-ranked date/ID; fail on insufficiency; no replacement'},'license':{'id':'CC-BY-4.0','attribution':'Thames et al., Nutrition5k, CVPR2021'},'questionPolicy':'Unanswered; no reference-derived preparation answers','androidWeighedMeals':0,'pretrainingExposure':'unknown','preprocessing':{'pillow':PIL.__version__,'jpegLibrary':Image.core.jpeglib_version,'format':'RGB JPEG','quality':85,'subsampling':2,'exif':'removed','resize':False},'cases':cases}
 write_new(args.output/'selection.json',common);(args.output/'inputs').mkdir();(args.output/'originals').mkdir()
 for c in cases:
  c['sourceImageUrl']=BASE+f"imagery/realsense_overhead/{c['id']}/rgb.png"
  try:
   with urllib.request.urlopen(c['sourceImageUrl'],timeout=30) as response:raw=response.read(8*1024*1024+1)
   if len(raw)>8*1024*1024:raise ValueError('Image too large')
   with Image.open(io.BytesIO(raw)) as im:
    if im.format!='PNG':raise ValueError('Expected PNG')
    c['width'],c['height']=im.size
   jpeg=convert_jpeg(raw)
   if len(jpeg)>4*1024*1024:raise ValueError('JPEG too large')
   (args.output/'originals'/f"{c['id']}.png").write_bytes(raw);(args.output/'inputs'/f"{c['id']}.jpg").write_bytes(jpeg)
   c.update(inputPath=f"inputs/{c['id']}.jpg",inputSha256=sha(jpeg),sourceImageSha256=sha(raw),inputStatus='ready',inputFailure=None)
  except (OSError,ValueError) as error:c.update(inputPath=None,inputSha256=None,inputStatus='dataset_failure',inputFailure=f'http_{error.code}' if isinstance(error,urllib.error.HTTPError) else 'image_preparation_failure')
 write_new(args.output/'manifest.json',common);print(json.dumps({'selected':10,'ready':sum(c['inputStatus']=='ready' for c in cases),'profile':profile}))
if __name__=='__main__':main()
