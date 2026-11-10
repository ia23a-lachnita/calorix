import unittest
from tool.paired_view_metrics import summarize_pairs

def vec(k,m):return dict(kcal=k,massG=m,proteinG=10,carbsG=20,fatG=5)
def answer(k,m):
 p=vec(k,m);return {'status':'ok','predicted':{a:b for a,b in p.items() if a!='massG'},'massG':m,'failure':None}
def fixture():
 cases=[{'id':'a','reference':vec(200,200),'auditRole':'large_error'},{'id':'b','reference':vec(200,200),'auditRole':'small_error_control'}]
 return cases,{'a':{'single':answer(100,100),'paired':answer(150,150)},'b':{'single':answer(200,200),'paired':answer(230,230)}}
class PairMetricsTest(unittest.TestCase):
 def test_hand_deltas_and_control_harm_are_visible(self):
  cases,rows=fixture();r=summarize_pairs(cases,rows)
  self.assertEqual(r['pairedValid']['scoredPairs'],2);self.assertEqual(r['cases'][0]['deltaAbsoluteKcalTwoMinusOne'],-50);self.assertEqual(r['cases'][0]['deltaAbsoluteMassGTwoMinusOne'],-50)
  self.assertEqual(r['cases'][1]['deltaAbsoluteKcalTwoMinusOne'],30);self.assertEqual(r['pairedValid']['improved'],1);self.assertEqual(r['pairedValid']['worsened'],1)
  self.assertEqual(r['allAttempts']['single']['served']['mae_kcal'],50);self.assertEqual(r['allAttempts']['paired']['served']['mae_kcal'],40)
  self.assertFalse(r['productionPromotable']);self.assertFalse(r['representativeAccuracy'])
 def test_failure_keeps_original_denominator_and_paired_subset_matched(self):
  cases,rows=fixture();rows['b']['paired']={'status':'failed','predicted':None,'massG':None,'failure':'no_food'};r=summarize_pairs(cases,rows)
  self.assertEqual(r['allAttempts']['paired']['coverage'],.5);self.assertEqual(r['allAttempts']['paired']['failed'],1);self.assertEqual(r['allAttempts']['single']['coverage'],1)
  self.assertEqual(r['pairedValid']['scoredPairs'],1);self.assertEqual(r['pairedValid']['single']['served']['mae_kcal'],100);self.assertEqual(r['pairedValid']['paired']['served']['mae_kcal'],50);self.assertIsNone(r['cases'][1]['deltaAbsoluteKcalTwoMinusOne'])
 def test_missing_duplicate_pending_or_invalid_inputs_rejected(self):
  cases,rows=fixture()
  with self.assertRaises(ValueError):summarize_pairs(cases+cases,rows)
  with self.assertRaises(ValueError):summarize_pairs(cases,{'a':rows['a']})
  rows['b']['paired']['status']='pending'
  with self.assertRaises(ValueError):summarize_pairs(cases,rows)
  cases,rows=fixture();rows['a']['single']['massG']=0
  with self.assertRaises(ValueError):summarize_pairs(cases,rows)
