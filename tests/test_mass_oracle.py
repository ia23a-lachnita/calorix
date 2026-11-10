import copy,unittest
from tool.diagnose_mass_oracle import diagnose

class MassOracleTest(unittest.TestCase):
 def test_hand_example_and_fixed_failures(self):
  p=dict(kcal=160,massG=80,proteinG=5,carbsG=20,fatG=5);ref=dict(kcal=300,massG=100,proteinG=10,carbsG=30,fatG=10)
  rows=[{'id':'a','reference':ref,'predicted':p},{'id':'b','reference':ref,'predicted':None}];original=copy.deepcopy(rows);r=diagnose(rows)
  self.assertEqual(rows,original);self.assertEqual(r['selected'],2);self.assertEqual(r['failed'],1);self.assertEqual(r['coverage'],.5)
  self.assertEqual(r['cases'][0]['oracleKcal'],200);self.assertEqual(r['oracle']['mae_kcal'],100);self.assertEqual(r['oracle']['bias_kcal'],-100)
  self.assertEqual(r['raw']['mae_kcal'],140);self.assertEqual(r['oracle']['mean_normalized_absolute_error'],1/3)
  self.assertFalse(r['promotable']);self.assertFalse(r['upper_bound'])
 def test_oracle_can_worsen_so_is_not_an_accuracy_bound(self):
  p=dict(kcal=300,massG=80,proteinG=1,carbsG=1,fatG=1);ref=dict(p,massG=100)
  r=diagnose([{'id':'a','reference':ref,'predicted':p}]);self.assertEqual(r['raw']['mae_kcal'],0);self.assertEqual(r['oracle']['mae_kcal'],75)
 def test_invalid_masses_and_duplicate_ids_fail_closed(self):
  for bad in [0,-1,float('nan'),float('inf'),True]:
   for where in ['reference','predicted']:
    p=dict(kcal=100,massG=100,proteinG=1,carbsG=1,fatG=1);r={'id':'a','reference':dict(p),'predicted':dict(p)};r[where]['massG']=bad
    with self.subTest(bad=bad,where=where),self.assertRaises(ValueError):diagnose([r])
  r={'id':'a','reference':p,'predicted':p}
  with self.assertRaises(ValueError):diagnose([r,r])
