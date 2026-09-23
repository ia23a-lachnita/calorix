# Gemini 3.8 Nutrition Calibration Design

**Date:** 2026-09-23

**Status:** Approved, including the historical-baseline-only correction; implementation plan pending

## Context

Calorix production and the public nutrition evaluation currently use `gemini-2.5-flash`. The three-sample public run `run-2026-09-11T20-22-21-450Z` established a useful safety baseline but not acceptable nutrition accuracy: all 60 public results parsed, no unsafe completion escaped Review, and 15 calorie estimates were catastrophic. Across the 36 meal results, mass estimation dominated 31 errors, while carbohydrate and fat density errors remained independently high. Calories, protein, carbohydrates, and fat all matter to the product.

Google now offers the generally available, multimodal `gemini-3.8-flash` model with structured-output support. The active Application Default Credentials use quota project `calorix-xurschnell`; that project is active, billing-enabled, and has Vertex AI enabled. Read-only `countTokens` probes confirmed `gemini-3.8-flash` access at both Vertex `us` and `global`. Calorix uses Vertex AI pay-as-you-go Dynamic Shared Quota, not Google AI consumer Pro or Google AI Studio API-key quotas.

The existing 12 Nutrition5k meal cases are all from the official test split and have already been inspected. They remain a frozen benchmark: they must not guide model/profile selection or prompt changes. New calibration data comes only from the disjoint official Nutrition5k training split.

An external review response claimed two Gemini 3.x evaluation run IDs that are absent from the repository, status history, and ignored local reports. Those claims are response noise and are not evidence. This design relies only on verified repository records, official model documentation, and future runs created under the protocol below.

## Goal

Determine whether `gemini-3.8-flash` materially improves meal calories and all three macros over the recorded `gemini-2.5-flash` historical results, using a preregistered, public-only, reproducible evaluation that cannot silently change production behavior. No new 2.5 provider call is permitted.

## Non-goals

- Do not change the production default model, Firestore model configuration, prompts, nutrition schema, normalization, Review policy, or confidence threshold during calibration.
- Do not deploy Functions, write Firebase data, operate a device, or use private images or fixtures.
- Do not tune against the existing 12-case Nutrition5k test benchmark.
- Do not include `gemini-3.1-pro-preview` in the qualification gate. A preview/costly challenger would require a separate approved design after the stable Flash candidate is measured.
- Do not claim that a newer model is more accurate until the recorded gates pass.
- Do not treat Google consumer Pro or AI Studio paid tiers as Vertex capacity.
- Do not call `gemini-2.5-flash` during compatibility, development, validation, or benchmark stages. Its prior results are a fixed regression reference, not an active arm.

## Model and project routing

### Fixed project and residency

All calibration calls use:

- Vertex project: `calorix-xurschnell`
- Vertex location: `us`
- API: `aiplatform.googleapis.com` through `@google/genai` with `vertexai: true`
- API version: `v1`

The `us` multi-region is supported by Gemini 3.8 and preserves a US processing boundary for later production consideration. `us-central1` is invalid for Gemini 3.8; `global` is available but is not used for this qualification. A future production migration must separately document its data-residency impact and keep `us` unless an explicitly reviewed requirement changes it.

### Model profiles and historical reference

The calibration has two development profiles:

1. `gemini-3.8-flash` with structured output and `thinkingLevel: LOW` — candidate profile A.
2. `gemini-3.8-flash` with structured output and `thinkingLevel: MEDIUM` — candidate profile B and the model's documented default effort.

Only one Gemini 3.8 profile may advance beyond development. `HIGH` is excluded to bound cost and latency. Gemini 3.8 requests omit deprecated sampling fields, including `temperature`, `topP`, and `topK`.

`gemini-2.5-flash` is historical evidence only. No stage invokes it. The regression reference is the already-inspected run `run-2026-09-11T20-22-21-450Z`, with source SHA `bb414d1850fb9f91cc419b4a270138354abf5535`, dataset hash `2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56`, prompt hash `205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263`, model `gemini-2.5-flash`, 20 public / 0 private cases, and three uncached samples. Its recorded aggregate results are 60/60 parsed, zero failures, zero unsafe completions, 52 Review outcomes, 15 catastrophic calorie misses, 27.19% median and 101.36% P90 relative calorie error, and 52.27% legacy mean macro relative error using the scorer's existing denominator semantics. Recorded diagnostic references are 46.95% mean meal-mass error, 77.80% mean meal carbohydrate-density error, and 37.86% mean meal fat-density error. Metrics not recorded for that run must not be invented, and the historical legacy macro mean must not be mislabeled as the new zero-safe metric.

Commit a strict historical-reference record containing only those verified aggregates and identities. It is not a reconstructed report, has no per-case predictions, and does not enter the baseline loader as if the ignored raw report still existed.

The exact model ID, location, thinking level, prompt hash, schema hash, code SHA, dataset hash, and sample index must be part of report identity and cache identity. A report that omits or conflates profiles is invalid.

## Generation-profile seam

The existing `GenAIAdapter` hardcodes `temperature: 0`, which is not a valid long-term Gemini 3.8 contract. Introduce an explicit, pure generation-profile resolver without changing the production default model:

```ts
type VisionGenerationProfile =
  | { kind: 'gemini-2'; temperature: 0 }
  | { kind: 'gemini-3'; thinkingLevel: 'LOW' | 'MEDIUM' };

resolveVisionGenerationProfile(
  model: string,
  requestedThinkingLevel?: 'LOW' | 'MEDIUM',
): VisionGenerationProfile;
```

The resolver must:

- retain the current `temperature: 0` payload for `gemini-2.5-flash`;
- omit `temperature`, `topP`, and `topK` for `gemini-3.8-flash`;
- send `thinkingConfig: { thinkingLevel }` for Gemini 3.8;
- reject unsupported model/profile combinations rather than silently applying a default;
- remain injectable and fully covered by hermetic adapter tests.

Extend `GenAIAdapter.generateVision` only through a trailing optional generation-options argument. Existing production callers using `(model, prompt, imageBase64, source)` must compile and preserve their exact 2.5 behavior without call-site churn.

The live evaluation CLI accepts an explicit `--thinking-level low|medium` only for Gemini 3.8. The absence of the flag for Gemini 3.8 is invalid in calibration commands so each run has a stable identity. Production callers continue to use the unchanged `gemini-2.5-flash` default until a separate migration task is approved.

## Calibration corpus

### Source and size

Create `calorix-n5k-calibration-v1` from exactly 40 public Nutrition5k dishes in the official training split:

- 24 development cases;
- 16 validation cases;
- zero overlap with the existing 12 official test cases;
- overhead RGB image available;
- finite nonnegative calories, protein, carbohydrates, and fat;
- finite positive total mass and calories;
- HTTPS source URL, SHA-256, dimensions, media type, truth tuple, mass, split, and CC BY 4.0 attribution pinned in the committed manifest.

No image bytes or provider responses are committed. Downloads and reports remain under ignored `.nutrition-eval` paths.

### Deterministic selection

Selection uses pinned official Nutrition5k metadata and split-file SHA-256 hashes. The generator verifies the upstream training split hash before parsing or selecting, so a changed upstream file fails offline reproduction rather than silently producing a different corpus. Eligible dish IDs are ranked by:

```text
sha256("calorix-n5k-calibration-v1:" + dishId)
```

The selector balances three observable truth dimensions without viewing model output:

- component count: one, two, or three-plus ingredients;
- total calories: below 150, 150–400, or above 400 kcal;
- caloric macro dominance from `4*protein`, `4*carbohydrates`, and `9*fat`.

The committed selector, source hashes, and manifest must reproduce the same 40 IDs. Tests fail on overlap, duplicate IDs, missing hashes, invalid truth, invalid URLs, unbalanced required coverage, or output drift.

Development cases may be inspected after runs. Validation case outputs remain uninspected until both Gemini 3.8 profiles are frozen and one advances from development. The existing 12-case benchmark remains unopened for Gemini 3.8 until validation passes.

## Evaluation protocol

### Stage 0: compatibility preflight

Before image inference:

- confirm ADC quota project is `calorix-xurschnell` without printing credentials;
- confirm billing and Vertex API status read-only;
- run `countTokens` for `gemini-3.8-flash` at location `us`;
- run one public development image through each of the two Gemini 3.8 profiles;
- require a valid structured response, exact report identity, and no `400`, `403`, `404`, `429`, or `5xx` provider result.

Any failure stops the live protocol. It does not authorize a fallback project, location, model alias, API key, or schema relaxation.

### Stage 1: development screen

Run the 24 development cases once through both Gemini 3.8 profiles: 48 image calls. Use the identical prompt, JSON schema, parser, normalizer, and scorer for both profiles.

Choose between Gemini 3.8 LOW and MEDIUM using this fixed ordering:

1. zero unsafe completions;
2. higher parse count;
3. lower catastrophic calorie count;
4. lower mean zero-safe macro relative error;
5. lower median calorie relative error;
6. lower P90 latency.

Ties advance MEDIUM because it is the documented default accuracy profile. No prompt, schema, threshold, corpus, or ranking change is allowed after development results are visible.

The selected Gemini 3.8 profile advances only if it has zero unsafe completions, at least 23/24 parses, at most six catastrophic calorie misses, median relative calorie error at most 35%, mean zero-safe macro relative error at most 50%, and no more than 30 seconds P90 latency. Otherwise the workstream stops with no production change.

### Stage 2: validation gate

Run the 16 validation cases with three uncached samples through only the frozen Gemini 3.8 profile. This stage uses 48 image calls. Every one of the 48 outcomes is accounted for, but no implementation or threshold change may follow from validation inspection.

Gemini 3.8 passes only when all conditions hold:

- zero unsafe completions;
- at least 46/48 successful parses;
- at most eight catastrophic calorie misses;
- median calorie relative error at most 25%;
- P90 calorie relative error at most 90%;
- mean zero-safe macro relative error at most 45%;
- median protein, carbohydrate, and fat relative error each at most 35%;
- median meal-mass relative error at most 35%;
- P90 latency at most 30 seconds.

Relative metrics omit zero-truth values; zero-truth nutrients retain predicted, truth, and absolute error. The summary must publish separate median protein, carbohydrate, and fat relative errors rather than relying only on a pooled mean.

Failure of any condition ends this model-only workstream. Production stays on the existing safety-green 2.5 path, and any prompt/schema/per-item decomposition experiment requires a new approved design.

### Stage 3: frozen public benchmark

Only after validation passes, run all 20 existing public benchmark cases with three uncached samples through the frozen 3.8 profile. This yields 60 evaluator outcomes and an expected 48 Gemini calls: the 12 meals and four labels use vision, while the four supplied-barcode cases use their committed, checksum-pinned OFF snapshots through the production normalizer and must make zero vision or live OFF network calls. This keeps catalog availability from confounding the model comparison.

The benchmark is evaluated exactly once. Its result may approve or reject promotion but may not trigger tuning. Comparison uses only the verified aggregate fields in the historical 2.5 reference; it never fabricates missing case-level or per-macro baseline values.

Promotion requires all of the following:

- 60/60 evaluator outcomes accounted for and 60/60 parsed;
- zero unsafe completions and zero model/schema/normalization failures;
- no more than 12 catastrophic calorie misses, improving on historical 15;
- median relative calorie error at most 25%, improving on historical 27.19%;
- P90 relative calorie error at most 90%, improving on historical 101.36%;
- legacy `meanMacroRelativeError` at most 45% under the unchanged historical denominator semantics, improving on historical 52.27%;
- mean meal-mass relative error at most 40%, improving on historical 46.95%;
- mean meal carbohydrate-density error at most 70%, improving on historical 77.80%;
- mean meal fat-density error at most 35%, improving on historical 37.86%;
- all absolute validation gates for separate protein, carbohydrate, and fat medians still hold;
- every supplied-barcode case makes zero vision calls.

A failure keeps production unchanged.

### Call ceiling

The planned maximum is 146 Gemini image calls:

- Stage 0: 2;
- Stage 1: 48;
- Stage 2: 48;
- Stage 3: 48 expected Gemini calls across 60 evaluator outcomes.

The hard authorization ceiling is 300 image calls. Retries, reruns, or additional models may not exceed it. Provider failures are recorded as failures; they do not silently consume repeated samples. Exceeding the planned count requires an explicit recorded reason and still may not exceed 300.

## Scoring and report changes

The evaluator needs additive, backward-compatible summaries before live comparison:

- median relative error for protein, carbohydrates, and fat, excluding zero truth;
- zero-truth sample counts and mean/median absolute error for those samples;
- mean and median meal-mass relative error;
- mean meal carbohydrate- and fat-density relative error under the existing diagnostic semantics;
- per-profile parse, catastrophic, unsafe, and latency counts;
- explicit deltas from the verified historical aggregate reference for fields that exist in both records;
- exact generation-profile identity.

Existing report fields and the historical fixture remain valid. Every additive summary field is optional in the report's Zod schema so historical reports continue to deserialize; newly created calibration reports require the fields through a calibration-report refinement/version contract. Formal baseline compatibility continues to report model/profile mismatches rather than pretending reports are interchangeable. The historical-reference comparator supports aggregate regression checks only and rejects any request for unavailable per-case or per-macro historical data.

## Safety, privacy, and failure behavior

- All cases are public and CC BY 4.0 attributed.
- No private manifest, Firebase read/write, deployment, notification, device, or production account is used.
- No raw model text, food names from predictions, prompts, image bytes, credentials, tokens, stack traces, or absolute paths are committed.
- Provider errors retain stable privacy-safe categories.
- Every vision meal remains `needs_review` throughout this workstream; model accuracy does not weaken Review routing.
- `429` under Vertex DSQ is a provider-capacity observation, not evidence that a consumer subscription or another API key should be used.
- The user-owned `.mcp.json` is never staged, restored, or rewritten.

## Promotion boundary

Passing calibration does not itself change production. A separate test-first migration task must:

1. obtain mandatory Antigravity pre-review;
2. update the production model/location/profile contract while preserving rollback;
3. run focused and full Functions verification plus the relevant live gates;
4. obtain mandatory post-review with `AGREEMENT_STATUS: agree` and `MUST_FIX: none`;
5. commit and push an exact source SHA;
6. deploy only with separate explicit authorization;
7. define an explicitly approved rollback behavior without silently reintroducing 2.5 as an evaluation or automatic fallback model.

Until that task completes, `DEFAULT_MODEL_CONFIG`, remote Firestore model configuration, and deployed Functions remain unchanged.

## Acceptance criteria for this design workstream

- A reproducible 40-case train-split calibration manifest exists with no test overlap.
- Model-aware request profiles are hermetically tested without changing the production default.
- The evaluator emits zero-safe per-macro metrics and strict historical aggregate regression comparisons.
- All offline tests, build, lint, privacy checks, and review gates pass before any live run.
- Live stages execute in order, stop on their gates, and remain within 300 calls.
- Every report records project, location, model, profile, prompt/schema/code/dataset identity, samples, provider errors, and all four-nutrient results.
- Production remains unchanged unless a later separately reviewed migration is authorized.
