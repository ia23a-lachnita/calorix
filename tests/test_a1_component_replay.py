import copy,unittest
from pathlib import Path
from test_tier1_nutrient_resolver import example
from tool.tier1_nutrient_resolver import load_policy
from tool.replay_a1_components import replay_cases
R=Path(__file__).resolve().parents[1];B=R/'functions/eval/tier1-public'
class ReplayTests(unittest.TestCase):
 def setUp(self):
  self.policy=load_policy(B/'catalog-v2.json',B/'nutrient-resolution-policy-v1.json');self.profile={'schemaVersion':'mass-power-1','anchorG':200,'bounds':[.5,2],'interceptLog':.1,'slopeLog':.1};self.cases=[{'id':'owned-case','reference':{'kcal':50,'massG':150,'proteinG':5,'carbsG':6,'fatG':1}}];self.records={'owned-case':{'A1':{'status':'ok'},'estimate':example()}};self.hashes={'owned-case':'a'*64}
 def replay(self):return replay_cases(self.cases,self.records,self.policy,self.profile,'b'*64,self.hashes)
 def test_factorial_arms_invariants_and_no_mutation(self):
  before=copy.deepcopy(self.records);r=self.replay();self.assertEqual(self.records,before);self.assertEqual(set(r['routes']),{'A1','Nutrient','Mass','Both'});c=r['cases'][0];self.assertEqual(c['predictions']['A1']['massG'],c['predictions']['Nutrient']['massG']);self.assertEqual(c['predictions']['Mass']['massG'],c['predictions']['Both']['massG']);self.assertNotEqual(c['predictions']['Mass']['massG'],c['predictions']['A1']['massG']);self.assertEqual(c['matchedComponents'],1);self.assertEqual(r['newSdkInvocations'],0);self.assertFalse(r['productionPromotable'])
 def test_no_match_route_is_numerically_identical(self):
  self.records['owned-case']['estimate']=example('Unknown stew','unknown');r=self.replay();p=r['cases'][0]['predictions'];self.assertEqual(p['A1'],p['Nutrient']);self.assertEqual(p['Mass'],p['Both'])
 def test_references_cannot_change_predictions(self):
  a=self.replay();self.cases[0]['reference']['kcal']=5000;b=self.replay();self.assertEqual(a['cases'][0]['predictions'],b['cases'][0]['predictions'])
 def test_failure_retained_in_denominator(self):
  self.cases.append({'id':'failed-case','reference':dict(self.cases[0]['reference'])});self.records['failed-case']={'A1':{'status':'failed','failure':'no_food'}};self.hashes['failed-case']='c'*64;r=self.replay()
  for route in r['routes'].values():self.assertEqual(route['selected'],2);self.assertEqual(route['scored'],1);self.assertEqual(route['failed'],1);self.assertEqual(route['coverage'],.5)
  self.assertTrue(all(v is None for v in r['cases'][1]['predictions'].values()))
 def test_duplicate_membership_missing_receipt_or_source_hash_fail(self):
  self.cases.append(copy.deepcopy(self.cases[0]))
  with self.assertRaises(ValueError):self.replay()
  self.cases.pop();self.hashes.clear()
  with self.assertRaises(ValueError):self.replay()
 def test_receipts_and_predictions_preserve_original_source_status(self):
  r=self.replay();self.assertEqual(r['sourceCoverage']['A1']['unverifiedComponents'],1);self.assertEqual(r['sourceCoverage']['Nutrient']['unverifiedComponents'],0);self.assertEqual(r['cases'][0]['resolvedEstimate']['provenance'],self.records['owned-case']['estimate']['provenance']);self.assertEqual(r['cases'][0]['resolvedEstimate']['components'][0]['massG'],120)

 def test_answered_preparation_is_not_rescaled(self):
  self.records['owned-case']['estimate']['question']={'answered':True,'answer':'oil_5g'}
  with self.assertRaises(ValueError):self.replay()
 def test_duplicate_cohort_binding_fails_instead_of_overwriting(self):
  from tool.replay_a1_components import validate_bindings
  b={'cohorts':[{'id':'one'},{'id':'one'}]}
  with self.assertRaises(ValueError):validate_bindings(b,{'cohortIds':['one','two']})

 def test_incomplete_unknown_and_systemic_statuses_refused(self):
  for value in [{'status':'pending'},{'status':'not_attempted'},{'status':'failed','failure':'http_429'},{'status':'failed','failure':'inference_system_failure'},{'status':'unknown'},{}]:
   self.records['owned-case']['A1']=value
   with self.subTest(value=value),self.assertRaises(ValueError):self.replay()
