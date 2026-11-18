"""Offline diagnostics for stored held-out predictions; no inference or fitting.

Numerical output contains licensed source information and must stay private.
Aggregate measured-mass substitution is reference-assisted, not causal, not
an accuracy bound and not a deployable prediction. Name matching is manual.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import statistics

from tool.failure_audit import diagnostic

FIELDS = ('kcal', 'proteinG', 'carbsG', 'fatG')
SEED = 'ravlo-multifood-error-audit-20261118'
REPO = Path(__file__).resolve().parents[1]


def number(value, positive=False):
    if isinstance(value, bool):
        raise ValueError('Finite nonnegative number required')
    try:
        n = float(value)
    except (ValueError, TypeError, OverflowError) as error:
        raise ValueError('Finite nonnegative number required') from error
    if not math.isfinite(n) or n < 0 or (positive and n <= 0):
        raise ValueError('Finite nonnegative number required')
    return n


def close(a, b):
    return math.isclose(a, b, rel_tol=1e-6, abs_tol=.06)


def point(estimate, prediction):
    totals = {k: number(estimate['totals'][k]) for k in FIELDS}
    components = estimate['components']
    if not isinstance(components, list) or not components:
        raise ValueError('Nonempty component list required')
    masses = [number(c['massG'], positive=True) for c in components]
    for k in FIELDS:
        if not close(math.fsum(number(c['nutrients'][k]) for c in components), totals[k]):
            raise ValueError('Component nutrients disagree with estimate totals')
    if not close(number(prediction['served_kcal']), totals['kcal']):
        raise ValueError('Prediction and estimate totals disagree')
    return dict(totals, massG=number(math.fsum(masses), positive=True))


def summary(rows):
    valid = [r for r in rows if r['status'] == 'ok']
    ds = [r['diagnostic'] for r in valid]
    errors = sorted(abs(d['rawErrorKcal']) for d in ds)
    return dict(selected=len(rows), scored=len(valid), failed=len(rows)-len(valid),
                coverage=len(valid)/len(rows) if rows else None,
                rawMaeKcal=statistics.mean(errors) if errors else None,
                biasKcal=statistics.mean(d['rawErrorKcal'] for d in ds) if ds else None,
                rawP90Kcal=errors[int(.9*(len(errors)-1))] if errors else None,
                referenceMassOracleMaeKcal=statistics.mean(abs(d['referenceMassOracleErrorKcal']) for d in ds) if ds else None,
                medianReferenceToPredictedMassRatio=statistics.median(d['referenceToPredictedMassRatio'] for d in ds) if ds else None)


def selection(rows):
    eligible = [r for r in rows if r['source'] == 'nv' and not r['suspectReference'] and r['status'] == 'ok']
    large = sorted(eligible, key=lambda r: (-abs(r['diagnostic']['rawErrorKcal']), r['id']))[:8]
    used = {r['id'] for r in large}
    ranked = sorted((r for r in eligible if r['id'] not in used), key=lambda r: (hashlib.sha256((SEED+'|'+r['id']).encode()).hexdigest(), r['id']))[:4]
    return [dict(id=r['id'], role=role) for role, rs in [('large_error', large), ('hash_control', ranked)] for r in rs]


def build_audit(root, nv_csv):
    root = Path(root).resolve()
    pins = {}

    def read(relative, optional=False):
        p = root / relative
        if p.is_symlink() or not p.resolve().is_relative_to(root):
            raise ValueError('Input path escapes source root or is symlink')
        if optional and not p.exists():
            pins[relative] = None
            return None
        raw = p.read_bytes()
        pins[relative] = hashlib.sha256(raw).hexdigest()
        return raw

    raw = Path(nv_csv).read_bytes()
    pins['sourceCsv'] = hashlib.sha256(raw).hexdigest()
    source = {}
    for r in csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))):
        if not re.fullmatch(r'[0-9]+', r['dish_id']):
            raise ValueError('Canonical source dish ID required')
        id = 'nv-dish-' + str(int(r['dish_id']))
        if id in source:
            raise ValueError('Duplicate source dish')
        source[id] = r
    manifest = json.loads(read('manifest.json'))
    rows = []
    seen = set()
    for c in manifest['cases']:
        id = c['id']
        if not isinstance(id, str) or not re.fullmatch(r'(dish_[0-9]+|nv-dish-(0|[1-9][0-9]*))', id) or id in seen:
            raise ValueError('Unsafe or duplicate case ID')
        seen.add(id)
        if c['source'] not in ('nv', 'n5k') or (c['source'] == 'nv') != id.startswith('nv-'):
            raise ValueError('Source and case ID disagree')
        if c['source'] == 'nv' and 'suspectReference' not in c:
            raise ValueError('Frozen NV suspect flag required')
        suspect = c.get('suspectReference', False)
        if type(suspect) is not bool:
            raise ValueError('Explicit boolean suspect flag required')
        row = dict(id=id, source=c['source'], suspectReference=suspect, status='failed', failure=None,
                   reference=dict(kcal=number(c['referenceKcal'], True), massG=number(c['referenceMassG'], True)),
                   sourceComponents=[], sourceChecks=[], referenceMacrosAvailable=c['source']=='nv')
        if c['source'] == 'nv':
            s = source[id]
            columns = dict(kcal='total_calories', massG='total_food_weight', proteinG='total_protein', carbsG='total_carbohydrates', fatG='total_fats')
            for k, col in columns.items():
                n = number(s[col])
                if k in ('kcal', 'massG'):
                    if not close(n, row['reference'][k]):
                        row['sourceChecks'].append('manifest_'+k+'_mismatch')
                else:
                    row['reference'][k] = n
            for i in range(1, 8):
                name = s.get('food_item_type_'+str(i))
                if name and name not in ('nan', '0'):
                    row['sourceComponents'].append(dict(name=name, massG=number(s['food_weight_g_'+str(i)]), kcal=number(s['calories(kCal)_'+str(i)])))
            for k, label in [('massG', 'mass'), ('kcal', 'energy')]:
                if not close(math.fsum(x[k] for x in row['sourceComponents']), row['reference'][k]):
                    row['sourceChecks'].append('component_'+label+'_sum_mismatch')
        photo = read('photos/'+id+'.jpg', optional=True)
        receipt = read('receipts/'+id+'.json', optional=True)
        if photo is not None and hashlib.sha256(photo).hexdigest() != c['photoSha256']:
            raise ValueError('Photo changed from frozen manifest')
        if photo is None:
            row['failure'] = 'missing_photo'
        elif receipt is None:
            row['failure'] = 'missing_receipt'
        else:
            record = json.loads(receipt)
            if record.get('meal_id') != id:
                raise ValueError('Receipt meal ID disagrees with manifest')
            predictions = [p for p in record.get('predictions', []) if p.get('route') == 'A1']
            if len(predictions) > 1:
                raise ValueError('Duplicate A1 prediction')
            if len(predictions) != 1 or predictions[0].get('status') != 'ok':
                row['failure'] = 'failed_original_prediction'
            else:
                estimate = record['estimate']
                predicted = point(estimate, predictions[0])
                diagnostic_reference = dict(row['reference'])
                if not row['referenceMacrosAvailable']:
                    # Local adapter placeholders only; absent measurements stay absent.
                    diagnostic_reference.update(proteinG=0, carbsG=0, fatG=0)
                row.update(status='ok', predicted=predicted, predictedComponents=estimate['components'], diagnostic=diagnostic(diagnostic_reference, predicted))
                if not row['referenceMacrosAvailable']:
                    for k in ('referenceGeneralFactorEnergyKcal', 'referenceEnergyMinusGeneralFactorsKcal'):
                        row['diagnostic'].pop(k)
        rows.append(row)
    groups = dict(n5k=[r for r in rows if r['source']=='n5k'], nvAll=[r for r in rows if r['source']=='nv'], nvNonsuspect=[r for r in rows if r['source']=='nv' and not r['suspectReference']])
    return dict(schemaVersion=1, inputPins=pins, selected=len(rows), rows=rows, groups={k: summary(v) for k,v in groups.items()},
                visualSelection=selection(rows), selectionSeed=SEED, newModelCalls=0, causalAttribution=False, productionPromotable=False,
                limits='Exposed development diagnosis. Measured-total-mass substitution requires ground truth; not causal or an accuracy bound. Source anomalies retained, no reference repair. No automatic semantic matching. Selected visual review is not exhaustive or representative; hidden/composite ingredients stay ambiguous.')


def write_private(output, result):
    output = Path(output).resolve()
    if output.is_relative_to(REPO):
        raise ValueError('Licensed numerical report must remain outside repository')
    fd = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(result, f, indent=2, allow_nan=False)
        f.write('\n')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ('root', 'nv-csv', 'output'):
        p.add_argument('--'+arg, type=Path, required=True)
    a = p.parse_args()
    result = build_audit(a.root, a.nv_csv)
    if result['selected'] != 335 or result['groups']['n5k']['selected'] != 150 or result['groups']['nvAll']['selected'] != 185:
        raise ValueError('Expected frozen335-case held-out study')
    write_private(a.output, result)
    print(json.dumps(dict(selected=result['selected'], visualSelection=len(result['visualSelection']), newModelCalls=0)))


if __name__ == '__main__':
    main()
