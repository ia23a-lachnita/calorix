"""Development-only serving priors using predicted names, never author labels at routing."""
import copy,hashlib,json,math,re,statistics
from tool.tier1_nutrient_resolver import normalize,_validate_estimate
from tool.open_model_adapters import fuse_mass
from tool.reference_scale import metrics
CLASSES=('bread','bun','doughnut','fired_dough_twist','mooncake','sachima')

def positive(v):
    if type(v) not in (int,float) or not math.isfinite(v) or v<=0:raise ValueError('Positive finite mass required')
    return v

def validate_row(r):
    if not isinstance(r,dict) or r.get('sourceClass') not in CLASSES or not isinstance(r.get('id'),str) or not re.fullmatch(re.escape(r['sourceClass'])+r'[0-9]{3}',r['id']):raise ValueError('Canonical portion ID/class required')
    positive(r['referenceMassG'])

def select_stress_split(rows,quotas,seed):
    if not isinstance(rows,list) or not rows or not isinstance(quotas,dict) or not quotas or not isinstance(seed,str) or not seed:raise ValueError('Rows, quotas and fixed seed required')
    for r in rows:validate_row(r)
    if len({r['id'] for r in rows})!=len(rows) or set(quotas)!={r['sourceClass'] for r in rows}:raise ValueError('Exact unique class membership required')
    rank=lambda role,r:(hashlib.sha256((seed+'|'+role+'|'+r['id']).encode()).hexdigest(),r['id']);fit=[];cases=[]
    for cl,n in quotas.items():
        pool=[r for r in rows if r['sourceClass']==cl]
        if type(n) is not int or n<2 or len(pool)-n<3:raise ValueError('Need two extremes and three fitting groups per class')
        low=min(pool,key=lambda r:(r['referenceMassG'],*rank('tie',r)));high=min((r for r in pool if r['id']!=low['id']),key=lambda r:(-r['referenceMassG'],*rank('tie',r)))
        middle=sorted((r for r in pool if r['id'] not in (low['id'],high['id'])),key=lambda r:rank('middle',r))[:n-2]
        chosen=[dict(copy.deepcopy(low),stressRole='min'),dict(copy.deepcopy(high),stressRole='max')]+[dict(copy.deepcopy(r),stressRole='middle') for r in middle];selected={r['id'] for r in chosen};cases+=chosen;fit+=[copy.deepcopy(r) for r in pool if r['id'] not in selected]
    return {'fit':sorted(fit,key=lambda r:r['id']),'cases':sorted(cases,key=lambda r:rank('evaluation',r))}

def fit_serving_priors(fit_rows,excluded_ids):
    if not isinstance(fit_rows,list) or not fit_rows or not isinstance(excluded_ids,(set,list,tuple)) or not excluded_ids:raise ValueError('Fitting rows and excluded evaluation IDs required')
    groups={};seen=set()
    for r in fit_rows:
        validate_row(r)
        if r['id'] in seen or r['id'] in excluded_ids:raise ValueError('Duplicate or evaluation group leaked into fitting')
        seen.add(r['id']);groups.setdefault(r['sourceClass'],[]).append(r['referenceMassG'])
    if any(len(v)<3 for v in groups.values()):raise ValueError('At least three fitting groups per class required')
    return {'schemaVersion':1,'id':'predicted-portion-prior-v1','classes':{cl:{'medianMassG':statistics.median(v),'fitGroups':len(v)} for cl,v in groups.items()},'fitIds':sorted(seen),'excludedIds':sorted(excluded_ids)}

def load_alias_policy(path,expected_sha=None):
    raw=path.read_bytes();sha=hashlib.sha256(raw).hexdigest()
    if expected_sha is not None and sha!=expected_sha:raise ValueError('Frozen alias policy drift')
    p=json.loads(raw)
    if p.get('schemaVersion')!=1 or not isinstance(p.get('id'),str) or not isinstance(p.get('classes'),dict) or not p['classes']:raise ValueError('Versioned alias policy required')
    aliases={}
    for cl,names in p['classes'].items():
        if cl not in CLASSES or not isinstance(names,list) or not names:raise ValueError('Known class aliases required')
        for name in names:
            key=normalize(name)
            if not key or key in aliases:raise ValueError('Ambiguous or duplicate normalized alias')
            aliases[key]=cl
    return {'id':p['id'],'sha256':sha,'aliases':aliases}

def route_prior(estimate,priors,policy):
    # Deliberately accepts a classes-only mapping, never fit/evaluation ID metadata.
    if not isinstance(priors,dict) or any(k not in CLASSES for k in priors):raise ValueError('Classes-only prior mapping required; do not pass fitting/evaluation metadata')
    _validate_estimate(estimate)
    if 'portionPrior' in estimate or (estimate.get('question') and estimate['question'].get('answered') is True):raise ValueError('Original pre-correction/pre-answer estimate required')
    original=copy.deepcopy(estimate);parts=original['components']
    def fallback(reason):return {'status':'fallback','reason':reason,'predictedClass':None,'estimate':original}
    if len(parts)!=1:return fallback('multiple_components')
    cl=policy['aliases'].get(normalize(parts[0]['name']))
    if cl is None:return fallback('unmapped_full_name')
    if set(normalize(parts[0].get('preparation','')).split())&{'raw','uncooked','unbaked'}:return fallback('incompatible_preparation')
    if cl not in priors:raise ValueError('Matched class missing fitting prior')
    target=positive(priors[cl]['medianMassG']);fused=fuse_mass(original,target,{'kind':'empirical_typical_serving_prior','class':cl,'policySha256':policy['sha256']})
    out={**original,'components':fused['components'],'totals':fused['totals'],'requiresReview':True,'portionPrior':{'id':policy['id'],'policySha256':policy['sha256'],'predictedClass':cl,'fitGroups':priors[cl]['fitGroups'],'priorMassG':target,'originalMassG':math.fsum(c['massG'] for c in parts),'observedPieceCount':None,'measuredMass':False,'assumption':'Generic typical-serving prior, not observed piece count; original identity and nutrient densities retained'}}
    return {'status':'applied','reason':'exact_predicted_full_name','predictedClass':cl,'estimate':out}

def mass_metrics(rows):
    m=metrics(rows);valid=[(r,p) for r,p in rows if p is not None];m['meanNormalizedAbsoluteError']=math.fsum(abs(p-r)/max(r,50) for r,p in valid)/len(valid) if valid else None;return m

def score_priors(cases,records,priors,policy):
    ids=[c['id'] for c in cases]
    if not ids or len(set(ids))!=len(ids) or set(ids)!=set(records) or set(ids)&set(priors['fitIds']) or not set(ids)<=set(priors['excludedIds']):raise ValueError('Exact disjoint fitting/evaluation/receipt membership required')
    rows={n:[] for n in ('A1','Operational','MatchedOnly','OracleClassPrior')};details=[];counts={'applied':0,'fallback':0,'failed':0};matched=[]
    for c in cases:
        validate_row(c)
        if c.get('stressRole') not in ('min','middle','max'):raise ValueError('Frozen stress role required')
        r=records[c['id']];a=r.get('A1',{});status=a.get('status')
        if status!='ok' and not(status=='failed' and a.get('failure') in ('no_food','invalid_model_output','dataset_input_failure')):raise ValueError('Incomplete/systemic outcome cannot be scored as completed study')
        points={'A1':None,'Operational':None,'MatchedOnly':None,'OracleClassPrior':positive(priors['classes'][c['sourceClass']]['medianMassG'])};decision={'status':'failed','reason':a.get('failure'),'predictedClass':None};candidate=None
        if status=='ok':
            e=r['estimate'];decision=route_prior(e,priors['classes'],policy);candidate=decision['estimate'];points['A1']=math.fsum(p['massG'] for p in e['components']);points['Operational']=math.fsum(p['massG'] for p in candidate['components'])
            if a.get('massG') is not None and abs(a['massG']-points['A1'])>1e-8:raise ValueError('Original receipt mass mismatch')
            if decision['status']=='applied':points['MatchedOnly']=points['Operational'];matched.append((c['referenceMassG'],points['A1'],points['Operational']))
        counts[decision['status']]+=1
        for name,pred in points.items():rows[name].append((c['referenceMassG'],pred))
        details.append({'id':c['id'],'sourceClass':c['sourceClass'],'referenceMassG':c['referenceMassG'],'stressRole':c['stressRole'],'predictions':points,'decision':{k:v for k,v in decision.items() if k!='estimate'},'candidateEstimate':candidate,'mappedClassAgreesWithAuthor':decision['predictedClass']==c['sourceClass'] if decision['status']=='applied' else None})
    result={name:mass_metrics(rs) for name,rs in rows.items()};strata={role:{name:mass_metrics([(d['referenceMassG'],d['predictions'][name]) for d in details if d['stressRole']==role]) for name in rows} for role in ('min','middle','max')};base=result['A1'];oper=result['Operational'];valid=base['scored']==oper['scored']==len(cases);guards={'completeCoverage':valid,'maeGain10Percent':valid and base['maeG']>0 and oper['maeG']<=.9*base['maeG']}
    for key in ('medianAbsoluteErrorG','p90AbsoluteErrorG','meanNormalizedAbsoluteError'):guards[key+'Nonworse']=valid and oper[key]<=base[key]
    guards['absoluteBiasNonworse']=valid and abs(oper['biasG'])<=abs(base['biasG'])
    for role,values in strata.items():guards[role+'MaeNonworse']=valid and values['A1']['scored']>0 and values['Operational']['maeG']<=values['A1']['maeG']
    return {'routes':result,'cases':details,'routing':{**counts,'routingCoverage':counts['applied']/len(cases)},'matchedPairs':{'count':len(matched),'A1':mass_metrics([(a,b) for a,b,_ in matched]),'Prior':mass_metrics([(a,p) for a,_,p in matched])},'strata':strata,'screen':{'guards':guards,'passes':all(guards.values())},'calorieReference':None,'productionPromotable':False,'newModelCallsForRouting':0,'scope':'Known-source development stress; operator uses predicted names only, author-class oracle separate; no claim of observed piece count or general portion accuracy'}
