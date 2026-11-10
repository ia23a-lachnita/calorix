import unittest,copy
from tool.failure_audit import select_extremes,diagnostic,summarize

def row(i,error,date=None):return {'id':str(i),'captureDate':str(i) if date is None else date,'correctedErrorKcal':error}
def vector(kcal,mass):return dict(kcal=kcal,massG=mass,proteinG=10,carbsG=20,fatG=5)
class FailureAuditTest(unittest.TestCase):
 def test_selected_extremes_dates_ties_and_order(self):
  rows=[row(1,100,'x'),row(2,-100,'x'),row(3,90,'y'),row(4,1,'z'),row(5,-2,'w')]
  actual=select_extremes(rows,2,1);self.assertEqual([r['id'] for r in actual],['1','3','4']);self.assertEqual([r['auditRole'] for r in actual],['large_error','large_error','small_error_control'])
  self.assertEqual(actual,select_extremes(list(reversed(rows)),2,1))
 def test_duplicate_insufficient_invalid_selection_rejected(self):
  for rows in [[row(1,1)]*2,[row(1,1,'x'),row(2,2,'x')],[row(1,float('nan')),row(2,2)]]:
   with self.subTest(rows=rows),self.assertRaises(ValueError):select_extremes(rows,1,1)
 def test_diagnostic_hand_case_is_not_causal_oracle_or_relabel(self):
  ref=vector(300,100);pred=vector(160,80);before=copy.deepcopy((ref,pred));x=diagnostic(ref,pred)
  self.assertEqual((ref,pred),before);self.assertEqual(x['rawErrorKcal'],-140);self.assertEqual(x['massErrorG'],-20)
  self.assertEqual(x['referenceMassOracleKcal'],200);self.assertEqual(x['referenceMassOracleErrorKcal'],-100)
  self.assertEqual(x['referenceGeneralFactorEnergyKcal'],165);self.assertEqual(x['referenceEnergyMinusGeneralFactorsKcal'],135)
  self.assertFalse(x['causalAttribution']);self.assertFalse(x['oraclePromotable']);self.assertFalse(x['referenceAutomaticallyInvalidated'])
 def test_invalid_vectors_fail_closed(self):
  for bad in [0,-1,float('nan'),True]:
   with self.subTest(bad=bad),self.assertRaises(ValueError):diagnostic(vector(100,bad),vector(100,100))
 def test_summary_retains_failure_denominator_and_median(self):
  ref=vector(200,100);rows=[{'id':'a','reference':ref,'predicted':vector(100,100),'factor':1.5},{'id':'b','reference':ref,'predicted':None,'factor':None}]
  x=summarize(rows);self.assertEqual(x['selected'],2);self.assertEqual(x['raw']['coverage'],.5);self.assertEqual(x['raw']['served']['median_absolute_error_kcal'],100);self.assertEqual(x['historicalCalibrated']['served']['median_absolute_error_kcal'],50)
  self.assertFalse(x['representativeAccuracy']);self.assertEqual(x['extraSdkEntries'],0)
