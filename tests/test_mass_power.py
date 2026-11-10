import unittest,math,copy
from tool.mass_power_calibration import fit_mass_power,mass_factor,compare_power

def row(i,p,t):return {'id':str(i),'predictedMassG':p,'referenceMassG':t,'rawReceiptSha256':'a'*64}
class MassPowerTest(unittest.TestCase):
 def test_two_point_power_law(self):
  p=fit_mass_power([row(1,100,200),row(2,400,400)],2)
  self.assertAlmostEqual(p['slopeLog'],-.5);self.assertAlmostEqual(p['interceptLog'],math.log(2)/2)
  self.assertAlmostEqual(mass_factor(100,p),2);self.assertAlmostEqual(mass_factor(400,p),1)
 def test_degenerate_constant_mass_and_extreme_scale_bounds(self):
  p=fit_mass_power([row(1,100,150),row(2,100,150)],2)
  self.assertEqual(p['slopeLog'],0);self.assertAlmostEqual(mass_factor(100,p),1.5)
  p=fit_mass_power([row(1,1e-308,1e308),row(2,1e-308,1e308)],2)
  self.assertEqual(mass_factor(1e-308,p),2)
 def test_fit_forbids_extra_labels_duplicates_and_invalid_mass(self):
  for bad in [dict(row(1,100,100),kcal=200),row(1,0,100),row(1,100,0),row(1,float('nan'),100),row(1,True,100)]:
   with self.subTest(bad=bad),self.assertRaises(ValueError):fit_mass_power([bad],1)
  with self.assertRaises(ValueError):fit_mass_power([row(1,100,100)]*2,2)
  with self.assertRaises(ValueError):fit_mass_power([row(1,100,100)],16)
 def test_factor_rejects_invalid_profiles_and_mass(self):
  p=fit_mass_power([row(1,100,100)],1)
  for bad in [dict(p,slopeLog=.51),dict(p,interceptLog=math.inf),dict(p,anchorG=201),dict(p,bounds=[0,2])]:
   with self.subTest(bad=bad),self.assertRaises(ValueError):mass_factor(100,bad)
  for bad in [0,-1,True,float('nan')]:
   with self.subTest(bad=bad),self.assertRaises(ValueError):mass_factor(bad,p)
 def test_comparison_keeps_fixed_failures_and_raw_values(self):
  p=fit_mass_power([row(1,100,150)],1);v=dict(kcal=100,massG=100,proteinG=10,carbsG=10,fatG=5);ref={k:x*1.5 for k,x in v.items()}
  rows=[{'id':'a','reference':ref,'predicted':v},{'id':'b','reference':ref,'predicted':None}];original=copy.deepcopy(rows);r=compare_power(rows,p)
  self.assertEqual(rows,original);self.assertAlmostEqual(r['calibrated']['served']['mae_kcal'],0);self.assertEqual(r['calibrated']['coverage'],.5);self.assertFalse(r['passes'])
  self.assertTrue(r['guards']['mae_at_least_10_percent_and_10_kcal']);self.assertFalse(r['guards']['minimum_8_scored'])
