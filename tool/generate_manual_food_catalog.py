"""Generate pinned offline manual nutrient data; tests-first interface."""
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'functions/eval/tier1-public/catalog-v2.json'
TARGET=ROOT/'lib/features/tier1/manual_nutrient_catalog_data.dart'
def render(source=SOURCE):
    raw=source.read_bytes()
    expected='bad3d924253513d093728351436cdcc6e099caba25eead2cae24778ea35ff178'
    if hashlib.sha256(raw).hexdigest()!=expected:raise ValueError('Pinned manual catalog source mismatch')
    value=json.loads(raw)
    if value['version']!='usda-sr-2018-tier1-20261108-v2' or len(value['records'])!=73:raise ValueError('Unexpected manual catalog')
    text=raw.decode().strip()
    if "\'\'\'" in text:raise ValueError('Unsafe raw literal')
    return "// Generated from the pinned public catalog; run tool/generate_manual_food_catalog.py.\n"+"const manualFoodCatalogDataSha256='"+expected+"';\nconst manualFoodCatalogRawJson=r\'\'\'"+text+"\'\'\';\n"
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    text=render()
    if args.check:
        if not TARGET.exists() or TARGET.read_text()!=text:raise SystemExit('Manual food catalog is stale')
    else:TARGET.write_text(text)
