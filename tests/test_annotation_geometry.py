import json,unittest
from tool.annotation_geometry import parse_geometry,fixed6,summarize_geometry

def xml(food='private-label',foodbox=(20,10,40,50),coinbox=(60,50,70,60)):
 def obj(name,box):return '<object><name>'+name+'</name><bndbox>'+''.join('<'+k+'>'+str(v)+'</'+k+'>' for k,v in zip(['xmin','ymin','xmax','ymax'],box))+'</bndbox></object>'
 return ('<annotation><size><width>100</width><height>80</height></size>'+obj(food,foodbox)+obj('coin',coinbox)+'</annotation>').encode()
class GeometryTest(unittest.TestCase):
 def test_hand_geometry_uses_corner_differences_and_drops_labels(self):
  g=parse_geometry(xml(),(100,80),'private-label')
  self.assertEqual(g['foodBoxCornerSpansPx'],[20,40]);self.assertEqual(g['coinMeanCornerSpanPx'],'10.000000');self.assertEqual(g['projectedFoodBoxSpansMm'],['50.000000','100.000000']);self.assertNotIn('private-label',json.dumps(g));self.assertEqual(g['coinDiameterMm'],25)
 def test_explicit_half_up_fixed_six_decimal_arithmetic(self):
  self.assertEqual(fixed6(1,2000000),'0.000001');self.assertEqual(fixed6(1,3),'0.333333');self.assertEqual(fixed6(293*50,131),'111.832061')
 def test_wrong_dimensions_class_extra_objects_or_bad_bounds_rejected(self):
  for raw,size,cls in [(xml(),(101,80),'private-label'),(xml(),(100,80),'other'),(xml(foodbox=(20,10,20,50)),(100,80),'private-label'),(xml(coinbox=(60,50,101,60)),(100,80),'private-label'),(xml().replace(b'</annotation>',b'<object><name>coin</name></object></annotation>'),(100,80),'private-label')]:
   with self.assertRaises(ValueError):parse_geometry(raw,size,cls)
 def test_missing_or_noninteger_geometry_rejected(self):
  for raw in [xml().replace(b'<xmin>20</xmin>',b'<xmin>20.5</xmin>'),xml().replace(b'<width>100</width>',b''),xml().replace(b'<ymax>50</ymax>',b'')]:
   with self.assertRaises(ValueError):parse_geometry(raw,(100,80),'private-label')

def fixture():
 cases=[{'id':str(i),'referenceMassG':100} for i in range(6)];answer=lambda m:dict(status='ok',failure=None,massG=m)
 return cases,{c['id']:{'control':answer(70),'geometry':answer(90)} for c in cases}
class GeometryMetricsTest(unittest.TestCase):
 def test_named_paired_metrics_and_gate(self):
  cases,rows=fixture();r=summarize_geometry(cases,rows)
  self.assertEqual(r['allAttempts']['control']['maeG'],30);self.assertEqual(r['allAttempts']['geometry']['maeG'],10);self.assertEqual(r['cases'][0]['deltaAbsoluteErrorG'],-20);self.assertTrue(r['considerationGate']['passesAll']);self.assertFalse(r['productionPromotable']);self.assertIsNone(r['calorieReference'])
 def test_failure_remains_denominator_and_gate_requires_all_pairs(self):
  c,rows=fixture();rows['5']['geometry']=dict(status='failed',failure='no_food',massG=None);r=summarize_geometry(c,rows)
  self.assertEqual(r['allAttempts']['geometry']['coverage'],5/6);self.assertEqual(r['pairedValid']['scoredPairs'],5);self.assertFalse(r['considerationGate']['passesAll'])
 def test_mean_gain_with_worse_median_or_insufficient_gain_rejected(self):
  c,rows=fixture()
  for i in range(6):rows[str(i)]['control']['massG']=100 if i<4 else 200;rows[str(i)]['geometry']['massG']=120
  r=summarize_geometry(c,rows);self.assertLess(r['allAttempts']['geometry']['maeG'],r['allAttempts']['control']['maeG']);self.assertFalse(r['considerationGate']['passesAll'])
  c,rows=fixture()
  for row in rows.values():row['geometry']['massG']=72
  self.assertFalse(summarize_geometry(c,rows)['considerationGate']['passesAll'])
