"""Independent scalar audit of portable blank-only runtime evidence; no model imports."""
import argparse,gzip,hashlib,json,math
from pathlib import Path
SHAPES={'logits':[1,253],'log_grams':[1,253],'soft':[1,253],'log_totals':[1,5],'grams':[1,253],'mass_gap':[1],'totals':[1,8]}
def shape(value):
 if not isinstance(value,list):return []
 assert value
 children=[shape(v) for v in value];assert all(s==children[0] for s in children)
 return [len(value)]+children[0]
def flat(value):
 if isinstance(value,list):return [n for v in value for n in flat(v)]
 assert type(value) in (int,float) and math.isfinite(value)
 return [float(value)]
def sigmoid(z):
 if z>=0:return 1/(1+math.exp(-z))
 e=math.exp(z);return e/(1+e)
def compare(e,a):
 failures=[];heads={};points={}
 if e['inputTensor']!=a['inputTensor']:failures.append('input_tensor')
 if [p['name'] for p in e['publisherSummary']['ingredients']]!=[p['name'] for p in a['publisherSummary']['ingredients']]:failures.append('display_names_or_order')
 for name,s in SHAPES.items():
  assert shape(e['raw'][name])==s==shape(a['raw'][name]);ev=flat(e['raw'][name]);av=flat(a['raw'][name]);bad=[]
  for i,(x,y) in enumerate(zip(ev,av)):
   atol=.0001 if name in ['logits','log_grams','log_totals'] else [.05,.005,.005,.005,.005,.005,.005,.5][i] if name=='totals' else .005
   if abs(x-y)>atol+.0001*abs(x):bad.append({'index':i,'expected':x,'actual':y,'absoluteDifference':abs(x-y),'allowed':atol+.0001*abs(x)})
  heads[name]={'elements':len(ev),'outsideTolerance':len(bad),'maxAbsoluteDifference':max(abs(x-y) for x,y in zip(ev,av)),'outside':bad}
  if bad:failures.append(name+':numeric')
 for name,bound in [('massG',.1),('kcal',.1),('proteinG',.02),('carbsG',.02),('fatG',.02)]:
  x=e['massG'] if name=='massG' else e['totals'][name];y=a['massG'] if name=='massG' else a['totals'][name];assert math.isfinite(x) and math.isfinite(y);points[name]=abs(x-y)
  if abs(x-y)>bound+1e-12:failures.append(name+':point')
 return {'passes':not failures,'failures':failures,'heads':heads,'pointAbsoluteDifferences':points,'maxPresenceProbabilityDifference':max(abs(sigmoid(x)-sigmoid(y)) for x,y in zip(flat(e['raw']['logits']),flat(a['raw']['logits'])))}
def main(repo,out):
 evidence=repo/'docs/tier1-lens-onnx-2026-11-11';profile=json.loads((repo/'functions/eval/tier1-public/lens-onnx-profile-v1.json').read_text());records={};verified=0
 for p in json.loads((evidence/'execution-v2-records.json').read_text()):
  data=gzip.decompress((repo/p['archive']).read_bytes());assert hashlib.sha256(data).hexdigest()==p['sha256'] and len(data)==p['bytes'];verified+=1
  if p['path'].endswith('.json'):records[p['path']]=json.loads(data)
 baseline_bytes=gzip.decompress((repo/'docs/tier1-calorie-lens-2026-11-11/experiment/calorie-lens/__qualification__.json.gz').read_bytes());assert hashlib.sha256(baseline_bytes).hexdigest()==profile['qualification']['expectedSha256'];baseline=json.loads(baseline_bytes)
 fresh=records['diagnostic-v1/torch-repeat.json'];results={};checks=0
 for key in ['export-dynamo/qualification.json','diagnostic-v1/torch-repeat.json']+['diagnostic-v1/ort-'+v+'.json' for v in profile['diagnosticOptimizations']]:
  row=records[key];assert row['id']=='__qualification__' and row['inputSha256']==profile['qualification']['inputSha256'];assert row['expectedSha256']==profile['qualification']['expectedSha256']
  actual=compare(baseline,row);assert actual['passes']==row['parity']['passes'] and actual['failures']==row['parity']['failures']
  for name in SHAPES:
   assert actual['heads'][name]['outsideTolerance']==row['parity']['heads'][name]['outsideTolerance'];assert abs(actual['heads'][name]['maxAbsoluteDifference']-row['parity']['heads'][name]['maxAbsoluteDifference'])<1e-12;checks+=actual['heads'][name]['elements']
  against_fresh=compare(fresh,row)
  if 'parityAgainstFreshTorch' in row:assert against_fresh['passes']==row['parityAgainstFreshTorch']['passes'] and against_fresh['failures']==row['parityAgainstFreshTorch']['failures']
  assert row['imageWallMs']>=row['forwardAndDecodeMs']>0
  results[key]={'oldBaseline':actual,'freshTorch':against_fresh,'imageWallMs':row['imageWallMs'],'forwardAndDecodeMs':row['forwardAndDecodeMs'],'before':row['before'],'after':row['after']}
 supervision=records['diagnostic-v1/supervision.json'];assert supervision['workerExitCode']==0 and supervision['resourceStop'] is None
 result={'recordArchiveHashesVerified':verified,'rawScalarComparisonsAgainstOldSource':checks,'newFoodPredictions':0,'measuredBlankForwards':6,'exportTraceWorkSeparate':True,'plannedFoodRecordsUnattempted':48,'blankResults':results,'diagnosticSupervision':supervision,'noFoodAccuracyOrSpeedConclusion':True}
 out.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n');print(json.dumps({k:{'parity':v['oldBaseline']['passes'],'failures':v['oldBaseline']['failures'],'wallMs':v['imageWallMs'],'maxLogitDifference':v['oldBaseline']['heads']['logits']['maxAbsoluteDifference'],'maxProbabilityDifference':v['oldBaseline']['maxPresenceProbabilityDifference']} for k,v in results.items()},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();main(a.repo,a.output)
