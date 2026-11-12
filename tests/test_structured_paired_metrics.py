import copy,unittest
from tool.structured_paired_metrics import score_paired

def fixtures():
    def estimate(kcal):return {'components':[{'massG':100,'nutrients':{'kcal':kcal,'proteinG':2,'carbsG':3,'fatG':4}}],'totals':{'kcal':kcal,'proteinG':2,'carbsG':3,'fatG':4}}
    cases=[{'id':f'nv-dish-{i}','physicalMealId':f'nutritionverse-real/dish/{i}','reference':{'kcal':200,'massG':100,'proteinG':2,'carbsG':3,'fatG':4},'sourceFoodItemCount':1 if i<10 else 2} for i in range(20)]
    rows={c['id']:{'id':c['id'],'arms':{'A1':{'status':'ok','failure':None,'estimate':estimate(300)},'Structured':{'status':'ok','failure':None,'receipt':{'estimate':estimate(250)},'decision':{'status':'fallback','reason':'multiple_components','estimate':estimate(250)}}}} for c in cases}
    status={'selected':20,'halted':False,'unknownInFlight':False,'pending':0,'notAttempted':0}
    return cases,rows,status

class StructuredPairedMetricsTests(unittest.TestCase):
    def test_whole_meal_metrics_preserve_all_twenty_and_same_pair_scope(self):
        cases,rows,status=fixtures();result=score_paired(cases,rows,status)
        self.assertEqual(result['routes']['A1']['served']['mae_kcal'],100)
        self.assertEqual(result['routes']['OperationalV2']['served']['mae_kcal'],50)
        self.assertEqual(result['routes']['OperationalV2']['served']['mean_normalized_absolute_error'],.25)
        self.assertEqual(result['pairedValid']['count'],20);self.assertTrue(result['screen']['passes'])
        self.assertFalse(result['productionPromotable']);self.assertEqual(result['normalizedDenominatorFloorKcal'],200)
        self.assertEqual(result['sourceItemStrata']['multipleSourceItems']['A1']['scored'],10)
        self.assertEqual(result['matchedPrior']['count'],0)

    def test_terminal_timeout_is_missing_not_zero_and_only_paired_subset_is_compared(self):
        cases,rows,status=fixtures();rows[cases[0]['id']]['arms']['Structured']={'status':'failed','failure':'http_504'}
        result=score_paired(cases,rows,status)
        self.assertEqual(result['routes']['OperationalV2']['coverage'],.95)
        self.assertEqual(result['routes']['A1']['scored'],20)
        self.assertEqual(result['routes']['OperationalV2']['served']['mae_kcal'],50)
        self.assertEqual(result['pairedValid']['count'],19);self.assertEqual(result['pairedValid']['A1']['scored'],19)
        self.assertFalse(result['screen']['passes']);self.assertEqual(result['failures']['Structured']['http_504'],1)

    def test_linear_p90_median_and_normalization_floor_match_literal_values(self):
        cases,rows,status=fixtures()
        for i,c in enumerate(cases):
            p=200+i;rows[c['id']]['arms']['A1']['estimate']['totals']['kcal']=p;rows[c['id']]['arms']['A1']['estimate']['components'][0]['nutrients']['kcal']=p
        result=score_paired(cases,rows,status);v=result['routes']['A1']['served']
        self.assertAlmostEqual(v['p90_absolute_error_kcal'],17.1);self.assertEqual(v['median_absolute_error_kcal'],9.5)
        cases[0]['reference']['kcal']=100;result=score_paired(cases,rows,status)
        self.assertAlmostEqual(result['routes']['A1']['served']['mean_normalized_absolute_error'],.0725)

    def test_raw_candidate_and_operational_prior_are_separate_with_matched_pair_coverage(self):
        cases,rows,status=fixtures();r=rows[cases[0]['id']]['arms']['Structured'];r['decision']['status']='applied';r['decision']['estimate']['totals']['kcal']=200;r['decision']['estimate']['components'][0]['nutrients']['kcal']=200
        result=score_paired(cases,rows,status)
        self.assertEqual(result['routes']['StructuredRaw']['served']['mae_kcal'],50)
        self.assertEqual(result['matchedPrior']['count'],1)
        self.assertEqual(result['matchedPrior']['A1']['served']['mae_kcal'],100)
        self.assertEqual(result['matchedPrior']['OperationalV2']['served']['mae_kcal'],0)

    def test_incomplete_or_corrupt_receipts_are_not_a_completed_study(self):
        for mutate in [lambda c,r,s:s.update(halted=True),lambda c,r,s:s.update(pending=1),lambda c,r,s:r.pop(c[0]['id']),lambda c,r,s:r[c[0]['id']]['arms']['A1'].update(status='pending'),lambda c,r,s:r[c[0]['id']]['arms']['A1']['estimate']['totals'].update(kcal=True),lambda c,r,s:c[0]['reference'].update(kcal=float('nan'))]:
            cases,rows,status=fixtures();mutate(cases,rows,status)
            with self.assertRaises(ValueError):score_paired(cases,rows,status)

    def test_systemic_failure_cannot_masquerade_as_terminal_case_failure(self):
        cases,rows,status=fixtures();rows[cases[0]['id']]['arms']['A1']={'status':'failed','failure':'http_429'}
        with self.assertRaises(ValueError):score_paired(cases,rows,status)

if __name__=='__main__':unittest.main()
