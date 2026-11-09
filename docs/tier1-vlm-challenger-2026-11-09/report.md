# Pinned VLM challenger: mean gain, failed tail guard

Keep the deployed Gemini 3.8 Flash baseline. The research-only `gemini-4-argon` challenger slightly lowered mean calorie error on ten public meal-range scans, but worsened P90 absolute error and failed the preset consideration rule. No production model or application behavior was changed by this experiment.

| Complete served estimate | Current Flash baseline | Argon challenger |
|---|---:|---:|
| Valid outputs / fixed scans | 10/10 | 10/10 |
| Calorie MAE, kcal | 185.24 | 178.98 |
| Signed calorie bias, kcal | −185.24 | −178.98 |
| P90 absolute calorie error, kcal | 385.35 | 458.35 |
| Mean normalized absolute error, floor 200 kcal | 31.48% | 30.01% |
| Mass MAE, g | 131.70 | 142.40 |
| Protein MAE, g | 17.78 | 18.22 |
| Carbohydrate MAE, g | 7.31 | 9.13 |
| Fat MAE, g | 12.35 | 11.45 |

Argon improved absolute calorie error on five scans and worsened it on five. Both models underpredicted energy and total mass on all ten. Its 6.257 kcal mean improvement did not meet the full rule: P90 worsened by 73.006 kcal. These are descriptive results, not a significance, equivalence, generalization or causal model-architecture claim.

| Reference energy slice | Scans | Flash kcal MAE | Argon kcal MAE |
|---|---:|---:|---:|
| 200–600 kcal | 6 | 129.48 | 131.96 |
| Above 600 kcal | 4 | 268.87 | 249.51 |

## Fixed comparison and scope

This uses the **entire existing ten-scan meal-range manifest**: references 274.19–920.12 kcal, at least 150 g and two reference ingredients per scan, ten distinct capture dates. No new images were downloaded or cases selected using challenger outcomes. These are already exposed development examples; independent completed plates and pretraining exposure are unknown. Ingredient count is not a gold count of visually separable foods. The cohort is not a population-representative sample or an Android accuracy study.

The original prompt (`7131abc1…`), schema (`4306216d…`), six USDA records, image bytes, US endpoint, API v1, LOW thinking, 8,192 output-token cap, 30-second timeout and one SDK attempt were held fixed. Hosted routing, sampling, weights and LOW-thinking compute semantics remain uncontrolled. Equal external settings do not isolate model weights or establish equal compute.

Source: `a2787fbbd616e57b0f4baad20499a9477313498f`. [Input manifest](../../functions/eval/tier1-public/manifest-mealrange-v1.json) SHA256: `9d7d8f2b3097d551df8ca93d35dcd800a594ce45fd97f3e7ac1d71c8653ff9e7`. [Profile](../../functions/eval/tier1-public/vlm-challenger-profile-v1.json) records source/SDK/model/probe pins. Nutrition5k attribution: Thames et al., CVPR 2021, CC BY 4.0. Previous benchmarks remain unchanged; the public inventory stays at **40 unique scans**, now with **100 food-prediction receipts across separate experiments**.

Before food inference, one owned gray non-food JPEG verified short structured-output compatibility with the existing SDK 2.19.0, exact returned Argon model and explicit `no_food`. This is not food or calorie accuracy evidence. Exactly **21 new SDK entries** were consumed: one diagnostic plus twenty food predictions. No retries, replacements, fallback models, A1 inference failures, pending cases or unattempted food cases. Both verification jobs passed before the first food request at 2026-11-09 10:31:24 UTC. A separate persistent registry reserves the two food arms and prevents restarting the closed budget in another output directory.

Only the fixed prompt/schema/catalog and one JPEG reach the inference call. Reference vectors and ingredient labels stay in offline scoring; no reference-derived preparation answers or manual corrections were substituted. This statement is supported by source-path inspection, not packet capture.

## Coverage, questions and operational measurements

A0 complete-image coverage was **0/10 in each arm** because at least one component per image lacked a defensible catalog match. Its calorie metrics remain null. This is a comparator limitation, not zero error or an overall A0/A1 ranking. Flash returned 32 components with one database match; Argon 36 with one match. Unverified estimates account for 93.69% and 93.58% of predicted energy respectively. More components do not establish better recognition; no gold missing-food audit was performed.

Flash proposed one preparation question and Argon seven, all unanswered and at most one per estimate. This is potential interaction burden, not observed user time or proof that answering would improve accuracy. SDK inference timings were median/P90 12.924/15.232 s for Flash and 16.680/20.221 s for Argon. Sequential arm order and caching confound timing; these are not phone shutter-to-result measurements. Known prompt/candidate tokens were 20,180/4,604 and 21,400/5,014. Full billed cost and thought-token completeness remain unknown.

## Verification and decision

[Canonical CI 42600067460](https://github.com/ia23a-lachnita/calorix/actions/runs/42600067460) passed on the exact source: 98 backend files / 5,354 tests, 990 Flutter tests, 44 Python tests, seventeen Node guards, TypeScript build/lint, Tier-1 analyzer and signed APK. There are two historical skips. Independent source/input review reproduced all ten reference vectors, six metadata pins, twenty original/JPEG hashes and ten byte-exact conversions without findings. The saved independent result audit reports3,932numeric comparisons(maxdifference4e-12,tolerance1e-9),68component nutrient vectors and20receipt/CSVrows withoutdiscrepancies. Its final narrative hit a usage limit after saving the audit; this limitation is recorded separately. External review and downloaded APK source/checksum/trusted signer verification are retained in [verification.json](verification.json). No new Android runtime or UI parity claim is made from this backend experiment.

The preset rule required both ten valid outputs, lower calorie MAE and normalized error, P90 no worse and no increase in failures. **It failed on P90.** Archive this candidate for this decision and keep production unchanged. The result does not prove every alternative model or prompt is unhelpful. It does rule out promoting this candidate under the rule fixed before outcomes.

This remains V7.1 Tier 1: one photograph, pinned zero-shot inference, explicit nutrient provenance, approximate served energy, optional question/corrections and local logging. No training, depth, second photo, printed reference object or public-performance claim was introduced. The separate 30-meal weighed Android pilot remains incomplete and is not replaced by public scans.

The next highest-value experiment is a paired before/after comparison of **one optional portion correction**, recording complete served-kcal error and active interaction time. The correction route already exists; actual reference-backed interactions are needed to measure its benefit and burden. Public prediction receipts cannot supply that user-time evidence. Further model changes should remain experimental until there is a concrete measured benefit.

Full-precision [case CSV](cases.csv), [summary](summary.json) and [all twenty public prediction receipts](receipts.json) preserve the denominator. Metrics use linear-interpolated P90 and normalization by `max(reference_kcal, 200)`.

Model documentation consulted: [Argon model capabilities](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-argon), [SDK and continuation guidance](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-argon). The compatibility probe establishes only the short request tested here; hosted model IDs do not provide immutable weight snapshots.
