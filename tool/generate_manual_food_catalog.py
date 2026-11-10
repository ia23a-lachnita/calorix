"""Generate pinned offline manual nutrient data; tests-first interface."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'functions/eval/tier1-public/catalog-v2.json'
TARGET=ROOT/'lib/features/tier1/manual_nutrient_catalog_data.dart'
def render(source=SOURCE):
    raise NotImplementedError('Pinned catalog generation follows behavioral RED')
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    text=render()
    if args.check:
        if not TARGET.exists() or TARGET.read_text()!=text:raise SystemExit('Manual food catalog is stale')
    else:TARGET.write_text(text)
