import unittest
from tool.run_food_agreement_eval import image_case, score_routes


class EvaluationTest(unittest.TestCase):
    def test_reference_and_path_escape_rejected_at_worker_boundary(self):
        c={'id':'dish_1000000001','inputFile':'/disk/input.jpg','inputSha256':'a'*64}
        self.assertEqual(image_case(c),c)
        for bad in [dict(c,reference={'kcal':1}),dict(c,id='../escape'),dict(c,inputSha256='x'),dict(c,inputFile='relative.jpg')]:
            with self.subTest(bad=bad),self.assertRaises(ValueError):image_case(bad)

    def test_fixed_failure_denominator_and_no_invented_zero_error(self):
        ref=dict(kcal=100,massG=100,proteinG=1,carbsG=2,fatG=3)
        cases=[{'id':'dish_1000000001','reference':ref},{'id':'dish_1000000002','reference':ref}]
        result=score_routes(cases,{}, {})
        for name in ['A1','Lens','old','agreement']:
            self.assertEqual(result['routes'][name]['attempted'],2)
            self.assertEqual(result['routes'][name]['scored'],0)
            self.assertEqual(result['routes'][name]['coverage'],0)
            self.assertIsNone(result['routes'][name]['served']['mae_kcal'])
        self.assertFalse(result['screen']['passesAll'])
        self.assertFalse(result['productionPromotable'])

    def test_duplicate_or_extra_records_not_silently_ignored(self):
        c={'id':'dish_1000000001','reference':{}}
        with self.assertRaises(ValueError):score_routes([c,c],{}, {})
        with self.assertRaises(ValueError):score_routes([c],{'unexpected':{}}, {})

    def test_valid_complete_cohort_has_hand_calculated_errors(self):
        cases=[];a={};s={}
        for i in range(20):
            identifier=f'dish_{1000000000+i}'
            cases.append({'id':identifier,'reference':dict(kcal=100,massG=200,proteinG=1,carbsG=2,fatG=3)})
            a[identifier]={'A1':{'status':'ok'},'estimate':{
                'components':[{'name':'rice','massG':100},{'name':'chicken','massG':100}],
                'totals':dict(kcal=200,proteinG=1,carbsG=2,fatG=3)}}
            s[identifier]={'status':'ok','massG':200,'totals':dict(kcal=150,proteinG=1,carbsG=2,fatG=3),
                'publisherSummary':{'totals':{'mass_g':200},'other':{'grams':0},'ingredients':[
                    {'name':'rice','grams':100,'confidence':.9},{'name':'chicken','grams':100,'confidence':.9}]}}
        result=score_routes(cases,a,s)
        for name,error in [('A1',100),('Lens',50),('old',50),('agreement',50)]:
            m=result['routes'][name]
            self.assertEqual(m['scored'],20)
            for field in ['mae_kcal','bias_kcal','median_absolute_error_kcal','p90_absolute_error_kcal']:
                self.assertEqual(m['served'][field],error)
        self.assertTrue(result['screen']['passesAll'])
        self.assertFalse(result['productionPromotable'])


if __name__=='__main__':unittest.main()
