# Calibration corpus-quality recovery design

Date: 2026-10-29. Status: reviewed offline Phase A design; implementation planning next. This describes the next **offline** stage of the approved nutrition-calibration roadmap. It does not reopen protocol v1 or authorize another inference run.

## Problem and evidence

Protocol v1 correctly halted after development. Both profiles parsed all 24 dishes, but their pooled positive-truth macro errors were 1.382305 and 1.399475 against the fixed maximum 0.5. No profile was admitted. The original reports, ledger, journal and retained lock remain unchanged.

The dominant outlier references ingredient 453, named `deprecated`. The actual official ingredient vocabulary is at the plural `metadata/ingredients_metadata.csv` path, not the singular path in the README. The retrieved 21,540 bytes hash to `87a9bbd1fd2e28f09f16305a04946ddbe31eb7d9d03686d7e2fb3d8f19f3effb`. Its entries are:

| Ingredient | ID | kcal/g | fat/g | carbohydrate/g | protein/g |
|---|---:|---:|---:|---:|---:|
| apple | 54 | 0.520 | 0.002 | 0.140 | 0.003 |
| deprecated | 453 | 0.520 | 0.002 | 0.003 | 0.140 |

The carbohydrate and protein rates are exchanged between those entries. This strengthens the annotation concern; it is not an authoritative corrected label for the dish, and no existing truth is patched. The vocabulary contains four deprecated IDs: 231, 453, 458 and 470.

The main operator viewed all 24 development photos and inspected all 48 normalized numeric summaries, not the complete original model responses or independently measured nutrition. Four photos show another food-bearing container; one has target food clipped by the image boundary. These observations do not prove the cause of any prediction error.

An offline influence diagnostic recomputed the original means and every single-case-deletion variant. Neither profile meets the numeric 0.5 limit under any single-case deletion: the minimum is 0.588602 / 0.606529 when omitting the apple. This is diagnostic arithmetic, not an accepted alternative score. Fixing one known annotation concern alone cannot establish qualification.

Primary sources: [official vocabulary](https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/metadata/ingredients_metadata.csv), [dataset description](https://github.com/google-research-datasets/Nutrition5k), [format discrepancy report](https://github.com/google-research-datasets/Nutrition5k/issues/9). Repository issues [10](https://github.com/google-research-datasets/Nutrition5k/issues/10) and [11](https://github.com/google-research-datasets/Nutrition5k/issues/11) are user reports of image/annotation concerns, not verified corrections or proof about this corpus. Their linked food images were not opened.

## Decision and alternatives

First establish a reproducible, reviewed candidate corpus without model calls. Do not spend another protocol run on unreviewed annotations. Preserve the original result as rejected and use a fresh, explicitly distinct candidate identity.

Merely stopping leaves the measurement-quality problem unresolved. Editing the apple truth or removing rows from the completed run would invalidate its preregistration. Relaxing the macro denominator or threshold after observing failure would change the question. Prompt, schema and per-item decomposition experiments require a different design; they are not part of this corpus repair.

Even a clean candidate corpus might reject the same model. This stage improves the interpretability of the next experiment; it does not promise better predictions or production readiness.

## Phase A: offline corpus preparation and qualification

### Boundaries

- Implement an opt-in offline corpus-quality command, with no provider SDK, token-count call, model client, response cache, runtime ledger, native calibration command or production write.
- Leave all existing v1 source locks, manifests, identities, CLI defaults and runtime files intact. Importing or running the new command must not acquire, release, recover or inspect the contents of a v1 runtime lock.
- Use the existing pinned two dish-metadata files and train split, plus a new raw-byte pin for the official ingredient vocabulary. Verify all source hashes before parsing. No trust-on-first-use verification mode.
- Keep sizable downloads, artifacts and logs in verified disk-backed task storage. Do not use RAM-backed `/tmp` for them.
- The output is a **candidate audit artifact**, not a calibration manifest admitted by the existing runtime. It cannot activate a model run.

### Metadata eligibility

Parse the real six fixed dish fields and repeating seven-field ingredient groups. Preserve current finite-value, positive-mass/calorie, split, duplicate and source-integrity checks.

Parse the vocabulary with its actual header and unique canonical ingredient IDs. Validate finite nonnegative rates and reject malformed or duplicate vocabulary entries as fatal source errors. A missing/malformed vocabulary never disables filtering.

Before ranking, exclude dishes containing a vocabulary-deprecated ingredient ID or an ingredient named `deprecated`, and dishes whose ingredient IDs cannot be resolved in the pinned vocabulary. Record stable typed reasons and the affected IDs. Never replace an ingredient ID, swap nutrient columns, invent a USDA label or reconstruct corrected dish totals.

Retain empty descriptive dish ingredient names when the canonical ID resolves to a valid vocabulary entry; empty names alone are not proof of bad data. Cross-source descriptive differences require an explicit audit finding rather than silent label rewriting.

### Selection and quarantine

Quarantine all 40 v1 training-manifest IDs and the existing 12 test-meal IDs. Use IDs only for quarantine: do not open the old validation or benchmark images/outputs. The old benchmark remains frozen for a possible later comparison.

Select a fresh 24-development / 16-validation candidate set using the existing component/calorie/macro bins and exact slot schedule. Rank candidates with the separately declared prefix `calorix-n5k-calibration-v2:`. This is a candidate-selection seed, not permission to use a v2 runtime.

For each slot, consider candidates in deterministic hash order within that exact stratum. Record every failed image or rejected candidate with its source identity, rank, slot, image hash when available and typed reason. Never skip to a neighboring stratum, reshuffle after seeing results, or reuse quarantined IDs. Fail preparation if a required stratum is exhausted.

### Photo quality review before inference

Prepare and display candidate images from their pinned bytes. The operator reviews every candidate without new model predictions. Freeze this checklist before beginning candidate review:

- Image contains food and the intended target container can be identified.
- No second food-bearing container is visible in the frame.
- Target food is not clipped by the image boundary or substantially occluded by another object/container.
- Visible food does not present an unresolved gross conflict with the ingredient annotation. This is a coarse consistency check, not certification of hidden ingredients, mass or nutrition.

Record `pass`, or a stable rejection reason: `no_food`, `additional_food_container`, `target_clipped`, `target_occluded`, `label_conflict`, or `qc_uncertain`. An uncertainty is retained as uncertainty and rejects that candidate; it does not become an invented corrected truth. Ordinary empty plate margins, a cropped plate edge without cropped food, or an empty neighboring container are not automatically failures.

Each record binds case ID, image SHA, checklist revision, reviewer identity and observation. The command rejects a disposition for a different image hash or an already finalized candidate. Maintain an append-only audit of decisions; correcting an operator mistake requires an explicit superseding record before finalization, never editing away the first decision. A rejected candidate advances only to the next candidate in the same frozen stratum.

This deliberately produces a **clean-scene diagnostic corpus**. It does not represent the app's full mixed-scene workload; excluding distractions can make evaluation easier. Do not claim real-world accuracy from it alone. Dish-ID disjointness also does not prove independent plates, absence of incremental-scan relatives, or absence from model pretraining; retain those limitations.

### Artifacts and command behavior

Use a separate ignored corpus-quality directory, never the v1 calibration root. Provide prepare, record-quality-decision and finalize operations. Preparation can resume its own audit from verified source/image hashes; it cannot consume inference quota or resume a calibration protocol. Network access is limited to declared public source/image downloads and is explicitly opted into. Verification of an existing candidate never substitutes changed bytes.

The final candidate artifact contains:

- Candidate-only identity, selector/checklist versions, code checkpoint and raw source/vocabulary hashes.
- Quarantined ID-list digest; exact slot order, groups, strata, ranked selected IDs and image metadata.
- Complete metadata exclusion and candidate-skip inventories, plus append-only photo decisions.
- Forty passed photo decisions and exact 24/16 partition/margin/disjointness checks.
- A declaration that zero model/token requests were made and that no calibration profile/result is certified.

Do not commit images, raw provider responses or local execution artifacts. Commit public source pins, schemas, tests and a privacy-safe audit summary. Independent Antigravity review must inspect the selected/rejected inventory and state whether photo inspection was exhaustive or sampled. Do not turn a metadata/hash review into an exhaustive visual claim.

### Tests and delivery

Use existing pure corpus/parser helpers where appropriate. Preserve original v1 defaults and byte reproduction; do not create a broad configurable protocol framework or duplicate the durable controller. The implementer chooses the small file split and explicit command syntax in the implementation plan.

Before implementation, write meaningful failing tests for vocabulary pins/format/duplicates/deprecated and unknown IDs, empty-name handling, exclusion before ranking, quarantine/disjointness, deterministic replacements, stratum exhaustion, disposition hash binding, superseding decisions, finalization with missing or rejected photos, source/image drift, and inability to touch a v1 root or invoke a provider. Test offline with tiny fixtures and injected fetch/filesystem dependencies; do not invoke mobile testing tools for this backend data task.

Use the permitted editing-worker routes and retain the authorized exhausted-route fallback, genuine RED/GREEN, independent review and source/config/evidence fingerprints. Run relevant focused tests, build/lint and the required parent verifier for source changes. A documentation-only design does not require repeating the unchanged two-hour verifier. Commit and push each bounded stage.

## Phase B: separately reviewed protocol activation

Phase A cannot issue an inference request. Once its audit is qualified, write the concrete additive v2 runtime plan against the actual source. Existing schemas, bootstrap pins, CLI, report identities and ledger admission hardcode v1: changing an environment variable, directory or manifest is insufficient and forbidden.

The next runtime design must preserve every old v1 fail-closed invariant and reject cross-version files, reports, roots, selections and receipts before a reservation/client is created. No recovery or migration of the halted v1 ledger. The unchanged production path and historical 2.5 reference remain protected.

Retain the exact Vertex 3.8/project/us/v1 provider route, LOW/MEDIUM selection, prompt/schema, frozen gates and one-pass stage structure. The proposed new run is at most 146 additional image reservations plus one separate 3.8 token count; together with the 50 v1 reservations, planned workstream consumption is 196 images. This is a proposed accounting boundary, **not an activated budget** or another 300-call allowance. Any earlier failure stops the new protocol. No 2.5 request, fallback, hidden retry entitlement or post-result curation.

The original spec's 300-call containment allowance and recorded-reason wording do not authorize replaying once-only v1 stages. The more specific implementation-plan rule requires a newly reviewed, recorded protocol version. The user's standing instruction already removes repeated plan approvals within the approved roadmap; do not invent another user-approval ceremony solely for plan paperwork. Resolve the exact version, identity, call authorization and source gates in that written runtime plan before any new model request. Deployment and production mutation still require their separate explicit authorization.

## Acceptance and remaining limits

Phase A is accepted only after reproducible metadata/selection checks, complete operator photo dispositions, independently scoped review, relevant source tests and a committed/pushed candidate audit summary. An accepted candidate is not a passing nutrition calibration. V1 remains rejected, and its validation/benchmark stages remain blocked.

Neither source-label consistency nor a photo proves precise portion mass, preparation, hidden oil, sensor accuracy, or universal food coverage. The eventual frozen benchmark remains necessary before any model-promotion claim. If the clean candidate fails, preserve that result rather than progressively removing difficult examples.

## Review record

Fresh native read-only builder check: nothing important left. Antigravity MCP gemini-3.8-flash/High, conversation calorix-corpus-repair-research-20261029, corrected explicit AGREEMENT_STATUS: agree / MUST_FIX: none, scope OFFLINE_CORPUS_RESEARCH_AND_PHASE_A_DESIGN_ONLY. Review overclaims were explicitly retracted: checksum mismatch is fatal, clean-scene selection is not representative or definitive capability evidence, influence arithmetic is not causal proof, issue9 is a user report, and vocabulary versus dish-source hashes are distinct. No review fallback or tool error. All154Functions/source,config3,canonical11 unchanged after review. This approves planning the offline tools within the standing roadmap, not activating a v2 runtime or inference budget.
