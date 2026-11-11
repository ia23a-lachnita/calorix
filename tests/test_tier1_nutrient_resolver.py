import copy,hashlib,json,math,tempfile,unittest
from pathlib import Path
from tool.tier1_nutrient_resolver import load_policy,resolve_estimate,normalize_preparation
R=Path(__file__).resolve().parents[1];BASE=R/'functions/eval/tier1-public';CAT=BASE/'catalog-v2.json';POL=BASE/'nutrient-resolution-policy-v1.json';SHA='a'*64

def example(name='Raw spinach',preparation='raw'):
 p={'name':name,'massG':120,'catalogId':None,'preparation':preparation,'assumptions':['Visually estimated'],'estimatedPer100':{'kcal':30,'proteinG':3,'carbsG':4,'fatG':.5},'nutrients':{'kcal':36,'proteinG':3.6,'carbsG':4.8,'fatG':.6},'source':{'kind':'unverified_vlm_estimate','recordId':None,'sourceUrl':None,'version':None,'description':None}}
 return {'schemaVersion':1,'mealName':'Spinach','components':[p],'totals':dict(p['nutrients']),'ambiguities':['Portion uncertain'],'question':None,'provenance':{'model':'original','catalogVersion':'original-v1'},'requiresReview':True,'rawInventory':{'immutable':'retained'}}
class ResolverTests(unittest.TestCase):
 def setUp(self):self.policy=load_policy(CAT,POL)
 def test_exact_alias_matches_pinned_nutrients_and_preserves_original(self):
  e=example();before=copy.deepcopy(e);r=resolve_estimate(e,self.policy,SHA);self.assertEqual(e,before);c=r['components'][0];rec=next(x for x in json.loads(CAT.read_text())['records'] if x['id']=='usda:168462');self.assertEqual(c['catalogId'],rec['id']);self.assertEqual(c['source']['sourceRowSha256'],rec['sourceRowSha256']);self.assertFalse(c['source']['identityVerified']);self.assertFalse(c['source']['portionVerified'])
  for k,v in rec['per100'].items():self.assertAlmostEqual(c['nutrients'][k],v*1.2)
  for k in ['name','massG','preparation','assumptions','estimatedPer100']:self.assertEqual(c[k],before['components'][0][k])
  for k in ['mealName','rawInventory','provenance','question','ambiguities']:self.assertEqual(r[k],before[k])
  self.assertEqual(r['nutrientResolution']['originalReceiptSha256'],SHA);self.assertEqual(r['nutrientResolution']['matchedComponents'],1)
  r['components'][0]['assumptions'].append('mutated copy');self.assertEqual(e,before)
 def test_complete_description(self):
  r=resolve_estimate(example('Spinach, raw'),self.policy,SHA);self.assertEqual(r['nutrientResolution']['matchedComponents'],1)
 def test_normalization_preserves_qualifiers_and_distinct_methods(self):
  self.assertEqual(normalize_preparation('COOKED, Boiled'),'boiled');self.assertNotEqual(normalize_preparation('cooked steamed'),normalize_preparation('cooked boiled'));self.assertEqual(normalize_preparation('cooked boiled with salt'),'boiled with salt');self.assertNotEqual(normalize_preparation('cooked boiled roasted'),normalize_preparation('roasted'))
 def test_abstains_missing_or_different_preparation_and_recipes(self):
  for name,prep in [('Raw spinach','cooked boiled'),('Raw spinach',''),('Raw spinach','unknown'),('Steamed spinach','boiled'),('Spinach casserole','raw'),('Chicken','cooked roasted'),('Rice','cooked'),('Apple','raw'),('Raw spinach with dressing','raw')]:
   with self.subTest(name=name,prep=prep):
    e=example(name,prep);r=resolve_estimate(e,self.policy,SHA);self.assertEqual(r['components'],e['components']);self.assertEqual(r['nutrientResolution']['matchedComponents'],0)
 def test_qualifiers_and_composite_full_description_do_not_match(self):
  for name,prep in [('Broccoli, frozen, spears, cooked, boiled, drained, without salt','cooked boiled with salt'),('Apples, raw, with skin (Includes foods for USDA\'s Food Distribution Program)','raw'),('Hummus, home prepared','home prepared'),('Potatoes, mashed, home-prepared, whole milk and butter added','cooked mashed with whole milk and butter')]:
   r=resolve_estimate(example(name,prep),self.policy,SHA);self.assertEqual(r['nutrientResolution']['matchedComponents'],0)
 def test_existing_database_components_preserved(self):
  e=example();e['components'][0].update(catalogId='usda:old');e['components'][0]['source'].update(kind='database_match',recordId='usda:old',version='original-v1');r=resolve_estimate(e,self.policy,SHA);self.assertEqual(r['components'],e['components']);self.assertEqual(r['nutrientResolution']['decisions'][0]['status'],'existing_database_preserved')
 def test_multiple_components_order_and_sums(self):
  e=example();e['components'].append(copy.deepcopy(e['components'][0]));e['components'][1]['name']='Raw blueberries';e['totals']={k:v*2 for k,v in e['totals'].items()};r=resolve_estimate(e,self.policy,SHA);self.assertEqual([(x['name'],x['massG']) for x in r['components']],[(x['name'],x['massG']) for x in e['components']]);self.assertEqual(r['nutrientResolution']['matchedComponents'],2)
  for k in e['totals']:self.assertAlmostEqual(r['totals'][k],sum(c['nutrients'][k] for c in r['components']))
 def test_invalid_physical_quantities_fail(self):
  for value in [True,False,0,-1,float('inf'),float('nan'),'120']:
   e=example();e['components'][0]['massG']=value
   with self.subTest(value=value),self.assertRaises(ValueError):resolve_estimate(e,self.policy,SHA)
  for value in [True,-1,float('nan')]:
   e=example();e['totals']['kcal']=value
   with self.assertRaises(ValueError):resolve_estimate(e,self.policy,SHA)
 def test_invalid_total_source_and_receipt_fail(self):
  e=example();e['totals']['kcal']+=1
  with self.assertRaises(ValueError):resolve_estimate(e,self.policy,SHA)
  with self.assertRaises(ValueError):resolve_estimate(example(),self.policy,'not-a-hash')
  e=example();e['components'][0]['source']['kind']='made_up'
  with self.assertRaises(ValueError):resolve_estimate(e,self.policy,SHA)
 def test_no_double_resolution(self):
  r=resolve_estimate(example(),self.policy,SHA)
  with self.assertRaises(ValueError):resolve_estimate(r,self.policy,SHA)
 def test_catalog_tamper_and_wrong_policy_pin(self):
  with tempfile.TemporaryDirectory() as directory:
   c=Path(directory)/'catalog.json';c.write_bytes(CAT.read_bytes()+b' ')
   with self.assertRaises(ValueError):load_policy(c,POL)
  with self.assertRaises(ValueError):load_policy(CAT,POL,expected_policy_sha256='b'*64)
 def test_collision_unknown_record_and_policy_tamper(self):
  p=json.loads(POL.read_text());p['aliases'].append(copy.deepcopy(p['aliases'][0]))
  with tempfile.TemporaryDirectory() as directory:
   q=Path(directory)/'policy.json';q.write_text(json.dumps(p))
   with self.assertRaises(ValueError):load_policy(CAT,q)
   p=json.loads(POL.read_text());p['eligibleRecordIds'].append('usda:not_real');q.write_text(json.dumps(p))
   with self.assertRaises(ValueError):load_policy(CAT,q)
  mutated=copy.deepcopy(self.policy);mutated['catalog']['records'][0]['per100']['kcal']=1
  with self.assertRaises(ValueError):resolve_estimate(example(),mutated,SHA)
