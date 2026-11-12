"""Research-only author-box/known-coin mass proxies; not automatic food measurement."""
import math
import hashlib
import re
import statistics
import xml.etree.ElementTree as ET
from tool.reference_scale import metrics

CLASSES=('bread','bun','doughnut','fired_dough_twist','mooncake','sachima')
FEATURES=('pixelArea','areaProxyMm2','coinAspectRatio')
ROUTES=('classPrior','pixelArea','coinArea','coinSimilarity')

def positive(value):
    if type(value) not in (int,float) or not math.isfinite(value) or value<=0:raise ValueError('Positive finite number required')
    return value

def _portion(identifier,source_class):
    if source_class not in CLASSES or not isinstance(identifier,str) or not re.fullmatch(re.escape(source_class)+r'[0-9]{3}',identifier):raise ValueError('Canonical source portion ID/class required')

def _features(value):
    if not isinstance(value,dict):raise ValueError('Explicit measured box features required')
    return {k:positive(value.get(k)) for k in FEATURES}

def parse_boxes(xml_bytes,expected_filename,expected_class):
    if not isinstance(xml_bytes,bytes) or not 0<len(xml_bytes)<=65536:raise ValueError('Bounded XML bytes required')
    if expected_class not in CLASSES or not isinstance(expected_filename,str) or not re.fullmatch(re.escape(expected_class)+r'[0-9]{3}T\([0-9]+\)\.JPG',expected_filename):raise ValueError('Exact native class/top-view filename required')
    try:root=ET.fromstring(xml_bytes)
    except ET.ParseError as e:raise ValueError('Malformed source XML') from e
    if root.tag!='annotation' or root.findtext('filename')!=expected_filename:raise ValueError('Source filename mismatch')
    def dimension(tag):
        text=root.findtext('size/'+tag)
        if not isinstance(text,str) or not re.fullmatch(r'[0-9]+',text) or not 0<int(text)<=8192:raise ValueError('Positive bounded source dimensions required')
        return int(text)
    width=dimension('width');height=dimension('height');objects=root.findall('object')
    if len(objects)!=2 or sorted(o.findtext('name') or '' for o in objects)!=sorted([expected_class,'coin']):raise ValueError('Exactly one expected food and one coin required')
    boxes={}
    for obj in objects:
        if obj.findtext('truncated','0')!='0' or obj.findtext('difficult','0')!='0':raise ValueError('Truncated/difficult source object cannot supply complete box')
        try:box={k:float(obj.findtext('bndbox/'+k)) for k in ('xmin','ymin','xmax','ymax')}
        except (TypeError,ValueError) as e:raise ValueError('Complete numeric coordinates required') from e
        if not all(math.isfinite(v) for v in box.values()) or not (0<=box['xmin']<box['xmax']<=width and 0<=box['ymin']<box['ymax']<=height):raise ValueError('Strict in-frame positive box spans required; no clamping')
        boxes[obj.findtext('name')]=box
    def spans(box):return box['xmax']-box['xmin'],box['ymax']-box['ymin']
    fw,fh=spans(boxes[expected_class]);cw,ch=spans(boxes['coin']);pixel=positive(fw*fh);coin_area=positive(cw*ch);area=positive(pixel/coin_area*625)
    return {'pixelArea':pixel,'areaProxyMm2':area,'coinAspectRatio':cw/ch,'width':width,'height':height,'boxes':boxes,'oracle':True,'coordinateConvention':'Published xmax-xmin and ymax-ymin; no inclusive-pixel adjustment; area proxy only'}

def fit_priors(train_rows,forbidden_ids,minimum=3):
    if type(minimum) is not int or minimum<1 or not isinstance(train_rows,list) or not train_rows:raise ValueError('Nonempty fitting groups and positive integer minimum required')
    if not isinstance(forbidden_ids,(list,tuple,set)) or not forbidden_ids or any(not isinstance(i,str) for i in forbidden_ids):raise ValueError('Explicit forbidden comparison IDs required')
    forbidden=set(forbidden_ids);seen=set();groups={}
    for row in train_rows:
        identifier=row['id'];cl=row['sourceClass'];_portion(identifier,cl)
        if identifier in seen or identifier in forbidden:raise ValueError('Duplicate or comparison portion leaked into fitting')
        seen.add(identifier);grams=positive(row['referenceMassG']);f=_features(row['features']);groups.setdefault(cl,[]).append((grams,f))
    priors={}
    for cl,rows in groups.items():
        if len(rows)<minimum:raise ValueError('Insufficient fitting portion groups for '+cl)
        priors[cl]={'groups':len(rows),'classPrior':statistics.median(g for g,_ in rows),'pixelCoefficient':statistics.median(g/f['pixelArea'] for g,f in rows),'coinCoefficient':statistics.median(g/f['areaProxyMm2'] for g,f in rows),'similarityCoefficient':statistics.median(g/(f['areaProxyMm2']**1.5) for g,f in rows)}
        for key in ('classPrior','pixelCoefficient','coinCoefficient','similarityCoefficient'):positive(priors[cl][key])
    return {'schemaVersion':1,'classes':priors,'trainingIds':sorted(seen),'forbiddenIds':sorted(forbidden),'minimumGroups':minimum,'coinDiameterMm':25,'oracleInputs':True,'fit':'Class median and median ratios; exponents fixed1/1.5; no comparison fitting'}

def predict_features(source_class,features,priors):
    if source_class not in priors['classes']:raise ValueError('No fitted prior for source class')
    p=priors['classes'][source_class];f=_features(features)
    values={'classPrior':p['classPrior'],'pixelArea':p['pixelCoefficient']*f['pixelArea'],'coinArea':p['coinCoefficient']*f['areaProxyMm2'],'coinSimilarity':p['similarityCoefficient']*(f['areaProxyMm2']**1.5)}
    return {k:positive(v) for k,v in values.items()}

def evaluate_boxes(cases,priors,baseline):
    if not isinstance(cases,list) or not cases:raise ValueError('Comparison cases required')
    ids=[c['id'] for c in cases]
    if len(set(ids))!=len(ids) or set(ids)!=set(baseline) or set(ids)&set(priors['trainingIds']) or not set(ids)<=set(priors['forbiddenIds']):raise ValueError('Exact disjoint comparison/baseline membership required')
    rows={name:[] for name in ('A1',*ROUTES)};details=[]
    for c in cases:
        _portion(c['id'],c['sourceClass']);reference=positive(c['referenceMassG'])
        if c['sourceClass'] not in priors['classes']:raise ValueError('No fitted class for comparison')
        points={'A1':positive(baseline[c['id']]) if baseline[c['id']] is not None else None,'classPrior':positive(priors['classes'][c['sourceClass']]['classPrior']),'pixelArea':None,'coinArea':None,'coinSimilarity':None}
        if c.get('features') is not None:points.update(predict_features(c['sourceClass'],c['features'],priors))
        for name in rows:rows[name].append((reference,points[name]))
        details.append({'id':c['id'],'sourceClass':c['sourceClass'],'referenceMassG':reference,'predictions':points,'sourceFailure':c.get('sourceFailure'),'coinAspectRatio':c['features']['coinAspectRatio'] if c.get('features') else None})
    results={name:metrics(values) for name,values in rows.items()};screens={}
    for name in ('pixelArea','coinArea','coinSimilarity'):
        value=results[name];guards={}
        for comparator in ('A1','classPrior'):
            base=results[comparator];valid=value['scored']==base['scored']==len(cases);guards[comparator+'CompleteCoverage']=valid;guards[comparator+'Mae10PercentBetter']=valid and base['maeG']>0 and value['maeG']<=.9*base['maeG']
            for field in ('medianAbsoluteErrorG','p90AbsoluteErrorG'):guards[comparator+field+'Nonworse']=valid and value[field]<=base[field]
            guards[comparator+'AbsoluteBiasNonworse']=valid and abs(value['biasG'])<=abs(base['biasG'])
        screens[name]={'guards':guards,'passes':all(guards.values())}
    return {'routes':results,'cases':details,'screens':screens,'calorieReference':None,'oracleInputs':True,'productionPromotable':False,'representativeAccuracy':False,'newModelCalls':0,'interpretation':'Six already-observed portions: descriptive mass diagnostic, author class/boxes only; no automatic recognition, true area/volume, calorie, independent-instance or Android claim'}


def select_training_views(weight_rows,published_paths,comparison_ids,seed):
    if not isinstance(seed,str) or not seed or not isinstance(weight_rows,list) or not weight_rows or not isinstance(published_paths,list) or any(not isinstance(p,str) for p in published_paths) or len(set(published_paths))!=len(published_paths):raise ValueError('Unique published paths, weights and fixed seed required')
    if not isinstance(comparison_ids,(set,list,tuple)) or not comparison_ids or any(not isinstance(i,str) for i in comparison_ids):raise ValueError('Comparison portion exclusions required')
    by={}
    for row in weight_rows:
        _portion(row['id'],row['sourceClass']);positive(row['referenceMassG'])
        if row['id'] in by:raise ValueError('Duplicate source portion weight')
        by[row['id']]=row
    if not set(comparison_ids)<=set(by):raise ValueError('Comparison weights missing from source')
    published=set(published_paths);result=[]
    for identifier in sorted(set(by)-set(comparison_ids)):
        r=by[identifier];pattern=re.compile('Annotations/'+re.escape(identifier)+r'T\([0-9]+\)\.xml')
        candidates=[p for p in published_paths if pattern.fullmatch(p) and 'JPEGImages/'+p.removeprefix('Annotations/').removesuffix('.xml')+'.JPG' in published]
        if not candidates:raise ValueError('Chosen portion lacks a complete top-view pair')
        path=min(candidates,key=lambda v:(hashlib.sha256((seed+'|'+v).encode()).hexdigest(),v));filename=path.removeprefix('Annotations/').removesuffix('.xml')+'.JPG'
        result.append({'id':identifier,'sourceClass':r['sourceClass'],'referenceMassG':r['referenceMassG'],'filename':filename,'annotationObject':path,'imageObject':'JPEGImages/'+filename})
    return result
