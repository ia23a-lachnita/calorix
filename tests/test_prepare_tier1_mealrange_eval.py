import copy
import unittest
from tool.prepare_tier1_mealrange_eval import select_mealrange


def data():
    rows=[]
    for index,kcal in enumerate([600]*6+[400]*5+[200]*5):
        identifier=f'dish_{1550000000+index*86400}'
        from tool.prepare_tier1_public_eval import date_of
        values={'kcal':kcal,'massG':200,'fatG':10,'carbsG':30,'proteinG':20}
        rows.append({'id':identifier,'captureDate':date_of(identifier),'reference':values,
                     'ingredients':[{'id':str(i),'name':str(i),**{k:v/2 for k,v in values.items()}} for i in [1,2]]})
    return rows,{r['id'] for r in rows},{'1':'rice','2':'chicken'}


class MealRangeTests(unittest.TestCase):
    def test_deterministic_quotas_unique_dates_and_no_reused_ids(self):
        rows,ids,vocabulary=data();used={rows[0]['id']}
        result=select_mealrange(rows,ids,set(),used,vocabulary)
        self.assertEqual(result,select_mealrange(rows,ids,set(),used,vocabulary))
        cases=result['cases'];self.assertEqual(len(cases),10)
        self.assertEqual(len({c['captureDate'] for c in cases}),10)
        self.assertFalse({c['id'] for c in cases}&used)
        self.assertEqual([sum(lo<=c['reference']['kcal']<hi for c in cases) for lo,hi in [(600,1000),(400,600),(200,400)]],[4,3,3])

    def test_legacy_dates_not_just_ids_and_invalid_source_rows_are_excluded(self):
        rows,ids,vocabulary=data();legacy={f"dish_{int(rows[0]['id'][5:])+30}"}
        rows[1]['ingredients'][0]['massG']=1 # Inconsistent source sum.
        result=select_mealrange(rows,ids,legacy,set(),vocabulary)
        selected={r['id'] for r in result['cases']}
        self.assertNotIn(rows[0]['id'],selected);self.assertNotIn(rows[1]['id'],selected)

    def test_range_mass_component_boundaries_and_no_quota_fallback(self):
        rows,ids,vocabulary=data()
        for index,kcal in [(0,1000),(1,199)]:
            rows[index]['reference']['kcal']=kcal
            for part in rows[index]['ingredients']:part['kcal']=kcal/2
        rows[2]['reference']['massG']=149
        for part in rows[2]['ingredients']:part['massG']=74.5
        with self.assertRaises(ValueError):select_mealrange(rows,ids,set(),set(),vocabulary)

    def test_not_test_or_deprecated_food_never_selected(self):
        rows,ids,vocabulary=data();ids.remove(rows[0]['id'])
        rows[1]['ingredients'][0]['id']='3';vocabulary['3']='deprecated record'
        result=select_mealrange(rows,ids,set(),set(),vocabulary)
        self.assertFalse({rows[0]['id'],rows[1]['id']}&{c['id'] for c in result['cases']})


if __name__=='__main__':unittest.main()
