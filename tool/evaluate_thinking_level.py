"""Offline replay of the fixed one-photo LOW/HIGH thinking study."""
import argparse,hashlib,json,statistics
from pathlib import Path
from tool.thinking_level_metrics import summarize_thinking

def read(path,sha=None):
 raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest()
 if sha and digest!=sha:raise ValueError('Pinned receipt drift')
 return json.loads(raw),digest

def evaluate(root,base):
 receipt,rsha=read(root/'experiment.json');manifest,msha=read(base/'manifest-mealrange-v1.json',receipt['manifestSha256']);protocol,psha=read(base/'thinking-level-protocol-v1.json',receipt['protocolSha256'])
 if receipt['status']!='completed' or receipt['unknownInFlight'] or receipt['maxSdkEntries']!=21 or receipt['completedSdkEntries']!=21 or len(receipt['outcomes'])!=20:raise ValueError('Complete bounded21 study required')
 if any(receipt[k]!=protocol[k] for k in ('order','model','engineCommit','schemaSha256','promptSha256')):raise ValueError('Protocol/engine/prompt mismatch')
 if [(o['id'],o['arm']) for o in receipt['outcomes']]!=[(c['id'],a) for c in protocol['order'] for a in c['arms']]:raise ValueError('Ledger order mismatch')
 probe,_=read(root/'probe.json');response,_=read(root/'probe-response.json')
 if probe.get('sdkInvocations')!=1 or probe.get('successfulCompatibility') is not True or probe.get('returnedModel')!=receipt['model'] or json.loads(response['text']).get('components')!=[] or response['inputSha256']!=[protocol['probeImageSha256']] or response['thinkingLevel']!='HIGH' or response['timeoutMs']!=60000 or response['returnedModel']!=receipt['model'] or response['promptSha256']!=receipt['promptSha256']:raise ValueError('Owned blank probe mismatch')
 rows={};pins=[];latency={a:[] for a in ('low','high')};usage={a:[] for a in latency}
 for c in manifest['cases']:
  rows[c['id']]={}
  for arm in latency:
   record,digest=read(root/c['id']/arm/(c['id']+'.json'));raw,rhash=read(root/c['id']/arm/'sdk-response.json')
   if record['id']!=c['id'] or record['sdkInvoked'] is not True:raise ValueError('Actual food invocation required')
   outcome=next(o for o in receipt['outcomes'] if o['id']==c['id'] and o['arm']==arm)
   if outcome['sdkInvocations']!=1 or any(outcome[k]!=record['A1'].get(k) for k in ('status','failure')):raise ValueError('Completed outcome mismatch')
   if raw['requestedModel']!=receipt['model'] or raw['returnedModel']!=receipt['model'] or raw['promptSha256']!=receipt['promptSha256'] or raw['inputSha256']!=[c['inputSha256']] or raw['thinkingLevel']!=arm.upper() or raw['timeoutMs']!=60000:raise ValueError('Raw SDK input/model/config drift')
   if record['A1']['status']=='ok':
    estimate=record['estimate'];prov=estimate['provenance']
    if sum(v['massG'] for v in estimate['components'])!=record['A1']['massG'] or estimate['totals']!=record['A1']['predicted'] or any(prov[k]!=receipt['model'] for k in ('model','returnedModel')) or prov['promptSha256']!=receipt['promptSha256']:raise ValueError('Decoded outcome mismatch')
   rows[c['id']][arm]=record['A1'];pins.append(dict(id=c['id'],arm=arm,recordSha256=digest,sdkResponseSha256=rhash));latency[arm].append(raw['latencyMs']);usage[arm].append(raw['usageMetadata'])
 result=summarize_thinking(manifest['cases'],rows);tokens={}
 for arm,values in usage.items():
  tokens[arm]={}
  for key in ('promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'):
   known=[v[key] for v in values if isinstance(v,dict) and type(v.get(key)) in (int,float)]
   tokens[arm][key]=dict(knownSum=sum(known) if known else None,recordsKnown=len(known),recordsAttempted=len(values))
 result.update(schemaVersion='thinking-level-result-1',sourceCommit=receipt['sourceCommit'],engineCommit=receipt['engineCommit'],model=receipt['model'],promptSha256=receipt['promptSha256'],schemaSha256=receipt['schemaSha256'],manifestSha256=msha,protocolSha256=psha,experimentReceiptSha256=rsha,sdkEntries=21,newFoodPredictionEntries=20,newReferenceMeals=0,androidWeighedMeals=0,receiptPins=pins,modelLatencyMs={a:dict(median=statistics.median(v),p90=sorted(v)[8]+(sorted(v)[9]-sorted(v)[8])*.1,max=max(v),records=len(v)) for a,v in latency.items()},tokenUsage=tokens,costUsd=None)
 return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--experiment',type=Path,required=True);p.add_argument('--repo',type=Path,default=Path.cwd());p.add_argument('--output',type=Path,required=True);a=p.parse_args();r=evaluate(a.experiment,a.repo/'functions/eval/tier1-public');a.output.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'pairs':r['pairedValid']['scoredPairs'],'low':r['allAttempts']['low']['served'],'high':r['allAttempts']['high']['served'],'gate':r['considerationGate']}))
