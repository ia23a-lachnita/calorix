import copy,unittest
from tool.prepare_structured_paired import select_paired_cases

def dishes():
    return [{'id':f'nv-dish-{i}','physicalMealId':f'nutritionverse-real/dish/{i}',
             'reference':{'kcal':100+i,'massG':100,'proteinG':1,'carbsG':2,'fatG':3},
             'images':[f'images/dish_{i}_a.jpg',f'images/dish_{i}_b.jpg']} for i in range(24)]

class PairedSelectionTests(unittest.TestCase):
    def test_excludes_all_known_dishes_and_balances_one_photo_per_pair(self):
        rows=dishes();before=copy.deepcopy(rows)
        out=select_paired_cases(rows,{'nv-dish-0','nv-dish-1'},'fixed-development-seed')
        self.assertEqual(len(out),20);self.assertEqual(len({r['id'] for r in out}),20)
        self.assertFalse({r['id'] for r in out}&{'nv-dish-0','nv-dish-1'})
        self.assertEqual(sum(r['armOrder']==['A1','Structured'] for r in out),10)
        self.assertTrue(all(set(r['armOrder'])=={'A1','Structured'} and r['sourceImagePath'] in r['images'] for r in out))
        self.assertEqual(rows,before)

    def test_selection_and_arm_order_are_independent_of_reference_errors_and_row_order(self):
        rows=dishes();first=select_paired_cases(rows,{'nv-dish-0'},'fixed-development-seed')
        changed=list(reversed(copy.deepcopy(rows)))
        for row in changed:row['reference']['kcal']*=20;row['reference']['massG']*=5
        second=select_paired_cases(changed,{'nv-dish-0'},'fixed-development-seed')
        project=lambda xs:[(r['id'],r['sourceImagePath'],r['armOrder']) for r in xs]
        self.assertEqual(project(first),project(second))

    def test_insufficient_pool_duplicate_dishes_and_bad_exclusions_fail(self):
        for rows,excluded in [(dishes()[:19],set()),(dishes()+[dishes()[0]],set()),(dishes(),{'dish_1'}),(dishes(),['nv-dish-1','nv-dish-1'])]:
            with self.subTest(excluded=excluded):
                with self.assertRaises(ValueError):select_paired_cases(rows,excluded,'fixed-development-seed')

if __name__=='__main__':unittest.main()
