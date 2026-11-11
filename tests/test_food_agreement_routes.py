import copy
import math
import unittest

from tool.food_agreement_routes import route_food_agreement


def baseline(parts=None):
    return {'components': [{'name': n, 'massG': g} for n, g in
                           (parts or [('rice', 100), ('chicken', 100)])],
            'totals': dict(kcal=400, proteinG=20, carbsG=40, fatG=10)}


def lens(parts=None, other=20):
    parts = parts or [('rice', 100), ('chicken', 100)]
    mass = sum(g for _, g in parts) + other
    return {'status': 'ok', 'massG': mass,
            'totals': dict(kcal=350, proteinG=25, carbsG=30, fatG=8),
            'nutrientSourceKind': 'published_dataset_table_estimate',
            'publisherSummary': {'ingredients': [
                {'name': n, 'grams': g, 'confidence': .9} for n, g in parts],
                'other': {'grams': other}, 'totals': {'mass_g': mass}}}


class Poisoned(dict):
    def __getitem__(self, key):
        if key in ('id', 'reference', 'dataset', 'group', 'split'):
            raise AssertionError('Forbidden field read')
        return super().__getitem__(key)

    def get(self, key, default=None):
        if key in ('id', 'reference', 'dataset', 'group', 'split'):
            raise AssertionError('Forbidden field read')
        return super().get(key, default)

    def __iter__(self):
        raise AssertionError('Whole prediction iteration forbidden')


class FoodAgreementTest(unittest.TestCase):
    def assert_fallback(self, a, s):
        result = route_food_agreement(a, s)
        self.assertEqual(result['selectedSource'], 'A1')
        self.assertEqual(result['totals'], a['totals'])
        self.assertFalse(result['referenceUsed'])
        return result

    def test_agreement_selects_whole_specialist_without_fusion(self):
        s = lens(); result = route_food_agreement(baseline(), s)
        self.assertEqual(result['selectedSource'], 'specialist')
        self.assertEqual(result['totals'], s['totals'])
        self.assertEqual(result['massG'], 220)
        self.assertEqual(result['nutrientSourceKind'], s['nutrientSourceKind'])
        self.assertFalse(result['identityAndPortionVerified'])

    def test_food_conflict_keeps_a1(self):
        self.assert_fallback(baseline(), lens([('rice', 100), ('beef', 100)]))

    def test_large_unknown_or_unidentified_mass_keeps_a1(self):
        self.assert_fallback(baseline(), lens(other=100))
        self.assert_fallback(baseline([('unknown casserole', 100), ('rice', 100)]), lens())
        self.assert_fallback(baseline(), lens([('rice', 80), ('chicken', 80), ('unknown casserole', 100)]))

    def test_known_word_does_not_cover_unrecognized_remainder_of_component(self):
        for name in ['rice with mystery sauce', 'rice and unknown casserole', 'chicken sushi']:
            a=baseline([(name,100),('chicken' if name.startswith('rice') else 'rice',100)])
            with self.subTest(name=name): self.assert_fallback(a,lens())

    def test_specific_foods_do_not_match_shorter_conflicting_names(self):
        for a, s in [
            ([('egg whites', 100), ('rice', 100)], [('eggs', 100), ('rice', 100)]),
            ([('sweet potato', 100), ('chicken', 100)], [('potatoes', 100), ('chicken', 100)]),
            ([('turkey bacon', 100), ('rice', 100)], [('bacon', 100), ('rice', 100)]),
            ([('tuna salad', 100), ('rice', 100)], [('tuna', 100), ('rice', 100)]),
        ]:
            with self.subTest(a=a): self.assert_fallback(baseline(a), lens(s))

    def test_preparation_words_plural_and_case_can_match(self):
        a = baseline([('STEAMED white rice', 100), ('Roasted chicken breast, diced', 100)])
        self.assertEqual(route_food_agreement(a, lens([('white rice', 100), ('grilled chicken', 100)]))['selectedSource'], 'specialist')

    def test_alternative_identity_not_silently_resolved(self):
        for n in ['rice or quinoa', 'rice / quinoa']:
            self.assert_fallback(baseline([(n, 100), ('chicken', 100)]), lens())

    def test_two_distinct_groups_required(self):
        self.assert_fallback(baseline([('rice', 100), ('white rice', 100)]), lens([('rice', 200)]))

    def test_serving_domain_boundary_and_single_food(self):
        self.assert_fallback(baseline([('rice', 75), ('chicken', 74.99)]), lens())
        self.assertEqual(route_food_agreement(baseline([('rice', 75), ('chicken', 75)]), lens())['selectedSource'], 'specialist')
        self.assert_fallback(baseline([('rice', 200)]), lens())

    def test_eighty_percent_boundary_in_both_directions(self):
        a = baseline([('rice', 100), ('chicken', 100), ('unmapped', 50)])
        s = lens([('rice', 80), ('chicken', 80)], other=40)
        self.assertEqual(route_food_agreement(a, s)['selectedSource'], 'specialist')
        self.assert_fallback(baseline([('rice', 100), ('chicken', 100), ('unmapped', 50.01)]), s)
        self.assert_fallback(a, lens([('rice', 80), ('chicken', 80)], other=40.01))

    def test_invalid_specialist_quantities_and_schema_fall_back(self):
        for bad in [True, -1, math.nan, math.inf, '200', None]:
            for path in [('massG',), ('totals', 'kcal'), ('publisherSummary', 'other', 'grams'),
                         ('publisherSummary', 'ingredients', 0, 'grams'),
                         ('publisherSummary', 'ingredients', 0, 'confidence')]:
                s = lens(); obj = s
                for key in path[:-1]: obj = obj[key]
                obj[path[-1]] = bad
                with self.subTest(bad=bad, path=path): self.assert_fallback(baseline(), s)
        for s in [None, [], {}, {'status': 'failed'}, {'status': 'ok'}, lens(other=200)]:
            self.assert_fallback(baseline(), s)
        for confidence in [.649, 1.001]:
            s=lens();s['publisherSummary']['ingredients'][0]['confidence']=confidence
            self.assert_fallback(baseline(), s)

    def test_inconsistent_summary_and_duplicate_names_are_invalid(self):
        for field in ['massG', 'summary', 'sum']:
            s = lens()
            if field == 'massG': s['massG'] += 5
            elif field == 'summary': s['publisherSummary']['totals']['mass_g'] += 5
            else: s['publisherSummary']['other']['grams'] += 5
            self.assert_fallback(baseline(), s)
        self.assert_fallback(baseline(), lens([('rice', 100), ('rice', 100)]))

    def test_failed_a1_is_explicit_failure(self):
        a = baseline();a['components'][0]['massG'] = True
        for value in [a, None, {}, [], baseline([('rice', 0), ('chicken', 100)])]:
            result = route_food_agreement(value, lens())
            self.assertEqual(result['status'], 'failed')
            self.assertIsNone(result['totals'])

    def test_reference_metadata_cannot_change_decision_or_be_read(self):
        expected = route_food_agreement(baseline(), lens())
        a = Poisoned(baseline());s = Poisoned(lens())
        a['components'] = [Poisoned(c) for c in a['components']]
        s['publisherSummary']['ingredients'] = [Poisoned(c) for c in s['publisherSummary']['ingredients']]
        self.assertEqual(route_food_agreement(a, s), expected)
        for obj in [a, s]: obj.update(reference={'kcal': -999, 'massG': 99999}, id='winner', dataset='secret')
        self.assertEqual(route_food_agreement(a, s), expected)

    def test_determinism_and_no_input_mutation(self):
        a=baseline();s=lens();before=copy.deepcopy((a,s))
        first=route_food_agreement(a,s)
        self.assertEqual(route_food_agreement(a,s),first)
        self.assertEqual((a,s),before)


if __name__ == '__main__': unittest.main()
