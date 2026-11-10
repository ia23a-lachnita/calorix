"""Existing pinned public records; no model calls or new data ingestion."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('manual_food_generator',ROOT/'tool/generate_manual_food_catalog.py')
generator=importlib.util.module_from_spec(spec);spec.loader.exec_module(generator)

class ManualFoodCatalogTest(unittest.TestCase):
    def test_pinned_source_control(self):
        self.assertEqual(hashlib.sha256(generator.SOURCE.read_bytes()).hexdigest(),'bad3d924253513d093728351436cdcc6e099caba25eead2cae24778ea35ff178')
        self.assertEqual(len(json.loads(generator.SOURCE.read_bytes())['records']),73)

    def test_generated_data_matches_exact_verified_source_and_declared_pin(self):
        text=generator.render()
        self.assertEqual(generator.TARGET.read_text(),text)
        self.assertIn(generator.SOURCE.read_text().strip(),text)
        self.assertIn('bad3d924253513d093728351436cdcc6e099caba25eead2cae24778ea35ff178',text)

    def test_mutated_catalog_is_rejected_before_generation(self):
        with tempfile.TemporaryDirectory(prefix='manual-food-test-') as d:
            path=Path(d)/'catalog.json';path.write_bytes(generator.SOURCE.read_bytes()+b' ')
            with self.assertRaises(ValueError):generator.render(path)
