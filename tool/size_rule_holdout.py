"""Held-out check of one size rule on meals the project has never scored.

The rule under test is fixed here, before any new photo is fetched:
    if the model's calorie estimate is >= 400 kcal, multiply it by 1.4.
It was found on Nutrition5k meals that were picked to include big plates, so
it needs meals drawn without looking at size, from more than one source.

    python3 tool/size_rule_holdout.py prepare OUT   # pick meals, fetch photos
    python3 tool/size_rule_holdout.py run OUT       # one model call per photo
    python3 tool/size_rule_holdout.py score OUT     # compare against weights

Sources (both weighed, neither is a phone photo of a home or restaurant meal):
  n5k  Nutrition5k overhead scans, uniform random over all dishes with a photo
  nv   NutritionVerse-Real, every pictured dish not used before, one view each
Meals already used anywhere under ~/.local/share/calorix-* are left out.
"""
import csv
import hashlib
import io
import json
import random
import re
import statistics as st
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

THRESHOLD_KCAL = 400
FACTOR = 1.4
SEED = 'calorix-size-rule-holdout-20261116'
N5K_COUNT = 150
N5K = 'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/'
SHARE = Path.home() / '.local/share'
NV_OLD = SHARE / 'calorix-cross-dataset-20261111'
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))


def rule(kcal):
    return kcal * FACTOR if kcal >= THRESHOLD_KCAL else kcal


def used_ids():
    """Every Nutrition5k / NutritionVerse meal id named in earlier project work."""
    n5k, nv = set(), set()
    for root in SHARE.glob('calorix-*'):
        for file in root.rglob('*'):
            parts = file.relative_to(root).parts
            if len(parts) > 7 or {'node_modules', '.git', 'tmp', 'build', '.fvm', 'venv'} & set(parts):
                continue
            if file.suffix not in ('.json', '.csv') or not file.is_file() or file.stat().st_size > 8 << 20:
                continue
            if 'holdout' in str(file) or file.name in ('dish-groups.csv', 'nv-files-all.json', 'nutritionverse-files.json'):
                continue
            if file.name.startswith(('nutritionverse_dish_metadata', 'updated-manual-dataset-splits', 'dish_metadata')):
                continue
            text = file.read_text(errors='ignore')
            n5k.update(re.findall(r'dish_1[0-9]{9}', text))
            nv.update(re.findall(r'nv-dish-[0-9]+', text))
    return n5k, nv


def fetch(url, limit=8 << 20):
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('file larger than expected')
    return data


def to_jpeg(data):
    from PIL import Image, ImageOps
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB')
    out = io.BytesIO()
    image.save(out, 'JPEG', quality=85)
    return out.getvalue()


def prepare(out):
    out.mkdir()
    (out / 'photos').mkdir()
    used_n5k, used_nv = used_ids()
    rng = random.Random(SEED)
    cases = []

    # Nutrition5k: official totals, both cafeterias, no size or content filter
    # beyond "has an overhead photo and a positive weight and energy".
    dishes = []
    for name in ('dish_metadata_cafe1.csv', 'dish_metadata_cafe2.csv'):
        for line in fetch(N5K + 'metadata/' + name, 16 << 20).decode().splitlines():
            f = line.split(',')
            if f[0].startswith('dish_') and float(f[1]) > 0 and float(f[2]) > 0:
                dishes.append((f[0], float(f[1]), float(f[2])))
    dishes = sorted(set(dishes))
    pool = [d for d in dishes if d[0] not in used_n5k]
    rng.shuffle(pool)
    skipped = 0
    for dish, kcal, mass in pool:
        if sum(c['source'] == 'n5k' for c in cases) >= N5K_COUNT:
            break
        try:
            png = fetch(N5K + 'imagery/realsense_overhead/' + dish + '/rgb.png')
        except Exception:
            skipped += 1  # no overhead scan published for this dish
            continue
        (out / 'photos' / (dish + '.jpg')).write_bytes(to_jpeg(png))
        cases.append({'id': dish, 'source': 'n5k', 'referenceKcal': kcal, 'referenceMassG': mass})

    # NutritionVerse-Real: all remaining pictured dishes, one seeded view each.
    from tool.transfer_dataset import parse_nv_csv, associate_images
    from tool.prepare_transfer_eval import download_file
    listing = json.loads((NV_OLD / 'research/nv-files-all.json').read_text())
    meta_path = NV_OLD / 'qualification/nutritionverse_dish_metadata3.csv'
    metadata = parse_nv_csv(meta_path.read_text(encoding='utf-8-sig'))
    splits = list(csv.DictReader(io.StringIO(
        (NV_OLD / 'qualification/updated-manual-dataset-splits.csv').read_text(encoding='utf-8-sig'))))
    source_rows = {'nv-dish-' + str(int(r['dish_id'])): r
                   for r in csv.DictReader(meta_path.open(encoding='utf-8-sig'))}
    for dish in sorted(associate_images(metadata, splits, listing), key=lambda r: r['id']):
        if dish['id'] in used_nv:
            continue
        view = rng.choice(dish['images'])
        (out / 'photos' / (dish['id'] + '.jpg')).write_bytes(to_jpeg(download_file(view, 8 << 20)))
        row = source_rows[dish['id']]
        # 17 source rows give "near-whole-chicken" the nutrients of a granola
        # bar (480 kcal/100 g). Those references are wrong; flag, do not fix.
        suspect = any('near-whole-chicken' in str(v).lower() for v in row.values())
        cases.append({'id': dish['id'], 'source': 'nv', 'view': view, 'suspectReference': suspect,
                      'referenceKcal': dish['reference']['kcal'], 'referenceMassG': dish['reference']['massG']})

    manifest = {'rule': {'thresholdKcal': THRESHOLD_KCAL, 'factor': FACTOR}, 'seed': SEED,
                'excludedEarlier': {'n5k': len(used_n5k), 'nv': len(used_nv)},
                'n5kPool': len(pool), 'n5kWithoutOverheadPhoto': skipped, 'cases': cases}
    for case in cases:
        case['photoSha256'] = hashlib.sha256((out / 'photos' / (case['id'] + '.jpg')).read_bytes()).hexdigest()
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print({s: sum(c['source'] == s for c in cases) for s in ('n5k', 'nv')}, 'skipped', skipped)


def run(out):
    """One call per photo with the app's own model route; no retries."""
    (out / 'receipts').mkdir(exist_ok=True)
    cases = json.loads((out / 'manifest.json').read_text())['cases']

    def one(case):
        receipt = out / 'receipts' / (case['id'] + '.json')
        if receipt.exists():
            return
        subprocess.run(['node', 'lib/tier1-cli.js', '--image', str(out / 'photos' / (case['id'] + '.jpg')),
                        '--meal-id', case['id'], '--output', str(receipt), '--cloud-consent', 'tier1-v1'],
                       cwd=REPO / 'functions', capture_output=True, timeout=120)

    with ThreadPoolExecutor(4) as pool:
        list(pool.map(one, cases))
    print(len(list((out / 'receipts').glob('*.json'))), 'receipts for', len(cases), 'photos')


def load(out):
    rows = []
    manifest = json.loads((out / 'manifest.json').read_text())
    for case in manifest['cases']:
        receipt = out / 'receipts' / (case['id'] + '.json')
        kcal = None
        if receipt.exists():
            for p in json.loads(receipt.read_text()).get('predictions', []):
                if p.get('route') == 'A1' and p.get('status') == 'ok':
                    kcal = p['served_kcal']
        rows.append({**case, 'predictedKcal': kcal})
    return rows


def summary(label, rows):
    rows = [r for r in rows if r['predictedKcal'] is not None]
    if not rows:
        return None
    raw = [abs(r['predictedKcal'] - r['referenceKcal']) for r in rows]
    new = [abs(rule(r['predictedKcal']) - r['referenceKcal']) for r in rows]
    touched = [(a, b) for r, a, b in zip(rows, raw, new) if r['predictedKcal'] >= THRESHOLD_KCAL]
    rng = random.Random(SEED + label)
    deltas = []
    for _ in range(4000):
        pick = [rng.randrange(len(rows)) for _ in rows]
        deltas.append(st.mean(new[i] for i in pick) - st.mean(raw[i] for i in pick))
    deltas.sort()
    p90 = lambda v: sorted(v)[int(0.9 * (len(v) - 1))]
    result = {
        'meals': len(rows), 'maeRaw': round(st.mean(raw), 1), 'maeRule': round(st.mean(new), 1),
        'maeChangePct': round((st.mean(new) - st.mean(raw)) / st.mean(raw) * 100, 1),
        'maeChange95': [round(deltas[100], 1), round(deltas[3899], 1)],
        'p90Raw': round(p90(raw), 1), 'p90Rule': round(p90(new), 1),
        'biasRaw': round(st.mean(r['predictedKcal'] - r['referenceKcal'] for r in rows), 1),
        'biasRule': round(st.mean(rule(r['predictedKcal']) - r['referenceKcal'] for r in rows), 1),
        'touched': len(touched), 'touchedBetter': sum(b < a for a, b in touched),
        'touchedWorse': sum(b > a for a, b in touched),
        'worstNewMiss': round(max((b - a for a, b in touched), default=0), 1),
    }
    print(label, json.dumps(result))
    return result


def score(out):
    rows = load(out)
    failed = [r['id'] for r in rows if r['predictedKcal'] is None]
    clean = [r for r in rows if not r.get('suspectReference')]
    results = {'failedCalls': len(failed),
               'all': summary('all', clean),
               'n5k': summary('n5k', [r for r in clean if r['source'] == 'n5k']),
               'nv': summary('nv', [r for r in clean if r['source'] == 'nv']),
               'nvIncludingSuspectReferences': summary('nv+suspect', [r for r in rows if r['source'] == 'nv'])}
    (out / 'result.json').write_text(json.dumps(results, indent=1) + '\n')
    with (out / 'cases.csv').open('w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['id', 'source', 'suspect_reference', 'reference_kcal', 'predicted_kcal', 'rule_kcal'])
        for r in rows:
            p = r['predictedKcal']
            w.writerow([r['id'], r['source'], int(bool(r.get('suspectReference'))), r['referenceKcal'],
                        '' if p is None else p, '' if p is None else round(rule(p), 2)])


if __name__ == '__main__':
    {'prepare': prepare, 'run': run, 'score': score}[sys.argv[1]](Path(sys.argv[2]))
