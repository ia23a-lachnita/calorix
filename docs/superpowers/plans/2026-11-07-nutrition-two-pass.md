# Two-pass nutrition accuracy implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, with permitted editing workers. One fresh whole-feature read-only review and mandatory MCP gates. Continue approved roadmap without repeated user approval.

**Goal:** Test whether independent component identification before nutrient estimation repairs actual meal accuracy.
**Architecture:** New thin two-stage SDK wrapper around existing opt-in24-case runner; new native once-only entrypoint. Preserve old sources/evidence exactly.
**Tech stack:** Existing TypeScript/CommonJS, Zod, Vitest, @google/genai2.19.0.
**Spec:** `docs/superpowers/specs/2026-11-07-nutrition-two-pass-design.md`.

## Global constraints

Same24FINAL development images/truths/manifestSHA59231d1cfda7e8a795901086f379f0bdb331dbf082ff51b37e3758e381bebd4e. Vertex/calorix-xurschnell/us/gemini-3.8-flash/v1/MEDIUM/30000ms. Maximum48actualimageSDKcalls, zero token/warmup/retry/fallback. New exclusive root `.nutrition-eval/accuracy-development/two-pass-v1`; no reuse/replay/resume/reset. All prior211Functionsfiles remain byte-exact. No heldout/2.5request/deploy/production mutation. Disk-backed TMPDIR. Commit/push clean implementation before live, no source/docs changes during live.

## Review focus

1. Inventory confidently misidentifies a component: actual24outputs decide accuracy; no synthetic/oracle claim.
2. Inventory provider/empty/schema failure: skip nutrition, retain spent failure and full24population; never fall back to old answer.
3. Outer runner catches fatal wrapper errors: firstfatal latch checked at reserve/persist/return; no subsequentSDK after failure.
4. Two passes counted as one outer invocation: physical actualSDK count/stages explicit, old count named logicalAnalysisCalls; no HTTP attestation.
5. Inventory data carries instructions or too many items: strict bounded schema/size, encoded untrusted data, final image remains authority; no hardcoded case truths.

## Task 1: Two-pass candidate and once-only entrypoint

**Files:** create `functions/src/nutrition-eval/accuracy-two-pass.ts`, `accuracy-two-pass-cli.ts`, matching `functions/test/nutrition-eval/accuracy-two-pass.test.ts`, `accuracy-two-pass-cli.test.ts`. No existing Functions file changes.
**Interfaces:** `runTwoPassAccuracyDevelopment(cases, deps, identity)` wraps `runAccuracyDevelopment`; deps reuse loadImage/createClient/nowMs/persistOutcome with `reserveStage(caseId,stage)` and `persistStage(stageRecord)`. Result report/diagnostics/stages/sdkVisionCalls(actual)/inventoryCalls/nutritionCalls/logicalAnalysisCalls. Native `runNativeTwoPassAccuracyDevelopment(repositoryRoot,env)` guarded import, no argv; opt-in `RUN_NUTRITION_TWO_PASS_DEV=1`. See spec for exact schemas/guards.

- [x] Ordered worker routes write behavioral tests plus typed throwing stub only; host verifies genuine RED before algorithms. Bounds300s no permitted-file progress/900s absolute; record exact failures before fallback.
- [x] Implement inventory-only image call and bounded strict schema, then image+inventory nutrition call using existing parser/scorer. Durable actual reservations/stage outcomes; firstfatal/counter/metadata guards, ordinary failure skip, no truth/ID in prompts. Set deterministic composite prompt hash.
- [x] Implement native source/cache/SDK checks, exclusive root and fsynced journals/reports/diagnostics/complete hash bindings. Counters allow ordinary inventory failure (<=48), all24dishoutcomes required for completion. Partial root stays spent.
- [x] Host new focus plus retained294controls/build/lint. Old211source hashes exact. One fresh whole-feature read-only review; fix Important/Critical test-first and record declined limits/minors. Mandatory MCP actualsource/hermeticresults green. Update docs/status, commit/push, clean exactorigin.

## Task 2: Actual bounded measurement and next repair decision

- [x] Fresh sanitized account9checks;24offlineassets/source/runtime/SDK/promptschema/previousrun pins. Confirm newroot absent and budget48max/combined172max. Host stdout parser accepts documentedSDKbanner plus one exactcompletedJSON; raw preserved.
- [x] Invoke compiled native CLI exactly once with opt-in and scopedproject. No source/docs mutation, retry or restart. Retain every reservation/stage/dishoutcome; stopped/failedattempt cannot resume.
- [x] Independently audit full24 numeric/rawfinalJSON plus firststage inventory, allactualSDKcounts/hash/source/oldruns. Coverage first: require all24candidate1successes and original22successes for progress. Compare originalMEDIUM thresholds and candidate1, full24primary/commonsecondary; no superiority vs2.5differentdataset.
- [x] Mandatory actual-results MCP review; preserve failure and choose another concrete repair, or freeze advancing candidate and separately review untouchedvalidation/finalcomparison budgets. No production promotion from development.
- [x] Update result/status/checkboxes; commit/push exactorigin and GitHub plan link.

Corrected MCP3.8/serverHigh preimplementation research/design/implementation-plan/48callbudget review agrees/MUST_FIX none, conversation calorix-accuracy-two-pass-design-20261107. No new calls have run under this experiment.

Task1 sourcequalified321PASS0FAIL0skip8files/build0/lint0,211oldfilesexact. Onefreshnative review0Critical0Important3Minor deferred, correctedMCPsource/hermeticagreement/MUSTnone. No actualtwo-passcall yet. See [implementation and actualresult report](../../nutrition-two-pass-development-2026-11-07.md). Sourcecheckpoint commit/push and freshprelivequalification precedeTask2.

Task2actualcompleted40SDK/16parsed24attempted;7inventorycontractfailures+1HTTP5xx, notpromoted. Correctedactual-resultsMCPagree/MUSTnone. Nextofflinecontractfix+separatelyreviewedHIGHsinglepass24trial selected; no oldrootreplay orheldouts. See fullreport.
