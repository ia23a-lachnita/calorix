# Known-diameter cue on six weighed portions

Adding the documented **25 mm coin diameter did not improve mean portion-mass error**. Both arms had MAE15.18g: four predictions were unchanged, one improved by5g and one worsened by5g. This rejects this simple prompt addition for promotion. It neither validates nor rules out calibrated geometry. The product remains unchanged.

| Mass measure | Neutral | Diameter cue |
|---|---:|---:|
| Valid food predictions |6/6|6/6|
| Mean absolute error |15.18g|15.18g|
| Median absolute error |13.00g|12.40g|
| P90 absolute error |24.95g|23.25g|
| Bias (prediction−reference) |+11.45g|+11.45g|
| Model response median |9.44s|9.60s|

P90 is a descriptive interpolated quantile of six portions, without confidence/significance/population-accuracy claims.

| Portion | Reference g | Neutral g | Cue g | Change in absolute error g |
|---|---:|---:|---:|---:|
|bread005|26.4|35|35|0|
|bun006|78.3|110|110|0|
|doughnut006|66.2|55|55|0|
|fired_dough_twist006|40.2|55|55|0|
|mooncake004|41.8|60|55|−5|
|sachima004|33.4|40|45|+5|

## Source and treatment

[Original-author ECUSTFD repository](https://github.com/Liang-yc/ECUSTFD-resized-/tree/59603e70c99807af46df9af3c2c507995fdd0029), immutable59603e70c99807af46df9af3c2c507995fdd0029. Citation: Yanchao Liang and Jianhua Li (2017), *Computer vision-based food calorie estimation: dataset, method, and experiment*, arXiv:1705.07632. README documents25mm coin and research use/citation; no mirror license is assumed. Original photos/XML/XLS/third-party code are not redistributed. Manifest retains URLs/hashes and factual grams.

The XLS explicitly labels weight(g); ambiguous volume(mm^3) values were ignored. **No calorie reference exists**, so no calorie/macro accuracy is scored. Weighing calibration/uncertainty and edible-vs-gross details are unverified. Six bare baked foods were visually screened as edible-compatible, avoiding apparent peel/core/wrappers.

Before photos/predictions, one portion per fixed class and one officialTEST top photo were SHA256-ranked using `calorix-reference-scale-v1|ID-or-stem`. Selection was reproduced from original test/tree/XLS metadata. Host actually inspected all6photos; one apparent food plus coin each, consistent with annotation object counts. Some scenes include scale/ruler edges, without an observed legible measured-weight display. No absolute leakage guarantee; public-image foundation-model exposure/physical-portion split independence unknown.

The same original JPEG bytes and visible coin occur in BOTH arms. Only explicit25mm/use-scale information differs: this is not coin-presence ablation, calibrated reconstruction, mixed-meal or Android validation. Labels/IDs/reference grams/volume/reference nutrient targets never enter the SDK payload. Original six-record nutrient catalog remains in both base prompts.

Model gemini-3.8-flash, SDK2.19.0, f5af422 engine, schema4306, Vertex calorix-xurschnell USrep v1, LOW thinking,8192output,30s,one attempt, provider-default temperature/media. Exact prompt hashes/order in `functions/eval/tier1-public/reference-scale-protocol-v1.json`. Bread/doughnut/mooncake neutral-first; bun/twist/sachima cue-first. Preparation questions unanswered.

## Evidence and reproducibility

Source ba36c2c7fa068010e98a504c200c8ca10eb4ccf0 was committed/pushed clean before the sole canonical reference-scale-cue-v1 claim. Completed13entries: one owned blank(no food),12validfood predictions,0failures/unknown-inflight. Registry CLOSED; no retries/fallback/resume/reset/replacements.

Earlier source3ccd338 local preflight refused BEFORE registry/output/SDK: Python symlink resolution bypassed the task venv/xlrd. Retained `preflight-refusal.json` records the exact failure/0calls; fixed entry path/regressionRED→GREEN/actual6referencepreflightPASS. No inference retry.

103Python/30NodePASS, including new4Python/6Node observedRED→GREEN. Original source/photos/XML/hashes/selection/gram joins verified with task xlrd2.0.2. All12raw outputs independently redecoded through f5: component lists/mass/nutrients/inventory/questions/failures matched. Decimal34fields matched within1e−9; published offline replay byte-exact. Verification receipts/scripts retained. Scripts contain this host's bundle paths; adapt them after reconstructing the same engine. Existing unchanged5TS core qualifies under CI42811800401, without a new app/native/device claim.

Tokeninput12228→12414; reportedtotal13798→14589. Thought fields present1/6→3/6, missing not inferred. Cost unknown/null. Model latency is not phone shutter-to-result. Twelve new food predictions on6newECUSTportions, separate from80Nutrition5k scans(20TRAIN+60benchmark/development); combined164food prediction requests are not164meals. Androidweighed0.

MCP3.8/yolo preplan/source/fresh-contextsource/Python-entryfix reviews agree/MUST_FIX none. Actual-result review also agree/MUST_FIX none. External review inspected source/text, not photos. Reviewer XML-scene/fsync/zero-leakage/rights guarantees not adopted. No review-provider fallback or automatic approval rejection.

```bash
python3 -m tool.evaluate_reference_scale --experiment docs/tier1-reference-scale-2026-11-10 --output /absolute/new/result.json
python3 -m unittest discover -s tests -p 'test_*.py'
TMPDIR=/absolute/disk-backed/task-tmp node --test tool/frozen_public_eval.test.cjs tool/reference_scale.test.cjs
```

## Decision

Neither simple supplementary-view input nor a known-diameter prompt produced a mean-error gain in these small probes. No accuracy improvement is deployed. Next candidate: controlled one-photo HIGH-versus-LOW thinking inference, keeping media configuration identical on weighed calorie-reference meals. Verify API support, freeze cases/settings/budget before inference; measure error and added latency/tokens. [Official thinking documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking) lists HIGH and LOW for3.8Flash, and SDK2.19.0 exposes both. Holding media configuration fixed avoids assuming that explicitHIGH media is above the existing provider default. This tests another baseline configuration without new capture steps. It is a hypothesis, not an improvement claim. Calibrated geometry remains unevaluated.

Review overstatements of hypothesis falsification, measured calorie gold, guaranteed upstream-drift elimination and whole-plate independence were rejected. Weighed ingredient masses/recipe-derived calories and matched configuration do not establish those claims.
