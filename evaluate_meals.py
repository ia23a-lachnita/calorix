#!/usr/bin/env python3
"""Tier1 complete-meal evaluation. No libraries, downloads, inference, or invented references.

Input is a JSON object conforming to meal_schema.json. Synthetic fixtures in tests
validate arithmetic only. Accuracy is conditional on explicitly reported coverage.
"""
import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path


def number(value, name, positive=False, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f'{name}: finite number required')
    if value < 0 or (positive and value == 0) or (maximum is not None and value > maximum):
        raise ValueError(f'{name}: out of range')
    return float(value)


def fraction(value, name):
    return number(value, name, maximum=1)


def keyed(rows, key):
    result = {}
    for row in rows:
        name = row.get(key)
        if not isinstance(name, str) or not name or name in result:
            raise ValueError(f'{key}: missing or duplicate ID')
        result[name] = row
    return result


def reference_energy(meal):
    """Yield-adjusted recipe references; allocations are fractions of source energy/mass."""
    if meal.get('reference_served_grade') not in ('A', 'B', 'C', 'unknown'):
        raise ValueError('Invalid served reference grade')
    if meal.get('reference_consumed_grade') not in ('A', 'B', 'C', 'unknown'):
        raise ValueError('Invalid consumed reference grade')
    if meal['reference_served_grade'] in ('C', 'unknown'):
        if meal['reference_consumed_grade'] == 'A':
            raise ValueError('Consumed-A needs an independently scorable Served-A reference')
        return {'served_kcal': None, 'consumed_kcal': None, 'component_energy_kcal': {}}
    ingredients = keyed(meal.get('ingredients', []), 'ingredient_id')
    batches = keyed(meal.get('cooking_batches', []), 'cooking_batch_id')
    components = keyed(meal.get('plated_components', []), 'plated_component_id')
    if not ingredients or not components:
        raise ValueError('Scorable reference requires measured ingredients and plated components')
    energy, mass, ingredient_use = {}, {}, {i: [0., 0.] for i in ingredients}
    for identity, row in ingredients.items():
        m = number(row.get('ingredient_input_g'), identity, positive=True)
        d = number(row.get('ingredient_kcal_per_g'), identity, maximum=10)
        source = row.get('ingredient_energy_source', {})
        if not source.get('record_id') or not source.get('version'):
            raise ValueError('Reference nutrient source ID and version required')
        energy[('ingredient', identity)] = m*d
        mass[('ingredient', identity)] = m
    for identity, batch in batches.items():
        retained = 0.
        allocations = batch.get('ingredient_allocations', [])
        if not allocations:
            raise ValueError('Batch has no measured ingredient allocations')
        for allocation in allocations:
            i = allocation.get('ingredient_id')
            if i not in ingredients:
                raise ValueError('Unknown batch ingredient')
            ef = fraction(allocation.get('energy_fraction'), 'ingredient energy fraction')
            mf = fraction(allocation.get('mass_fraction'), 'ingredient mass fraction')
            if abs(ef-mf) > 1e-6 and not allocation.get('allocation_evidence'):
                raise ValueError('Unequal batch ingredient mass/energy fractions require independent evidence')
            ingredient_use[i][0] += ef
            ingredient_use[i][1] += mf
            retained += energy[('ingredient', i)]*ef
        retained -= number(batch.get('discarded_edible_energy_kcal'), 'discarded energy')
        retained -= number(batch.get('other_energy_losses_kcal'), 'other energy loss')
        if retained < -1e-8 or not batch.get('retention_assumption'):
            raise ValueError('Invalid retained batch energy or missing retention assumption')
        energy[('batch', identity)] = max(0, retained)
        mass[('batch', identity)] = number(batch.get('batch_cooked_edible_mass_g'), 'cooked batch mass', positive=True)
    source_use, component_energy = {}, {}
    consumed = 0.
    consumed_known = True
    for identity, component in components.items():
        serving = number(component.get('serving_cooked_mass_g'), 'served mass', positive=True)
        allocations = component.get('source_allocations', [])
        if not allocations:
            raise ValueError('Plated component has no source allocation')
        total, allocated_mass = 0., 0.
        for allocation in allocations:
            key = (allocation.get('source_type'), allocation.get('source_id'))
            if key not in energy:
                raise ValueError('Unknown plated source')
            ef = fraction(allocation.get('component_energy_allocation_fraction'), 'component energy fraction')
            mf = fraction(allocation.get('component_mass_allocation_fraction'), 'component mass fraction')
            method = allocation.get('allocation_method')
            if key[0] == 'batch':
                homogeneous = batches[key[1]].get('homogeneous')
                if homogeneous is not True and method != 'measured_ingredient_allocation':
                    raise ValueError('Heterogeneous batch cannot use uniform kcal/g')
                if homogeneous is True and method == 'homogeneous_yield' and abs(ef-mf) > 1e-6:
                    raise ValueError('Homogeneous allocation must use identical mass and energy fractions')
                if method == 'measured_ingredient_allocation' and not allocation.get('allocation_evidence'):
                    raise ValueError('Selective allocation requires independent evidence')
            else:
                if method != 'measured_ingredient_allocation':
                    raise ValueError('Direct ingredient allocation requires measurement')
                if abs(ef-mf) > 1e-6 and not allocation.get('allocation_evidence'):
                    raise ValueError('Unequal direct ingredient mass/energy fractions require independent evidence')
            total += energy[key]*ef
            allocated_mass += mass[key]*mf
            use = source_use.setdefault(key, [0., 0.])
            use[0] += ef
            use[1] += mf
            if key[0] == 'ingredient':
                ingredient_use[key[1]][0] += ef
                ingredient_use[key[1]][1] += mf
        if abs(allocated_mass-serving) > max(.5, serving*.01):
            raise ValueError('Allocation mass does not reconcile with weighed plated mass')
        component_energy[identity] = total
        if 'leftover_energy_kcal' in component:
            left = number(component['leftover_energy_kcal'], 'leftover energy', maximum=total)
            if not component.get('leftover_reference_evidence'):
                raise ValueError('Leftover energy needs independent reference evidence')
            consumed += total-left
        elif 'leftover_cooked_mass_g' in component and component.get('homogeneous') is True:
            left = number(component['leftover_cooked_mass_g'], 'leftover mass', maximum=serving)
            consumed += total*(1-left/serving)
        else:
            consumed_known = False
    for ef, mf in list(source_use.values())+list(ingredient_use.values()):
        if ef > 1+1e-6 or mf > 1+1e-6:
            raise ValueError('Ingredient or batch allocated more than once')
    served = sum(component_energy.values())
    method = meal.get('consumed_reference_method', 'unknown')
    if method == 'confirmed_ate_all':
        consumed = served
        consumed_known = True
    elif method != 'measured_component_leftovers':
        consumed_known = False
    if meal['reference_consumed_grade'] == 'A' and (meal['reference_served_grade'] != 'A' or not consumed_known):
        raise ValueError('Consumed-A requires independent confirmation or defensible leftovers')
    return {'served_kcal': served, 'consumed_kcal': consumed if consumed_known else None,
            'component_energy_kcal': component_energy}


def quantile(values, probability):
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered)-1)*probability
    low = math.floor(index)
    return ordered[low] + (ordered[min(low+1, len(ordered)-1)]-ordered[low])*(index-low)


def metrics(pairs):
    errors = [pred-ref for pred, ref in pairs]
    return {'scored_meals': len(pairs), 'mae_kcal': sum(map(abs, errors))/len(errors) if errors else None,
            'bias_kcal': sum(errors)/len(errors) if errors else None,
            'p90_absolute_error_kcal': quantile([abs(e) for e in errors], .9),
            'mean_normalized_absolute_error': sum(abs(p-r)/max(r, 200) for p, r in pairs)/len(pairs) if pairs else None}


def evaluate(dataset):
    if dataset.get('schema_version') != '1.0' or not isinstance(dataset.get('meals'), list):
        raise ValueError('Expected schema_version 1.0 and meals array')
    meals = dataset['meals']
    keyed(meals, 'meal_id')
    keyed(meals, 'physical_meal_id')
    references = {m['meal_id']: reference_energy(m) for m in meals}
    predictions = {}
    grades = Counter()
    for meal in meals:
        grades[(meal.get('meal_type', 'unknown'), meal['reference_served_grade'], meal['reference_consumed_grade'])] += 1
        by_route = {}
        for p in meal.get('predictions', []):
            route = p.get('route')
            if route not in ('A0', 'A1') or route in by_route:
                raise ValueError('Duplicate or unknown prediction route')
            if p.get('status') not in ('ok', 'failed', 'abstained', 'manual'):
                raise ValueError('Invalid prediction status')
            if p['status'] in ('ok', 'manual'):
                number(p.get('served_kcal'), 'predicted served kcal')
                if p.get('consumed_kcal') is not None:
                    number(p['consumed_kcal'], 'predicted consumed kcal')
                for key in ('model_version', 'nutrient_data_version', 'preparation_context_id'):
                    if not p.get(key):
                        raise ValueError(f'Prediction provenance missing {key}')
            for key in ('latency_ms', 'shutter_to_estimate_ms', 'cost_usd', 'active_user_ms', 'wall_clock_ms'):
                if p.get(key) is not None:
                    number(p[key], key)
            by_route[route] = p
        predictions[meal['meal_id']] = by_route
    def timing(values):
        return {'measured': len(values), 'p50': quantile(values, .5), 'p95': quantile(values, .95)}

    routes = {}
    for route in ('A0', 'A1'):
        counts = Counter()
        served, consumed, sensitivity, assisted = [], [], [], []
        mixed, single, size = [], [], {'under_200': [], '200_to_600': [], 'over_600': []}
        latencies, shutters, costs, interaction, walls = [], [], [], [], []
        costs_missing = False
        paths = {p: {k: [] for k in ('latency_ms', 'shutter_to_estimate_ms', 'active_user_ms', 'wall_clock_ms')} for p in ('no_question', 'question', 'retake', 'unknown')}
        for meal in meals:
            p = predictions[meal['meal_id']].get(route)
            status = p['status'] if p else 'missing'
            counts[status] += 1
            ref = references[meal['meal_id']]
            if p:
                path = p.get('workflow_path', 'unknown')
                if path not in paths:
                    raise ValueError('Invalid workflow timing path')
                for key in paths[path]:
                    if p.get(key) is not None:
                        paths[path][key].append(p[key])
                if p.get('cost_usd') is None:
                    costs_missing = True
                else:
                    costs.append(p['cost_usd'])
                for key, target in [('latency_ms', latencies), ('shutter_to_estimate_ms', shutters), ('active_user_ms', interaction), ('wall_clock_ms', walls)]:
                    if p.get(key) is not None:
                        target.append(p[key])
            if not p or status not in ('ok', 'manual'):
                continue
            if ref['served_kcal'] is not None:
                pair = (p['served_kcal'], ref['served_kcal'])
                if meal['reference_served_grade'] in ('A', 'B') and status == 'ok':
                    sensitivity.append(pair)
                if meal['reference_served_grade'] == 'A':
                    if status == 'manual':
                        assisted.append(pair)
                    else:
                        served.append(pair)
                        (mixed if meal.get('meal_type') == 'mixed' else single).append(pair)
                        size['under_200' if pair[1] < 200 else '200_to_600' if pair[1] <= 600 else 'over_600'].append(pair)
            if status == 'ok' and meal['reference_consumed_grade'] == 'A' and ref['consumed_kcal'] is not None and p.get('consumed_kcal') is not None:
                consumed.append((p['consumed_kcal'], ref['consumed_kcal']))
        routes[route] = {'eligible_attempts': len(meals), 'automatic_answers': counts['ok'],
            'coverage': counts['ok']/len(meals) if meals else 0, 'failed': counts['failed'],
            'abstained': counts['abstained'], 'missing_predictions': counts['missing'], 'manual_fallbacks': counts['manual'],
            'served': metrics(served), 'consumed': metrics(consumed), 'served_A_plus_B_sensitivity': metrics(sensitivity),
            'assisted_workflow': metrics(assisted), 'mixed_meals': metrics(mixed), 'single_meals': metrics(single),
            'energy_size_bins': {k: metrics(v) for k, v in size.items()},
            'inference_latency_ms': {'measured': len(latencies), 'p50': quantile(latencies, .5), 'p95': quantile(latencies, .95)},
            'shutter_to_estimate_ms': {'measured': len(shutters), 'p50': quantile(shutters, .5), 'p95': quantile(shutters, .95)},
            'active_user_ms': {'measured': len(interaction), 'p50': quantile(interaction, .5), 'p95': quantile(interaction, .95)},
            'wall_clock_ms': {'measured': len(walls), 'p50': quantile(walls, .5), 'p95': quantile(walls, .95)},
            'timing_by_path': {path: {('inference_latency_ms' if key == 'latency_ms' else key): timing(values) for key, values in fields.items()} for path, fields in paths.items()},
            'cost_usd_total': sum(costs) if costs and not costs_missing and not counts['missing'] else None,
            'corrections': sum(p.get('corrections', 0) for ps in predictions.values() if (p := ps.get(route))),
            'missing_foods': sum(len(p.get('missing_foods', [])) for ps in predictions.values() if (p := ps.get(route)))}
    pairs = {'A0': [], 'A1': []}
    incompatible = 0
    for meal in meals:
        ps = predictions[meal['meal_id']]
        a, b = ps.get('A0'), ps.get('A1')
        ref = references[meal['meal_id']]['served_kcal']
        if not a or not b or a['status'] != 'ok' or b['status'] != 'ok' or meal['reference_served_grade'] != 'A' or ref is None:
            continue
        if any(a.get(k) != b.get(k) for k in ('nutrient_data_version', 'preparation_context_id')):
            incompatible += 1
            continue
        pairs['A0'].append((a['served_kcal'], ref))
        pairs['A1'].append((b['served_kcal'], ref))
    return {'schema_version': '1.0', 'physical_meals': len(meals), 'target_meals': 30,
        'evidence_scope': dataset.get('evidence_scope', 'user-supplied exploratory references; provenance not independently verified'),
        'accuracy_interpretation': 'conditional on successful automatic answers and endpoint reference grade; failures are not zero error',
        'normalized_denominator_floor_kcal': 200, 'p90_method': 'linear interpolation, index (n-1)*0.9',
        'reference_grade_distribution': [{'meal_type': a, 'served': b, 'consumed': c, 'count': n} for (a, b, c), n in sorted(grades.items())],
        'routes': routes, 'paired': {'scored_meals': len(pairs['A0']), 'incompatible_assumptions': incompatible,
        'A0': metrics(pairs['A0']), 'A1': metrics(pairs['A1'])}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    try:
        report = evaluate(json.loads(args.input.read_text()))
        output = json.dumps(report, indent=2, allow_nan=False)+'\n'
        if args.output:
            args.output.write_text(output)
        else:
            print(output, end='')
        return 0
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(f'Evaluation rejected: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
