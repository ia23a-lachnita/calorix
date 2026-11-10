"""Synthetic arithmetic/coverage fixtures only, never evidence of user benefit."""
import copy
import unittest
from evaluate_workflows import evaluate_workflows
from test_evaluate_meals import meal


def correction(before=100,after=170,prior=0,original=True):
    return {'kind':'portion_saved','sessionId':'session','sequence':0,
        'atUtc':'2026-11-09T12:00:00.000Z','timingValid':True,
        'elapsedMs':2000,'foregroundMs':2000,'waitingMs':0,
        'beforeKcal':before,'afterKcal':after,'fromG':100,'toG':170,'portionIndex':0,
        'beforeFromOriginalAnalysis':original,'priorPortionAdjustmentCount':prior,
        'dialogForegroundMs':1200}


def export(events=None,identity='m1',**flags):
    return {'schemaVersion':1,'scope':'currently_retained_meals',
        'exportedAtUtc':'2026-11-09T12:00:00.000Z','referenceIsWeighed':False,
        'timingDefinition':'editor_foreground_minus_analysis_wait_proxy_v1',
        'measurementEnabled':True,'currentProcessWriteFailures':0,
        'meals':[{'mealId':identity,'source':'A1','currentServedKcal':170,
            'events':[correction()] if events is None else events,
            'missingMeasurements':False,'readFailure':False,'droppedEvents':0,'truncated':False,**flags}]}


def references(*rows):return {'schema_version':'1.0','meals':list(rows)}


class WorkflowEvaluatorTest(unittest.TestCase):
    def test_v2_food_action_coverage_does_not_invent_accuracy_pairs(self):
        event={**correction(),'kind':'food_saved'}
        data=export([event]);data['schemaVersion']=2;data['meals'][0]['source']='food_correction'
        result=evaluate_workflows(data,references(meal()))
        self.assertEqual(result['paired_served_A']['scored_meals'],0)
        self.assertEqual(result['action_counts']['food_saved'],1)
        self.assertIsNone(result['timing']['actual_active_user_ms'])

    def test_v2_later_food_change_does_not_remove_prior_portion_pair(self):
        data=export([correction(),{**correction(),'kind':'food_saved','sequence':1}]);data['schemaVersion']=2
        self.assertEqual(evaluate_workflows(data,references(meal()))['paired_served_A']['scored_meals'],1)

    def test_v1_rejects_food_kinds_and_v2_still_rejects_private_fields(self):
        data=export([{**correction(),'kind':'food_saved'}])
        with self.assertRaises(ValueError):evaluate_workflows(data,references(meal()))
        data['schemaVersion']=2;data['meals'][0]['events'][0]['recordId']='usda:168878'
        with self.assertRaises(ValueError):evaluate_workflows(data,references(meal()))

    def test_unhashable_identity_fields_are_schema_errors(self):
        for field in ['kind','answerCode','source']:
            for value in [{},[]]:
                with self.subTest(field=field,value=value):
                    data=export()
                    target=data['meals'][0] if field=='source' else data['meals'][0]['events'][0]
                    target[field]=value
                    with self.assertRaises(ValueError):evaluate_workflows(data,references(meal()))

    def test_yield_adjusted_before_after_pair_uses_the_same_served_reference(self):
        r=evaluate_workflows(export(),references(meal()))
        self.assertEqual(r['paired_served_A']['before']['mae_kcal'],80)
        self.assertEqual(r['paired_served_A']['after']['mae_kcal'],10)
        self.assertEqual(r['paired_served_A']['mean_absolute_error_reduction_kcal'],70)
        self.assertEqual(r['paired_served_A']['after']['mean_normalized_absolute_error'],.05)
        self.assertEqual(r['paired_served_A']['scored_meals'],1)
        self.assertEqual(r['timing']['portion_dialog_foreground_proxy_ms']['p50'],1200)
        self.assertIsNone(r['timing']['actual_active_user_ms'])
        self.assertIsNone(r['consumed_accuracy'])

    def test_later_edits_do_not_remove_first_pair_or_create_extra_primary_samples(self):
        later={**correction(after=300,prior=1),'sequence':1}
        r=evaluate_workflows(export([correction(),later]),references(meal()))
        self.assertEqual(r['paired_served_A']['scored_meals'],1)
        self.assertEqual(r['paired_served_A']['after']['mae_kcal'],10)
        self.assertEqual(r['coverage']['later_portion_adjustments'],1)

    def test_missing_exported_and_reference_meals_remain_visible_in_coverage(self):
        data=export();data['meals'].append({**data['meals'][0],'mealId':'unlinked'})
        r=evaluate_workflows(data,references(meal(),meal('missing')))
        self.assertEqual(r['coverage']['reference_meals'],2)
        self.assertEqual(r['coverage']['exported_meals'],2)
        self.assertEqual(r['coverage']['references_without_export'],1)
        self.assertEqual(r['coverage']['exports_without_reference'],1)
        self.assertEqual(r['coverage']['paired_served_A_coverage'],.5)

    def test_served_B_is_sensitivity_and_unknown_consumed_is_not_zero(self):
        m=meal();m['reference_served_grade']='B'
        r=evaluate_workflows(export(),references(m))
        self.assertEqual(r['paired_served_A']['scored_meals'],0)
        self.assertIsNone(r['paired_served_A']['before']['mae_kcal'])
        self.assertEqual(r['paired_served_A_B']['scored_meals'],1)
        self.assertIsNone(r['consumed_accuracy'])

    def test_unscorable_reference_and_corrupt_truncated_missing_logs_are_counted(self):
        for flag in [{'readFailure':True},{'missingMeasurements':True},
            {'truncated':True,'droppedEvents':1}]:
            r=evaluate_workflows(export(**flag),references(meal()))
            self.assertEqual(r['paired_served_A']['scored_meals'],0)
            self.assertEqual(r['coverage']['incomplete_measurement_meals'],1)
        m=meal();m['reference_served_grade']='C'
        self.assertEqual(evaluate_workflows(export(),references(m))['coverage']['unscorable_reference_meals'],1)

    def test_manual_prior_and_noop_contexts_never_become_initial_automatic_pairs(self):
        for event in [correction(original=False),correction(prior=1),
            {**correction(),'toG':100},{**correction(),'kind':'portion_cancelled'},
            {**correction(),'kind':'portion_unchanged'}]:
            r=evaluate_workflows(export([event]),references(meal()))
            self.assertEqual(r['paired_served_A']['scored_meals'],0)
            self.assertEqual(r['coverage']['meals_without_eligible_initial_correction'],1)

    def test_missing_timing_stays_unknown_without_discarding_valid_accuracy_pair(self):
        event={**correction(),'timingValid':False,'elapsedMs':None,
            'foregroundMs':None,'waitingMs':None,'dialogForegroundMs':None}
        r=evaluate_workflows(export([event]),references(meal()))
        self.assertEqual(r['paired_served_A']['scored_meals'],1)
        self.assertEqual(r['timing']['portion_dialog_foreground_proxy_ms']['measured'],0)
        self.assertIsNone(r['timing']['portion_dialog_foreground_proxy_ms']['p50'])

    def test_no_measurements_means_null_accuracy_not_perfect_accuracy(self):
        data=export();data['meals']=[]
        r=evaluate_workflows(data,references())
        self.assertEqual(r['paired_served_A']['scored_meals'],0)
        self.assertIsNone(r['paired_served_A']['after']['mae_kcal'])
        self.assertIsNone(r['timing']['actual_active_user_ms'])

    def test_duplicate_ids_privacy_fields_and_nonfinite_or_boolean_numbers_are_rejected(self):
        for value in [float('nan'),float('inf'),True]:
            data=export();data['meals'][0]['events'][0]['beforeKcal']=value
            with self.assertRaises(ValueError):evaluate_workflows(data,references(meal()))
        data=export();data['meals'].append(copy.deepcopy(data['meals'][0]))
        with self.assertRaises(ValueError):evaluate_workflows(data,references(meal()))
        data=export();data['meals'][0]['photoPath']='private'
        with self.assertRaises(ValueError):evaluate_workflows(data,references(meal()))
        with self.assertRaises(ValueError):evaluate_workflows(export(),references(meal(),meal()))
