import tempfile, unittest
from pathlib import Path
from tool.run_lens_onnx import safe_external_path, resource_stop, validate_outputs, successful_attempt
import numpy as np

class RunnerContractTest(unittest.TestCase):
 def test_receipt_cannot_override_worker_or_resource_failure(self):
  self.assertTrue(successful_attempt({'workerExitCode':0,'resourceStop':None},True))
  self.assertFalse(successful_attempt({'workerExitCode':1,'resourceStop':None},True))
  self.assertFalse(successful_attempt({'workerExitCode':0,'resourceStop':'sampled_rss'},True))
  self.assertFalse(successful_attempt({'workerExitCode':0,'resourceStop':None},False))
 def test_external_data_stays_inside_attempt(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d)
   self.assertEqual(safe_external_path(root,'weights.data'),root/'weights.data')
   for name in ['../secret','/absolute','sub/../../secret','',r'..\secret']:
    with self.assertRaises(ValueError):safe_external_path(root,name)
   (root/'escape').symlink_to('/etc')
   with self.assertRaises(ValueError):safe_external_path(root,'escape/passwd')
 def test_watchdog_uses_all_fixed_limits(self):
  limits={'rssBytes':100,'minAvailableBytes':50,'wallSeconds':10,'idleSeconds':3,'artifactBytes':20}
  self.assertIsNone(resource_stop(100,50,10,3,20,limits))
  for values,reason in [((101,50,0,0,0),'sampled_rss'),((0,49,0,0,0),'available_memory'),((0,50,11,0,0),'wall_timeout'),((0,50,0,4,0),'idle_timeout'),((0,50,0,0,21),'artifact_limit')]:
   self.assertEqual(resource_stop(*values,limits),reason)
 def test_fixed_seven_heads_reject_nonfinite_shape_dtype(self):
  shapes=[(1,253),(1,253),(1,253),(1,5),(1,253),(1,),(1,8)]
  values=[np.zeros(s,np.float32) for s in shapes];validate_outputs(values)
  for index in [0,6]:
   bad=list(values);bad[index]=np.zeros((2,2),np.float32)
   with self.assertRaises(ValueError):validate_outputs(bad)
  values[0][0,0]=np.nan
  with self.assertRaises(ValueError):validate_outputs(values)
