# Inventory contract repair and HIGH accuracy implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline. Continue the approved roadmap without another plan approval. Current ordered editing-route failures permit native fallback; independent review and verification gates remain mandatory.

**Goal:** Repair the observed request contract bug and measure whether3.8HIGH single-pass improves actual food accuracy.
**Architecture:** Small inventory-schema repair plus a1:1 SDK thinking facade and once-only native entrypoint reusing the existing core. Existing production and sealed protocols remain untouched.
**Tech stack:** Existing TypeScript/CommonJS,Zod,Vitest,@google/genai2.19.0.
**Spec:** `docs/superpowers/specs/2026-11-07-nutrition-high-thinking-design.md`.

## Global constraints

Vertex/calorix-xurschnell/us/gemini-3.8-flash/v1/HIGH/30000ms; unchangedcandidate1promptSHA05398a83b74cb5198d01e2c16a2e5017836ed79577fa9d056752a53bf3d9bd06 and24FINALmanifestSHA59231d1cfda7e8a795901086f379f0bdb331dbf082ff51b37e3758e381bebd4e. Max24newimages,0newtoken/warmup/retry/fallback,188combinedmax. Exclusive single-pass-high-v1 root, no restart/reset/recovery. Allpriorroots/snapshots preserved; original211Functionsfiles exact. No2.5/heldouts/deploy. Disk-backed TMPDIR; commit/push clean source and reviews before actual, no source/docs changes during actual.

## Review focus

1. Wire permits4alternatives but validator accepts3: emittedwire bounds/prompt must agree, without trimming or loosening validator.
2. Shim advertisesHIGH but actually sendsMEDIUM or makes extras: inspect outgoingrequest and1:1 SDK count, source/route metadata bound.
3. SDK errors/timeout30s lower coverage: retain all24/spent failures, never cherry-pick or retry.
4. New native root replays old attempts or wrong compiled module: exclusivecreate and runtime/source/SDK/prompt/schema pins before spending.
5. HIGH support/green synthetic tests mistaken for food superiority: actual24numeric/coverage audit, no historical2.5 cross-dataset claim.

## Task 1: Repair observed inventory request/validator mismatch offline

**Files:** modify `functions/src/nutrition-eval/accuracy-two-pass.ts`, `functions/test/nutrition-eval/accuracy-two-pass.test.ts`; trackingdocs.
**Interfaces:** Existing exports preserved. Existing strictZod bounds unchanged; responseJsonSchema gains documented array/numeric bounds and prompt/descriptions convey local string/count limits.

- [ ] Write regression expecting alternativesmaxItems3/components1..20/uncertainties<=8 in actual SDK request; actualsaved4-alternative response stays failed/skipsnutrition. Observe genuineRED on current source before fix.
- [ ] Apply minimalwire/prompt repair; focusedGREEN, old321controls/build/lint as relevant. No API call/no root reset. Update status/plan, commit/push boundedrepair checkpoint. Later combinedfeature review covers this diff; no nutrition improvement claim.

## Task 2: Opt-in HIGH candidate and once-only native entrypoint

**Files:** create `functions/src/nutrition-eval/accuracy-high-thinking.ts`, `accuracy-high-thinking-cli.ts` and matchingtwofocusedtestfiles.
**Interfaces:** `runHighThinkingAccuracyDevelopment(cases,deps,identity):Promise<AccuracyDevelopmentResult>` with existing types; `runNativeHighThinkingAccuracyDevelopment(repositoryRoot:string,env:NodeJS.ProcessEnv)` returns staticfailed or completed/runId/imageCalls/tokenCountCalls0; import inert/mainnoargv.

- [ ] BehavioralTDDstubs then RED: everyactualrequestHIGH, allotherprompt/image/schema/timeout fields same;24actualseams/24outcomes, reserve-beforedispatch, ordinaryerrors/foreignmetadata/persistencefail remain counted/fatal as originalcore. No test merely assertingstuberrors.
- [ ] Implement1:1facade and guardednative fixedroot/optin/source/assets/SDK/identity/journal/completion bindings. HIGHsidecaractual route, oldglobalresolverstrict. Native FS positivefakeSDK/mockassetverifier and realmissingcache negative; completed/partialrefuse, durablecounts/digests, no privileged production action.
- [ ] Run relevant321oldcontrols plus newfocus,build/lint; original211files exact; onefreshwholefeature read-only review ofTasks1+2. FixCritical/Important test-first, deferMinor and rule ondeclinedlimits. MandatoryMCPactualsource/hermeticresults green. Update status/plan/report, commit/push clean exactorigin.

## Task 3: Measure one24-image HIGH candidate and act on actual results

- [ ] Freshsanitized9accountchecks,24assets/source/runtime/SDK/manifest/prompt/schema/oldroots/snapshot pins, newrootabsent, cleanexactorigin. RecordexecutionHEAD and30s/profile/budget.
- [ ] Run once `RUN_NUTRITION_HIGH_DEV=1 CLOUDSDK_CORE_PROJECT=calorix-xurschnell node lib/nutrition-eval/accuracy-high-thinking-cli.js` fromfunctions. Never resume/retry/fallback/reset; no source/docs mutation during actual.
- [ ] Independentlyaudit full24predictions/failures/rawJSON/model/counters/hashes. Compare same24originalMEDIUM/candidate1; all24success and22baseline-set veto, fullcoverageprimary, common-successsecondary, fixedprogress/absolutegoals unchanged. No frozenheldout/2.5superiority claim.
- [ ] MandatoryMCPactualresults review, preservefailedattempt and selectnextconcreterepair or freeze and separatelyreview validation/finalcomparison. Update results/status/checkboxes,commit/push and GitHubplanlink.

Corrected preimplementation research/design/plan/MAX24newimageSDK/0extras/188cumulativebudget MCP review is green: scope HIGH_DESIGN_PLAN_AND_24_CALL_BUDGET_ONLY, AGREEMENT_STATUS agree, MUST_FIX none; conversation calorix-accuracy-high-thinking-design-20261107,2026-11-07T22:29:36.834Z. The chat tool call was interrupted, but its completed response was recovered read-only from the persisted conversation. No review rerun needed. Task1 has NOT started; no newHIGHrequest or HIGH source/test file exists. User requested fresh-session preparation before implementation. Resume via [handoff](../../fresh-session-handoff-2026-11-07.md).
