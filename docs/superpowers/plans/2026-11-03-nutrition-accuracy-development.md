# Nutrition accuracy development implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, with permitted editing workers. One whole-feature read-only implementation review; do not request another routine user approval.

**Goal:** Implement and measure an actual meal-prompt repair candidate against the existing 24-case 3.8 development baseline, then continue toward exceeding the saved 2.5 benchmark.
**Architecture:** Small opt-in development evaluator reusing current adapter, strict schema, scorer/report builder and fixed SDK route. Production and sealed V1/V2 evaluation paths remain untouched.
**Tech Stack:** Existing TypeScript/CommonJS, Node, Vitest, installed @google/genai 2.19.0.
**Spec:** `docs/superpowers/specs/2026-11-03-nutrition-accuracy-development-design.md`.

## Global constraints

- Vertex `calorix-xurschnell` / `us` / `gemini-3.8-flash` / API v1 / MEDIUM / 30000 ms; at most24 image calls, zero token counts/warmups/retries/fallbacks.
- New identity `calorix-accuracy-meal-prompt-v1`, fixed new ignored root `.nutrition-eval/accuracy-development/meal-prompt-v1`; refuse every existing run root, no recovery/reset/resume. Incomplete reservation remains spent; never fabricate an interrupted terminal on startup/shutdown.
- Original V1/V2 bytes/locks, production prompts/models, label/barcode paths, metrics/old comparator stay exact. New prompt intentionally changes identity; final comparison is whole-pipeline aggregate.
- Only FINAL-selected 24 development cases, no held-out access. Manifest rawSHA `59231d1cfda7e8a795901086f379f0bdb331dbf082ff51b37e3758e381bebd4e`, baseline MEDIUM rawSHA `34939cc3ecbc3637ee6f1e196bfbbaf68ad48668a6b16cd63ad1c2c74e9cf922`.
- Candidate progress requires all22 baseline-success IDs still succeed, parse>=23, unsafe0, catastrophic<=2, calorie median<=0.18440896769339005/p90<=0.45463187086065293, zero-safe macro<1.5064710070741663. Absolute macro goal<=0.50, each macro median<=0.35; progress is not qualification.
- Disk-backed task TMPDIR/caches/logs; clean isolated branch, ordered editing routes, real RED/GREEN, independent MCP pre/post reviews, bounded commit/push. No deployment/production writes/new2.5call.

## Review focus

1. Previously successful dish becomes a failure while aggregate coverage rises: veto progress; retain all24.
2. Missing/duplicate/wrong metadata or swallowed hook failure: first fatal must outrank ordinary provider scoring.
3. Partial run/crash/repeated invocation: consumed/ambiguous reservations never repeat; no startup mutation/recovery.
4. Same-looking wrong food has self-consistent calories/macros: do not mistake synthetic arithmetic tests for accuracy; inspect actual predicted names/errors across all24.
5. New prompt/dataset identity compared to saved2.5: preserve old comparator, do not imply a controlled model-only comparison or invent historical rows.

## Task 1: Candidate, bounded evaluator and native once-only entrypoint

**Files:** create `functions/src/nutrition-eval/accuracy-development.ts`, `accuracy-development-cli.ts`; `functions/test/nutrition-eval/accuracy-development.test.ts`, `accuracy-development-cli.test.ts`; exact prepared `functions/eval/nutrition/accuracy-development-manifest-v1.json`. No existing application file changes; tracking docs updated.

**Interfaces:** Core exports `ACCURACY_MEAL_PROMPT_V1`, `AccuracyDevelopmentIdentity` (`runId,timestamp,codeSha,datasetHash` strings), `AccuracyDevelopmentDeps` (`loadImage(case):Promise<Uint8Array>`, lazy `createClient():GenAIClient`, `reserve(caseId,index):Promise<void>`, `persistOutcome(outcome):Promise<void>`, `nowMs():number`) and `runAccuracyDevelopment(cases:readonly NutritionEvalCase[],deps:AccuracyDevelopmentDeps,identity:AccuracyDevelopmentIdentity):Promise<AccuracyDevelopmentResult>`. Result includes generic `report`, separate `diagnostics`, `sdkVisionCalls`. Define exported outcome/result structures minimally from existing schema types; no raw errors or new authority token.

Native exports `runNativeAccuracyDevelopment(repositoryRoot:string,env:NodeJS.ProcessEnv):Promise<unknown>` as a trusted test seam; CLI main computes package root from __dirname, accepts no argv, and is guarded by require.main. Exact output shape uses `{status:'completed'|'failed',...}` with static failure codes, never raw exceptions. Root argument is not a CLI flag. Import must create no client/artifact.

- [x] Write behavioral failing tests first with a tiny throwing stub. Existing24-case manifest fixture with synthetic PNG bytes/SDK returns supports schema/parser/report coverage; this is not food accuracy evidence. Host runs new two-file focus and accepts assertion/stub failures rather than missing imports or invalid test types.
- [x] Implement candidate/core minimally. Append general prompt guidance with double newline. Core validates24 unique public meal cases; native pins the exact committed manifest. Trusted loader verifies SHA/media/dimensions and core preloads all24 byte arrays, then lazily obtain client and wrap models.generateContent to enforce matching pre-reservation/exact-one SDK call/24cap. Reuse real GenAIAdapter/live adapter/schema/scorer/report. Require one exact modelVersion callback on each nonempty resolved response, invalidJSON included; empty/provider rejection can lack metadata. Preserve first fatal before/after trusted callbacks and reflection; never downgrade it through the live adapter.
- [x] Implement native preflight, fixed-source inputs/output and exclusive run creation. Require RUN_NUTRITION_ACCURACY_DEV=1 and no arguments; verify committed clean source/HEAD and exact manifest. Use offline cache only, no network asset fetch. Marker precedes client; reservation JSONL append+fsync precedes SDK; ordinary outcome append+fsync precedes next dish. Capture bounded final JSON only; oversized text length/hash marker, unchanged parser input. Sidecar carries actual predicted names/weights/model/profile/counters, no forged legacy calibration metadata. Use own data numeric HTTP status only for safe categories, never raw messages/getters. Partial reservation stays spent and root unrestartable.
- [x] Native publication fsyncs JSON/Markdown/diagnostics separately, then emits a final completion marker binding hashes after all are durable. This is multi-file completion evidence, not an atomic multi-file filesystem transaction. No completion marker on partial publication. Root remains, no cleanup/unlock/retry path.
- [x] Add tests for all review-focus conditions and native disk effects: all24 accounted; no truth in prompt; reserve-before-call; missing assets/opt-in/dirty source/existing root beforeclient; ordinary429/parse errors remain spent; getters/throwing descriptors don't expose error; fatal/metadata mismatch halts with no extra SDK; output retention limit; partial/completed run refuses; publication failure cannot mark complete. Use fsynced disk fixtures and fake SDK, no live keys.
- [x] Host runs build, lint, new focus plus old `live-adapter.test.ts`, `scorer.test.ts`, `report.test.ts`, existing GenAI adapter/generation-profile test files resolved by rg. Verify old tracked Functions sources remain exact. Fresh independent whole-feature source review and mandatory Antigravity source/results review; fix Important/Critical with real RED/GREEN, no automatic re-review loop. Focused qualification is not the previously retained full5377 suite; do not claim it is. Commit/push implementation, verify clean exact origin before live.

## Task 2: Run one actual24-image candidate and act on its result

**Consumes:** Task1 compiled native entrypoint, pinned24 manifest/prompt/source/SDK, frozen baseline/artifact mappings. No source/docs changes during the live attempt.

- [ ] Copy exactly24 cached images from finalized source bySHA/header/size into fixed new cache. Preserve source and validate all before client. Recheck scoped project/ADC/API/billing, no credential override; log sanitized booleans/project only. Pin HEAD/source/runtime/SDK/manifest/prompt/schema and original frozen evidence. Confirm new run root absent and reviewed24callbudget.
- [ ] Run compiled native accuracy-development-cli.js exactly once with RUN_NUTRITION_ACCURACY_DEV=1 and child CLOUDSDK_CORE_PROJECT=calorix-xurschnell. No countTokens or separate model smoke. Capture actual native exit/sidecar/reservation/outcome counts; a process error never authorizes replay. Record every successful/failed/ambiguous outcome, no partial success claim.
- [ ] Independently audit all24 rows/diagnostics/model/request/error counts and actual file hashes. Compare same IDs/truth/image pins to savedMEDIUM baseline, veto any lost baseline success. Record coverage first, calorie and bothmacro/mass/density/safety/latency; full24primary, common-successsecondary only. No heldout inspection or historic2.5 superiority claim from development.
- [ ] Consult Antigravity on actual reached results and inspected artifacts. If candidate fails, preserve it and choose the next specific repair based on observed errors under another bounded reviewed iteration; do not stop the overall accuracy goal. If candidate qualifies for freezing, record exact prompt/schema/source and separately review validation/final comparison protocol/budgets.
- [ ] Update status/plan/report, commit/push result checkpoint, verify clean exact origin; link GitHub plan. Report honest baseline difference and actual accuracy change, including regressions. No production promotion.

Task1 implementation qualified2026-11-07:294PASS0FAIL0skip6files, build/lint0, old206sourcefilesexact. Onefreshnative review2Importantfixed byactualRED/GREEN; oneMinor empty-response safe-category tagging deferred. Corrected primary3.8/High MCPsource/resultagree/MUSTnone. This code/trackingcheckpoint is committed/pushed before Task2; exact-origin/source binding rechecked afterwards. No new food/model-token requests yet. See [qualification and actual result report](../../nutrition-accuracy-development-2026-11-07.md).
