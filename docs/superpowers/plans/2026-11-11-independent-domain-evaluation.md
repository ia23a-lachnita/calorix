# Independent-domain evaluation implementation plan

> Execute inline using the existing editing-worker route contract and standing native fallback. No renewed user plan approval: this continues the explicitly approved cross-dataset comparison. Antigravity gates remain required.

**Goal:** Measure A1 and the pinned specialist on previously unused, physically distinct meals outside the specialist's documented training sources, without changing the app default.

**Architecture:** Add dataset-generic evaluation adapters beside the frozen Nutrition5k tools. Reuse the original A1 engine, qualified local graph, nutrient provenance, decoding and metric utilities. Keep original references and every failure; separate end-to-end model comparisons from a matched-identity/nutrient mass-only arm.

**Tech stack:** Existing Python/Pillow/numpy/ONNX runtime; existing Node22/locked SDK/compiler. No new service, model, training or mobile change.

**Spec:** V7.1 sections B, E, H; latest user instruction prioritizes an independent-domain public comparison before adopting Lens.

## Constraints

- NutritionVerse-Real v2 is only a candidate until the user's project purpose is compatible with its CC BY-NC-SA licence or separate permission exists. No protected labels/images ingested before that decision. Synthetic owned fixtures and public metadata listings are sufficient for independent tooling work.
- Pin metadata/schema, dataset version, source/derived image hashes, model/runtime/prompt/schema and source before inference. No zero-pretraining-exposure claim.
- Select20 distinct physical dishes by seeded SHA256 rank and one ranked view per dish. Cross-check filenames against official listing and split CSV and dish IDs against unique metadata rows. No class/vocabulary or outcome filtering.
- Positive finite kcal/mass; nonnegative finite macros; booleans/NaN/Inf, duplicate/missing IDs and unsafe paths fail explicitly. Preserve labels; do not impose an exact Atwater equality or silently correct source errors.
- At most20 new A1 SDK calls and20 local food forwards; no retries or reference-derived preparation answers. Errors remain in all-attempt coverage; systemic failures halt new calls.
- Full Lens uses its own nutrient assumptions. The mass-only arm retains A1 identities/proportions/nutrient records; compare those as different questions. No candidate adoption or claim of Android accuracy from this screen.
- All old source/profile pins and deployed A1 remain unchanged. Large files/tmp stay in verified ext4 task storage; no whole1.126GB dataset download or data redistribution.

## Tasks

- [x] **Adapter — `tool/transfer_dataset.py`, `tests/test_transfer_dataset.py`.** Tests/stub RED first. Implement strict label parsing, exact published image/split/metadata association, stable dish/view selection, image-only projection, and fixed-denominator A0/A1/Lens/mass-fusion/old-gate metrics. Rank `(sha256(seed+'|dish|'+canonical_id), canonical_id)` then `(sha256(seed+'|view|'+filename), filename)`. Test shuffled input, duplicate IDs, repeated views, unknown dishes, missing/invalid numbers, traversal and invalid prediction coverage.
- [x] **Generic A1 runner — `tool/run_transfer_a1.cjs`, associated Node tests.** Reuse the unchanged frozen bundle builder/verifier and original inferTier1/estimateA0. Validate committed generic manifest/profile, consent, clean pushed source and image hashes. Write pending receipts before each SDK invocation; retain original outputs and explicit partial failures. Test boundaries without network calls.
- [x] **Generic local runner — `tool/run_transfer_lens.py`, Python runner tests.** Reuse exact qualified graph/preprocessing/decoding/session options; whitelist only safe ID/image-path/image-hash per case. Validate original source/runtime/graph/data pins and sampled resource limits. No measured labels in worker inputs.
- [ ] **Source/rights/data qualification.** After compatible purpose, inspect actual metadata headers/units and reference quality, freeze cohort before fetching individual photos, then freeze source/profile before model outputs. Keep source data/derived photos private and publish only permitted aggregate evidence. If rights/access/reference data remain unresolved, finish all independent tooling and record the exact blocker.
- [ ] **Reviewed execution and evidence.** Focused RED→GREEN, full Python/Node suites, primary and fresh-context source review, commit/push clean, run once, independent arithmetic/hash audit and result review; commit/push bounded results. Primary metrics: complete-meal served-kcal MAE/bias/median/P90/normalized error(floor200), coverage/failures, mass/macros, available mixed-dish strata, latency/tokens/cost status. No confidence intervals or post-test rule tuning.

## Review focus

1. Multi-view photos of one plate must never inflate independent meal count.
2. Source split labels may be view-level; they do not establish physical grouping or unseen pretraining.
3. Unknown foods remain in the full-meal error, including numeric specialist outputs with no displayed named ingredients.
4. Sparse A0 database coverage must not become a misleading full-cohort accuracy comparison.
5. Licence-purpose, access or schema failures cannot be worked around by silently changing datasets, labels, models or samples.

Pre-plan review `calorix-nutritionverse-transfer-implementation-20261111`: initial3 concrete clarifications accepted (macro bounds, cross-source mapping, canonical ranking); amended primary3.8/yolo explicitly `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. Actual schema inspection and rights purpose remain pending; fixtures do not qualify real labels.

Source stage:202/202 pinned-runtime Python and51/51 Node tests pass; all88 previous artifact pins remain unchanged. Pure mass counterfactual now has None-on-failure coverage separately from the explicit A1-fallback mass workflow. Canonical pre-image selection receipt is SHA-bound to final private manifest/profile; both runners compare profile bytes to HEAD even if working changes are hidden. Primary corrected review and separate fresh-context clean review green on supplied source only. Actual dataset schema/reference qualification and model execution remain pending project-purpose clarification.
