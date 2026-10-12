# Calibration Controller Runtime Continuation Design

**Date:** 2026-10-12

**Status:** Draft for user review. This document clarifies the next architectural boundary; it does not authorize implementation or live execution.

**Parent spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`

**Parent plan:** `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md`, remaining Task7 Steps4–7.

## Intent and success criteria

Continue qualifying the exact approved Gemini 3.8 route without changing production. The user wants historical 2.5 results retained for regression comparison, not another active 2.5 evaluation arm. Before any live calibration, prove the default controller's scheduling, reservation, barcode isolation, report authority and comparison boundaries with hermetic tests.

This continuation adds no dataset, profile, threshold, rerun permission, model fallback, deployment or production promotion. The first implementation stage is an unused mediated capability primitive. Durable evidence, benchmark authorization and default CLI activation follow only through separately explicit reviewed contracts.

## Verified starting point

Inspection baseline: `32f41733aa93a4551249b3d1b96d7df8bf13fadf` on `fix/scan-photo-flow-viewer`, matching live origin at inspection.

- `runCalibrationCli` validates input and then requires injected dependencies. Its native entry supplies none; it has no default stage controller yet.
- Bootstrap already prepares pinned committed assets, Git/Functions-tree identity, current owner, canonical reservation keys and the complete outcome plan.
- Snapshot startup already verifies the four committed payloads and invokes the production OFF parser before returning a frozen get-only store.
- The runner already supports no response cache, supplied-barcode image skipping and analysis-only latency.
- Native report publication/verification and the opt-in authoritative ledger bind JSON/Markdown to journal snapshots. Current-owner receipt replay and measured preflight/development/validation gates are implemented.
- Authoritative benchmark completion intentionally throws `calibration:benchmark-runtime-evidence-required`. No current report or caller counter can bypass it.
- The existing historical module already implements the seven supported aggregate comparisons. It shares a module with an fs loader and takes typed caller reports; that API alone is not an authority boundary.

The previous source checkpoint has recorded full pre/postcommit tests. They are historical evidence for that checkpoint, not fresh verification of this proposed controller. This turn changes documentation only.

## Approaches

1. Report/CLI-supplied counters are insufficient: intended counts do not prove actual operation routing or distinguish reservation, dispatch, response and interrupted work.
2. Prefer a controller-owned mediated capability graph with keyed observations, followed by durable evidence bound to existing journals and verified report receipts. This extends the existing cooperative orchestration model.
3. OS network isolation would address a different, stronger threat model. Do not introduce namespaces, subprocess sandboxes or host dependencies in this workstream without a separate scope decision.

The preference is conditional on review of this written design. Injected ports remain trusted dependencies; an arbitrary injected function cannot authenticate its own honesty.

## First bounded implementation stage

Create a calibration-only mediated runtime primitive and its new tests. It remains unused by the default CLI, existing sessions, ledger, report publisher and production adapter call sites.

The primitive owns its operation state and wraps captured trusted capabilities for image loading, vision generation and prepared snapshot lookup. Its outcome keys and modalities come from the existing pinned outcome plan, not a configurable replacement list. The four supplied-barcode cases produce twelve keys at the selected profile and three samples each.

Reject any barcode-key image/vision attempt before invoking the wrapped capability. Barcode lookup uses only the prepared get-only store. No runtime snapshot reader, live OFF transport or provider-response cache is exposed. Tests install throwing forbidden capabilities to catch any accidental access. No factory may silently choose a default SDK/network/file dependency when a required port is absent.

Controller execution is serial. A scoped active-outcome lease binds stage, profile, case and sample to callbacks; overlapping execution, reentry, stale callbacks, wrong keys and duplicate operations fail closed. Capture dependency and key records before effects without invoking caller accessors or retaining mutable caller records. Invalid inputs and foreign thrown values escape as fresh static causeless fatals, not raw messages, causes, stack traces or model text.

Use the existing final SDK `VisionGenerationOptions.beforeRequest` seam for exactly one reservation before `generateContent`. Do not reserve both in the earlier live-adapter hook and the final SDK hook. Independently observe the injected SDK method/transport seam in tests: adapter invocation counts alone do not establish SDK request arithmetic or absence of retries.

First-stage observations are privately owned, keyed and privacy-safe. They distinguish attempted operation, successful completion and failure. They are **in-memory diagnostic observations only**: no fsync evidence writer, persistent event schema, admission seal, restart authority or runtime-evidence verifier is added in this stage. They cannot unblock benchmark completion or establish universal network isolation.

Candidate first-stage application paths are `functions/src/nutrition-eval/calibration-runtime-capabilities.ts` and `functions/test/nutrition-eval/calibration-runtime-capabilities.test.ts`. Exact interfaces and constructible RED tests belong in the implementation plan after written-design approval; these files do not exist or become authorized by this draft.

## First-stage acceptance behavior

- Missing/malformed capability records, accessors, symbols, mutable key aliases, overlapping outcomes and reentrant callbacks cause no underlying effects.
- Native adapter with a fake SDK observes exactly one final-hook reservation before each permitted SDK invocation. Reservation failure produces zero SDK dispatches; a repeated hook or duplicate key is rejected. A transport retry simulation demonstrates that the independent witness detects divergence, without claiming production transport instrumentation already exists.
- All twelve manifest-derived barcode keys produce zero image/vision invocations. Snapshot lookup yields the prepared product; attempts to use live OFF, reread snapshots or touch response cache fail before the forbidden capability.
- Ordinary provider/parse failures remain distinguishable from fatal identity, reservation and mediation failures. Fatal failure stops subsequent scheduling. A reservation is not misreported as a response or a completed outcome.
- A positive control permits each canonical vision operation once; rejected barcode operations cannot be hidden by summaries claiming zero calls.
- Runtime observations do not retain prompts, image bytes, predictions, provider response text, private paths or foreign errors. Returned diagnostics cannot mutate the primitive's internal state; caller-owned inputs are not frozen or mutated.
- Existing CLI dependency requirements, ledger/header/events/public APIs and unconditional benchmark block stay unchanged. Existing production no-options request behavior and all old tests stay unchanged.

This stage proves only the documented wrapped seams. Full 146-call controller/restart/completion proof remains open.

## Follow-on boundaries, not first-stage authority

### Durable controller evidence

Before adding durable evidence, specify an exact event codec, storage location, write/fsync order, bindings and reconciliation algorithm. Do not invent a second lock or loosely synchronized competing authority stream. Reuse `lock.json` with hostname, boot ID, PID, `/proc` start ticks and acquisition time. Unknown liveness fails closed; no PID-only or heartbeat replacement.

Bind observations to protocol/source identity, canonical stage/profile/key, operation, terminal journal and freshly verified report receipt. Use the unchanged clean Functions tree across documentation-only HEAD movement, not exact current HEAD equality. Ambiguous persistence retains the lock and fails; no receipt is granted before durability.

After crash, never call a reserved unfinished key again. Preserve existing recovery of interrupted keys and resumption of only never-reserved keys, subject to existing stage gates. Do not discard/reset the root, create a fresh run silently or turn reservation intent into evidence of completed transport. Benchmark parse/failure gates reject interrupted benchmark outcomes. Any unresolved dispatch uncertainty must stay explicit rather than be hidden in a fabricated zero or successful count.

### Historical comparison and benchmark authorization

Keep pure comparison independent of filesystem/provider imports. Compare a freshly captured, recomputed and natively verified benchmark report against the checksum-pinned aggregate reference. Require exact dataset ID/hash, prompt hash, three samples, twenty public/zero private cases, sixty outcomes and the approved current model. Only the declared current-model/historical-model difference is permitted.

Keep all seven supported deltas, rounding provenance and explanatory code/profile/media/OFF/Slice-G caveats. Do not add invented per-case/per-macro historical data or treat caveats as new compatibility failures. Keep current frozen nutrient thresholds and populations through existing gate helpers; no MAE/classification gate replacements.

Only a separately specified ledger/runtime authority integration may replace the benchmark block. It must independently require measured nutrient gates, verified keyed runtime evidence and supported historical comparisons. Caller `passed: true`, counters, a file named as an admission seal or an arbitrary injected verifier are not self-authenticating. Constructor/replay/reentry/seal/durability rules need new RED/GREEN evidence before that integration is accepted.

### Default CLI and complete hermetic protocol

Wire the default controller only after the above contracts are reviewed. Bootstrap and all startup validation precede client construction/reservation as appropriate; malformed/no-opt-in commands have zero provider/network requests. Preflight uses the first committed development case once at LOW and once at MEDIUM plus one separately reserved token count. The fake full protocol must independently observe image calls `2/48/48/48 = 146`, sixty benchmark outcomes, twelve isolated barcode outcomes and every outcome `cached: false`.

Do not enable live opt-in or run calibration in these implementation stages. Parent live account/source checks and explicit stage gates remain prerequisites afterwards.

## Workflow and handoff

Normal strongest-first editing workers author application code/tests. The host owns requirements, plan/tracking docs, reviews, verification judgment, commits and pushes. The closed previous host-edit exception does not carry forward.

Use disk-backed task-scoped temporary/cache locations and serial verification on this host; `/tmp` is tmpfs. Do not recreate or clean the completed prerequisite workspace. Preserve user `.mcp.json` unchanged and unstaged.

After approval of this written refinement, use writing-plans to produce the first-stage implementation plan with exact interfaces, actual RED examples, focused/full commands, review gates and checkpoints. No application edits precede that plan's review. Current Task7 Steps4–7 remain unchecked.

## Review receipts

Antigravity MCP `gemini-3.8-flash`, conversation `calorix-controller-runtime-design-20261012`, first response supported mediation but introduced conflicting lock, resume, metrics and admission suggestions; recorded as response noise and rejected. Corrected response explicitly retracted those inventions and returned `AGREEMENT_STATUS: agree` / `MUST_FIX: none` / `SHOULD_FIX: none` / `QUESTIONS: none` for the direction only. It still suggested a first-stage fsync writer despite the requested non-durable primitive; this draft explicitly excludes that suggestion.

The third consultation reviewed the exact supplied written draft, including the explicit non-durable first-stage boundary, and returned `AGREEMENT_STATUS: agree` / `MUST_FIX: none` / `SHOULD_FIX: none` / `QUESTIONS: none`. This is the written-design green, not implementation approval. Its summary's phrase about twelve barcode keys "across LOW/MEDIUM" is not adopted: the written requirement is twelve benchmark barcode keys at the ledger-selected profile. No fallback or tool timeout occurred in these three consultations. No independent tests, repository inspection, runtime/accuracy/security/production approval were supplied. User review of this written refinement and a reviewed detailed implementation plan remain required.
