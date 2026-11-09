"""Offline whole-meal error sensitivity, not a causal or user-correction experiment.

No component matching, inference, network access, new references or dependencies.
Both oracles use hidden reference totals and are unavailable to the image system.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import re
from collections import Counter
from pathlib import Path

from evaluate_meals import metrics

FROZEN_INPUT_SHA256='f08f254d11039682fb9ceee4c8bceffd153db7de05dc0a5405b46215fef55096'
VERSIONS=('v1','v2')
STATUSES=('ok','failed','abstained','not_attempted','pending')
REQUIRED={'id','cohort','referenceKcal','referenceMassG','inputSha256'} | {
    version+suffix for version in VERSIONS
    for suffix in ('ReceiptSha256','A1Status','A1kcal','A1MassG')}


def _number(value,label,*,positive=False,maximum=1000000,nonnegative=True):
    if isinstance(value,bool):raise ValueError(label+': boolean is not a number')
    try: result=float(value)
    except (TypeError,ValueError):raise ValueError(label+': numeric value required') from None
    if not math.isfinite(result) or abs(result)>maximum or (nonnegative and result<0) or (positive and result<=0):
        raise ValueError(label+': finite value out of range')
    return result


def _hash(value,label):
    if not isinstance(value,str) or not re.fullmatch(r'[0-9a-f]{64}',value):
        raise ValueError(label+': lowercase SHA256 required')
    return value


def _prediction(row,version,reference_kcal,reference_mass):
    status=row.get(version+'A1Status')
    if status not in STATUSES:raise ValueError('Unknown prediction status')
    result={'status':status,'receipt_sha256':_hash(row.get(version+'ReceiptSha256'),'receipt'),
            'original_kcal':None,'predicted_mass_g':None,'reference_mass_kcal':None,
            'reference_density_kcal':None,'oracle_status':'not_applicable',
            'oracle_undefined_reason':None}
    if status!='ok':return result
    energy=_number(row.get(version+'A1kcal'),'predicted energy')
    result['original_kcal']=energy
    raw_mass=row.get(version+'A1MassG')
    if raw_mass is None or raw_mass=='':
        result.update(oracle_status='undefined',oracle_undefined_reason='missing_predicted_mass')
        return result
    mass=_number(raw_mass,'predicted mass',maximum=100000,nonnegative=False)
    result['predicted_mass_g']=mass
    if mass<=0:
        result.update(oracle_status='undefined',oracle_undefined_reason='nonpositive_predicted_mass')
        return result
    mass_oracle=energy*(reference_mass/mass)
    density_oracle=reference_kcal*(mass/reference_mass)
    if not all(math.isfinite(n) and n>=0 for n in (mass_oracle,density_oracle)):
        result.update(oracle_status='undefined',oracle_undefined_reason='nonfinite_oracle')
        return result
    result.update(reference_mass_kcal=mass_oracle,reference_density_kcal=density_oracle,
                  oracle_status='eligible')
    return result


def _summary(cases,version):
    statuses=Counter(c['versions'][version]['status'] for c in cases)
    successful=[c for c in cases if c['versions'][version]['status']=='ok']
    eligible=[c for c in successful if c['versions'][version]['oracle_status']=='eligible']
    def score(rows,key):return metrics([(c['versions'][version][key],c['reference_kcal']) for c in rows])
    comparable=score(eligible,'original_kcal')
    mass=score(eligible,'reference_mass_kcal');density=score(eligible,'reference_density_kcal')
    return {'eligible_attempts':len(cases),'statuses':{s:statuses[s] for s in STATUSES},
            'coverage':len(successful)/len(cases) if cases else 0,
            'oracle_eligible':len(eligible),'oracle_undefined':len(successful)-len(eligible),
            'oracle_coverage':len(eligible)/len(cases) if cases else 0,
            'undefined_reasons':dict(Counter(c['versions'][version]['oracle_undefined_reason']
                for c in successful if c['versions'][version]['oracle_status']=='undefined')),
            'original':score(successful,'original_kcal'),'comparable_original':comparable,
            'reference_mass':mass,'reference_density':density,
            'delta_mae_kcal':{name:value['mae_kcal']-comparable['mae_kcal'] if eligible else None
                              for name,value in [('reference_mass',mass),('reference_density',density)]}}


def analyze_rows(rows):
    cases=[];seen=set()
    for row in rows:
        if not isinstance(row,dict) or not REQUIRED<=row.keys():raise ValueError('Missing CSV fields')
        identity=row['id'];cohort=row['cohort']
        if not isinstance(identity,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,120}',identity) or identity in seen:
            raise ValueError('Missing, invalid or duplicate case ID')
        if not isinstance(cohort,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',cohort):
            raise ValueError('Missing or invalid cohort')
        seen.add(identity)
        energy=_number(row['referenceKcal'],'reference energy')
        mass=_number(row['referenceMassG'],'reference mass',positive=True,maximum=100000)
        cases.append({'id':identity,'cohort':cohort,'reference_kcal':energy,'reference_mass_g':mass,
                      'image_sha256':_hash(row['inputSha256'],'image'),
                      'versions':{v:_prediction(row,v,energy,mass) for v in VERSIONS}})
    def summarize(selected):return {v:_summary(selected,v) for v in VERSIONS}
    bins={'under_200':[c for c in cases if c['reference_kcal']<200],
          '200_to_600':[c for c in cases if 200<=c['reference_kcal']<=600],
          'over_600':[c for c in cases if c['reference_kcal']>600]}
    return {'schema_version':1,'scope':'aggregate_oracle_sensitivity',
            'component_matching_performed':False,'user_correction_measurement':False,
            'causal_attribution':False,'new_inference_requests':0,
            'normalized_denominator_floor_kcal':200,
            'p90_method':'linear interpolation, index (n-1)*0.9',
            'formulas':{'reference_mass':'predicted_kcal * reference_mass_g / predicted_mass_g',
                        'reference_density':'reference_kcal * predicted_mass_g / reference_mass_g'},
            'limitations':['Unavailable hidden-reference substitutions, not achievable edits.',
                'Aggregate density includes identity, preparation, composition and missing-food errors.',
                'Compensating errors can make either substitution worse; effects are not additive causes.',
                'Original full endpoint and paired oracle-eligible endpoint have separate denominators.',
                'Ingredient count does not establish a gold mixed-meal label; mixed breakdown unavailable.',
                'No user-effort, Android transfer, independent completed-meal or general accuracy claim.'],
            'cases':cases,'groups':{'all':summarize(cases),
                'cohorts':{cohort:summarize([c for c in cases if c['cohort']==cohort])
                           for cohort in sorted({c['cohort'] for c in cases})},
                'energy_size_bins':{name:summarize(selected) for name,selected in bins.items()}}}


def load_csv(path,expected_sha256=FROZEN_INPUT_SHA256):
    _hash(expected_sha256,'expected input')
    raw=Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=expected_sha256:raise ValueError('Input SHA256 mismatch')
    reader=csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
    if not reader.fieldnames or len(reader.fieldnames)!=len(set(reader.fieldnames)) or not REQUIRED<=set(reader.fieldnames):
        raise ValueError('Missing or duplicate CSV columns')
    rows=list(reader)
    if any(None in row or any(row[key] is None for key in REQUIRED) for row in rows):
        raise ValueError('Malformed CSV row width')
    return rows


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cases',type=Path,required=True)
    parser.add_argument('--expected-sha256',default=FROZEN_INPUT_SHA256)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(argv)
    try:
        if args.output.exists() or args.output.is_symlink():raise ValueError('Output already exists; refusing overwrite')
        report=analyze_rows(load_csv(args.cases,args.expected_sha256))
        report['input_sha256']=args.expected_sha256
        report['input_is_frozen_public30']=args.expected_sha256==FROZEN_INPUT_SHA256
        text=json.dumps(report,indent=2,allow_nan=False)+'\n'
        args.output.parent.mkdir(parents=True,exist_ok=True)
        with args.output.open('x') as handle:handle.write(text)
    except (ValueError,OSError,UnicodeError) as error:parser.error(str(error))
    print(f"Wrote aggregate sensitivity for {len(report['cases'])} cases; no inference or new measurements.")
    return 0


if __name__=='__main__':raise SystemExit(main())
