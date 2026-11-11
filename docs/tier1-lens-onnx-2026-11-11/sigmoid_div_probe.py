"""Tiny arithmetic fixture, not a meal model, image or accuracy measurement."""
import hashlib,json,math,time
from pathlib import Path
import numpy as np,onnx,onnxruntime as ort,torch
from onnx import helper,TensorProto
root=Path(__file__).parent;torch.set_num_threads(2);torch.set_num_interop_threads(1)
x=np.asarray([-12.,-10.663076400756836,-10.64770793914795,-10.0638427734375,-10.334312438964844,-10.,-8.,-4.,0.,4.,8.,10.,12.],np.float32)
graph=helper.make_graph([helper.make_node('Neg',['x'],['negative']),helper.make_node('Exp',['negative'],['exponential']),helper.make_node('Constant',[],['one'],value=helper.make_tensor('one_value',TensorProto.FLOAT,[],[1.])),helper.make_node('Add',['one','exponential'],['denominator']),helper.make_node('Div',['one','denominator'],['p'])],'scalar_sigmoid_probe',[helper.make_tensor_value_info('x',TensorProto.FLOAT,list(x.shape))],[helper.make_tensor_value_info('p',TensorProto.FLOAT,list(x.shape))]);model=helper.make_model(graph,opset_imports=[helper.make_opsetid('',18)],ir_version=10);path=root/'sigmoid-div-probe.onnx';onnx.save(model,path);onnx.checker.check_model(str(path));options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1;options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_DISABLE_ALL;options.add_session_config_entry('session.intra_op.allow_spinning','0');options.add_session_config_entry('session.inter_op.allow_spinning','0');session=ort.InferenceSession(str(path),options,providers=['CPUExecutionProvider'])
with torch.inference_mode():tp=torch.sigmoid(torch.from_numpy(x)).numpy()
op=session.run(['p'],{'x':x})[0]
def logit(p):
 q=np.clip(p,np.float32(1e-6),np.float32(1-1e-6));return np.log(q)-np.log1p(-q)
a=logit(tp);b=logit(op);rows=[]
for i,z in enumerate(x):
 true=1/(1+math.exp(-float(z)));rows.append({'input':float(z),'torchProbability':float(tp[i]),'ortProbability':float(op[i]),'mathematicalProbability':true,'torchRoundTripLogit':float(a[i]),'ortRoundTripLogit':float(b[i]),'probabilityAbsoluteDifference':float(abs(float(tp[i])-float(op[i]))),'logitAbsoluteDifference':float(abs(float(a[i])-float(b[i]))),'frozenLogitTolerance':.0001+.0001*abs(float(a[i]))})
result={'scope':'13-element standalone FP32 Sigmoid arithmetic fixture, no meal/image/weights','graphSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'providers':session.get_providers(),'optimization':'disabled','rows':rows,'maxProbabilityAbsoluteDifference':max(r['probabilityAbsoluteDifference'] for r in rows),'maxLogitAbsoluteDifference':max(r['logitAbsoluteDifference'] for r in rows),'fullModelFirstDivergentOperatorProven':False};(root/'sigmoid-div-probe.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='rows'}))
