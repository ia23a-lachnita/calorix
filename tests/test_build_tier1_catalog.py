"""Exercise source parsing and rejection, independent of network access."""
import copy
import csv
import hashlib
import io
import unittest
import zipfile
from tool.build_tier1_catalog import build_catalog, render_typescript


def fixture(change=None):
    tables={
        'food.csv':[['fdc_id','data_type','description','food_category_id','publication_date'],
                    ['123','sr_legacy_food','Pasta, cooked','20','2019-04-01']],
        'nutrient.csv':[['id','name','unit_name'],['1008','Energy','KCAL'],['1003','Protein','G'],
                        ['1004','Total lipid (fat)','G'],['1005','Carbohydrate, by difference','G']],
        'food_nutrient.csv':[['id','fdc_id','nutrient_id','amount'],['1','123','1008','150.25'],
                             ['2','123','1003','5.25'],['3','123','1004','1.5'],['4','123','1005','29.125']],
    }
    if change:change(tables)
    raw=io.BytesIO()
    with zipfile.ZipFile(raw,'w') as z:
        for name,rows in tables.items():
            text=io.StringIO(newline='');csv.writer(text).writerows(rows)
            z.writestr('official/'+name,text.getvalue())
    data=raw.getvalue()
    selection={'version':'test-v2','sourceUrl':'https://fdc.nal.usda.gov/test.zip',
               'archiveSha256':hashlib.sha256(data).hexdigest(),
               'foods':[{'fdcId':123,'description':'Pasta, cooked','preparation':'cooked','priorG':200}]}
    return data,selection


class BuildCatalogTests(unittest.TestCase):
    def test_generated_typescript_contains_exact_version_and_records(self):
        data,selection=fixture();result=build_catalog(data,selection,'2026-11-08')
        source=render_typescript(result)
        self.assertIn("export const CATALOG_VERSION = 'test-v2';",source)
        payload=source.split('export const CATALOG = ',1)[1].removesuffix(' as const;\n')
        import json
        self.assertEqual(json.loads(payload),result['records'])

    def test_exact_fractional_values_and_source_rows_not_recomputed_energy(self):
        data,selection=fixture()
        result=build_catalog(data,selection,'2026-11-08')
        record=result['records'][0]
        self.assertEqual(record['per100'],{'kcal':150.25,'proteinG':5.25,'fatG':1.5,'carbsG':29.125})
        self.assertEqual(record['id'],'usda:123')
        self.assertEqual(record['description'],'Pasta, cooked')
        self.assertEqual(record['priorG'],200)
        self.assertEqual(record['sourceArchiveSha256'],selection['archiveSha256'])
        self.assertEqual(len(result['sourceRows'][0]['nutrientRows']),4)
        self.assertEqual(build_catalog(data,selection,'2026-11-08'),result)

    def test_archive_drift_and_description_drift_fail(self):
        data,selection=fixture()
        for key,value in [('archiveSha256','0'*64)]:
            bad=copy.deepcopy(selection);bad[key]=value
            with self.assertRaises(ValueError):build_catalog(data,bad,'2026-11-08')
        bad=copy.deepcopy(selection);bad['foods'][0]['description']='Pasta, dry'
        with self.assertRaises(ValueError):build_catalog(data,bad,'2026-11-08')

    def test_missing_nutrient_never_becomes_zero(self):
        data,selection=fixture(lambda tables:tables['food_nutrient.csv'].pop())
        with self.assertRaises(ValueError):build_catalog(data,selection,'2026-11-08')

    def test_duplicate_selected_food_or_nutrient_fails(self):
        for table in ['food.csv','food_nutrient.csv','nutrient.csv']:
            data,selection=fixture(lambda tables:tables[table].append(tables[table][1]))
            with self.subTest(table=table),self.assertRaises(ValueError):build_catalog(data,selection,'2026-11-08')

    def test_invalid_amounts_and_units_fail(self):
        for amount in ['', 'NaN','Infinity','-1','garbled']:
            data,selection=fixture(lambda tables:tables['food_nutrient.csv'][1].__setitem__(3,amount))
            with self.subTest(amount=amount),self.assertRaises(ValueError):build_catalog(data,selection,'2026-11-08')
        data,selection=fixture(lambda tables:tables['nutrient.csv'][1].__setitem__(2,'KJ'))
        with self.assertRaises(ValueError):build_catalog(data,selection,'2026-11-08')

    def test_duplicate_selection_or_invalid_prior_fails(self):
        data,selection=fixture();selection['foods']*=2
        with self.assertRaises(ValueError):build_catalog(data,selection,'2026-11-08')
        for prior in [0,-1,float('inf'),True]:
            data,selection=fixture();selection['foods'][0]['priorG']=prior
            with self.subTest(prior=prior),self.assertRaises(ValueError):build_catalog(data,selection,'2026-11-08')

    def test_raw_staples_cannot_enter_frozen_cooked_catalog(self):
        for description in ['Rice, raw','Quinoa, raw','Pasta, dry','Cereals, oats, regular, dry']:
            data,selection=fixture(lambda tables:tables['food.csv'][1].__setitem__(2,description))
            selection['foods'][0].update(description=description,preparation='unprepared')
            with self.subTest(description=description),self.assertRaises(ValueError):build_catalog(data,selection,'2026-11-08')


if __name__=='__main__':unittest.main()
