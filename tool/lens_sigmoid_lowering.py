"""One explicitly versioned, standard FP32 Sigmoid lowering; checkpoint unchanged."""
import copy,math,os
from pathlib import Path

def cohort_budget_ms(ort_blank_ms,torch_blank_ms):
 if any(type(x) not in (int,float) or not math.isfinite(x) or x<=0 for x in [ort_blank_ms,torch_blank_ms]):raise ValueError('Positive finite qualification times required')
 return 1.2*(42*ort_blank_ms+6*torch_blank_ms)+ort_blank_ms+torch_blank_ms+120000

def rewrite_sigmoid(model):
 from onnx import helper,TensorProto
 result=copy.deepcopy(model);targets=[n for n in result.graph.node if n.domain in ('','ai.onnx') and n.op_type=='Sigmoid']
 if len(targets)!=1 or targets[0].name!='node_sigmoid' or list(targets[0].input)!=['add_33'] or list(targets[0].output)!=['sigmoid']:raise ValueError('Exactly the pinned single Sigmoid identity required')
 prefix='__calorix_v3_stable_sigmoid_';existing={s for n in result.graph.node for s in list(n.input)+list(n.output)+[n.name]}|{v.name for v in result.graph.initializer}
 if any(s.startswith(prefix) for s in existing):raise ValueError('Lowering namespace collision')
 n=lambda key:prefix+key
 constant=lambda key,value:helper.make_node('Constant',[],[n(key)],name=n(key),value=helper.make_tensor(n(key+'_value'),TensorProto.FLOAT,[],[value]))
 replacement=[constant('one',1.),constant('zero',0.),helper.make_node('Abs',['add_33'],[n('absolute')],name=n('absolute')),helper.make_node('Neg',[n('absolute')],[n('negative_absolute')],name=n('negative_absolute')),helper.make_node('Exp',[n('negative_absolute')],[n('exponential')],name=n('exponential')),helper.make_node('Add',[n('one'),n('exponential')],[n('denominator')],name=n('denominator')),helper.make_node('Div',[n('one'),n('denominator')],[n('positive')],name=n('positive')),helper.make_node('Div',[n('exponential'),n('denominator')],[n('negative')],name=n('negative')),helper.make_node('GreaterOrEqual',['add_33',n('zero')],[n('nonnegative')],name=n('nonnegative')),helper.make_node('Where',[n('nonnegative'),n('positive'),n('negative')],['sigmoid'],name=n('output'))]
 nodes=[]
 for node in result.graph.node:nodes.extend(replacement if node.name=='node_sigmoid' and node.op_type=='Sigmoid' else [node])
 if len(nodes)!=len(model.graph.node)+9:raise ValueError('Exactly one replacement required')
 del result.graph.node[:];result.graph.node.extend(nodes)
 return result

def lower_once(parent_graph,output_dir,parent_files):
 import onnx
 from tool.run_lens_onnx import safe_external_path,inspect_graph
 from tool.run_calorie_lens_eval import sha,verify_file,write
 if output_dir.exists():raise ValueError('Fresh candidate directory required')
 for f in parent_files:verify_file(safe_external_path(parent_graph.parent,f['name']),f['sha256'],f['bytes'])
 before=sha(parent_graph);model=onnx.load(str(parent_graph),load_external_data=False);changed=rewrite_sigmoid(model);output_dir.mkdir()
 for f in parent_files:
  if f['name']==parent_graph.name:continue
  source=safe_external_path(parent_graph.parent,f['name']);target=safe_external_path(output_dir,f['name']);target.parent.mkdir(parents=True,exist_ok=True);os.link(source,target)
 graph=output_dir/'model.onnx';onnx.save_model(changed,str(graph));receipt=inspect_graph(graph)
 if sha(parent_graph)!=before:raise ValueError('Parent graph changed')
 for f in parent_files:verify_file(safe_external_path(parent_graph.parent,f['name']),f['sha256'],f['bytes'])
 for f in receipt['files']:
  if f['name']!='model.onnx':
   expected=next(v for v in parent_files if v['name']==f['name']);assert f['sha256']==expected['sha256'] and f['bytes']==expected['bytes']
 write(output_dir/'lineage.json',{'candidate':'v3-stable-sigmoid','parentGraphSha256':before,'graph':receipt,'parentFiles':parent_files,'originalNodes':len(model.graph.node),'derivedNodes':len(changed.graph.node),'standardNodesReplacingSingleSigmoid':10,'math':'e=exp(-abs(x));d=1+e;where(x>=0,1/d,e/d)','precision':'float32','optimization':'disabled','weightChanges':False,'training':False,'originalRawV1':'FAILED','originalEndpointV2':'FAILED','raw_speed_qualified':False})
 return graph,receipt
