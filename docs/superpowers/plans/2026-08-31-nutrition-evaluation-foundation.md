# Nutrition Evaluation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, real-image nutrition evaluation harness and record the current production-boundary baseline before changing Calorix nutrition behavior.

**Architecture:** A checked-in manifest and truth snapshots describe public Nutrition5k and Open Food Facts cases without committing fetched image bytes. Pure schema, integrity, scorer, and runner modules live below `functions/src/nutrition-eval`; deterministic tests inject model and product responses, while an opt-in CLI calls the existing prompts, GenAI adapter, response parser, and Open Food Facts client. Runtime images, private Vitamin Well data, caches, and reports stay below git-ignored `.nutrition-eval/` and no runner path initializes Firebase Admin or writes remote state.

**Tech Stack:** TypeScript 5.5, Node 20 built-in `fetch`/`crypto`/`fs`, Zod 3, Vitest 2, the existing Google GenAI adapter and nutrition parser, official Nutrition5k objects, and Open Food Facts v3 snapshots.

**Spec:** `docs/superpowers/specs/2026-08-31-nutrition-analysis-evaluation-design.md`

## Global Constraints

- This plan implements only design Stages A and B. It records the pre-change baseline and must not fix production nutrition behavior.
- A meal case means the complete visible meal portion; a barcode or label case means the complete physical package represented by the scan.
- Manufacturer serving is reference metadata only and never silently becomes the logged default.
- Routine tests perform no live model calls and no unpinned network reads.
- The opt-in live runner may make read-only corpus/product requests and authorized model calls, but it must not initialize Firebase Admin, invoke a deployed Function, write Firestore/Storage, send FCM, or create users.
- Never commit image caches, private images/manifests, model responses, reports containing private paths, credentials, tokens, or raw provider diagnostics.
- Keep `.mcp.json` untouched and unstaged.
- Every behavior step begins with a focused failing test, witnesses the intended failure, implements the minimum change, then witnesses green.
- After each task, update `docs/implementation-status.md`, obtain any review required by `AGENTS.md`, commit only that task's code/tests/docs, and push the branch to `origin`.
- Use imperative commit messages without prohibited model/tool attribution tokens.

---

## File Map

| File | Responsibility |
|---|---|
| `functions/src/nutrition-eval/schema.ts` | Versioned manifest, prediction, case-result, and aggregate-report schemas/types. |
| `functions/src/nutrition-eval/image-metadata.ts` | Pure PNG/JPEG format and dimension inspection without image decoding dependencies. |
| `functions/src/nutrition-eval/assets.ts` | Resolve public/private assets, fetch public bytes, verify SHA-256/media/dimensions, and cache atomically. |
| `functions/src/nutrition-eval/scorer.ts` | Pure numeric, basis, barcode, decision, safety, and aggregate metrics. |
| `functions/src/nutrition-eval/runner.ts` | Dependency-injected case execution shared by deterministic and live modes. |
| `functions/src/nutrition-eval/live-adapter.ts` | Existing GenAI/prompt/parser/OFF boundary adapter with no Firebase dependency. |
| `functions/src/nutrition-eval/report.ts` | Stable JSON and Markdown rendering with privacy-safe failures. |
| `functions/src/nutrition-eval/cli.ts` | Explicit `fixtures`, `baseline`, and `release` command parsing and exit behavior. |
| `functions/eval/nutrition/public-manifest.json` | Checked-in public case IDs, truth, source URLs, hashes, tolerances, and attribution IDs. |
| `functions/eval/nutrition/off-snapshots/*.json` | Minimal checked-in v3 product truth used without network in deterministic tests. |
| `functions/eval/nutrition/ATTRIBUTION.md` | Nutrition5k CC BY 4.0 and Open Food Facts ODbL attribution/source record. |
| `functions/test/nutrition-eval/*.test.ts` | Focused schema, integrity, scorer, runner, report, and CLI tests. |
| `.nutrition-eval/` | Ignored public image cache, private overlay/assets, and generated reports. |

## Task 1: Define the versioned evaluation contract

**Files:**
- Create: `functions/src/nutrition-eval/schema.ts`
- Create: `functions/test/nutrition-eval/schema.test.ts`
- Modify: `.gitignore`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Produces `NutritionEvalManifestSchema` and `parseNutritionEvalManifest(value: unknown): NutritionEvalManifest`.
- Produces `NutritionEvalCase`, `NutritionTruth`, `NutritionPrediction`, `NutritionCaseResult`, and `NutritionEvalReport`.
- Manifest version is exactly `1`; scan modes are `meal | barcode | label`; basis values are `portion | package | per100g`; units are `portion | g | ml`.

- [x] **Step 1: Write the failing schema test.**

  Create a valid minimal meal and package case, then mutate one field at a time. The test must require unique IDs, a lowercase 64-character SHA-256, positive dimensions/amounts, finite non-negative nutrition, public cases without local paths, private cases without public URLs, and a declared tolerance class.

  ```ts
  const valid = {
    version: 1,
    datasetId: 'calorix-nutrition-eval-v1',
    cases: [{
      id: 'meal-dish-1565035746',
      visibility: 'public',
      scanMode: 'meal',
      source: { dataset: 'nutrition5k', objectId: 'dish_1565035746' },
      image: {
        url: 'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/dish_1565035746/rgb.png',
        sha256: '28f5fe26394586f124c04af2d22270d8a8079c141fc1f2b0fe80593d77ae2869',
        mediaType: 'image/png', width: 640, height: 480,
      },
      truth: {
        basis: 'portion', amount: 1, unit: 'portion',
        kcal: 43.099998, proteinG: 2.409, carbsG: 9.01, fatG: 0.369,
      },
      toleranceClass: 'meal-estimate',
      attributionId: 'nutrition5k-cc-by-4.0',
    }],
  };
  expect(parseNutritionEvalManifest(valid).cases).toHaveLength(1);
  expect(() => parseNutritionEvalManifest({...valid, cases: [valid.cases[0], valid.cases[0]]})).toThrow(/duplicate/i);
  ```

- [x] **Step 2: Run the focused test and witness RED.**

  Run: `cd functions && npx vitest run test/nutrition-eval/schema.test.ts`

  Expected: FAIL because `src/nutrition-eval/schema.ts` does not exist.

- [x] **Step 3: Implement the minimum schema and types.**

  Define `NutritionVectorSchema` once and reuse it for truth/prediction. Represent unavailable prediction fields as omitted optional fields, not zero. Include these result fields from the beginning so later tasks do not invent parallel report types:

  ```ts
  export interface NutritionPrediction {
    parseStatus: 'success' | 'failure';
    source: 'meal' | 'barcode' | 'label';
    kcal?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    confidence?: number;
    basis?: 'portion' | 'package' | 'per100g';
    amount?: number;
    unit?: 'portion' | 'g' | 'ml';
    barcode?: string;
    decision?: 'complete' | 'needs_review' | 'error';
    failureCategory?: 'dataset' | 'schema' | 'provider' | 'product' | 'runner';
    failureCode?: string;
  }
  ```

  Add `.nutrition-eval/` to the repository root `.gitignore`; do not add a broad image extension rule.

- [x] **Step 4: Run GREEN and repository checks.**

  Run: `cd functions && npx vitest run test/nutrition-eval/schema.test.ts && npm run build && npm run lint`

  Expected: PASS with no network access.

- [x] **Step 5: Record and commit the schema stage.**

  Update the status file with RED/GREEN command output and the next task. Commit `schema.ts`, its test, `.gitignore`, and tracking with message `Define nutrition evaluation contracts`, then push.

## Task 2: Pin the public corpus and verify every image byte

**Files:**
- Create: `functions/src/nutrition-eval/image-metadata.ts`
- Create: `functions/src/nutrition-eval/assets.ts`
- Create: `functions/test/nutrition-eval/assets.test.ts`
- Create: `functions/test/nutrition-eval/public-manifest.test.ts`
- Create: `functions/eval/nutrition/public-manifest.json`
- Create: `functions/eval/nutrition/off-snapshots/3017624010701.json`
- Create: `functions/eval/nutrition/off-snapshots/5449000000996.json`
- Create: `functions/eval/nutrition/off-snapshots/8076809513753.json`
- Create: `functions/eval/nutrition/off-snapshots/8000500310427.json`
- Create: `functions/eval/nutrition/off-snapshots/4008400404127.json`
- Create: `functions/eval/nutrition/off-snapshots/3228857000166.json`
- Create: `functions/eval/nutrition/off-snapshots/4056489686941.json`
- Create: `functions/eval/nutrition/off-snapshots/7622210449283.json`
- Create: `functions/eval/nutrition/ATTRIBUTION.md`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Produces `inspectImage(bytes: Uint8Array): { mediaType: 'image/png' | 'image/jpeg'; width: number; height: number }`.
- Produces `sha256Hex(bytes: Uint8Array): string`.
- Produces `loadVerifiedCaseImage(evalCase, options): Promise<Uint8Array>` with injected `fetchFn`, `cacheRoot`, and optional private-root resolution.
- Atomic cache key is `<sha256>.<png|jpg>`; a partial or mismatched download is deleted and returned as a typed `dataset_integrity` failure.

- [x] **Step 1: Write failing byte-integrity and public-manifest tests.**

  Build tiny in-memory PNG and JPEG fixtures. Assert correct media/dimensions, hash mismatch rejection, HTTP failure separation, cache reuse without a second request, and rejection when declared MIME or dimensions disagree.

  In `public-manifest.test.ts`, require the absent manifest to contain exactly 20 unique public cases (12 meal, 4 barcode, 4 label), all declared source snapshots/attributions, and the twelve exact Nutrition5k IDs listed in Step 4. This establishes a separate RED witness for the corpus rather than creating its validator after its data.

  ```ts
  await expect(loadVerifiedCaseImage(testCase, {
    cacheRoot,
    fetchFn: async () => new Response(validPng),
  })).resolves.toEqual(validPng);
  await expect(loadVerifiedCaseImage({...testCase, image: {...testCase.image, sha256: '0'.repeat(64)}}, {
    cacheRoot,
    fetchFn: async () => new Response(validPng),
  })).rejects.toMatchObject({code: 'dataset_checksum_mismatch'});
  ```

- [x] **Step 2: Run the asset and manifest tests and witness RED.**

  Run: `cd functions && npx vitest run test/nutrition-eval/assets.test.ts test/nutrition-eval/public-manifest.test.ts`

  Expected: FAIL because the image/asset modules and public manifest do not exist.

- [x] **Step 3: Implement PNG/JPEG inspection and atomic verified caching.**

  PNG parsing reads the signature and IHDR width/height. JPEG parsing walks markers until a SOF0/SOF1/SOF2 marker and reads height/width; it must reject truncated segments. Write a fetched file to `<target>.partial-<pid>`, verify bytes before rename, and remove the partial in `finally` on failure.

- [x] **Step 4: Add the twelve exact Nutrition5k depth-test cases.**

  Use the official overhead `rgb.png`, all `640x480`, and encode CSV columns as `kcal, massG, fatG, carbsG, proteinG`. The manifest must contain these exact truths and hashes:

  | Dish | kcal | mass g | fat g | carbs g | protein g | SHA-256 |
  |---|---:|---:|---:|---:|---:|---|
  | `dish_1565035746` | 43.099998 | 149 | 0.369 | 9.010 | 2.409 | `28f5fe26394586f124c04af2d22270d8a8079c141fc1f2b0fe80593d77ae2869` |
  | `dish_1558639818` | 20.059999 | 59 | 0.118 | 4.720 | 0.472 | `333154ffcf6f3f1a76a2e90e9d352082de170322bad411a33adbef4b5f0c8718` |
  | `dish_1558549605` | 97.500000 | 75 | 0.225 | 21.000 | 2.025 | `4dd2f659ecb68f246f59499171b54f0ba840ba8abf6d6d9a62e1f951d78fb72f` |
  | `dish_1561663580` | 432.063416 | 307 | 9.844143 | 31.344984 | 51.432281 | `70b81a49263e9dd88c81974f4725291c1734ddf1cf2f1bc1d0c84f617262c879` |
  | `dish_1565898402` | 384.799225 | 229 | 19.544107 | 9.462811 | 39.424374 | `33f29ac52f0c32d8551907de5fadbf77cdd7efa60861e367767fe6b53261ed4c` |
  | `dish_1566328724` | 275.549988 | 167 | 6.012 | 0 | 51.770 | `d6f1c4eb86cf70b21b10f5c86ccc56cc459154df6a3c24b088a9948dd35dd5c5` |
  | `dish_1566838351` | 190.009995 | 417 | 0.822 | 48.034 | 2.490 | `e52ed4ed6036d46b44f023764a48c5f6acb74e39e90edce44a099aa3a0289cbf` |
  | `dish_1567107839` | 174.284485 | 156 | 16.469330 | 11.980703 | 18.763048 | `8bc958e56690b8d6fe090ccb5d212eb4cf4dafeaec7bcdcf5af1bf31a08cb5c2` |
  | `dish_1558639787` | 24.750000 | 99 | 0.297 | 4.950 | 1.782 | `d6c6f2f9749620979295f4d95213f9c3a28608d0b0fc93255417667e8d50a98d` |
  | `dish_1562788601` | 413.170135 | 287 | 19.139153 | 48.766399 | 23.146877 | `bff5ff57197d63c46b62109182d1cfba0a90da518fe1a73ed109ecdc20d08b73` |
  | `dish_1560456326` | 206.872757 | 138 | 7.522188 | 3.791613 | 29.742077 | `b545d87192f92951a94a51bfe67573cefaf6605523676f9efc118125234c96cd` |
  | `dish_1564427430` | 345.620026 | 170 | 23.860001 | 2.340 | 30.790001 | `1a353b0de279f264bbbf48e613948b83291d99e50d9d19910732d1d7ef02baeb` |

- [x] **Step 5: Add eight exact Open Food Facts cases and minimal snapshots.**

  Use barcode/front-image mode for `3017624010701`, `5449000000996`, `4056489686941`, and `7622210449283`; use label/nutrition-image mode for `8076809513753`, `8000500310427`, `4008400404127`, and `3228857000166`. Fetch each v3 record with only the fields enumerated in the spec, remove unrelated nutrient keys, and commit the stable response used as truth. Pin the selected `.400.jpg` URL, downloaded SHA-256, actual JPEG dimensions, and package-total nutrition calculated from `_100g * product_quantity / 100`.

  The multipack case `4056489686941` must preserve the contradiction between product name `6x330ml cans` and catalog `quantity/product_quantity=330 ml`. Its truth is the scanned outer package (`1980 ml`, `19.8 kcal`, zero macros) and its expected safe decision is `needs_review` until the conflict is resolved; do not normalize it as a single can. The malformed serving-metadata case `7622210449283` preserves `quantity=300 g` and `serving_size=250g` so serving metadata cannot silently control the default.

- [x] **Step 6: Complete attribution and manifest integrity coverage.**

  The manifest test must assert exactly 20 public cases (12 meal, 4 barcode, 4 label), every object ID unique, all Nutrition5k cases belong to the official `depth_test_ids.txt` snapshot, every OFF case has a committed minimal snapshot, and every attribution ID is defined. Network fetch is a separate opt-in test command; the default test reads committed truth only.

- [x] **Step 7: Run GREEN and perform the one-time public fetch verification.**

  Run: `cd functions && npx vitest run test/nutrition-eval/assets.test.ts test/nutrition-eval/public-manifest.test.ts`

  Then run the opt-in fetch check defined by the task: `cd functions && RUN_NUTRITION_EVAL_FETCH=1 npx vitest run test/nutrition-eval/public-manifest.test.ts`

  Expected: both PASS; the second command downloads only into `../.nutrition-eval/cache`, verifies all 20 hashes, and reports zero skipped cases.

- [x] **Step 8: Record and commit the corpus stage.**

  Update tracking with case counts, source IDs, fetch outcome, and licenses. Commit with message `Pin nutrition evaluation corpus`, then push. Do not stage `.nutrition-eval/`.

## Task 3: Implement the pure scorer and safety gate

**Files:**
- Create: `functions/src/nutrition-eval/scorer.ts`
- Create: `functions/test/nutrition-eval/scorer.test.ts`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Produces `scoreNutritionCase(evalCase: NutritionEvalCase, prediction: NutritionPrediction): NutritionCaseResult`.
- Produces `aggregateNutritionResults(results: readonly NutritionCaseResult[]): NutritionEvalReport['summary']`.
- Relative error denominator is `max(abs(truth), 1)` to keep zero/near-zero macros finite; exact barcode/basis/unit comparisons remain separate booleans.
- Catastrophic calorie miss is strictly `prediction.kcal < 0.5 * truth.kcal || prediction.kcal > 2.0 * truth.kcal`.
- Unsafe completion is catastrophic miss plus `decision=complete`, or any case whose expected decision is `needs_review` but prediction is `complete`.

- [x] **Step 1: Write hand-derived failing scorer tests.**

  Cover exact match, over/under prediction, zero macro truth, missing parse fields, barcode mismatch, basis mismatch, required-Review override, percentile interpolation, and catastrophic boundary values at exactly `0.5x` and `2.0x` (not catastrophic) versus just outside (catastrophic).

  ```ts
  const result = scoreNutritionCase(packageCase, {
    parseStatus: 'success', source: 'barcode', decision: 'complete',
    kcal: 42, proteinG: 0, carbsG: 10.6, fatG: 0,
    confidence: 1, barcode: '5449000000996',
  });
  expect(result.numeric.kcal.ratioToTruth).toBeCloseTo(42 / 138.6, 8);
  expect(result.safety.catastrophicCalorieMiss).toBe(true);
  expect(result.safety.unsafeCompletion).toBe(true);
  ```

- [x] **Step 2: Run the scorer test and witness RED.**

  Run: `cd functions && npx vitest run test/nutrition-eval/scorer.test.ts`

  Expected: FAIL because `scorer.ts` does not exist.

- [x] **Step 3: Implement pure per-case and aggregate scoring.**

  Sort copies before median/percentile calculations; never mutate input results. Aggregate fields include total/run/parse counts, basis and barcode accuracy denominators, median/p90 absolute and relative calorie error, mean macro relative error, Review rate, catastrophic count, unsafe-completion count, and failure counts by category/code.

- [x] **Step 4: Run GREEN and mutation/determinism checks.**

  Run once: `cd functions && npx vitest run test/nutrition-eval/scorer.test.ts`

  Run a second time: `cd functions && npx vitest run test/nutrition-eval/scorer.test.ts && npm run build && npm run lint`

  Expected: PASS twice with byte-equivalent serialized summaries.

- [x] **Step 5: Record and commit the scorer stage.**

  Update tracking with the exact RED/GREEN result. Commit with message `Score nutrition evaluation results`, then push.

## Task 4: Build a dependency-injected deterministic runner

**Files:**
- Create: `functions/src/nutrition-eval/runner.ts`
- Create: `functions/test/nutrition-eval/runner.test.ts`
- Create: `functions/test/nutrition-eval/fixtures/model-responses.ts`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Consumes `NutritionEvalCase`, verified bytes, and `NutritionEvalDependencies`.
- Produces `runNutritionEval(cases, deps, options): Promise<NutritionCaseResult[]>` in manifest order.
- `NutritionEvalDependencies` exposes `loadImage`, untrusted `analyzeCase(evalCase, bytes, {sampleIndex})`, `nowMs`, and an optional string cache store; deterministic tests inject every used dependency.
- `RunNutritionEvalOptions` requires explicit `datasetId`, `adapterModelId`, `promptHash`, and `codeSha`; `samples` defaults to `1` and must be an integer in `1..10`.
- A run returns `cases.length * samples` scored results in case-major/sample-minor order. Optional prediction metadata records measured `latencyMs`, one-indexed `sampleIndex`, and `cached` without storing those runtime fields in cached prediction JSON.
- Cache keys hash a JSON tuple of dataset ID, image SHA, adapter/model ID, prompt hash, code SHA, and sample index. Valid hits bypass image/analyzer work; malformed or failed cache operations produce sanitized `runner` failures.
- One failed case becomes one result with a typed failure; it never aborts or silently removes later cases.

- [x] **Step 1: Write failing runner accounting tests.**

  Use three cases and injected results: success, schema failure, and thrown provider error. Assert three ordered outputs, zero remote SDK initialization, stable latency from `nowMs`, and sanitized error codes without raw exception text.

  ```ts
  const results = await runNutritionEval(cases, deps, {samples: 1});
  expect(results.map((value) => value.caseId)).toEqual(cases.map((value) => value.id));
  expect(results[1]?.prediction).toMatchObject({failureCategory: 'schema'});
  expect(results[2]?.prediction).toMatchObject({failureCategory: 'provider', failureCode: 'provider_request_failed'});
  expect(JSON.stringify(results)).not.toContain('secret-provider-body');
  ```

- [x] **Step 2: Run the runner test and witness RED.**

  Run: `cd functions && npx vitest run test/nutrition-eval/runner.test.ts`

  Expected: FAIL because `runner.ts` does not exist.

- [x] **Step 3: Implement ordered, resumable case execution.**

  Validate `samples` as integer `1..10`. Compute cache identity from dataset ID, image SHA, adapter/model ID, prompt hash, and code SHA. Cache only sanitized prediction JSON. A malformed cache is a `runner/cache_invalid` result and is not silently accepted.

- [x] **Step 4: Add deterministic current-contract fixture predictions.**

  Feed existing `parseNutritionResponse`-shaped meal/label JSON and existing `OffProduct`-shaped barcode values through the runner adapter seam. Deliberately retain current missing `basis/amount/unit` and per-100 barcode values: this stage measures the defect and must not rewrite predictions into the desired contract.

- [x] **Step 5: Run GREEN and all nutrition-eval unit tests.**

  Run: `cd functions && npx vitest run test/nutrition-eval/schema.test.ts test/nutrition-eval/assets.test.ts test/nutrition-eval/public-manifest.test.ts test/nutrition-eval/scorer.test.ts test/nutrition-eval/runner.test.ts`

  Expected: PASS without network or model credentials.

- [x] **Step 6: Record and commit the deterministic runner.**

  Update tracking and commit with message `Run deterministic nutrition evaluations`, then push.

## Task 5: Add the production-boundary live adapter and privacy-safe reports

**Files:**
- Modify: `functions/src/nutrition-eval/schema.ts`
- Create: `functions/src/nutrition-eval/live-adapter.ts`
- Create: `functions/src/nutrition-eval/report.ts`
- Create: `functions/src/nutrition-eval/cli.ts`
- Create: `functions/test/nutrition-eval/live-adapter.test.ts`
- Create: `functions/test/nutrition-eval/report.test.ts`
- Create: `functions/test/nutrition-eval/cli.test.ts`
- Modify: `functions/package.json`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Extend `NutritionEvalCase` with optional `suppliedBarcode`, which represents observed client input and is never inferred from truth-only `expectedBarcode`.
- Extend `NutritionEvalReportSchema` with validated run/timestamp, dataset/model/prompt/code identity, sample count, `baselineOnly`, and optional latency-summary metadata; the existing scorer metrics remain unchanged.
- `createLiveNutritionEvalAdapter(options)` consumes the existing `createGenAIAdapter`, `MEAL_ANALYSIS_PROMPT`, `LABEL_ANALYSIS_PROMPT`, `BARCODE_ANALYSIS_PROMPT`, `parseNutritionResponse`, and `fetchOffProduct` boundaries.
- `renderNutritionEvalMarkdown(report): string` and `writeNutritionEvalReport(report, outputDir)` emit stable JSON/Markdown.
- CLI modes are `fixtures`, `baseline`, and `release`; live modes require `RUN_NUTRITION_EVAL_LIVE=1` plus explicit project/location/model arguments or their documented environment variables.

- [x] **Step 1: Write failing adapter route tests.**

  Inject spies rather than real SDK/network calls. Assert meal/label cases call the matching existing prompt and parser; a barcode with supplied barcode calls OFF first; an OFF miss calls the barcode image prompt; the current known-product prediction stays per-100 and lacks basis fields so the baseline exposes the bug.

- [x] **Step 2: Write failing report/CLI safety tests.**

  Assert JSON and Markdown contain dataset/model/prompt/code hashes, case/aggregate metrics, failure categories, and `baselineOnly: true`. Assert they do not contain image bytes, private absolute paths, environment values, access tokens, raw provider messages, or stack traces. Assert `baseline` refuses to start without the live opt-in and `fixtures` never constructs the live adapter.

- [x] **Step 3: Run focused tests and witness RED.**

  Run: `cd functions && npx vitest run test/nutrition-eval/live-adapter.test.ts test/nutrition-eval/report.test.ts test/nutrition-eval/cli.test.ts`

  Expected: FAIL because the adapter/report/CLI modules do not exist.

- [x] **Step 4: Implement the live adapter without Firebase imports.**

  Convert the verified image bytes to base64 only at the existing `generateVision` call. Map successful current parser output into `NutritionPrediction`. For OFF hits, map the current `OffProduct` per-100 fields exactly; do not add desired package multiplication in this plan. Convert final failure classes to stable codes (`model_response_invalid`, `provider_request_failed`) and discard raw error bodies.

  `expectedBarcode` remains scoring truth only. An optional validated `suppliedBarcode` represents observed client input: query OFF first, fall back to barcode vision on a miss, and query a distinct vision-read barcode once. An OFF `null` is a route miss rather than a final prediction failure; it must not replace a usable vision prediction. Map invalid vision output to `schema/model_response_invalid` and thrown provider/OFF dependencies to `provider/provider_request_failed`, with no raw error serialization.

- [x] **Step 5: Implement stable reports and explicit CLI gates.**

  Add these scripts:

  ```json
  {
    "eval:nutrition:fixtures": "vitest run test/nutrition-eval",
    "eval:nutrition:baseline": "npm run build && node lib/nutrition-eval/cli.js baseline",
    "eval:nutrition:release": "npm run build && node lib/nutrition-eval/cli.js release"
  }
  ```

  `baseline` always exits zero for measured quality failures but nonzero for manifest/integrity/runner failures. `release` exits nonzero for any schema/privacy/safety failure or configured enforced threshold. Both write a report even when individual cases fail.

- [x] **Step 6: Run GREEN and prove there is no Firebase coupling.**

  Run: `cd functions && npx vitest run test/nutrition-eval/live-adapter.test.ts test/nutrition-eval/report.test.ts test/nutrition-eval/cli.test.ts && npm run build && npm run lint`

  Run: `rg -n "firebase-admin|firebase-functions|sendPush|updateEntry|firestore|storage\(\)" functions/src/nutrition-eval`

  Expected: tests/build/lint PASS and the search returns no matches.

- [x] **Step 7: Record and commit the live harness stage.**

  Update tracking and commit with message `Add live nutrition baseline runner`, then push.

## Task 6: Add the private Vitamin Well overlay safely

**Files:**
- Create: `functions/src/nutrition-eval/private-overlay.ts`
- Create: `functions/test/nutrition-eval/private-overlay.test.ts`
- Modify: `functions/src/nutrition-eval/assets.ts`
- Modify: `functions/test/nutrition-eval/assets.test.ts`
- Modify: `functions/src/nutrition-eval/cli.ts`
- Modify: `functions/test/nutrition-eval/cli.test.ts`
- Create locally only: `.nutrition-eval/private/manifest.json`
- Create locally only: `.nutrition-eval/private/vitamin-well-reload.jpg`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `loadPrivateOverlay(path): {root: string; manifest: NutritionEvalManifest}` requires every case to use `visibility=private` and a portable relative image path below the overlay directory; `root` is the canonical trusted root used by the CLI-created private image closure, while the runner remains on its one-argument `loadImage(case)` API.
- `mergePrivateOverlay(publicManifest, overlay): NutritionEvalManifest` rejects duplicate IDs/object IDs and never serializes local paths into reports.
- Task 6 wires `--private-manifest` / `CALORIX_NUTRITION_EVAL_PRIVATE_MANIFEST` into the CLI; a requested but missing/invalid overlay returns `private_case_unavailable` and never silently skips the case.
- Private case ID is `vitamin-well-reload-7350042716380`; truth is package `500 ml`, `85 kcal`, `0 g protein`, `21 g carbs`, `0 g fat`, barcode `7350042716380`, expected decision `needs_review` while OFF remains unconfirmed.

- [x] **Step 1: Write failing traversal/privacy and CLI integration tests.**

  Reject POSIX/Windows absolute paths, `..`, symlink escape, public visibility, duplicate IDs/object IDs, mismatched hash, and output serialization containing the overlay root. Accept a valid relative path whose bytes match. Prove both overlay preflight and the actual `loadVerifiedCaseImage` private path re-resolve canonical containment and verify the bytes used. Assert an absent overlay stays public-only, while a requested missing/invalid overlay returns `private_case_unavailable` before adapter/model construction and a valid overlay root reaches private image loading.

- [x] **Step 2: Run the private-overlay test and witness RED.**

  Run: `cd functions && npx vitest run test/nutrition-eval/private-overlay.test.ts test/nutrition-eval/assets.test.ts test/nutrition-eval/cli.test.ts`

  Expected: FAIL because `private-overlay.ts` does not exist and the existing asset/CLI boundaries do not yet implement the strict private-overlay contract.

- [x] **Step 3: Implement strict private overlay loading.**

  Resolve with `realpath`, require the resolved asset to start with the resolved overlay directory plus path separator, reuse public image SHA/media/dimension verification, and replace the path in all results with the stable private case ID. Extend the existing private branch in `loadVerifiedCaseImage` so every actual inference load independently re-resolves root and asset realpaths, rechecks containment, and verifies the exact bytes it returns; overlay preflight and runtime loading must share this safe boundary.

- [ ] **Step 4: Re-encode the authorized source image and verify metadata removal.**

  Execution note (2026-09-01): `CALORIX_VITAMIN_WELL_SOURCE_IMAGE` was unset, so no private directory, image, or manifest was created and metadata, hash, and dimensions could not be produced.

  Provision the already authorized read-only Vitamin Well source into a temporary path outside the repository. Run:

  ```bash
  mkdir -p .nutrition-eval/private
  ffmpeg -y -i "$CALORIX_VITAMIN_WELL_SOURCE_IMAGE" -map_metadata -1 -q:v 2 .nutrition-eval/private/vitamin-well-reload.jpg
  ffprobe -v error -show_entries format_tags:stream_tags -of json .nutrition-eval/private/vitamin-well-reload.jpg
  sha256sum .nutrition-eval/private/vitamin-well-reload.jpg
  file .nutrition-eval/private/vitamin-well-reload.jpg
  ```

  Expected: `ffprobe` reports no EXIF/device/location tags. Record only the sanitized image SHA/dimensions in the local overlay; never record the source path or original metadata.

- [x] **Step 5: Run GREEN and prove ignore coverage.**

  Run: `cd functions && npx vitest run test/nutrition-eval/private-overlay.test.ts test/nutrition-eval/assets.test.ts test/nutrition-eval/cli.test.ts`

  Run: `git check-ignore -v .nutrition-eval/private/manifest.json .nutrition-eval/private/vitamin-well-reload.jpg`

  Expected: test PASS; both private files are ignored by the root `.gitignore` rule.

- [ ] **Step 6: Record and commit only code/tests/tracking.**

  State whether the private case is ready or the exact missing-source blocker. Commit no private bytes or manifest. Commit code/tests/status with message `Protect private nutrition fixtures`, then push.

## Task 7: Record the pre-change live baseline

**Files:**
- Generate locally only: `.nutrition-eval/reports/<run-id>/report.json`
- Generate locally only: `.nutrition-eval/reports/<run-id>/report.md`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Consumes the pushed source SHA, public manifest, optional private overlay, explicit Vertex project/location/model, and sample count.
- Produces a report whose `runId` is stable metadata plus UTC timestamp, never a claim that production behavior passed.

- [ ] **Step 1: Verify the exact pre-change source and credentials without mutation.**

  Run: `git status --short && git rev-parse HEAD && gcloud config get-value project && gcloud auth list --filter=status:ACTIVE --format='value(account)'`

  Expected: branch/source recorded; project is `calorix-xurschnell`; account identity may be recorded but no token/credential output. `.mcp.json` remains the only unrelated dirty path.

- [ ] **Step 2: Run deterministic fixtures immediately before live inference.**

  Run: `cd functions && npm run eval:nutrition:fixtures && npm run build && npm run lint`

  Expected: PASS with zero network/model calls in the fixture suite.

- [ ] **Step 3: Run one baseline sample over all available cases.**

  Run:

  ```bash
  cd functions
  RUN_NUTRITION_EVAL_LIVE=1 \
  CALORIX_NUTRITION_EVAL_PROJECT=calorix-xurschnell \
  CALORIX_NUTRITION_EVAL_LOCATION=us-central1 \
  CALORIX_NUTRITION_EVAL_MODEL=gemini-2.5-flash \
  CALORIX_NUTRITION_EVAL_CODE_SHA="$(git rev-parse HEAD)" \
  CALORIX_NUTRITION_EVAL_PRIVATE_MANIFEST=../.nutrition-eval/private/manifest.json \
  npm run eval:nutrition:baseline -- --samples 1
  ```

  Expected: 20 public plus one private case when the overlay is present; every case is counted. A missing private overlay is an explicit `private_case_unavailable` blocker, never a silent skip. Numeric/safety failures are expected baseline evidence and do not authorize production changes.

- [ ] **Step 4: Inspect every case row and aggregate invariant.**

  Confirm case count, parse count, selected adapter/model, prompt hash, dataset hash, code SHA, basis/barcode denominators, catastrophic/unsafe counts, and failure categories. Confirm the known-barcode cases expose current per-100-as-package behavior and the Vitamin result is compared with `85 kcal / 500 ml`.

- [ ] **Step 5: Record only privacy-safe baseline summary.**

  Add the run ID, exact source SHA, provider/model route, public/private case counts, parse rate, median/p90 calorie errors, macro error, basis accuracy, barcode accuracy, Review rate, catastrophic and unsafe-completion counts, latency summary, and every failure category/code to `docs/implementation-status.md`. Do not commit generated reports or private paths.

- [ ] **Step 6: Commit and push the baseline checkpoint.**

  Commit tracking with message `Record nutrition evaluation baseline`, then push. This commit is the immutable comparison point for the later nutrition-contract plan.

## Task 8: Close Stage A/B verification and review

**Files:**
- Modify: `docs/implementation-status.md`
- Modify: this plan's checkboxes during execution

- [ ] **Step 1: Run the complete local verification.**

  Run: `cd functions && npm run test:verify`

  Run from repository root: `fvm flutter analyze && fvm flutter test`

  Expected: all PASS. If a pre-existing unrelated failure remains, record the exact command/output and demonstrate the focused nutrition suites still pass; do not call the stage complete without resolving or explicitly accepting that blocker.

- [ ] **Step 2: Request mandatory post-implementation review.**

  Continue Antigravity conversation `calorix-nutrition-eval-20260830` using `gemini-3.6-flash`, `approvalMode: yolo`, and this exact restriction: `Do not edit files, do not run write commands, and do not mutate the repository; only inspect, reason, review, and propose changes for the main agent to apply.` Ask it to inspect the pushed Stage A/B diff, deterministic test evidence, corpus licensing/privacy, report contract, and live baseline accounting.

  Expected green response: `AGREEMENT_STATUS: agree` and `MUST_FIX: none`. Address every must-fix in the same conversation and rerun affected checks before continuing.

- [ ] **Step 3: Run secret/private-artifact and working-tree checks.**

  Run: `git status --short && git diff --check && git ls-files .nutrition-eval && git grep -nE '(ya29\.|AIza|BEGIN PRIVATE KEY|vitamin-well-reload\.jpg)' -- ':!docs/implementation-status.md' || true`

  Expected: `.nutrition-eval` has no tracked files; no credential/private image leakage; `.mcp.json` remains untouched.

- [ ] **Step 4: Record the handoff to the nutrition-contract plan.**

  Mark every genuinely complete checkbox, record exact verification/review results and pushed HEAD, and name the next artifact: `docs/superpowers/plans/2026-09-01-nutrition-package-contract-and-review-controls.md`. Commit with message `Close nutrition evaluation foundation`, then push.

## Stage A/B Exit Criteria

- The deterministic schema/integrity/scorer/runner/report suites passed and contain witnessed RED/GREEN evidence.
- Exactly 12 official Nutrition5k overhead test images and 8 pinned Open Food Facts cases are represented with no public-image checksum drift.
- The private Vitamin fixture is sanitized, ignored, path-contained, and counted, or its precise availability blocker is recorded.
- The live baseline exercised the existing production adapter/prompt/parser/OFF boundaries without any remote data write.
- Every manifest case appears in the report; no failed/missing case was omitted from denominators.
- The baseline is clearly labeled pre-fix and makes no nutrition-correctness or production-readiness claim.
- Mandatory external review is green and the final Stage A/B commit is pushed.
