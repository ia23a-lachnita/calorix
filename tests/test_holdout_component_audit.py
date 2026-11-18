import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from tool.audit_holdout_components import build_audit, write_private


class HoldoutComponentAuditTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'inputs'
        self.root.mkdir()
        for d in ('photos', 'receipts'):
            (self.root / d).mkdir()
        self.csv = Path(self.tmp.name) / 'source.csv'
        self.csv.write_text('dish_id,total_food_weight,total_calories,total_protein,total_carbohydrates,total_fats,food_item_type_1,food_weight_g_1,calories(kCal)_1\n1,100,300,10,30,10,rice,90,270\n2,100,300,10,30,10,rice,100,300\n')
        self.cases = []

    def add(self, id='nv-dish-1', suspect=False, receipt=True):
        photo = self.root / 'photos' / (id + '.jpg')
        photo.write_bytes(b'unchanged-photo')
        c = dict(id=id, source='nv' if id.startswith('nv-') else 'n5k', referenceKcal=300, referenceMassG=100, photoSha256=hashlib.sha256(photo.read_bytes()).hexdigest(), suspectReference=suspect)
        self.cases.append(c)
        if receipt:
            totals = dict(kcal=160, proteinG=5, carbsG=20, fatG=5)
            self.receipt = dict(meal_id=id, estimate=dict(components=[dict(name='rice', massG=80, nutrients=totals)], totals=totals), predictions=[dict(route='A1', status='ok', served_kcal=160)])
            self.save_receipt(id)
        self.save_manifest()

    def save_receipt(self, id):
        (self.root / 'receipts' / (id + '.json')).write_text(json.dumps(self.receipt))

    def save_manifest(self):
        (self.root / 'manifest.json').write_text(json.dumps(dict(cases=self.cases)))

    def test_hand_example_reuses_diagnostic_and_preserves_source_discrepancy(self):
        self.add()
        before = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        r = build_audit(self.root, self.csv)
        self.assertEqual(r['rows'][0]['diagnostic']['referenceMassOracleKcal'], 200)
        self.assertEqual(r['groups']['nvNonsuspect']['rawMaeKcal'], 140)
        self.assertEqual(r['groups']['nvNonsuspect']['referenceMassOracleMaeKcal'], 100)
        self.assertIn('component_mass_sum_mismatch', r['rows'][0]['sourceChecks'])
        self.assertEqual(before, {p: p.read_bytes() for p in before})
        self.assertEqual(r['newModelCalls'], 0)
        self.assertFalse(r['causalAttribution'])

    def test_failures_and_suspects_stay_in_denominators(self):
        self.add(receipt=False)
        self.add('nv-dish-2', suspect=True)
        r = build_audit(self.root, self.csv)
        self.assertEqual((r['groups']['nvAll']['selected'], r['groups']['nvAll']['failed']), (2, 1))
        self.assertEqual(r['groups']['nvNonsuspect']['selected'], 1)
        self.assertEqual(r['visualSelection'], [])

    def test_selection_is_deterministic_unique_and_ignores_component_count(self):
        for i in range(1, 15):
            self.add('dish_' + str(i))
        self.add('nv-dish-1')
        self.add('nv-dish-2')
        a = build_audit(self.root, self.csv)['visualSelection']
        self.cases.reverse(); self.save_manifest()
        self.assertEqual(a, build_audit(self.root, self.csv)['visualSelection'])
        self.assertEqual(len(a), 2)
        self.assertEqual(len({x['id'] for x in a}), 2)

    def test_changed_photo_duplicate_and_unsafe_id_fail_closed(self):
        self.add()
        photo = self.root / 'photos/nv-dish-1.jpg'
        photo.write_bytes(b'changed')
        with self.assertRaises(ValueError): build_audit(self.root, self.csv)
        photo.write_bytes(b'unchanged-photo')
        self.cases.append(copy.deepcopy(self.cases[0])); self.save_manifest()
        with self.assertRaises(ValueError): build_audit(self.root, self.csv)
        self.cases = [dict(self.cases[0], id='../escape')]; self.save_manifest()
        with self.assertRaises(ValueError): build_audit(self.root, self.csv)

    def test_symlink_and_nonfinite_or_inconsistent_prediction_fail(self):
        self.add()
        photo = self.root / 'photos/nv-dish-1.jpg'
        photo.unlink(); photo.symlink_to(self.csv)
        with self.assertRaises(ValueError): build_audit(self.root, self.csv)
        photo.unlink(); photo.write_bytes(b'unchanged-photo')
        self.receipt['predictions'][0]['served_kcal'] = 400; self.save_receipt('nv-dish-1')
        with self.assertRaises(ValueError): build_audit(self.root, self.csv)
        self.receipt['predictions'][0]['served_kcal'] = 160
        self.receipt['estimate']['components'][0]['massG'] = float('nan'); self.save_receipt('nv-dish-1')
        with self.assertRaises(ValueError): build_audit(self.root, self.csv)

    def test_swapped_receipt_is_rejected_before_scoring(self):
        self.add()
        self.receipt['meal_id'] = 'nv-dish-2'
        self.save_receipt('nv-dish-1')
        with self.assertRaisesRegex(ValueError, 'meal ID'):
            build_audit(self.root, self.csv)

    def test_unknown_reference_macros_stay_absent_in_persisted_rows(self):
        self.add('dish_100')
        r = build_audit(self.root, self.csv)['rows'][0]
        self.assertFalse(r['referenceMacrosAvailable'])
        self.assertNotIn('proteinG', r['reference'])
        self.assertNotIn('referenceGeneralFactorEnergyKcal', r['diagnostic'])

    def test_nv_requires_frozen_reference_flag_instead_of_assuming_clean(self):
        self.add()
        self.cases[0].pop('suspectReference')
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'suspect flag'):
            build_audit(self.root, self.csv)

    def test_private_output_never_overwrites_or_publishes_inside_repo(self):
        out = Path(self.tmp.name) / 'result.json'
        write_private(out, dict(selected=1))
        self.assertEqual(out.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(FileExistsError): write_private(out, {})
        with self.assertRaises(ValueError): write_private(Path(__file__).resolve().parents[1] / 'private-result.json', {})
