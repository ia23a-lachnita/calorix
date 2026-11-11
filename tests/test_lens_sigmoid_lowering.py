import importlib.util,math,unittest
from tool.lens_sigmoid_lowering import rewrite_sigmoid,cohort_budget_ms
HAS_ONNX=importlib.util.find_spec('onnx') is not None
HAS_RUNTIME=HAS_ONNX and importlib.util.find_spec('onnxruntime') is not None and importlib.util.find_spec('torch') is not None

def toy():
 from onnx import helper,TensorProto
 return helper.make_model(helper.make_graph([helper.make_node('Sigmoid',['add_33'],['sigmoid'],name='node_sigmoid')],'fixture',[helper.make_tensor_value_info('add_33',TensorProto.FLOAT,[None])],[helper.make_tensor_value_info('sigmoid',TensorProto.FLOAT,[None])]),opset_imports=[helper.make_opsetid('',18)],ir_version=10)
class StableLoweringTest(unittest.TestCase):
 def test_budget_accepts_fast_blank_and_rejects_overrun(self):
  self.assertLess(cohort_budget_ms(40000,68329.30435391609),3600000)
  self.assertGreater(cohort_budget_ms(128000,68329.30435391609),3600000)
 def test_budget_requires_positive_finite_measurements(self):
  for value in [0,-1,float('inf'),float('nan')]:
   with self.assertRaises(ValueError):cohort_budget_ms(value,68000)
 @unittest.skipUnless(HAS_ONNX,'Optional pinned ONNX conversion environment required')
 def test_lowering_preserves_parent_and_external_weight_descriptors(self):
  import onnx
  from onnx import helper,TensorProto
  parent=toy();tensor=helper.make_tensor('retained',TensorProto.FLOAT,[1],[1.]);parent.graph.initializer.append(tensor);before=parent.SerializeToString();candidate=rewrite_sigmoid(parent);onnx.checker.check_model(candidate)
  self.assertEqual(parent.SerializeToString(),before);self.assertEqual(candidate.graph.initializer[0].SerializeToString(),parent.graph.initializer[0].SerializeToString());self.assertEqual(len(candidate.graph.node),10);self.assertFalse(any(n.op_type=='Sigmoid' for n in candidate.graph.node));self.assertEqual(candidate.graph.output[0].SerializeToString(),parent.graph.output[0].SerializeToString())
 @unittest.skipUnless(HAS_ONNX,'Optional pinned ONNX conversion environment required')
 def test_unexpected_operator_identity_or_namespace_fails(self):
  from onnx import helper
  for change in ['name','input','count','namespace']:
   parent=toy()
   if change=='name':parent.graph.node[0].name='different'
   if change=='input':parent.graph.node[0].input[0]='different'
   if change=='count':parent.graph.node.append(helper.make_node('Sigmoid',['add_33'],['other'],name='other'))
   if change=='namespace':parent.graph.node.append(helper.make_node('Identity',['add_33'],['__calorix_v3_stable_sigmoid_collision'],name='collision'))
   with self.assertRaises(ValueError):rewrite_sigmoid(parent)
 @unittest.skipUnless(HAS_RUNTIME,'Optional pinned ONNX/Torch numerical environment required')
 def test_standard_operator_fixture_matches_torch_including_extremes_and_nan(self):
  import numpy as np,onnxruntime as ort,torch
  torch.set_num_threads(2)
  options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1;options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_DISABLE_ALL;options.add_session_config_entry('session.intra_op.allow_spinning','0');options.add_session_config_entry('session.inter_op.allow_spinning','0')
  session=ort.InferenceSession(rewrite_sigmoid(toy()).SerializeToString(),options,providers=['CPUExecutionProvider'])
  x=np.asarray([-1000,-100,-90,-88.8,-12,-10.663076400756836,-10.64770793914795,-10.0638427734375,-10.334312438964844,-10,-8,-4,-0.,0,4,8,10,12,88.8,90,100,1000,-np.inf,np.inf,np.nan],np.float32)
  with torch.inference_mode():expected=torch.sigmoid(torch.from_numpy(x)).numpy()
  actual=session.run(['sigmoid'],{'add_33':x})[0];finite=~np.isnan(x);self.assertTrue(np.isfinite(actual[finite]).all());self.assertTrue(((actual[finite]>=0)&(actual[finite]<=1)).all());self.assertTrue(np.isnan(actual[-1]));np.testing.assert_allclose(actual[finite],expected[finite],atol=2e-7,rtol=1e-6)
  def inverse(p):
   p=np.clip(p,np.float32(1e-6),np.float32(1-1e-6));return np.log(p)-np.log1p(-p)
  ep=inverse(expected[finite]);ap=inverse(actual[finite]);self.assertTrue(np.all(np.abs(ep-ap)<=.0001+.0001*np.abs(ep)),list(zip(x[finite],ep,ap)))
