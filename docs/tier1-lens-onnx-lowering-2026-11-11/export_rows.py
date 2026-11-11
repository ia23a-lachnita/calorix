"""Export actual completed records and public reference errors; no inference."""
import argparse,csv,gzip,hashlib,json
from pathlib import Path

def read(p):return p.read_bytes() if p.exists() else gzip.decompress(p.with_name(p.name+'.gz').read_bytes())
def main(a):
 cases=json.loads((a.repo/'functions/eval/tier1-public/manifest-calorie-lens-v1.json').read_text())['cases'];rows=[]
 for c in cases:
  for engine in ['ort','torch']:
   p=a.execution/'benchmark'/(c['id']+'-'+engine+'.json')
   if not p.exists() and not p.with_name(p.name+'.gz').exists():continue
   data=read(p);r=json.loads(data);reference=c['reference'];gold=reference.get('kcal');rows.append({'id':c['id'],'group':c['group'],'runtime':engine,'original_raw_v1':'FAILED','original_endpoint_v2':'FAILED','candidate':r['candidate'],'strict_raw_pass':r['parity']['passes'],'decision_endpoint_pass':r['compatibility']['endpointV2']['passes'],'estimated_served_kcal':r['totals']['kcal'],'reference_served_kcal':gold,'signed_kcal_error':r['totals']['kcal']-gold if gold is not None else None,'absolute_kcal_error':abs(r['totals']['kcal']-gold) if gold is not None else None,'estimated_mass_g':r['massG'],'reference_mass_g':reference['massG'],'signed_mass_error_g':r['massG']-reference['massG'],'image_wall_ms':r['imageWallMs'],'forward_decode_ms':r['forwardAndDecodeMs'],'named_food_rows':len(r['publisherSummary']['ingredients']),'identity_portion_verified':r['identityAndPortionVerified'],'nutrient_source':r['nutrientSourceKind'],'raw_record_sha256':hashlib.sha256(data).hexdigest(),'input_tensor_sha256':r['inputTensor']['sha256']})
 assert len(rows)==48
 with a.output.open('x',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');writer.writeheader();writer.writerows(rows)
 print(json.dumps({'rows':len(rows),'ort':sum(r['runtime']=='ort' for r in rows),'torch':sum(r['runtime']=='torch' for r in rows),'calorieReferenceRows':sum(r['reference_served_kcal'] is not None for r in rows)}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--execution',type=Path,required=True);p.add_argument('--output',type=Path,required=True);main(p.parse_args())
