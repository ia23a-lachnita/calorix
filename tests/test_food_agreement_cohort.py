import copy
import unittest
from tool.prepare_food_agreement_eval import validate_groups, exclude_prior_groups


def rows():
    return [dict(dish_id='dish_1000000001',group='1',split='train',test_clean='0',has_overhead='1'),
            dict(dish_id='dish_1000000002',group='1',split='test',test_clean='0',has_overhead='1'),
            dict(dish_id='dish_1000000003',group='2',split='test',test_clean='1',has_overhead='1'),
            dict(dish_id='dish_1000000004',group='3',split='test',test_clean='1',has_overhead='1')]


class CohortTest(unittest.TestCase):
    def test_known_group_overlap_excludes_all_views_not_just_id(self):
        meta=validate_groups(rows())
        dishes=[{'id':r['dish_id']} for r in rows()]
        selected=exclude_prior_groups(dishes,meta,{'dish_1000000003'})
        self.assertEqual([r['id'] for r in selected],['dish_1000000004'])

    def test_missing_prior_or_unknown_metadata_fails_closed(self):
        m=validate_groups(rows())
        with self.assertRaises(ValueError):exclude_prior_groups([],m,{'dish_1999999999'})
        self.assertEqual(exclude_prior_groups([{'id':'dish_1999999999'}],m,set()),[])

    def test_metadata_integrity_rejects_duplicate_flags_and_train_val_overlap(self):
        for kind in ['duplicate','flag','clean_train','exposed_clean','invalid_split','train_val']:
            rs=copy.deepcopy(rows())
            if kind=='duplicate':rs.append(rs[0])
            elif kind=='flag':rs[0]['has_overhead']='True'
            elif kind=='clean_train':rs[0]['test_clean']='1'
            elif kind=='exposed_clean':rs[1]['test_clean']='1'
            elif kind=='invalid_split':rs[0]['split']='validation'
            else:rs.append(dict(rs[0],dish_id='dish_1000000005',split='val'))
            with self.subTest(kind=kind),self.assertRaises(ValueError):validate_groups(rs)

    def test_rejects_missing_or_malformed_group(self):
        for group in ['', '-1','1.0',True]:
            rs=rows();rs[0]['group']=group
            with self.subTest(group=group),self.assertRaises(ValueError):validate_groups(rs)

    def test_unavailable_overhead_and_held_out_group_filtered(self):
        rs=rows();rs[3]['has_overhead']='0';m=validate_groups(rs)
        self.assertEqual(exclude_prior_groups([{'id':r['dish_id']} for r in rs],m,{'dish_1000000003'}),[])


if __name__=='__main__':unittest.main()
