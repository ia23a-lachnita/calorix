# Nutrition Analysis Correctness and Real-Image Evaluation Design

Date: 2026-08-31
Status: approved for implementation
Branch: `fix/scan-photo-flow-viewer`

## 1. Purpose

Calorix must treat nutrition analysis as a measured product capability, not a prompt that appears to work. This design introduces a real-image evaluation system and corrects the package/portion semantics used by meal, barcode, and label scans.

The governing product rule is physical and predictable:

- A meal scan means the complete visible meal portion.
- A barcode or nutrition-label scan means the complete physical package represented by the scan.
- A single bottle defaults to that whole bottle.
- An outer multipack barcode defaults to the whole multipack.
- Manufacturer serving size is reference metadata, never the silent default logged amount.
- If Calorix cannot establish the package amount, it must require Review instead of silently treating per-100 g/ml values as a serving.

The evaluation work follows test-driven development. Deterministic tests first prove dataset integrity, arithmetic, parsing, normalization, scoring, confidence calibration, persistence, and aggregation. An opt-in live benchmark then measures the same production adapter/parser/normalizer on real images. Live failures establish a baseline before production behavior changes, and the same cases prove whether later changes improve the actual flow.

## 2. Existing Research and Implementation

The original external research file is referenced by the repository as `C:\Users\xursc\Downloads\deep-research-report.md`; it is not present in the current Linux workspace. Its recommendations were triaged into:

- `docs/superpowers/plans/2026-07-07-v1-usable-app.md`
- `docs/superpowers/specs/2026-07-10-calorix-production-correctness.md`
- `docs/superpowers/plans/2026-07-17-complete-handoff-screens-product-quality.md`

Implemented foundations include scan-mode routing, distinct meal/barcode/label prompts, Open Food Facts v3 lookup, structured nutrition parsing, canonical `base*` nutrition fields, Atwater calculation, confidence-based Review routing, and emulator/unit contract tests.

The foundations are incomplete:

1. Production `processEntry` is still revision `processentry-00001-xaj`, deployed 2026-07-07, while only `aiChat` has received the newer source.
2. Current Open Food Facts normalization writes `_100g` values directly as one logged `base*` amount.
3. The Open Food Facts client omits package quantity/unit, serving metadata, and normalized serving values.
4. Barcode mode passes an image and `scanMode=barcode`; it does not currently extract and persist `rawBarcode` on the client.
5. The model response has no declared nutrition basis or amount/unit fields.
6. Atwater mismatch is stored but does not affect confidence or Review routing.
7. No real-image nutrition corpus, scorer, baseline report, or release-quality gate exists.

## 3. Proven Vitamin Well Failure

The observed Vitamin Well Reload scan is a required regression case.

- Client scan mode: barcode.
- Visible package: one 500 ml bottle.
- Visible barcode: `7350042716380`.
- Official truth: 17 kcal and 4.2 g carbohydrate per 100 ml; 85 kcal and 21 g carbohydrate for the 500 ml bottle; protein and fat zero.
- Deployed legacy result: `Vitamin Well Recover (Flavored Water)`, 9.6 kcal, 4 g carbohydrate, 0 g protein, 0 g fat, confidence 0.95, detected weight 500.
- Open Food Facts currently returns `product_not_found` for this barcode.

This is not a Flutter display-only defect. The deployed worker ignored scan mode, used the generic meal prompt, stored a high-confidence nutrition estimate with no basis, and did not calculate the visible package total. Current repository source improves routing but still lacks package-total semantics for both known and unknown barcodes.

## 4. Canonical Nutrition Contract

### 4.1 Basis and amount

Every analyzed entry declares what its canonical nutrition values describe.

```ts
export type NutritionBasis = 'portion' | 'package' | 'per100g';
export type NutritionUnit = 'portion' | 'g' | 'ml';

export interface NutritionReference {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  amount: number;
  unit: NutritionUnit;
}
```

The persisted `baseKcal`, `baseProtein`, `baseCarbs`, and `baseFat` always describe exactly one declared `nutritionAmount` in `nutritionUnit`:

- meal: `nutritionBasis=portion`, `nutritionAmount=1`, `nutritionUnit=portion`;
- known package: `nutritionBasis=package`, `nutritionAmount=<whole package quantity>`, `nutritionUnit=g|ml`;
- quantity-unknown product: `nutritionBasis=per100g`, `nutritionAmount=100`, `nutritionUnit=g|ml`, always `needs_review` until the user supplies the package/consumed amount.

Per-100 values remain separately persisted as reference density where available. Serving size and serving nutrients remain reference metadata only.

### 4.2 Consumed amount

For new entries, displayed and aggregated nutrition is derived from the user's consumed amount relative to the canonical reference amount:

```text
consumptionRatio = consumedAmount / nutritionAmount
displayed nutrient = base nutrient * consumptionRatio
daily-log nutrient = sum(base nutrient * consumptionRatio for complete entries)
```

Package entries default `consumedAmount` to the whole package amount. Meal entries default it to one portion.

An optional `packageUnitCount` and `unitAmount` allow an outer six-pack to default to all six while still letting the user choose one unit exactly. The existing 0.25-step `servingMultiplier` cannot represent values such as `1/6`; it becomes legacy read compatibility rather than the canonical amount model.

Historical entries remain readable:

- missing `nutritionBasis` defaults to `portion`;
- missing `nutritionAmount` defaults to `1`;
- legacy `servingMultiplier` maps to a compatible consumed amount/ratio;
- no production backfill occurs without a separately approved dry run and deployment/data-mutation review.

### 4.3 Review reasons

Analysis returns structured reasons rather than only a confidence number. Initial reasons include:

- `package_quantity_missing`
- `package_unit_unsupported`
- `barcode_unconfirmed`
- `nutrition_basis_ambiguous`
- `nutrition_arithmetic_mismatch`
- `atwater_mismatch`
- `model_schema_invalid`

Any basis/quantity ambiguity prevents automatic completion. A confidence score cannot override a required Review reason.

## 5. Open Food Facts Normalization

The Open Food Facts client requests and validates:

- product name and barcode;
- `quantity`, `product_quantity`, `product_quantity_unit`;
- `serving_size`, `serving_quantity`, `serving_quantity_unit`;
- `nutrition_data_per`;
- normalized `_100g` and `_serving` energy/protein/carbohydrate/fat;
- selected product and nutrition image URLs for evaluation manifests only.

Normalization is deterministic:

1. Accept only finite, non-negative nutrition values and supported `g`/`ml` package units.
2. Treat normalized `_100g` fields as per 100 g for solids or per 100 ml for liquids, matching the product quantity unit.
3. When whole package quantity and complete per-100 nutrients are valid:

   ```text
   package nutrient = per100 nutrient * packageQuantity / 100
   ```

   Store whole-package totals with `nutritionBasis=package`, regardless of manufacturer serving size or number of servings.
4. Preserve serving metadata as reference only.
5. When package quantity is missing, invalid, or unsupported, return a declared per-100 draft below the completion threshold and require Review. Do not invent a package size.
6. Preserve decimal precision through storage and aggregation; round only for UI presentation.

An outer multipack whose Open Food Facts `product_quantity` represents the total package quantity therefore logs the entire multipack by default.

## 6. Vision Result and Server Validation

Meal, barcode-fallback, and label prompts return a structured basis-aware response. The server never trusts model arithmetic directly.

For barcode/label results the model supplies:

- observed barcode when readable;
- observed package amount and unit;
- nutrient basis observed on the label (`per100g`, `package`, or declared portion);
- raw nutrient density/totals;
- confidence and candidates;
- detected items/bounds as already supported.

The server recomputes normalized totals from the declared basis and amount. It rejects or routes to Review when:

- required fields are missing or non-finite;
- units cannot be normalized;
- reported totals disagree materially with recomputed totals;
- calories and macros have a gross Atwater inconsistency;
- a barcode cannot be confirmed by the product source;
- package amount is not visible/established.

An unknown barcode can still yield a useful 85 kcal package draft for Vitamin Well, but it remains `needs_review` because the product database did not confirm it. Review shows the calculated whole-package amount instead of a misleading high-confidence 9.6/17 kcal result.

## 7. Evaluation Corpus

### 7.1 Manifest

A versioned manifest records every case:

- stable case ID and scan mode;
- source dataset and source object/product ID;
- image role and fetch location;
- image SHA-256, dimensions, and media type;
- expected basis, amount, unit, calories, and macros;
- optional barcode/package unit count;
- case-specific tolerance class;
- license/attribution identifier;
- whether the case is public or private.

Dataset-fetch failures, checksum drift, missing truth fields, and model-quality failures are reported as distinct categories.

### 7.2 Meal cases

The initial public meal set uses a small, stratified subset from the official Nutrition5k RGB test split. Nutrition5k provides real meal imagery with dish-level calories, mass, fat, carbohydrate, and protein under CC BY 4.0.

The first baseline targets at least 12 manually inspected cases spanning:

- lower and higher calorie portions;
- simple and mixed dishes;
- different masses and ingredient counts;
- available overhead RGB images whose metadata passes plausibility checks.

Images are fetched from immutable dataset object paths and verified against pinned SHA-256 values. The repository stores attribution and manifest truth; fetched image bytes live in a git-ignored cache unless a small public fixture is explicitly approved for commit.

### 7.3 Product and label cases

The initial public product/label set uses at least eight Open Food Facts products selected for complete package quantity, unit, nutrition, and image fields. It includes:

- single bottles/cans;
- a multipack/outer package;
- a solid package;
- products with serving metadata different from total package quantity;
- nutrition-label images with complete normalized truth.

Open Food Facts database snapshots/derived fixtures carry the required ODbL attribution. Live source drift is checked separately from the pinned evaluation truth.

### 7.4 Vitamin Well private case

The user's Vitamin Well image is a mandatory private regression fixture. Before use it is re-encoded with EXIF and device metadata removed, assigned a new SHA-256, and stored only in a private git-ignored fixture location. The public manifest contains no user identifier, cloud path, EXIF, or raw image. A private overlay manifest supplies the local path/hash during authorized evaluation.

## 8. Evaluation Metrics and Gates

### 8.1 Deterministic gates

Routine CI runs no live model calls. It must pass:

- manifest schema and unique-ID validation;
- dataset checksum/integrity fixtures;
- unit conversion and package arithmetic;
- Open Food Facts normalization for single, multi, serving-different, and missing-quantity products;
- model response schema parsing;
- server-side arithmetic recomputation;
- Review-reason precedence over confidence;
- scorer correctness against hand-derived expected metrics;
- persistence and aggregation scaling exactly once;
- legacy Firestore deserialization.

Behavior changes follow RED/GREEN TDD: each new contract first fails for the intended production gap, then passes with the minimal implementation.

### 8.2 Live model metrics

The opt-in live runner records, per case:

- schema/parse success;
- predicted and expected basis/amount/unit;
- exact barcode match where applicable;
- absolute and relative calorie error;
- absolute and relative macro error;
- Atwater discrepancy;
- completion versus Review decision;
- whether a catastrophic error was incorrectly marked complete;
- latency, model ID, prompt hash, code SHA, and dataset hash.

Aggregate reports include median/percentile calorie error, macro weighted error, parse rate, basis accuracy, barcode accuracy, Review rate, and high-confidence catastrophic-error count.

Package arithmetic and deterministic known-barcode normalization are strict. Label OCR/model cases use small label-rounding tolerances. Meal estimates use wider absolute/relative tolerances and aggregate reporting because a single image does not uniquely determine mass/composition.

The non-negotiable safety gate is calibration: a catastrophic nutrition miss must never be high-confidence `complete`. Initial catastrophic calorie error is defined as below 0.5x or above 2.0x truth. Thresholds and tolerance classes are versioned in the manifest/scorer, not hidden in prompts.

### 8.3 Stochastic execution

Routine pushes do not fail because a model response jitters. Live evaluation is manual or scheduled and produces JSON plus Markdown artifacts.

Release-enforced evaluation runs repeated samples and evaluates the median result for numeric quality while still requiring every sample to satisfy schema/privacy/safety rules. It exits nonzero for dataset integrity failure, schema failure, a safety/calibration regression, or explicit enforced quality thresholds. A baseline comparison names model or prompt changes rather than silently moving thresholds to fit a result.

Reports never embed image bytes, credentials, access tokens, private cloud paths, or unredacted provider diagnostics.

## 9. Runner Architecture

The evaluation runner calls the same production boundaries used by `processEntry`:

```text
manifest case
  -> verified image bytes / supplied raw barcode
  -> production GenAI adapter (when vision is required)
  -> production response parser
  -> production OFF client/normalizer
  -> production basis/arithmetic validator
  -> pure scorer
  -> per-case + aggregate report
```

It does not initialize Firebase Admin, write Firestore, upload Storage objects, send FCM, create users, or invoke the deployed function. Network activity is limited to authorized read-only dataset/product fetches and opt-in model inference.

The runner supports:

- deterministic fixture mode with injected model/OFF responses;
- live baseline mode;
- release enforcement mode;
- case/mode filters for focused debugging;
- resumable cache keyed by dataset/image/model/prompt hash;
- explicit failure accounting without silently skipping missing cases.

## 10. Flutter Amount Controls

After the backend contract is proven, Flutter displays the declared basis and amount:

- `500 ml bottle` rather than ambiguous `1x serving`;
- `6 × 250 ml · whole pack` for known multipacks;
- `full visible portion` for meals;
- `100 g reference · amount required` for quantity-unknown products.

The default consumed amount is the entire scanned package/portion. The user can choose an exact amount or exact unit count. Multipack controls compute exact fractions such as `1/6` without forcing them through 0.25 increments. UI formatting shows friendly unit counts/amounts while persistence retains sufficient floating-point precision.

Review must make correction fast when the analysis is uncertain. It presents one-tap suggestions only when they can be derived from observed or catalog metadata, for example `Whole package · 500 ml`, `1 serving · 250 ml`, `1 unit`, or `1 of 6 · 250 ml`, followed by `Custom amount`. Each suggestion displays its source (`package label`, `serving metadata`, or `pack metadata`); suggestions are mutually exclusive amount choices, not independent multipliers. A missing or contradictory package amount leaves every suggestion unselected, and Calorix requires the user to choose or enter an amount before confirmation. Manufacturer serving remains an offered reference choice and never silently replaces the whole-package default.

Review confirmation writes the chosen consumed amount and transitions the entry to `complete` atomically. An unresolved per-100 draft cannot enter daily totals.

## 11. Captured-Still Barcode Extraction

Barcode extraction remains one-photo behavior. It is a later bounded stage after the backend/eval contract:

1. User selects Barcode and takes one still photograph.
2. The app analyzes that captured still for a barcode.
3. If found, `rawBarcode` is persisted with the durable upload metadata.
4. The server performs the product lookup before invoking vision nutrition fallback.
5. If not found/readable, the same photo continues through the reviewed barcode-fallback path.

No continuous camera-stream scanning, auto-capture loop, or video analysis is introduced by this design.

## 12. Delivery Stages

Each meaningful stage updates `docs/implementation-status.md`, completes focused verification and mandatory review, then commits and pushes before the next stage.

### Stage A — deterministic evaluation foundation

- Dataset manifest/schema, licensing, privacy rules.
- Pure scorer and hand-derived unit tests.
- Dataset fetch/cache integrity tooling.
- Open Food Facts snapshot fixtures.

### Stage B — pre-change live baseline

- Opt-in production-boundary runner.
- Nutrition5k, Open Food Facts, and private Vitamin cases.
- Baseline JSON/Markdown with exact model/prompt/dataset/code hashes.
- No production behavior or deployment change.

### Stage C — Functions package/basis contract

- RED tests for whole-package normalization, quantity-unknown Review, Vitamin arithmetic, Atwater/calibration, serialization, retry preservation, and aggregation.
- Extend Open Food Facts parsing, nutrition schema/prompts, analysis orchestration, and persisted fields.
- Re-run deterministic tests and live benchmark; compare with baseline.

### Stage D — Flutter basis and exact amount contract

- Backward-compatible `FoodEntry` parsing.
- Exact consumed amount/unit-count model and aggregation compatibility.
- Food Detail/Review amount controls and tests.

### Stage E — captured-still barcode extraction

- RED/GREEN client tests for one-photo barcode extraction and durable `rawBarcode` propagation.
- Known/unknown/unreadable barcode cases.

### Stage F — integration and device evidence

- Full Functions/emulator/Flutter verification.
- Source-matched Test Android APK.
- Authorized Samsung meal/barcode/label proof, including Vitamin regression.
- No completion claim from fixture/unit evidence alone.

### Stage G — separately gated deployment

- Fresh project/function/rules preflight.
- Separate explicit confirmation for the exact `processEntry` deployment and any associated rules/index changes.
- Deploy only reviewed scope.
- Authenticated live Vitamin scan verifies 500 ml -> 85 kcal draft/result, correct Review behavior when barcode remains unconfirmed, no duplicate scaling, privacy-safe logs, and no unrelated function mutation.

## 13. Non-Goals

- Continuous/live camera barcode scanning.
- New model providers.
- Commercial nutrition databases.
- Recipe decomposition or depth/LiDAR portion estimation.
- Production data backfill.
- Silent migration or deletion of historical entries.
- Treating visual ui-diff results as nutrition correctness evidence.

## 14. Acceptance Criteria

The workstream is complete only when:

1. The deterministic scorer and normalization suites have witnessed valid RED then GREEN behavior.
2. The corpus is checksum-pinned, licensed/attributed, and the private Vitamin image has no EXIF/device metadata.
3. Whole-package normalization passes for single and multipack cases; serving metadata never changes the default package total.
4. Quantity-unknown or unconfirmed products cannot become high-confidence complete without user Review.
5. Vitamin Well produces an 85 kcal, 21 g carbohydrate whole-bottle draft/result for 500 ml, not a per-100 or serving surrogate.
6. Meal accuracy and macro metrics are reported over a real official-test image subset with no skipped failures hidden from accounting.
7. A catastrophic nutrition miss cannot pass as high-confidence complete.
8. Flutter displays and persists the declared amount/basis and supports exact multipack fractions.
9. Full local/hosted verification, source-matched APK, and physical-device evidence pass.
10. Any production deployment is separately approved, narrowly scoped, reviewed, and live-proven.

## 15. External Review

Antigravity MCP conversation `calorix-nutrition-eval-20260830`, model `gemini-3.6-flash`, reviewed the initial proposal and returned `AGREEMENT_STATUS: revise` with four required clarifications: deterministic package normalization, decoupled client barcode scope, deterministic CI versus stochastic live benchmarks, and dataset licensing/EXIF hygiene.

After the user established whole scanned package as the default, the revised contract formalized whole-package arithmetic, Review fallback, serving-as-reference, later exact multipack amount controls, and Stages A–G. The continued review returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. Its two accepted recommendations are legacy Flutter defaults for missing basis/amount and friendly precision-safe formatting for fractions such as `1/6`.

After user approval, the Review correction flow was clarified to offer source-labeled one-tap choices derived from package, serving, and pack metadata plus a custom amount, while leaving contradictory or uncertain choices unselected. The same conversation reviewed that amendment and the detailed Stage A/B plan and returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `QUESTIONS: none`.
