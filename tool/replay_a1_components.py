"""Zero-inference factorial replay of original A1 nutrient/portion components."""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import zipfile

from tool.tier1_nutrient_resolver import resolve_estimate,load_policy,FIELDS
from tool.mass_power_calibration import mass_factor
from tool.paired_view_metrics import _metrics
SHA=re.compile(r'[0-9a-f]{64}')

def replay_cases(cases,records,policy,mass_profile,mass_profile_sha,receipt_hashes):
    ids=[c['id'] for c in cases]
    if not ids or len(set(ids))!=len(ids) or set(ids)!=set(records) or set(ids)!=set(receipt_hashes):raise ValueError('Exact unique case and receipt membership required')
    if not isinstance(mass_profile_sha,str) or not SHA.fullmatch(mass_profile_sha) or any(not isinstance(v,str) or not SHA.fullmatch(v) for v in receipt_hashes.values()):raise ValueError('Pinned source receipt hashes required')
    names=('A1','Nutrient','Mass','Both');rows={n:[] for n in names};coverage={n:{'databaseComponents':0,'unverifiedComponents':0,'unverifiedEnergyKcal':0.,'estimatedEnergyKcal':0.} for n in names};details=[]
    for case in cases:
        identifier=case['id'];record=records[identifier]
        if record.get('id',identifier)!=identifier:raise ValueError('Source receipt ID mismatch')
        points={n:None for n in names};resolved=None;factor=None;matches=0
        if record.get('A1',{}).get('status')=='ok':
            original=record['estimate']
            if original.get('question') and original['question'].get('answered') is True:raise ValueError('Replay original estimates before preparation answers')
            resolved=resolve_estimate(original,policy,receipt_hashes[identifier]);matches=resolved['nutrientResolution']['matchedComponents']
            def point(estimate):return {**estimate['totals'],'massG':math.fsum(c['massG'] for c in estimate['components'])}
            points['A1']=point(original);points['Nutrient']=point(resolved);factor=mass_factor(points['A1']['massG'],mass_profile)
            if 'predicted' in record['A1']:
                for k in FIELDS:
                    if abs(record['A1']['predicted'][k]-points['A1'][k])>1e-8:raise ValueError('Raw A1 point mismatch')
                if abs(record['A1']['massG']-points['A1']['massG'])>1e-8:raise ValueError('Raw A1 mass mismatch')
            points['Mass']={k:v*factor for k,v in points['A1'].items()};points['Both']={k:v*factor for k,v in points['Nutrient'].items()}
            for name,estimate,scale in [('A1',original,1),('Nutrient',resolved,1),('Mass',original,factor),('Both',resolved,factor)]:
                for c in estimate['components']:
                    unverified=c['source']['kind']=='unverified_vlm_estimate';key='unverifiedComponents' if unverified else 'databaseComponents';coverage[name][key]+=1;energy=c['nutrients']['kcal']*scale;coverage[name]['estimatedEnergyKcal']+=energy
                    if unverified:coverage[name]['unverifiedEnergyKcal']+=energy
        for name in names:rows[name].append({'id':identifier,'reference':case['reference'],'predicted':points[name]})
        details.append({'id':identifier,'reference':copy.deepcopy(case['reference']),'predictions':points,'matchedComponents':matches,'resolvedEstimate':resolved,'massFactor':factor,'originalReceiptSha256':receipt_hashes[identifier]})
    metrics={n:_metrics(rs) for n,rs in rows.items()};base=metrics['A1'];screens={}
    for name in names[1:]:
        candidate=metrics[name];valid=base['scored']==len(cases)==candidate['scored'];a=base['served'];b=candidate['served'];guards={'completeCoverage':valid,'maeGain10PercentAnd10Kcal':valid and a['mae_kcal']>0 and b['mae_kcal']<=.9*a['mae_kcal'] and a['mae_kcal']-b['mae_kcal']>=10}
        for field in ('median_absolute_error_kcal','p90_absolute_error_kcal','mean_normalized_absolute_error'):guards[field+'Nonworse']=valid and b[field]<=a[field]
        if name in ('Nutrient','Both'):guards['fewerUnverifiedDensities']=coverage[name]['unverifiedComponents']<coverage['A1']['unverifiedComponents']
        guards['absoluteBiasNonworse']=valid and abs(b['bias_kcal'])<=abs(a['bias_kcal'])
        for k in ('proteinG','carbsG','fatG'):guards[k+'MaeWithin110Percent']=valid and candidate['amounts'][k]['mae']<=1.1*base['amounts'][k]['mae']
        screens[name]={'guards':guards,'passes':all(guards.values())}
    for v in coverage.values():v['unverifiedEnergyShare']=v['unverifiedEnergyKcal']/v['estimatedEnergyKcal'] if v['estimatedEnergyKcal'] else None
    return {'routes':metrics,'sourceCoverage':coverage,'screens':screens,'cases':details,'newSdkInvocations':0,'newLocalForwards':0,'massProfileSha256':mass_profile_sha,'productionPromotable':False,'scope':'Retrospective development replay; historical calibration promotion failures retained; no refit'}

def validate_bindings(bindings,protocol):
    cohorts=bindings.get('cohorts');expected=protocol.get('cohortIds')
    if not isinstance(cohorts,list) or not isinstance(expected,list) or not cohorts:raise ValueError('Frozen cohorts required')
    ids=[c.get('id') for c in cohorts]
    if any(not isinstance(i,str) for i in ids) or len(set(ids))!=len(ids) or set(ids)!=set(expected):raise ValueError('Exact unique frozen cohort membership required')


def digest(data):return hashlib.sha256(data).hexdigest()
def pinned(path,expected):
    raw=path.read_bytes()
    if digest(raw)!=expected:raise ValueError('Frozen input/source drift')
    return raw

def run(repo,protocol_path,binding_path,output):
    git=lambda *args:subprocess.check_output(['git',*args],cwd=repo,text=True).strip()
    if git('status','--porcelain') or git('rev-parse','HEAD')!=git('rev-parse','@{upstream}'):raise ValueError('Commit and push clean source before replay')
    relative=protocol_path.relative_to(repo);raw=protocol_path.read_bytes()
    if subprocess.check_output(['git','show','HEAD:'+str(relative)],cwd=repo)!=raw:raise ValueError('Committed protocol required')
    protocol=json.loads(raw);bindings=json.loads(pinned(binding_path,protocol['bindingSha256']))
    validate_bindings(bindings,protocol)
    for item in protocol['sourceFiles']:
        path=Path(item['path'])
        if path.is_absolute() or '..' in path.parts:raise ValueError('Unsafe source pin')
        pinned(repo/path,item['sha256'])
        if subprocess.check_output(['git','show','HEAD:'+str(path)],cwd=repo)!=(repo/path).read_bytes():raise ValueError('Git-visible source required')
    catalog=repo/protocol['catalogPath'];policy_path=repo/protocol['policyPath'];policy=load_policy(catalog,policy_path,protocol['policySha256']);profile_path=repo/protocol['massProfilePath'];profile_raw=pinned(profile_path,protocol['massProfileSha256']);profile=json.loads(profile_raw)
    if output.exists():raise ValueError('Fresh private output required')
    results={}
    for b in bindings['cohorts']:
        manifest=json.loads(pinned(Path(b['manifestPath']),b['manifestSha256']));cases=manifest['cases']
        if len(cases)!=20:raise ValueError('Frozen20 cohort required')
        if b['kind']=='zip':
            archive_raw=pinned(Path(b['archivePath']),b['archiveSha256']);del archive_raw
            with zipfile.ZipFile(b['archivePath']) as z:source={c['id']:z.read('a1/'+c['id']+'.json') for c in cases}
        elif b['kind']=='directory':source={c['id']:pinned(Path(b['receiptsDir'])/(c['id']+'.json'),b['receiptSha256'][c['id']]) for c in cases}
        else:raise ValueError('Unknown source kind')
        records={identifier:json.loads(raw) for identifier,raw in source.items()};hashes={identifier:digest(raw) for identifier,raw in source.items()}
        results[b['id']]=replay_cases(cases,records,policy,profile,protocol['massProfileSha256'],hashes)
    result={'sourceCommit':git('rev-parse','HEAD'),'protocolSha256':digest(protocol_path.read_bytes()),'bindingSha256':protocol['bindingSha256'],'cohorts':results,'newSdkInvocations':0,'newLocalForwards':0,'productionPromotable':False}
    with output.open('x') as f:json.dump(result,f,indent=2,allow_nan=False);f.write('\n')
    print(json.dumps({'cohorts':{k:len(v['cases']) for k,v in results.items()},'newModelCalls':0}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('repo','protocol','binding','output'):p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();run(a.repo.resolve(),a.protocol.resolve(),a.binding.resolve(),a.output.resolve())
