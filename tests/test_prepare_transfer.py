import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image
from tool.prepare_transfer_eval import prepare_transfer

METADATA='nutritionverse_dish_metadata3.csv'
SPLITS='nutritionverse-manual/nutritionverse-manual/updated-manual-dataset-splits.csv'


class PreparationTest(unittest.TestCase):
    def fixture(self,root):
        metadata=b'dish_id,total_calories,total_food_weight,total_fats,total_carbohydrates,total_protein\n0,100,100,0,10,0\n1,200,200,1,20,5\n'
        names=[f'nutritionverse-manual/nutritionverse-manual/images/dish_{i}_IMG_{j}.jpg' for i in range(2) for j in range(2)]
        splits=('file_name,category\n'+''.join(Path(n).name+',Val\n' for n in names)).encode()
        b=io.BytesIO();Image.new('RGB',(32,24),(120,130,140)).save(b,format='JPEG');image=b.getvalue()
        data={METADATA:metadata,SPLITS:splits,**{n:image for n in names}}
        rights=root/'rights.json';rights.write_text(json.dumps({'rights':{'evaluationAllowed':True,'purpose':'personal_noncommercial_evaluation','decisionEvidence':'owned synthetic fixtures only'}}))
        files=root/'files.json';files.write_text(json.dumps([{'name':n,'totalBytes':len(b)} for n,b in data.items()]))
        return rights,files,data

    def test_rights_gate_prevents_all_data_access(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);rights=root/'rights.json';rights.write_text('{}');called=[]
            with self.assertRaises(ValueError):prepare_transfer(rights,root/'absent.json',root/'out',2,lambda *a:called.append(a))
            self.assertFalse(called);self.assertFalse((root/'out').exists())

    def test_freeze_precedes_pixels_and_only_one_view_per_dish_is_fetched(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);rights,files,data=self.fixture(root);output=root/'out';calls=[]
            def fetch(name,budget):
                calls.append(name)
                if name.endswith('.jpg'):
                    selection=json.loads((output/'selection.json').read_text());self.assertEqual(len(selection['cases']),2)
                return data[name]
            manifest=prepare_transfer(rights,files,output,2,fetch)
            self.assertEqual(len(calls),4)
            self.assertEqual(len({c['physicalMealId'] for c in manifest['cases']}),2)
            self.assertEqual(sum(c['inputStatus']=='ready' for c in manifest['cases']),2)
            import hashlib
            self.assertEqual(manifest['selectionSha256'],hashlib.sha256((output/'selection.json').read_bytes()).hexdigest())
            for c in manifest['cases']:
                with Image.open(output/c['inputPath']) as image:self.assertEqual(image.mode,'RGB');self.assertFalse(image.getexif())
            with self.assertRaises(FileExistsError):prepare_transfer(rights,files,output,2,fetch)
            self.assertEqual(len(calls),4)

    def test_bad_photo_kept_as_failure_without_replacement(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);rights,files,data=self.fixture(root);calls=[]
            def fetch(name,budget):
                calls.append(name)
                if name.endswith('.jpg'):raise OSError('owned fixture transport failure')
                return data[name]
            manifest=prepare_transfer(rights,files,root/'out',2,fetch)
            self.assertEqual(len(calls),4)
            self.assertEqual(len(manifest['cases']),2)
            self.assertTrue(all(c['inputStatus']=='dataset_failure' for c in manifest['cases']))


if __name__=='__main__':unittest.main()
