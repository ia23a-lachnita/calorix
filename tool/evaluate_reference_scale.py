"""Replay complete ECUSTFD mass-cue receipts; no network or calorie reference."""
import argparse,hashlib,json,statistics
from pathlib import Path
from tool.reference_scale import summarize_mass_pairs

def read(path,sha=None):
 raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest()
 if sha and digest!=sha:raise ValueError('Receipt hash drift')
 return json.loads(raw),digest

def evaluate(root,base):
 receipt,rsha=read(root/'experiment.json');manifest,msha=read(base/'manifest-reference-scale-v1.json',receipt['manifestSha256']);protocol,psha=read(base/'reference-scale-protocol-v1.json',receipt['protocolSha256'])
 if receipt['status']!='completed' or receipt['unknownInFlight'] or receipt['completedSdkEntries']!=13 or receipt['maxSdkEntries']!=13 or len(receipt['outcomes'])!=12:raise ValueError('Complete bounded13 registry required')
 if receipt['order']!=protocol['order'] or receipt['promptSha256']!=protocol['promptSha256']:raise ValueError('Fixed order/prompt mismatch')
 probe,_=read(root/'probe.json');rawprobe,_=read(root/'probe-response.json')
 if probe!={'sdkInvocations':1,'successfulCompatibility':True,'returnedModel':receipt['model']} or json.loads(rawprobe['text']).get('components')!=[] or rawprobe['inputSha256']!=protocol['probeImageSha256'] or rawprobe['returnedModel']!=receipt['model'] or rawprobe['promptSha256']!=protocol['promptSha256']['metric']:raise ValueError('Blank probe drift')
 expectedOrder=[(c['id'],a) for c in protocol['order'] for a in c['arms']]
 if [(o['id'],o['arm']) for o in receipt['outcomes']]!=expectedOrder:raise ValueError('Ledger order mismatch')
 rows={};pins=[];latency={a:[] for a in ('neutral','metric')};usage={a:[] for a in latency}
 for c in manifest['cases']:
  rows[c['id']]={}
  for arm in latency:
   record,sha=read(root/c['id']/arm/'record.json');response,rhash=read(root/c['id']/arm/'sdk-response.json')
   if record['id']!=c['id'] or record['arm']!=arm or record['sdkInvocations']!=1 or record['referenceMassG']!=c['referenceMassG'] or record['calorieReference'] is not None or record['volumeReferenceUsed'] is not False:raise ValueError('Fixed record mismatch')
   outcome=next(o for o in receipt['outcomes'] if o['id']==c['id'] and o['arm']==arm)
   if any(record[k]!=outcome[k] for k in ('status','failure','sdkInvocations')):raise ValueError('Ledger outcome mismatch')
   if response['requestedModel']!=receipt['model'] or response['returnedModel']!=receipt['model'] or response['promptSha256']!=protocol['promptSha256'][arm] or response['inputSha256']!=c['imageSha256']:raise ValueError('SDK model/prompt/photo drift')
   if record['status']=='ok':
    estimate=record['estimate'];prov=estimate['provenance']
    if sum(x['massG'] for x in estimate['components'])!=record['massG'] or prov['model']!=receipt['model'] or prov['returnedModel']!=receipt['model'] or prov['promptSha256']!=protocol['promptSha256'][arm]:raise ValueError('Decoded mass/provenance drift')
   elif record['estimate'] is not None:raise ValueError('Failed estimate must be null')
   rows[c['id']][arm]=record;pins.append(dict(id=c['id'],arm=arm,recordSha256=sha,responseSha256=rhash));latency[arm].append(response['latencyMs']);usage[arm].append(response['usageMetadata'])
 result=summarize_mass_pairs(manifest['cases'],rows)
 tokens={}
 for arm,values in usage.items():
  tokens[arm]={}
  for key in ('promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'):
   known=[v[key] for v in values if isinstance(v,dict) and type(v.get(key)) in (int,float)]
   tokens[arm][key]=dict(knownSum=sum(known) if known else None,recordsKnown=len(known),attempted=len(values))
 result.update(schemaVersion='reference-scale-result-1',sourceCommit=receipt['sourceCommit'],engineCommit=receipt['engineCommit'],model=receipt['model'],promptSha256=receipt['promptSha256'],schemaSha256=receipt['schemaSha256'],manifestSha256=msha,protocolSha256=psha,experimentReceiptSha256=rsha,sdkEntries=13,newFoodPredictionEntries=12,newPublicReferencePortions=6,androidWeighedMeals=0,receiptPins=pins,modelLatencyMs={a:dict(median=statistics.median(v),max=max(v),records=len(v)) for a,v in latency.items()},tokenUsage=tokens,costUsd=None)
 return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--experiment',type=Path,required=True);p.add_argument('--repo',type=Path,default=Path.cwd());p.add_argument('--output',type=Path,required=True);a=p.parse_args();r=evaluate(a.experiment,a.repo/'functions/eval/tier1-public');a.output.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'pairs':r['pairedValid']['scoredPairs'],'neutral':r['allAttempts']['neutral'],'metric':r['allAttempts']['metric']}))
