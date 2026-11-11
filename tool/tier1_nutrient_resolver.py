"""Conservative offline nutrient candidate; never imported by production inference."""
import copy
import hashlib
import json
import math
import re
import unicodedata

FIELDS=('kcal','proteinG','carbsG','fatG')
SHA=re.compile(r'[a-f0-9]{64}')

def normalize(value):
    if not isinstance(value,str):raise ValueError('Text required')
    decomposed=unicodedata.normalize('NFKD',value.casefold())
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in decomposed if not unicodedata.combining(c)).split())

def normalize_preparation(value):
    text=normalize(value)
    probe=text.replace('hard boiled','hardboiled').replace('pan browned','panbrowned').replace('dry heat','dryheat')
    methods=set(probe.split())&{'boiled','hardboiled','panbrowned','dryheat','roasted','fried','baked','poached','scrambled','steamed','grilled','omelet'}
    return ' '.join(t for t in text.split() if t!='cooked') if len(methods)==1 else text

def _sha(data):return hashlib.sha256(data).hexdigest()
def _canonical(value):return json.dumps(value,sort_keys=True,allow_nan=False,separators=(',',':')).encode()
def _quantity(value,positive=False):
    if type(value) not in (int,float) or not math.isfinite(value) or value<0 or (positive and value<=0):raise ValueError('Finite physical quantity required')
    return value

def _vector(value):
    if not isinstance(value,dict) or set(value)!=set(FIELDS):raise ValueError('Complete nutrient vector required')
    return {k:_quantity(value[k]) for k in FIELDS}

def load_policy(catalog_path,policy_path,expected_policy_sha256=None):
    raw=catalog_path.read_bytes();policy_raw=policy_path.read_bytes();policy_sha=_sha(policy_raw)
    if expected_policy_sha256 is not None and policy_sha!=expected_policy_sha256:raise ValueError('Frozen policy drift')
    catalog=json.loads(raw);p=json.loads(policy_raw)
    if p.get('schemaVersion')!=1 or not isinstance(p.get('id'),str) or not p['id'] or _sha(raw)!=p.get('catalogSha256') or catalog.get('version')!=p.get('catalogVersion'):raise ValueError('Catalog or policy contract drift')
    rows=catalog.get('records');by={}
    if not isinstance(rows,list) or not rows:raise ValueError('Nutrient records required')
    for r in rows:
        if not isinstance(r,dict) or not isinstance(r.get('id'),str) or r['id'] in by:raise ValueError('Unique nutrient record IDs required')
        for key in ('sourceArchiveSha256','sourceRowSha256'):
            if not isinstance(r.get(key),str) or not SHA.fullmatch(r[key]):raise ValueError('Source hash required')
        if not isinstance(r.get('sourceUrl'),str) or not r['sourceUrl'].startswith('https://fdc.nal.usda.gov/food-details/'):raise ValueError('USDA source URL required')
        if not normalize(r['description']) or not normalize_preparation(r['preparation']):raise ValueError('Description and preparation required')
        _vector(r['per100']);_quantity(r['priorG'],True);by[r['id']]=r
    eligible=p.get('eligibleRecordIds')
    if not isinstance(eligible,list) or len(set(eligible))!=len(eligible) or not set(eligible)<=set(by):raise ValueError('Unique eligible single-food record IDs required')
    index={}
    def add(name,identifier):
        key=(normalize(name),normalize_preparation(by[identifier]['preparation']))
        if not key[0] or key in index:raise ValueError('Ambiguous or duplicate name/preparation policy')
        index[key]=identifier
    for identifier in eligible:add(by[identifier]['description'],identifier)
    aliases=p.get('aliases')
    if not isinstance(aliases,list):raise ValueError('Alias policy required')
    for a in aliases:
        if not isinstance(a,dict) or set(a)!={'recordId','names'} or a['recordId'] not in eligible or not isinstance(a['names'],list) or not a['names']:raise ValueError('Invalid alias record')
        for name in a['names']:add(name,a['recordId'])
    value={'catalog':catalog,'policy':p,'catalogSha256':_sha(raw),'policySha256':policy_sha,'index':[{'name':k[0],'preparation':k[1],'recordId':v} for k,v in sorted(index.items())]}
    value['integritySha256']=_sha(_canonical(value));return value

def _validate_estimate(estimate):
    if not isinstance(estimate,dict) or 'nutrientResolution' in estimate:raise ValueError('Unresolved original receipt required')
    parts=estimate.get('components')
    if not isinstance(parts,list) or not 1<=len(parts)<=20:raise ValueError('Original food components required')
    sums={k:0. for k in FIELDS}
    for c in parts:
        if not isinstance(c,dict) or not normalize(c.get('name')) or not isinstance(c.get('preparation'),str):raise ValueError('Named original component required')
        _quantity(c['massG'],True);nutrients=_vector(c['nutrients']);source=c.get('source')
        if not isinstance(source,dict) or source.get('kind') not in ('database_match','unverified_vlm_estimate'):raise ValueError('Explicit source provenance required')
        if source['kind']=='unverified_vlm_estimate':
            if c.get('catalogId') is not None or source.get('recordId') is not None:raise ValueError('Contradictory unverified source')
            per=_vector(c['estimatedPer100'])
            if any(abs(per[k]*c['massG']/100-nutrients[k])>1e-8 for k in FIELDS):raise ValueError('Original per100 arithmetic mismatch')
        elif not isinstance(c.get('catalogId'),str) or source.get('recordId')!=c['catalogId']:raise ValueError('Contradictory database source')
        for k in FIELDS:sums[k]+=nutrients[k]
    total=_vector(estimate['totals'])
    if any(abs(sums[k]-total[k])>1e-8 for k in FIELDS):raise ValueError('Original totals mismatch')

def resolve_estimate(estimate,policy,original_receipt_sha256):
    if not isinstance(original_receipt_sha256,str) or not SHA.fullmatch(original_receipt_sha256):raise ValueError('Original receipt SHA256 required')
    integrity={k:v for k,v in policy.items() if k!='integritySha256'}
    if _sha(_canonical(integrity))!=policy.get('integritySha256'):raise ValueError('Loaded policy mutated')
    _validate_estimate(estimate);out=copy.deepcopy(estimate);by={r['id']:r for r in policy['catalog']['records']};index={(a['name'],a['preparation']):a['recordId'] for a in policy['index']};decisions=[];matched=0
    for i,c in enumerate(out['components']):
        decision={'componentIndex':i,'originalSource':copy.deepcopy(c['source']),'identityVerified':False,'portionVerified':False}
        if c['source']['kind']=='database_match':decision.update(status='existing_database_preserved',reason='Original catalog provenance retained')
        else:
            key=(normalize(c['name']),normalize_preparation(c['preparation']));identifier=index.get(key)
            if identifier is None:decision.update(status='unverified_abstained',reason='No exact approved identity and preparation match')
            else:
                r=by[identifier];matched+=1;c['catalogId']=identifier;c['nutrients']={k:r['per100'][k]*c['massG']/100 for k in FIELDS};c['source']={'kind':'database_match','recordId':identifier,'sourceUrl':r['sourceUrl'],'version':policy['catalog']['version'],'description':r['description'],'sourceArchiveSha256':r['sourceArchiveSha256'],'sourceRowSha256':r['sourceRowSha256'],'identityVerified':False,'portionVerified':False}
                decision.update(status='estimated_identity_catalog_matched',reason='Exact normalized full name and preparation policy',recordId=identifier,computedPer100=copy.deepcopy(r['per100']),originalEstimatedPer100=copy.deepcopy(c['estimatedPer100']))
        decisions.append(decision)
    out['totals']={k:math.fsum(c['nutrients'][k] for c in out['components']) for k in FIELDS};out['requiresReview']=True
    out['nutrientResolution']={'id':policy['policy']['id'],'catalogVersion':policy['catalog']['version'],'catalogSha256':policy['catalogSha256'],'policySha256':policy['policySha256'],'originalReceiptSha256':original_receipt_sha256,'matchedComponents':matched,'decisions':decisions,'identityAndPortionVerified':False,'productionPromotable':False}
    return out
