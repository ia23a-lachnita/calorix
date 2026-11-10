import unittest
from tool.thinking_level_metrics import summarize_thinking

def fixture():
 c=[{'id':str(i),'reference':dict(kcal=200,massG=100,proteinG=10,carbsG=20,fatG=5)} for i in range(10)]
 def answer(k,m):return {'status':'ok','failure':None,'massG':m,'predicted':dict(kcal=k,proteinG=10,carbsG=20,fatG=5)}
 return c,{x['id']:{'low':answer(100,50),'high':answer(150,80)} for x in c}
class ThinkingTest(unittest.TestCase):
 def test_same_case_kcal_mass_medians_gate(self):
  c,rows=fixture();r=summarize_thinking(c,rows)
  self.assertEqual(r['allAttempts']['low']['served']['mae_kcal'],100);self.assertEqual(r['allAttempts']['high']['served']['median_absolute_error_kcal'],50)
  self.assertEqual(r['cases'][0]['deltaAbsoluteKcalHighMinusLow'],-50);self.assertEqual(r['cases'][0]['deltaAbsoluteMassGHighMinusLow'],-30)
  self.assertTrue(r['considerationGate']['passesAll']);self.assertFalse(r['productionPromotable'])
 def test_failure_keeps_fixed10_denominator_and_matched9_pair_gate_fails(self):
  c,rows=fixture();rows['9']['high']={'status':'failed','failure':'no_food','massG':None,'predicted':None};r=summarize_thinking(c,rows)
  self.assertEqual(r['allAttempts']['high']['coverage'],.9);self.assertEqual(r['pairedValid']['scoredPairs'],9);self.assertEqual(r['pairedValid']['low']['selected'],9);self.assertFalse(r['considerationGate']['passesAll'])
 def test_less_than10percent_gain_or_worse_tail_rejected(self):
  c,rows=fixture()
  for row in rows.values():row['high']['predicted']['kcal']=105
  self.assertFalse(summarize_thinking(c,rows)['considerationGate']['passesAll'])
  c,rows=fixture();rows['9']['high']['predicted']['kcal']=1000;rows['8']['high']['predicted']['kcal']=1000
  self.assertFalse(summarize_thinking(c,rows)['considerationGate']['passesAll'])
 def test_missing_duplicate_pending_rejected(self):
  c,rows=fixture()
  with self.assertRaises(ValueError):summarize_thinking(c,{'0':rows['0']})
  with self.assertRaises(ValueError):summarize_thinking(c+c,rows)
  rows['0']['high']['status']='pending'
  with self.assertRaises(ValueError):summarize_thinking(c,rows)
