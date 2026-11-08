# Tier-1 Photo Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute continuously under the user's directive; no repeated plan approval.

**Goal:** Deliver one-photo → approximate served estimate → correction → local saved meal, and an honest 30-meal benchmark workflow.
**Architecture:** Reuse the Flutter CameraX camera service, theme, Firebase project and Functions SDK. Add a local Tier1 module before legacy Firebase startup, plus a stateless authenticated A1 callable; retain the old app behind `CALORIX_LEGACY_CLOUD=true`. Store private photos and serialized local meals atomically; keep credentials server-side.
**Tech Stack:** Flutter3.41.9/Dart, existing camera0.11.4/CameraX0.6.30, Functions TypeScript/@google/genai2.19.0/Zod, Python3 standard library.
**Spec:** ../specs/2026-11-08-v71-binding-addendum.md; ../specs/2026-11-08-v7-master.md (V7.1 wins).

## Global Constraints

- One default JPEG; no training/depth/second view/dataset downloads.
- Approximate served energy; consumed unknown until confirmed. Zero or one optional preparation question.
- Explicit per-photo cloud consent; no startup/cloud queue action in Tier1 mode; private local retention/deletion.
- Pinned available model; no silent fallback, no invented database matches, no numeric uncertainty claims.
- Actual weighed meals 0/30 until user supplies real physical references; synthetic fixtures prove code only.
- No production deploy/data mutation without final explicit authorization. Preserve sealed old experiments and all unrelated changes.

## Review Focus

- Consent denied, missing receipt, offline failure, and deleted in-flight meal cannot upload or resurrect records.
- Corrupt local JSON must be reported and never silently replaced; serialized concurrent writes preserve all meals.
- Repeat/manual changes cannot inherit confirmed consumption or falsely preserve database-backed totals.
- Unknown food/preparation cannot be silently mapped to cooked/raw catalog record or omitted from totals.
- Failed/missing A0/A1 predictions, heterogeneous recipes and uncertain consumed references remain visible in denominators.

### Task 1: Pinned inference and nutrient reconciliation

**Files:** `functions/src/tier1-{analysis,callable,cli}.ts`, `functions/src/tier1-catalog.ts`, `functions/test/tier1-analysis.test.ts`, `functions/src/index.ts`, `model_manifest.yaml`.
**Interfaces:** `reconcileInventory(unknown): Tier1Estimate`, `answerPreparation(estimate, answer): Tier1Estimate`, `estimateA0(catalogIds): Tier1Estimate`; authenticated `analyzeTier1Meal` returns the same estimate without storing photos/data.

- [x] Write behavioral nutrient/schema/one-question/A0 and authenticated consent/input tests first; run focused Vitest and inspect RED.
- [x] Implement pinned3.8 bounded single-call structured output, deterministic catalog arithmetic, clearly unverified unknown foods, source/prompt/schema/token/latency provenance, one added-fat question with deterministic adjustments, explicit failures. No old experimental imports.
- [x] Run focused GREEN, full Functions build/lint/tests serial; <=2 authorized nonprivate image smoke requests only after fresh availability/privacy checks. Record errors and exact routes.
- [x] External implementation review; update status; commit/push stage.

### Task 2: Local capture/edit/history Android workflow

**Files:** `lib/features/tier1/` model/store/cloud/screen files, `lib/main.dart`, `test/tier1/`.
**Interfaces:** Local meal contains served nutrients, nullable confirmed consumption, capture metadata, retained image, per-photo consent, raw analysis provenance and manual corrections; no legacy Firestore write required. Cloud payload matches Task1.

- [x] Explore actual app with ARTEMIS before tests. Write local store/semantics/widget regression tests; verify RED using pinned Flutter CI where local toolchain unavailable.
- [x] Reuse CameraX and AppTheme; local capture metadata/time+quality limits, explicit cloud consent, lazy Firebase auth/callable only after consent; manual entry/edit/save/history/delete, Ate all/fraction and confirmed repeat resetting consumption. Keep images on failure; discard late cloud results after edits/delete.
- [x] Run FVM analyze/tests; request intermediate test APK workflow, verify source SHA/checksum/signer before install; run bounded phone validation and inspect screenshots. No cloud upload without consent.
- [x] External implementation review; tracking and bounded commit/push.

### Task 3: Weighed-meal schema, reference arithmetic and A0/A1 evaluator

**Files:** `meal_schema.json`, `reference_sop.md`, `evaluate_meals.py`, `tests/test_evaluate_meals.py`, `pilot_report.md`, `docs/tier1-phone-runbook.md`.
**Interfaces:** JSON meal list with ingredient/batch/component/allocation layers, endpoint-specific grades, prediction attempts A0/A1 with errors/corrections/timing/cost. CLI produces compatible prediction records; recipe references remain independent of predictions.

- [x] Write synthetic code-only tests for yield-adjusted energy, many-many allocation, heterogeneous rejection, full-meal errors, failure/missing/duplicate denominators and endpoint grades; verify RED.
- [x] Implement schema/evaluator validation, per-route and paired same-meal metrics, MAE/bias/P90/normalized floor200, energy-size/mixed slices, coverage/failures and explicit unknown costs/intake. Add an empty collection template with a 30-meal target without fabricated meal records.
- [x] Run evaluator suite and empty-input report; report0/30, existing evidence limitations, exact phone steps and single next experiment.
- [x] Final independent whole-branch and Antigravity reviews, verify all available builds/tests, commit/push final stage and report concrete deploy/measurement blockers.

## Verification completion notes

Source452ef49 full Flutter960/1 existing skip and Tier1 analyzer passed. Final Functions5331/1 existing skip, build/lint/evaluator11, signed APK, preinstall integrity/privacy checks and actual Samsung focused repeat/cancel retest passed in run42443418299. Owned diagnostics were removed; deployment approval was subsequently granted and executed below. Real weighed references remain unavailable. Runtime regression was actual focused1.5 Confirm/Cancel controller-disposal RED, then current code GREEN. Initial harness lookup failures and an unfocused passing test are not called behavioral RED.

The originally bounded smoke budget was amended through scoped MCP review for wire-schema diagnosis:4 owned blank/nonfood image requests plus4 text requests total, never meal-accuracy evidence. Structural grammar accepted; strict semantic limits remain in Zod. No fallback model and no real meals collected.

## Authorized deployment follow-through

User approved onlyanalyzeTier1Meal. Node20's actual retirement rejection required minimalNode22 engine/root-lock/CI update and matching existing contract expectation after RED. Source daf3e43 passed fullNode22 CI42470126908 and selected deployment returned0. Live ACTIVE revisionanalyzetier1meal-00001-puf/512Mi/60s/max2/concurrency1 verified; three old functions/rules unchanged. Negative auth401 and one consented owned non-food phone request AuthVALID/HTTP400/manualfallback verified; exact errorcategory unobserved. AppCheck warning/enforcementoff recorded, no public-security claim. Fixture cleaned. Approval blocker resolved; physical0/30 remains. See deployment receipt.
