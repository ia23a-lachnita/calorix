import copy
import unittest
from tool.transfer_dataset import score_transfer


def fixture():
    cases=[];a1={};lens={}
    for i in range(20):
        identifier='nv-dish-'+str(i)
        cases.append({'id':identifier,'physicalMealId':'nutritionverse-real/dish/'+str(i),
                      'reference':dict(kcal=100,massG=100,proteinG=0,carbsG=0,fatG=0)})
        a1[identifier]={'A1':{'status':'ok'},'A0':{'status':'failed'},'estimate':{
            'components':[{'name':n,'massG':100,'nutrients':dict(kcal=100,proteinG=0,carbsG=0,fatG=0),
                           'source':{'kind':'unverified_vlm_estimate'}} for n in ['rice','chicken']],
            'totals':dict(kcal=200,proteinG=0,carbsG=0,fatG=0)}}
        lens[identifier]={'status':'ok','massG':100,'totals':dict(kcal=50,proteinG=0,carbsG=0,fatG=0)}
    return cases,a1,lens


class TransferMetricsTest(unittest.TestCase):
    def test_matched_composition_mass_arm_has_hand_calculated_zero_error(self):
        cs,a,s=fixture();before=copy.deepcopy(a);r=score_transfer(cs,a,s)
        for name,error in [('A1',100),('LensFull',50),('A1LensMass',0),('OldServingGate',50)]:
            m=r['routes'][name];self.assertEqual(m['scored'],20)
            for key in ['mae_kcal','median_absolute_error_kcal','p90_absolute_error_kcal']:
                self.assertEqual(m['served'][key],error)
        self.assertEqual(a,before)
        self.assertTrue(r['screens']['A1LensMass']['passesAll'])
        self.assertFalse(r['productionPromotable'])

    def test_failed_specialist_mass_arm_falls_back_without_hiding_failure(self):
        cs,a,s=fixture();r=score_transfer(cs,a,{})
        self.assertEqual(r['routes']['LensFull']['failed'],20)
        self.assertEqual(r['routes']['LensFull']['coverage'],0)
        self.assertIsNone(r['routes']['LensFull']['served']['mae_kcal'])
        self.assertEqual(r['routes']['A1LensMass']['scored'],20)
        self.assertEqual(r['routes']['A1LensMass']['served']['mae_kcal'],100)
        self.assertEqual(r['massArmCounts']['A1Fallback'],20)
        self.assertFalse(r['screens']['A1LensMass']['passesAll'])
        self.assertEqual(r['routes']['LensMassCounterfactual']['scored'],0)
        self.assertIsNone(r['routes']['LensMassCounterfactual']['served']['mae_kcal'])
        self.assertEqual(r['matchedMassOnly']['scoredPairs'],0)

    def test_missing_a1_does_not_create_a_fake_fused_inventory(self):
        cs,a,s=fixture();r=score_transfer(cs,{},s)
        self.assertEqual(r['routes']['A1']['failed'],20)
        self.assertEqual(r['routes']['A1LensMass']['failed'],20)
        self.assertEqual(r['routes']['LensFull']['scored'],20)
        self.assertFalse(r['screens']['LensFull']['passesAll'])

    def test_duplicate_physical_meals_or_extra_records_rejected(self):
        cs,a,s=fixture()
        with self.assertRaises(ValueError):score_transfer(cs,a|{'nv-dish-999':{}},s)
        cs[1]['physicalMealId']=cs[0]['physicalMealId']
        with self.assertRaises(ValueError):score_transfer(cs,a,s)


if __name__=='__main__':unittest.main()
