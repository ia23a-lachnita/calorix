import copy,math,unittest
from tool.oracle_box_scale import parse_boxes,fit_priors,predict_features,evaluate_boxes

def xml(food='bread',filename='bread001T(1).JPG',scale=1,extra='',flag=0):
 def obj(name,coords):
  a,b,c,d=[v*scale for v in coords]
  return f'<object><name>{name}</name><truncated>{flag}</truncated><difficult>0</difficult><bndbox><xmin>{a}</xmin><ymin>{b}</ymin><xmax>{c}</xmax><ymax>{d}</ymax></bndbox></object>'
 return (f'<annotation><filename>{filename}</filename><size><width>{100*scale}</width><height>{100*scale}</height></size>'+obj(food,[10,10,30,50])+obj('coin',[60,60,70,70])+extra+'</annotation>').encode()
def features(pixel=200,area=1000):return {'pixelArea':pixel,'areaProxyMm2':area,'coinAspectRatio':1}
def train():return [{'id':'bread00'+str(i),'sourceClass':'bread','referenceMassG':g,'features':features(p,a)} for i,(g,p,a) in enumerate([(10,100,500),(20,200,1000),(40,400,2000)],1)]
class OracleBoxTests(unittest.TestCase):
 def test_hand_calculated_box_and_scale_units(self):
  f=parse_boxes(xml(),'bread001T(1).JPG','bread');self.assertEqual(f['pixelArea'],800);self.assertEqual(f['areaProxyMm2'],5000);self.assertEqual(f['coinAspectRatio'],1);self.assertTrue(f['oracle'])
 def test_uniform_resize_preserves_coin_proxy(self):
  a=parse_boxes(xml(),'bread001T(1).JPG','bread');b=parse_boxes(xml(scale=2),'bread001T(1).JPG','bread');self.assertEqual(b['pixelArea'],4*a['pixelArea']);self.assertEqual(b['areaProxyMm2'],a['areaProxyMm2'])
 def test_objects_filename_class_and_flags_are_checked(self):
  wrong=[xml(food='bun'),xml(filename='other.JPG'),xml(flag=1),xml(extra='<object><name>coin</name></object>'),xml().replace(b'<name>coin</name>',b'<name>apple</name>'),xml().replace(b'<name>coin</name>',b'<name>bread</name>')]
  for data in wrong:
   with self.subTest(data=data),self.assertRaises(ValueError):parse_boxes(data,'bread001T(1).JPG','bread')
 def test_invalid_xml_boxes_are_not_clamped(self):
  for data in [b'not xml',b'x'*65537,xml().replace(b'<xmax>30</xmax>',b'<xmax>10</xmax>'),xml().replace(b'<ymax>50</ymax>',b'<ymax>101</ymax>'),xml().replace(b'<xmin>10</xmin>',b'<xmin>-1</xmin>'),xml().replace(b'<width>100</width>',b'<width>0</width>'),xml().replace(b'<xmin>10</xmin>',b'<xmin>NaN</xmin>')]:
   with self.subTest(data=data[:90]),self.assertRaises(ValueError):parse_boxes(data,'bread001T(1).JPG','bread')
 def test_native_class_name_preserved(self):
  f=parse_boxes(xml(food='fired_dough_twist',filename='fired_dough_twist001T(1).JPG'),'fired_dough_twist001T(1).JPG','fired_dough_twist');self.assertEqual(f['pixelArea'],800)
 def test_train_only_coefficients_and_predictions(self):
  rows=train();before=copy.deepcopy(rows);p=fit_priors(rows,{'bread004'});self.assertEqual(rows,before);out=predict_features('bread',features(300,1500),p);self.assertEqual(out['classPrior'],20);self.assertAlmostEqual(out['pixelArea'],30);self.assertAlmostEqual(out['coinArea'],30);self.assertAlmostEqual(out['coinSimilarity'],20*(1.5**1.5))
 def test_duplicate_group_leakage_and_minimum_fail(self):
  for rows,forbidden in [(train()+[train()[0]],{'bread004'}),(train(),{'bread002'}),(train()[:2],{'bread004'})]:
   with self.subTest(rows=rows),self.assertRaises(ValueError):fit_priors(rows,forbidden)
 def test_invalid_quantities_and_features_fail(self):
  for value in [True,False,0,-1,float('nan'),float('inf'),'10']:
   rows=train();rows[0]['referenceMassG']=value
   with self.subTest(value=value),self.assertRaises(ValueError):fit_priors(rows,{'bread004'})
  p=fit_priors(train(),{'bread004'})
  for f in [features(0,1),features(1,float('inf')),features(True,1000)]:
   with self.assertRaises(ValueError):predict_features('bread',f,p)
  with self.assertRaises(ValueError):predict_features('bun',features(),p)
 def test_comparison_reference_cannot_change_prediction(self):
  p=fit_priors(train(),{'bread004'});cases=[{'id':'bread004','sourceClass':'bread','referenceMassG':30,'features':features(300,1500)}];a=evaluate_boxes(cases,p,{'bread004':35});cases[0]['referenceMassG']=300;b=evaluate_boxes(cases,p,{'bread004':35});self.assertEqual(a['cases'][0]['predictions'],b['cases'][0]['predictions']);self.assertIsNone(a['calorieReference']);self.assertFalse(a['productionPromotable'])
 def test_failure_denominators_and_incomplete_membership(self):
  p=fit_priors(train(),{'bread004','bread005'});cases=[{'id':'bread004','sourceClass':'bread','referenceMassG':30,'features':features(300,1500)},{'id':'bread005','sourceClass':'bread','referenceMassG':35,'features':None}];r=evaluate_boxes(cases,p,{'bread004':35,'bread005':40});self.assertEqual(r['routes']['coinArea']['attempted'],2);self.assertEqual(r['routes']['coinArea']['scored'],1);self.assertEqual(r['routes']['classPrior']['scored'],2);self.assertFalse(r['screens']['coinArea']['passes'])
  with self.assertRaises(ValueError):evaluate_boxes(cases,p,{'bread004':35})
  cases[1]['id']='bread001'
  with self.assertRaises(ValueError):evaluate_boxes(cases,p,{'bread004':35,'bread001':40})

 def test_view_selection_reproducible_and_excludes_entire_comparison_group(self):
  from tool.oracle_box_scale import select_training_views
  weights=[{'id':'bread001','sourceClass':'bread','referenceMassG':10},{'id':'bread002','sourceClass':'bread','referenceMassG':20}];paths=['Annotations/bread001T(1).xml','JPEGImages/bread001T(1).JPG','Annotations/bread001T(2).xml','JPEGImages/bread001T(2).JPG','Annotations/bread002T(1).xml','JPEGImages/bread002T(1).JPG']
  a=select_training_views(weights,paths,{'bread002'},'fixed-seed');b=select_training_views(list(reversed(weights)),list(reversed(paths)),{'bread002'},'fixed-seed');self.assertEqual(a,b);self.assertEqual([r['id'] for r in a],['bread001'])
  weights[0]['referenceMassG']=999;self.assertEqual(a[0]['annotationObject'],select_training_views(weights,paths,{'bread002'},'fixed-seed')[0]['annotationObject'])
 def test_view_selection_missing_counterpart_or_duplicate_group_refused(self):
  from tool.oracle_box_scale import select_training_views
  weights=[{'id':'bread001','sourceClass':'bread','referenceMassG':10},{'id':'bread002','sourceClass':'bread','referenceMassG':20}]
  with self.assertRaises(ValueError):select_training_views(weights,[],{'bread002'},'fixed-seed')
  with self.assertRaises(ValueError):select_training_views(weights+[weights[0]],[],{'bread002'},'fixed-seed')

 def test_positive_spans_with_underflowing_coin_area_fail_explicitly(self):
  data=xml().replace(b'<xmin>60</xmin>',b'<xmin>0</xmin>').replace(b'<ymin>60</ymin>',b'<ymin>0</ymin>').replace(b'<xmax>70</xmax>',b'<xmax>1e-200</xmax>').replace(b'<ymax>70</ymax>',b'<ymax>1e-200</ymax>')
  with self.assertRaises(ValueError):parse_boxes(data,'bread001T(1).JPG','bread')
