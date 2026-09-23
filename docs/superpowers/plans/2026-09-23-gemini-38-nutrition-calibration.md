# Gemini 3.8 Nutrition Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and execute a reproducible, quota-bounded Gemini 3.8 nutrition calibration that selects LOW or MEDIUM on unseen public data, validates the frozen choice, and compares its final public benchmark only with verified historical Gemini 2.5 aggregates.

**Architecture:** Extend the existing dependency-injected nutrition evaluator with a model-aware generation profile, additive calibration report fields, deterministic Nutrition5k corpus generation, checksum-pinned local Open Food Facts replay, and a resumable stage ledger that reserves every image call before dispatch. A dedicated calibration CLI owns the fixed project/location/model, stage order, thresholds, and 300-call ceiling. The existing production defaults and generic evaluation commands remain unchanged; Gemini 2.5 is represented only by a checked-in aggregate reference and is structurally excluded from all calibration provider paths.

**Tech Stack:** TypeScript 5.5, Node 20 built-in `fetch`/`crypto`/`fs`, Zod 3, Vitest 2, `@google/genai` 2.19.0 on Vertex AI v1, official Nutrition5k metadata/splits/images, and existing Open Food Facts v3 snapshots.

**Spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`

## Global Constraints

- Never issue a new `gemini-2.5-flash` request of any kind: no `countTokens`, text, image, smoke, retry, comparison, or fallback call. The only 2.5 input is the verified historical aggregate reference from `run-2026-09-11T20-22-21-450Z`.
- Calibration provider identity is exact: Vertex project `calorix-xurschnell`, location `us`, model `gemini-3.8-flash`, API version `v1`. Reject aliases, alternate projects/locations, API-key routes, and automatic model fallback.
- Preserve production behavior: `DEFAULT_MODEL_CONFIG`, deployed Functions, Firestore, prompts, JSON response schema, normalization, Review routing, app code, and device flows do not change in this workstream. A `generateVision` call with no generation options must remain byte-for-byte request-compatible for **any** model string because Firestore may supply an arbitrary future model name.
- Keep the existing 12 Nutrition5k test meals frozen until Stage 3. Development and validation use only 40 disjoint official train-split dishes selected before inference.
- Default tests are hermetic. Upstream metadata/image verification and provider calls require explicit opt-in flags.
- Runtime images, provider responses, caches, reports, and calibration ledgers stay in ignored `.nutrition-eval/`; commit only public manifests, source locks, aggregate historical provenance, code, tests, and privacy-safe status summaries.
- Reserve an image call durably before dispatch. A crash or ambiguous provider outcome counts against the ceiling. Never retry silently. The stage ledger rejects a 301st reservation and any duplicate `(stage, profile, case, sample)` key.
- The planned and permitted image-call total for protocol v1 is exactly 146: Stage 0 `2`, Stage 1 `48`, Stage 2 `48`, Stage 3 `48`. `countTokens` is recorded separately and never performed against 2.5. The gap to the hard ceiling of 300 is a bug-containment guard, not authorization for reruns; any additional run requires a new approved protocol version.
- Calibration never reads or writes the provider-response cache. Every stage outcome records `cached: false`; cache-key hardening only prevents accidental cross-profile reuse in generic evaluator paths.
- Calibration sends each manifest image's real media type (`image/png` for Nutrition5k). The no-options production path retains today's hardcoded `image/jpeg` request for compatibility until a separate migration.
- Each profile/stage produces its own schema-valid report. Selection and stage decisions consume report hashes through the ledger rather than combining two profiles into one case array.
- Four supplied-barcode benchmark cases use committed checksum-pinned OFF snapshots. They load no image, call no vision model, and make no live OFF request.
- Every behavior change follows RED/GREEN TDD. After each bounded task, update `docs/implementation-status.md` and this plan, obtain required review, commit, and push. Workers edit but never commit or push.
- Keep protected user-owned `.mcp.json` byte-identical, untouched, and unstaged.

### Resolved protocol decisions

- Media labeling: calibration sends the manifest's actual `mediaType`; only the legacy no-options production path retains `image/jpeg`.
- Benchmark macro gate population: protein/carbohydrate/fat medians are computed over the `36` meal outcomes only, matching the meal-only validation modality. Label and exact barcode rows remain in overall/legacy benchmark metrics but cannot pad this gate.
- Ceiling headroom: protocol v1 is strictly one keyed pass with at most `146` image calls, including crash recovery of only never-reserved keys. The unused room below `300` is not available for an ambiguous-call retry or a second run.
- Model rollout: the first successful Stage 0 response pins `modelVersion`; a later version change permanently ends protocol v1 without rerun. Qualifying the rolled version requires a newly approved protocol version.
- Ingredient strata remain the approved one / two / three-plus bins; no spec amendment is needed.

---

## File Map

| File | Responsibility |
|---|---|
| `functions/src/genai-adapter.ts` | Resolve Gemini 2 versus Gemini 3 request configuration; expose token counting and a pre-dispatch vision hook without changing existing 2.5 callers. |
| `functions/src/nutrition-eval/live-adapter.ts` | Pass the exact calibration generation profile and preserve the existing parser/normalizer/OFF flow. |
| `functions/src/nutrition-eval/schema.ts` | Add optional historical-compatible truth, calibration identity, zero-safe summaries, call accounting, and historical deltas; refine calibration reports strictly. |
| `functions/src/nutrition-eval/scorer.ts` | Compute legacy metrics unchanged plus zero-safe per-macro, mass, and density aggregates. |
| `functions/src/nutrition-eval/runner.ts` | Bind profile/schema/location identity into cache keys and support calibration-only supplied-barcode image skipping and analysis-only latency timing. |
| `functions/src/nutrition-eval/historical-reference.ts` | Parse the strict aggregate-only 2.5 reference and calculate only supported deltas. |
| `functions/src/nutrition-eval/off-snapshot-store.ts` | Verify committed OFF snapshot checksums and serve supplied barcodes without network access. |
| `functions/src/nutrition-eval/calibration-corpus.ts` | Verify pinned official Nutrition5k metadata/split bytes and deterministically select the 24/16 train-split corpus. |
| `functions/src/nutrition-eval/calibration.ts` | Fixed profile selection, stage gates, stage transitions, call budget, and durable ledger schemas. |
| `functions/src/nutrition-eval/fatal-error.ts` | Typed fail-stop errors that cross adapter/runner catch boundaries without becoming scored provider failures. |
| `functions/src/nutrition-eval/calibration-cli.ts` | Dedicated `preflight`, `development`, `validation`, and `benchmark` entry point with exact provider identity. |
| `functions/src/nutrition-eval/report.ts` | Render additive calibration identity, zero-safe metrics, call accounting, and historical deltas. |
| `functions/eval/nutrition/calibration-source-lock.json` | Official source URLs and SHA-256 pins for train split and two dish metadata files. |
| `functions/eval/nutrition/calibration-manifest.json` | Exactly 24 development plus 16 validation public meal cases with pinned image metadata. |
| `functions/eval/nutrition/historical-reference-v1.json` | Strict verified 2.5 aggregate provenance; no fabricated case-level or per-macro values. |
| `functions/eval/nutrition/off-snapshot-lock.json` | SHA-256 map for the four supplied-barcode snapshots used in Stage 3. |
| `functions/test/genai-adapter.test.ts` | Hermetic request-shape and no-fallback tests. |
| `functions/test/nutrition-eval/*.test.ts` | Focused corpus, scoring, report, snapshot, runner, ledger, gate, and CLI tests. |
| `functions/package.json` | Add deterministic corpus verification and dedicated calibration scripts. |
| `.nutrition-eval/calibration/` | Ignored reports, image cache, responses, and durable stage ledger. |

## Task 1: Add model-aware Gemini request profiles

**Files:**
- Modify: `functions/src/genai-adapter.ts`
- Modify: `functions/src/nutrition-eval/live-adapter.ts`
- Modify: `functions/test/genai-adapter.test.ts`
- Modify: `functions/test/nutrition-eval/live-adapter.test.ts`
- Modify: `docs/implementation-status.md`

**Interfaces:**

```ts
export type Gemini3ThinkingLevel = 'LOW' | 'MEDIUM';

export type VisionGenerationProfile =
  | { kind: 'gemini-2'; temperature: 0 }
  | { kind: 'gemini-3'; thinkingLevel: Gemini3ThinkingLevel };

export function resolveVisionGenerationProfile(
  model: string,
  requestedThinkingLevel?: Gemini3ThinkingLevel,
): VisionGenerationProfile;

export interface VisionGenerationOptions {
  mode: 'calibration';
  thinkingLevel: Gemini3ThinkingLevel;
  imageMediaType: 'image/png' | 'image/jpeg';
  timeoutMs: number;
  beforeRequest?: () => Promise<void>;
  onResponseMetadata?: (metadata: { modelVersion?: string }) => void;
}
```

- [x] **Step 1: Write RED request-shape and compatibility tests.** Direct resolver tests require 2.5 to return `{ kind: 'gemini-2', temperature: 0 }`, exact 3.8 LOW/MEDIUM to return the matching Gemini 3 profile, 3.8 without a level to fail, and unknown models to fail. Separately, for arbitrary production model strings including `gemini-2.5-flash`, `gemini-3.8-flash`, and `firestore-future-model`, calling `generateVision` with no options must bypass that resolver and produce today's exact config: `temperature: 0`, no `thinkingConfig`, and `image/jpeg`. Only the explicit `{ mode: 'calibration' }` path invokes the resolver; it accepts exactly `gemini-3.8-flash`, requires LOW or MEDIUM, omits `temperature`, sends `thinkingConfig: { thinkingLevel }`, and uses the passed manifest media type. Prove `beforeRequest` runs exactly once immediately before `generateContent`, timeout is finite, and response `modelVersion` reaches the metadata callback without changing the returned text API.
- [x] **Step 2: Run RED.** Run `cd functions && npx vitest run test/genai-adapter.test.ts test/nutrition-eval/live-adapter.test.ts`. Expected: missing profile resolver/options and incorrect 3.x request config.
- [x] **Step 3: Implement the minimum adapter changes.** Add a trailing optional `VisionGenerationOptions` parameter to `generateVision`; preserve every current caller and bypass profile resolution entirely when it is absent. Thread the frozen calibration options through `createLiveNutritionEvalAdapter`. Do not change prompts, response schema, parser, normalizer, model defaults, or generic request media labeling.
- [x] **Step 4: Run GREEN and static checks.** Run `cd functions && npx vitest run test/genai-adapter.test.ts test/nutrition-eval/live-adapter.test.ts && npm run build && npm run lint`.
- [x] **Step 5: Review, track, commit, and push.** Verify `.mcp.json` hash, update status/checkboxes, obtain required post-implementation review, commit `Add model-aware vision profiles`, and push.

## Task 2: Extend result identity and zero-safe scoring

**Files:**
- Modify: `functions/src/nutrition-eval/schema.ts`
- Modify: `functions/src/nutrition-eval/scorer.ts`
- Modify: `functions/src/nutrition-eval/report.ts`
- Modify: `functions/test/nutrition-eval/schema.test.ts`
- Modify: `functions/test/nutrition-eval/scorer.test.ts`
- Modify: `functions/test/nutrition-eval/report.test.ts`
- Modify: `docs/implementation-status.md`

**Contract:** Historical version-1 reports must continue to parse. `NutritionCaseResult.truth` and all new summary fields are optional in the base schema, but a report carrying `calibration.protocolVersion: 'calorix-gemini-38-calibration-v1'` must contain the complete identity, truth, zero-safe metrics, and call-accounting set.

- [ ] **Step 1: Write RED scorer examples.** Hand-calculate positive-truth protein/carbohydrate/fat medians, zero-truth counts plus mean/median absolute error, a pooled mean zero-safe macro relative error over every eligible positive-truth `(outcome, macro)` pair, mean/median meal-mass relative error, and mean carbohydrate/fat density error. Mass/density aggregates include meal results only. Include a zero-truth macro whose prediction is nonzero to prove it is excluded from relative error but retained as absolute error, and expose diagnostic-coverage counts so later gates cannot silently shrink denominators.
- [ ] **Step 2: Write RED schema/report compatibility tests.** Parse `test/nutrition-eval/fixtures/historical-report-v1.json` unchanged. Reject calibration reports missing project, location, exact generation profile, schema hash, stage, call counts, truth, or a required zero-safe summary. Require Markdown and JSON to render the new fields without private paths/raw model text.
- [ ] **Step 3: Run RED.** Run `cd functions && npx vitest run test/nutrition-eval/scorer.test.ts test/nutrition-eval/schema.test.ts test/nutrition-eval/report.test.ts`.
- [ ] **Step 4: Implement additive metrics and refinement.** Keep legacy `meanMacroRelativeError` byte-for-byte semantically unchanged. Add truth to newly scored results, compute zero-safe summaries from exact truth with explicit eligible/coverage counts, and add strict calibration refinement without rewriting historical fixtures. Preserve one schema-valid report per profile/stage; do not serialize a combined LOW+MEDIUM case array that violates case-count invariants.
- [ ] **Step 5: Run GREEN.** Run the focused tests, then `cd functions && npm run build && npm run lint`.
- [ ] **Step 6: Review, track, commit, and push.** Commit `Add calibration scoring metrics` and push after green review.

## Task 3: Freeze the aggregate-only historical reference

**Files:**
- Create: `functions/eval/nutrition/historical-reference-v1.json`
- Create: `functions/src/nutrition-eval/historical-reference.ts`
- Create: `functions/test/nutrition-eval/historical-reference.test.ts`
- Modify: `functions/src/nutrition-eval/report.ts`
- Modify: `functions/test/nutrition-eval/report.test.ts`
- Modify: `docs/implementation-status.md`

**Reference fields:** run ID `run-2026-09-11T20-22-21-450Z`, code SHA `bb414d1850fb9f91cc419b4a270138354abf5535`, dataset hash `2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56`, prompt hash `205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263`, model `gemini-2.5-flash`, `20` public/`0` private, `3` samples, `60/60` parsed, `0` failures, `0` unsafe, `52` Review, `15` catastrophic, calorie median/P90 `0.2719`/`1.0136`, legacy mean macro `0.5227`, mean mass `0.4695`, mean carbohydrate/fat density `0.7780`/`0.3786`. Metric values are explicitly labeled rounded to four decimal places. Provenance also records that this run predates Slice G (`d9492b60d06296b54f51d951b0d5fb4ae8c89ed8`): one transient supplied-barcode catalog miss fell through to a catastrophic vision estimate, so the aggregate is valid historical evidence but not a like-for-like barcode-routing implementation baseline.

- [ ] **Step 1: Write RED strict-provenance tests.** Reject unknown keys, missing provenance, absent rounding/caveat metadata, percentages stored as `27.19` instead of ratios, any case array, and any invented per-macro historical metric. Permit deltas only for fields present in the reference.
- [ ] **Step 2: Run RED.** Run `cd functions && npx vitest run test/nutrition-eval/historical-reference.test.ts test/nutrition-eval/report.test.ts`.
- [ ] **Step 3: Add the immutable JSON and comparator.** The module must never import or construct a GenAI client. It returns explicit supported deltas and a promotion-gate result; a request for unavailable baseline data fails closed.
- [ ] **Step 4: Run GREEN plus a no-provider-boundary assertion.** Run focused tests and `rg -n "GoogleGenAI|generateContent|countTokens" functions/src/nutrition-eval/historical-reference.ts`; expected search result is empty.
- [ ] **Step 5: Review, track, commit, and push.** Commit `Record historical nutrition reference` and push.

## Task 4: Build the deterministic 40-case train-split corpus

**Files:**
- Create: `functions/eval/nutrition/calibration-source-lock.json`
- Create: `functions/eval/nutrition/calibration-manifest.json`
- Create: `functions/src/nutrition-eval/calibration-corpus.ts`
- Create: `functions/test/nutrition-eval/calibration-corpus.test.ts`
- Modify: `functions/src/nutrition-eval/schema.ts`
- Modify: `functions/test/nutrition-eval/schema.test.ts`
- Modify: `functions/eval/nutrition/ATTRIBUTION.md`
- Modify: `functions/package.json`
- Modify: `docs/implementation-status.md`

**Selection contract:** Pin and verify these exact official public objects before parsing: `dish_ids/splits/rgb_train_ids.txt`, `metadata/dish_metadata_cafe1.csv`, and `metadata/dish_metadata_cafe2.csv` below `https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/`. The split contains trimmed unique `dish_[0-9]+` IDs. Parse CSV as RFC 4180. The pinned official bytes have six fixed fields `dish_id,total_calories,total_mass,total_fat,total_carb,total_protein`, followed by one or more seven-field ingredient groups `(ingredient_id,name,grams,calories,fat,carb,protein)`; derive component count as `(columnCount - 6) / 7`, require an exact positive integer, validate every group, and fail if the pinned format changes. Duplicate IDs, malformed numbers, non-positive mass/calories, or negative macros fail. Eligible IDs are in the train split and merged metadata exactly once, are not any of the 12 frozen test IDs, and have a valid official overhead `rgb.png`.

Map eligible dishes to fixed bins:

- component bin `0 = exactly 1`, `1 = exactly 2`, `2 = 3+` ingredients, matching the approved spec;
- calorie bin `0 = <150`, `1 = 150..400 inclusive`, `2 = >400` kcal;
- macro-dominance bin `0 = protein`, `1 = carbohydrate`, `2 = fat`, comparing energy contributions `4*proteinG`, `4*carbsG`, and `9*fatG` with exact-tie precedence protein, then carbohydrate, then fat.

Rank candidates by lowercase hex `sha256('calorix-n5k-calibration-v1:' + dishId)`. A slot round is defined by two three-digit permutations `(kcalByComponent, macroByComponent)`; for component bins `c=0,1,2`, it contributes `(c, kcalByComponent[c], macroByComponent[c])` in component order. Fill all 24 development slots first from these eight rounds, in listed order:

```text
(012,012), (012,021), (012,102), (012,120),
(012,201), (012,210), (102,120), (201,210)
```

Then fill 16 validation slots from the same per-stratum ranked lists and shared used-ID set using these five rounds plus one final explicit slot:

```text
(021,021), (021,120), (102,012), (102,021), (102,210), then (0,2,1)
```

This checked schedule avoids the officially empty combined strata while giving development exact marginal counts `8/8/8` on every axis; validation component `6/5/5`, calorie `5/5/6`, and macro `5/6/5`; and total corpus component `14/13/13`, calorie `13/13/14`, and macro `13/14/13`. For each slot, take the first unused hash-ranked candidate in that exact combined stratum. Its URL is exactly `https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/<dish_id>/rgb.png`; a valid response is HTTP 200 whose bytes pass `inspectImage`, report `image/png`, have a PNG signature, and have positive decoded dimensions. During initial pinning only, a failed image is recorded by ID plus stable reason and selection advances to the next candidate in the **same** stratum. Exhausting a stratum fails pinning with no neighboring fallback. Verification of an existing lock never substitutes and instead fails on any byte/hash/image mismatch.

- [ ] **Step 1: Write RED pure-selection tests.** Use tiny committed test fixtures to prove exact source paths, source-hash rejection before parsing, RFC 4180 quoting, six fixed fields plus seven-field ingredient-group derivation, changed-format/duplicate/malformed rejection, exact one/two/three-plus bins, all calorie boundaries and macro tie precedence, frozen-test disjointness, stable rank, development-first shared-ID selection, the exact listed slot schedule/margins, rejection of any slot-list drift, HTTP/media/signature/dimension validation through `inspectImage`, deterministic failed-image skip within one stratum, exhaustion failure without neighboring fallback, exact 24/16 partitioning, and identical output after input-row reordering.
- [ ] **Step 2: Run RED.** Run `cd functions && npx vitest run test/nutrition-eval/calibration-corpus.test.ts`.
- [ ] **Step 3: Implement the pure selector and two explicit opt-in modes.** Default tests consume in-memory fixtures only. First-time `--pin` fails if a lock or manifest already exists, fetches official public bytes, records exact source/image SHA-256 values plus stable skipped-image reasons, and writes through atomic replacement. Normal `--verify` requires the existing committed pins and fails on any upstream/source/image mismatch without rewriting or substituting. There is no trust-on-first-use behavior hidden inside verification.
- [ ] **Step 4: Add a strict calibration-manifest schema.** Keep the generic version-1 manifest backward compatible, but parse calibration data through a strict schema that retains and validates `group: 'development' | 'validation'`, fixed stratum fields, rank, attribution, source-lock hash, and all case data. Canonicalize and hash the full strict object so group/split changes alter `datasetHash`; unknown keys fail rather than being stripped.
- [ ] **Step 5: Generate and independently inspect the committed corpus.** Run `--pin` once. Confirm 40 unique train IDs, 24/16 groups, exact stratum margins, zero overlap with the frozen 12, exact truth/mass data, no local paths, and no downloaded image bytes staged.
- [ ] **Step 6: Run GREEN and repeat-verification proof.** Run `--verify` and compare its canonical output byte-for-byte with the committed manifest without rewriting it. Run `cd functions && npx vitest run test/nutrition-eval/calibration-corpus.test.ts test/nutrition-eval/public-manifest.test.ts test/nutrition-eval/schema.test.ts && npm run build && npm run lint`.
- [ ] **Step 7: Review, track, commit, and push.** Record exact source hashes and verification results, commit `Add deterministic calibration corpus`, and push.

## Task 5: Make cache identity and barcode replay exact

**Files:**
- Create: `functions/eval/nutrition/off-snapshot-lock.json`
- Create: `functions/src/nutrition-eval/off-snapshot-store.ts`
- Create: `functions/test/nutrition-eval/off-snapshot-store.test.ts`
- Modify: `functions/src/nutrition-eval/runner.ts`
- Modify: `functions/src/nutrition-eval/live-adapter.ts`
- Modify: `functions/test/nutrition-eval/runner.test.ts`
- Modify: `functions/test/nutrition-eval/live-adapter.test.ts`
- Modify: `docs/implementation-status.md`

- [ ] **Step 1: Write RED cache identity tests.** Require generic cache keys to change with project, location, model, generation profile, response-schema hash, prompt hash, dataset hash, functions-tree identity, image hash, and sample index. A LOW result must never satisfy MEDIUM. Separately prove calibration creates no cache store, performs no cache read/write, and serializes every outcome with `cached: false`.
- [ ] **Step 2: Write RED barcode isolation tests.** Add an explicit calibration runner option `skipImageForSuppliedBarcode` and change `analyzeCase` to accept `bytes: Uint8Array | undefined` only when that option and a supplied barcode are present. Stage 3 startup verifies all four locked snapshot files, exact URL-to-barcode mappings, and parses each raw v3 envelope once through production `fetchOffProduct(barcode, { fetchFn: snapshotFetch })` **before any reservation**, producing an immutable in-memory `Map<string, OffProduct>`. Any integrity, mapping, parser, or missing-product error is fatal at startup. Runtime lookup reads only that map. For supplied-barcode cases, make `loadImage`, `generateVision`, live OFF fetch, and snapshot file reads throw if called. Reject missing, mismatched, extra-URL, or path-traversing snapshot identities. Name the four allowed barcodes: `3017624010701`, `5449000000996`, `4056489686941`, and `7622210449283`.
- [ ] **Step 3: Run RED.** Run `cd functions && npx vitest run test/nutrition-eval/runner.test.ts test/nutrition-eval/live-adapter.test.ts test/nutrition-eval/off-snapshot-store.test.ts`.
- [ ] **Step 4: Implement exact identity and local replay.** Refactor `buildCacheKey` to accept a strict identity object. Skip image loading only when the explicit calibration option is enabled, preserving generic baseline/release behavior. Build the prevalidated in-memory product map through the production OFF parser, then inject a map-only lookup into the live adapter. Add the four exact snapshot hashes and URL/barcode mappings to the lock; do not modify snapshot payloads.
- [ ] **Step 5: Run GREEN and network-boundary checks.** Run focused tests, build, and lint. Verify the barcode test observes zero image loads, zero vision reservations, and zero fetches.
- [ ] **Step 6: Review, track, commit, and push.** Commit `Isolate calibration cache and barcode replay` and push.

## Task 6: Implement the fail-closed stage ledger and gates

**Files:**
- Create: `functions/src/nutrition-eval/calibration.ts`
- Create: `functions/src/nutrition-eval/fatal-error.ts`
- Create: `functions/test/nutrition-eval/calibration.test.ts`
- Modify: `functions/src/nutrition-eval/schema.ts`
- Modify: `functions/src/nutrition-eval/runner.ts`
- Modify: `functions/src/nutrition-eval/live-adapter.ts`
- Modify: `functions/test/nutrition-eval/runner.test.ts`
- Modify: `functions/test/nutrition-eval/live-adapter.test.ts`
- Modify: `docs/implementation-status.md`

**Ledger invariants:** Protocol v1 has exactly one canonical root, `.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/`; `--run-dir` cannot redirect it and a second ledger is refused. The ledger pins protocol version, exact provider identity, `implementationCommit`, the derived clean `functionsTreeId = git rev-parse HEAD:functions`, dataset/prompt/three-source-response-schema hashes, calibration source-lock hash, calibration-manifest hash, public-manifest hash, OFF-snapshot-lock hash, historical-reference hash, planned image calls `146`, hard ceiling `300`, token-count reservation, per-profile report hashes, selected profile, stage results, and reserved/completed/failed counts. The CLI derives Git identity itself, refuses dirty `functions/`, and never trusts `--code-sha` or environment variables. Documentation-only commits may move HEAD only when `functionsTreeId` remains exact.

Hold an exclusive `wx` lockfile for the entire stage. Its owner record contains hostname, Linux boot ID, PID, `/proc/<pid>/stat` start ticks, and acquisition time. An existing lock blocks while that exact process identity is alive. Recovery is allowed only on the same host/boot when `/proc` proves the PID absent or start ticks different; unknown liveness fails closed. Recovery first appends and fsyncs a ledger event, archives the stale lock, then acquires a new `wx` lock. Normal completion removes only the current owner's lock.

Every reservation key is exactly `(stage, profile, caseId, sampleIndex)`, except the separately typed Stage 0 token-count key. Reserve and fsync the ledger plus parent directory before dispatch. Before a reservation becomes complete, append and fsync a privacy-safe journal entry containing its normalized prediction, analysis-only latency, safe error category, response model version, and content hash; then atomically mark the ledger key complete with that journal hash. Reports are rebuilt solely from the journal. A reserved-but-unfinished key found after a crash gets a durable `interrupted_reservation` failed journal entry and is never called again; the same stage may resume only its remaining unreserved keys. Extra keys and rerunning completed keys are invalid, so a normal or resumed v1 protocol still has at most 146 image reservations. The 300 ceiling is defense in depth and cannot be used by this protocol without a newly approved version.

`CalibrationFatalError` represents ceiling, identity, lock, persistence, and illegal-transition failures. Both adapter and runner catches must rethrow it unchanged and stop the stage; ordinary provider errors remain scored outcomes. Validation cannot start before a passing development selection, and benchmark cannot start before passing validation.

- [ ] **Step 1: Write RED ledger/fatal-path tests.** Cover live-owner lock rejection, provably dead-owner recovery, unknown-owner fail-closed behavior, recovery audit event, canonical-root enforcement, duplicate/extra reservation keys, durable result journal before completion, report rebuild from journal, crash-after-reservation conversion to `interrupted_reservation`, resuming only unreserved keys, whole-protocol ceiling, functions-tree or lock/hash identity drift, dirty Functions state including non-ignored untracked files, docs-only HEAD movement, stage skipping, repeated completed stages, and file/parent-directory fsync faults. Inject a reservation rejection in the middle of adapter and runner execution and prove the typed fatal escapes both catch layers immediately with no later calls; separately prove a 301st synthetic reservation is fatal even though valid protocol keys can never reach it.
- [ ] **Step 2: Encode exact selection and stage gates in table-driven tests.** Profile priority is lexicographic: unsafe count, parse count descending, catastrophic count, mean zero-safe macro error, median kcal error, P90 analysis-only latency; undefined error/latency metrics and zero parses rank worst (`+Infinity`), percentiles use the existing scorer's linear interpolation, numeric equality means an exact JavaScript-number tie, and a full tie selects MEDIUM. Development: `0` unsafe, parse `>=23/24`, catastrophic `<=6`, median kcal `<=0.35`, mean zero-safe macro `<=0.50`, P90 latency `<=30000`. Validation: `0` unsafe, parse `>=46/48`, catastrophic `<=8`, kcal median `<=0.25`, kcal P90 `<=0.90`, zero-safe macro `<=0.45`, each macro median `<=0.35`, meal-mass median `<=0.35`, P90 latency `<=30000`, and meal mass/density diagnostics on **every parsed** outcome; parse failures are governed by the parse gate and do not create a contradictory 48/48 diagnostic requirement. Benchmark: exactly `60/60` outcomes and parses, `0` unsafe/failures, catastrophic `<=12`, kcal median `<=0.25`, kcal P90 `<=0.90`, legacy macro mean `<=0.45`, meal-mass mean `<=0.40`, carbohydrate-density mean `<=0.70`, fat-density mean `<=0.35`, protein/carbohydrate/fat medians each `<=0.35` over the `36/36` meal outcomes, complete meal diagnostics `36/36`, exactly `48` vision calls, and zero image/vision/live-OFF calls for `12` supplied-barcode outcomes.
- [ ] **Step 3: Define metric populations in tests.** The strict calibration manifest requires `truth.referenceMassG` on every calibration meal. Mass/density statistics use parsed meal outcomes only and every parsed meal must have diagnostics; missing diagnostics fail coverage rather than shrinking denominators. Per-macro medians use parsed results with positive truth; validation uses its parsed meal outcomes (at least 46), while benchmark reapplication uses its 36 meal outcomes so exact barcode and label rows cannot pad a meal-model gate. Mean zero-safe macro error pools every eligible positive-truth `(outcome, macro)` pair. Zero-truth values contribute only to their per-macro count and absolute-error mean/median.
- [ ] **Step 4: Run RED.** Run `cd functions && npx vitest run test/nutrition-eval/calibration.test.ts test/nutrition-eval/runner.test.ts test/nutrition-eval/live-adapter.test.ts`.
- [ ] **Step 5: Implement pure gates, fatal propagation, and atomic ledger writes.** Use write-to-sibling, file fsync/close, rename, then parent-directory fsync. Reserve before provider dispatch; completed/failed updates never decrement reserved count. Store privacy-safe categories only.
- [ ] **Step 6: Run GREEN, build, and lint.** Include fault-injection tests for interrupted writes, malformed ledgers, mid-stage fatal errors, and recovery of reserved-but-unfinished keys.
- [ ] **Step 7: Obtain review, track, commit, and push.** This is production-safety-significant even though production defaults are unchanged. Commit `Add fail-closed calibration stages` only after the required external reviewer reports `AGREEMENT_STATUS: agree` and `MUST_FIX: none`.

## Task 7: Add the dedicated calibration CLI and preflight boundary

**Files:**
- Create: `functions/src/nutrition-eval/calibration-cli.ts`
- Create: `functions/test/nutrition-eval/calibration-cli.test.ts`
- Modify: `functions/src/genai-adapter.ts`
- Modify: `functions/test/genai-adapter.test.ts`
- Modify: `functions/src/nutrition-eval/live-adapter.ts`
- Modify: `functions/src/nutrition-eval/runner.ts`
- Modify: `functions/src/nutrition-eval/schema.ts`
- Modify: `functions/test/nutrition-eval/live-adapter.test.ts`
- Modify: `functions/test/nutrition-eval/runner.test.ts`
- Modify: `functions/package.json`
- Modify: `docs/implementation-status.md`

**Commands:**

```bash
npm run eval:nutrition:calibration -- preflight
npm run eval:nutrition:calibration -- development
npm run eval:nutrition:calibration -- validation --thinking-level low
npm run eval:nutrition:calibration -- benchmark --thinking-level low
```

Use `medium` instead of `low` in the last two commands only when the ledger selected MEDIUM; the CLI rejects either value when it does not match.

- [ ] **Step 1: Write RED CLI and client-construction tests.** Reject missing opt-in, any project except `calorix-xurschnell`, location except `us`, model except `gemini-3.8-flash`, 2.5 anywhere in arguments/environment/ledger, stage skips, run-dir overrides, provider retry flags, and any nonblank `GOOGLE_VERTEX_BASE_URL` or `GOOGLE_GEMINI_BASE_URL`. Preflight/development enumerate both profiles internally; validation/benchmark require `--thinking-level low|medium` and reject it unless it exactly matches the ledger-selected profile. Prove malformed config returns before constructing `GoogleGenAI`. Require exactly `vertexai: true`, project `calorix-xurschnell`, location `us`, `apiVersion: 'v1'`, and `httpOptions: { baseUrl: 'https://aiplatform.us.rep.googleapis.com/', timeout: 30000 }`, with no API key and no `retryOptions`, even when unrelated `GOOGLE_API_KEY` and `GOOGLE_CLOUD_*` variables are present. Inspect an unmocked, never-dispatched client to verify its resolved base URL/timeout/retry configuration rather than trusting only constructor mocks.
- [ ] **Step 2: Write RED preflight and safe-error tests.** Before any reservation, require dataset ID `calorix-public-v1`, generic public-manifest hash `2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56`, prompt hash `205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263`, and all committed lock hashes. Record—but do not pretend compatible—the historical code SHA, generation profile, PNG-versus-historical-JPEG label, snapshot-replay-versus-live-OFF route, and post-Slice-G code caveats. The deterministic preflight case is the first development manifest case in committed slot order. Reserve and record one 3.8 `countTokens` call separately, then exactly one image at LOW and one at MEDIUM. Both must produce a valid structured normalized result with nonblank `modelVersion` metadata and exact request identity; the first successful response pins the model version, and any mismatch in Stages 0–3 is a `CalibrationFatalError`, never a scored outcome. Use SDK `httpOptions.timeout: 30000` and no retry options. Store provider categories in the calibration ledger/report safe-error field—not `failureDetail`, which remains parser-only—with exact categories `http_400`, `http_401`, `http_403`, `http_404`, `http_408`, `http_429`, `http_other_4xx`, `http_5xx`, `timeout`, `network`, `empty_response`, `interrupted_reservation`, and `unknown`; retain no raw message, URL, endpoint hostname, prompt, or response. Any preflight provider/parse/identity error stops with no automatic retry.
- [ ] **Step 3: Run RED.** Run `cd functions && npx vitest run test/nutrition-eval/calibration-cli.test.ts test/genai-adapter.test.ts`.
- [ ] **Step 4: Implement the CLI with dependency injection.** Load only committed locks/manifests/reference, derive the clean Functions tree identity, create only the exact Vertex client, wire a per-call reservation function receiving `{ stage, profile, caseId, sampleIndex }` from `analyzeCase` (stage/profile fixed by adapter, case/sample supplied per call), and write one report per profile per stage plus their hashes under the canonical ignored root. Use the existing prompt/schema/parser/normalizer unchanged. Calibration passes the real manifest media type, disables the response cache entirely, and uses an explicit `analysisOnlyLatency` runner option that starts after image loading and immediately before `analyzeCase`; a RED test injects a slow image load and proves reported latency excludes it.
- [ ] **Step 5: Prove identity, comparison, and call arithmetic hermetically.** A fake provider must observe Stage 0 `2`, Stage 1 `48`, Stage 2 `48`, Stage 3 `48`; total `146`. Stage 3 must yield `60` scored outcomes while the four barcode cases account for `12` outcomes and zero provider/image/OFF-network calls. Every report outcome is `cached: false`. The historical comparator refuses deltas unless dataset hash is `2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56`, prompt hash is `205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263`, samples are `3`, and coverage is exactly `20` public/`0` private; only the explicitly declared current-model-versus-reference-model mismatch is allowed.
- [ ] **Step 6: Run full Functions verification.** Make `eval:nutrition:calibration` run `npm run build` before `node lib/nutrition-eval/calibration-cli.js`, matching existing evaluator scripts. Run `cd functions && npm run eval:nutrition:fixtures && npm run test:verify`. Confirm no live opt-in means zero provider/network requests and the dirty-tree check notices non-ignored untracked files under `functions/`.
- [ ] **Step 7: Mandatory implementation review, commit, and push.** Review the complete code path and test evidence in the calibration review conversation. Apply all must-fixes, rerun verification, commit `Add nutrition calibration runner`, and push.

## Task 8: Execute Stage 0 and Stage 1

**Files:**
- Modify: `docs/implementation-status.md`
- Modify: this plan's checkboxes
- Runtime only: `.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/`

- [ ] **Step 1: Verify source and account boundary without revealing credentials.** Record branch/HEAD, derived implementation commit and clean Functions tree ID, ADC quota project, billing status, Vertex API status, and exact local/remote equality. Do not print tokens. Confirm production defaults still name `gemini-2.5-flash` but do not call that model.
- [ ] **Step 2: Run deterministic verification immediately before inference.** Run `cd functions && npm run test:verify`. Stop on failure.
- [ ] **Step 3: Run preflight once.** Set only the explicit live opt-in and run the `preflight` command. Require one separately reserved 3.8 token count and two valid image results, LOW then MEDIUM, on the fixed first development slot. Record privacy-safe exact error categories and stop rather than fallback.
- [ ] **Step 4: Run development once.** Execute 24 development cases once at LOW and once at MEDIUM. The ledger must finish at `50` cumulative image calls (`2 + 48`). Select by the frozen priority and stop if the winner misses any advance gate.
- [ ] **Step 5: Inspect and record privacy-safe evidence.** Record run ID, code/dataset/prompt/schema/reference hashes, both profile summaries, selection reason, cumulative reserved/completed/failed counts, provider errors, and whether all 48 artifacts were inspected or only report invariants were verified. Do not commit raw reports.
- [ ] **Step 6: Review the stage result, commit tracking, and push.** Mandatory Antigravity result review must be green before calling the stage accepted. Commit `Record nutrition development calibration` and push.

## Task 9: Execute the frozen validation gate

**Files:**
- Modify: `docs/implementation-status.md`
- Modify: this plan's checkboxes
- Runtime only: existing `.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/`

- [ ] **Step 1: Reopen and validate the exact ledger.** Require the pinned implementation commit, unchanged clean Functions tree ID despite the docs-only development-result commit, every immutable lock/hash identity, selected profile, passing development result, and cumulative count `50`. Any Functions or identity drift starts no request.
- [ ] **Step 2: Run validation exactly once.** Execute 16 validation cases with three uncached samples using only the selected profile. Require CLI `--thinking-level low|medium` and fail before reservation unless it matches the ledger; the adapter reads the effective profile from the ledger after that equality check. Expected cumulative count is `98`; no LOW/MEDIUM reselection or threshold change is permitted.
- [ ] **Step 3: Apply every fixed validation gate.** Record all 48 outcomes, provider failures, separate macro medians, zero-truth diagnostics, mass, latency, unsafe, and catastrophic counts. Any failed gate ends the workstream with production unchanged.
- [ ] **Step 4: Review, track, commit, and push.** State whether visual/output inspection was exhaustive or sampled. Obtain green external result review, commit `Record nutrition validation result`, and push.

## Task 10: Execute the frozen public benchmark

**Files:**
- Modify: `docs/implementation-status.md`
- Modify: this plan's checkboxes
- Runtime only: existing `.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/`

- [ ] **Step 1: Reopen the passing validation ledger.** Require cumulative count `98`, exact selected profile, unchanged clean Functions tree ID despite docs-only tracking commits, and unchanged 20-case public manifest/source snapshots.
- [ ] **Step 2: Run the benchmark exactly once.** Require CLI `--thinking-level low|medium` to match the ledger-selected profile, then execute all 20 public cases with three uncached samples. Require `60` outcomes, exactly `48` additional vision calls, exactly `146` cumulative image calls, and zero image/vision/live-network activity for all `12` supplied-barcode outcomes.
- [ ] **Step 3: Apply absolute and historical aggregate gates.** Compare only supported fields after strict historical identity compatibility passes. Report explicit deltas for catastrophic count, calorie median/P90, legacy macro mean, mass mean, carbohydrate density mean, and fat density mean. Reapply protein/carbohydrate/fat median gates to the 36 meal outcomes only, with complete 36/36 meal diagnostics; barcode and label outcomes cannot pad those medians. Do not infer missing historical case/per-macro data.
- [ ] **Step 4: Record the promotion decision without changing production.** A pass means only that a separately reviewed migration may be proposed. A failure leaves production unchanged. In both cases report run ID, routes, counts by status/source, `auditLimited`, `visualClassificationStatus`, blockers, provider errors/fallbacks (`none` unless an error occurred; never 2.5), verification, and inspection coverage.
- [ ] **Step 5: Mandatory final review.** Ask Antigravity to inspect code, all privacy-safe stage summaries, call accounting, barcode isolation, fixed gates, and the proposed conclusion. Green requires `AGREEMENT_STATUS: agree` and `MUST_FIX: none`.
- [ ] **Step 6: Run final verification, close, commit, and push.** Run `cd functions && npm run test:verify`, root-relevant checks, `git diff --check`, secret/private-artifact scans, `.mcp.json` hash comparison, and exact remote equality. Commit `Record nutrition calibration outcome` and push. Do not deploy or edit production model configuration.

## Completion Criteria

- All offline RED/GREEN evidence, full Functions verification, and required external reviews are recorded.
- The 40-case corpus is reproducible from checksum-pinned official train data and disjoint from all 12 frozen test meals.
- Every calibration report binds project, location, model, profile, prompt/schema/code/dataset identity, samples, call accounting, provider errors, and zero-safe four-nutrient metrics.
- No new Gemini 2.5 provider call occurred; its prior results appear only through the strict aggregate reference.
- The ledger accounts for exactly 146 planned image calls or records an earlier fail-closed stop, and can never exceed 300.
- The final 20-case stage has 60 outcomes and exactly 48 vision calls, with zero image/vision/live OFF activity for supplied barcodes.
- Production defaults, remote state, deployment, and device behavior remain unchanged.
- The final accepted commit is pushed with local HEAD equal to `origin/fix/scan-photo-flow-viewer` and `.mcp.json` untouched.
