import copy,json,tempfile,unittest
from pathlib import Path
from tool.predicted_portion_prior import select_stress_split,fit_serving_priors,load_alias_policy,route_prior,score_priors
R=Path(__file__).resolve().parents[1]
def estimate(name='Bread',grams=40):
 per={'kcal':250,'proteinG':8,'carbsG':45,'fatG':4};p={'name':name,'massG':grams,'preparation':'baked','assumptions':['Visually estimated'],'catalogId':None,'estimatedPer100':per,'nutrients':{k:v*grams/100 for k,v in per.items()},'source':{'kind':'unverified_vlm_estimate','recordId':None}}
 return {'mealName':'Food','schemaVersion':1,'components':[p],'totals':dict(p['nutrients']),'rawInventory':{'original':True},'provenance':{'model':'original'},'question':None,'requiresReview':True}
def rows():return [{'id':'bread00'+str(i),'sourceClass':'bread','referenceMassG':v} for i,v in enumerate([10,20,30,40,50],1)]
class PredictedPriorTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.file=Path(self.temp.name)/'policy.json';self.file.write_text(json.dumps({'schemaVersion':1,'id':'owned','classes':{'bread':['bread','slice of bread'],'bun':['bun']}}));self.policy=load_alias_policy(self.file)
 def test_stress_split_disjoint_extremes_and_input_order(self):
  a=select_stress_split(rows(),{'bread':2},'fixed');b=select_stress_split(list(reversed(rows())),{'bread':2},'fixed');self.assertEqual(a,b);self.assertEqual({r['id'] for r in a['cases']},{'bread001','bread005'});self.assertEqual({r['stressRole'] for r in a['cases']},{'min','max'});self.assertEqual(len(a['fit']),3)
 def test_split_duplicates_bad_quantity_and_insufficient_fit_fail(self):
  for data in [rows()+[rows()[0]],rows()[:4],[dict(r,referenceMassG=True) for r in rows()]]:
   with self.assertRaises(ValueError):select_stress_split(data,{'bread':2},'fixed')
 def test_prior_fit_no_evaluation_leak_and_minimum(self):
  p=fit_serving_priors(rows()[1:4],{'bread001','bread005'});self.assertEqual(p['classes']['bread']['medianMassG'],30)
  with self.assertRaises(ValueError):fit_serving_priors(rows()[1:4],{'bread002'})
  with self.assertRaises(ValueError):fit_serving_priors(rows()[1:3],{'bread005'})
 def test_route_uses_only_predicted_name_and_keeps_original(self):
  e=estimate();before=copy.deepcopy(e);r=route_prior(e,{'bread':{'medianMassG':30,'fitGroups':3}},self.policy);self.assertEqual(e,before);self.assertEqual(r['status'],'applied');self.assertEqual(r['predictedClass'],'bread');self.assertEqual(r['estimate']['components'][0]['massG'],30)
  for key in ['name','preparation','source','estimatedPer100','assumptions']:self.assertEqual(r['estimate']['components'][0][key],e['components'][0][key])
  for key in ['rawInventory','provenance','question']:self.assertEqual(r['estimate'][key],e[key])
  self.assertAlmostEqual(r['estimate']['totals']['kcal'],75);self.assertIsNone(r['estimate']['portionPrior']['observedPieceCount'])
 def test_unmapped_composite_plural_multiple_components_abstain(self):
  for name in ['bread with butter','breads','two bread slices','baozi','caramel treats','shahefen pastry']:
   r=route_prior(estimate(name),{'bread':{'medianMassG':30,'fitGroups':3}},self.policy);self.assertEqual(r['status'],'fallback');self.assertEqual(r['estimate'],estimate(name))
  e=estimate();e['components'].append(copy.deepcopy(e['components'][0]));e['totals']={k:v*2 for k,v in e['totals'].items()};r=route_prior(e,{'bread':{'medianMassG':30,'fitGroups':3}},self.policy);self.assertEqual(r['status'],'fallback');self.assertEqual(r['estimate'],e)
 def test_answered_or_already_corrected_receipt_and_invalid_numbers_refused(self):
  e=estimate();e['question']={'answered':True}
  with self.assertRaises(ValueError):route_prior(e,{},self.policy)
  e=estimate();e['portionPrior']={}
  with self.assertRaises(ValueError):route_prior(e,{},self.policy)
  for value in [True,0,-1,float('inf'),float('nan')]:
   e=estimate();e['components'][0]['massG']=value
   with self.assertRaises(ValueError):route_prior(e,{},self.policy)
 def test_policy_collisions_and_wrong_hash_fail(self):
  with self.assertRaises(ValueError):load_alias_policy(self.file,'0'*64)
  self.file.write_text(json.dumps({'schemaVersion':1,'id':'owned','classes':{'bread':['bread'],'bun':[' BREAD! ']}}))
  with self.assertRaises(ValueError):load_alias_policy(self.file)
 def test_reference_class_and_mass_do_not_change_operational_prediction(self):
  p=fit_serving_priors(rows()[1:4],{'bread001','bread005'});cases=[dict(rows()[0],stressRole='min'),dict(rows()[4],stressRole='max')];records={c['id']:{'A1':{'status':'ok'},'estimate':estimate()} for c in cases};a=score_priors(cases,records,p,self.policy);cases[0]['referenceMassG']=999;b=score_priors(cases,records,p,self.policy);self.assertEqual(a['cases'][0]['predictions']['Operational'],b['cases'][0]['predictions']['Operational']);self.assertFalse(a['productionPromotable']);self.assertIsNone(a['calorieReference'])
 def test_abstention_coverage_and_matched_pair_denominators(self):
  p=fit_serving_priors(rows()[1:4],{'bread001','bread005'});cases=[dict(rows()[0],stressRole='min'),dict(rows()[4],stressRole='max')];records={'bread001':{'A1':{'status':'ok'},'estimate':estimate()},'bread005':{'A1':{'status':'ok'},'estimate':estimate('unsupported')}};r=score_priors(cases,records,p,self.policy);self.assertEqual(r['routes']['Operational']['scored'],2);self.assertEqual(r['routes']['MatchedOnly']['scored'],1);self.assertEqual(r['matchedPairs']['count'],1);self.assertEqual(r['routing']['applied'],1)
 def test_semantic_failure_retained_systemic_incomplete_refused(self):
  p=fit_serving_priors(rows()[1:4],{'bread001','bread005'});cases=[dict(rows()[0],stressRole='min'),dict(rows()[4],stressRole='max')];records={'bread001':{'A1':{'status':'ok'},'estimate':estimate()},'bread005':{'A1':{'status':'failed','failure':'no_food'}}};r=score_priors(cases,records,p,self.policy);self.assertEqual(r['routes']['Operational']['coverage'],.5)
  for value in [{'status':'pending'},{'status':'not_attempted'},{'status':'failed','failure':'http_429'},{}]:
   records['bread005']['A1']=value
   with self.assertRaises(ValueError):score_priors(cases,records,p,self.policy)

 def test_router_refuses_full_fit_metadata_bundle_even_when_unmapped(self):
  p=fit_serving_priors(rows()[1:4],{'bread001','bread005'})
  with self.assertRaises(ValueError):route_prior(estimate('unsupported'),p,self.policy)
 def test_missing_preparation_rejected_before_normalization(self):
  e=estimate();e['components'][0]['preparation']=None
  with self.assertRaises(ValueError):route_prior(e,{},self.policy)
