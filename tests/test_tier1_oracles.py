"""Synthetic oracle arithmetic and frozen-baseline integrity, never user measurements."""
import contextlib
import copy
import csv
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from evaluate_tier1_oracles import analyze_rows, load_csv, main


def row(identity='dish_1', reference=100, mass=100, predicted=100, predicted_mass=100,
        status='ok', cohort='original20'):
    value={'id':identity, 'cohort':cohort, 'referenceKcal':reference,
           'referenceMassG':mass, 'inputSha256':'a'*64}
    for version in ('v1', 'v2'):
        value.update({version+'A1Status':status, version+'A1kcal':predicted,
                      version+'A1MassG':predicted_mass, version+'ReceiptSha256':'b'*64})
    return value


class OracleTests(unittest.TestCase):
    def test_mass_substitution_uses_total_mass_and_fixed_predicted_density(self):
        report=analyze_rows([row(reference=200, mass=200)])
        case=report['cases'][0]['versions']['v1']
        self.assertEqual(case['reference_mass_kcal'],200)
        self.assertEqual(case['reference_density_kcal'],100)
        stats=report['groups']['all']['v1']
        self.assertEqual(stats['original']['mae_kcal'],100)
        self.assertEqual(stats['reference_mass']['mae_kcal'],0)
        self.assertEqual(stats['delta_mae_kcal']['reference_mass'],-100)

    def test_density_substitution_and_zero_reference_energy(self):
        report=analyze_rows([row(reference=200), row('dish_2', reference=0, predicted=0)])
        cases=report['cases']
        self.assertEqual(cases[0]['versions']['v1']['reference_density_kcal'],200)
        self.assertEqual(cases[0]['versions']['v1']['reference_mass_kcal'],100)
        self.assertEqual(cases[1]['versions']['v1']['reference_density_kcal'],0)
        self.assertEqual(report['groups']['all']['v1']['oracle_eligible'],2)

    def test_compensating_errors_can_make_both_oracles_worse(self):
        stats=analyze_rows([row(predicted_mass=50)])['groups']['all']['v1']
        self.assertEqual(stats['comparable_original']['mae_kcal'],0)
        self.assertEqual(stats['reference_mass']['mae_kcal'],100)
        self.assertEqual(stats['reference_density']['mae_kcal'],50)
        self.assertEqual(stats['delta_mae_kcal'],{'reference_mass':100, 'reference_density':50})

    def test_failed_and_undefined_rows_remain_in_denominators(self):
        rows=[row(status='failed', predicted=None, predicted_mass=None),
              row('dish_2', predicted_mass=0),
              row('dish_3', predicted=150, predicted_mass=None)]
        before=copy.deepcopy(rows);report=analyze_rows(rows)
        self.assertEqual(rows,before)
        stats=report['groups']['all']['v1']
        self.assertEqual(stats['eligible_attempts'],3)
        self.assertEqual(stats['statuses']['failed'],1)
        self.assertAlmostEqual(stats['coverage'],2/3)
        self.assertEqual(stats['original']['scored_meals'],2)
        self.assertEqual(stats['original']['mae_kcal'],25)
        self.assertEqual(stats['oracle_eligible'],0)
        self.assertEqual(stats['oracle_undefined'],2)
        self.assertIsNone(stats['reference_mass']['mae_kcal'])
        self.assertIsNone(stats['delta_mae_kcal']['reference_mass'])
        self.assertEqual(report['cases'][0]['versions']['v1']['status'],'failed')
        self.assertEqual(report['cases'][1]['versions']['v1']['oracle_undefined_reason'],'nonpositive_predicted_mass')
        self.assertEqual(report['cases'][2]['versions']['v1']['oracle_undefined_reason'],'missing_predicted_mass')

    def test_nonfinite_derived_oracle_is_explicitly_undefined(self):
        report=analyze_rows([row(predicted=500, predicted_mass=1e-320)])
        stats=report['groups']['all']['v1']
        self.assertEqual(stats['original']['scored_meals'],1)
        self.assertEqual(stats['oracle_undefined'],1)
        self.assertEqual(report['cases'][0]['versions']['v1']['oracle_undefined_reason'],'nonfinite_oracle')
        json.dumps(report,allow_nan=False)

    def test_invalid_values_ids_hashes_and_statuses_fail_instead_of_disappearing(self):
        for key,value in [('referenceKcal',-1), ('referenceKcal',True),
                          ('referenceMassG',0), ('referenceMassG',float('inf')),
                          ('v1A1kcal',float('nan')), ('v1A1kcal',-1),
                          ('v2A1MassG',float('nan')), ('inputSha256','bad'),
                          ('v1ReceiptSha256','bad'), ('v2A1Status','invented'),
                          ('cohort',''), ('id','')]:
            with self.subTest(key=key,value=value):
                broken=row();broken[key]=value
                with self.assertRaises(ValueError):analyze_rows([broken])
        with self.assertRaises(ValueError):analyze_rows([row(),row()])

    def test_cohort_energy_bins_and_all_metrics_recompute_from_cases(self):
        report=analyze_rows([row(predicted=200, predicted_mass=200),
                            row('dish_2', reference=400, mass=400, predicted=200,
                                predicted_mass=200, cohort='mealrange10'),
                            row('dish_3', reference=800, mass=800, predicted=400,
                                predicted_mass=400, cohort='mealrange10')])
        all_stats=report['groups']['all']['v1']
        self.assertAlmostEqual(all_stats['original']['mae_kcal'],700/3)
        self.assertEqual(all_stats['original']['p90_absolute_error_kcal'],360)
        self.assertEqual(all_stats['reference_mass']['mae_kcal'],0)
        self.assertEqual(report['groups']['cohorts']['original20']['v1']['eligible_attempts'],1)
        self.assertEqual(report['groups']['cohorts']['mealrange10']['v1']['eligible_attempts'],2)
        bins=report['groups']['energy_size_bins']
        for label in ('under_200','200_to_600','over_600'):
            self.assertEqual(bins[label]['v1']['eligible_attempts'],1)
        self.assertFalse(report['component_matching_performed'])
        self.assertFalse(report['user_correction_measurement'])

    def test_cli_pins_input_and_refuses_output_overwrite(self):
        with tempfile.TemporaryDirectory(prefix='calorix-oracles-') as root:
            source=Path(root)/'cases.csv';output=Path(root)/'report.json'
            with source.open('w',newline='') as handle:
                writer=csv.DictWriter(handle,fieldnames=list(row()))
                writer.writeheader();writer.writerow(row())
            raw=source.read_bytes();digest=hashlib.sha256(raw).hexdigest()
            with contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit):
                main(['--cases',str(source),'--output',str(output),'--expected-sha256','0'*64])
            self.assertFalse(output.exists())
            self.assertEqual(main(['--cases',str(source),'--output',str(output),'--expected-sha256',digest]),0)
            saved=output.read_bytes();report=json.loads(saved)
            self.assertEqual(report['input_sha256'],digest)
            self.assertFalse(report['input_is_frozen_public30'])
            with contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit):
                main(['--cases',str(source),'--output',str(output),'--expected-sha256',digest])
            self.assertEqual(output.read_bytes(),saved);self.assertEqual(source.read_bytes(),raw)

    def test_frozen_original_endpoints_reproduce_existing_metrics(self):
        source=Path(__file__).resolve().parents[1]/'docs/tier1-mealrange-2026-11-08/cases.csv'
        rows=load_csv(source);report=analyze_rows(rows)
        self.assertEqual(len(report['cases']),30)
        for version,mae,p90 in [('v1',112.0220386,264.4407064), ('v2',111.9270387,280.0107064)]:
            stats=report['groups']['all'][version]
            self.assertEqual(stats['oracle_eligible'],30)
            self.assertAlmostEqual(stats['original']['mae_kcal'],mae,places=5)
            self.assertAlmostEqual(stats['original']['p90_absolute_error_kcal'],p90,places=5)


if __name__=='__main__':unittest.main()
