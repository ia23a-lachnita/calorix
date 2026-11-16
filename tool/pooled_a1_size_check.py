"""Pool the published per-meal A1 predictions and check a single size factor.

Reads only tables already in docs/; makes no model call. Run from the repo root:
    python3 tool/pooled_a1_size_check.py
The factor is fitted on all meals but one and scored on the one left out.
"""
import csv
import statistics as st

rows = {}
for r in csv.DictReader(open('docs/tier1-mass-power-2026-11-10/cases.csv')):
    rows[r['scan_id']] = (float(r['reference_served_kcal']), float(r['raw_a1_served_kcal']))
for r in csv.DictReader(open('docs/tier1-food-agreement-2026-11-11/per-case.csv')):
    if r['route'] == 'A1' and r['predictedKcal']:
        rows.setdefault(r['id'], (float(r['referenceKcal']), float(r['predictedKcal'])))
meals = list(rows.values())
FLOOR = 150  # estimates below this are left alone: small meals already read high


def report(label, pairs):
    errors = [p - r for r, p in pairs]
    absolute = sorted(abs(e) for e in errors)
    print(f'{label:26s} n={len(errors)} MAE={st.mean(absolute):6.1f} median={st.median(absolute):6.1f} '
          f'bias={st.mean(errors):6.1f} low={sum(e < 0 for e in errors)}/{len(errors)}')


def factor(train):
    return st.median(r / p for r, p in train if p >= FLOOR and r > 0)


report('raw', meals)
for low, high in ((0, 200), (200, 500), (500, 10000)):
    report(f'raw, {low}-{high} kcal', [(r, p) for r, p in meals if low <= r < high])
held_out = []
for i, (r, p) in enumerate(meals):
    k = factor(meals[:i] + meals[i + 1:])
    held_out.append((r, p * k if p >= FLOOR else p))
report('one factor, held out', held_out)
print('factor on all meals:', round(factor(meals), 3))
