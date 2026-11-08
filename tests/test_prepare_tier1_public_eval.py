"""Synthetic arithmetic/selection fixtures only; never public accuracy evidence."""
import importlib.util
import io
import unittest
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('public_prep',ROOT/'tool/prepare_tier1_public_eval.py')
prep=importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)

def row(stamp, name='Rice, cooked', mass='3.25', kcal='12.5'):
    import csv
    out=io.StringIO();csv.writer(out).writerow([f'dish_{stamp}',kcal,mass,'0.1','2','0.3','ingr_0000000001',name,mass,kcal,'0.1','2','0.3'])
    return out.getvalue()

class PublicPreparationTest(unittest.TestCase):
    def test_real_seven_field_ingredient_layout_retains_fraction_and_quoted_name(self):
        parsed=prep.parse_dishes(row(1550000000),'cafe.csv')[0]
        self.assertEqual(parsed['ingredients'][0]['name'],'Rice, cooked')
        self.assertEqual(parsed['reference']['massG'],3.25)
        self.assertEqual(parsed['reference']['kcal'],12.5)
        self.assertEqual(len(parsed['rowFieldsSha256']),64)

    def test_whole_previous_dates_and_deprecated_records_are_excluded_before_ranking(self):
        records=prep.parse_dishes(row(1550000000)+row(1550000001)+row(1550086400)+row(1550172800),'cafe.csv')
        records[-1]['ingredients'][0]['id']='ingr_0000000231'
        selected=prep.select_sample(records,{r['id'] for r in records},{'dish_1550000000'},{'ingr_0000000001':'rice','ingr_0000000231':'deprecated'},1,'fixed-seed')
        self.assertEqual([r['id'] for r in selected['cases']],['dish_1550086400'])
        self.assertEqual(selected['selection']['exclusionCounts']['previous_id'],1)
        self.assertEqual(selected['selection']['exclusionCounts']['previous_date'],1)
        self.assertEqual(selected['selection']['exclusionCounts']['deprecated_ingredient'],1)

    def test_order_independent_selection_one_scan_per_date(self):
        records=prep.parse_dishes(''.join(row(1550000000+d*86400+s) for d in range(4) for s in range(2)),'cafe.csv')
        ids={r['id'] for r in records};v={'ingr_0000000001':'rice'}
        a=prep.select_sample(records,ids,set(),v,3,'frozen')
        b=prep.select_sample(list(reversed(records)),ids,set(),v,3,'frozen')
        self.assertEqual(a['cases'],b['cases'])
        self.assertEqual(len({r['captureDate'] for r in a['cases']}),3)

    def test_source_integrity_rejects_nonfinite_and_sum_mismatch_without_changing_labels(self):
        records=prep.parse_dishes(row(1550000000)+row(1550086400,kcal='nan')+row(1550172800),'cafe.csv')
        records[-1]['reference']['massG']=9
        result=prep.select_sample(records,{r['id'] for r in records},set(),{'ingr_0000000001':'rice'},1,'fixed')
        self.assertEqual(len(result['cases']),1)
        self.assertEqual(result['cases'][0]['reference']['massG'],3.25)
        self.assertEqual(result['selection']['exclusionCounts']['invalid_total'],1)
        self.assertEqual(result['selection']['exclusionCounts']['mass_sum_mismatch'],1)

    def test_jpeg_conversion_preserves_size_removes_metadata_and_is_repeatable(self):
        source=io.BytesIO();im=Image.new('RGB',(17,11),(120,50,30));exif=Image.Exif();exif[270]='reference-weight-must-not-leak';im.save(source,format='PNG',exif=exif)
        a=prep.convert_jpeg(source.getvalue());b=prep.convert_jpeg(source.getvalue())
        self.assertEqual(a,b)
        with Image.open(io.BytesIO(a)) as output:
            self.assertEqual(output.format,'JPEG');self.assertEqual(output.size,(17,11));self.assertEqual(dict(output.getexif()),{})

if __name__=='__main__':unittest.main()
