"""Build a small frozen catalog from official FDC CSVs; never infer nutrients."""
import argparse
import csv
import hashlib
import io
import json
import math
import re
import zipfile
from pathlib import Path

NUTRIENTS={'1008':('kcal','KCAL'),'1003':('proteinG','G'),
           '1004':('fatG','G'),'1005':('carbsG','G')}


def digest(value):
    raw=value if isinstance(value,bytes) else json.dumps(value,sort_keys=True,separators=(',',':')).encode()
    return hashlib.sha256(raw).hexdigest()


def build_catalog(archive,selection,retrieved):
    if digest(archive)!=selection['archiveSha256']:raise ValueError('Archive SHA mismatch')
    foods=selection['foods']
    ids=[str(f['fdcId']) for f in foods]
    if not 1<=len(ids)<=90 or len(set(ids))!=len(ids):raise ValueError('Invalid or duplicate selection')
    for f in foods:
        prior=f['priorG']
        if isinstance(prior,bool) or not isinstance(prior,(int,float)) or not math.isfinite(prior) or not 0<prior<=1000:
            raise ValueError('Invalid engineering serving prior')
        if not re.fullmatch(r'[1-9][0-9]*',str(f['fdcId'])):raise ValueError('Invalid FDC ID')
        if not f['description'] or not f['preparation']:raise ValueError('Missing description/preparation')
        unprepared=re.search(r'\b(raw|uncooked|unprepared)\b|, dry(?:,|$)',f['description'],re.I)
        staple=re.search(r'\b(rice|pasta|quinoa|couscous|oats|oatmeal|wheat|barley|buckwheat|millet|sorghum|potato|potatoes|lentils|beans|chickpeas|chicken|turkey|beef|pork|fish)\b',f['description'],re.I)
        if unprepared and staple:
            raise ValueError('Raw staple/protein excluded from prepared-meal catalog')
    selected=set(ids);food_rows={};nutrient_rows={i:{} for i in ids};units={};member_sha={}
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        def rows(table):
            matches=[n for n in z.namelist() if Path(n).name==table]
            if len(matches)!=1:raise ValueError('Missing or duplicate source table')
            name=matches[0];h=hashlib.sha256()
            with z.open(name) as source:
                for block in iter(lambda:source.read(65536),b''):h.update(block)
            member_sha[table]=h.hexdigest()
            with z.open(name) as source:
                yield from csv.DictReader(io.TextIOWrapper(source,encoding='utf-8-sig',newline=''))
        for row in rows('food.csv'):
            identifier=row['fdc_id']
            if identifier in selected:
                if identifier in food_rows:raise ValueError('Duplicate selected food')
                food_rows[identifier]=row
        for row in rows('nutrient.csv'):
            identifier=row['id']
            if identifier in NUTRIENTS:
                if identifier in units:raise ValueError('Duplicate nutrient definition')
                units[identifier]=row['unit_name'].upper()
        if units!={n:unit for n,(_,unit) in NUTRIENTS.items()}:raise ValueError('Missing nutrient or wrong unit')
        for row in rows('food_nutrient.csv'):
            identifier=row['fdc_id'];nutrient=row['nutrient_id']
            if identifier in selected and nutrient in NUTRIENTS:
                if nutrient in nutrient_rows[identifier]:raise ValueError('Duplicate selected nutrient')
                try:value=float(row['amount'])
                except (ValueError,TypeError):raise ValueError('Invalid nutrient amount') from None
                limit=10000 if nutrient=='1008' else 100
                if not math.isfinite(value) or not 0<=value<=limit:raise ValueError('Invalid nutrient amount')
                nutrient_rows[identifier][nutrient]=row
    records=[];source_rows=[]
    for selected_food in foods:
        identifier=str(selected_food['fdcId']);food=food_rows.get(identifier);nutrients=nutrient_rows[identifier]
        if food is None or food['data_type']!='sr_legacy_food' or food['description']!=selected_food['description']:
            raise ValueError('Missing food, unexpected source type or description drift')
        if set(nutrients)!=set(NUTRIENTS):raise ValueError('Incomplete nutrient record')
        source={'id':'usda:'+identifier,'foodRow':food,'nutrientRows':[nutrients[n] for n in sorted(NUTRIENTS)]}
        record={'id':source['id'],'description':food['description'],'preparation':selected_food['preparation'],
                'priorG':selected_food['priorG'],'per100':{key:float(nutrients[n]['amount']) for n,(key,_) in NUTRIENTS.items()},
                'sourceUrl':f'https://fdc.nal.usda.gov/food-details/{identifier}/nutrients',
                'dataType':'SR Legacy','published':food['publication_date'],'retrieved':retrieved,
                'sourceArchiveSha256':selection['archiveSha256'],'sourceRowSha256':digest(source)}
        records.append(record);source_rows.append(source)
    return {'version':selection['version'],'sourceUrl':selection['sourceUrl'],
            'archiveSha256':selection['archiveSha256'],'selectionSha256':digest(selection),
            'memberSha256':member_sha,'nutrientUnits':units,'portionPriorPolicy':'Frozen engineering assumptions, not USDA serving measures',
            'records':records,'sourceRows':source_rows}


def render_typescript(catalog):
    return ('// Official USDA SR Legacy selected records; built with tool/build_tier1_catalog.py.\n'
            '// Nutrient values are per100g; serving priors and visual food/preparation matches are estimates.\n'
            f'export const CATALOG_VERSION = {catalog["version"]!r};\n'
            'export const CATALOG = '+json.dumps(catalog['records'],indent=2)+' as const;\n')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive',type=Path,required=True);parser.add_argument('--selection',type=Path,required=True)
    parser.add_argument('--retrieved',required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--typescript',type=Path);parser.add_argument('--provenance',type=Path)
    args=parser.parse_args()
    outputs=[p for p in [args.output,args.typescript,args.provenance] if p is not None]
    if len(set(p.resolve() for p in outputs))!=len(outputs) or any(p.exists() for p in outputs):
        raise ValueError('Output exists or destinations overlap; refusing overwrite')
    result=build_catalog(args.archive.read_bytes(),json.loads(args.selection.read_text()),args.retrieved)
    with args.output.open('x') as target:json.dump(result,target,indent=2);target.write('\n')
    if args.typescript:
        with args.typescript.open('x') as target:target.write(render_typescript(result))
    if args.provenance:
        with args.provenance.open('x') as target:
            json.dump({k:v for k,v in result.items() if k!='records'},target,indent=2);target.write('\n')
    print(json.dumps({'records':len(result['records']),'archiveSha256':result['archiveSha256'],'selectionSha256':result['selectionSha256']}))


if __name__=='__main__':main()
