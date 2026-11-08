# Tier1 nutrient catalog expansion

> Execute continuously with superpowers:executing-plans; user explicitly says proceed without requiring a phone install. No repeated user plan approval. Existing ordered-worker exhaustion/native-edit exception remains applicable to continued Tier1 work; receipts retained in implementation-status.md. Mandatory MCP pre/post review remains.

**Goal:** Replace the six-record bottleneck with a traceable broader catalog and measure a revised A0/A1 baseline.
**Architecture:** Keep the current Flutter/Vertex/stateless callable architecture. Generate at most90 explicitly selected USDA SR Legacy records from a pinned6MB official CSV archive. Only the catalog and thus prompt/schema allowed IDs change. No automatic fuzzy rematching or silently fabricated database records. Reuse the20 existing public input JPEGs and existing evaluator once as a development comparison; original v1 evidence stays frozen.
**Tech stack:** Existing Python stdlib, TypeScript/Node22, Vitest and pinned Vertex SDK.
**Spec:** V7.1 and user's explicit2026-11-08 instruction to continue engineering without requiring their phone.

## Constraints and review focus

- Select broad common foods independently of reference ingredients/kcal; freeze IDs, exact descriptions, preparation states and engineering serving priors before inference. Exclude raw grain/pasta/legume/meat records; include raw produce only where routinely edible raw.
- Pinned official archive SHA b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0; source https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip,6074592B. No massive dataset download. Zip members food.csv/food_nutrient.csv/nutrient.csv, FDC IDs; this is not the historical FOOD_DES/NUT_DATA text format.
- Per100g nutrient1008 kcal/1003 protein/1004fat/1005carb grams; missing/duplicate/invalid/nonfinite/negative/unit-mismatch records must fail, never become zero. Preserve original six values; keep source/member/row digests and selected public source rows. Do not replace official energy with4/4/9 calculations.
- Preserve v1 pins/results by immutable Git source0bf1369/15d1bb5; v2 gets new catalog/prompt/schema digests. Existing deployed callable remains v1 until separately authorized deployment; no phone dependency.
- Mixed/unknown foods retain explicit unverified values; full-plate A0 coverage fails if any component is unmatched. No forced identity/preparation match just to improve coverage.
- Exactly20 maximum new SDK calls once, no retry/fallback; hidden reference labels, unanswered optional question, all failures retained. This reused set is development evidence, not a new heldout test. Report paired A1 v1/v2 cases, A0 conditional coverage/error and unverified density share. No architecture/causality/generalization claims from single stochastic runs.

## Tasks

- [x] Source parser TDD: build_tier1_catalog.py accepts archive+selection, checks source identity, exact descriptions, unique IDs and all4 units/values; emits deterministic typed catalog/source receipt. Tests rejectmissing/duplicates/invalids and prove original values preserved. Verify RED then GREEN.
- [x] Freeze general-food selection (at most90) and generate actual official records with exact per-row hashes. Integration tests prove new representative cooked pasta/protein/produce map to database densities/priors while unknown recipes remain unverified. Add or change no inference policy besides allowed records. Verify real behavioral RED then GREEN, full build/lint/focused tests.
- [ ] Pre-live source review, versioned model manifest with current digests, full Functions/Python checks; commit/push source and frozen selection before run. Keep old results immutable.
- [ ] One fresh run directory and exactly one revised20-image development comparison using unchanged JPEGs. Report successful coverage and paired error, all failures/latency/unknown cost, ingredient/energy slices and nutrient provenance; independently check all selected source values and results.
- [ ] Post-implementation/result MCP review, update pilot_report/status, commit/push clean. No stopping merely to ask user to install an APK; no new phone build needed for backend-only work.

Pre-review conversation calorix-tier1-catalog-v2-20261108, primary3.8: agree/none. Response mistakenly described historical FOOD_DES/NUT_DATA/NDB formats although proposal says FoodData Central CSV/FDC IDs; record as review response noise, not source evidence. Accept cooked-only staples; reject automatic4/4/9 acceptance threshold because official energy derivations/fibre differ. Verify exact official values/units instead.


Source stage:73records (original6+67new), selection SHA c990dd66e3273615a46ac83eb5b6a332341106f69d09d1a00847ee7b7ea79f92; current candidate digests in model_manifest.yaml. Actual parser missing-module RED then8parser/24total Python GREEN. Actual catalog missing pasta/lentils behavioralRED then26focused TypeScript GREEN. Build/lint passed. Independent pinned-ZIP audit73/73 IDs/descriptions,292/292 Decimal nutrients, all source/member/row/selection hashes and byte regeneration PASS. Reviewer found future rawquinoa/drypasta/dryoats guard gap: new3failureRED then24PythonGREEN after narrowguard repair; current73unchanged. Primary MCP source/post-implementation/pre-live exactagree/MUSTnone. Initial review's wrong historical file-format assertions corrected in same conversation; exactagreement reconfirmed. No provider fallback.

Ruling: launch full Functions suite in parallel with the bounded live comparison after source/build/lint/focused/Python and source-review gates pass; await full suite before completion claim. This keeps long unrelated regression checks running without blocking once-only measurement. Commit/push selected source/manifest before live. No inference or behavior policy change beyond catalog records/allowed IDs; no phone or deployment action. Native editing exception carried from this same Tier1 workstream's recorded exhausted routes, not a new worker substitution.
