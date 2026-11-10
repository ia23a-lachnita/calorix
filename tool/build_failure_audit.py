"""Reproduce the exposed benchmark error audit; never call inference."""
import argparse,copy,hashlib,json
from pathlib import Path
from evaluate_public_weighed import read_json,write_json,validate_bundle
from tool.failure_audit import select_extremes,diagnostic,summarize

def build(repo,index,index_sha):
 loaded={name:read_json(repo/name,digest)[0] for name,digest in index['files'].items()}
 bundle=loaded['docs/tier1-public-weighed-2026-11-10/bundle.json'];validate_bundle(bundle)
 result=loaded['docs/tier1-mass-power-2026-11-10/result.json'];first=loaded['docs/tier1-portion-calibration-2026-11-10/result.json']
 refs={c['id']:c for c in bundle['cases']}
 for name in ['functions/eval/tier1-public/portion-scale-test-v1.json','functions/eval/tier1-public/mass-power-test-v1.json']:
  for c in loaded[name]['cases']:refs[c['id']]=c
 rows=[]
 for cohort,cases in [('development40',bundle['cases']),('firstConfirmation10_nowDevelopment',first['confirmation_cases']),('newConfirmation10',result['new_confirmation_cases'])]:
  factors={c['id']:c['factor'] for c in result[cohort]['factors']}
  for c in cases:
   ref=refs[c['id']];pred=({**c['predictions']['A1']['predicted'],'massG':c['predictions']['A1']['massG']} if c.get('predictions') else c['predicted'])
   value={'id':c['id'],'cohort':cohort,'captureDate':ref['captureDate'],'reference':ref['reference'],'ingredients':ref['ingredients'],
    'predicted':pred,'factor':factors[c['id']],'inputSha256':ref['inputSha256'],'receiptSha256':c['receiptSha256'],
    'sourceImageUrl':ref['sourceImageUrl'],'rowFieldsSha256':ref['rowFieldsSha256'],'sourceMetadataFile':ref['sourceMetadataFile']}
   if pred is None:raise ValueError('Frozen audit selection requires existing successful baseline rows; do not silently drop failure')
   value['correctedErrorKcal']=pred['kcal']*value['factor']-value['reference']['kcal'];value['diagnostic']=diagnostic(value['reference'],pred);rows.append(value)
 if len(rows)!=60 or len({r['id'] for r in rows})!=60:raise ValueError('Exact60 distinct frozen benchmark rows required')
 selected=select_extremes(rows);cohorts={k:summarize([r for r in rows if r['cohort']==k]) for k in sorted({r['cohort'] for r in rows})}
 return {'schemaVersion':'failure-audit-1','sourceIndexSha256':index_sha,'scope':'exposed selected development diagnostic, no promotion/representativeness claim','all60':summarize(rows),'cohorts':cohorts,'allRows':rows,'selected10':selected,
  'pairedProbeCandidateIds':[r['id'] for r in selected[:4]+selected[-2:]],'newSdkEntries':0,'newReferenceMeals':0,'humanCorrectionBenefit':None,'foodDetectionPrecision':None,'foodDetectionRecall':None,
  'referenceGeneralFactorResidualPolicy':'4/4/9 screening only; no source rejection, rewriting or causal claim; source calories remain recipe/USDA-derived'}

def main():
 p=argparse.ArgumentParser();p.add_argument('--repo',type=Path,default=Path.cwd());p.add_argument('--index',type=Path,required=True);p.add_argument('--index-sha256',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();index,digest=read_json(a.index,a.index_sha256)
 if index['schemaVersion']!='failure-audit-inputs-1':raise ValueError('Unsupported audit index')
 for name in index['files']:
  if Path(name).is_absolute() or not (a.repo/name).resolve().is_relative_to(a.repo.resolve()):raise ValueError('Source path escapes repository')
 result=build(a.repo,index,digest);write_json(a.output,result);print(json.dumps({'cases':60,'inspectedSelection':len(result['selected10']),'newSdkEntries':0}))
if __name__=='__main__':main()
