# Offline Corpus Quality Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Existing strongest-first editing-worker policy remains in force; host owns verification, commits and pushes.

**Goal:** Produce an audited, reproducible 24/16 clean-scene candidate corpus without a model request or any change to protocol v1 evidence.

**Architecture:** Reuse the existing pure metadata parser, eligibility bins and slot schedule. Add a pinned vocabulary policy and a separate offline preparation command with hash-bound operator decisions. Its final candidate artifact is deliberately incompatible with the calibration runtime; activation is a future workstream.

**Tech Stack:** Existing TypeScript, Node crypto/fs/fetch, Zod3 and Vitest2; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-calibration-corpus-quality-recovery-design.md`

## Global Constraints

- Preserve every v1 lock/manifest/report/root file, prompt/schema/default and original CLI behavior. No recovery, reset, release or construction of a runtime ledger.
- No provider SDK/client, token request, model inference, response cache, live OFF query, deployment or production mutation. Additional provider budget is NOT activated.
- Official vocabulary bytes: 21540; SHA256 `87a9bbd1fd2e28f09f16305a04946ddbe31eb7d9d03686d7e2fb3d8f19f3effb`; path `metadata/ingredients_metadata.csv`. Preserve the existing three source pins exactly. Verify bytes before parsing.
- Candidate identity `calorix-n5k-quality-candidate-v2`; seed `calorix-n5k-calibration-v2:`; checklist revision `single-container-v1`. Candidate artifacts are not calibration reports/manifests.
- Quarantine ALL40 v1 training IDs and existing12 test-meal IDs; no old held-out photos/outputs. New photo QC occurs before any new prediction, without changing prompt/schema/gates.
- Exact old 24/16 slot schedules and bins; replacement only inside the same stratum. Source drift and exhaustion fail closed, never substitute during verification.
- Fixed separate working root `.nutrition-eval/corpus-quality-v2/`; task temp/cache paths must be verified disk-backed. Do not sweep shared temp or old task archives.
- Use literal repository editing-worker order, log exact failures/timestamps before fallback, and keep native fallback authorized only after exhaustion/unavailability/bounded nondelivery. Workers never commit or push.
- Source changes require genuine RED/GREEN, relevant focused tests/build/lint and the literal parent verifier before assembled acceptance. Capture long gates in task-owned disk-backed logs. No fresh wide rerun for unchanged docs alone.
- PhaseA continuation uses the already approved roadmap and mandatory independent review, not another user plan-approval pause.

## Review Focus

1. Correctly hashed but semantically deprecated/unknown ingredient IDs must be excluded before ranking; source hash failures must halt instead of silently emptying the pool. Task1 tests both paths.
2. A candidate from an old or wrong-image decision must not pass finalization. Task2 tests quarantine, image-hash binding, superseding records and replay.
3. A transient download error must not be disguised as a permanent quality rejection. Task2 tests transport abort/resume separately from explicit missing/invalid-image skips.
4. Output path tricks, concurrent writers and interrupted publication must not corrupt the candidate audit or touch any v1 root. Task2 tests fixed-root/path confinement, exclusive writer refusal and atomic publication failure.
5. A valid-looking candidate artifact must not activate the native runtime. Task2 tests import/CLI isolation and candidate rejection by the existing calibration schema, with no ledger/client calls.

---

## Task 1: Pinned vocabulary policy and deterministic metadata candidates

**Files:**
- Create: `functions/src/nutrition-eval/calibration-corpus-quality-policy.ts`
- Create: `functions/eval/nutrition/corpus-quality-source-lock-v2.json`
- Create: `functions/test/nutrition-eval/calibration-corpus-quality-policy.test.ts`
- Modify narrowly: `functions/src/nutrition-eval/calibration-corpus.ts` (export existing CSV parser; optional rank callback on pure slot filler only)
- Modify: `docs/implementation-status.md`, this plan

**Interfaces:**
- Reuse `DishMetadataRow`, `EligibleDish`, `parseAndVerifySource`, `parseTrainSplit`, `parseDishMetadataCsv`, `mergeDishMetadata`, `buildEligibleDishes`, `buildExcludedDishes`, `DEVELOPMENT_SLOT_SCHEDULE`, `VALIDATION_SLOT_SCHEDULE`.
- Export existing `parseCsvRecords(text: string): string[][]` without body changes.
- Add `rankDishId?: (dishId: string) => string` to `CalibrationSlotFillOptions`; absent means exact old `rankHash`. Do not add a runtime protocol option. Image-verification/legacy defaults remain unchanged.
- New `QualityIngredient`: canonical `ingredientId` (`ingr_` + ten digits), name, caloriesPerG, fatPerG, carbsPerG, proteinPerG, deprecated.
- `parseQualityVocabulary(bytes: Uint8Array, expected: ExpectedSourceBytes): ReadonlyMap<string, QualityIngredient>`: hash-before-decode/parse; exact actual six-column header, unique positive integer IDs, strict finite nonnegative numeric rates; deprecated means trimmed case-insensitive name `deprecated`.
- `QualitySourceBundle`: raw bytes for cafe1,cafe2,trainSplit,vocabulary,v1Manifest. `QualitySourcePins`: corresponding byte lengths/SHA256. Native callers use the committed source lock only; tiny hermetic fixtures supply their own explicit pins.
- `prepareQualityPool(bundle: QualitySourceBundle, pins: QualitySourcePins): QualityPool`: verifies every input before parsing; result has `eligible: EligibleDish[]`, sorted `excluded` inventory (`dishId`, typed reason, affected ingredient IDs), sorted `quarantineIds`, and exact source/quarantine digests. Preserve existing semantic exclusions; add `deprecated_ingredient`, `unknown_ingredient`, `quarantined_v1`/`quarantined_benchmark`. A valid empty descriptive ingredient name alone is not excluded.
- `rankQualityDish(dishId: string): string`: SHA256 of the fixed v2 seed plus ID. `selectQualityCandidates(pool: QualityPool, rejectedIds: ReadonlySet<string>): CalibrationSlotFillResult` uses the old exact schedules and new rank callback; no image or network work.
- Committed new lock contains the original three source pins copied exactly, new vocabulary URL/pin, raw v1 manifest pin `313c37c14cb912d5dc6410dbb3b812139c22d7533d2341678de3ac860b0c1d6d`, and candidate/seed/checklist identities. Do not overwrite the original lock.

- [ ] **Step 1: Write focused policy tests only.** Cover quoted/empty names, malformed headers/IDs/rates/duplicates, pin mismatch before parse, deprecated-ID detection even when dish name is empty, deprecated dish-name detection, unknown IDs, preserved empty names, immutable input, exclusion BEFORE ranking, all52 quarantined IDs, row-order independence, exact40 partition/margins and same-stratum replacement/exhaustion. Include the actual apple54/deprecated453 rates as a tiny fixture, not invented corrected truth. Add a legacy-default selection assertion and explicit new-rank comparison.

```ts
expect(vocabulary.get('ingr_0000000453')?.deprecated).toBe(true);
expect(pool.eligible.some(x => x.dishId === deprecatedDishId)).toBe(false);
expect([...selected.development, ...selected.validation]).toHaveLength(40);
expect(new Set(allSelectedIds).size).toBe(40);
expect(allSelectedIds.some(id => quarantinedIds.has(id))).toBe(false);
```

- [ ] **Step 2: Run RED.** `cd functions && npx vitest run test/nutrition-eval/calibration-corpus-quality-policy.test.ts --maxWorkers=1 --minWorkers=1 --no-file-parallelism`. A missing-import/export error alone is a preparation diagnostic, not the qualifying behavioral RED. Write tests first; if needed let the same permitted worker add only exported type/API stubs with throwing unimplemented bodies so assertions can execute. Expected valid-input/selection assertions fail for unimplemented behavior, not syntax/fixture/environment errors. Save raw output/native exit before any algorithm implementation.
- [ ] **Step 3: Implement the stated interfaces and new lock minimally.** Reuse the CSV engine and pure filler; no generic protocol framework, provider imports or source label repair. Unknown IDs exclude only the affected dish, while source parse/hash failures abort the operation.
- [ ] **Step 4: Run GREEN and static checks.** Run the new policy tests plus existing `calibration-corpus.test.ts`, `npm run build`, `npm run lint`. Expected all relevant assertions and static checks pass; original source-lock/manifest bytes and v1 canonical-prefix/config fingerprints remain exact. Parent verifier is an assembled gate inTask2, not claimed executed here.
- [ ] **Step 5: Review, track, commit and push.** Scoped implementation Antigravity agree/MUSTnone, record actual RED/GREEN and worker route failures; commit `Add pinned corpus quality policy`, push. Mark only this task complete; no candidate corpus or calibration quality claim yet.

## Task 2: Offline preparation command and auditable photo dispositions

**Files:**
- Create: `functions/src/nutrition-eval/calibration-corpus-quality-audit.ts` (candidate schema, deterministic replay and disposition/finalization checks)
- Create: `functions/src/nutrition-eval/calibration-corpus-quality-cli.ts` (thin native filesystem/download composition and argument parser)
- Create corresponding `functions/test/nutrition-eval/calibration-corpus-quality-audit.test.ts` and `calibration-corpus-quality-cli.test.ts`
- Modify: `functions/package.json` (only additive `eval:nutrition:corpus-quality` script), tracking docs

**Interfaces and commands:**
- Reuse Task1 policy types, pinned image inspection and exact schedules. Keep dependencies injectable for fixture tests. CLI import has no side effects; only actual main invokes it.
- `runCorpusQualityCli(argv: readonly string[], deps: QualityCliDeps): Promise<{exitCode: 0|1; status: string}>`, native adapter fixes the separate working root, loads committed pins and raw committed v1 manifest for IDs only. No configurable output path or runtime root.
- Commands: `prepare --allow-public-downloads`; `record-quality --case-id ID --image-sha SHA --verdict pass|reject --reviewer ID --note TEXT [--reason REASON] [--supersedes SEQUENCE]`; `finalize`; `verify`. Strictly reject unknown/duplicate flags, invalid combinations and blank notes/reviewer. No default downloads.
- `prepare` verifies source pins, replays all prior exclusions/dispositions deterministically, chooses40current candidates and downloads missing images with bounded concurrency and byte limits. Bind cached bytes bySHA; never replace a changed previously pinned image. Source fetch failures abort. Image404 or decoded invalid-image bytes are typed pre-finalization skips;429/5xx/network/timeout abort and resume the same candidate later, not quality-skip it. No silent download retries.
- Review checklist and reason taxonomy are exactly the spec. A decision binds ID,imageSHA,checklist,reviewer,note,sequence. Pass has no rejection reason; reject requires one. A superseding decision explicitly names the current prior sequence and retains it; reject stale/cross-image/duplicate dispositions. Finalized audits refuse further writes.
- Replaying with rejected IDs may move another candidate to an earlier slot in the same stratum; photo dispositions remain bound to case/image, not mutable slot numbers. Retain every considered candidate and decision; do not erase earlier passes no longer selected. No new predictions may guide selection.
- `finalize` recomputes selection and every source/image/decision/partition/quarantine digest, requires all40selected candidates pass and writes a strict candidate-only artifact atomically. Missing QC, unknown state, changed image, bad source or incomplete counts fail. `verify` performs read-only reproduction; no downloads/substitutions.
- Confine writes inside the fixed offline root; reject symlink escapes. Exclusive single-writer locking plus atomic replacement prevents lost updates; never reuse v1 lock code/root. Release only this tool's own ephemeral lock in `finally`; a foreign/stale writer lock is a reported blocker, not automatically removed. Capture failed publications without silently claiming completion.
- Candidate artifact retains source pins, selector/checklist identity, code checkpoint,52-ID quarantine digest, exact groups/strata/images, complete skip/exclusion/decision inventories and `modelRequests: 0`. It contains no calibration profile or successful stage field.

- [ ] **Step 1: Write failing audit/CLI tests first.** Exercise every command with injected fixture sources/images/fs, all disposition errors/replay cases, missing or rejected photos, tampering/source/image drift, transport abort versus typed skip, same-stratum exhaustion, finalization/publication failure, exclusive writer, symlink confinement, read-only verify/import and zero provider/native-ledger invocations. A controlled child import/main test proves actual compiled CLI dispatch and side-effect-free import. Existing v1 strict manifest must reject the candidate artifact.
- [ ] **Step 2: Run RED.** Focus the two new audit/CLI files serially. Use tests-first minimal throwing API stubs if needed; missing imports alone do not qualify. Retain actual behavior/assertion failures before algorithm implementation.
- [ ] **Step 3: Implement the smallest command/audit composition.** No new controller, calibration capability or provider route. The additive package script is `npm run build && node lib/nutrition-eval/calibration-corpus-quality-cli.js`.
- [ ] **Step 4: Run GREEN and assembled verification.** New three-file focus plus old corpus tests, build/lint and literal `cd functions && npm run test:verify`. Record exact default/rules/emulator case populations/native exits and actual functions-load evidence; no assertion-count or runtime-compatibility inflation. Record unavailable gates/failures precisely. Frozen v1 roots/locks/assets/config3 stay unchanged; source changes are limited to this plan's file map and reviewed helper additions.
- [ ] **Step 5: Whole-feature independent review, tracking, commit and push.** One fresh read-only native reviewer for this offline feature plus mandatory Antigravity actual-source/results review. Resolve must-fix feedback with genuine RED/GREEN; record limitations and any deferred minors. Commit `Add offline corpus preparation command`, push. No real candidate acceptance untilTask3.

## Task 3: Prepare and review the fresh candidate corpus without inference

**Files:** tracking docs only; ignored offline artifacts/images remain local.

- [ ] **Step 1: Verify clean exact source/remote and unchanged v1 evidence/config.** Pin the committed offline tool source. Verify disk backing and explicit public-download scope. No ADC/token refresh/model smoke is needed for public assets.
- [ ] **Step 2: Run the actual opt-in preparation command.** Record raw exit and actual candidate/exclusion/download counts. Metadata/source failure aborts, no fallback source. Do not open quarantined old validation/benchmark images.
- [ ] **Step 3: Perform photo QC for every considered candidate.** View actual hashed images and record exact dispositions through the command. Reprepare only to replace rejected/missing-image candidates in their own strata. Retain all decisions/notes/bytes and bounded claims; no model predictions or corrected truths.
- [ ] **Step 4: Finalize and verify.** Require complete40pass,24/16counts/margins/disjointness, immutable source/image/QC hashes, zero model calls and read-only verification exit0. Inspect the actual final artifact, not merely command counts. A rejected candidate is not a failed model experiment.
- [ ] **Step 5: Review, record, commit and push.** Antigravity reviews actual inventory/artifact/results and declares exact photo-inspection scope. Commit privacy-safe counts/digests/limitations only, `Record offline corpus quality qualification`, push. Preserve rejected v1 untouched. Next is the separate concrete v2 runtime/version/budget design, never implicit activation.

## Plan self-review

All designPhaseA sections map toTasks1–3; PhaseB is deliberately excluded. The policy/pool interface is consumed unchanged by audit/CLI. Five review-focus classes have owning tests. Metadata trust and semantic skips are distinct. Source changes retain the required full parent verifier; documentation alone does not rerun it. Standing user approval preserves inline execution and eliminates another plan-review question; permitted workers and both independent review gates remain mandatory.

## Pre-implementation review

Corrected primary gemini-3.8-flash/High Antigravity MCP calorix-offline-corpus-preparation-plan-20261029: AGREEMENT_STATUS: agree; MUST_FIX: none. Scope OFFLINE_CORPUS_PHASE_A_IMPLEMENTATION_PLAN_ONLY. All commands/tests/schema-rejection claims are prospective. Tests-first minimal throwing stubs permit actual behavioral RED; import/syntax/fixture errors alone do not qualify. No implementation or inference is approved by an empty or noisy response; exact initial response precision corrections retained in task evidence.
