import copy
import hashlib
from pathlib import Path
import tempfile
import unittest

from tool.transfer_dataset import parse_nv_csv, associate_images, select_transfer_cases, image_inputs

HEADER='dish_id,total_calories,total_food_weight,total_fats,total_carbohydrates,total_protein\n'


def meta(count=3):
    return parse_nv_csv(HEADER+''.join(f'{i},200,100,4,20,8\n' for i in range(count)))


def views(count=3):
    splits=[];files=[]
    for i in range(count):
        for j in range(3):
            n=f'dish_{i}_IMG_{j}_jpeg.rf.abc.jpg'
            splits.append({'file_name':n,'category':'Train' if j<2 else 'Val'})
            files.append({'name':'nutritionverse-manual/nutritionverse-manual/images/'+n})
    return splits,files


class TransferDatasetTest(unittest.TestCase):
    def test_source_columns_units_and_zero_macros(self):
        r=parse_nv_csv(HEADER+'12,125.5,87.2,0,20.1,0\n')[0]
        self.assertEqual(r['id'],'nv-dish-12')
        self.assertEqual(r['physicalMealId'],'nutritionverse-real/dish/12')
        self.assertEqual(r['reference'],dict(kcal=125.5,massG=87.2,fatG=0,carbsG=20.1,proteinG=0))

    def test_invalid_numbers_missing_columns_and_duplicate_identity_fail(self):
        for row in ['1,0,100,4,20,8','1,100,0,4,20,8','1,NaN,100,4,20,8',
                    '1,100,inf,4,20,8','1,100,100,-1,20,8','1,100,100,4,true,8']:
            with self.subTest(row=row),self.assertRaises(ValueError):parse_nv_csv(HEADER+row+'\n')
        for text in ['',HEADER,HEADER.replace('total_food_weight','unknown_weight')+'1,100,100,1,2,3\n',
                     HEADER+'1,100,100,1,2,3\n01,100,100,1,2,3\n',HEADER+'-1,100,100,1,2,3\n']:
            with self.subTest(text=text),self.assertRaises(ValueError):parse_nv_csv(text)

    def test_view_join_cross_checks_all_sources_and_groups_physical_dishes(self):
        s,f=views();out=associate_images(meta(),s,f)
        self.assertEqual(len(out),3)
        self.assertTrue(all(len(r['images'])==3 for r in out))
        self.assertEqual(len(select_transfer_cases(out,'fixture',3)),3)
        f.append({'name':'nutritionverse_dish_metadata3.csv'})
        self.assertEqual(associate_images(meta(),s,f),out)

    def test_missing_reference_unpublished_view_and_duplicate_split_rejected(self):
        s,f=views()
        for rows,files in [(s+[dict(s[0])],f),(s,f[:-1]),([dict(s[0],dish_id='99')]+s[1:],f),
                           ([dict(s[0],file_name='dish_99_IMG_1.jpg')]+s[1:],f+[{'name':'images/dish_99_IMG_1.jpg'}])]:
            with self.subTest(rows=rows),self.assertRaises(ValueError):associate_images(meta(),rows,files)

    def test_duplicate_published_basenames_and_unsafe_paths_rejected(self):
        s,f=views()
        for files in [f+[f[0]],f+[{'name':'elsewhere/'+s[0]['file_name']}],
                      [dict(f[0],name='../'+f[0]['name'])]+f[1:]]:
            with self.subTest(files=files),self.assertRaises(ValueError):associate_images(meta(),s,files)
        for n in ['../dish_0_a.jpg','/dish_0_a.jpg','images\\dish_0_a.jpg']:
            with self.subTest(n=n),self.assertRaises(ValueError):associate_images(meta(),[{'file_name':n}],f)

    def test_no_views_not_counted_as_available_dish(self):
        s,f=views(2);r=associate_images(meta(3),s,f)
        self.assertEqual({x['id'] for x in r},{'nv-dish-0','nv-dish-1'})
        with self.assertRaises(ValueError):select_transfer_cases(r,'fixture',3)

    def test_uppercase_extension_keeps_exact_published_name_identity(self):
        split=[{'file_name':'dish_0_IMG_1.JPG'}]
        files=[{'name':'images/dish_0_IMG_1.JPG'}]
        result=associate_images(meta(1),split,files)
        self.assertEqual(result[0]['images'],['images/dish_0_IMG_1.JPG'])
        self.assertEqual(len(select_transfer_cases(result,'fixture',1)),1)

    def test_twenty_dishes_one_view_each_stable_under_input_permutation(self):
        s,f=views(25);rows=associate_images(meta(25),s,f)
        chosen=select_transfer_cases(rows,'fixture',20)
        other=associate_images(list(reversed(meta(25))),list(reversed(s)),list(reversed(f)))
        self.assertEqual(select_transfer_cases(other,'fixture',20),chosen)
        self.assertEqual(len({r['physicalMealId'] for r in chosen}),20)
        self.assertTrue(all('sourceImagePath' in r for r in chosen))
        ranked=sorted(rows,key=lambda r:(hashlib.sha256(('fixture|dish|'+r['id'].removeprefix('nv-dish-')).encode()).hexdigest(),r['id'].removeprefix('nv-dish-')))
        self.assertEqual([r['id'] for r in chosen],[r['id'] for r in ranked[:20]])

    def test_selection_ignores_reference_values_and_keeps_source_unchanged(self):
        s,f=views(25);rows=associate_images(meta(25),s,f);before=copy.deepcopy(rows)
        ids=lambda rs:[(r['id'],r['sourceImagePath']) for r in rs]
        chosen=select_transfer_cases(rows,'fixture',20);self.assertEqual(rows,before)
        for r in rows:r['reference']['kcal']=999999
        self.assertEqual(ids(select_transfer_cases(rows,'fixture',20)),ids(chosen))

    def test_selection_rejects_bad_count_identity_or_foreign_view(self):
        s,f=views();rs=associate_images(meta(),s,f)
        for count in [0,21,True,4]:
            with self.subTest(count=count),self.assertRaises(ValueError):select_transfer_cases(rs,'fixture',count)
        with self.assertRaises(ValueError):select_transfer_cases(rs+[rs[0]],'fixture',2)
        bad=copy.deepcopy(rs);bad[0]['images']=[rs[1]['images'][0]]
        with self.assertRaises(ValueError):select_transfer_cases(bad,'fixture',2)

    def test_image_projection_strips_all_measured_labels_and_checks_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'inputs').mkdir();p=root/'inputs/photo.jpg';p.write_bytes(b'owned-fixture')
            c={'id':'nv-dish-1','reference':{'kcal':12345},'dataset':'secret',
               'inputPath':'inputs/photo.jpg','inputSha256':hashlib.sha256(p.read_bytes()).hexdigest()}
            result=image_inputs([c],root)[0]
            self.assertEqual(set(result),{'id','inputFile','inputSha256'})
            self.assertEqual(result['inputFile'],str(p.resolve()))
            with self.assertRaises(ValueError):image_inputs([dict(c,inputPath='../photo.jpg')],root)
            with self.assertRaises(ValueError):image_inputs([dict(c,id='../escape')],root)
            p.write_bytes(b'changed')
            with self.assertRaises(ValueError):image_inputs([c],root)


if __name__=='__main__':unittest.main()
