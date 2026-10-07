# Calibration report-complete journal implementation plan

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development with the mandatory AGENTS.md editing-worker route. Steps use checkbox tracking. Continue the approved parent design autonomously; workers never commit or push.

**Goal:** Preserve privacy-safe full image predictions in the existing durable journal and reconstruct only digest-bound completed predictions after a restart, without mistaking legacy numeric-only journals for complete reports.

**Architecture:** Add an explicit optional `reportPrediction` extension to `JournalEntry`. A shared pure codec captures closed own-data records, validates against the unchanged prediction schema plus privacy/binding constraints, and produces owned canonical data. Existing six-field journals and their hashes remain unchanged; extended entries retain their seventh field through file-store, strict-ledger and pre-pin session seams. A strict-only accessor returns completed report predictions or fails closed if required metadata is absent.

**Tech Stack:** TypeScript, Node crypto/fs, existing Zod3 schemas and Vitest; no new dependency.

**Spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`; bounded prerequisite of parent Task7, not whole-driver/default activation.

**Baseline:** branch `fix/scan-photo-flow-viewer`, source checkpoint `b5a111190e9647952640dcafc6aedd89de51257f`, tracking HEAD `42e5266a6315615927e65ed796e8f7565b09dd16`; full1896pass/1existing skip. Completed snapshot-startup plan is not reopened.

## Global Constraints

- Provider identity remains `calorix-xurschnell` / `us` / `gemini-3.8-flash` / APIv1. This slice constructs no provider and sends no request.
- No new2.5 calls; saved historical aggregates only. Planned146 image calls, hard ceiling300; no routing, budgets, stage gates, retries or default changes.
- Preserve prompts/schema/parser/normalizer/Review policy, generic report compatibility, existing journal hashes and current preflight primitive behavior when the extension is absent.
- Never persist names, raw responses/prompts/images, endpoint URLs, credentials, errors/causes/stacks, paths or arbitrary caller fields. `reportPrediction` is explicit closed schema data, not a spread of provider output.
- `.mcp.json` stays byte-identical, unread except SHA check, unstaged. Main edits planning/tracking only; source/tests use workers. No deploy/cloud data/client/device/UI/emulator operation.
- Continue existing feature checkout; no new worktree/dependency installation. Serial tests use verified disk-backed task TMPDIR and logs under `.superpowers/sdd/2026-10-07-calibration-report-journal/`; never large `/tmp` artifacts.
- Six-field legacy journals remain usable by old APIs, but cannot silently satisfy the new full-report accessor. Optional means absent; a present undefined/null/malformed seventh field is rejected rather than stripped.
- No production-readiness/live accuracy/full-stage report/146/60 proof from this slice. The future driver still owns all image/barcode outcome coverage, manifest-source binding and stage report creation/hash persistence.

## Review Focus

1. A seventh-field mutation or removal after completion must invalidate its journal digest on strict replay; pending/uncompleted or alternate same-key rows must not become report outcomes.
2. Hostile getters/proxies, hidden/symbol/unknown fields and caller mutation must be rejected or captured without exposing private errors, including validation before any model-version pin or durable append.
3. Diagnostics, zero-truth macros, decisions, Review reasons and measured latency must survive disk restart and reproduce unchanged scorer results, not merely match call counts.
4. Legacy six-field data retains exact serialization/hash/normal behavior; the full-report accessor must fail rather than invent missing metadata or classify it as complete.
5. Failed predictions retain only stable allowlisted failure data and agree with their outer category/null-numeric/n-a version; successful metadata must agree with outer nutrients/sample/latency. No live effect is needed to demonstrate these boundaries.

## Task 1 — Closed full prediction journal and completed-only reconstruction

**Files:** create `functions/src/nutrition-eval/calibration-report-journal.ts`; create `functions/test/nutrition-eval/calibration-report-journal.test.ts`; modify `functions/src/nutrition-eval/calibration.ts`, `calibration-file-store.ts`, `calibration-preflight-session.ts`; add focused cases in existing `calibration-protocol-session.test.ts` only if its real-file fixture is reused; update this plan/status. No other source files.

**Interfaces:**

```ts
// Pure codec; type-only imports avoid a calibration.ts runtime cycle.
export function captureCalibrationReportPrediction(value: unknown): NutritionPrediction;
export function captureCalibrationReportJournalEntry(value: unknown): JournalEntry;
// JournalEntry keeps the original six fields, plus this optional extension:
reportPrediction?: NutritionPrediction;
// Strict protocol ledger only; do not alter CalibrationLedger legacy callers.
export interface CalibrationCompletedReportPrediction {
  readonly key: ReservationKey;
  readonly prediction: NutritionPrediction;
}
getCompletedReportPredictions(): readonly CalibrationCompletedReportPrediction[];
```

### Closed prediction format

Top-level allowed keys, canonical order: `parseStatus,source,kcal,proteinG,carbsG,fatG,confidence,basis,amount,unit,barcode,decision,reviewReasons,failureCategory,failureCode,failureDetail,latencyMs,sampleIndex,cached,diagnostics`. Require `parseStatus`, `source`, `decision`, `latencyMs`, `sampleIndex`, `cached`; cached must be false, sample1..3, latency finite nonnegative. Use the unchanged `NutritionPredictionSchema` on the already-owned snapshot to retain its diagnostic/allowlisted failureDetail semantics.

Success requires four finite nonnegative nutrient values and a canonical basis/amount/unit tuple (`isCanonicalNutritionTuple`), decision complete or needs_review, no failure fields. A meal success must remain needs_review. Confidence remains optional and follows the unchanged schema. Barcode, if supplied, must match `^[0-9]{8,14}$`; arbitrary strings are rejected. Review reasons use the existing seven schema enum values only. Complete decisions cannot carry nonempty Review reasons.

Failure requires decision error and a known category/code pairing; no success nutrient/tuple/confidence/barcode/review/diagnostic fields. Pairings: schema → `model_response_invalid,nutrition_normalization_invalid,prediction_schema_invalid`; provider → `provider_request_failed`; product → `off_product_invalid,off_product_not_found`; dataset → `dataset_private_asset_unavailable,dataset_media_mismatch,dataset_dimension_mismatch,dataset_checksum_mismatch,dataset_invalid_config,dataset_fetch_failed,dataset_write_failed,dataset_load_failed`. Cache failures are not valid calibration results. Parser failureDetail is optional only where the existing schema permits it; no new free-text field.

Diagnostics allowed keys: `rawNutrients,detectedItemCount,estimatedTotalMassG,declaredBasis,declaredAmount,declaredUnit,observedAmount,observedUnit,packageReference,per100Reference,servingReference`. Nutrient vectors have exactly kcal/proteinG/carbsG/fatG, references add amount/unit. Existing diagnostic schema enforces finite/range/canonical/all-or-none semantics. No diagnostic names/text/candidates/items/boxes/raw response.

Own-data snapshots must reject accessor properties before evaluating getters, extra nonenumerable/symbol/inherited properties, nonplain prototypes and malformed arrays. Required record data comes from captured descriptors, not caller property gets. The only array is Review reasons, with dense own data indices and the normal length property, no extra keys. Validate/copy every nested value before freezing any caller-supplied object; freeze only owned outputs recursively. Every codec failure is a fresh causeless `CalibrationFatalError('calibration:report-journal-invalid')`, never inspecting or rethrowing the foreign exception.

### Extended entry binding

Require exactly seven own data fields in canonical original-six order plus `reportPrediction`; capture an exact key with stage/profile/caseId/sampleIndex and the existing stage/sample/token patterns. Preserve the original six-field validation contract for callers without the extension.

For an extended success (`errorCategory:'none'`), normalizedPrediction has the exact four canonical nutrient keys plus optional estimatedTotalMassG, no calories alias. Values equal reportPrediction's four nutrients and, if present, diagnostics.estimatedTotalMassG. `predictionHash` equals SHA256 of the canonical numeric projection, as before; version follows the existing bounded model-version contract. Extended failure requires null numerics, predictionHash=errorCategory, version=`n/a`, report parseStatus failure. Both require report sampleIndex=key.sampleIndex and latencyMs=analysisLatencyMs. Preserve every approved optional report field; never silently strip it.

- [ ] **Step 1: Tests only.** Add closed codec fixtures and extended real-file strict-ledger restart tests. Reuse real filesystem helpers and valid canonical keys from existing protocol-session tests, not a mock ledger. Tests trap global fetch/provider/cache and use task disk TMPDIR. Include all five focus groups and current six-field preservation. No source edits until host RED.

```ts
const prediction = {
  parseStatus: 'success' as const, source: 'meal' as const,
  kcal: 120, proteinG: 10, carbsG: 0, fatG: 8,
  confidence: 0.8, basis: 'portion' as const, amount: 1,
  unit: 'portion' as const, decision: 'needs_review' as const,
  reviewReasons: [], latencyMs: 17, sampleIndex: 1, cached: false,
  diagnostics: {
    rawNutrients: { kcal: 120, proteinG: 10, carbsG: 0, fatG: 8 },
    detectedItemCount: 1, estimatedTotalMassG: 90,
    declaredBasis: 'portion' as const, declaredAmount: 1,
    declaredUnit: 'portion' as const,
  },
};
const copied = captureCalibrationReportPrediction(prediction);
expect(copied).toEqual(prediction);
expect(copied === prediction).toBe(false);
expect(Object.isFrozen(copied.diagnostics?.rawNutrients)).toBe(true);
// For a real file-backed strict fixture after reserve/pin/append/complete:
expect(restarted.getCompletedReportPredictions()).toEqual([{ key, prediction }]);
expect(scoreNutritionCase(evalCase, restarted.getCompletedReportPredictions()[0]!.prediction))
  .toEqual(scoreNutritionCase(evalCase, prediction));
```

Explicit cases: numeric-only completed journal accessor rejection; pre-completion rows excluded; altered/removed metadata digest rejection; reordered caller keys canonical hash stability; hostile top/nested descriptor/ownKeys/foreign fatal/proxy errors and hidden/symbol keys with zero append/pin; post-call original/returned nested mutation cannot change replay; optional present undefined/null rejected; numeric/sample/latency/mass mismatch; valid parser/provider failure and invalid/raw failure code/detail; exact legacy journal JSON and hash preserved. Do not count existing-protection characterization cases as new RED.

- [ ] **Step 2: Witness host RED.** Main runs focused command below, verifies existing suites remain green and new failures are missing exports/method or rejected seventh-field behavior, corrects fixture mistakes through worker, checks source/protected hashes and new-test lint.
- [ ] **Step 3: Source only.** Implement the pure codec and narrow optional-field routing at all three serialization/snapshot seams. Detect the extension with a captured own descriptor inside a static guard; never use a spread/getter or ignore nonenumerable optional metadata. In strict append/replay and pre-pin session, validate full extended entry before effects and preserve the exact same owned snapshot. Extend JournalEntry type and only the strict protocol interface.

```ts
// Routing shape at each existing journal boundary; codec owns the seventh-field path.
const descriptor = Object.getOwnPropertyDescriptor(entry, 'reportPrediction');
if (descriptor !== undefined) {
  return captureCalibrationReportJournalEntry(entry);
}
// Otherwise continue the existing six-field snapshot/validation unchanged.
```

For strict accessor, call checkPoison, traverse reservationOrder, collect only status completed rows via their recorded journalHash and journalByHash entry, require reportPrediction on every collected terminal, validate/copy through codec and return a frozen array of owned key/prediction copies. Missing metadata throws fresh static `calibration:report-prediction-missing`; no partial return, write/reserve/retry/pin. The existing counts-only rebuildReport and interrupted recovery remain unchanged. Barcodes have no reservation keys; their twelve deterministic outcomes and whole report coverage remain future driver responsibility, not synthetic image reservations.

- [ ] **Step 4: Host GREEN and independent review.** Run focused/full Functions/build/lint, whitespace/protected SHA checks. One fresh native read-only whole bounded-plan review plus mandatory same-workstream Antigravity CODE/result review; apply Important/Critical in one tests-first pass, ledger minors/rulings. Do not accept worker summaries alone.
- [ ] **Step 5: Checkpoint.** Update this plan/status, commit only selected source/test/docs with `Preserve report predictions in calibration journals`, push exact branch/live-origin equality, then task-done full suite and tracking-close. Continue parent driver/report assembly; no live/default activation from this slice.

Focused RED/GREEN:

```bash
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1 test/nutrition-eval/calibration-report-journal.test.ts test/nutrition-eval/calibration.test.ts test/nutrition-eval/calibration-file-store.test.ts test/nutrition-eval/calibration-protocol-session.test.ts test/nutrition-eval/calibration-cli.test.ts
```

Expected RED: only new behavior missing/rejected; existing suites green. Expected GREEN: every focused case passes. Whole-task verification: `npm --prefix functions run build`, `npm --prefix functions run lint`, `npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1`; exit0, only existing public-manifest skip. Flutter/APK/UI/live/emulator gates intentionally omitted for unused offline Functions plumbing; parent full CLI test:verify remains a later activation gate.

## Review and sequencing

New workstream `calorix-report-journal-20261007`; pre-review pending, strongest canonical MCP3.8 then3.7/3.6 only on exact recorded failures. No source/test implementation until PLAN agree/none. Main retains requirements/judgment/verification/commit/push, workers edit only.

The current preflight primitive still produces legacy numeric-only entries unless later explicitly wired to full metadata. This slice must not claim that preflight/driver reports are now complete. Stage builders, source-bound case identity, all interrupted/provider/nonreservation outcomes, twelve barcode rows, exact stage hashes, whole-driver146/60 proof and live qualification remain parent gates.
