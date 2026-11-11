import unittest
from tool.summarize_lens_onnx import timing_summary
class TimingSummaryTest(unittest.TestCase):
 def test_median_of_six_paired_ratios_and_incomplete_controls(self):
  controls=[{'id':str(i),'order':['torch','ort']} for i in range(6)];records={}
  for c,ratio in zip(controls,[1,1,1,1,4,4]):
   records[(c['id'],'torch')]={'imageWallMs':10*ratio,'forwardAndDecodeMs':10*ratio}
   records[(c['id'],'ort')]={'imageWallMs':10,'forwardAndDecodeMs':10}
  result=timing_summary(controls,records);self.assertEqual(result['medianPairedImageWallRatio'],1);self.assertEqual(result['scored'],6)
  del records[('0','ort')];result=timing_summary(controls,records);self.assertEqual(result['scored'],5);self.assertIsNone(result['medianPairedImageWallRatio'])
 def test_nonfinite_zero_or_negative_timings_are_failures(self):
  for bad in [0,-1,float('nan'),float('inf')]:
   c=[{'id':str(i),'order':['ort','torch']} for i in range(6)];r={(v['id'],engine):{'imageWallMs':10,'forwardAndDecodeMs':9} for v in c for engine in ['torch','ort']};r[('0','ort')]['imageWallMs']=bad
   self.assertEqual(timing_summary(c,r)['scored'],5)
