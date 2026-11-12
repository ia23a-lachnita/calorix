# Predicted-label portion-prior size-stress experiment

> Continue inline under the approved roadmap. Preserve test-first edits, editing-worker routes and Antigravity source/result review. No new user approval gate between tasks.

**Goal:** Test whether a typical-serving mass prior helps when the food class comes from A1 rather than author annotations, across deliberately varied portion sizes.

**Architecture:** Reuse the original frozen one-photo A1 engine. Fit six class medians on22 ECUST portion IDs; evaluate20 disjoint IDs. A deterministic exact-name policy uses only A1's recognized component name. Unsupported/multiple-component estimates retain A1. A separate author-class oracle remains evaluation-only.

**Spec:** V7.1 A0/A1 and conditional portion adaptation; existing oracle-box study. This is known-source development, not a new independent dataset or untouched validation.

## Fixed constraints

- Official SimpleFood45 access is blocked by its expired TLS certificate after verified intermediate-chain completion. Do not disable TLS or pretend those data were acquired. Complete independent work on the already-qualified ECUST source.
- Existing42portion IDs/6fully-edible classes, same pinned source/photos. Evaluation quotas bread3/bun4/doughnut5/fired_dough_twist4/mooncake2/sachima2; fitting counts4/4/4/3/4/3. Select each class's minimum/maximum author mass, then seeded SHA-ranked remaining IDs. This is a size-stress distribution, not representative sampling. All views of evaluation IDs excluded from fitting.
- All42images/labels were previously prepared; freeze new selection/input hashes before new A1 outputs, not before first-ever image access. Preserve all source labels and old experiments.
- Fit medians only on22fitting IDs. Prediction receives original A1 estimate, frozen alias policy and fitting priors only: no author class/weight/ID, filename, coin, boxes or other references. One recognized component is not proof of one physical piece; this is a generic serving-prior assumption, never observed piece count.
- Exact full-name normalized aliases only; abstain on unsupported/plural/compound food names and multi-component estimates. Reject review's invented unsafe aliases (`shahefen pastry`, `caramel treats`, filled `baozi`); do not widen after model outputs. Frozen typical-serving provenance remains explicitly approximate.
- Reuse original model/prompt/schema/catalog/LOW/8192/30s/one-attempt engineb0ba28a. At most20foodSDK calls, zero retries/replacements/fallback models/probe calls. Canonical Git-common-dir one-use budget, pending receipt before each SDK entry; auth/quota/model/prompt drift halts. No deployment or production mutation.
- Candidate preserves identity/preparation/nutrient densities and scales mass/totals through existing `fuse_mass`. Original parsed inventory/receipt retained; do not claim original SDK response bytes if unavailable. No answered preparation or manual correction enters comparison.
- Report A1, operational prior with counted A1 fallback, matched-only coverage plus same-pair A1, and separately marked author-class oracle. All20denominators/failures; mass MAE/bias/median/P90/normalized absolute error floor50g; routing coverage, source-label agreement and min/middle/max strata. No defensible per-portion calorie reference: mass endpoint only.
- Fixed screen: >=10% operational MAE gain; nonworse median/P90/normalized error/absolute bias/estimate coverage; nonworse MAE in min/middle/max strata. No automatic promotion or confidence intervals; new learned weights/depth/second photos/marker insertion out of scope.

## Tasks

- [x] Freeze split/policy/priors/input receipts and exact cached JPEGs; qualify source and preserve blocked-source evidence.
- [x] Tests-first `tool/predicted_portion_prior.py` / Python tests: split disjointness/min-max roles, policy collision/unknown abstention, no label/reference dependence, component/density/receipt invariants, incomplete-status refusal, failure/routing denominators and correct screens.
- [x] Tests-first bounded Node runner `tool/run_portion_prior_a1.cjs` / Node tests: image-only projection, canonical single-use20budget, pending receipts, no retries/systemic halt, source/model/hash/runtime and consent guards. Reuse frozen bundle and photo validation; keep all old source files/profiles unchanged.
- [ ] Source review, full appropriate Python/Node tests, commit/push clean; read-only ADC/model readiness, then exactly one bounded run. Reconcile candidates offline; independent source/input/Decimal audit and result review. Commit/push evidence and a truthful decision.
- [ ] Answer coin/ArUco question from actual saved photos/spec/official OpenCV documentation. Correct prior over-broad reference-object conclusion: previous study did not test ArUco/ChArUco, volume reconstruction or the proposed coded-marker design.

## Reviews

Pre-method `calorix-predicted-prior-stress-20261112`, gemini-3.8-flash/yolo agree/MUST_FIXnone on supplied method only. Reject invented seed syntax, unsafe alias table, "deployed" and bomb-calorimetry wording. Use the explicit source protocol and author case-reference availability, not an elevated medical standard. Marker-scope consultation `calorix-marker-scope-clarification-20261112` green; reject reviewer wording claiming the prior mass-only experiment tested/proved volume estimation.
