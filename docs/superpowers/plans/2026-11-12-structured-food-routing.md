# Structured food routing implementation plan

> Execute inline under the approved V7.1 roadmap. Use the test-first and executing-plans workflow, permitted editing workers, Antigravity source/result review, and one independent final branch review. No repeat user approval pause.

**Goal:** Replace fragile free-text routing in an evaluator-only candidate with explicit visual food category and abstention fields, while preserving the deployed estimator.

**Architecture:** A Node CommonJS adapter extends the original A1 response schema per component, validates/strips routing fields before existing reconciliation, and retains the raw estimate beside a qualified single-item-prior counterfactual. Categories do not depend on display-name aliases. A single photo request returns both nutrition inventory and routing metadata; there is no second text-classifier request.

**Tech stack:** Existing Node22, Google SDK2.19.0, original frozen A1 engine/model/catalog/parser; no dependencies or production changes.

**Spec:** User's V7/V7.1 execution directive: one photo, pinned A1, approximate traceable nutrients, minimal effort, measurable changes. This bounded implementation implements an evaluation candidate, not the full roadmap or a production accuracy claim.

## Constraints and review focus

- Preserve prior `predicted-portion-prior-stress-v1` source/budget/output exactly. No retries, reset or replacement calls.
- Canonical categories bread/bun/doughnut/fried_dough_twist/mooncake/sachima/other/uncertain. Explicit mapping to author typo `fired_dough_twist` only in offline qualification; never alter source labels.
- Component routing fields: category; count one/multiple/partial/unknown; form bread_slice/whole_item/partial/unknown; variant standard/modified/uncertain; abstainReason null or nonempty text <=120characters. Strict local validation; wire schema omits Vertex-unsupported length/numeric bounds.
- Reject malformed model output rather than invent routing defaults. Existing no-food failure stays explicit. Require one component, one observed item, expected form, standard variant, no abstention, class-compatible preparation and qualified prior before scaling.
- Intrinsic frying of doughnuts/twists and intrinsic mooncake filling are not modifications. Hidden contents remain uncertain where consequential; classification is a model estimate, not verified physical evidence.
- Priors must have >=3 fitting groups independently inspected as comparable intact single units. Generic old serving priors are ineligible; cut/broken/decorated/ambiguous training items are excluded with receipts. No arbitrary mass-ratio caps or source test-label fitting.
- Preserve raw inventory, names, densities, nutrient sources, preparation question and original provenance. Scale only grams and nutrient totals; add separate approximate-prior receipt/review flag. Reject answered/corrected inputs and malformed prior maps.
- All42six-class ECUST portions have been exposed. Replays/qualification are development only, never fresh independent validation. Source counts, prepared hashes and actual observations remain separate from model predictions.
- Any bounded live qualification needs a separately reviewed frozen profile, clean pushed source, canonical one-use budget, pending receipts, explicit photo consent and one-attempt SDK configuration. Fresh accuracy comparison remains blocked until suitable independent portions are qualified.

## Tasks

- [x] Implement `tool/structured_food_routing.cjs` and `tool/structured_food_routing.test.cjs`: tests/stubs RED14/GREEN14, additional prototype/negated preparation RED2/GREEN16, fresh-peer numerical scaling regression RED2/27 then GREEN27includingrunner. Covers malformed/missing metadata, arbitrary names, intrinsic frying/filling, multiple/partial/uncertain units, incompatible preparation, unqualified/NaN prior, sources/originals, single dispatch/model drift/HTTP504. Final87Node/250Pythonpass; functionsbuildpass.
- [x] Independently qualify22fitting images; record hashes and image-only limits privately; enable only classes with >=3qualified groups. Bread4/doughnut3/mooncake4/sachima3 =>14fit groups; buns0/twists2 unavailable. Bun/twist007uncertain, not proven cut/broken. No hidden-recipe claim. All20old evaluation IDs excluded from fitting.
- [ ] Review actual source, run appropriate full Node/Python checks, commit/push source. Build/test a bounded qualification runner only after its specific plan review. Any live cases are known-source engineering checks with raw/counterfactual receipts; no reported calorie or fresh-data accuracy gain.
- [ ] Independent final branch review, actual-result review, public opaque evidence/private report, status updates, clean commit/push. Report actual limits and next experiment; no merge/deployment/default change.

## Review record

Runner addendum same conversation primary3.8/yolo agree/MUST_FIXnone: exactly3known-development cases bread004/doughnut003/mooncake001; new profile/budget `structured-routing-qualification-v1`, no retries/resume/oldregistry changes. Require clean pushed source/sourcepins/input hashes/qualifiedpriors/frozen bundle; pendingreceipts before single SDK request; receivedHTTP504halts/unknownfalse, genericunknownfailureunknowntrue. Reject reviewer's contradictory 504unknowntrue recommendation, durable-powerloss implication for ordinary writeFileSync, and localstringvalidation-as-token-limit claim. SDK output cap remains8192. Only engineering wiring/abstention qualification, no freshaccuracy/screen/promotion. No originalA1 versus changedschema comparison without separate paired calls.

Actual source review initially green but missed subnormal-mass numeric bug caught by fresh peer. Genuine RED/GREEN fixed nonfinite/nonpositive scaling and output validation. Corrected source amendment primary3.8/yolo agree/MUST_FIXnone, no general language-negation robustness/powerlossdurability/integrity guarantees. Fresh final amendment verifies23currentpins/privatehashes/fixturecallback and no Critical/Important issue. Full backend Vitest suite remains running at source-freeze preparation; do not report it passed yet. No SDKcalls yet.

Pre-design conversation `calorix-structured-routing-20261112`, primary gemini-3.8-flash/yolo. First review had must-fix feedback and inapplicable Dart/retry/classes/blanket fried suppression/uncalibrated ratio suggestions; not counted green. Corrected exact-design review agree/MUST_FIXnone. Preserve author `fired_dough_twist` source spelling; new canonical category has explicit mapping. Reject reviewer wire maxLength advice (actual Vertex incompatibility), malformed-output-as-fallback wording (strict decoding rejects), and unsupported volumetric claims. No new model/deployment approved.
