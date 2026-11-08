"""Synthetic arithmetic fixtures only; these are not weighed-meal evidence."""
import copy
import unittest
from evaluate_meals import evaluate, reference_energy


def meal(identity='m1'):
    return {'meal_id': identity, 'physical_meal_id': identity, 'meal_type': 'mixed',
            'reference_served_grade': 'A', 'reference_consumed_grade': 'unknown',
            'ingredients': [{'ingredient_id': 'rice', 'ingredient_input_g': 100, 'ingredient_kcal_per_g': 3.6,
                             'ingredient_energy_source': {'record_id': 'test-rice', 'version': 'synthetic-1'}}],
            'cooking_batches': [{'cooking_batch_id': 'batch', 'ingredient_allocations': [
                {'ingredient_id': 'rice', 'energy_fraction': 1, 'mass_fraction': 1}],
                'batch_cooked_edible_mass_g': 300, 'homogeneous': True,
                'discarded_edible_energy_kcal': 0, 'other_energy_losses_kcal': 0,
                'retention_assumption': 'water absorbed; energy retained'}],
            'plated_components': [{'plated_component_id': 'dish', 'serving_cooked_mass_g': 150,
                'source_allocations': [{'source_type': 'batch', 'source_id': 'batch',
                'component_energy_allocation_fraction': .5, 'component_mass_allocation_fraction': .5,
                'allocation_method': 'homogeneous_yield'}]}], 'predictions': []}


def prediction(route, kcal, status='ok'):
    return {'route': route, 'status': status, 'served_kcal': kcal,
            'model_version': 'test-1', 'prompt_sha256': '0'*64,
            'nutrient_data_version': 'test-db-1', 'preparation_context_id': 'same-context',
            'latency_ms': 1000, 'cost_usd': None, 'corrections': 0, 'missing_foods': []}


class EvaluatorTest(unittest.TestCase):
    def test_cooking_yield_adjusts_density_not_batch_energy(self):
        self.assertEqual(reference_energy(meal())['served_kcal'], 180)
        self.assertIsNone(reference_energy(meal())['consumed_kcal'])

    def test_ingredient_splits_across_two_components_and_batches(self):
        m = meal()
        second = copy.deepcopy(m['plated_components'][0])
        second['plated_component_id'] = 'second'
        m['plated_components'].append(second)
        self.assertEqual(reference_energy(m)['served_kcal'], 360)
        second['source_allocations'][0]['component_energy_allocation_fraction'] = .6
        with self.assertRaises(ValueError):
            reference_energy(m)

    def test_heterogeneous_batch_requires_defensible_allocation(self):
        m = meal()
        m['cooking_batches'][0]['homogeneous'] = False
        with self.assertRaises(ValueError):
            reference_energy(m)

    def test_aggregate_error_includes_missing_foods_and_keeps_failures_in_denominator(self):
        a, b = meal(), meal('m2')
        a['predictions'] = [prediction('A0', 100), prediction('A1', 200)]
        b['predictions'] = [prediction('A0', 240), prediction('A1', None, 'failed')]
        report = evaluate({'schema_version': '1.0', 'meals': [a, b]})
        self.assertEqual(report['physical_meals'], 2)
        self.assertEqual(report['routes']['A0']['served']['mae_kcal'], 70)
        self.assertEqual(report['routes']['A0']['served']['bias_kcal'], -10)
        self.assertEqual(report['routes']['A0']['served']['p90_absolute_error_kcal'], 78)
        self.assertEqual(report['routes']['A1']['coverage'], .5)
        self.assertEqual(report['routes']['A1']['failed'], 1)
        self.assertEqual(report['paired']['scored_meals'], 1)
        self.assertIsNone(report['routes']['A1']['consumed']['mae_kcal'])
        self.assertIsNone(report['routes']['A1']['cost_usd_total'])
        self.assertEqual(report['routes']['A1']['served']['mean_normalized_absolute_error'], .1)

    def test_no_measurements_means_null_accuracy_and_zero_coverage(self):
        report = evaluate({'schema_version': '1.0', 'meals': []})
        self.assertEqual(report['physical_meals'], 0)
        self.assertIsNone(report['routes']['A1']['served']['mae_kcal'])
        self.assertEqual(report['routes']['A1']['coverage'], 0)

    def test_duplicate_physical_meals_and_nonfinite_values_are_rejected(self):
        with self.assertRaises(ValueError):
            evaluate({'schema_version': '1.0', 'meals': [meal(), meal('m1')]})
        m = meal()
        m['predictions'] = [prediction('A1', float('nan'))]
        with self.assertRaises(ValueError):
            evaluate({'schema_version': '1.0', 'meals': [m]})

    def test_consumed_reference_requires_independent_confirmation(self):
        m = meal()
        m['reference_consumed_grade'] = 'A'
        with self.assertRaises(ValueError):
            reference_energy(m)
        m['consumed_reference_method'] = 'confirmed_ate_all'
        self.assertEqual(reference_energy(m)['consumed_kcal'], 180)

    def test_inference_and_shutter_latency_are_separate_observations(self):
        m = meal()
        p = prediction('A1', 180)
        p['shutter_to_estimate_ms'] = 20000
        m['predictions'] = [p]
        report = evaluate({'schema_version': '1.0', 'meals': [m]})['routes']['A1']
        self.assertEqual(report['inference_latency_ms']['p50'], 1000)
        self.assertEqual(report['shutter_to_estimate_ms']['p50'], 20000)
        del p['shutter_to_estimate_ms']
        report = evaluate({'schema_version': '1.0', 'meals': [m]})['routes']['A1']
        self.assertIsNone(report['shutter_to_estimate_ms']['p50'])

    def test_direct_ingredient_energy_mass_divergence_needs_evidence(self):
        m = meal()
        m['cooking_batches'] = []
        m['plated_components'][0]['serving_cooked_mass_g'] = 100
        m['plated_components'][0]['source_allocations'] = [{
            'source_type': 'ingredient', 'source_id': 'rice',
            'component_energy_allocation_fraction': 0,
            'component_mass_allocation_fraction': 1,
            'allocation_method': 'measured_ingredient_allocation'}]
        with self.assertRaises(ValueError):
            reference_energy(m)


if __name__ == '__main__':
    unittest.main()
