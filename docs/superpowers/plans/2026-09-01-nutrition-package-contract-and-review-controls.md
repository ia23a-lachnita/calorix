# Nutrition Package Contract and Review Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make package, portion, per-100, consumed-amount, Review, persistence, aggregation, and UI behavior describe the same physical nutrition amount.

**Architecture:** Functions owns canonical nutrition normalization, blocking review reasons, persisted fields, and daily aggregation. Flutter parses the backward-compatible contract and lets users select an exact derived amount without persisting presentation choices; its repository performs the single-document Review transition. The evaluation adapter calls those production normalizers, while its opt-in post-change comparison remains public-only until the private fixture is provisioned.

**Tech Stack:** TypeScript, Zod, Firebase Functions/Admin and Firestore rules emulator, Vitest, Dart/Flutter, Riverpod, Cloud Firestore, FVM, Android test APK workflow.

**Spec:** `docs/superpowers/specs/2026-08-31-nutrition-analysis-evaluation-design.md`

## Global Constraints

- `baseKcal`, `baseProtein`, `baseCarbs`, and `baseFat` describe exactly `nutritionAmount` in `nutritionUnit`; `nutritionBasis` is `portion|package|per100g`.
- Persist established `consumedAmount`, optional integer `packageUnitCount` and `unitAmount`, and nested `per100Reference` / `servingReference` maps with `{kcal,proteinG,carbsG,fatG,amount,unit}`.
- Use ordered `reviewReasons`: `package_quantity_missing`, `package_unit_unsupported`, `barcode_unconfirmed`, `nutrition_basis_ambiguous`, `nutrition_arithmetic_mismatch`, `atwater_mismatch`, `model_schema_invalid`.
- New aggregation uses only `consumedAmount / nutritionAmount`; legacy entries map missing canonical fields to `portion/1/portion` and `consumedAmount = nutritionAmount * servingMultiplier` exactly once.
- Keep client `rawBarcode`, model-read barcode, and confirmed catalog barcode distinct. Routine tests use fixtures only; live comparison is opt-in and public-only (20/0), with no private image fabrication.
- No deployment, production data mutation, or rule deployment belongs to this plan. Firestore rules changes are emulator-tested only.
- The approved nutrition spec supersedes `.claude/design.md`'s quarter-step rule only for canonical package amounts. Legacy entries retain the existing quarter-step presentation.
- Antigravity conversation `calorix-nutrition-package-contract-20260902` is the required cumulative pre-implementation review for Tasks 1–10; before any GREEN implementation, record its `AGREEMENT_STATUS: agree` / `MUST_FIX: none` verdict and re-review if the contract changes. Each substantive bounded task obtains its stated post-task review before commit; Tasks 2, 4, and 6 must also obtain their explicit post-task review, and Task 11 performs the cumulative final review.
- Every task records RED/GREEN evidence, updates status, commits, and pushes before the following task. Do not stage `.mcp.json` or `.nutrition-eval`.

## File Map

- `functions/src/nutrition-contract.ts` — canonical nutrition/reference/reason/scaling/arithmetic helpers.
- `functions/src/off-client.ts`, `functions/src/package-nutrition.ts` — expanded OFF parsing and strict package/multipack normalization.
- `functions/src/nutrition.ts`, `functions/src/analyze-entry.ts`, `functions/src/retry-analysis.ts` — vision validation, entry persistence, retry preservation, push status.
- `functions/src/aggregation.ts`, `functions/src/index.ts`, `firestore.rules` — canonical totals, callable mapping, backward-compatible rule validation.
- `functions/src/nutrition-eval/live-adapter.ts` and tests — production-normalizer evaluation and public-only post-change baseline comparison.
- `lib/shared/models/food_entry.dart`, `lib/shared/repositories/food_entry_repository.dart` — Dart contract parsing, exact scaling, atomic Review confirmation.
- `lib/features/food_detail/*`, `lib/features/review/*`, `lib/features/manual/*` — exact amount display/editing and Review amount selection.

---

### Task 1: Define the shared Functions nutrition contract and exact scaling

**Files:**
- Create: `functions/src/nutrition-contract.ts`
- Create: `functions/test/nutrition-contract.test.ts`
- Modify: `functions/src/aggregation.ts`
- Modify: `functions/test/aggregation.test.ts`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Produces `NutritionBasis`, `NutritionUnit`, `NutritionReference`, `ReviewReason`, `CanonicalNutritionInput`, `LegacyNutritionInput`, `NutritionDraft`, `consumptionRatio(entry)`, `scaleCanonicalNutrition(entry)`, `orderedReviewReasons(reasons)`, and `atwaterMismatch(kcal, proteinG, carbsG, fatG)`.
- `CanonicalNutritionInput` has all-or-none `nutritionBasis`, positive finite `nutritionAmount`, `nutritionUnit`, and optional positive finite `consumedAmount`; `LegacyNutritionInput` has none of those canonical keys and optional finite nonnegative `servingMultiplier`. Any partial, malformed, or canonical-without-consumed input throws `NutritionContractError` during scaling rather than falling back to legacy arithmetic.
- `NutritionDraft` is `{baseKcal:number;baseProtein:number;baseCarbs:number;baseFat:number;nutritionBasis:NutritionBasis;nutritionAmount:number;nutritionUnit:NutritionUnit;consumedAmount?:number;packageUnitCount?:number;unitAmount?:number;per100Reference?:NutritionReference;servingReference?:NutritionReference;reviewReasons:ReviewReason[];rawBarcode?:string;modelBarcode?:string;confirmedBarcode?:string}`. A draft is unresolved and non-aggregatable when `consumedAmount` is absent; only a complete canonical tuple plus consumed amount is accepted by scaling/aggregation.
- `atwaterMismatch` is `abs(kcal - atwater) > max(50, 0.20 * max(kcal, atwater, 1))` where `atwater = 4*proteinG + 4*carbsG + 9*fatG`.

- [x] **Step 1: Write RED contract/scaling tests**

```ts
expect(scaleCanonicalNutrition({ nutritionBasis: 'package', nutritionAmount: 500, nutritionUnit: 'ml', consumedAmount: 250, baseKcal: 85 })).toMatchObject({ kcal: 42.5 });
expect(consumptionRatio({ baseKcal: 100, servingMultiplier: 1.5 })).toBe(1.5);
expect(() => consumptionRatio({ nutritionBasis: 'package', baseKcal: 85 })).toThrow(NutritionContractError);
expect(orderedReviewReasons(new Set(['atwater_mismatch', 'barcode_unconfirmed']))).toEqual(['barcode_unconfirmed', 'atwater_mismatch']);
```

- [x] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/nutrition-contract.test.ts test/aggregation.test.ts`

Expected: FAIL because canonical contract helpers and consumed-amount aggregation do not exist.

- [x] **Step 3: Implement the minimal shared helpers**

```ts
export function consumptionRatio(entry: CanonicalNutritionInput | LegacyNutritionInput): number {
  if (hasAnyCanonicalKey(entry)) {
    if (!hasValidCanonicalTuple(entry) || !isPositiveFinite(entry.consumedAmount)) throw new NutritionContractError();
    return entry.consumedAmount / entry.nutritionAmount;
  }
  return entry.servingMultiplier ?? 1;
}
```

Use `servingMultiplier` only in the no-canonical-key branch and make `aggregation.ts` call `scaleCanonicalNutrition`; a persisted per-100 safe draft cannot enter aggregation until Review establishes `consumedAmount`.

- [x] **Step 4: Verify GREEN and contract review**

Run: `cd functions && npx vitest run test/nutrition-contract.test.ts test/aggregation.test.ts && npm run build && npm run lint`

Expected: PASS; ordered reasons, legacy one-time scaling, and Atwater predicate are deterministic. Request Antigravity review before committing because this is the shared data contract.

- [x] **Step 5: Record, commit, and push**

Update status with RED/GREEN/review evidence. Commit `Define canonical nutrition scaling`, push `origin/fix/scan-photo-flow-viewer`, and verify remote equality.

### Task 2: Expand OFF parsing and normalize packages/multipacks deterministically

**Files:**
- Modify: `functions/src/off-client.ts`
- Create: `functions/src/package-nutrition.ts`
- Modify: `functions/test/off-client.test.ts`
- Create: `functions/test/package-nutrition.test.ts`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `OffProduct` gains `productQuantity?: {amount: number; unit: 'g'|'ml'}`, `servingReference?: NutritionReference`, `per100Reference?: NutritionReference`, and `nutritionDataPer?: '100g'|'serving'`; every reference has finite nonnegative nutrients, positive finite amount, and unit `g|ml`. `per100Reference` remains named per-100 even for liquid `ml` data; its canonical basis is still `per100g` with amount 100.
- `normalizeOffPackage(product): NutritionDraft` returns package totals when complete quantity is `g|ml`; otherwise a `per100g/100` draft with `consumedAmount` absent and a blocking quantity reason.
- `parseMultipackQuantity(text): { packageUnitCount?: number; unitAmount?: number; inferredTotal?: number }` accepts only whole positive count/unit values; a disagreement with structured quantity adds `nutrition_basis_ambiguous`.

- [ ] **Step 1: Write RED OFF/package tests**

```ts
expect(normalizeOffPackage(bottle500)).toMatchObject({ nutritionBasis: 'package', nutritionAmount: 500, baseKcal: 85, consumedAmount: 500 });
expect(normalizeOffPackage(missingQuantity).reviewReasons).toEqual(['package_quantity_missing']);
expect(normalizeOffPackage(conflictingSixPack).reviewReasons).toContain('nutrition_basis_ambiguous');
expect(normalizeOffPackage(structured330WithReliableSixBy330)).toMatchObject({ nutritionAmount: 1980, packageUnitCount: 6, unitAmount: 330, consumedAmount: undefined, reviewReasons: ['nutrition_basis_ambiguous'] });
```

- [ ] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/off-client.test.ts test/package-nutrition.test.ts`

Expected: FAIL because OFF lacks reference fields and package normalization/multipack parsing is absent.

- [ ] **Step 3: Implement strict parse and normalization**

Fetch only product name/barcode, quantity/product quantity/unit, serving fields, `nutrition_data_per`, and normalized nutrient fields. Multiply complete per-100 references by full package quantity/100; retain serving reference without using it as default. For reliable `6x330` text conflicting with structured `330`, use inferred outer `1980` for canonical package amount and base totals, preserve count/unit, add `nutrition_basis_ambiguous`, omit `consumedAmount`, and force Review rather than auto-completing. When multipack inference is unreliable, use the safe per-100 draft. Reject non-finite nutrients and unsupported units into ordered reasons.

- [ ] **Step 4: Verify GREEN**

Run: `cd functions && npx vitest run test/off-client.test.ts test/package-nutrition.test.ts && npm run build && npm run lint`

Expected: PASS with no HTTP call in tests; package totals, safe per-100 drafts, and strict multipack disagreement are covered. Request Antigravity post-task review before committing because OFF parsing and package-default semantics change together.

- [ ] **Step 5: Record, commit, and push**

Commit `Normalize package nutrition`, push, and record the focused result and remote equality.

### Task 3: Validate basis-aware vision output and recompute server nutrition

**Files:**
- Modify: `functions/src/nutrition.ts`
- Modify: `functions/src/analyze-entry.ts`
- Modify: `functions/test/nutrition.test.ts`
- Modify: `functions/test/analyze-entry.test.ts`
- Modify: `functions/test/nutrition-eval/fixtures/model-responses.ts`
- Modify: `functions/test/nutrition-eval/runner.test.ts`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `parseNutritionResponse(response, scanMode)` strictly requires raw nutrient fields, declared basis/amount/unit, observed package amount/unit, model barcode, candidates, and declared per-100 or package values needed to recompute arithmetic; old fixture JSON is updated rather than accepted through compatibility mode.
- `normalizeVisionNutrition(parsed, rawBarcode, confirmedBarcode): NormalizationResult` recomputes package totals. `NormalizationResult` is either `{kind:'draft'; status:'complete'|'needs_review'; draft: NutritionDraft}` or `{kind:'error'; status:'error'; failureCode:'model_schema_invalid'; reviewReasons:['model_schema_invalid']}`; callers never treat an error result as canonical nutrition.

- [ ] **Step 1: Write RED vision/arithmetic tests**

```ts
expect(normalizeVisionNutrition(vitaminVision, '7350042716380', undefined)).toMatchObject({ kind: 'draft', status: 'needs_review', draft: { baseKcal: 85, baseCarbs: 21, consumedAmount: 500, reviewReasons: ['barcode_unconfirmed'] } });
expect(normalizeVisionNutrition(badPortionAmount)).toMatchObject({ kind: 'draft', draft: { reviewReasons: expect.arrayContaining(['nutrition_arithmetic_mismatch']) } });
expect(normalizeVisionNutrition(unusableVision).status).toBe('error');
```

- [ ] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/nutrition.test.ts test/analyze-entry.test.ts`

Expected: FAIL because parser prompts omit basis/amount and server code trusts model totals.

- [ ] **Step 3: Implement schema, prompt, and recomputation**

Require `portion` amount `1`, `per100g` amount `100`, and package observed/declaration agreement within `max(1 unit, 1%)`. Recompute package values from declared raw per-100 density or package totals, add `nutrition_arithmetic_mismatch` or `atwater_mismatch`, retain reported calories, and force Review for every blocking reason. Keep raw, model, and confirmed barcodes separate; update runner fixtures/tests to prove strict schema results remain deterministic.

- [ ] **Step 4: Verify GREEN and review**

Run: `cd functions && npx vitest run test/nutrition.test.ts test/analyze-entry.test.ts && npm run build && npm run lint`

Expected: PASS; Vitamin fixture data is synthetic and contains no private image. Request Antigravity review for prompt/schema/arithmetic behavior before committing.

- [ ] **Step 5: Record, commit, and push**

Commit `Validate nutrition basis drafts`, push, and record no provider/network call during tests.

### Task 4: Persist canonical analysis, retry state, and Review/complete push status

**Files:**
- Modify: `functions/src/analyze-entry.ts`
- Modify: `functions/src/retry-analysis.ts`
- Modify: `functions/src/push.ts`
- Modify: `functions/test/analyze-entry.test.ts`
- Modify: `functions/test/retry-analysis.test.ts`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Persist `nutritionBasis`, `nutritionAmount`, `nutritionUnit`, optional `consumedAmount`, references, package metadata, ordered `reviewReasons`, `rawBarcode`, model barcode, and confirmed barcode.
- Retry preserves source-owned inputs (`rawBarcode`, image/storage identity, scan mode) but, on successful recomputation, replaces every analysis-owned canonical field, references, model/confirmed barcode, review reason, status, and failure metadata rather than retaining stale analysis. A retry recomputation failure replaces analysis with stable error metadata while preserving source-owned inputs; complete push occurs only when status is complete, otherwise Review push carries the review state.
- `analysisFieldDeletion` is an injected `FieldValue.delete()` sentinel used for every analysis-owned key absent from the latest result. Error records persist only allowlisted `errorCode` and a safe user message, never a raw provider error/body/stack.

- [ ] **Step 1: Write RED persistence/retry tests**

```ts
expect(saved).toMatchObject({ nutritionBasis: 'package', nutritionAmount: 500, consumedAmount: 500, reviewReasons: ['barcode_unconfirmed'] });
expect(retried).toMatchObject({ nutritionBasis: 'package', nutritionAmount: 500 });
expect(unknownAfterKnown).not.toHaveProperty('consumedAmount');
expect(reviewPush).toMatchObject({ title: expect.any(String), body: expect.any(String), data: { entryId: 'e1' } });
expect(savedError).toMatchObject({ errorCode: 'model_response_invalid', errorMessage: expect.any(String) });
```

- [ ] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/analyze-entry.test.ts test/retry-analysis.test.ts`

Expected: FAIL because persisted analysis only stores legacy base values and retry loses canonical context.

- [ ] **Step 3: Implement minimal field mapping**

Build one sanitized persistence map from normalized output. Never write `consumedAmount` for unknown/unsupported quantity drafts; status is `error` with stable schema metadata when no safe draft exists. On successful retry overwrite the entire analysis-owned field set and emit `analysisFieldDeletion` for every stale absent key; test a known-package-to-unknown-package retry removes stale totals/consumption/reference fields. On failed retry overwrite it with allowlisted error code and safe user message; never persist raw provider diagnostics, revive stale totals/reasons, or double-multiply.

- [ ] **Step 4: Verify GREEN**

Run: `cd functions && npx vitest run test/analyze-entry.test.ts test/retry-analysis.test.ts && npm run build && npm run lint`

Expected: PASS; no Firebase emulator, provider, or push service is contacted by focused tests. Request Antigravity post-task review before committing because retry replacement and persisted failure behavior change together.

- [ ] **Step 5: Record, commit, and push**

Commit `Persist canonical nutrition analysis`, push, and record status/push coverage.

### Task 5: Apply canonical totals to aggregation, callable mapping, and rules

**Files:**
- Modify: `functions/src/aggregation.ts`
- Modify: `functions/src/index.ts`
- Modify: `firestore.rules`
- Modify: `functions/test/aggregation.test.ts`
- Modify: `functions/test-rules/firestore-rules.test.ts`
- Create: `functions/test/index.test.ts`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `summarizeCompleteEntries(entries)` calls `scaleCanonicalNutrition`; it includes only `status == complete` entries with `hasResolvedConsumption`, while old entries remain eligible through pure legacy scaling.
- `index.ts` maps callable/request fields into the canonical contract without conflating raw, model, and confirmed barcodes.
- Rules accept absent canonical fields for old documents. When any canonical key is present, require the complete tuple, `nutritionAmount > 0`, unit/basis compatibility, optional `consumedAmount > 0`, and full reference maps; reject malformed partial tuples, `NaN`, infinity, and out-of-range numerics with feasible rule predicates `value is number && value == value && value >= 0 && value <= 1000000000`. Require `portion` amount 1, `per100g` amount 100, package unit `g|ml`, integer positive `packageUnitCount`, positive `unitAmount`, and `packageUnitCount * unitAmount` agreement with established package amount. These constraints remain backward-compatible because no new field is required when all canonical keys are absent.

- [ ] **Step 1: Write RED aggregation/rules tests**

```ts
expect(summarizeCompleteEntries([packageHalf, legacyOnePointFive]).kcal).toBeCloseTo(42.5 + 150);
await assertSucceeds(setDoc(canonicalEntry));
await assertFails(setDoc({ ...canonicalEntry, packageUnitCount: 1.5 }));
```

- [ ] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/aggregation.test.ts && npm run test:rules`

Run: `cd functions && npx eslint test-rules/firestore-rules.test.ts && npm run build`

Expected: FAIL because aggregation uses `servingMultiplier` for every entry and rules lack canonical validation.

- [ ] **Step 3: Implement compatibility mapping and rules**

Use `summarizeCompleteEntries` with canonical ratio only for a valid complete tuple with established `consumedAmount`; use legacy multiplier only when every canonical key is absent. Add rules requiring only declared `ReviewReason` enum values, complete `NutritionReference` maps, all-or-none canonical tuple fields, finite bounded numeric values, and the stated basis/unit/count cross-field invariants while accepting old documents. Do not deploy rules.

- [ ] **Step 4: Verify GREEN and security review**

Run: `cd functions && npx vitest run test/aggregation.test.ts test/index.test.ts && npm run test:rules && npx eslint test-rules/firestore-rules.test.ts && npm run build && npm run lint`

Expected: PASS. Direct lint is required because `npm run lint` does not include `test-rules`; `npm run build` type-checks Functions source. Request Antigravity review for the data/rules boundary; record that this plan does not deploy it.

- [ ] **Step 5: Record, commit, and push**

Commit `Aggregate canonical nutrition amounts`, push, and verify remote equality.

### Task 6: Reuse production normalizers in evaluation and compare public baseline

**Files:**
- Modify: `functions/src/nutrition-eval/live-adapter.ts`
- Modify: `functions/src/nutrition-eval/schema.ts`
- Modify: `functions/src/nutrition-eval/report.ts`
- Modify: `functions/src/nutrition-eval/cli.ts`
- Create: `functions/src/nutrition-eval/baseline-comparison.ts`
- Modify: `functions/test/nutrition-eval/live-adapter.test.ts`
- Modify: `functions/test/nutrition-eval/report.test.ts`
- Modify: `functions/test/nutrition-eval/cli.test.ts`
- Modify: `functions/test/nutrition-eval/fixtures/model-responses.ts`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Adapter calls `normalizeOffPackage` and `normalizeVisionNutrition`; prediction includes basis/amount/unit and Review result from production code. Existing `scorer.ts` / `scorer.test.ts` remain unchanged because the scorer consumes normalized `NutritionPrediction` and already scores basis, barcode, Review, and safety metrics; Task 6 tests prove the adapter supplies those values.
- `loadBaselineComparison(reportRoot, runId)` loads the ignored report for exact run ID `run-2026-09-02T04-44-02-551Z`, validates dataset/prompt/model/sample compatibility, and returns metric deltas. Report schema serializes baseline provenance, compatibility result, and metric deltas for the 20/0 public comparison without implying Vitamin coverage.
- Stable failures remain distinct: `model_response_invalid` for schema, `off_product_invalid` for product normalization input, `nutrition_normalization_invalid` for a rejected arithmetic draft, and `provider_request_failed` only for thrown provider transport/dependency errors.

- [ ] **Step 1: Write RED adapter/report tests**

```ts
expect(await adapter.analyzeCase(knownPackageCase, bytes, { sampleIndex: 1 })).toMatchObject({ basis: 'package', amount: 500, unit: 'ml' });
expect(renderNutritionEvalMarkdown(report)).toContain('Public cases: 20');
expect(renderNutritionEvalMarkdown(report)).not.toContain('Vitamin Well coverage complete');
expect(loadBaselineComparison(reportRoot, 'run-2026-09-02T04-44-02-551Z').deltas.parseRate).toBeDefined();
```

- [ ] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/nutrition-eval/live-adapter.test.ts test/nutrition-eval/report.test.ts`

Expected: FAIL because the adapter duplicates pre-contract interpretation and report lacks post-change comparison metadata.

- [ ] **Step 3: Implement production-boundary reuse**

Route fixture responses through the same normalizers, emit the stated stable failure codes, load/validate exact ignored baseline provenance, calculate compatible metric deltas, and report public/private counts. Do not add Firebase imports or a private fallback; missing requested overlay remains `private_case_unavailable`.

- [ ] **Step 4: Verify GREEN and opt-in comparison procedure**

Run: `cd functions && npm run eval:nutrition:fixtures && npm run build && npm run lint`

Expected: PASS with no live call. When ADC and provider access are available, require `unset CALORIX_NUTRITION_EVAL_PRIVATE_MANIFEST` then one explicit `RUN_NUTRITION_EVAL_LIVE=1` 20/0 public-only comparison with project/location/model/code SHA; retain its ignored report locally. If either is unavailable, record the exact ADC, credential, quota, or provider blocker instead; never claim private coverage. Request Antigravity post-task review before committing.

- [ ] **Step 5: Record, commit, and push**

Commit `Evaluate canonical nutrition contract`, push, and record whether the opt-in comparison ran or its exact credential/quota blocker.

### Task 7: Parse canonical entries in Dart and preserve exact legacy scaling

**Files:**
- Modify: `lib/shared/models/food_entry.dart`
- Modify: `lib/shared/repositories/food_entry_repository.dart`
- Modify: `lib/features/today/providers/today_providers.dart`
- Modify: `test/contracts/analysis_result_contract_test.dart`
- Modify: `test/today/aggregation_truth_test.dart`
- Modify: `test/food_detail/serving_multiplier_test.dart`
- Modify: `test/food_detail/food_crud_test.dart`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `FoodEntry.fromData`, `toMap`, and `copyWith` round-trip nullable basis/amount/unit, consumed amount, references, reasons, raw/model/confirmed barcodes, package unit count, and unit amount without eager defaults.
- `hasCanonicalNutrition` derives only from a complete valid raw basis/amount/unit tuple; `usesLegacyServingMultiplier` is true only when zero canonical wire keys are present; `hasResolvedConsumption` is true only for valid canonical plus finite positive consumed amount or a pure legacy entry. Partial canonical tuples fail closed.
- `ReviewCandidate.kcal` is `double`; `FoodEntry.scaledKcal` uses canonical ratio only with resolved canonical consumption and legacy multiplier only for `usesLegacyServingMultiplier`.

- [ ] **Step 1: Write RED Dart parsing/scaling tests**

```dart
expect(entry.scaledKcal, 42.5);
expect(legacy.scaledKcal, 150);
expect(ReviewCandidate.fromMap({'kcal': 85.5, 'confidence': 0.7}).kcal, 85.5);
final wire = canonical.toMap();
final roundTrip = FoodEntry.fromData(id: 'x', data: wire).toMap();
expect(roundTrip['nutritionBasis'], 'package');
expect(roundTrip['nutritionAmount'], 500.0);
expect(roundTrip['nutritionUnit'], 'ml');
expect(roundTrip['consumedAmount'], 250.0);
expect(roundTrip['packageUnitCount'], 6);
expect(roundTrip['unitAmount'], 83.3333333333);
expect(roundTrip['per100Reference'], canonical.per100Reference!.toMap());
expect(roundTrip['servingReference'], canonical.servingReference!.toMap());
expect(roundTrip['reviewReasons'], ['barcode_unconfirmed']);
expect(roundTrip['rawBarcode'], '7350042716380');
expect(roundTrip['modelBarcode'], '7350042716380');
expect(roundTrip['confirmedBarcode'], isNull);
expect(canonical.copyWith().toMap(), roundTrip);
expect(partialCanonical.hasResolvedConsumption, isFalse);
```

In `test/food_detail/food_crud_test.dart`, use the fake store to call `repository.duplicate(canonical)` and assert the created document preserves every canonical/reference/reason/barcode/package field above; that duplicate assertion belongs to this repository test, not the three model/Today tests alone.

- [ ] **Step 2: Witness RED**

Run: `fvm flutter test test/contracts/analysis_result_contract_test.dart test/today/aggregation_truth_test.dart test/food_detail/serving_multiplier_test.dart test/food_detail/food_crud_test.dart`

Expected: FAIL because Dart models only parse base values and quarter-step multiplier scaling.

- [ ] **Step 3: Implement backward-compatible parsing**

Keep absent canonical wire fields null through `fromData`, `toMap`, `copyWith`, repository duplicate, and stream parsing. Derived arithmetic may use `portion/1/portion` and legacy multiplier only when `usesLegacyServingMultiplier`; partial canonical input is invalid rather than silently converted. Parse references defensively and keep manual-entry canonical fields explicit.

- [ ] **Step 4: Verify GREEN**

Run: `fvm flutter test test/contracts/analysis_result_contract_test.dart test/today/aggregation_truth_test.dart test/food_detail/serving_multiplier_test.dart test/food_detail/food_crud_test.dart`

Expected: PASS. Request an Antigravity post-task review before committing because model, repository, and Today aggregation wire contracts change together. The newer nutrition spec overrides quarter steps only for canonical package amounts.

- [ ] **Step 5: Record, commit, and push**

Commit `Parse canonical food entries`, push, and record focused Flutter evidence.

### Task 8: Confirm Review atomically through the repository

**Files:**
- Modify: `lib/shared/repositories/food_entry_repository.dart`
- Modify: `lib/features/review/providers/review_providers.dart`
- Modify: `test/food_detail/food_crud_test.dart`
- Modify: `test/review/review_screen_test.dart`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `ReviewConfirmation` contains an optional selected candidate and its optional nutrition edits plus a required finite positive `double consumedAmount`; no candidate is required for amount-only Review.
- `confirmReview(uid, id, confirmation)` validates finite-positive `consumedAmount` unconditionally and issues one document update with optional selected-candidate edits, `consumedAmount`, `status=complete`, `corrected=true`, `correctedAt`, and `updatedAt`; it does not claim a Firestore transaction.

- [ ] **Step 1: Write RED repository/Review gateway tests**

```dart
await repository.confirmReview('u1', 'e1', const ReviewConfirmation(consumedAmount: 250));
expect(store.lastUpdate['consumedAmount'], 250);
expect(store.lastUpdate['status'], 'complete');
expect(store.updateCalls, 1);
expect(() => ReviewConfirmation(consumedAmount: double.nan), throwsArgumentError);
```

- [ ] **Step 2: Witness RED**

Run: `fvm flutter test test/food_detail/food_crud_test.dart test/review/review_screen_test.dart`

Expected: FAIL because Review confirmation only sets status or rewrites a candidate without consumed amount/timestamps.

- [ ] **Step 3: Implement one-update confirmation**

Keep the one-update/field assertions in `food_crud_test.dart`; the Review widget fake only forwards the constructed `ReviewConfirmation` to its gateway. Require finite-positive consumed amount unconditionally, merge candidate fields only when selected, set correction timestamps from injected clock, and keep candidate choice independent from amount choice.

- [ ] **Step 4: Verify GREEN**

Run: `fvm flutter test test/food_detail/food_crud_test.dart test/review/review_screen_test.dart`

Expected: PASS with a single in-memory datastore update witness. Request Antigravity post-task review before committing because the Review state transition changes persisted user data.

- [ ] **Step 5: Record, commit, and push**

Commit `Confirm reviewed nutrition amounts`, push, and record the single-update contract.

### Task 9: Display and edit canonical amounts in Food Detail

**Files:**
- Modify: `lib/features/food_detail/food_detail_sheet.dart`
- Modify: `lib/features/food_detail/providers/food_detail_providers.dart`
- Modify: `lib/features/manual/manual_entry_screen.dart`
- Modify: `lib/features/manual/providers/manual_providers.dart`
- Modify: `lib/shared/repositories/food_entry_repository.dart`
- Modify: `test/food_detail_sheet_test.dart`
- Modify: `test/manual/manual_entry_screen_test.dart`
- Modify: `test/food_detail/food_crud_test.dart`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `AmountPresentation` renders `500 ml bottle`, `6 × 250 ml · whole pack`, `full visible portion`, or `100 g reference · amount required` from canonical fields.
- Canonical entries edit `consumedAmount`; only legacy entries retain the existing `servingMultiplier` stepper.

- [ ] **Step 1: Write RED Food Detail/manual tests**

```dart
await pumpFoodDetail(canonicalEntry);
expect(find.text('500 ml bottle'), findsOneWidget);
expect(find.text('100 g reference · amount required'), findsOneWidget);
expect(find.byKey(const Key('canonical-amount-control')), findsOneWidget);
expect(find.byKey(const Key('serving-increment')), findsNothing);
expect(find.byKey(const Key('legacy-serving-stepper')), findsNothing);
await pumpFoodDetail(legacyEntry);
expect(find.byKey(const Key('legacy-serving-stepper')), findsOneWidget);
expect(find.byKey(const Key('canonical-amount-control')), findsNothing);
```

- [ ] **Step 2: Witness RED**

Run: `fvm flutter test test/food_detail_sheet_test.dart test/manual/manual_entry_screen_test.dart`

Expected: FAIL because canonical entries still expose the multiplier stepper and lack the canonical amount control, while legacy entries do not yet receive the explicit legacy-stepper key.

- [ ] **Step 3: Implement canonical display/edit branches**

Create presentation from canonical amount/unit; use exact numeric amount editing for canonical records. Show the old quarter-step control only for `usesLegacyServingMultiplier`. Manual entries write `portion/1/portion` and `consumedAmount` equal to the entered existing quantity (for example `1.5`), through manual providers and repository persistence rather than hard-coding 1.

- [ ] **Step 4: Verify GREEN**

Run: `fvm flutter test test/food_detail_sheet_test.dart test/manual/manual_entry_screen_test.dart`

Expected: PASS; presentation does not persist any UI suggestion list. Request Antigravity post-task review before committing because Food Detail/manual persistence and visible controls change together.

- [ ] **Step 5: Record, commit, and push**

Commit `Edit canonical nutrition amounts`, push, and record focused UI tests.

### Task 10: Build source-labeled Review amount selection and bounded evidence

**Files:**
- Modify: `lib/features/review/review_screen.dart`
- Modify: `lib/features/review/providers/review_providers.dart`
- Modify: `test/review/review_screen_test.dart`
- Modify: `test/tool/android_test_apk_contract_test.dart`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `AmountSuggestion` is `{kind:'derived'; amount:double; unit:String; label:String; source:AmountSource}` where `AmountSource` is `packageLabel|servingMetadata|packMetadata`; `CustomAmountState` is `{selected:bool; amount:double?}` and has no numeric amount until the user enters one. `deriveAmountSuggestions(entry)` emits only derived choices, deduplicated by normalized `(amount, unit)` with package-label precedence over serving then pack labels.
- Candidate selection and amount selection are independent. Empty candidates still permit amount-only Review; unresolved amount ambiguity leaves all derived choices and `CustomAmountState` unselected and blocks confirmation. A selected custom choice requires a finite positive entered amount before confirmation.

- [ ] **Step 1: Write RED Review suggestion tests**

```dart
expect(deriveAmountSuggestions(entry).map((v) => v.label), contains('Whole package · 500 ml'));
expect(find.text('Custom amount'), findsOneWidget);
expect(confirmButton, isDisabled); // contradictory package amount, no selected amount
expect(() => validateCustomAmount(0), throwsArgumentError);
expect(() => validateCustomAmount(double.nan), throwsArgumentError);
expect(() => validateCustomAmount(null), throwsArgumentError);
```

- [ ] **Step 2: Witness RED**

Run: `fvm flutter test test/review/review_screen_test.dart test/tool/android_test_apk_contract_test.dart`

Expected: FAIL because Review candidates are not source-labeled amount choices and confirmation lacks the required amount selection.

- [ ] **Step 3: Implement mutually exclusive derived choices**

Derive and deduplicate choices at render time only, rendering source labels `package label`, `serving metadata`, and `pack metadata`; present Custom as a separate action that controls `CustomAmountState`, never as a derived suggestion. Enforce one selected derived choice or selected custom state at a time. Preselect whole package only for established amount without `package_quantity_missing`, `package_unit_unsupported`, or `nutrition_basis_ambiguous`; `barcode_unconfirmed` alone permits the default. Test empty candidates plus established amount can confirm, and test zero, nonfinite, and empty custom input cannot.

- [ ] **Step 4: Verify GREEN, APK, and bounded runtime evidence**

Run: `fvm flutter test test/review/review_screen_test.dart test/tool/android_test_apk_contract_test.dart`

Expected: PASS. After the Task 10 source commit is pushed, set `SOURCE_SHA=$(git rev-parse HEAD)`, require `git status --short` to contain no intended source diff, and verify `git ls-remote origin refs/heads/fix/scan-photo-flow-viewer` resolves to `SOURCE_SHA`. Trigger `.github/workflows/android-test-apk.yml` for that SHA; record its run ID and require artifact name `android-test-apk-${SOURCE_SHA}`. Download the artifact, verify ZIP integrity, SHA-256 against its published checksum, APK signer, and embedded/source metadata against `SOURCE_SHA`. On a missing run/artifact, source mismatch, checksum/signer mismatch, non-clean source, or workflow failure, record that exact blocker and do not use an older APK. After a verified artifact exists, collect bounded runtime/visual evidence only in the designated test environment/account and only when the exercised flow cannot upload or mutate production data; do not use a production account, write cloud data, or deploy.

- [ ] **Step 5: Record, review, commit, and push**

Request Antigravity UX/behavior review, record Test APK/runtime evidence or exact environment blocker, commit `Review canonical nutrition amounts`, and push.

### Task 11: Verify Stage C/D, review it, and hand off captured-still work

**Files:**
- Modify: `docs/implementation-status.md`
- Create: `docs/superpowers/plans/2026-09-02-captured-still-barcode-and-integration.md`

**Interfaces:**
- Consumes all prior canonical contract interfaces and defines only the Stage E/F handoff: captured-still barcode extraction, durable `rawBarcode`, source-matched integration/device proof, and separately authorized deployment gate.

- [ ] **Step 1: Run Functions verification and privacy checks**

Run: `cd functions && npm run test:verify && npm run eval:nutrition:fixtures`

Run from repository root: `git diff --check && git ls-files -- .nutrition-eval && git grep -nE '(ya29\.|BEGIN PRIVATE KEY)' -- ':!docs/**' || true`

Expected: Functions/emulator and deterministic evaluation pass with no routine live/provider call. Expected `.nutrition-eval` tracked count 0 and no credential/private-key material. Approved filename literals in plan/docs and deliberately fake hermetic test strings are not leaks; keep them outside credential scanning or record them as approved matches.

- [ ] **Step 2: Run Flutter verification with documented environment handling**

Run: `fvm flutter analyze && fvm flutter test`

Expected: the full Flutter gate passes, or only the exact documented environment blocker remains while all changed focused surfaces pass. Do not fabricate ignored `firebase_options.dart`; if the pinned Pi container lacks `pwsh`, isolate and record those exact capture-script environment failures. Hosted Verify and the source-matched Test APK are authoritative for those dependencies.

- [ ] **Step 3: Request final mandatory review**

Continue Antigravity conversation `calorix-nutrition-package-contract-20260902` with `approvalMode: yolo` and: `Do not edit files, do not run write commands, and do not mutate the repository; only inspect, reason, review, and propose changes for the main agent to apply.`

Expected: explicit `AGREEMENT_STATUS: agree` and `MUST_FIX: none`; otherwise apply each must-fix, rerun affected checks, and continue that conversation.

- [ ] **Step 4: Write the Stage E/F handoff and self-check**

Create the named captured-still/integration plan with test-first barcode extraction, durable raw-barcode propagation, authorized device evidence, and a separately confirmed deploy gate. Confirm this Stage C/D plan has no private image path, credential, deployment command, or production-readiness claim.

- [ ] **Step 5: Record, commit, and push the Stage C/D closure**

Commit `Close nutrition package contract`, push, verify remote equality, and record exact verification, review, public-only comparison, private-fixture blocker, and the next Stage E/F artifact.

## Final Handoff

Stage C/D is complete only after all eleven task commits are pushed, deterministic and emulator gates are green, the required reviews are green, and every Flutter environment limitation is recorded rather than misrepresented. The private Vitamin Well fixture remains unavailable until its authorized source environment variable exists; never fabricate it or claim its benchmark coverage.
