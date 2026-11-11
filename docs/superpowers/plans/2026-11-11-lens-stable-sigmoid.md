# Single stable-sigmoid export candidate

Continue the reviewed Tier1 runtime roadmap inline. No new model, training, infrastructure or product deployment. Source branch `feat/calorie-lens-onnx`, isolated worktree from published1840301; retain original checkout/untracked file. Same recorded bounded native-edit exception applies, with tests, external reviews and commit/push gates retained.

The original Dynamo graph preserved all42 served estimates within0.01kcal/macros and identical mass/discrete displays, but failed raw-v1 and endpoint-v2 on internal conditional-log-grams. Do not reclassify either failure. Standalone operator fixtures support a sigmoid-tail mechanism, not full-model first-divergence proof. The next experiment changes one arithmetic lowering, not learned weights or the mathematical estimator.

## Frozen candidate

- Explicit identity `v3-stable-sigmoid`, separate profile/modules/artifacts. Old12source pins, profile, source model and scoring/summary remain unchanged.
- Parent graph/data exact hashes from corrected Dynamo export. Exactly one `node_sigmoid` (`add_33`→`sigmoid`) becomes10 standard FP32 ONNX nodes: e=exp(-abs(x)), d=1+e, where(x>=0,1/d,e/d). No exponential-overflow domain assumption, custom kernel, precision/input/TTA/blend/weight change.
- Preserve the parent graph; hardlink unchanged external weights into a fresh candidate directory and verify bytes/SHA. ORT CPU only, optimizationNONE;2intra/1inter, no pool spinning, passiveOMP. Same six counterbalanced controls and10s pair pauses.
- ONE full-model candidate and one blank qualification. Require original strict7head bounds AND existing v2actual253decision/point guards, blank<=128s, and conservative projection `1.2*(42*ORTblank+6*68329.30435391609)+ORTblank+68329.30435391609+120000<=3600000`ms. Projection is not a runtime guarantee. Failure stops candidate without retries or tolerance changes.
- At least3.5GiB available before each worker;3GiB sampled process-tree cap/512MiB continuous reserve;900s qualification/120s idle,3600s cohort/120s idle,512MiB candidate artifacts. Watchdogs are not kernel isolation.
- Only after qualification:42ORT+6Torch food records on the SAME42public photos, plus two separately counted blank warmups. No real reference quantities in inference. Existing accuracy/transfer limitations remain; this is numerical/runtime equivalence, not a new accuracy study.
- Keep originalRawV1=FAILED, originalEndpointV2=FAILED, raw_speed_qualified=false coupled to every result. New strict-candidate and candidate-speed flags are separately named. All42/6, all head/decision/point/metric guards, clean worker exit and median of six paired ratios required. >=1.25material/>=2strong flags, never automatic production promotion.

## Execution

- [x] Preplan review: initial resource/dynamic-range/lineage feedback resolved; amended agree/MUST_FIXnone.
- [x] Five tests observed missing-module RED before installing new modules, then GREEN; parent/initializer preservation, identity rejection, budget, numerical fixture with extremes/Inf/NaN/Torch roundtrip. Runtime156/156, system156with3optional skips; Node40/40.
- [x] Primary final + fresh-context whole-feature source review; preserve exact source hashes; commit/push clean before full-model candidate execution. Both agree/MUST_FIXnone; actualfixture/fullruntime156/156 andNode40pass.
- [ ] Single qualification, retain rejection if any. If accepted, run all48 planned food records, no outcome-based exclusions or edits while active.
- [ ] Independently replay all raw records, decisions, nutrient/gram calculations, Decimal metrics, input hashes and timing; actual-result review.
- [ ] Publish all evidence/limits, fresh-checkout replay, tracking update, commit/push. No app/backend build claim for headless-only changes.
