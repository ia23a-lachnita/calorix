"""Independent exact graph/weight-lineage audit; no forward execution."""
import argparse,hashlib,json
from pathlib import Path
import onnx

def sha(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def serialized(values):return [v.SerializeToString().hex() for v in values]
def main(a):
 profile=json.loads((a.repo/'functions/eval/tier1-public/lens-onnx-lowering-profile-v3.json').read_text());oldpath=a.parent/'export-dynamo/model.onnx';newpath=a.execution/'model/model.onnx';p=onnx.load(str(oldpath),load_external_data=False);n=onnx.load(str(newpath),load_external_data=False);prefix='__calorix_v3_stable_sigmoid_';oldtarget=[node for node in p.graph.node if node.op_type=='Sigmoid'];assert len(oldtarget)==1 and oldtarget[0].name=='node_sigmoid';newnodes=[node for node in n.graph.node if node.name.startswith(prefix)];assert len(newnodes)==10 and len(n.graph.node)==len(p.graph.node)+9;assert not any(node.op_type=='Sigmoid' for node in n.graph.node);assert serialized([node for node in p.graph.node if node.op_type!='Sigmoid'])==serialized([node for node in n.graph.node if not node.name.startswith(prefix)]);assert serialized(p.graph.initializer)==serialized(n.graph.initializer);assert serialized(p.graph.input)==serialized(n.graph.input) and serialized(p.graph.output)==serialized(n.graph.output);assert serialized(p.opset_import)==serialized(n.opset_import) and p.ir_version==n.ir_version==10
 def v(name):return prefix+name
 expected=[('Constant',[],[v('one')]),('Constant',[],[v('zero')]),('Abs',['add_33'],[v('absolute')]),('Neg',[v('absolute')],[v('negative_absolute')]),('Exp',[v('negative_absolute')],[v('exponential')]),('Add',[v('one'),v('exponential')],[v('denominator')]),('Div',[v('one'),v('denominator')],[v('positive')]),('Div',[v('exponential'),v('denominator')],[v('negative')]),('GreaterOrEqual',['add_33',v('zero')],[v('nonnegative')]),('Where',[v('nonnegative'),v('positive'),v('negative')],['sigmoid'])]
 assert [(node.op_type,list(node.input),list(node.output)) for node in newnodes]==expected
 for node,value in zip(newnodes[:2],[1.,0.]):
  attr=node.attribute[0];assert attr.name=='value' and attr.t.data_type==onnx.TensorProto.FLOAT and list(attr.t.dims)==[] and list(attr.t.float_data)==[value]
 assert sha(newpath)==profile['candidateGraphSha256'];weights=[]
 for pin in profile['parentGraphFiles']:
  before=a.parent/'export-dynamo'/pin['name'];assert sha(before)==pin['sha256'] and before.stat().st_size==pin['bytes']
  if pin['name']=='model.onnx':continue
  after=a.execution/'model'/pin['name'];assert sha(after)==pin['sha256'] and after.stat().st_size==pin['bytes'];assert before.stat().st_nlink==after.stat().st_nlink==1 and before.stat().st_ino!=after.stat().st_ino;weights.append({'name':pin['name'],'sha256':pin['sha256'],'bytes':pin['bytes'],'independentCopies':True})
 result={'allChecksPass':True,'oldNodes':len(p.graph.node),'newNodes':len(n.graph.node),'oldSigmoids':1,'newStableStandardNodes':10,'unchangedOtherNodes':len(p.graph.node)-1,'initializersIdentical':len(p.graph.initializer),'inputOutputAndOpsetIdentical':True,'parentGraphSha256':sha(oldpath),'candidateGraphSha256':sha(newpath),'weights':weights,'neuralForwardCalls':0,'originalRawV1':'FAILED','originalEndpointV2':'FAILED'};a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--parent',type=Path,required=True);p.add_argument('--execution',type=Path,required=True);p.add_argument('--output',type=Path,required=True);main(p.parse_args())
