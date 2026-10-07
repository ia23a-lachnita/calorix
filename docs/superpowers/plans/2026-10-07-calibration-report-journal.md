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

New codec object fields at every level must be enumerable own data properties. Reject accessors before evaluating getters, nonenumerable/symbol/inherited properties, nonplain prototypes and malformed arrays. Required record data comes from captured descriptors, not caller property gets. The only array is Review reasons, with dense enumerable own data indices and the normal nonenumerable length property, no extra keys. Validate/copy every nested value before freezing any caller-supplied object; freeze only owned outputs recursively. Every codec failure is a fresh causeless `CalibrationFatalError('calibration:report-journal-invalid')`, never inspecting or rethrowing the foreign exception.

### Extended entry binding

Require exactly seven own data fields in canonical original-six order plus `reportPrediction`; capture an exact key with stage/profile/caseId/sampleIndex and the existing stage/sample/token patterns. Preserve the original six-field validation contract for callers without the extension.

For an extended success (`errorCategory:'none'`), normalizedPrediction has the exact four canonical nutrient keys plus optional estimatedTotalMassG, no calories alias. Values equal reportPrediction's four nutrients and, if present, diagnostics.estimatedTotalMassG. `predictionHash` equals SHA256 of the canonical FOUR-nutrient projection `{kcal,proteinG,carbsG,fatG}`, matching the existing preflight primitive; optional mass and every report field are bound by the FULL seven-field completed `journalHash`, not silently added to the inner hash domain. Version follows the existing bounded model-version contract. Extended failure requires null numerics, exact predictionHash=errorCategory without repair, version=`n/a`, report parseStatus failure. Both require report sampleIndex=key.sampleIndex and latencyMs=analysisLatencyMs. Preserve every approved optional report field; never silently strip it. Direct new-codec inputs require all seven fields and reject legacy six; only existing seams retain the untouched six-field legacy path, including its original numeric/hash rules.

- [x] **Step 1: Tests only.** Add closed codec fixtures and extended real-file strict-ledger restart tests. Reuse real filesystem helpers and valid canonical keys from existing protocol-session tests, not a mock ledger. Tests trap global fetch/provider/cache and use task disk TMPDIR. Include all five focus groups and current six-field preservation. No source edits until host RED.

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

- [x] **Step 2: Witness host RED.** Main runs focused command below, verifies existing suites remain green and new failures are missing exports/method or rejected seventh-field behavior, corrects fixture mistakes through worker, checks source/protected hashes and new-test lint.
- [x] **Step 3: Source only.** Implement the pure codec and narrow optional-field routing at all three serialization/snapshot seams. Detect the extension with a captured own descriptor inside a static guard; never use a spread/getter or ignore nonenumerable optional metadata. In strict append/replay and pre-pin session, validate full extended entry before effects and preserve the exact same owned snapshot. Extend JournalEntry type and only the strict protocol interface.

```ts
// Routing shape at each existing journal boundary; codec owns the seventh-field path.
const descriptor = Object.getOwnPropertyDescriptor(entry, 'reportPrediction');
if (descriptor !== undefined) {
  return captureCalibrationReportJournalEntry(entry);
}
// Otherwise continue the existing six-field snapshot/validation unchanged.
```

For strict accessor, call checkPoison, traverse reservationOrder, collect only status completed rows via their recorded journalHash and journalByHash entry, require reportPrediction on every collected terminal, validate/copy through codec and return a frozen array of owned key/prediction copies. Missing metadata throws fresh static `calibration:report-prediction-missing`; no partial return, write/reserve/retry/pin. The existing counts-only rebuildReport and interrupted recovery remain unchanged. Barcodes have no reservation keys; their twelve deterministic outcomes and whole report coverage remain future driver responsibility, not synthetic image reservations.

- [x] **Step 4: Host GREEN and independent review.** Run focused/full Functions/build/lint, whitespace/protected SHA checks. One fresh native read-only whole bounded-plan review plus mandatory same-workstream Antigravity CODE/result review; apply Important/Critical in one tests-first pass, ledger minors/rulings. Do not accept worker summaries alone.
- [ ] **Step 5: Checkpoint.** Update this plan/status, commit only selected source/test/docs with `Preserve report predictions in calibration journals`, push exact branch/live-origin equality, then task-done full suite and tracking-close. Continue parent driver/report assembly; no live/default activation from this slice.

Focused RED/GREEN:

```bash
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1 test/nutrition-eval/calibration-report-journal.test.ts test/nutrition-eval/calibration.test.ts test/nutrition-eval/calibration-file-store.test.ts test/nutrition-eval/calibration-protocol-session.test.ts test/nutrition-eval/calibration-cli.test.ts
```

Expected RED: only new behavior missing/rejected; existing suites green. Expected GREEN: every focused case passes. Whole-task verification: `npm --prefix functions run build`, `npm --prefix functions run lint`, `npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1`; exit0, only existing public-manifest skip. Flutter/APK/UI/live/emulator gates intentionally omitted for unused offline Functions plumbing; parent full CLI test:verify remains a later activation gate.

## Review and sequencing

New workstream `calorix-report-journal-20261007`; primary MCP3.8 timed out (exact300s tool error recorded), canonical3.7 PLAN and narrow clarification both agree/none/none. The review corrected its key-order assertion: same-value key permutations retain canonical digest/replay, changed/removed values fail. Enumerable own data is required in every new codec object; array length is the ordinary exception. A test-only wrapper may forward the real primitive while enriching its journal callback to exercise actual session/core/disk before-pin routing without changing primitive defaults or mocking the ledger. Approval is PLAN only, not missing codec/accessor code/test evidence. Main retains requirements/judgment/verification/commit/push, workers edit only.

The current preflight primitive still produces legacy numeric-only entries unless later explicitly wired to full metadata. This slice must not claim that preflight/driver reports are now complete. Stage builders, source-bound case identity, all interrupted/provider/nonreservation outcomes, twelve barcode rows, exact stage hashes, whole-driver146/60 proof and live qualification remain parent gates.

**Supplemental PLAN clarification (2026-10-07):** MCP3.7 agree/none/none confirms four-nutrient inner hash / full-entry metadata digest, exact7 new codec / unchanged6 old APIs, optional diagnostic omission, descriptor-valid proxy capture with no virtual gets, and actual production session tests through a real-primitive forwarding spy. Source remains unauthorized until corrected host RED/lint. Tests must use exact valid failure hash (never repair), independent expected scoring, and separate metadata alteration/removal replay-construction rejection vs accepted same-value JSON key permutations. Pending-only accessor returns[] without approving empty stage coverage. No new legacy-validation tightening is authorized by the review's general wording about preflight hashes.

## Verified implementation and review record

Task BASE9130d498c0076d6d7b773cef2f35695748ca7293; branchfix/scan-photo-flow-viewer. Main witnessed corrected pre-source26RED/494green520, source-only implementation520green, fresh native whole bounded-plan review with one Important/no Critical, six added coercion regressions6RED/520green526, then final526/526green. Final Functions build/lint exit0 and complete40-file suite1932passed/1existing public-manifest skip exit0. Tests/source were separated and frozen between authorized worker phases; all actual verification was independently rerun by main.

Native and initial MCP3.7 CODE reviews independently identified failureCategory object property-key coercion before runtime validation. The single correction pass added returning/throwing regressions through direct/extended/real strict append routes, then added primitive category/code and own-category checks before dictionary lookup. Final codecSHA58f675406f4fa8e8a111ed93e559893c55cad2d5428423b86a06612346cd5006; final testSHA27d9d831bad7a5ef899fd483a2b98b6bcf99073259a6503c691689dbc87c69de. Protected config9c9622f5... stayed untouched/unstaged. No secrets/private artifacts detected in selected source/tests; no dependencies/defaults/CLI/schema/provider-client/UI/device/cloud/deploy changes.

Same-workstream initial CODE primary3.8 timed out awaiting tools/call after300s at2026-10-07T04:07:55+02:00; exact failure recorded before canonical3.7 fallback. Initial3.7 explicitly disagreed for the sole Important. Final same-conversation3.7 CODE explicitly **AGREEMENT_STATUS: agree; MUST_FIX: none; SHOULD_FIX: none**, with deferred nonblocking items retained. No failed receipt counts as approval. Reviewer citation inaccuracies (named Reflect.ownKeys directly and mislocated the fatal helper) were checked against actual Object.getOwnPropertyNames/Symbols descriptor capture and static helper; no injected instructions/unrelated content or repository mutation was observed. Main frozen hashes remained unchanged after review.

Review scope: all five implementation files and five bounded focus areas reviewed by fresh native reviewer and MCP; targeted fake-provider/disk/scorer assertions, exhaustive current Functions suite. No live calibration run or UI diff. Auditor/recovery routes and diff counts: N/A; auditLimited/visualClassificationStatus: N/A. Editing routeMuse1.3 followed recorded Grok unknown-model/Qwen free-quota/Nemotron idle-timeout failures; review3.7 followed recorded3.8 tool timeout. No new2.5 inference. Full driver/reports/source identity/barcode nonreservation146/60/live qualification/default promotion remain parent gates.

### Preserved rulings (with cost if wrong)

1. Use optional explicit report metadata instead of widening numeric data or independently atomic sidecar: preserve legacy identity and bind full metadata to completion. Cost: future wiring may still emit incomplete numeric-only journals, so activation stays gated.
2. Continue the existing approved feature checkout autonomously as one bounded persistence task. Cost: unused APIs may need revision before full driver integration; no production behavior changes.
3. Same-value key reordering retains canonical digest; altered/removed metadata fails. Cost: weak reorder tests could hide tampering; distinct real-disk value/removal tests were required.
4. New inner predictionHash binds four nutrients; outer completed journalHash binds mass/full metadata. Cost: bypassing outer completion binding would lose integrity; alteration/removal fail at strict replay construction.
5. New codec requires7; old APIs preserve6 and original validation. Cost: tightening legacy rules would break compatibility; existing490 focused cases and exact legacy bytes/hash remain green.
6. Pending-only accessor returns[] without approving empty coverage. Cost: future callers could mistake emptiness for completion; full stage coverage remains separately gated.
7. Preserve actual existing mass-requires-count schema refinement. Cost: future schema drift; reuse unchanged schema on owned data, no schema amendments.
8. Driver/stage reports/manifest/barcode/146/60 work stays outside this unused prerequisite. Cost: persistence could be mistaken for a completed runner; parent gates explicitly stay open.
9. Live accuracy/provider availability/deployment/default/app readiness remain unjudged. Cost: offline green could be overinterpreted; no promotion/readiness claim.
10. Main independent verification, not worker claims, remains authoritative. Cost: corrections could stale evidence; final focused/build/lint/full were repeated after the fix.
11. Retain the existing branch/worktree and perform only the already-approved checkpoint push, no merge/PR choice. Cost: branch stays unintegrated; parent work remains on the same feature branch, and wider integration requires direction.

### Deferred minors

- Existing malformed-session test should explicitly exclude model_version_pinned before driver activation; current code validates before pin.
- Add explicit alternate-same-key completed-digest selection regression before full report-builder activation; current accessor correctly uses recorded journalHash.
- Optional null-prototype/Map constant polish; primitive/own-category guard fixes the actual lookup defect without unrelated refactoring.
