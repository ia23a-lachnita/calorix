import copy, hashlib, io, math, unittest
from tool.calorie_lens_routes import density_records, decode_lens, route_specialist, summarize_routes

def a1(mass=150, count=2):
 return {'components':[{'name':str(i),'massG':mass/count,'nutrients':dict(kcal=mass/count,proteinG=1,carbsG=2,fatG=1),'source':{'kind':'unverified_vlm_estimate'}} for i in range(count)],'totals':dict(kcal=mass,proteinG=count,carbsG=2*count,fatG=count)}
def special(kcal=200,mass=180):
 return {'status':'ok','massG':mass,'totals':dict(kcal=kcal,proteinG=10,carbsG=20,fatG=5)}
def config():
 return {'ingredient_ids':[1,2],'ingredients':['rice','oil'],'densities':[[1,.1,.2,.3,0,0,0,0],[9,1,0,0,0,0,0,0]]}
CSV=b'ingr,id,cal/g,fat(g),carb(g),protein(g)\nrice,1,1,.1,.2,.3\noil,2,9,1,0,0\n'
class LensRoutesTest(unittest.TestCase):
 def test_density_core_record_mapping_and_no_usda_verification(self):
  rows=density_records(config(),CSV,hashlib.sha256(CSV).hexdigest());self.assertEqual(len(rows),2);self.assertEqual(rows[0]['recordId'],1);self.assertTrue(rows[0]['coreNutrientsMatched']);self.assertFalse(rows[0]['extendedUsdaVerified'])
  c=config();c['densities'][0][0]=2;rows=density_records(c,CSV,hashlib.sha256(CSV).hexdigest());self.assertFalse(rows[0]['coreNutrientsMatched'])
  with self.assertRaises(ValueError):density_records(config(),CSV,'0'*64)
 def test_decode_publisher_units_all_ingredients_and_direct_head(self):
  summary={'totals':{'mass_g':110,'kcal':190,'protein_g':30,'fat_g':20,'carb_g':20},'direct_estimate':{'mass_g':120,'kcal':200,'protein_g':25,'fat_g':15,'carb_g':30}}
  raw={'grams':[[100,10]],'mass_gap':[0],'logits':[[1,2]]}
  r=decode_lens(summary,raw,config(),density_records(config(),CSV,hashlib.sha256(CSV).hexdigest()))
  self.assertEqual(r['massG'],110);self.assertEqual(r['totals']['proteinG'],30);self.assertEqual(r['directHead']['totals']['fatG'],15);self.assertEqual(len(r['components']),2);self.assertFalse(r['components'][0]['foodIdentityVerified'])
  summary['totals']['kcal']=math.nan
  with self.assertRaises(ValueError):decode_lens(summary,raw,config(),[])
 def test_gate_boundary_count_fractional_and_no_mutation(self):
  for mass,count,eligible in [(149.9,2,False),(150,1,False),(150,2,True),(150.1,2,True)]:
   est=a1(mass,count);before=copy.deepcopy(est);r=route_specialist(est,special());self.assertEqual(r['eligible'],eligible);self.assertEqual(r['selectedSource'],'specialist' if eligible else 'A1');self.assertEqual(est,before)
  est=a1();est['components'][0]['massG']=.1;est['components'][1]['massG']=149.9;self.assertTrue(route_specialist(est,special())['eligible'])
 def test_small_serving_ignores_even_numerically_better_specialist(self):
  r=route_specialist(a1(100),special(100));self.assertEqual(r['totals']['kcal'],100);self.assertEqual(r['selectedSource'],'A1');self.assertEqual(r['reason'],'outside_fixed_serving_gate')
 def test_failed_specialist_falls_back_and_missing_a1_is_failure(self):
  for s in [None,{'status':'failed'},special(math.nan)]:
   r=route_specialist(a1(),s);self.assertEqual(r['selectedSource'],'A1');self.assertEqual(r['reason'],'specialist_failed')
  for e in [None,{},a1(0),a1(math.nan)]:
   r=route_specialist(e,special());self.assertEqual(r['status'],'failed');self.assertEqual(r['reason'],'a1_failed_or_missing');self.assertIsNone(r['totals'])
 def test_predicate_uses_no_reference_or_dataset(self):
  e=a1(151);x=route_specialist(e,special());e['reference']={'massG':1,'kcal':99999};e['dataset']='not-n5';self.assertEqual(route_specialist(e,special()),x)
 def test_groups_failures_and_mass_only_no_fake_fresh_hybrid(self):
  ref=dict(kcal=200,massG=150,proteinG=10,carbsG=20,fatG=5)
  cases=[{'id':'v','group':'validation20','dataset':'nutrition5k','reference':ref,'a1Estimate':a1()},{'id':'d','group':'discovery10','dataset':'nutrition5k','reference':ref,'a1Estimate':a1()},{'id':'e','group':'ecust-fresh','dataset':'ecust','reference':{'massG':50},'a1Estimate':None}]
  rows={'v':special(200),'d':{'status':'failed'},'e':special(50,60)}
  r=summarize_routes(cases,rows);self.assertEqual(r['validation20']['gated']['served']['mae_kcal'],0);self.assertEqual(r['discovery10']['direct']['coverage'],0);self.assertEqual(r['discovery10']['gated']['coverage'],1);self.assertIsNone(r['ecust']['fresh']['hybrid']);self.assertIsNone(r['ecust']['energy']);self.assertFalse(r['productionPromotable'])

class SourcePinTest(unittest.TestCase):
 def test_published_metadata_hash_and_byte_drift_refused(self):
  import tempfile
  from pathlib import Path
  from tool.run_calorie_lens_eval import verify_file
  with tempfile.TemporaryDirectory() as temp:
   p=Path(temp)/'bundle';p.write_bytes(b'pinned')
   verify_file(p,hashlib.sha256(b'pinned').hexdigest(),6)
   with self.assertRaises(ValueError):verify_file(p,'0'*64,6)
   with self.assertRaises(ValueError):verify_file(p,hashlib.sha256(b'pinned').hexdigest(),5)
