"""Replay fixed same-meal one/two-image outcomes; never call the SDK."""
import argparse,hashlib,json,statistics
from pathlib import Path
from evaluate_public_weighed import read_json,write_json
from tool.paired_view_metrics import summarize_pairs

def main():
 p=argparse.ArgumentParser();p.add_argument('--experiment',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--repo',type=Path,default=Path.cwd());a=p.parse_args();root=a.experiment;base=a.repo/'functions/eval/tier1-public'
 receipt,receiptsha=read_json(root/'experiment.json')
 if receipt['status']!='completed' or receipt['unknownInFlight'] or receipt['maxSdkEntries']!=13 or not 1<=receipt['completedSdkEntries']<=13:raise ValueError('Completed bounded thirteen-entry study required')
 manifest,_=read_json(base/'manifest-paired-view-v1.json',receipt['manifestSha256']);protocol,_=read_json(base/'paired-view-protocol-v1.json',receipt['protocolSha256'])
 if receipt['order']!=protocol['order'] or receipt['promptSha256']!=protocol['promptSha256']:raise ValueError('Fixed order/prompt mismatch')
 rows={};pins=[];timing={'single':[],'paired':[]};usage={k:[] for k in timing};actualCalls=1
 for c in manifest['cases']:
  rows[c['id']]={}
  for arm in ['single','paired']:
   row,digest=read_json(root/c['id']/arm/(c['id']+'.json'));rows[c['id']][arm]=row['A1']
   if row['id']!=c['id'] or type(row.get('sdkInvoked')) is not bool:raise ValueError('Case identity/invocation missing')
   actualCalls+=int(row['sdkInvoked']);pins.append({'id':c['id'],'arm':arm,'receiptSha256':digest})
   if row['sdkInvoked']:
    response,sha=read_json(root/c['id']/arm/'sdk-response.json');expected=[c['inputSha256']]+([c['sideInputSha256']] if arm=='paired' else [])
    if response['requestedModel']!=receipt['model'] or response['returnedModel']!=receipt['model'] or response['promptSha256']!=receipt['promptSha256'] or response['inputSha256']!=expected:raise ValueError('Raw SDK input/model/prompt drift')
    if row['A1']['status']=='ok':
     prov=row['estimate']['provenance']
     if prov['model']!=receipt['model'] or prov['returnedModel']!=receipt['model'] or prov['promptSha256']!=receipt['promptSha256']:raise ValueError('Decoded provenance drift')
    pins[-1]['sdkResponseSha256']=sha;timing[arm].append(response['latencyMs']);usage[arm].append(response['usageMetadata'])
 if actualCalls!=receipt['completedSdkEntries'] or len(receipt['outcomes'])!=12:raise ValueError('Invocation/receipt ledger mismatch')
 result=summarize_pairs(manifest['cases'],rows)
 groups={}
 for role in ['large_error','small_error_control']:
  subset=[c for c in manifest['cases'] if c['auditRole']==role];groups[role]=summarize_pairs(subset,{c['id']:rows[c['id']] for c in subset})
 tokens={}
 for arm,values in usage.items():
  tokens[arm]={}
  for key in ['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount']:
   known=[v[key] for v in values if isinstance(v,dict) and type(v.get(key)) in (int,float)]
   tokens[arm][key]={'knownSum':sum(known) if known else None,'recordsKnown':len(known),'recordsAttempted':len(values)}
 result.update(schemaVersion='paired-view-result-1',sourceCommit=receipt['sourceCommit'],engineCommit=receipt['engineCommit'],manifestSha256=receipt['manifestSha256'],protocolSha256=receipt['protocolSha256'],experimentReceiptSha256=receiptsha,
  model=receipt['model'],promptSha256=receipt['promptSha256'],schemaSha256=receipt['schemaSha256'],sdkEntries=actualCalls,newFoodPredictionEntries=actualCalls-1,newReferenceMeals=0,groups=groups,receiptPins=pins,
  modelLatencyMs={k:{'median':statistics.median(v) if v else None,'max':max(v) if v else None,'records':len(v)} for k,v in timing.items()},tokenUsage=tokens,costUsd=None,
  cameraResolutionCaveat=manifest['preparation']['limitation'],phoneUserEffort=None,androidWeighedMeals=0,foodDetectionPrecision=None,foodDetectionRecall=None,metricScaleValidated=False)
 write_json(a.output,result);print(json.dumps({'pairedValid':result['pairedValid'],'caseDeltas':[{'id':c['id'],'deltaAbsoluteKcal':c['deltaAbsoluteKcalTwoMinusOne']} for c in result['cases']]}))
if __name__=='__main__':main()
