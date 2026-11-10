import copy
import unittest
from tool.portion_calibration import select_stratified,fit_scale,compare

class CalibrationTest(unittest.TestCase):
    def test_weighted_objective_not_ratio_median(self):
        rows=[{'id':'a','reference':{'kcal':200},'predicted':{'kcal':100}},
              {'id':'b','reference':{'kcal':2},'predicted':{'kcal':10}}]
        profile=fit_scale(rows,minimum=2)
        self.assertEqual(profile['scale'],2)
        self.assertEqual(profile['usable_training_scans'],2)
    def test_tie_nearest_identity_and_clipping(self):
        def fit(a,b):return fit_scale([{'id':'a','reference':{'kcal':a},'predicted':{'kcal':10}}, {'id':'b','reference':{'kcal':b},'predicted':{'kcal':10}}],2)['scale']
        self.assertEqual(fit(5,20),1)
        self.assertEqual(fit(20,40),2)
        self.assertEqual(fit(1,2),.5)
    def test_failure_count_and_minimum(self):
        rows=[{'id':'a','reference':{'kcal':100},'predicted':{'kcal':0}}, {'id':'b','reference':{'kcal':100},'predicted':None}]
        with self.assertRaises(ValueError):fit_scale(rows,1)
    def test_invalid_and_duplicate_training_rejected(self):
        for bad in [float('nan'),float('inf'),-1,True]:
            with self.subTest(bad=bad),self.assertRaises(ValueError):fit_scale([{'id':'a','reference':{'kcal':100},'predicted':{'kcal':bad}}],1)
        r={'id':'a','reference':{'kcal':100},'predicted':{'kcal':50}}
        with self.assertRaises(ValueError):fit_scale([r,r],1)
    def test_deterministic_selection_bins_dates_and_exclusions(self):
        rows=[{'id':str(i),'captureDate':str(i//2),'reference':{'kcal':energy,'massG':200},'ingredients':[{},{}]} for i,energy in enumerate([700,800,400,300,100,120,900,950,350,450,80,90])]
        got=select_stratified(rows,set(str(i) for i in range(12)),set(),{'0'},[('high',1),('mid',1),('low',1)],'seed')
        self.assertEqual(got,select_stratified(list(reversed(rows)),set(str(i) for i in range(12)),set(),{'0'},[('high',1),('mid',1),('low',1)],'seed'))
        self.assertEqual(len({r['captureDate'] for r in got}),3)
        self.assertNotIn('0',{r['captureDate'] for r in got})
        self.assertEqual([r['reference']['kcal']>600 for r in got],[True,False,False])
        with self.assertRaises(ValueError):select_stratified(rows,set(),set(),set(),[('high',1)],'seed')
    def test_compare_preserves_raw_reports_all_guards_and_failure_coverage(self):
        p={'kcal':100,'massG':100,'proteinG':10,'carbsG':10,'fatG':5}
        rows=[{'id':'a','reference':{k:v*1.5 for k,v in p.items()},'predicted':p}, {'id':'b','reference':p,'predicted':None}]
        saved=copy.deepcopy(rows);r=compare(rows,1.5)
        self.assertEqual(rows,saved)
        self.assertEqual(r['raw']['coverage'],.5)
        self.assertEqual(r['calibrated']['failed'],1)
        self.assertEqual(r['calibrated']['served']['mae_kcal'],0)
        self.assertTrue(r['guards']['mae_at_least_10_percent_and_10_kcal'])
        self.assertFalse(r['guards']['minimum_8_scored'])
        self.assertFalse(r['passes'])
    def test_invalid_scale_and_overflow_fail_closed(self):
        for s in [.49,2.01,float('nan'),True]:
            with self.subTest(s=s),self.assertRaises(ValueError):compare([],s)
        p=dict(kcal=1e308,massG=1e308,proteinG=1,carbsG=1,fatG=1)
        with self.assertRaises(ValueError):compare([{'id':'a','reference':p,'predicted':p}],2)

if __name__=='__main__':unittest.main()

class ResultReceiptTest(unittest.TestCase):
    def test_locked_profile_hash_and_training_ids_are_required(self):
        from tool.evaluate_portion_calibration import verify_profile
        import hashlib,json
        profile={'scale':1.2,'training_ids':['a'],'selected_training_scans':20,'usable_training_scans':16}
        raw=json.dumps(profile).encode();digest=hashlib.sha256(raw).hexdigest()
        self.assertEqual(verify_profile(raw,digest,{'a'},{'b'})['scale'],1.2)
        with self.assertRaises(ValueError):verify_profile(raw,'0'*64,{'a'},{'b'})
        with self.assertRaises(ValueError):verify_profile(raw,digest,{'b'},{'a'})
