import copy, hashlib, io, unittest
import numpy as np
from PIL import Image
from tool.lens_onnx_contract import preprocess, publisher_summary, parity_report, select_controls, compatibility_report

def config():
 return {'image_size':[1,2],'ingredients':['rice','oil'],'density_sources':['usda_match','none'],'densities':[[1,.01,.2,.03,0,0,0,0],[9,1,0,0,0,0,0,0]],'mean_density':[2,.1,.2,.3,0,0,0,0],'presence_threshold':.65,'display_min_grams':3}
def raw():
 return {'grams':[[10,5]],'mass_gap':[2],'logits':[[2,-2]],'log_grams':[[1,2]],'soft':[[10,5]],'log_totals':np.log1p([[60,18,5,3,1]]).astype(np.float32).tolist(),'totals':[[55,5.1,2,.3,0,0,0,0]]}
def record():
 return {'raw':raw(),'massG':17,'totals':{'kcal':59,'proteinG':.9,'fatG':5.3,'carbsG':2.4},'inputTensor':{'dtype':'float32','shape':[1,3,1,2],'sha256':hashlib.sha256(b'fixture').hexdigest()},'publisherSummary':{'ingredients':[{'name':'rice'}]}}
class OnnxContractTest(unittest.TestCase):
 def test_compatibility_keeps_raw_failure_and_accepts_only_small_tail_probability_delta(self):
  e=record();e['raw']['logits']=[[-10.6630764,-2]];e['publisherSummary']['ingredients']=[];a=copy.deepcopy(e);a['raw']['logits'][0][0]= -10.6655226
  r=compatibility_report(e,a,config());self.assertFalse(r['rawV1']['passes']);self.assertTrue(r['endpointV2']['passes']);self.assertFalse(r['raw_speed_qualified'])
  a['raw']['logits'][0][0]= -9.;self.assertFalse(compatibility_report(e,a,config())['endpointV2']['passes'])
  a=copy.deepcopy(e);a['totals']['kcal']+=.11;self.assertFalse(compatibility_report(e,a,config())['endpointV2']['passes'])
 def test_compatibility_rejects_all_class_decision_changes_even_if_undisplayed(self):
  e=record();e['publisherSummary']['ingredients']=[];e['raw']['logits'][0][0]=float(np.log((.65-1e-7)/(1-.65+1e-7)));a=copy.deepcopy(e);a['raw']['logits'][0][0]=float(np.log((.65+1e-7)/(1-.65-1e-7)))
  self.assertFalse(compatibility_report(e,a,config())['endpointV2']['passes'])
  e=record();e['raw']['grams'][0][1]=2.999999;a=copy.deepcopy(e);a['raw']['grams'][0][1]=3.000001
  self.assertFalse(compatibility_report(e,a,config())['endpointV2']['passes'])
 def test_compatibility_does_not_waive_other_heads_or_shapes(self):
  e=record();a=copy.deepcopy(e);a['raw']['soft'][0][0]+=1
  self.assertFalse(compatibility_report(e,a,config())['endpointV2']['passes'])
  a=copy.deepcopy(e);a['raw']['logits']=[[1]];self.assertFalse(compatibility_report(e,a,config())['endpointV2']['passes'])
 def test_input_rgb_nchw_float_and_no_double_normalization(self):
  im=Image.new('RGB',(2,1));im.putdata([(255,0,0),(0,0,255)]);b=io.BytesIO();im.save(b,format='PNG');x=preprocess(b.getvalue(),[1,2]);self.assertEqual(x.shape,(1,3,1,2));self.assertEqual(x.dtype,np.float32);self.assertEqual(x[0,:,0,0].tolist(),[1,0,0]);self.assertEqual(x[0,:,0,1].tolist(),[0,0,1])
 def test_input_retains_pillow_fit_and_mean_padding(self):
  im=Image.new('RGB',(2,1),(255,0,0));b=io.BytesIO();im.save(b,format='PNG');x=preprocess(b.getvalue(),[4,4]);np.testing.assert_array_equal(x[0,:,0,0],np.array([124,116,104],np.float32)/255);np.testing.assert_array_equal(x[0,:,1,0],[1,0,0])
 def test_summary_density_units_unidentified_mass_and_rounding(self):
  s=publisher_summary(raw(),config());self.assertEqual(s['totals']['mass_g'],17);self.assertEqual(s['totals']['kcal'],59);self.assertEqual(s['totals']['protein_g'],.9);self.assertEqual(s['other']['grams'],7);self.assertEqual([p['name'] for p in s['ingredients']],['rice']);self.assertEqual(s['direct_estimate']['mass_g'],18)
 def test_summary_zero_named_does_not_hide_soft_nutrition(self):
  r=raw();r['logits']=[[-5,-5]];s=publisher_summary(r,config());self.assertEqual(s['ingredients'],[]);self.assertEqual(s['other']['grams'],17);self.assertEqual(s['totals']['kcal'],59)
 def test_summary_sorts_grams_not_confidence_and_rejects_invalid_shapes(self):
  r=raw();r['logits']=[[3,5]];s=publisher_summary(r,config());self.assertEqual([p['name'] for p in s['ingredients']],['rice','oil'])
  for key,value in [('grams',[[float('nan'),5]]),('mass_gap',[float('inf')]),('logits',[[1]])]:
   r=raw();r[key]=value
   with self.assertRaises(ValueError):publisher_summary(r,config())
 def test_raw_unit_specific_tolerances_and_endpoint_gate(self):
  e=record();a=copy.deepcopy(e);a['raw']['totals'][0][7]=.4;self.assertTrue(parity_report(e,a)['passes'])
  a['raw']['totals'][0][7]=.6;self.assertFalse(parity_report(e,a)['passes'])
  a=copy.deepcopy(e);a['massG']+=.11;self.assertFalse(parity_report(e,a)['passes'])
 def test_names_shape_nan_and_input_hash_changes_fail(self):
  e=record()
  for change in ['name','shape','nan','hash']:
   a=copy.deepcopy(e)
   if change=='name':a['publisherSummary']['ingredients']=[{'name':'oil'}]
   if change=='shape':a['raw']['grams']=[[10,5,1]]
   if change=='nan':a['raw']['logits']=[[float('nan'),2]]
   if change=='hash':a['inputTensor']['sha256']='0'*64
   self.assertFalse(parity_report(e,a)['passes'],change)
 def test_semantic_boundary_not_repaired_and_no_input_mutation(self):
  e=record();a=copy.deepcopy(e);before=copy.deepcopy(a);a['publisherSummary']['ingredients']=[];self.assertFalse(parity_report(e,a)['passes']);self.assertEqual(e,before)
 def test_controls_are_stratified_stable_and_reference_independent(self):
  c=[{'id':f'{g}-{i}','group':g,'reference':{'kcal':i}} for g in ['discovery10','validation20','ecust-old','ecust-fresh'] for i in range(3)]
  chosen=select_controls(c,'fixed');self.assertEqual(len(chosen),6);self.assertEqual(sum(p['group']=='discovery10' for p in chosen),2);self.assertEqual(sum(p['group']=='validation20' for p in chosen),2)
  for p in c:p['reference']={'kcal':99999}
  self.assertEqual(chosen,select_controls(list(reversed(c)),'fixed'))
  with self.assertRaises(ValueError):select_controls(c[:2],'fixed')
