"""Independent arithmetic/provenance replay; performs no model or network calls."""
import argparse, csv, hashlib, io, json, math, statistics, struct, zipfile, sys
from decimal import Decimal, getcontext
from pathlib import Path
getcontext().prec=60
D=lambda x:Decimal(str(x))
FIELDS=('kcal','proteinG','carbsG','fatG')
def close(a,b):
    if a is None or b is None:
        assert a is b,(a,b)
    else:
        assert abs(D(a)-D(b))<Decimal('1e-8'),(a,b)
def q(values,p):
    if not values:return None
    v=sorted(values);i=D(len(v)-1)*p;lo=int(i);return v[lo]+(v[min(lo+1,len(v)-1)]-v[lo])*(i-lo)
def main(repo, root):
    from tool.lens_onnx_contract import preprocess,publisher_summary,OUTPUTS
    manifest=json.loads((repo/'functions/eval/tier1-public/manifest-food-agreement-v1.json').read_text())
    profile=json.loads((repo/'functions/eval/tier1-public/food-agreement-profile-v1.json').read_text())
    result=json.loads((root/'result.json').read_text())
    details={c['id']:c for c in result['cases']}
    assert len(details)==len(result['cases'])==20
    assert set(result['routes'])=={'A0','A1','Lens','old','agreement'}
    config=json.loads((repo/'functions/eval/tier1-public/calorie-lens/config.json').read_text())
    for pin in profile['sourceFiles']:
        p=repo/pin['path'];assert len(p.read_bytes())==pin['bytes'];assert hashlib.sha256(p.read_bytes()).hexdigest()==pin['sha256']
    group_rows=list(csv.DictReader((repo/'docs/tier1-food-agreement-2026-11-11/dish-groups.csv').open()))
    by={r['dish_id']:r for r in group_rows};assert len(by)==5005
    tv={r['group'] for r in group_rows if r['split'] in ('train','val')}
    prior=manifest['excludedPriorGroups']
    assert len({c['authorGroup'] for c in manifest['cases']})==20
    assert len({c['captureDate'] for c in manifest['cases']})==20
    assert len(manifest['cases'])==20
    raw_scalars=products=checks=point_checks=0;tokens={'input':0,'output':0};sdk=0;images=0
    catalog=json.loads((root/'research/frozen-a1-catalog.json').read_text());records={r['id']:r for r in catalog['CATALOG']}
    input_checks=True
    for c in manifest['cases']:
        m=by[c['id']];assert m['split']=='test' and m['test_clean']=='1'
        assert m['group'] not in tv and int(m['group']) not in prior
        photo=root/'prepared'/c['inputPath']
        if photo.exists():
            assert hashlib.sha256(photo.read_bytes()).hexdigest()==c['inputSha256'];images+=1
        a=json.loads((root/'a1'/(c['id']+'.json')).read_text());assert a['id']==c['id'];sdk+=int(a['sdkInvoked'])
        if a['A1']['status']=='ok':
            estimate=a['estimate'];pro=estimate['provenance']
            assert pro['model']==pro['returnedModel']=='gemini-3.8-flash'
            assert pro['catalogVersion']==catalog['CATALOG_VERSION']
            assert pro['promptSha256']=='7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566'
            for k in tokens:tokens[k]+=pro[k+'Tokens'] or 0
            sums={k:Decimal(0) for k in FIELDS}
            for part in estimate['components']:
                if part['catalogId']:
                    record=records[part['catalogId']];assert part['source']['kind']=='database_match'
                    assert part['source']['recordId']==record['id'];per=record['per100']
                else:
                    assert part['source']['kind']=='unverified_vlm_estimate' and part['source']['recordId'] is None
                    per=part['estimatedPer100']
                for k in FIELDS:
                    expected=D(per[k])*D(part['massG'])/100;close(expected,part['nutrients'][k]);sums[k]+=D(part['nutrients'][k]);products+=1
            for k in FIELDS:close(sums[k],estimate['totals'][k]);close(estimate['totals'][k],a['A1']['predicted'][k])
            close(sum(D(p['massG']) for p in estimate['components']),a['A1']['massG'])
            if estimate['question'] is not None:assert not estimate['question']['answered']
        lens=json.loads((root/'lens'/(c['id']+'.json')).read_text());assert lens['id']==c['id'] and lens['status']=='ok'
        assert lens['inputSha256']==c['inputSha256']
        if photo.exists():
            tensor=preprocess(photo.read_bytes(),config['image_size'])
            assert hashlib.sha256(tensor.tobytes()).hexdigest()==lens['inputTensor']['sha256']
        rebuilt=publisher_summary(lens['raw'],config);assert rebuilt==lens['publisherSummary']
        assert rebuilt['totals']['mass_g']==lens['massG']
        for k,pub in zip(FIELDS,('kcal','protein_g','carb_g','fat_g')):assert rebuilt['totals'][pub]==lens['totals'][k]
        shapes={'grams':(1,253),'logits':(1,253),'log_grams':(1,253),'soft':(1,253),'mass_gap':(1,),'log_totals':(1,5),'totals':(1,8)}
        for head in OUTPUTS:
            assert __import__('numpy').asarray(lens['raw'][head]).shape==shapes[head]
            def flatten(v):
                if isinstance(v,list):
                    for child in v:yield from flatten(child)
                else:yield v
            vals=list(flatten(lens['raw'][head]));assert all(type(v) in (int,float) and math.isfinite(v) for v in vals)
            raw_scalars+=len(vals)
        assert len(lens['components'])==253
        for part,g,density in zip(lens['components'],lens['raw']['grams'][0],config['densities']):
            close(part['massG'],g)
            assert not part['foodIdentityVerified'] and not part['amountVerified']
            for k,d in zip(('kcal','fatG','carbsG','proteinG'),density):
                close(D(g)*D(d),part['nutrients'][k]);products+=1
        expected_a1=dict(a['A1']['predicted'],massG=a['A1']['massG'])
        expected_lens=dict(lens['totals'],massG=lens['massG'])
        a0=a['A0'];expected_a0=dict(a0['predicted'],massG=a0['massG']) if a0['status']=='ok' else None
        old=expected_lens if expected_a1['massG']>=150 and len(a['estimate']['components'])>=2 else expected_a1
        assert details[c['id']]['selectedSource']=='A1'  # This frozen candidate switched none.
        for route,expected in [('A0',expected_a0),('A1',expected_a1),('Lens',expected_lens),('old',old),('agreement',expected_a1)]:
            actual=details[c['id']]['predictions'][route]
            if expected is None:assert actual is None
            else:
                assert set(actual)==set(expected)
                for field in expected:close(expected[field],actual[field]);point_checks+=1
    assert raw_scalars==20520
    assert set(details)=={c['id'] for c in manifest['cases']}
    for name,metrics in result['routes'].items():
        rows=[details[c['id']] for c in manifest['cases']]
        good=[r for r in rows if r['predictions'][name] is not None]
        assert metrics['selected']==metrics['attempted']==20 and metrics['scored']==len(good) and metrics['failed']==20-len(good)
        close(metrics['coverage'],D(len(good))/20);checks+=1
        errors=[D(r['predictions'][name]['kcal'])-D(r['reference']['kcal']) for r in good]
        absolute=list(map(abs,errors))
        expected={'mae_kcal':sum(absolute)/len(good) if good else None,
                  'bias_kcal':sum(errors)/len(good) if good else None,
                  'median_absolute_error_kcal':statistics.median(absolute) if good else None,
                  'p90_absolute_error_kcal':q(absolute,D('.9')),
                  'mean_normalized_absolute_error':sum(abs(D(r['predictions'][name]['kcal'])-D(r['reference']['kcal']))/max(D(r['reference']['kcal']),D(200)) for r in good)/len(good) if good else None}
        for k,v in expected.items():close(v,metrics['served'][k]);checks+=1
        for k in ('massG','proteinG','carbsG','fatG'):
            es=[D(r['predictions'][name][k])-D(r['reference'][k]) for r in good]
            ex={'mae':sum(map(abs,es))/len(es) if es else None,'bias':sum(es)/len(es) if es else None,'p90_absolute_error':q(list(map(abs,es)),D('.9'))}
            for field,v in ex.items():close(v,metrics['amounts'][k][field]);checks+=1
    out={'passes':True,'profilePins':len(profile['sourceFiles']),'publicImagesAndTensorsRecomputed':images,
         'authorMetadataRows':len(by),'authorGroupsDisjointFromKnown':True,'checkpointTrainingLineageVerified':False,
         'rawScalarsFinite':raw_scalars,'nutrientProductsChecked':products,'independentDecimalMetricFields':checks,'rawToScoredPointFields':point_checks,
         'actualMealSdkInvocations':sdk,'tokens':tokens,'neuralCallsInAudit':0,'visualFoodIdentityAudit':False}
    print(json.dumps(out,indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,required=True);p.add_argument('--root',type=Path)
    p.add_argument('--archive',type=Path)
    a=p.parse_args()
    sys.path.insert(0,str(a.repo.resolve()))
    if not a.archive and a.root is None:p.error('Specify --root or --archive')
    if a.archive:
        import tempfile
        with tempfile.TemporaryDirectory(prefix='food-agreement-replay-') as directory:
            root=Path(directory)
            with zipfile.ZipFile(a.archive) as archive:
                for name in archive.namelist():
                    allowed=(name=='result.json' or name=='research/frozen-a1-catalog.json' or
                             __import__('re').fullmatch(r'(a1|lens)/dish_[0-9]{10}\.json',name))
                    if not allowed:raise ValueError('Unexpected archive member')
                    dest=root/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(archive.read(name))
            main(a.repo,root)
    else:main(a.repo,a.root)

