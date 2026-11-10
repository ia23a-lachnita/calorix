import copy,io,math,unittest
import numpy as np
from PIL import Image
from tool.open_model_adapters import preprocess,decode_plate,decode_dish,fuse_mass,score_open_models

def pixels():
 im=Image.new('RGB',(2,1));im.putdata([(255,0,0),(0,0,255)]);b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()
def bundle():return {'heads_trained':{'logits':True,'nutrition_quantiles':True},'target_transform':{'keys':['energy','protein','fat','carbohydrate','mass'],'mean':[0]*5,'std':[1]*5}}
def cfg():return {'img_size':2,'num_classes':2,'norm_ingr':[[.1,.2,.3],[.4,.5,.6]],'scalers':{'total_mass':{'mean_':[10],'scale_':[5],'with_mean':True,'with_std':True}}}
def estimate():return {'components':[{'name':'a','massG':100,'nutrients':dict(kcal=100,proteinG=10,fatG=1,carbsG=20),'source':{'kind':'unverified_vlm_estimate'}},{'name':'b','massG':50,'nutrients':dict(kcal=50,proteinG=5,fatG=.5,carbsG=10),'source':{'kind':'database_match','recordId':'fixed'}}]}
class AdapterTest(unittest.TestCase):
 def test_plate_raw_rgb_nhwc_no_client_resize_or_normalize(self):
  x=preprocess('plate-vision',pixels(),{});self.assertEqual(x.dtype,np.uint8);self.assertEqual(x.shape,(1,1,2,3));self.assertEqual(x[0,0,0].tolist(),[255,0,0]);self.assertEqual(x[0,0,1].tolist(),[0,0,255])
 def test_dish_rgb_float32_nchw_separate_normalization(self):
  x=preprocess('dish2calories',pixels(),cfg());self.assertEqual(x.dtype,np.float32);self.assertEqual(x.shape,(1,3,2,2));self.assertAlmostEqual(float(x[0,0,0,0]),(1-.485)/.229,places=5);self.assertAlmostEqual(float(x[0,2,0,1]),(1-.406)/.225,places=5)
 def test_plate_inverse_then_sort_quantile_crossings(self):
  raw=np.tile(np.log1p([30,10,20]),(1,5,1));r=decode_plate(raw,bundle());self.assertAlmostEqual(r['totals']['kcal'],20);self.assertAlmostEqual(r['massG'],20)
  b=bundle();b['target_transform']['mean']=[math.log(11)]*5;r=decode_plate(np.zeros((1,5,3)),b);self.assertAlmostEqual(r['massG'],10)
 def test_plate_untrained_or_invalid_values_refused(self):
  b=bundle();b['heads_trained']['nutrition_quantiles']=False
  for raw,meta in [(np.zeros((1,5,3)),b),(np.full((1,5,3),np.nan),bundle()),(np.full((1,5,3),-1),bundle()),(np.zeros((1,3)),bundle())]:
   with self.assertRaises(ValueError):decode_plate(raw,meta)
 def test_dish_mass_scaler_macro_units_and_empty_vocab_separate(self):
  r=decode_dish(np.array([[math.log(4),-math.log(4)]],np.float32),np.array([[2]],np.float32),cfg());self.assertAlmostEqual(r['massG'],20);self.assertAlmostEqual(r['totals']['kcal'],68,places=4);self.assertEqual(r['selectedIngredients'],1)
  r=decode_dish(np.full((1,2),-10,np.float32),np.array([[2]],np.float32),cfg());self.assertEqual(r['massG'],20);self.assertIsNone(r['totals']);self.assertEqual(r['directFailure'],'vocabulary_failure');self.assertEqual(r['publisherRawTotals']['kcal'],0)
 def test_mass_fusion_uses_a1_estimate_preserves_sources_and_input(self):
  e=estimate();before=copy.deepcopy(e);r=fuse_mass(e,300,{'modelId':'fixed','sha256':'pin'});self.assertEqual(e,before);self.assertEqual(r['totals']['kcal'],300);self.assertEqual(r['massG'],300);self.assertEqual(r['components'][1]['source']['recordId'],'fixed');self.assertEqual(r['components'][0]['source']['kind'],'unverified_vlm_estimate')
  for value in [0,-1,math.nan]:
   with self.assertRaises(ValueError):fuse_mass(e,value,{})
 def test_missing_predictions_keep_denominator_and_ecust_has_no_energy_score(self):
  cases=[{'id':'n','dataset':'nutrition5k','reference':dict(kcal=200,massG=100,proteinG=10,carbsG=20,fatG=5),'a1':{'massG':100,'totals':dict(kcal=100,proteinG=10,carbsG=20,fatG=5)}},{'id':'e','dataset':'ecust','reference':{'massG':50},'a1':None}]
  rows={'n':{'status':'ok','massG':80,'totals':dict(kcal=160,proteinG=10,carbsG=20,fatG=5),'fusion':{'massG':80,'totals':dict(kcal=80,proteinG=10,carbsG=20,fatG=5)}}}
  r=score_open_models(cases,rows);self.assertEqual(r['nutrition5k']['direct']['served']['mae_kcal'],40);self.assertEqual(r['ecust']['mass']['coverage'],0);self.assertIsNone(r['ecust']['energy']);self.assertFalse(r['productionPromotable'])

 def test_direct_failures_report_same_case_matched_baseline(self):
  vec=lambda k:dict(kcal=k,proteinG=10,carbsG=20,fatG=5)
  cases=[{'id':'a','dataset':'nutrition5k','reference':dict(vec(200),massG=100),'a1':{'massG':100,'totals':vec(100)}},{'id':'b','dataset':'nutrition5k','reference':dict(vec(100),massG=50),'a1':{'massG':50,'totals':vec(100)}}]
  r=score_open_models(cases,{'a':{'status':'ok','massG':80,'totals':vec(160)}})
  self.assertEqual(r['nutrition5k']['direct']['coverage'],.5);self.assertEqual(r['nutrition5k']['matchedDirect']['baseline']['served']['mae_kcal'],100);self.assertEqual(r['nutrition5k']['matchedDirect']['direct']['served']['mae_kcal'],40)
