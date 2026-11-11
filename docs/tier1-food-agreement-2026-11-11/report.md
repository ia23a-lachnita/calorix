# Fresh public accuracy comparison

The pinned specialist substantially outperformed A1 on 20 new public meals. The new food-agreement selector switched no meals and failed its accuracy-gain criterion; it is rejected without tuning on these outcomes. The existing portion gate retained a useful calorie gain and preserved the previous isolated-food fallback. These are public-dataset results, not a production change or measured Android accuracy.

| Route | Scored | MAE kcal | Median absolute kcal | P90 absolute kcal | Bias kcal | Normalized error |
|---|---:|---:|---:|---:|---:|---:|
| A1 production baseline |20/20|80.80|51.73|193.82|−36.26|26.26%|
| Full pinned specialist |20/20|32.11|9.05|94.97|−16.00|9.87%|
| Existing portion gate |20/20|46.25|28.16|132.68|−22.37|16.38%|
| New food-agreement selector |20/20|80.80|51.73|193.82|−36.26|26.26%|
| A0 serving prior + catalog |1/20|Not comparable across20|—|—|—|—|

MAE is the mean absolute served-calorie error; P90 is the linearly interpolated 90th percentile of absolute errors. Normalized error divides each absolute error by max(reference kcal,200). Error summaries use valid predictions; every missing prediction remains in the fixed coverage/failure denominator. A0 has19 catalog-coverage failures; its one valid case cannot establish a full-cohort accuracy ranking.

Full specialist MAE was60.3% lower than A1 on this cohort, median82.5% lower and P9051.0% lower. The existing gate switched9 meals:6 improved,3 worsened. It reduced MAE42.8%; it does not identify every case where the specialist is better. The new lexical rule was too restrictive and switched0/20. Its frozen >=10% MAE gain guard failed. No threshold/alias edits, alternative head substitution or reference-based winner selection followed these outcomes.

## What was actually tested

Experiment `food-agreement-v1-clean-groups`; reviewed source `1abf452b1780b27fe8dca9d68bef561e44da94cb` was committed and pushed clean before any new food inference. [Frozen protocol](protocol.md), [manifest](../../functions/eval/tier1-public/manifest-food-agreement-v1.json) and [profile](../../functions/eval/tier1-public/food-agreement-profile-v1.json) pin the cohort, code, model/runtime and limits.

Twenty distinct dates and author plate groups were sampled before inference from official Nutrition5k overhead TEST images, excluding116 previously referenced dish IDs and their104 author groups across five pinned public/development/calibration inputs. All20 images passed preparation; no failed inputs were replaced. Original weighed-ingredient/recipe-derived references were preserved. Reference meals span5.59–688.65kcal. No reference portions, calories or ingredient labels entered either model or the router.

The author's `test_clean`/group metadata excluded groups appearing in its train/val metadata. This is stronger than merely unused scan IDs, but the checkpoint does not pin a training-data revision and its base-model exposure remains unknown. These meals share the Nutrition5k source domain with specialist training. The audit also found four group IDs shared by the earlier10/20 cohorts, and two old scans not marked clean. Original errors remain unchanged; those earlier cohorts are development evidence. See the [5005-row source audit](prior-group-audit.json) and pinned [author dataset card](https://huggingface.co/datasets/shalev396/calorie-lens-data/blob/ed6c9cef52238fec71a70c51d7d9043814a78d8a/README.md).

No synthetic reference meals, new training, depth/reference-object capture, second photographs or large dataset archives were introduced. Actual weighed Android references remain0. No numerical confidence intervals or per-meal accuracy bands are claimed.

## Reuse and implementation

Reused the unchanged production A1 prompt/model/catalog and frozen SDK runner, the previously qualified ONNX specialist and its nutrient provenance, original references, scoring utilities and ECUST records. No app/backend capture, consent, editable meal, logging or manual fallback behavior changed.

Added a separate deterministic food-agreement selector with explicit fallback/reasons and unknown-mass accounting; a pinned author-group cohort preparer; an image-only qualified-runtime runner; and reproducible comparison/audit artifacts. Specific identities precede short aliases; names with unresolved alternatives or unknown residual nouns cannot count as covered foods. The rule remains available for research replay, explicitly rejected rather than selected as a default.

The specialist still uses its published Nutrition5k nutrient table and unverified remainder-density prior.252/253 core nutrient records match the pinned source; identity/amount and extended USDA fields are not verified by those matches. A1 uses its original six USDA records or explicitly unverified model densities. These are traceable but different nutrient assumptions, not an isolated test of portion geometry or identical-record nutrition. On these20 cases,4/47 A1 components matched its database;92.51% of predicted energy came from explicitly unverified densities.

## Coverage, strata and performance

Six references have one source ingredient row,14 have multiple rows. This is a source-record proxy, not verified visible-food count or a guarantee of mixed-recipe complexity.

| Source-row stratum | A1 MAE kcal | Full specialist | Existing gate | New selector |
|---|---:|---:|---:|---:|
| One row, n=6 |46.86|20.64|46.86|46.86|
| Multiple rows, n=14 |95.35|37.02|45.99|95.35|

Existing old-six ECUST mass MAE/P90 stay exactly15.18/24.95g via A1 fallback under both gates. Full specialist mass MAE there was previously29.12g, so its Nutrition5k advantage does not justify an all-food default. Fresh-six ECUST lacks A1 and calorie gold and supplies neither a hybrid nor a calorie comparison.

A1 made20 SDK invocations, returned20 valid estimates, proposed0 preparation questions, and performed0 retries/manual corrections. Input/output token counts were40360/7121. Billing cost remains unmeasured; null cost is not a free/zero-cost claim. Systematic missing/spurious-food labels were not collected; raw food lists and reference ingredients are retained for a later audit. No exhaustive visual food-identity or UI-diff inspection is claimed.

The specialist made20 successful local food forwards, no additional qualification/retry forwards. Host wall638.52s; sampled peak worker RSS1,319,378,944bytes; no resource stop. Median specialist image wall31.16s, versus A1 SDK latency12.23s. Different local/cloud execution and a shared host make these workflow observations, not matched speed or Android-latency comparisons. CPU provider only, ORT1.31.1, disabled optimization, intra2/inter1. The original qualified graph/weights and all original source pins remain unchanged.

## Verification and replay

Actual focused RED→GREEN checks preceded each new algorithm: routing14 tests, cohort5, scoring3. A subsequent partial-alias regression reproduced3 false switches before the residual-noun fix;15 route tests then passed. A hand-calculated20-row scoring test brings final pinned-runtime Python coverage to181/181 passing. All40 Node tooling tests passed. The earlier host179-test run passed with4 optional ONNX skips; the pinned final181 run had no skips. `git diff --check` passed. No new Flutter/Android build or deployment is claimed for these offline-only changes. Branch pushes do not trigger this repository's main/PR-only Verify workflow; no CI run ID is invented.

Independent host replay checked14 profile file pins, all20 actual JPEG/input tensors,20520 finite raw scalars,20428 nutrient products,405 raw-to-scored point fields and90 high-precision Decimal metric fields. The5005-row metadata projection matched the retained Parquet byte-for-byte. Audit performed0 neural calls and no visual identity classification. [Host audit](independent-audit.json).

[Lossless predictions](predictions.zip) contain all40 raw A1/specialist records, frozen A1 catalog and exact result JSON. [Complete per-case comparisons](per-case.csv), [metrics](result.json), [strata and switches](breakdown.json) and source/API/runtime receipts preserve failures and provenance. Replay offline with the pinned numerical environment:

```bash
TMPDIR=/disk/task/tmp /path/to/pinned/bin/python \
  docs/tier1-food-agreement-2026-11-11/replay.py --repo . \
  --archive docs/tier1-food-agreement-2026-11-11/predictions.zip
```

Archive replay checks numeric/provenance closure without images and reports0 images recomputed. Host mode with `--root` pointing to retained run/assets also verifies all20 input pixels/tensors. Neither mode calls a model. Fresh-checkout publication verification is recorded separately.

Antigravity primary `gemini-3.8-flash`/yolo plan, corrected-source, separate fresh-context source and actual-result reviews explicitly report agreement/no must-fixes. They reviewed supplied source/result text, not independent execution or images. The host rejected invented file links, overbroad guarantees and a partial-alias safety overclaim in an earlier response, reproduced the bug, fixed it before fresh inference and obtained corrected reviews. Numeric review is not a food-recognition accuracy audit.

## Next engineering decision

Reject this lexical selector; retain the existing portion gate as the stronger tested hybrid and full specialist as the strongest calorie estimator on these public cohorts. Neither is promoted by this report.

The next controlled experiment is post-recognition nutrient resolution with the already audited73-record USDA set, preserving exactly the same food identities/order/grams. Require explicit matching preparation; reject composites/ambiguities, retain unverified labels when unresolved, and preserve original receipts. This isolates density changes without repeating the expanded allowed-ID prompt that previously worsened MAE. Current receipts would be development data for that new hypothesis; any promising resolver needs separately frozen validation. Antigravity accepted this research direction with those constraints; implementation/promotion is not claimed. No result here establishes that density rather than portions/recognition dominates the remaining errors.
