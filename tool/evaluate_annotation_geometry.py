"""Offline mass-only annotation geometry comparison; no SDK calls."""
import argparse,hashlib,json,statistics
from pathlib import Path
from tool.annotation_geometry import summarize_geometry

def read(path,sha=None):
 raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest()
 if sha and digest!=sha:raise ValueError('Pinned receipt drift')
 return json.loads(raw),digest

def evaluate(root,base):
 receipt,rsha=read(root/'experiment.json');manifest,msha=read(base/'manifest-reference-scale-v1.json',receipt['manifestSha256']);protocol,psha=read(base/'annotation-geometry-protocol-v1.json',receipt['protocolSha256'])
 if receipt['status']!='completed' or receipt['unknownInFlight'] or receipt['completedSdkEntries']!=13 or receipt['maxSdkEntries']!=13 or len(receipt['outcomes'])!=12:raise ValueError('Complete bounded13 study required')
 if any(receipt[k]!=protocol[k] for k in ('order','model','engineCommit','schemaSha256','geometryPreparationSha256')):raise ValueError('Protocol drift')
 if [(o['id'],o['arm']) for o in receipt['outcomes']]!=[(c['id'],a) for c in protocol['order'] for a in c['arms']]:raise ValueError('Ledger order drift')
 probe,_=read(root/'probe.json');raw,_=read(root/'probe-response.json')
 if probe!={'sdkInvocations':1,'successfulCompatibility':True,'returnedModel':receipt['model']} or json.loads(raw['text']).get('components')!=[] or raw['inputSha256']!=protocol['probeImageSha256'] or raw['returnedModel']!=receipt['model'] or raw['promptText']!=protocol['probePrompt'] or raw['promptSha256']!=protocol['probePromptSha256']:raise ValueError('Probe drift')
 rows={};pins=[];latency={a:[] for a in ('control','geometry')};usage={a:[] for a in latency}
 if [c['id'] for c in protocol['cases']]!=[c['id'] for c in manifest['cases']]:raise ValueError('Protocol case drift')
 for case,config in zip(manifest['cases'],protocol['cases']):
  rows[case['id']]={}
  for arm in latency:
   record,digest=read(root/case['id']/arm/'record.json');raw,rhash=read(root/case['id']/arm/'sdk-response.json');expected=protocol['controlPrompt'] if arm=='control' else config['geometryPrompt'];expectedSha=hashlib.sha256(expected.encode()).hexdigest()
   if expectedSha!=config['promptSha256'][arm] or raw['promptText']!=expected or raw['promptSha256']!=expectedSha or raw['inputSha256']!=case['imageSha256'] or raw['requestedModel']!=receipt['model'] or raw['returnedModel']!=receipt['model']:raise ValueError('Actual model/photo/prompt drift')
   if record['id']!=case['id'] or record['arm']!=arm or record['sdkInvocations']!=1 or record['referenceMassG']!=case['referenceMassG'] or record['calorieReference'] is not None or record['volumeReferenceUsed'] is not False:raise ValueError('Record drift')
   outcome=next(o for o in receipt['outcomes'] if o['id']==case['id'] and o['arm']==arm)
   if any(outcome[k]!=record[k] for k in ('sdkInvocations','status','failure')):raise ValueError('Outcome drift')
   if record['status']=='ok':
    estimate=record['estimate'];provenance=estimate['provenance'];mass=sum(v['massG'] for v in estimate['components'])
    if abs(mass-record['massG'])>1e-9 or provenance['model']!=receipt['model'] or provenance['returnedModel']!=receipt['model'] or provenance['promptSha256']!=expectedSha:raise ValueError('Decoded mass/provenance drift')
   elif record['estimate'] is not None:raise ValueError('Failed estimate must be null')
   rows[case['id']][arm]=record;pins.append({'id':case['id'],'arm':arm,'recordSha256':digest,'sdkResponseSha256':rhash});latency[arm].append(raw['latencyMs']);usage[arm].append(raw['usageMetadata'])
 result=summarize_geometry(manifest['cases'],rows);tokens={}
 for arm,values in usage.items():
  tokens[arm]={}
  for key in ('promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'):
   known=[v[key] for v in values if isinstance(v,dict) and type(v.get(key)) in (int,float)];tokens[arm][key]={'knownSum':sum(known) if known else None,'recordsKnown':len(known),'recordsAttempted':len(values)}
 result.update(schemaVersion='annotation-geometry-result-1',sourceCommit=receipt['sourceCommit'],engineCommit=receipt['engineCommit'],model=receipt['model'],schemaSha256=receipt['schemaSha256'],manifestSha256=msha,protocolSha256=psha,experimentReceiptSha256=rsha,geometryPreparationSha256=receipt['geometryPreparationSha256'],sdkEntries=13,newFoodPredictionEntries=12,newReferenceMeals=0,androidWeighedMeals=0,receiptPins=pins,modelLatencyMs={a:{'median':statistics.median(v),'max':max(v),'records':len(v)} for a,v in latency.items()},tokenUsage=tokens,costUsd=None)
 return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--experiment',type=Path,required=True);p.add_argument('--repo',type=Path,default=Path.cwd());p.add_argument('--output',type=Path,required=True);a=p.parse_args();r=evaluate(a.experiment,a.repo/'functions/eval/tier1-public');a.output.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'pairs':r['pairedValid']['scoredPairs'],'control':r['allAttempts']['control'],'geometry':r['allAttempts']['geometry'],'gate':r['considerationGate']}))
