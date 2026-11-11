"""Strict public-transfer adapters; no source labels may enter inference."""
import copy
import csv
import hashlib
import io
import math
from pathlib import Path, PurePosixPath
import re

NV_FIELDS={'kcal':'total_calories','massG':'total_food_weight','fatG':'total_fats',
           'carbsG':'total_carbohydrates','proteinG':'total_protein'}


def _integer(value):
    if type(value) not in (str,int) or not re.fullmatch(r'[0-9]+',str(value)):
        raise ValueError('Nonnegative integer dish ID required')
    return str(int(value))


def _case_id(value):
    if not isinstance(value,str) or not re.fullmatch(r'nv-dish-(0|[1-9][0-9]*)',value):
        raise ValueError('Canonical transfer case ID required')
    return value.removeprefix('nv-dish-')


def _number(value,positive=False):
    if type(value) not in (str,int,float):raise ValueError('Finite number required')
    try:n=float(value)
    except (ValueError,TypeError,OverflowError) as error:raise ValueError('Invalid source quantity') from error
    if not math.isfinite(n) or n<0 or (positive and n<=0):raise ValueError('Invalid source quantity')
    return n


def _path(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_./-]+',value):
        raise ValueError('Unsafe source path')
    p=PurePosixPath(value)
    if p.is_absolute() or '..' in p.parts or str(p)!=value:
        raise ValueError('Unsafe source path')
    return p


def _view_dish(filename):
    p=_path(filename)
    match=re.fullmatch(r'dish_([0-9]+)_[A-Za-z0-9_.-]+\.(?i:jpg|jpeg)',p.name)
    if not match:raise ValueError('Unexpected published view name')
    return _integer(match[1])


def parse_nv_csv(text):
    if not isinstance(text,str):raise ValueError('CSV text required')
    reader=csv.DictReader(io.StringIO(text),strict=True)
    headers=reader.fieldnames or []
    if len(headers)!=len(set(headers)) or not {'dish_id',*NV_FIELDS.values()}<=set(headers):
        raise ValueError('Explicit NutritionVerse source columns required')
    result=[];seen=set()
    try:
        for row in reader:
            if None in row:raise ValueError('Malformed CSV row width')
            dish=_integer(row['dish_id'])
            if dish in seen:raise ValueError('Duplicate physical dish metadata')
            seen.add(dish)
            ref={key:_number(row[column],key in ('kcal','massG')) for key,column in NV_FIELDS.items()}
            result.append({'id':'nv-dish-'+dish,'physicalMealId':'nutritionverse-real/dish/'+dish,
                           'reference':ref})
    except csv.Error as error:raise ValueError('Malformed CSV') from error
    if not result:raise ValueError('No reference dishes')
    return result

def associate_images(metadata, split_rows, files):
    by={}
    for row in metadata:
        dish=_case_id(row['id'])
        if dish in by:raise ValueError('Duplicate physical metadata')
        by[dish]=row
    published={};paths=set()
    for file in files:
        path=_path(file['name'])
        if str(path) in paths:raise ValueError('Duplicate published file')
        paths.add(str(path))
        if path.suffix.lower() not in ('.jpg','.jpeg'):continue
        if path.name in published:raise ValueError('Ambiguous published basename')
        published[path.name]=str(path)
    images={dish:[] for dish in by};seen=set()
    for split in split_rows:
        filename=split['file_name'];path=_path(filename)
        if path.name!=filename or filename in seen:raise ValueError('Duplicate or unsafe split view')
        seen.add(filename);dish=_view_dish(filename)
        if filename not in published or dish not in by:
            raise ValueError('View missing from published files or dish references')
        if 'dish_id' in split and _integer(split['dish_id'])!=dish:
            raise ValueError('Split dish identity mismatch')
        images[dish].append(published[filename])
    result=[]
    for dish in sorted(by):
        if images[dish]:result.append({**copy.deepcopy(by[dish]),'images':sorted(images[dish])})
    return result

def select_transfer_cases(dishes, seed, count=20):
    if type(count) is not int or not 1<=count<=20 or count>len(dishes):
        raise ValueError('Need 1..20 available distinct dishes')
    if not isinstance(seed,str) or not seed or len(seed)>128:raise ValueError('Fixed bounded seed required')
    seen=set()
    for row in dishes:
        dish=_case_id(row['id']);images=row['images']
        if dish in seen or row['physicalMealId']!='nutritionverse-real/dish/'+dish:
            raise ValueError('Duplicate or inconsistent physical dish identity')
        seen.add(dish)
        if not isinstance(images,list) or not images or len(images)!=len(set(images)):
            raise ValueError('Unique available views required')
        if any(_view_dish(name)!=dish for name in images):raise ValueError('Foreign view in physical dish')
    def rank(kind,value):return (hashlib.sha256((seed+'|'+kind+'|'+value).encode()).hexdigest(),value)
    rows=sorted(dishes,key=lambda r:rank('dish',_case_id(r['id'])))[:count]
    return [{**copy.deepcopy(r),'sourceImagePath':min(r['images'],key=lambda f:rank('view',f))} for r in rows]

def image_inputs(cases, assets_root):
    root=Path(assets_root).resolve();out=[];seen=set()
    for c in cases:
        _case_id(c['id'])
        if c['id'] in seen:raise ValueError('Duplicate inference case')
        seen.add(c['id']);relative=_path(c['inputPath'])
        path=(root/str(relative)).resolve()
        if not path.is_relative_to(root) or not path.is_file():raise ValueError('Missing or escaped image')
        expected=c['inputSha256']
        if not isinstance(expected,str) or not re.fullmatch(r'[a-f0-9]{64}',expected):raise ValueError('Image hash required')
        with path.open('rb') as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
        if actual!=expected:raise ValueError('Frozen image hash mismatch')
        out.append({'id':c['id'],'inputFile':str(path),'inputSha256':expected})
    return out


def score_transfer(cases, a1_records, lens_records):
    from tool.calorie_lens_routes import route_specialist, vector
    from tool.open_model_adapters import fuse_mass
    from tool.paired_view_metrics import _metrics
    ids={c['id'] for c in cases};physical={c['physicalMealId'] for c in cases}
    if len(ids)!=len(cases) or len(physical)!=len(cases) or (set(a1_records)|set(lens_records))-ids:
        raise ValueError('Exact unique physical meal membership required')
    names=('A0','A1','LensFull','A1LensMass','LensMassCounterfactual','OldServingGate')
    rows={name:[] for name in names};details=[];counts={'Applied':0,'A1Fallback':0,'Failed':0}
    for c in cases:
        dish=_case_id(c['id'])
        if c['physicalMealId']!='nutritionverse-real/dish/'+dish:raise ValueError('Physical ID mismatch')
        record=a1_records.get(c['id'],{});s=lens_records.get(c['id'],{})
        a=record.get('estimate') if record.get('A1',{}).get('status')=='ok' else None
        base=route_specialist(a,None);old=route_specialist(a,s);fused=base;mass_status='Failed'
        if base['status']=='ok':
            mass_status='A1Fallback'
            try:
                if s.get('status')!='ok':raise ValueError('Specialist failed')
                v=vector(s)
                fused={**fuse_mass(a,v['massG'],{'kind':'pinned_calorie_lens_mass'}),'status':'ok'}
                vector(fused)
                mass_status='Applied'
            except (KeyError,TypeError,ValueError,AttributeError,OverflowError):pass
        counts[mass_status]+=1
        a0=record.get('A0',{})
        predictions={'A0':dict(status=a0.get('status'),massG=a0.get('massG'),totals=a0.get('predicted')),
                     'A1':base,'LensFull':s,'A1LensMass':fused,
                     'LensMassCounterfactual':fused if mass_status=='Applied' else {'status':'failed'},'OldServingGate':old}
        points={}
        for name,p in predictions.items():
            try:
                if p.get('status')!='ok':raise ValueError('Failed arm')
                v=vector(p);point=dict(v['totals'],massG=v['massG'])
            except (KeyError,TypeError,ValueError,AttributeError):point=None
            points[name]=point;rows[name].append(dict(id=c['id'],reference=c['reference'],predicted=point))
        details.append(dict(id=c['id'],physicalMealId=c['physicalMealId'],reference=c['reference'],
                            predictions=points,massArmStatus=mass_status,massArm=fused if mass_status=='Applied' else None,
                            oldSelectedSource=old['selectedSource']))
    metrics={name:{**_metrics(rs),'attempted':len(cases)} for name,rs in rows.items()}
    screens={};base=metrics['A1']
    for name in ('LensFull','A1LensMass','LensMassCounterfactual','OldServingGate'):
        candidate=metrics[name];valid=len(cases)==20 and base['scored']==20 and candidate['scored']==20
        guards={'all20Valid':valid,'maeAtLeast10PercentBetter':valid and base['served']['mae_kcal']>0 and
                candidate['served']['mae_kcal']<=.9*base['served']['mae_kcal']}
        for field in ('median_absolute_error_kcal','p90_absolute_error_kcal','mean_normalized_absolute_error'):
            guards[field+'NotWorse']=valid and candidate['served'][field]<=base['served'][field]
        screens[name]={'guards':guards,'passesAll':all(guards.values())}
    paired=[d for d in details if d['predictions']['A1'] is not None and d['predictions']['LensMassCounterfactual'] is not None]
    matched={'scoredPairs':len(paired),'scope':'Same valid pairs only; not a full-cohort ranking'}
    for name in ('A1','LensMassCounterfactual'):
        matched[name]=_metrics([dict(id=d['id'],reference=d['reference'],predicted=d['predictions'][name]) for d in paired])
    return dict(routes=metrics,cases=details,massArmCounts=counts,matchedMassOnly=matched,screens=screens,productionPromotable=False,
                fullSystemNutrientAssumptionsDiffer=True,massArmRetainsA1IdentitiesProportionsAndNutrients=True,
                interpretation='Exploratory complete-meal cross-dataset comparison; no verified pretraining independence or Android accuracy')
