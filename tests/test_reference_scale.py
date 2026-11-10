import unittest,math
from tool.reference_scale import gram_rows,summarize_mass_pairs

class ReferenceScaleTest(unittest.TestCase):
 def test_explicit_grams_only_ignores_ambiguous_volume(self):
  rows=[['id','type','volume(mm^3)','weight(g)'],['bread005','bread',170,26.4]]
  self.assertEqual(gram_rows(rows),{'bread005':26.4})
  rows[0][-1]='weight(kg)'
  with self.assertRaises(ValueError):gram_rows(rows)
 def test_duplicate_nonfinite_nonpositive_reference_rejected(self):
  header=['id','type','volume(mm^3)','weight(g)']
  for values in ([['a','bread',10,0]],[['a','bread',10,math.nan]],[['a','bread',10,1],['a','bread',10,2]]):
   with self.assertRaises(ValueError):gram_rows([header]+values)
 def test_hand_metrics_and_paired_delta(self):
  cases=[{'id':'a','referenceMassG':100},{'id':'b','referenceMassG':50}]
  rows={'a':{'neutral':{'status':'ok','massG':70},'metric':{'status':'ok','massG':90}},'b':{'neutral':{'status':'ok','massG':60},'metric':{'status':'ok','massG':80}}}
  r=summarize_mass_pairs(cases,rows)
  self.assertEqual(r['allAttempts']['neutral']['maeG'],20)
  self.assertEqual(r['allAttempts']['neutral']['medianAbsoluteErrorG'],20)
  self.assertEqual(r['allAttempts']['neutral']['p90AbsoluteErrorG'],28)
  self.assertEqual(r['allAttempts']['neutral']['biasG'],-10)
  self.assertEqual([x['deltaAbsoluteErrorG'] for x in r['cases']],[-20,20])
  self.assertEqual(r['pairedValid']['improved'],1);self.assertEqual(r['pairedValid']['worsened'],1)
  self.assertIsNone(r['calorieReference']);self.assertFalse(r['productionPromotable'])
  rows['b']['metric']={'status':'failed','failure':'no_food','massG':None};r=summarize_mass_pairs(cases,rows)
  self.assertEqual(r['allAttempts']['metric']['coverage'],.5);self.assertEqual(r['pairedValid']['neutral']['maeG'],30);self.assertEqual(r['pairedValid']['metric']['maeG'],10)
 def test_incomplete_or_malformed_pairs_fail_closed(self):
  c=[{'id':'a','referenceMassG':10}]
  for row in ({},{'a':{'neutral':{'status':'pending'},'metric':{'status':'ok','massG':10}}},{'a':{'neutral':{'status':'ok','massG':True},'metric':{'status':'ok','massG':10}}}):
   with self.assertRaises(ValueError):summarize_mass_pairs(c,row)
