"""Synthetic arithmetic fixtures only; real public results are produced separately."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from evaluate_public_weighed import benchmark,score_corrections,validate_bundle,write_json
from test_evaluate_workflows import correction,export

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('public_builder',ROOT/'tool/build_public_weighed_benchmark.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)

def vector(kcal=180,mass=100):return {'kcal':kcal,'massG':mass,'proteinG':5,'carbsG':20,'fatG':9}
def bundle():
    return {'schema_version':'public-weighed-1','scope':'custom_pinned_inputs','source_index_sha256':'a'*64,'cases':[
        {'id':'dish_1558722247','cohort':'fixture','captureDate':'2019-05-24','inputSha256':'b'*64,'receiptSha256':'c'*64,
         'reference':vector(),'ingredients':[{'id':'ingr_1','name':'Fixture food',**vector()}],
         'sourceImageUrl':'https://example.invalid/public.png','sourceMetadataFile':'fixture.csv','rowFieldsSha256':'d'*64,
         'predictions':{'A1':{'status':'ok','predicted':{k:v for k,v in vector(100).items() if k!='massG'},'massG':80,'failure':None},
                        'A0':{'status':'failed','predicted':None,'massG':None,'failure':'catalog_coverage_failure'}},
         'provenance':{'model':'gemini-3.8-flash','catalogVersion':'fixture','promptSha256':'e'*64,'schemaSha256':'f'*64,'sourceCommit':'1'*40},
         'latencyMs':123,'costUsd':None,'questionProposed':False}]}

def links(mode='reference_blind_user'):
    return {'schema_version':'public-workflow-links-1','links':[{'mealId':'m1','scanId':'dish_1558722247',
        'inputSha256':'b'*64,'receiptSha256':'c'*64,'mode':mode}]}

class PublicWeighedTest(unittest.TestCase):
    def test_actual_metric_arithmetic_and_failed_A0_coverage(self):
        r=benchmark(bundle());a=r['routes']['A1'];self.assertEqual(r['public_scans'],1)
        self.assertEqual(a['served']['mae_kcal'],80);self.assertEqual(a['served']['bias_kcal'],-80)
        self.assertEqual(a['served']['mean_normalized_absolute_error'],.4)
        self.assertEqual(a['mass_g']['mae'],20);self.assertEqual(r['routes']['A0']['coverage'],0)
        self.assertIsNone(r['routes']['A0']['served']['mae_kcal']);self.assertEqual(r['paired']['A1']['scored_scans'],0)
        self.assertIsNone(r['consumed_accuracy']);self.assertIsNone(r['actual_active_user_ms'])

    def test_published_total_is_preserved_instead_of_replacing_with_component_sum(self):
        b=bundle();b['cases'][0]['ingredients'][0]['kcal']=180.0001
        self.assertEqual(benchmark(b)['routes']['A1']['served']['mae_kcal'],80)
        self.assertAlmostEqual(benchmark(b)['max_absolute_closure_residual']['kcal'],.0001)

    def test_invalid_vectors_closure_duplicates_and_failed_supplied_nan_rejected(self):
        changes=[('massG',0),('kcal',float('nan')),('proteinG',True),('fatG',-1)]
        for field,value in changes:
            b=bundle();b['cases'][0]['reference'][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):validate_bundle(b)
        b=bundle();b['cases'][0]['ingredients'][0]['kcal']=181
        with self.assertRaises(ValueError):validate_bundle(b)
        b=bundle();b['cases']*=2
        with self.assertRaises(ValueError):validate_bundle(b)
        b=bundle();b['cases'][0]['predictions']['A0']['massG']=float('nan')
        with self.assertRaises(ValueError):validate_bundle(b)

    def test_energy_bins_200_and600_and_ingredient_proxy_named_honestly(self):
        b=bundle();b['cases']=[]
        for i,kcal in enumerate([199,200,600,601]):
            c=copy.deepcopy(bundle()['cases'][0]);c['id']=f'dish_155872224{i}';c['reference']['kcal']=kcal;c['ingredients'][0]['kcal']=kcal;b['cases'].append(c)
        r=benchmark(b)['routes']['A1'];self.assertEqual([r['energy_bins'][k]['scored_scans'] for k in ['under_200','200_to_600','over_600']],[1,2,1])
        self.assertEqual(r['ingredient_count_proxy']['one_ingredient']['scored_scans'],4)

    def test_first_portion_pair_uses_published_weighed_reference(self):
        r=score_corrections(export(),bundle(),links())
        self.assertEqual(r['portion_only']['before']['mae_kcal'],80);self.assertEqual(r['portion_only']['after']['mae_kcal'],10)
        self.assertEqual(r['portion_only']['scored_scans'],1);self.assertIsNone(r['actual_active_user_ms'])
        self.assertIn('attestation',r['link_assurance'])

    def test_food_assisted_is_separate_and_later_edits_do_not_remove_first_pair(self):
        first={**correction(),'kind':'food_saved'};later={**correction(after=900),'sequence':1}
        data=export([first,later]);data['schemaVersion']=2
        r=score_corrections(data,bundle(),links());self.assertEqual(r['food_assisted']['scored_scans'],1)
        self.assertEqual(r['portion_only']['scored_scans'],0);self.assertEqual(r['food_assisted']['after']['mae_kcal'],10)

    def test_diagnostic_oracle_empty_links_and_missing_refs_never_invent_benefit(self):
        for mode in ['diagnostic','oracle']:
            r=score_corrections(export(),bundle(),links(mode));self.assertEqual(r['portion_only']['scored_scans'],0)
            self.assertEqual(r['exclusion_reasons'][mode],1);self.assertIsNone(r['portion_only']['after']['mae_kcal'])
        r=score_corrections(export(),bundle(),{'schema_version':'public-workflow-links-1','links':[]})
        self.assertEqual(r['coverage']['exports_without_link'],1)

    def test_hash_mismatch_duplicate_links_unknown_scan_and_private_link_fields_rejected(self):
        for patch in [{'inputSha256':'0'*64},{'receiptSha256':'0'*64},{'scanId':'dish_0000000000'},{'mode':'pretend'},{'foodName':'private'}]:
            value=links();value['links'][0].update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValueError):score_corrections(export(),bundle(),value)
        value=links();value['links']*=2
        with self.assertRaises(ValueError):score_corrections(export(),bundle(),value)
        value=links();other={**value['links'][0],'mealId':'other'};value['links'].append(other)
        with self.assertRaises(ValueError):score_corrections(export(),bundle(),value)

    def test_dirty_baseline_prior_mutations_incomplete_logs_navigation_and_noops_excluded(self):
        for event,flags in [({**correction(),'beforeKcal':100.01},{}),({**correction(),'afterNavigation':True},{}),
                            ({**correction(),'toG':100},{}),(correction(),{'truncated':True,'droppedEvents':1})]:
            self.assertEqual(score_corrections(export([event],**flags),bundle(),links())['portion_only']['scored_scans'],0)
        for kind in ['manual_saved','preparation_answered','analysis_saved']:
            r=score_corrections(export([{**correction(),'kind':kind},{**correction(),'sequence':1}]),bundle(),links())
            self.assertEqual(r['portion_only']['scored_scans'],0)

    def test_invalid_export_privacy_is_rejected_before_scoring(self):
        data=export();data['meals'][0]['foodName']='private'
        with self.assertRaises(ValueError):score_corrections(data,bundle(),links())

    def test_exclusive_write_rejects_existing_symlink_and_nonfinite_before_write(self):
        with tempfile.TemporaryDirectory(prefix='public-weighed-test-') as d:
            p=Path(d)/'report.json';write_json(p,{'ok':True});self.assertEqual(json.loads(p.read_text()),{'ok':True})
            with self.assertRaises(FileExistsError):write_json(p,{'new':True})
            link=Path(d)/'link.json';link.symlink_to(p)
            with self.assertRaises(FileExistsError):write_json(link,{'new':True})
            bad=Path(d)/'bad.json'
            with self.assertRaises(ValueError):write_json(bad,{'bad':float('nan')})
            self.assertFalse(bad.exists())

    def test_builder_rejects_index_drift_before_accessing_sources(self):
        with tempfile.TemporaryDirectory(prefix='public-builder-') as d:
            p=Path(d)/'index.json';p.write_text('{}')
            with self.assertRaises(ValueError):builder.build(p,Path(d))
