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

- [x] **Step 1: Write RED OFF/package tests**

```ts
expect(normalizeOffPackage(bottle500)).toMatchObject({ nutritionBasis: 'package', nutritionAmount: 500, baseKcal: 85, consumedAmount: 500 });
expect(normalizeOffPackage(missingQuantity).reviewReasons).toEqual(['package_quantity_missing']);
expect(normalizeOffPackage(conflictingSixPack).reviewReasons).toContain('nutrition_basis_ambiguous');
expect(normalizeOffPackage(structured330WithReliableSixBy330)).toMatchObject({ nutritionAmount: 1980, packageUnitCount: 6, unitAmount: 330, consumedAmount: undefined, reviewReasons: ['nutrition_basis_ambiguous'] });
```

- [x] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/off-client.test.ts test/package-nutrition.test.ts`

Expected: FAIL because OFF lacks reference fields and package normalization/multipack parsing is absent.

- [x] **Step 3: Implement strict parse and normalization**

Fetch only product name/barcode, quantity/product quantity/unit, serving fields, `nutrition_data_per`, and normalized nutrient fields. Multiply complete per-100 references by full package quantity/100; retain serving reference without using it as default. For reliable `6x330` text conflicting with structured `330`, use inferred outer `1980` for canonical package amount and base totals, preserve count/unit, add `nutrition_basis_ambiguous`, omit `consumedAmount`, and force Review rather than auto-completing. When multipack inference is unreliable, use the safe per-100 draft. Reject non-finite nutrients and unsupported units into ordered reasons.

- [x] **Step 4: Verify GREEN**

Run: `cd functions && npx vitest run test/off-client.test.ts test/package-nutrition.test.ts && npm run build && npm run lint`

Expected: PASS with no HTTP call in tests; package totals, safe per-100 drafts, and strict multipack disagreement are covered. Request Antigravity post-task review before committing because OFF parsing and package-default semantics change together.

- [x] **Step 5: Record, commit, and push**

Commit `Normalize package nutrition`, push, and record the focused result and remote equality.

### Task 3: Validate basis-aware vision output and recompute server nutrition

**Files:**
- Modify: `functions/src/nutrition.ts`
- Modify: `functions/src/prompts.ts`
- Modify: `functions/src/analyze-entry.ts`
- Modify: `functions/test/nutrition.test.ts`
- Modify: `functions/test/analyze-entry.test.ts`
- Modify: `functions/test/nutrition-eval/fixtures/model-responses.ts`
- Modify: `functions/test/nutrition-eval/runner.test.ts`
- Modify: `functions/test/nutrition-eval/cli.test.ts`
- Modify: `docs/implementation-status.md`

**File-map correction (2026-09-07):** `functions/src/prompts.ts` is required because this task's strict parser cannot accept production output unless the meal, label, and barcode prompts request the same basis-aware contract. The already-listed `functions/test/nutrition.test.ts` owns the compact prompt-contract regression. `functions/test/nutrition-eval/cli.test.ts` is included only to synchronize its two deterministic prompt-checksum literals with the required Task 3 prompt text; no CLI implementation or live-adapter behavior moves forward from Task 6. Read-only Antigravity conversation `calorix-nutrition-package-contract-20260902`, model `gemini-3.8-flash`, reviewed both corrections before GREEN and returned `AGREEMENT_STATUS: agree`; for the checksum correction it required exactly those two literal updates and keeping `live-adapter.ts` plus `live-adapter.test.ts` deferred.

**Interfaces:**
- `parseNutritionResponse(response, scanMode)` strictly requires raw nutrient fields, declared basis/amount/unit, observed package amount/unit, model barcode, candidates, and declared per-100 or package values needed to recompute arithmetic; old fixture JSON is updated rather than accepted through compatibility mode.
- `normalizeVisionNutrition(parsed, rawBarcode, confirmedBarcode): NormalizationResult` recomputes package totals. `NormalizationResult` is either `{kind:'draft'; status:'complete'|'needs_review'; draft: NutritionDraft}` or `{kind:'error'; status:'error'; failureCode:'model_schema_invalid'; reviewReasons:['model_schema_invalid']}`; callers never treat an error result as canonical nutrition.

- [x] **Step 1: Write RED vision/arithmetic tests**

```ts
expect(normalizeVisionNutrition(vitaminVision, '7350042716380', undefined)).toMatchObject({ kind: 'draft', status: 'needs_review', draft: { baseKcal: 85, baseCarbs: 21, consumedAmount: 500, reviewReasons: ['barcode_unconfirmed'] } });
expect(normalizeVisionNutrition(badPortionAmount)).toMatchObject({ kind: 'draft', draft: { reviewReasons: expect.arrayContaining(['nutrition_arithmetic_mismatch']) } });
expect(normalizeVisionNutrition(unusableVision).status).toBe('error');
```

- [x] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/nutrition.test.ts test/analyze-entry.test.ts`

Expected: FAIL because parser prompts omit basis/amount and server code trusts model totals.

- [x] **Step 3: Implement schema, prompt, and recomputation**

Require `portion` amount `1`, `per100g` amount `100`, and package observed/declaration agreement within `max(1 unit, 1%)`. Recompute package values from declared raw per-100 density or package totals, add `nutrition_arithmetic_mismatch` or `atwater_mismatch`, retain reported calories, and force Review for every blocking reason. Keep raw, model, and confirmed barcodes separate; update runner fixtures/tests to prove strict schema results remain deterministic.

- [x] **Step 4: Verify GREEN and review**

Run: `cd functions && npx vitest run test/nutrition.test.ts test/analyze-entry.test.ts && npm run build && npm run lint`

Expected: PASS; Vitamin fixture data is synthetic and contains no private image. Request Antigravity review for prompt/schema/arithmetic behavior before committing.

- [x] **Step 5: Record, commit, and push**

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

**Task 4 persistence ruling (2026-09-07):** source-owned `rawBarcode`, `imageUrl`, `storagePath`, and `scanMode` are never deleted. Successful analysis deletes absent optional/current-error/legacy analysis fields; error replacement deletes every prior analysis result field. Persistence uses `model_schema_invalid` for parse/schema/normalization failures and `provider_request_failed` for thrown provider/storage/OFF dependencies; `model_response_invalid` remains Task 6 evaluation-report vocabulary only. With no injected deletion sentinel, absent keys are omitted for hermetic test compatibility. Read-only Antigravity conversation `calorix-nutrition-persistence-20260907`, model `gemini-3.8-flash`, reviewed this matrix before RED and returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`.

- [x] **Step 1: Write RED persistence/retry tests**

```ts
expect(saved).toMatchObject({ nutritionBasis: 'package', nutritionAmount: 500, consumedAmount: 500, reviewReasons: ['barcode_unconfirmed'] });
expect(retried).toMatchObject({ nutritionBasis: 'package', nutritionAmount: 500 });
expect(unknownAfterKnown).not.toHaveProperty('consumedAmount');
expect(reviewPush).toMatchObject({ title: expect.any(String), body: expect.any(String), data: { entryId: 'e1' } });
expect(savedError).toMatchObject({ errorCode: 'model_schema_invalid', errorMessage: 'Invalid model response' });
```

- [x] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/analyze-entry.test.ts test/retry-analysis.test.ts`

Expected: FAIL because persisted analysis only stores legacy base values and retry loses canonical context.

- [x] **Step 3: Implement minimal field mapping**

Build one sanitized persistence map from normalized output. Never write `consumedAmount` for unknown/unsupported quantity drafts; status is `error` with stable schema metadata when no safe draft exists. On successful retry overwrite the entire analysis-owned field set and emit `analysisFieldDeletion` for every stale absent key; test a known-package-to-unknown-package retry removes stale totals/consumption/reference fields. On failed retry overwrite it with allowlisted error code and safe user message; never persist raw provider diagnostics, revive stale totals/reasons, or double-multiply.

- [x] **Step 4: Verify GREEN**

Run: `cd functions && npx vitest run test/analyze-entry.test.ts test/retry-analysis.test.ts && npm run build && npm run lint`

Expected: PASS; no Firebase emulator, provider, or push service is contacted by focused tests. Request Antigravity post-task review before committing because retry replacement and persisted failure behavior change together.

**Actual (2026-09-07):** corrected RED was **15 failed / 27 passed**. Implementation review added notification-isolation, OFF-normalization, historical-`barcode`, and persistence-propagation regressions; the review RED was **13 failed / 32 passed**, and disabling the persistence guard made its named regression fail before restoration. Final GREEN is **46/46**; build, lint, and diff-check pass. Full offline remains **497 passed / 6 failed / 1 skipped**, with all six failures confined to Task 6's deferred legacy live-adapter fixtures. Internal review returned `APPROVED: yes`, `MUST_FIX: none`; Antigravity conversation `calorix-nutrition-persistence-20260907`, model `gemini-3.8-flash`, returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`.

- [x] **Step 5: Record, commit, and push**

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

**Task 5 pre-implementation ruling (2026-09-07):** export pure `toAggregatableEntry` and preserve each own aggregation field verbatim (including malformed/partial values) so downstream validation cannot be bypassed; never inject `servingMultiplier: 1`. Export `toEntryData` and source `rawBarcode` only from the raw field, never model/confirmed/legacy barcode. A valid canonical tuple without `consumedAmount` is unresolved and skipped by aggregation; partial/invalid canonical records throw, and canonical values always ignore legacy multiplier. Rule triggers are tuple/consumption/package/reference/reason fields, not barcode/Atwater metadata. Complete canonical client records require finite positive consumption; Review may omit it. Preserve kcal <=10000, bound other numerics at 1e9, require exact six-key reference maps, seven allowed reasons, all-or-none multipack metadata with integer count and ±0.01 product agreement, and forbid canonical-to-legacy downgrade on update. Read-only Antigravity conversation `calorix-nutrition-aggregation-rules-20260907`, model `gemini-3.8-flash`, accepted these refinements with exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. No rules deployment is authorized.

- [x] **Step 1: Write RED aggregation/rules tests**

```ts
expect(summarizeCompleteEntries([packageHalf, legacyOnePointFive]).kcal).toBeCloseTo(42.5 + 150);
await assertSucceeds(setDoc(canonicalEntry));
await assertFails(setDoc({ ...canonicalEntry, packageUnitCount: 1.5 }));
```

- [x] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/aggregation.test.ts && npm run test:rules`

Run: `cd functions && npx eslint test-rules/firestore-rules.test.ts && npm run build`

Expected: FAIL because aggregation uses `servingMultiplier` for every entry and rules lack canonical validation.

- [x] **Step 3: Implement compatibility mapping and rules**

Use `summarizeCompleteEntries` with canonical ratio only for a valid complete tuple with established `consumedAmount`; use legacy multiplier only when every canonical key is absent. Add rules requiring only declared `ReviewReason` enum values, complete `NutritionReference` maps, all-or-none canonical tuple fields, finite bounded numeric values, and the stated basis/unit/count cross-field invariants while accepting old documents. Do not deploy rules.

- [x] **Step 4: Verify GREEN and security review**

Run: `cd functions && npx vitest run test/aggregation.test.ts test/index.test.ts && npm run test:rules && npx eslint test-rules/firestore-rules.test.ts && npm run build && npm run lint`

Expected: PASS. Direct lint is required because `npm run lint` does not include `test-rules`; `npm run build` type-checks Functions source. Request Antigravity review for the data/rules boundary; record that this plan does not deploy it.

**Actual (2026-09-08):** final frozen RED was Functions **8 failed / 22 passed** and rules **77 failed / 48 passed**, with every failure bound to an absent Task 5 behavior; direct lint and diff checks passed. GREEN is Functions **30/30** and Firestore rules **125/125** with zero exact `maximum of 1000 expressions` diagnostics after selective affected-field validation removed evaluator-budget false positives. Build, Functions lint, direct rules-test ESLint, and `git diff --check` pass. Full offline is **513 passed / 6 failed / 1 skipped**; all six failures remain confined to Task 6's deferred `nutrition-eval/live-adapter.test.ts`. Independent implementation review found no Critical or Important issue and `MUST_FIX: none`; its only minor note is the deliberate expression-budget/backward-compatibility choice to trust unchanged canonical fields on unrelated edits to a pre-existing malformed server document. Mandatory read-only Antigravity conversation `calorix-nutrition-aggregation-rules-20260907`, model `gemini-3.8-flash`, returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. No rules deployment, Firebase production write, provider inference, or device operation occurred.

- [x] **Step 5: Record, commit, and push**

Commit `Aggregate canonical nutrition amounts`, push, and verify remote equality.

**Closure (2026-09-08):** commit `74d75e965b9c5fcdffe9f61b1c3cd6dc62eafe59` (`Aggregate canonical nutrition amounts`) is pushed to `origin/fix/scan-photo-flow-viewer`; `git rev-parse HEAD` and `git ls-remote --heads origin fix/scan-photo-flow-viewer` matched exactly. Protected `.mcp.json` remained unstaged and untouched.

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
- `loadBaselineComparison(reportRoot, runId, currentReport)` loads the ignored report for exact run ID `run-2026-09-02T04-44-02-551Z`, validates dataset/prompt/model/sample compatibility, and returns metric deltas only for a like-for-like comparison. Report schema serializes baseline provenance, compatibility result, all ordered mismatch reasons, and compatible metric deltas for the 20/0 public comparison without implying Vitamin coverage.
- Stable failures remain distinct: `model_response_invalid` for schema, `off_product_invalid` for product normalization input, `nutrition_normalization_invalid` for a rejected arithmetic draft, and `provider_request_failed` only for thrown provider transport/dependency errors.

**Task 6 pre-implementation ruling (2026-09-08):** the historical baseline remains loadable and renderable but is not silently treated as like-for-like: its prompt hash `294ea620...` differs from the current post-Task-3 hash `205b635a...`, so a real current comparison is `compatible: false`, includes ordered `compatibilityReasons` with primary `prompt_hash_mismatch` (and any later model mismatch), and omits deltas. A self-comparison fixture alone proves zero compatible deltas and delta directionality. The loader takes an explicit current report, rejects traversal/missing/malformed input with stable codes, validates the historical report without rewriting it, and derives its 20 public / 0 private partition in memory from the public dataset identity and summary because the v1 artifact predates explicit count fields. New reports serialize explicit counts. Production normalizer typed outcomes—not message matching—separate schema, normalization, product, and thrown-provider failures. Scorer files remain unchanged. Read-only Antigravity conversation `calorix-nutrition-eval-normalizer-task6-20260908`, current primary `gemini-3.8-flash`, returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none` after correcting the stale delta example.

- [x] **Step 1: Write RED adapter/report tests**

```ts
expect(await adapter.analyzeCase(knownPackageCase, bytes, { sampleIndex: 1 })).toMatchObject({ basis: 'package', amount: 500, unit: 'ml' });
expect(renderNutritionEvalMarkdown(report)).toContain('Public cases: 20');
expect(renderNutritionEvalMarkdown(report)).not.toContain('Vitamin Well coverage complete');
expect(loadBaselineComparison(reportRoot, 'run-2026-09-02T04-44-02-551Z', currentReport)).toMatchObject({ compatible: false, compatibilityReason: 'prompt_hash_mismatch', deltas: undefined });
```

- [x] **Step 2: Witness RED**

Run: `cd functions && npx vitest run test/nutrition-eval/live-adapter.test.ts test/nutrition-eval/report.test.ts`

Expected: FAIL because the adapter duplicates pre-contract interpretation and report lacks post-change comparison metadata.

**Actual (2026-09-08):** corrected frozen RED is **33 failed / 77 passed (110 total)** across `live-adapter.test.ts`, `report.test.ts`, and `cli.test.ts`; all failures map to absent Task 6 production behavior. Direct test-file ESLint and `git diff --check` pass. Independent read-only review verified the schema-category normalization failure, loader/current-report validation boundary, comparison-provenance privacy cases, and the remaining contract, then returned `MUST_FIX: none`.

- [x] **Step 3: Implement production-boundary reuse**

Route fixture responses through the same normalizers, emit the stated stable failure codes, load/validate exact ignored baseline provenance, calculate compatible metric deltas, and report public/private counts. Do not add Firebase imports or a private fallback; missing requested overlay remains `private_case_unavailable`.

- [x] **Step 4: Verify GREEN and opt-in comparison procedure**

Run: `cd functions && npm run eval:nutrition:fixtures && npm run build && npm run lint`

Expected: PASS with no live call. When ADC and provider access are available, require `unset CALORIX_NUTRITION_EVAL_PRIVATE_MANIFEST` then one explicit `RUN_NUTRITION_EVAL_LIVE=1` 20/0 public-only comparison with project/location/model/code SHA; retain its ignored report locally. If either is unavailable, record the exact ADC, credential, quota, or provider blocker instead; never claim private coverage. Request Antigravity post-task review before committing.

**Actual (2026-09-08):** initial GREEN passed **110/110** but independent review rejected production Review divergence, weak historical validation/comparison states, and message-matched provider classification. Review-fix round 1 witnessed **11 failed / 110 passed** then **122/122**; round 2 witnessed **3 failed / 41 passed** then final focused **125/125**. Fresh full Functions is **562 passed / 1 skipped**; build, lint, and diff-check pass. The exact historical artifact is read-only and real current-vs-historical comparison remains fail-closed incompatible on prompt/model identity. Final independent review returned `MUST_FIX: none`; continued read-only Antigravity conversation `calorix-nutrition-eval-normalizer-task6-20260908`, model `gemini-3.8-flash`, returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. The opt-in live provider comparison was intentionally not run in this hermetic stage; no private coverage, provider inference, Firebase/deploy, device call, or baseline rewrite is claimed.

- [x] **Step 5: Record, commit, and push**

Commit `Evaluate canonical nutrition contract`, push, and record whether the opt-in comparison ran or its exact credential/quota blocker.

**Actual (2026-09-08):** committed as `e6ff6e15c11f8a413ff81b797f8c6b93f0ef78fe` (`Evaluate canonical nutrition contract`) and pushed with exact local/remote equality. The opt-in provider comparison did not run in this hermetic stage; the exact historical artifact was validated/read without rewrite, and no private/provider/Firebase/device/deploy coverage is claimed.

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

- [x] **Step 1: Write RED Dart parsing/scaling tests**

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

- [x] **Step 2: Witness RED**

Run: `fvm flutter test test/contracts/analysis_result_contract_test.dart test/today/aggregation_truth_test.dart test/food_detail/serving_multiplier_test.dart test/food_detail/food_crud_test.dart`

Expected: FAIL because Dart models only parse base values and quarter-step multiplier scaling.

- [x] **Step 3: Implement backward-compatible parsing**

Keep absent canonical wire fields null through `fromData`, `toMap`, `copyWith`, repository duplicate, and stream parsing. Derived arithmetic may use `portion/1/portion` and legacy multiplier only when `usesLegacyServingMultiplier`; partial canonical input is invalid rather than silently converted. Parse references defensively and keep manual-entry canonical fields explicit.

- [x] **Step 4: Verify GREEN**

Run: `fvm flutter test test/contracts/analysis_result_contract_test.dart test/today/aggregation_truth_test.dart test/food_detail/serving_multiplier_test.dart test/food_detail/food_crud_test.dart`

Expected: PASS. Request an Antigravity post-task review before committing because model, repository, and Today aggregation wire contracts change together. The newer nutrition spec overrides quarter steps only for canonical package amounts.

**Actual (2026-09-09):** final pinned Flutter 3.41.9 container verification passed **35/35** across the four listed files. A review-driven malformed-legacy round-trip regression first failed **0/2** because `toMap` and repository duplication emitted the internal `1.0` fallback, then passed **2/2** after invalid legacy state serialized as an explicit null marker. Focused analysis of the six changed Dart/test files reported `No issues found` in `1548.1s`; formatting and `git diff --check` passed. Independent review returned `APPROVED: yes`, `MUST_FIX: none`. Mandatory read-only Antigravity post-review used `gemini-3.8-flash` in conversation `calorix-dart-canonical-entry-task7-20260908` and returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. No live provider, Firebase, device, deployment, or LocateAnything operation occurred.

- [x] **Step 5: Record, commit, and push**

Commit `Parse canonical food entries`, push, and record focused Flutter evidence.

**Actual (2026-09-09):** committed as `ba10e004ce4034b6d396559139ca160a4925ea75` (`Parse canonical food entries`) and pushed to `origin/fix/scan-photo-flow-viewer`. The scoped commit contains the two production files, four focused test files, and same-stage tracking; protected `.mcp.json` was not staged.

### Task 8: Confirm Review atomically through the repository

**Files:**
- Modify: `lib/shared/models/food_entry.dart`
- Modify: `lib/shared/repositories/food_entry_repository.dart`
- Modify: `lib/features/review/providers/review_providers.dart`
- Modify: `lib/features/review/review_screen.dart`
- Modify: `test/food_detail/food_crud_test.dart`
- Modify: `test/review/review_screen_test.dart`
- Modify: `integration_test/e2e/review_flow_test.dart`
- Modify: `integration_test/e2e/support/e2e_harness.dart`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Non-const `ReviewConfirmation` contains an optional selected candidate and a required finite positive `double consumedAmount`; its constructor validates at runtime and throws `ArgumentError` for zero, negative, NaN, or either infinity. No candidate is required for amount-only Review.
- `ReviewCandidate` preserves optional macro edits as nullable values through parsing/serialization instead of inventing zeroes. Candidate-null fields are omitted from confirmation updates.
- `confirmReview(uid, id, confirmation)` revalidates finite-positive `consumedAmount` at the repository boundary and issues exactly one Firestore document update with optional selected-candidate edits, `consumedAmount`, `status=complete`, `corrected=true`, `correctedAt`, and `updatedAt`; it is not a Firestore transaction.
- The Review gateway forwards the complete confirmation. Until Task 10 supplies explicit amount choices, the screen forwards only an already-valid `entry.consumedAmount` and disables confirmation when it is absent or invalid; it never invents an amount.
- A failed gateway call keeps the user on Review, shows stable safe retry guidance, preserves the selection, and re-enables confirmation. Review integration fixtures that exercise confirmation carry a valid canonical tuple and consumed amount; production never invents a legacy fallback.

**Task 8 pre-review ruling (2026-09-09):** read-only Antigravity conversation `calorix-review-confirmation-task8-20260909`, primary `gemini-3.8-flash`, required the runtime/non-const validation, nullable candidate macros, explicit screen file scope, fail-closed button state, fake-store call capture, and precise single-document-update wording above. The corrected contract then returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none` before RED.

- [x] **Step 1: Write RED repository/Review gateway tests**

```dart
await repository.confirmReview('u1', 'e1', ReviewConfirmation(consumedAmount: 250));
expect(store.lastUpdate['consumedAmount'], 250);
expect(store.lastUpdate['status'], 'complete');
expect(store.updateCalls, 1);
for (final value in [0.0, -1.0, double.nan, double.infinity, double.negativeInfinity]) {
  expect(() => ReviewConfirmation(consumedAmount: value), throwsArgumentError);
}
```

- [x] **Step 2: Witness RED**

Run: `fvm flutter test test/food_detail/food_crud_test.dart test/review/review_screen_test.dart`

Expected: FAIL because Review confirmation only sets status or rewrites a candidate without consumed amount/timestamps.

- [x] **Step 3: Implement one-update confirmation**

Keep the one-update/field assertions in `food_crud_test.dart`; augment its fake store with exact update-count/last-map capture. The Review widget fake only forwards the constructed `ReviewConfirmation` to its gateway. Require finite-positive consumed amount both at construction and the repository boundary, merge candidate fields only when selected, omit nullable candidate macros, set correction timestamps from the injected clock, and keep candidate choice independent from amount choice. The screen disables confirmation for absent/non-positive/non-finite existing amounts, prevents duplicate submissions while saving, and surfaces a safe retryable failure without navigating. Update only Review-specific E2E fixtures to carry a canonical tuple/consumed amount. Task 10 remains responsible for the amount-choice UI.

- [x] **Step 4: Verify GREEN**

Run: `fvm flutter test test/food_detail/food_crud_test.dart test/review/review_screen_test.dart`

Expected: PASS with a single in-memory datastore update witness. Request Antigravity post-task review before committing because the Review state transition changes persisted user data.

**Actual (2026-09-09):** the corrected frozen RED failed before test execution with the expected 14 compiler diagnostics across the two focused files because `ReviewConfirmation`, the three-argument repository/gateway contract, and nullable candidate macros did not yet exist. Initial GREEN passed **19/19** and exposed a stale-selection callback race, which was fixed by reading the current selection at invocation. Independent review then required a visible retry path and canonical Review E2E fixtures; the new failure/retry test witnessed **0/1 RED**, then **1/1 GREEN**. Final focused unit/widget verification passed **20/20**. After lint-only test/harness cleanup, the adversarial repository-boundary test passed **1/1**, formatting changed zero files, `git diff --check` passed, and focused analysis of all eight Dart/test files reported `No issues found` in `1289.8s`. The integration test could not execute because the pinned container had no supported device: Flutter found only unsupported Linux desktop and reported `No devices are connected`; this is an environment blocker, not E2E runtime proof. Independent final review returned `APPROVED: yes`, `MUST_FIX: none`. Mandatory read-only Antigravity post-review reused `calorix-review-confirmation-task8-20260909` with `gemini-3.8-flash` and returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. No Firebase production access/write, deployment, live provider, phone/device, or LocateAnything operation occurred.

- [x] **Step 5: Record, commit, and push**

Commit `Confirm reviewed nutrition amounts`, push, and record the single-update contract.

**Actual (2026-09-09):** committed as `e05f1f4c6ec6cb66109512c19d7fc80fd8f8aa57` (`Confirm reviewed nutrition amounts`) and pushed to `origin/fix/scan-photo-flow-viewer`; local and remote equality was verified. The scoped commit contains the four production files, two focused test files, two Review E2E fixture files, and same-stage tracking. Protected `.mcp.json` was not staged.

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
- Modify: `test/food_detail/serving_multiplier_test.dart`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Pure `AmountPresentation` formatting trusts only a valid canonical tuple and valid optional multipack metadata: package ml renders `500 ml bottle`, package g renders `250 g pack`, an agreeing multipack renders `6 × 250 ml · whole pack`, portion renders `full visible portion`, and per-100 renders `100 g reference` with `· amount required` while unresolved. Invalid/partial canonical-trigger entries render `Amount unavailable`; they never fall back to a serving multiplier or invented amount. Whole numbers omit `.0` and decimal values retain their exact concise form.
- In Food Detail edit mode, valid canonical entries expose `Key('canonical-amount-control')` and never serving `+`/`−`; pure legacy entries expose `Key('legacy-serving-stepper')` and retain the quarter-step clamp. In view mode these controls are absent and static text shows the canonical consumed amount/unit, `Amount required`, or the legacy serving amount. Invalid canonical-trigger entries remain fail-closed with no legacy controls.
- Canonical displayed calories/macros and displayed-to-base edit conversion use only the effective ratio `consumedAmount / nutritionAmount`, ignoring any retained legacy `servingMultiplier`; unresolved consumption blocks base-nutrition editing until a valid amount is supplied. Legacy display/edit conversion remains multiplier-based.
- `PendingEdits` keeps `consumedAmount` separate from `servingMultiplier`, validates finite-positive canonical amounts, and serializes only the field applicable to the entry kind. Repository `update` revalidates any present `consumedAmount` before the datastore touch; a malformed caller cannot bypass the UI boundary.
- Manual drafts require finite `kcal`/macros in the Firestore bounds and a finite-positive quantity. New custom and quick-add entries persist canonical `portion/1/portion`, `consumedAmount=quantity`, and `reviewReasons=[]`, with descriptive `servingSize` retained and no `servingMultiplier`. Repository creation repeats the numeric validation before its one datastore add.

**Task 9 pre-review ruling (2026-09-09):** read-only Antigravity conversation `calorix-canonical-amount-task9-20260909`, primary `gemini-3.8-flash`, first returned `AGREEMENT_STATUS: revise`. It required the explicit g/package and resolved per-100 formatting, invalid-canonical fallback, edit-versus-view key contract, repository numeric guards, non-finite draft rejection, canonical-ratio base-edit conversion, and mutually exclusive pending fields now specified above. The continued review returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none` before RED.

- [x] **Step 1: Write RED Food Detail/manual tests**

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

- [x] **Step 2: Witness RED**

Run: `fvm flutter test test/food_detail_sheet_test.dart test/manual/manual_entry_screen_test.dart`

Expected: FAIL because canonical entries still expose the multiplier stepper and lack the canonical amount control, while legacy entries do not yet receive the explicit legacy-stepper key.

**Actual (2026-09-09):** the first read-only Codex RED-review attempt failed before a verdict at `2026-09-09T21:41:44+02:00` with `usage_limit/no_verdict` and made no edit. The mandatory read-only Antigravity continuation found seven test-contract defects; after test-only correction it returned exact `SAFE_TO_FREEZE: yes`, `MUST_FIX: none`. Pinned Flutter 3.41.9 RED across the three focused files exited `1` with **6 passed / 4 failed**: Food Detail and repository files failed to load only on the intentionally absent `PendingEdits.consumedAmount` and entry-aware `toUpdateMap(entry)` API, while the executing manual suite had exactly two intended finite/bounds validation failures and all six existing/manual widget behaviors passed. Formatting and `git diff --check` passed. Production remained frozen.

- [x] **Step 3: Implement canonical display/edit branches**

Create the fail-closed presentation and static amount text from canonical amount/unit metadata. In edit mode, use exact finite-positive consumed-amount editing for valid canonical records and the old quarter-step control only for `usesLegacyServingMultiplier`; unresolved canonical records accept amount editing before base-nutrition editing, while invalid canonical tuples expose neither edit mechanism. Scale canonical display and displayed-to-base edits by the effective canonical ratio, never a retained multiplier. Make `PendingEdits.toUpdateMap` entry-kind-aware so canonical and legacy amount fields are mutually exclusive. Revalidate present `consumedAmount` in repository updates. Manual draft/provider/repository validation rejects non-finite or out-of-bound numbers; manual entries write `portion/1/portion`, `consumedAmount` equal to the entered quantity (for example `1.5`), `reviewReasons=[]`, and no `servingMultiplier`.

**Actual (2026-09-10):** Food Detail now renders fail-closed package/portion/per-100 presentation, uses a canonical amount control only for valid canonical tuples, keeps the legacy quarter-step control only for pure legacy entries, and scales display/base edits by `consumedAmount / nutritionAmount`. `PendingEdits` serializes only the entry-kind-appropriate amount field; the repository revalidates present canonical amounts before datastore access. Manual draft and repository creation enforce finite Firestore bounds and persist canonical `portion/1/portion` consumption with no legacy multiplier. `manual_entry_screen.dart` required no production change because its existing save path already delegates through the corrected provider/repository boundaries. The serving-multiplier unit test received the mechanical entry argument required by the new entry-aware `toUpdateMap(entry)` API.

- [x] **Step 4: Verify GREEN**

Run: `fvm flutter test test/food_detail_sheet_test.dart test/manual/manual_entry_screen_test.dart`

Expected: PASS; presentation does not persist any UI suggestion list. Request Antigravity post-task review before committing because Food Detail/manual persistence and visible controls change together.

**Actual (2026-09-10):** initial serial GREEN passed **73/73** and the first eight-item analyzer reported `No issues found` in `1375.6s`. Independent review then found that detected-item metadata hid the canonical package/reference label and malformed persisted `consumedAmount` values could display invalid text or throw on infinity. The bounded review-fix RED was **0 passed / 7 failed**, including the exact `Infinity or NaN toInt` crash; the same seven tests then passed **7/7** after sanitizing the effective consumed amount and rendering item metadata plus canonical amount as separate rows. Final pinned Flutter 3.41.9 verification ran serially with `--concurrency=1` and passed **80/80** in `15m51s`; final focused analysis reported `No issues found` in `917.2s`; formatter changed zero files after the final source correction and `git diff --check` passed. One earlier consolidated verifier was intentionally stopped and excluded when the host observed two parallel `flutter_tester` isolates; the authoritative reruns were serial to protect the Pi. Final independent review returned `MUST_FIX: none`. Mandatory Antigravity review conversation `calorix-canonical-amount-task9-20260909` had a primary `gemini-3.8-flash` timeout at `2026-09-10T08:16:19+02:00`; fallback `gemini-3.7-flash` returned exact `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. After the defensive review fixes, `gemini-3.8-flash` returned the same exact green verdict. Its wrapper claimed it launched a Flutter-location command despite the read-only prompt; this is recorded as response noise, not verification evidence, and independent `git status` found no reviewer mutation. No Firebase production access/write/deploy, provider inference, phone/device action, or LocateAnything call occurred.

- [x] **Step 5: Record, commit, and push**

Commit `Edit canonical nutrition amounts`, push, and record focused UI tests.

**Actual (2026-09-10):** implementation and same-stage verification/tracking were committed as `030620aa84e0bda85aa6f2cd56a3665c22830e94` (`Edit canonical nutrition amounts`) and pushed to `origin/fix/scan-photo-flow-viewer`; exact local/remote equality was verified. The commit contains the four production files, four focused test files, and the two authoritative tracking files. Protected `.mcp.json` was not staged.

### Immediate priority gate: Evaluate current food-tracking accuracy before Task 10

The user approved this ordering on 2026-09-10 because food/calorie tracking is the product's core functionality. This gate is now blocking for Task 10 even though the evaluation runner itself was implemented under Task 6. It is a public-only, side-effect-free live provider evaluation: no Firebase read/write, deployment, notification, production account, device action, or private-fixture fabrication is permitted.

- [x] **Step 1: Record source, credentials, and public-only scope**

Require branch `fix/scan-photo-flow-viewer`, record the pushed source SHA, preserve the user-owned `.mcp.json`, verify ADC without printing a token, and leave `CALORIX_NUTRITION_EVAL_PRIVATE_MANIFEST` unset. Use source-default `gemini-2.5-flash`, project `calorix-xurschnell`, location `us-central1`, and exactly one sample across 20 public cases.

- [x] **Step 2: Re-run deterministic evaluation gates**

Run: `cd functions && npm run eval:nutrition:fixtures && npm run build && npm run lint`

Expected: all deterministic evaluation fixtures, TypeScript build, and lint pass before paid/quota-consuming inference.

**Actual (2026-09-10):** branch/source/remote were exactly `fix/scan-photo-flow-viewer` / `c7643adf37b489af1c389b2a886ceff953fefd45`; ADC and read-only project access succeeded without exposing a token; the private-manifest environment variable was unset; the manifest contained exactly 20 public / 0 private cases (12 meal, 4 barcode, 4 label). The deterministic gate passed **281 tests / 1 intentional skip** across nine files, followed by clean TypeScript build and ESLint. Protected `.mcp.json` remained the sole dirty path and no provider/Firebase/device operation occurred.

- [x] **Step 3: Run the post-change public live evaluation**

Run from `functions/` with `RUN_NUTRITION_EVAL_LIVE=1`, explicit project/location/model/current pushed code SHA, no private manifest, and `npm run eval:nutrition:baseline -- --samples 1`.

Expected: one ignored local report containing exactly 20 public / 0 private cases. The report is evidence, not a release claim and not a replacement for the historical pre-change baseline.

**Actual (2026-09-10):** run `run-2026-09-10T16-11-10-437Z` completed over exactly 20 public / 0 private cases, one uncached sample each, with `gemini-2.5-flash`, prompt hash `205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263`, dataset hash `ca5c9e3bd552fcf30311c9de558519a24a7bad1f934b5f77ee2e1285e9462d4e`, and pushed code SHA `3bbfc8d35fa48ceccc0e07851d2f038a74b7e9df`. It wrote only the ignored local report/cache and made no Firebase/deployment/device change.

- [x] **Step 4: Inspect every case and apply the safety gate**

Require 20/20 accounted cases, inspect every case row, and record parse/failure categories, calorie and macro errors, basis/barcode accuracy, Review rate/reasons, catastrophic cases, unsafe completions, latency, prompt/model/dataset/code identity, and privacy status. Target interpretation is 20/20 parse, zero model/schema/normalization failures, zero unsafe completions, and every catastrophic error routed to `needs_review`; aggregate accuracy must improve directionally over the 2026-09-02 pre-change run. Because the prompt hash changed, any formal comparison remains incompatible rather than inventing numeric deltas.

**Actual (2026-09-10):** gate failed. All 20 rows were inspected: 15 parsed, 5 failed as `schema/model_response_invalid`, median/p90 absolute kcal error `44.127243/271.448156`, median/p90 relative kcal error `42.80%/101.26%`, mean macro relative error `52.39%`, Review rate `20%`, catastrophic count `4`, unsafe-completion count `2`, and latency min/median/p90/max `5283/12857/19914/24833` ms. Median and macro error improved over the pre-change run, but parse count and catastrophics did not improve, p90 relative error slightly worsened, and unsafe completions increased from one to two. Formal comparison is incompatible because the prompt hash changed. One unsafe case was a catastrophic rice mass overestimate (`234` vs `97.5` kcal) auto-completed at confidence `0.9`; the other was a label-only image whose ungrounded model-asserted `750 g` package total auto-completed. Three of four barcode cases contain no visible barcode and all four lacked `suppliedBarcode`, so they tested phantom vision OCR rather than the intended OFF/catalog path. Raw diagnostic probes were not persisted; privacy-safe reasons showed missing/null package evidence and a null detected-item weight, while one initially failed label case parsed on retry.

- [ ] **Step 5: Correct accuracy/safety failures before continuing**

If the gate exposes a product defect, create a bounded test-first correction slice, obtain the required pre/post reviews, rerun affected offline tests and the same public live evaluation, and do not start Task 10 until the safety contract is green or an exact external blocker is recorded. Vitamin Well remains a required private regression and later physical end-to-end case; never claim it is covered by these 20 public cases.

Mandatory read-only Antigravity conversation `calorix-postchange-live-eval-correction-20260910`, primary `gemini-3.8-flash`, initially returned `AGREEMENT_STATUS: revise` with five plan corrections. The continued review accepted strict detected-item weights, null-to-absent package evidence, per-source structured schemas, label and temporary meal Review fail-safe behavior, explicit catalog-only barcode scope, and the separated TDD slices; final verdict was `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. Implement independently and verify each slice:

- [x] **Slice A — evaluation semantics and diagnostics:** RED then GREEN privacy-safe parse reason/path reporting; mark the four existing OFF barcode fixtures as supplied-barcode catalog/package cases and explicitly exclude them from OCR proof. Preserve strict normalization and add no raw model text to reports.
- [x] **Slice B — structured provider output:** RED then GREEN distinct top-level meal versus package/label/barcode JSON schemas through `responseMimeType: application/json`, `responseJsonSchema`, and `temperature: 0`; retain strict Zod/source validation after the provider. Unknown detected-item weight means omit the item, never null or fabricated zero.
- [x] **Slice C — unresolved label safety:** RED then GREEN canonicalization of null package observation pairs to absent; allow non-meal per-100 results without independently observed package quantity to remain unresolved with no `consumedAmount` and `package_quantity_missing`; route all vision-derived label results to Review using the production normalizer as the single source of truth.
- [x] **Slice D — meal calibration and fail-safe:** measure structured-output behavior over the 12 meals; until a validated uncertainty signal exists, route vision meal drafts to Review with `nutrition_basis_ambiguous`, retain numeric error visibility, update push-state tests, and do not claim this improves estimate accuracy.

- [ ] **Step 6: Record, commit, and push the evaluation checkpoint**

Commit only privacy-safe tracking and any reviewed source/tests from correction slices. Never commit `.nutrition-eval`, private images/manifests, credentials, provider payloads, or the protected `.mcp.json`.

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
