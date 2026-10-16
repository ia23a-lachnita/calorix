# Calibration Durable Runtime Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build unused, versioned runtime-evidence codecs and replay/persistence under the existing calibration ledger and lock without granting completed-run authority.

**Architecture:** A pure codec owns the serialized contract; a pure immutable reducer previews keyed runtime transitions alongside validated protocol facts. An explicitly opt-in mode in the existing ledger core commits those previews through guarded native storage. Native assembly derives canonical plans from pinned files and selects real Git/report readers; no runtime producer, default controller or benchmark authorization is wired.

**Tech Stack:** Existing TypeScript strict/exact-optional configuration, Node synchronous filesystem/Git readers, SHA-256 and Vitest. No dependency or package changes.

**Spec:** `docs/superpowers/specs/2026-10-14-calibration-durable-runtime-evidence-design.md` (user-approved written contract, 2026-10-14).

## Global Constraints

- Preserve one canonical `ledger.json` array, `journal.json`, existing reports and `lock.json` beneath unchanged `CALIBRATION_ROOT`; no companion authority file, second lock, heartbeat, root reset or automatic migration.
- Header includes `reportAuthority: 'verified_artifacts_v1'`, `runtimeEvidenceVersion: 1` and initial `owner` in the single extended `protocol_identity` publication. Existing modes/header codecs/public signatures stay unchanged.
- Seven runtime event types, exact fields and terminal/disposition unions are those in the spec. Runtime sequence is contiguous independently of one-based full-ledger event indexes; references point backward.
- At most 4096 runtime events; at most 16 KiB canonical UTF-8 per runtime event/header. These are storage bounds, not changed call quotas. Check strings before encoding; no lone surrogates, nonfinite/unsafe numbers or negative-zero indexes.
- Canonical JSON recursively sorts record keys, preserves array order and has no whitespace/BOM/newline; SHA-256 uses its UTF-8 bytes. Existing journal/non-reservation/report digest algorithms remain unchanged.
- Closed descriptor-only capture and pre-reflection reentry guards; own/freeze only copied data. Fresh static causeless fatals; no foreign exception inspection or raw error retention.
- No prompts, image bytes, raw responses, predictions, credentials, stacks or arbitrary paths in runtime records. The required five owner fields remain the narrow metadata exception.
- Existing `reserved` events are the only image accounting authority. Never dispatch a reserved unfinished key again. Never-reserved interruption may resume only under existing gates with new attempt/owner history; ordinary failures do not grant retries.
- Preserve original implementation identity and clean Functions-tree validation across docs-only HEAD movement. Unknown liveness, ambiguous durability or unresolved journal conflicts retain the lock and fail.
- Keep `calibration:benchmark-runtime-evidence-required` unconditional. No producer/SDK-hook wiring, default CLI, historical comparison integration, full 146-call execution, live/cloud/device/UI work, production model change or deployment.
- Native composition chooses the report verifier and Git reader; caller counters/receipts/verifiers are not native authority. Low-level reducer/core test seams are data/cooperative-trust interfaces, never admission tokens.
- Keep `/tmp` minimal. New logs/caches/fixtures use this plan's verified disk-backed directory; no completed workspace recreation or shared cleanup. Preserve user `.mcp.json` unread/undiffed/unstaged.
- Host edits planning/tracking docs, interprets requirements, verifies, commits and pushes. Application/tests use AGENTS.md strongest-first workers, never worker commits. Preserve approved inline execution; one fresh native whole-plan reviewer after all tasks, not a native reviewer per task. Antigravity pre-plan and actual code/result gates remain mandatory.

## Current execution handoff — 2026-10-16

**Task4 partial foundation only — actual review disagree:** worker continuation7503 and host19724 produce5cases:3existing-source controlsGREEN,2missingfactoryfails0skip, strict/lint/protection0; all prior code/prefix/config unchanged. Actual current helper47061B/SHAa97f7c7b and native13660B/SHA182f8110 fully inspected. External primary3.8High CLI77556/sameaf9e1a2d workstream returns disagree/MUST_FIX four current fixture/oracle defects: incomplete future preflight terminal/nativepublication, weak presence-only byte/order checks, unacquired test fixture convention, catch-all missing-import masking. NO foundation acceptance/source permission; partial green controls cannot hide latent future-helper failures. Bounded worker-only repair plus existing-runtime-core/native-FS control will exercise the same helper driver before absent new assembly, witnessed helper RED→GREEN; then full native matrix remains mandatory. All Task4 checkboxes still open/BASE77b6057 fixed. Earlier3controlsGreen entry is not whole native proof or code approval.

**Task4 draft UNACCEPTED; fixture foundation repair before full RED:** Muse1.3 draft42003B helper/SHA313724fc and25437B native test/SHAf6111d45 preserves old29360B prefix/all prior source/tests/config, patch-only editing. Worker controls367GREEN/prior438GREEN/lint0/protected0; strict exit2 ONLYone missing-native-module TS2307. Host personal24519 JSON55=4pass51fail0skip includes invalid LOW133vs158 control and permanent-absence pass, so not genuine full RED and NO freeze/source permission. Entire added313+587 lines inspected: fake syscall hooks, wrong main-checkout unit context disconnected from miniGit, missing real pinned copies/terminal/publication/stage fidelity, RAM fallback, tautological/inverted/unmutated oracles. Primary3.8High CLI14034+79031 sameaf9e1a2d workstream agrees/MUST_FIX none ONLY for corrected tiered repair plan, current draft still blocked. Correct native foundation via editing worker first, then complete full real matrix/host controls/REDfreeze; no source stubs/host app edits or completed-prefix changes. Use actual publishCalibrationStageReport/appendResultJournal/getStageReportSnapshot APIs; token fields andonepreflight/profile correct. Existing storage file unchanged; only guarded export/native module absent. Task4BASE77b6057 fixed, all four Task4 steps remain unchecked. WIP draft checkpoint records failed diagnostics, not implementation acceptance; earlier completed Task3 remains frozen.

**Current Task4 — BASE77b6057884d03dc17ad3a54d3821df8ab62aa64a:** task-start/full brief read after Task3 completion tracking push/liveexact. Primary3.8High headless pre-implementation review98838 actual0, scoped conversationaf9e1a2d-c42e-417d-a90e-03ad809c665b, TASK4_PLAN_ONLY agree/MUST_FIX none/QUESTIONSnone. No native source/tests exist yet; source/production/native-durability approval not implied. Worker-only RED next, preserving Tasks1–3 and29360B helper prefix. Existing full3440pass1optin skip remains baseline, not Task4 evidence.

**Ruling20 — native fsync-fault oracle readiness:** explicitly complete token prerequisites in the first native fault example after header initialization and before arming the one-shot ledger-directory-fsync fault, and assert a dedicated fault witness, not only a generic fatal/lock retention. Actual Task3 Ruling17 denies LOW attempt before token readiness, which otherwise would make the example pass without reaching fsync. Bare native fixture still initializes/acquires only; production native preparation never acquires/reserves/runs stages. Cost extra explicit fixture setup and trace assertion, not relaxed stage gates or producer wiring. Primary Task4 PLAN_ONLY review agrees; its nonblocking reminders are handled by faults defaulting disarmed through readiness, a fault-specific witness rather than total initialization counts, and exact-owned cleanup registration even on setup failure.

**Task3 COMPLETE:** sourcecheckpointf5961732c9266721ddb6d6d43bde993a57a77cf7 normal commit/push0/liveexact. Postcommit task-done50400 actual0, sixfiles708pass0fail0skip, real ledger completion43d02d7..f596173. Final source35265/protected121/bothprefix/helper/config unchanged; full gates and corrected scoped primary3.8High CLI review green as recorded below. All Task3 steps complete; native-edit exception ends at Task3. Next tracking push/liveexact then Task4task-start/worker-only RED native tests; no repeated completed tasks, no source/default/producer/live/production authorization beyond this unused slice. Earlier active-job entries below are historical only.

**Task3 final external result agreement collected:** primary3.8High headless CLI34889 plus narration-correction21103 actual0 in same4bee2dbf-b742-4a35-be4f-a5c2e687d836 conversation, explicit final agree/MUST_FIX none/SHOULDnone/QUESTIONSnone for current source35265 and actual completed full gates. Corrected file counts1/40/53, exact skip setting RUN_NUTRITION_EVAL_FETCH, historical host-a process exit143/fullnotrun and bounded compatibility claims. Current source/protected121/bothprefix/helper/config unchanged post-review; no reviewer mutation observed. Source/tracking normal commit/push/live equality and postcommit six-suite task-done remain the next gates; no Task3 completion yet, Task4 worker-only and notstarted. This supersedes the active-review wording below.

**Task3 final source/full verification:** source SHA35265ab69d180bcd4c1727ada76beebeceeddb4dfe32276d65274c77aebb3e5a, core212GREEN; all6 final reflection regressions witnessed RED→GREEN without changing frozen tests. Clean host-b42138 FINISHED actual strict0/build0/fullLint0/nutrition0/fullFunctions0: nutrition40files3045pass0fail1existing opt-in skip, full53files3440pass0fail1same skip. Required six-suite subset708GREEN/no skips. All121protected/both immutable core prefixes/helper/config fingerprints unchanged. Actual repaired-source/focused CLI3.8High review22029 agrees/MUSTnone; final full-result follow-up34889 active in same4bee2dbf conversation under user-approved temporary CLI transport, not yet final agreement. Task3BASE43d02d7, Steps1–3 checked; Step4 awaits final result review, normal source/tracking commit/push/live equality and postcommit task-done. Task4 not started/worker-only; native/producer/default/live/production exclusions unchanged. Older entries below are historical checkpoints, not current active jobs.

**Ruling19 extension before source repair:** the same successful-result-reflection gap also exists in verifier envelope and journal/ledger replay-array/header capture. Append4 cases to the same still-unfrozen tail, preserving both89885B/ebb3889b and83899B/0e79e00d prefixes; full212 RED is206original pass6intendedfail. Primary3.8High CLI addendum PLAN_ONLY agrees/MUST_FIX none. New-mode verifier results must be owned before legacy envelope/measurement code; replay outer array copying must check poison after every descriptor reflection, then capture each record/header before old parsers. Do NOT impose4096 items or16384 nodes on the entire physical ledger: only runtime event count is4096, independently of protocol facts. Cost additional owned copies/validation, not changed old modes or physical event schema. Source5210dd49 remains unchanged pending final RED typing/lint and freeze.

**Ruling19 — post-construction callback results and distinct capture budgets:** append two regressions after immutable89885B/ebb3889b test prefix (also preserve83899B/0e79e00d), prove RED against source5210dd49, then wrap only new-mode captured key resolver/report-plan callbacks: check poison immediately after return and descriptor-capture their results under evidenceReflect before old helpers inspect them. Constructor busy state does not protect later selection/replay callback returns. Cost: extra copies of small canonical key/plan arrays; old factories unchanged. Corrected primary3.8High CLI review confirms this source must-fix and agrees/MUST_FIX none for the bounded PLAN_ONLY, not repaired-result approval. Separately retain private defensive capture depth16/node16384/array4096 limits only in this unused mode; these are NOT the codec's UTF-8 byte/event-count limits and can reject extreme otherwise-valid legacy inputs (e.g. thousands of repeated review reasons). Cost is explicit fail-closed acceptance narrowing, never truncation or changed legacy factory/hash/quota. No security/production claim follows. Whole-plan reviewer must assess this tradeoff. Full gate a was intentionally cancelled during nutrition after strict/build/lint0 to isolate the defect before rerunning, not passed or quota failure.

**Ruling18 — append-only callback/current-owner regression extension:** source-c193GREEN/strict0/lint0 revealed by inspection two still-required boundaries: post-callback poison checks before later effects, and current backing lock equality rather than stale heldOwner memory. Preserve all83899B/SHA0e79e00d frozen core test prefix; append isolated regressions, personally witness RED against source014afed8/commit1cf04c7 before source-only fixes. Helper/Tasks1/2/old tests stay unchanged. Extend owned checker with the prefix and new final hash, never weaken old assertions. Primary3.8High temporary CLI same conversation4bee2dbf-b742-4a35-be4f-a5c2e687d836 agrees/MUST_FIX none for FIX_PLAN_ONLY, not result/production approval. Cost if wrong: extra synchronous lock read per ordinary new-mode public entry and additional verification, not a change to old factories. Core equality is cooperative data validation, not Task4 native inode/path/durability proof. Already reached writes/archive/unlink effects cannot be rolled back or misreported as retained physical locks; stop later steps and grant no success.

**Task3 RED freeze accepted:** full host serial42161/task-3-host-red-c FINISHED, actual controls0/270GREEN, core1/193total15real-old-controls pass178exclusivemissingfactory failures0skip, existing0/226GREEN, strict0/lint0/protected0. Core SHA0e79e00d9c8a27c55481eae8dbcada24c1175ee85845243f81ae2b035ecb72bd; helper29360B SHA5f3a7d4a7b39ebe38428855728fd7e9c872e46507eb54504b4d567494aa3af60. Both now frozen for source implementation; original4792B prefix remains frozen for all later work. Corrected primary3.8High CLI test-oracle review agrees/MUST_FIX none, explicitly not executed new-mode approval. Steps1/2 complete under Ruling14; next only calibration.ts source edits, BASE43d02d7 unchanged. New owned source checker permits exactly that one old source path and freezes all tests/helpers/Tasks1/2/user config. Full gates and actual code/result review still required before Task3 completion.

**Ruling17 — pre-source stage gates and native Git-reader shape:** conservatively require existing scheduling prerequisites at every attempt start, including completed token count before preflight LOW and successful LOW before MEDIUM. Reuse stage-gate semantics, not image-only reservation eligibility for barcode outcomes. This is an implementation ruling, not uniquely specified producer ordering: cost if wrong is forbidding speculative preflight local intent; no producer is wired. For source capture accept the three required fields plus explicitly known optional validated `implementationCommit`; reject all other fields/accessors/malformed arrays. Preserve header identity, compare clean current Functions tree, never require HEAD to equal original implementation commit. This matches the real four-field bootstrap reader without weakening freshness; cost is maintaining that narrow shared shape. Temporary headless 3.8 High conversation4bee2dbf-b742-4a35-be4f-a5c2e687d836 returns agree/MUST_FIX none for interpretation only, not code/result/native/production approval. Reviewer operational-benefit and O(1) remarks are not measured producer/cost evidence.

**Latest RED-only checkpoint:** tier2 has117tests,12real old-mode controls pass and105expected missing-factory failures, zero skips; core actual1/strict0/lint0, protected checker0. Publication fault/clean-handoff/recovery matrices expanded, but source-reader/callback/reflection tests still pending. Full Task3 Steps1/2 remain open/unfrozen; calibration.ts unchanged. Ruling16 permits temporary headless review while MCP is incompatible. Older45-test stage receipt below is historical, not the current count.

**Ruling16 — temporary user-approved review transport exception:** the user permits headless `agy` reviews while MCP rejects separate High effort, and authorizes read-only diagnosis/proposed repair only. Do not modify the wrapper/configuration or restart this session. The installed CLI catalog lists `gemini-3.8-flash-high`; use that CLI identifier without separate effort for the same approved 3.8 High route. Keep read-only prompts and explicit agreement/must-fix gates; label CLI provenance, never MCP success. Scope: this interrupted review workstream while MCP is incompatible; Task4 editing stays worker-only. Cost if wrong: separate CLI conversation continuity and temporary loss of MCP transport, not reduced verification. Diagnostic actual0; CLI warns plan mode has no effect with slash expansion disabled, so do not claim that combination enforces read-only access.

**Current:** Tasks1/2 complete and frozen. User explicitly approved native host editing for Task3 ONLY (Ruling14); Task4 remains worker-only. Task3BASE is43d02d766a5855191b7cd3cc2dbf191a0cb01f24 across tracking/WIP commits. Shared stage builders now have actual existing-authoritative positive controls through validation plus twelve barcode/twelve label benchmark outcomes; the application source is still untouched. Latest serial task-3-host-red-b: old270GREEN, existing226GREEN, core45=6realoldcontrols pass/39missingfactory fails, strict0/lint0/protected0. These are intended RED results, not Task3 completion. Remaining whole fault/reentry/recovery/source/getter-isolation matrix and oracle corrections must be completed and independently witnessed/frozen before any calibration.ts implementation. No live/default/producer/benchmark/production authorization. Earlier worker-only/active-worker paragraphs below are historical and superseded by this handoff plus the fresh status entry.

**Ruling10 — user-approved exception:** the user explicitly approved native host source/test repair for unfinished Task2 only after all editing routes were unavailable or failed editing instructions. Cost: loss of worker/host separation for this bounded repair, not reduced verification. Existing frozen prefixes, TDD, full gates, actual Antigravity review, commits/pushes and postcommit task-done remain mandatory. Restore worker-only editing for Tasks3/4. The historical editing blocker below is superseded by this authorization, not by a claimed quota reset.

**Ruling11 — task-local worker method guard:** add python/python3 refusal wrappers only in this plan's worker PATH after repeated prior direct-write violations; preserve system interpreters and host verifier PATH. This enforces the existing patch-only/no-Python worker instruction, not a new editing route or permission. Absolute interpreter/direct-write bypass remains forbidden; all diff/method/TDD gates remain. Cost if wrong: worker compatibility friction and possible route rejection, never reduced test strength or broader host editing.

**Ruling12 — new-mode provisional getter authority:** require acquired lock/fresh source and authority for all new-mode stored-state getters, explicitly including getCounts/getPinnedModelVersion, not only the old report-authority getter list. Constructor replay must not become current-owner accounting/metadata authority; primary3.8 Task3 clarification explicitly confirms this conservative scope. Cost if wrong: new-mode callers cannot inspect even stored counts/pin before acquisition. Existing factories/signatures/behavior unchanged; no production or native-execution proof inferred.

**Ruling13 — clean no-lock owner epoch handoff:** in new mode, clean release with an active attempt fails/poisons/retains the lock. Acquiring an absent lock over a replay-active attempt fails/poisons/retains the new lock without epoch/abandonment/crash entitlement. With no active attempt, a different owner durably appends the existing lock_recovery marker before new-owner events; this is an epoch handoff only, NOT proof of predecessor death. Same-owner clean reacquisition and initial empty-header creation add no recovery marker or crash entitlement. Existing present-stale-lock crosshost/boot/liveness checks remain unchanged (unknown is not dead), and the absent-lock branch gains no invented liveness/crosshost restriction. Never relabel the header. All transition durability failures poison/retain lock/no authority. Primary3.8 correction-plan clarification explicitly agrees; tests must use explicit recoverAfterCrash after proven-dead acquisition for closures. Cost if wrong: active attempts cannot cleanly release, and downstream readers must not interpret every lock_recovery marker as a dead-owner claim. No new event schema, default behavior, producer or benchmark authority.

Tasks1/2 are complete; do not redo them. Task1 source`9c5a23273c940e6f0b3401816ddb2a084f369821` is Task2BASE. Task2 source`033761209a36df0328ed81efeefe36ce3cb424e8` committed/pushed/liveequal; postcommit task-done72504 actual0/226pass0fail0skip, all4steps checked. Tasks3/4 remain incomplete. Historical planning/earlier execution receipts below are not the current handoff; `docs/implementation-status.md` remains authoritative.

The independently validated 30 added state regressions were committed/pushed at `618e242c5b29a42e18ca00d11ca8db36d4caf6ff`: frozen state-test149770B/SHA`d0c757835aea2258f19383f6314400e15bc1b18c29344d16aaf5641455aec7ac`, preserving original108930B/`6b1749ac` prefix. Original accepted RED was220total190pass30intendedfail/strict0/lint0. No original assertion/helper/Task1 change was allowed.

The unfinished worker source was checkpointed/pushed at `e27969c446913a32b4e2d8e8794f3d566a5a279a`, then tracking `ab821f746492f1df752b530743ffc096dbb1ba04`; both were **WIP, not accepted implementations**. Historical source afdf had214pass6fail plus5typing errors. Preserve its recorded worker patch-method violations; subsequent repairs do not rewrite that provenance.

Under Ruling10, host mechanical typing cleanup retained214pass6fail with strict0/lint0 (9083). Three reviewed cases appended after149770B/d0, independently witnessed223total214pass9fail/strict0/lint0 (14530); source-only result/recovery/finish repairs then223GREEN/strict0/lint0 (51731). Actual-source native probes accepted failedvision prehook/nores/noauth and no-metadata provider failure, rejected canonical interruption ordinaryfinish/incompleteabandon, SDK/fetch0. Residual already-reviewed group5 terminal epoch association was independently confirmed Important by Antigravity660 primary3.8/sameconversation; append3 more real-fixture tests with positive controls, preserving all f1/d0/6b prefixes. Actual226=223pass3fail/strict0/lint0 (28703), then source-only epoch guards. Final state-test159141B/SHA`98f26bf1a86c726a50f99163cb998c71f1a5de06127a8a8147d2f2809ff5464a` frozen; sourceSHA`2070ad183dfb1d37d91b0059a844bb145a6dc6c9accd075c1e5b31fe3dc8690c`. Host94008/task-2-host-green-a actual0:226pass0fail0skip/3files; native diagnostics actual0, every expected acceptance/rejection checked, SDK0/fetch0. All original115/Task1/helper/unreadconfig unchanged.

Precommit gates complete:47687/task-2-host-a actual0, strict/build/fullLint/nutrition/fullFunctions0. Nutrition39files2833pass0fail1skip, full52files3228pass0fail1skip; only existing opt-in public-manifest20image fetch skip. Mandatory actual Antigravity primary3.8 CODE_RESULT674 complete source+all36 appended cases agree/MUSTnone; final completed-receipt follow-up also agree/MUSTnone/SHOULDnone/QUESTIONSnone. Earlier original62 behavior cases/Task1 tests were not newly exhaustively externally audited; no visual review. Postcommit72504 actual0/226pass0fail0skip completes Task2. Current next work: take Task3 brief/BASE and RED-only worker route. No owned worker/verifier remains. Use approved worker routes again for Tasks3/4, not this now-finished one-time host exception. No live, visual, food-accuracy, security or production validation is claimed.

Task3 task-start/read complete, BASE`43d02d766a5855191b7cd3cc2dbf191a0cb01f24`. All fresh worker attempts finished without app/test edits: Grok4.6 unknownmodel, Qwen3.7 freequota403, Ultra upstream503; Muse1.3/BigPickle bounded firstresponse timeouts (not provider/quota messages), Lightning rejected direct scratchfile writes/invalid patchmethod, Ling absent in completed refreshedcatalog, paid Sonnet5 explicit session limit. Exact timestamp/messages are in status before fallbacks. Two225B owned worker scratchpatches validated/moved recoverably out of /tmp into own disk logs, no shared cleanup. Paid fresh usage actual0 confirms session100% reset18:59Zurich/weekly31%; safe retryafter19:00Zurich/17:00UTC without old oversized context, no extrausage/billing change. No background editor/verifier remains. Only new core test + append-only helper after4792B/15643c0a may change, all application sources/Task1/Task2 frozen; host accepted RED/controls/freeze still required before source work. Worker-only editing restored, no host Task3 app edits.

Historical initial Task3 bounded preimplementation consultation (`calorix-durable-runtime-core-20261015`) failed primary3.8 eligibility503 and3.7/3.6 unsupportedhigh; exact failed messages/timestamps preserved in status. No direct CLI review/effort override/config/account change. The subsequent primary retry/correction below supersedes only that research blocker; no Tasks3/4 completion or production/security/foodaccuracy claim.

The transient primary retry761 subsequently returned pre-plan agree/MUSTnone; host rejected its overbroad postappend “zero disk writes” sentence. Final sameconversation correction765 at17:00:06UTC explicitly retracts that sentence and confirms preeffectzero vs poststartuncertainbytes/poison/lockretention, initialOwner-newheader vs durableoldownerreplay, and Ruling12 fullstoredgettergate. PREIMPLEMENTATION_PLAN_CLARIFICATION_ONLY agree/MUSTnone/SHOULDnone/QUESTIONSnone, not newcode/test/results/production approval. Corrected guidance is in workerbrief; earlier failures remain historical. Pastreportedpaidquotareset, fresh paid REDworker retry is next; no hostTask3 app edit authority.

Fresh paid REDworker88544/PID1936849 is now ACTIVE afterreset with actual modelresponses/scopedtoolreads (owned11d15942-5b77-410b-970f-014d1fa87a4b session, not old150k resume), no newlimiterror. Actualresult/draft/quality/REDpending, no sourceauthorization; no secondeditor/verifier. Next collectworkerfinish/completehostmethodaudit and allnewtest/helperread, then own task-3-host-red-a diagnostics beforeacceptance/freeze. No nativehostTask3 app edits; Task3BASE43d02d7 unchanged.

## Review Focus

**Ruling14 — user-approved Task3 native-edit exception:** on2026-10-16 the user explicitly answered “Allow native edits for Task 3” after repeated worker patch-method violations. Host may repair Task3 tests/helper and implement only its allowed calibration.ts mode after personally witnessing complete genuine RED/freeze. TDD, protected files/Task1/Task2/helperprefix, full gates, Antigravity code/result review, normal commits/pushes and postcommit task-done remain mandatory. Task4 reverts to worker-only editing, not a global policy change. Cost if wrong: loss of worker/host separation for Task3, not reduced verification. Compliant Muse micro worker1544 was stopped at the authorized handoff, not rejected; its two valid type patches are retained for inspection.

Latest Task3 checkpoint (2026-10-16): previous paid REDworker finished actual1/sessionlimit at2026-10-15T17:34:33.748Z; actual method violation scratchpatch/tmp then selfremoval recorded in status, not accepted provenance. Unaccepted coretest48f67511/helperb60a40a5 draft preserved, all old115/Task1/Task2/originalhelper4792B/config unchanged. Host task-3-host-red-a completed: controls270GREEN/existing226GREEN, newcore40=5pass35missingfactoryfail, strict2 ONLY TS2352 testbindingtype, lint0/protected0. Do not freeze/implementsource yet: entiredraft inspected and requires fixture/oracle/coverage correction. Fresh literal usage actual0 session11%/weekly36%, no wholeaccount exhaustion/billing change. Bounded worker-only fixture repair next after corrected sameconversation3.8 planreview; cleanrelease epoch rule tentative pending clarification. No host Task3 app/test edits, no task completion. Task3BASE43d02d7 survives this tracking/WIP checkpoint.

**Ruling15 — illustrative reservation prerequisites:** correct the Task3 example to explicitly complete the existing token prerequisite before the first LOW reservation; the bare fixture still initializes only one header. The test convenience wrapper performs that explicit readiness call, while initialization/mode tests use the bare fixture or backing. Reason: actual strict source rejects LOW reservations before token completion; neither illustrative code nor future mode may relax that existing gate. This is covered by the corrected primary3.8 fixture-plan clarification. Cost if wrong: additional explicit fixture setup, not a changed reservation policy or production API.

1. A crash during initialization must never leave an ordinary header mistaken for opted-in evidence — atomic extended-header and old-mode rejection tests in Tasks 1/3/4.
2. A binding retried after unrelated later-stage events must retain its original `throughSequence` and digest — pure prefix/rebinding tests in Task 2 and native idempotence in Task 4.
3. An orphan result journal must not become a repaired success or a rerun — actual journal-to-terminal crash tests in Tasks 3/4.
4. Unreserved vision intent is not reserved dispatch uncertainty, while neither proves universal zero network activity — distinct recovery fixtures in Tasks 2/3/4.
5. Successful reflection traps and failing close/lock checks can reenter despite valid-looking values — guarded capture tests in Tasks 1/3 and syscall/owner tests in Task 4.

## Execution boundary and files

Planning baseline: `8ec53d378ee93e4ed290c8eef3f7f3780a148cff`, `fix/scan-photo-flow-viewer`, `/home/agent-runner/projects/calorix`. At execution record the then-current task BASE and fingerprints before RED. Do not reuse a completed workspace or run a second editor/verifier concurrently on this Pi.

| Path | Responsibility / allowed task |
| --- | --- |
| `functions/src/nutrition-eval/calibration-runtime-evidence-codec.ts` | New pure event/header/binding codec, Task 1. |
| `functions/src/nutrition-eval/calibration-runtime-evidence-state.ts` | New pure immutable transition/reconciliation state, Task 2. |
| `functions/src/nutrition-eval/calibration.ts` | Only explicit evidence-mode branches in the existing shared core and new low-level factory/methods, Task 3. |
| `functions/src/nutrition-eval/calibration-file-store.ts` | Shared private storage implementation with a new guarded opt-in factory; old factory behavior unchanged, Task 4. |
| `functions/src/nutrition-eval/calibration-runtime-evidence-ledger.ts` | New unused native assembly, Task 4. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-fixtures.ts` | New test-owned fixture/data/trace helpers, Tasks 1–4. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-codec.test.ts` | New Task 1 tests. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-fixture-controls.test.ts` | New Task 1 existing-source fixture controls; no missing/future module execution. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-state.test.ts` | New Task 2 tests. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-core.test.ts` | New Task 3 tests. |
| `functions/test/nutrition-eval/calibration-runtime-evidence-native.test.ts` | New Task 4 tests. |
| This plan, its spec's approval/review metadata, `docs/implementation-status.md` | Host tracking only. |

All other existing source/tests/assets remain protected, especially the completed runtime-capability primitive/tests, adapter, CLI, preflight/protocol sessions, reports, thresholds and historical reference. No blanket core extraction/refactor or changing old assertions. If the above boundary cannot implement a requirement, stop and amend/review this plan rather than silently widen it.

## Shared interfaces and construction rules

Task 1 exports the following types (all fields readonly) and functions. Import existing identity/owner/key/stage/profile/receipt types with `import type`; do not create runtime cycles with `calibration.ts`.

```ts
type RuntimeAttemptRef = { key: CalibrationReportOutcomeKey; attempt: number };
type RuntimeOperation = 'image' | 'vision' | 'snapshot';
type RuntimeTerminal =
  | { kind: 'image'; eventIndex: number; journalHash: string }
  | { kind: 'non_reservation'; eventIndex: number; contentDigest: string };
type RuntimeDisposition =
  | { kind: 'unreserved_interruption' }
  | { kind: 'reserved_interruption'; terminal: Extract<RuntimeTerminal, { kind: 'image' }> }
  | { kind: 'terminal_evidence_incomplete'; terminal: RuntimeTerminal };
type RuntimeCommon = { version: 1; sequence: number; owner: CalibrationOwner; at: string };
type RuntimePayload =
  | ({ type: 'runtime_attempt_started' } & RuntimeAttemptRef)
  | ({ type: 'runtime_operation_started'; operation: RuntimeOperation } & RuntimeAttemptRef)
  | ({ type: 'runtime_operation_settled'; operation: RuntimeOperation; result: 'returned' | 'failed' } & RuntimeAttemptRef)
  | ({ type: 'runtime_request_authorized'; reservationEventIndex: number } & RuntimeAttemptRef)
  | ({ type: 'runtime_attempt_finished'; terminal: RuntimeTerminal } & RuntimeAttemptRef)
  | ({ type: 'runtime_attempt_abandoned'; disposition: RuntimeDisposition } & RuntimeAttemptRef)
  | { type: 'runtime_report_bound'; stage: StageName; profile: CalibrationProfile;
      receipt: CalibrationPublishedReportReceipt; throughSequence: number; bindingSha256: string };
type RuntimeEvidenceEvent = RuntimeCommon & RuntimePayload;
type RuntimeEvidenceHeader = { type: 'protocol_identity'; identity: CalibrationIdentity;
  at: string; reportAuthority: 'verified_artifacts_v1'; runtimeEvidenceVersion: 1; owner: CalibrationOwner };
type RuntimePairEvent = Exclude<RuntimeEvidenceEvent, { type: 'runtime_report_bound' }>;
type RuntimeBindingInput = { version: 1; identity: CalibrationIdentity;
  stage: StageName; profile: CalibrationProfile; throughSequence: number;
  events: readonly RuntimePairEvent[];
  terminals: readonly { key: CalibrationReportOutcomeKey; terminal: RuntimeTerminal }[];
  receipt: CalibrationPublishedReportReceipt };

function captureCalibrationRuntimeEvidenceHeader(value: unknown): Readonly<RuntimeEvidenceHeader>;
function captureCalibrationRuntimeEvidenceEvent(value: unknown): Readonly<RuntimeEvidenceEvent>;
function encodeCalibrationRuntimeEvidenceHeader(value: unknown): string;
function encodeCalibrationRuntimeEvidenceEvent(value: unknown): string;
function hashCalibrationRuntimeEvidenceBinding(value: unknown): string;
```

The header/event 16 KiB bound does not incorrectly limit the aggregate binding input to 16 KiB. Binding capture separately checks its exact shape, at most 4096 already bounded events and at most 158 unique canonical-key terminal rows; it rejects wrong-pair events, binding events in `events`, unsorted/duplicate terminals, future sequences and receipt mismatch. Full population and hash/terminal consistency are checked by Task 2/core, not implied by the hash function alone. No general-purpose arbitrary-object serializer is exported. Use shared **private** capture/encoding helpers; existing private validators may be mirrored narrowly with tests rather than exporting/changing unrelated APIs.

Task 2 has no runtime filesystem, provider, bootstrap or ledger import. It consumes data already derived by the native assembly from pinned files; these internal/test inputs are not a replacement-plan option on the native API. This avoids a `calibration -> state -> bootstrap -> calibration` runtime import cycle and keeps the reducer genuinely pure.

```ts
type RuntimeCanonicalPlans = {
  initial: readonly CalibrationPlannedReportOutcome[];
  LOW: readonly CalibrationPlannedReportOutcome[];
  MEDIUM: readonly CalibrationPlannedReportOutcome[];
};
type RuntimeProtocolFact =
  | { kind: 'reserved'; eventIndex: number; key: ReservationKey }
  | { kind: 'image_terminal'; eventIndex: number; key: ReservationKey;
      terminalType: 'completed' | 'failed'; journalHash: string; journal: JournalEntry }
  | { kind: 'non_reservation_result'; eventIndex: number; event: CalibrationNonReservationLedgerEvent }
  | { kind: 'model_version_pinned'; eventIndex: number; responseModelVersion: string }
  | { kind: 'profile_selected'; eventIndex: number; profile: CalibrationProfile }
  | { kind: 'artifact_receipt_admitted'; eventIndex: number; receipt: CalibrationPublishedReportReceipt }
  | { kind: 'lock_recovery'; eventIndex: number; staleOwner: CalibrationOwner; recoveringOwner: CalibrationOwner }
  | { kind: 'protocol_noop'; eventIndex: number; eventType: 'token_count_reserved' |
      'token_count_completed' | 'token_count_failed' | 'safe_error' | 'stage_completed' };
type RuntimeFrame = RuntimeProtocolFact |
  { kind: 'runtime'; eventIndex: number; event: RuntimeEvidenceEvent };
type RuntimeEvidenceSnapshot = { sequence: number; lastEventIndex: number;
  owner: CalibrationOwner; activeAttempt: RuntimeAttemptRef | null;
  events: readonly RuntimeEvidenceEvent[] };
interface CalibrationRuntimeEvidenceState {
  preview(frame: unknown): Readonly<CalibrationRuntimeEvidenceState>;
  snapshot(): Readonly<RuntimeEvidenceSnapshot>;
  pairInput(stage: StageName, profile: CalibrationProfile, throughSequence: number):
    Readonly<Omit<RuntimeBindingInput, 'receipt'>>;
}
function prepareCalibrationRuntimeEvidenceState(params: unknown): Readonly<CalibrationRuntimeEvidenceState>;
// Exact params: { header: RuntimeEvidenceHeader, plans: RuntimeCanonicalPlans }.
```

`preview` never changes the old state. It returns a new owned immutable state; the core assigns it only after physical durability. Plans are closed captured data, with 50 initial / 158 expanded outcomes, the correct 146 vision / 12 barcode distinction after selection, unchanged initial prefix, unique keys, modality and per-stage/profile coverage. Native assembly derives them with `deriveCanonicalReportOutcomePlan(files)` and `(files, 'LOW'/'MEDIUM')`; no caller may supply them to the native factory. Protocol facts are built only after existing shared-core validation, not ingested as unchecked raw legacy events. Capture them and recompute their existing digests; interrupted journals use the existing canonical interrupted shape, not a fabricated `reportPrediction`.

Task 3 adds these interfaces to `calibration.ts` without changing existing factory signatures:

```ts
interface CalibrationRuntimeEvidenceLedger extends CalibrationProtocolLedger {
  startRuntimeAttempt(key: unknown): Readonly<RuntimeAttemptRef>;
  startRuntimeOperation(ref: unknown, operation: unknown): void;
  settleRuntimeOperation(ref: unknown, operation: unknown, result: unknown): void;
  authorizeRuntimeRequest(ref: unknown): void;
  finishRuntimeAttempt(ref: unknown): void;
  bindRuntimeStageReport(stage: StageName, profile: CalibrationProfile): Readonly<RuntimeEvidenceEvent & { type: 'runtime_report_bound' }>;
  getRuntimeEvidenceSnapshot(): Readonly<RuntimeEvidenceSnapshot>;
}
function createRuntimeEvidenceCalibrationLedger(
  deps: CalibrationLedgerDeps, identity: CalibrationIdentity,
  keyResolver: CalibrationKeyResolver, reportOptions: CalibrationProtocolReportOptions,
  authoritativeOptions: CalibrationAuthoritativeReportOptions,
  runtimeOptions: { initialOwner: CalibrationOwner; plans: RuntimeCanonicalPlans;
    readCurrentGitState: () => Parameters<CalibrationLedger['assertGitState']>[0] },
): CalibrationRuntimeEvidenceLedger;
```

This is a low-level trusted-dependency core interface, not the native authority entry. Runtime methods synthesize type/version/sequence/owner/time and resolve existing terminal/reservation references themselves. No public raw-event append or caller-selected sequence/digest/abandonment method. `authorizeRuntimeRequest` does **not** reserve or invoke any SDK; a future producer calls the existing `reserve` once, then this method. Ordinary failures and recovered incomplete evidence cannot be hidden by these method names. The new-mode public method guard invokes the captured source reader and the existing private Git-state validation **inside the core's reentry/poison scope** before acquisition, authority reads and mutations. Capture the returned data before checking it; never call the public `assertGitState` recursively from that guard. Unit fixtures supply an explicitly trusted reader; native assembly never accepts one from its caller. No external wrapper can fail a source check while leaving a usable, unpoisoned inner ledger.

Task 4 exports native assembly and guarded storage:

```ts
type RuntimeEvidenceFileStoreOverrides = Pick<CalibrationFileStoreOverrides,
  'procStatReader' | 'nowIso' | 'renameSync' | 'fsyncDirSync' | 'fdWriteSync' |
  'fdFsyncSync' | 'fdCloseSync' | 'linkSync' | 'unlinkSync'>;
function createRuntimeEvidenceFileCalibrationLedgerDeps(
  baseDir: string, owner: CalibrationOwner, overrides?: RuntimeEvidenceFileStoreOverrides,
): CalibrationLedgerDeps;
async function prepareNativeCalibrationRuntimeEvidenceLedger(
  params: unknown, overrides?: RuntimeEvidenceFileStoreOverrides,
): Promise<Readonly<CalibrationRuntimeEvidenceLedger>>;
// Exact params: { context: CalibrationPreparedContext }.
```

Native assembly captures context before its first await, derives all plans/key/report resolvers from its pinned `files`, prepares `prepareCalibrationStageReportArtifactVerifier(context)`, selects guarded native storage and creates the shared-core mode with that native verifier. It captures the real `createCalibrationBootstrapReadDeps(context.baseDir).readGitState` function itself and checks it via existing Git-state/identity rules before acquisition/mutation/evidence authority reads; caller context is not itself evidence that current source is clean. No injected `verify`, Git-reader callback, replacement plans, alternate root, high-level `writeExclusiveSync` or legacy `fsyncFileSync` override is accepted by this native API. Low-level hooks are explicit trusted fault-test seams, not claims of physical durability when dishonestly implemented.

## Fixture and verification conventions

New fixture helper exports `makeRuntimeEvidenceData()` returning a Promise of `{ context, header, plans, key, start }`, where `key` is the first real preflight LOW key and `start` is its seq1/attempt1 event. Use `prepareCalibrationBootstrapContext` with committed asset bytes and test-owned Git/owner readers, the seven actual preflight files, and the existing planner. No invented case IDs or fake public/training manifest replacements. A second helper `makeRuntimeEvidenceCoreFixture()` returns test-owned ledger deps and the new core, with `ledger`, `owner`, `key`, `events`, `journals`, mutable fault controls, `restart(owner)`, `createUnacquiredLedger()`, `trace`, `finishPreflight()`, `finishDevelopment()`, `finishValidation()` and `cleanup()`; its internal verifier/source-reader seams are unit-test trust boundaries, never native report/source-proof tests. `makeRuntimeEvidenceNativeFixture()` returns an owned disk fixture with the same stage helpers, `ledger`, `owner`, `key`, `context`, `root`, `trace`, `restart(owner)`, `cleanup()` and low-level fault controls.

Stage helpers emit real runtime methods around **synthetic hermetic results**, use canonical plan keys, existing journal/prediction codecs, scorer and report assembler/publication, and existing gate helpers. They account for both preflight profiles, separate token reservation, profile choice and the 12 barcode outcomes. They do not construct a model client or call the unused runtime-capability producer. Independently decode resulting disk records for ordering/assertions; do not assert expected counts solely from the new reducer's snapshot. Build ordinary provider/dataset/product failure predictions only with the current schema's actual accepted codes.

The shared fixture never imports future/new source modules at runtime at module scope: core/native builders dynamically import them only when invoked. Task 1 controls invoke only `makeRuntimeEvidenceData()` and existing bootstrap/planner/scoring code, so missing source cannot masquerade as a fixture defect.

All suites install SDK-construction/global-fetch throwing guards and assert zero attempts; these guards are not universal network isolation. Data fixtures only read committed assets. Disk fixtures use `mkdtempSync` beneath `TMPDIR` (or the ignored disk-backed `functions/lib/runtime-evidence-test-tmp` fallback for CI), and clean exact owned prefixes in `afterEach` even on failure. For native Git checks, create a tiny task-owned Git fixture with committed `functions/` and pinned asset copies, prepare real bootstrap/native source readers, and use real docs-only commits/dirty source mutations in that fixture. No dependency on the main checkout being clean while TDD source is dirty; no writes to the user's Git state/config or completed workspaces.

At execution, after using-git-worktrees confirms the preserved checkout and user state, create only this plan's new `.superpowers/sdd/2026-10-14-calibration-durable-runtime-evidence` workspace. Verify `df -T` first. Set its absolute `TMPDIR`, `npm_config_cache`, log directory and `NODE_OPTIONS=--max-old-space-size=1024`; retain those exact values in task receipts. Worker/test processes are serial. Commands below run in `functions/`, with actual exits and logs collected, not inferred from JSON alone.

For strict test typing, author `.superpowers/sdd/2026-10-14-calibration-durable-runtime-evidence/strict-runtime-evidence-tests.json` extending `/home/agent-runner/projects/calorix/functions/tsconfig.json`, overriding `module: ESNext`, `moduleResolution: Bundler`, `rootDir: /home/agent-runner/projects/calorix/functions`, `types: ['node']`, `typeRoots: ['/home/agent-runner/projects/calorix/functions/node_modules/@types']`, including absolute actual `src/**/*.ts` plus the new tests/helper and setting `noEmit: true`. New tests import Vitest functions explicitly. Keep all existing strict flags. Run the literal no-emit command in Completion gates; do not substitute fake declarations for real source types. This ignored task artifact is not application code or committed build configuration.

## Task 1: Closed codec and deterministic binding digest

**Files:** Create codec source, codec tests and the data part of the new fixture helper listed above. No existing application edits.

**Consumes:** Existing identity/owner/key/receipt definitions and exact spec event shapes. **Produces:** Task 1 shared types/functions; `makeRuntimeEvidenceData()`.

- [x] **Step 1: Worker writes RED fixtures/tests only.** Read existing bootstrap/prediction/codec patterns, build the independently pinned data helper and dynamically import the missing codec in behavioral tests so a failure is attributable to the missing feature. Example actual assertions:

```ts
it('encodes a closed start and preserves caller ownership', async () => {
  const f = await makeRuntimeEvidenceData();
  const m = await import('../../src/nutrition-eval/calibration-runtime-evidence-codec');
  const captured = m.captureCalibrationRuntimeEvidenceEvent(f.start);
  expect(captured).toEqual(f.start);
  expect(captured === f.start).toBe(false);
  expect(Object.isFrozen(f.start)).toBe(false);
  const reordered = Object.fromEntries(Object.entries(f.start).reverse());
  expect(m.encodeCalibrationRuntimeEvidenceEvent(reordered))
    .toBe(m.encodeCalibrationRuntimeEvidenceEvent(f.start));
});
it('requires authority and evidence markers together', async () => {
  const f = await makeRuntimeEvidenceData();
  const m = await import('../../src/nutrition-eval/calibration-runtime-evidence-codec');
  const header = { ...f.header };
  delete (header as Partial<typeof header>).reportAuthority;
  expect(() => m.captureCalibrationRuntimeEvidenceHeader(header)).toThrow(CalibrationFatalError);
});
```

Add explicit positive/negative cases for all seven variants/three dispositions/two terminals; unknown fields, symbols/accessors, sparse arrays, successful and throwing reflection traps, mutable aliases, foreign thrown values, invalid timestamps/keys/digests, negative-zero and unsafe indexes, 16 KiB boundary/one byte over, lone surrogates, receipt/stage mismatch and wrong-pair/binding events in digest input. Pin a literal canonical byte string and independently computed hash for a small valid binding input; compare Node `createHash` against those bytes, not hash against itself. Check the aggregate binding can exceed 16 KiB while its individual events remain bounded.

- [x] **Step 2: Host witnesses RED and freezes tests.** First run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-fixture-controls.test.ts --maxWorkers=1 --minWorkers=1`, expected exit0. Its assertions independently require 50 initial/158 expanded real outcomes, 12 barcode keys per expanded profile, matching pinned manifest hashes and zero SDK/fetch. Then run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-codec.test.ts --maxWorkers=1 --minWorkers=1`; expected exit1 for missing codec, not broken fixture/network/setup. Record fixture/test SHA-256 and actual failure. No private source backdoor for bounds.

- [x] **Step 3: Worker implements source only.** Use a private descriptor capture and canonical serializer, narrow primitive validators, fresh `calibration:runtime-evidence-invalid` fatals, exact variant dispatch and owned deep freeze. Implement the Task 1 signatures, complete byte-length checks before serialization allocations, and separate aggregate-binding versus individual-record limits. No imports with filesystem/provider effects and no change to legacy hash helpers.

For example, after closed capture/recursive canonical encoding into local `encoded` bytes, the individual event encoder must enforce the final byte bound before returning; binding hashing does not apply that individual-record cap to the whole aggregate:

```ts
if (Buffer.byteLength(encoded, 'utf8') > 16 * 1024) {
  throw new CalibrationFatalError('calibration:runtime-evidence-invalid');
}
// Binding function, after its own closed aggregate capture:
return createHash('sha256').update(encoded, 'utf8').digest('hex');
```

- [x] **Step 4: Host verifies GREEN and checkpoints.** Run the same focused test command (expected exit0), strict real-source/test no-emit check, `npm run build`, `npm run lint`, nutrition and full Functions tests per Completion gates below. Review actual source and tests against every variant and privacy rule; get Antigravity actual code/result green. Update this task/status, then normal host commit `Add closed runtime evidence codec`, push and verify exact remote SHA. Keep old source/tests/assets unchanged.

## Task 2: Pure immutable reduction and keyed reconciliation

**Files:** Create state source/state tests; extend only new fixtures. **Consumes:** Task 1 codec/types and owned canonical plans. **Produces:** Task 2 state/frame/snapshot interfaces; no persistence or execution authority.

- [x] **Step 1: Worker writes actual RED transition tests.** Build frames from real pinned keys and existing validated journal/non-reservation codecs. Define the local test helper `runtimeFrame(eventIndex, event)` to return `{kind:'runtime', eventIndex, event}`. Then test immutable preview directly:

```ts
it('previews without mutating the last durable state', async () => {
  const f = await makeRuntimeEvidenceData();
  const { prepareCalibrationRuntimeEvidenceState } = await import('../../src/nutrition-eval/calibration-runtime-evidence-state');
  const state = prepareCalibrationRuntimeEvidenceState({ header: f.header, plans: f.plans });
  const candidate = state.preview({ kind: 'runtime', eventIndex: 2, event: f.start });
  expect(state.snapshot().sequence).toBe(0);
  expect(candidate.snapshot().sequence).toBe(1);
  expect(candidate.snapshot().activeAttempt).toEqual({ key: f.key, attempt: 1 });
});
it('cannot authorize a request using the header as reservation', async () => {
  const f = await makeRuntimeEvidenceData();
  const { prepareCalibrationRuntimeEvidenceState } = await import('../../src/nutrition-eval/calibration-runtime-evidence-state');
  const s = prepareCalibrationRuntimeEvidenceState({ header: f.header, plans: f.plans })
    .preview({ kind: 'runtime', eventIndex: 2, event: f.start });
  const forged = { ...f.start, type: 'runtime_request_authorized', sequence: 2, reservationEventIndex: 1 };
  expect(() => s.preview({ kind: 'runtime', eventIndex: 3, event: forged })).toThrow(CalibrationFatalError);
});
```

Add concrete table-driven frames for image-return/vision/reservation/authorization/metadata/terminal/finish, barcode snapshot-only, dataset/product/provider/parse failures, and every crash row. Assert all twelve selected-profile barcode keys reject image/vision/reservation frames; old owner events cannot settle a new attempt; abandoned unreserved attempts increment attempt number only after a valid recovery epoch; a reserved abandonment requires the canonical interrupted failure terminal. Refuse concurrent/duplicate operations, duplicate/gapped event indexes/sequences, fake plan coverage, wrong terminal/hash/receipt, pending settlements, post-admission mutation and 4097th runtime event. Exercise the 4096 cap through reachable repeated read-only recovery histories, not a hidden state override.

For prefix binding, finish both preflight profiles, admit LOW receipt, append its binding, then complete/bind MEDIUM and add legal later-pair frames. Re-request LOW `pairInput` at LOW's stored prefix: byte-equivalent input and hash, no new event. Before admission, `pairInput` may supply completeness data; it must not itself require a receipt/binding and create a circular seal.

- [x] **Step 2: Host runs RED, freezes state tests/helper.** Run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-state.test.ts --maxWorkers=1 --minWorkers=1`; expected exit1 for missing state implementation. Rerun Task 1 tests unchanged. Record exact exits and fingerprints.

- [x] **Step 3: Worker implements source only.** Capture header/plans once; privately retain immutable maps/arrays and clone only owned mutable state for each preview. Advance full-ledger index for every validated frame and runtime sequence only for runtime events. Derive operation/ref/owner/seal state, recompute existing journal/non-reservation digests, build sorted pair terminal rows and reject incomplete or mismatched evidence. Facts do not replace the original ledger's token/stage/selection/nutrient checks. No `node:fs`, network, bootstrap or runtime import of `calibration.ts`; type-only imports and `node:crypto`/pure codecs are allowed. Snapshot/pair output copies cannot alter retained state. Final Task2 repair performed by host under user-approved Ruling10, not clean historical worker-method compliance.

Inside preview, `frame` denotes the already closed captured frame; `lastEventIndex`/`sequence` are this immutable state's retained primitives. Reject before allocating/returning a candidate:

```ts
if (frame.eventIndex !== lastEventIndex + 1 ||
    (frame.kind === 'runtime' && frame.event.sequence !== sequence + 1)) {
  throw new CalibrationFatalError('calibration:runtime-evidence-transition-invalid');
}
if (frame.kind === 'runtime' && sequence >= 4096) {
  throw new CalibrationFatalError('calibration:runtime-evidence-transition-invalid');
}
```

- [x] **Step 4: Host verifies GREEN and checkpoints.** Run codec+state suites, strict real-source typing, all Completion gates and Antigravity code/result review. Update tracking, normal host commit `Add keyed runtime evidence reduction`, push/exact remote equality. No application outside these new pure files changes. Completed0337612/push0/exactremote; postcommit task-done72504 actual0/226pass0fail0skip.

## Task 3: Explicit shared-core evidence mode

**Files:** Modify only `calibration.ts`; create core tests; extend new core fixture. **Consumes:** Tasks 1/2, existing ledger deps/report authority. **Produces:** New low-level factory and runtime methods; existing factories and benchmark block unchanged.

- [x] **Step 1: Worker writes RED core tests.** Completed under user-approved native Task3 exception, preserving worker provenance. New fixture controls validate the existing strict/authoritative factory before using the new factory; no production ledger mock. Use real owned in-memory deps that clone persisted arrays and expose each write/fsync/fault point independently. Tests call the new runtime APIs, inspect stored arrays independently, and verify actual ledger state:

```ts
it('has one atomic mode header and one reservation authority', async () => {
  const f = await makeRuntimeEvidenceCoreFixture();
  f.completeTokenPrerequisites();
  const ref = f.ledger.startRuntimeAttempt(f.key);
  f.ledger.startRuntimeOperation(ref, 'image');
  f.ledger.settleRuntimeOperation(ref, 'image', 'returned');
  f.ledger.startRuntimeOperation(ref, 'vision');
  f.ledger.reserve(f.key);
  f.ledger.authorizeRuntimeRequest(ref);
  expect(f.events[0]).toMatchObject({ type: 'protocol_identity',
    reportAuthority: 'verified_artifacts_v1', runtimeEvidenceVersion: 1, owner: f.owner });
  expect(f.events.filter(e => e.type === 'protocol_identity')).toHaveLength(1);
  expect(f.events.filter(e => e.type === 'reserved')).toHaveLength(1);
  expect(f.events.filter(e => e.type === 'runtime_request_authorized')).toHaveLength(1);
  expect(f.ledger.getCounts().imageReserved).toBe(1);
});
it('does not expose constructor replay as current-owner authority', async () => {
  const f = await makeRuntimeEvidenceCoreFixture();
  const other = f.createUnacquiredLedger();
  expect(() => other.getRuntimeEvidenceSnapshot()).toThrow(CalibrationFatalError);
  expect(() => other.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
});
```

Define `createUnacquiredLedger(): CalibrationRuntimeEvidenceLedger` on this test fixture (same deps/options; no acquisition). Include all existing strict mode combinations: empty, ordinary header, authority-only header, unknown/missing version, wrong marker, nonempty journal/no header, duplicate header and old factories opening the new header. Old-mode positive controls retain their exact event bytes.

Exercise durable failure at header/runtime/reservation/terminal/receipt/binding append/file-hook/dir-hook; no candidate state advances before final success; foreign errors become fresh static fatals and release fails after poison. Successful reflection traps reenter start/get/settle/reserve/release before capture finishes: no extra writes, permanent poison, no foreign raw error. Check `protocol_noop` maps only the five named already validated kinds; unknown/synthetic events retain existing rejection. Assert bare reserve/terminal without corresponding attempt is rejected in new mode but old behavior is unchanged.

Add recovery tests for every matrix row with a proven dead owner, including unreserved vision intent, reserved-but-not-authorized, authorized/no terminal, real terminal/no finish, missing settlement, orphan journal and admitted receipt/no binding. No reserved key appears as resumable. No inference port exists on this object, and no synthetic success closes a conflict. Unit verifier fakes are explicitly not native authority proof; native report-byte/tamper cases belong to Task 4.

- [x] **Step 2: Host witnesses RED and freezes tests.** Actual full serial42161/task-3-host-red-c results/hashes recorded above. Run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-core.test.ts --maxWorkers=1 --minWorkers=1`, expected exit1 for missing new factory/methods, not an invalid fixture or loosened old assertions. Run `npx vitest run test/nutrition-eval/calibration-protocol-ledger.test.ts test/nutrition-eval/calibration-authoritative-reports.test.ts --maxWorkers=1 --minWorkers=1` as unchanged positive controls and record all hashes/exits.

- [x] **Step 3: Worker implements guarded mode branches only.** Completed under the user-approved native Task3 exception; source35265ab69d18 focused212GREEN/strict/lint/protection and scoped actual repaired-code review green, final full gates/checkpoint remain Step4. Add new explicit internal-init mode, not a sixth option to the old public factory. Extend header creation/replay only in that mode. Route validated protocol events to Task 2 facts, with existing journal/hash capture for terminal facts; full-ledger indexes include header/noops. In `strictPersistLedgerEvent`, preview before effects, persist through existing append/file-validation/dir-fsync, then assign the candidate only after success; poison on any boundary failure. During constructor/current-owner replay, fold immutable facts in original order, but keep authority provisional until locked reread and native artifact checks.

Guard **all** new-mode methods (including inherited getters/reserve/release) before reflecting caller values or calling trusted callbacks, with `finally` release and poison recheck. Capture/invoke `readCurrentGitState` and run existing private source checks in this guard so failures poison the same core and retain any held lock. Check poison immediately after the reader, after capturing its result and after any successful hostile reflection, before persistence begins. Internal private calls must not trip their own public reentry guard. Resolve terminal/ref data from existing validated maps, not caller hashes. Allow only recovery's private path to close an older owner attempt, after durable `lock_recovery`; calling recovery on a currently active same-owner attempt cannot manufacture crash entitlement. Recovery first preserves existing interrupted journal/terminal logic, then appends the correct abandonment or finish; do not repair existing orphan/conflict rejection.

Receipt admission first uses runtime completeness without binding, then existing fresh verifier/durable admitted receipt/seal. Binding re-verifies and captures the admitted receipt, computes the spec input/digest, persists once and returns a copied data event. Retry uses the existing event's original prefix even after other pair events; do not change `throughSequence` to current sequence. Existing stage/nutrient/report gates remain in force; benchmark completion still throws unconditionally. No native producer, raw-event append API or extra admission seal.

The evidence-mode persistence branch has this ordering (`frame` has been projected/captured from the validated event and existing result maps):

```ts
const candidate = runtimeState.preview(frame);
if (poisoned) throw new CalibrationFatalError('calibration:ledger-poisoned');
try {
  deps.appendLedgerEvent(event);
  if (poisoned) throw new CalibrationFatalError('calibration:ledger-poisoned');
  deps.fsyncLedgerFile();
  if (poisoned) throw new CalibrationFatalError('calibration:ledger-poisoned');
  deps.fsyncLedgerDir();
  if (poisoned) throw new CalibrationFatalError('calibration:ledger-poisoned');
} catch {
  poisoned = true;
  throw new CalibrationFatalError('calibration:ledger-persist-failed');
}
runtimeState = candidate;
```

Header initialization is its own captured initial-state path, not a fabricated runtime frame. During ordinary replay no persistence occurs; during mutation no core counter/state is committed before the persistence path succeeds. A hook that reenters after a physical append began can leave bytes on disk: fail/retain lock, grant no success, and reconcile on restart, not promise rollback or fictitious zero disk writes. Capture-stage reentry before persistence still requires zero writes. Freeze only the newly owned returned public method object, never callback/argument records. Do not pass hostile foreign values directly to assertion matchers that may inspect them; assert fresh-fatal identity/privacy and trap counters using owned booleans/primitives.

- [x] **Step 4: Host verifies GREEN and checkpoints.** Completed with sourcecheckpointf596173 commit/push0/liveexact and postcommit task-done50400 actual0/708GREEN/no skips; full gates and corrected actual CLI code/result agreement recorded above. Run new codec/state/core and existing protocol/authoritative suites, strict typing and all Completion gates. Inspect the **entire existing-core diff**, not only new exported methods. Antigravity actual code/result green; normal host commit `Add opt-in runtime evidence ledger mode`, push/exact remote equality. No default importer changes.

## Task 4: Guarded native persistence, real artifacts and crash cuts

**Files:** Modify only `calibration-file-store.ts`; create native assembly/native tests; extend new disk fixture. **Consumes:** All prior tasks, real native report verifier/bootstrap Git reader. **Produces:** New unused native preparation and guarded storage factories, fault-tested under the same lock and shared core.

- [x] **Step 1: Worker writes RED disk/native tests.** Implement the task-owned mini-Git fixture described above with portable `execFileSync('git', argv)` and local fixture-only identity config, never shell Git writes in the user's checkout. Use actual pinned asset copies, production bootstrap/planner, real report publication/verification and real fsync/rename default paths. Inject only declared low-level fault hooks. Add independent ordered trace assertions with actual basename/inode/fd witnesses; no replace-all filesystem mock.

```ts
it('blocks after a failed directory fsync and retains the lock', async () => {
  const f = await makeRuntimeEvidenceNativeFixture();
  f.completeTokenPrerequisites();
  f.faults.failNextLedgerDirFsync = true;
  expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
  expect(f.trace).toContain('ledger:dir-fsync:fault');
  expect(existsSync(resolve(f.root, 'lock.json'))).toBe(true);
  expect(() => f.ledger.releaseLock(f.owner)).toThrow(CalibrationFatalError);
  expect(() => f.ledger.startRuntimeAttempt(f.key)).toThrow(CalibrationFatalError);
});
it('revalidates a bound receipt after other pairs without appending', async () => {
  const f = await makeRuntimeEvidenceNativeFixture();
  await f.finishPreflight();
  const first = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
  f.ledger.bindRuntimeStageReport('preflight', 'MEDIUM');
  const before = readFileSync(resolve(f.root, 'ledger.json'), 'utf8');
  const again = f.ledger.bindRuntimeStageReport('preflight', 'LOW');
  expect(again).toEqual(first);
  expect(readFileSync(resolve(f.root, 'ledger.json'), 'utf8')).toBe(before);
});
```

Define `faults.failNextLedgerDirFsync` as a task-owned one-shot hook control armed **after** successful initialization and explicit token prerequisites. It emits the dedicated `ledger:dir-fsync:fault` trace only when the armed failure is reached; initialization/readiness fsync calls cannot satisfy that witness. `finishPreflight()` publishes/adopts receipts after both profile outcomes but does not bind them, so the second test exercises the real first bind. Full fixture cleanup uses `afterEach` with exact-owned roots registered before a failing setup can leak them; the snippet's unresolved interrupted evidence is intentionally never reported as passed calibration.

Test real writable-fd byte loop (short/zero/negative/overlarge/throw), fsync-before-close, failing close after native close and before it, rename before/after publication, parent fsync, post-fsync owner/path/inode replacement, symlinks/nonregular files/private modes and foreign lock metadata. Close faults cannot leak owned descriptors; check both hook witness and native descriptor status, without sweeping `/proc` or shared temps. Assert zero returns that grant permission after ambiguous persistence and permanent poison/retained final lock where possible; if ownership was replaced, do not remove the foreign lock.

Exercise all crash cuts in fresh instances, simulating exact persisted disk prefixes and real current-owner acquisition/liveness probes. Verify recovery history remains immutable, no hidden reset and no reserved redispatch. Native report tests cover byte tampering of JSON/Markdown, duplicate/orphan/mismatched journals, incomplete operations, stale owner receipt replay, wrong source/profile and report binding mismatch. Constructor replay alone remains provisional; a callback/receipt supplied as a native params extra is rejected before effects.

Use the mini-Git fixture to commit a docs-only change (same Functions tree/implementation identity: permit), dirty Functions (reject), change/commit Functions (reject against original identity), and change pinned assets (reject). Use declared `/proc` reader override only for dead/unknown/PID-reused owner simulations; no actual process killing. Verify malformed/no-opt-in default CLI still has no native runtime controller. After fake preflight/development/validation and benchmark data, all 60 benchmark outcomes/12 barcode data traces can exist, but `completeStage('benchmark', ...)` still fails with the exact existing runtime-evidence-required error. This is a synthetic ledger fixture, not a live/fake SDK 146-dispatch proof.

- [x] **Step 2: Host witnesses RED and freezes native tests.** Run `npx vitest run test/nutrition-eval/calibration-runtime-evidence-native.test.ts --maxWorkers=1 --minWorkers=1`; expected exit1 for missing native/guarded factory behavior. Run `npx vitest run test/nutrition-eval/calibration-file-store.test.ts test/nutrition-eval/calibration-report-publication.test.ts test/nutrition-eval/calibration-report-artifact-verification.test.ts --maxWorkers=1 --minWorkers=1` as unchanged positive controls. Record test/helper hashes and actual RED categories before native source changes.

- [ ] **Step 3: Worker implements source only.** Reuse one private file-store implementation with opt-in ownership guards, keeping `createFileCalibrationLedgerDeps` defaults/overrides/behavior unchanged. New guarded factory validates its closed overrides and owner, uses non-following leaf open plus observed ancestor/lock identity checks from existing report patterns, and guards append/journal publication before effects, before rename and after directory fsync. Never silently accept high-level write/fsync replacement hooks. Writable-fd fsync/close/rename/dir-fsync order is explicit; invalid byte count is a fresh static fatal. Owned temp cleanup must not remove final files, another task's directory or a foreign/replaced lock.

Native assembly captures the exact context synchronously, derives pinned plans/resolvers, selects native source reader/guarded store/artifact verifier and creates only the opt-in shared-core object. Do not acquire a lock, reserve, construct clients or run a stage in preparation itself; caller explicitly calls inherited `acquireLock`. Supply the selected native source reader through the low-level core option, not a separate failure-only wrapper; the shared-core guard enforces source checks, static causeless failures and poison/reentry rules. A native source-check failure after lock acquisition must not call release automatically.

In the guarded native writable-fd loop, `fd`, `buffer`, `offset` and captured `hooks` are owned locals. Do not retain the old mode's permissive overlarge-count clamp in this new mode:

```ts
const remaining = buffer.length - offset;
const count = hooks.fdWriteSync(fd, buffer, offset, remaining);
if (!Number.isSafeInteger(count) || count <= 0 || count > remaining) {
  throw new CalibrationFatalError('calibration:runtime-evidence-write-failed');
}
offset += count;
```

Repeat until complete; writable-fd fsync and close precede the guarded rename, then parent fsync and final owner/path check. Keep this stricter count policy inside the opt-in storage branch so old factory overrides/assertions are unchanged.

- [ ] **Step 4: Host verifies GREEN, whole-plan review and source checkpoint.** Run all new suites and old storage/protocol/report suites, real-source strict typing, build/full lint/nutrition/full serial tests. Use one fresh strongest allowed native read-only whole-plan reviewer under the preserved inline workflow, plus mandatory Antigravity actual full code/result review. Do not substitute native review for explicit MCP agree/MUST_FIX none. Address Important/Critical findings with witnessed new RED→GREEN, record optional findings/rulings, reverify, normal host commit `Add guarded native runtime evidence persistence`, push/exact equality. Review all allowed existing-core/storage diffs and all new source/tests; no protected old tests or default importers change.

## Completion gates and checkpoints

Each meaningful task checkpoint includes its tests/source plus updated checkboxes/status/actual results, a normal host commit and push. Workers never commit. After focused GREEN, run from `functions/`, serially with this task's disk TMPDIR/cache/logs:

```bash
npx tsc -p /home/agent-runner/projects/calorix/.superpowers/sdd/2026-10-14-calibration-durable-runtime-evidence/strict-runtime-evidence-tests.json
npm run build
npm run lint
npx vitest run test/nutrition-eval --maxWorkers=1 --minWorkers=1
npx vitest run --maxWorkers=1 --minWorkers=1
```

Record the literal task-owned config/log paths at execution, never `/tmp`. For the full run collect JSON with `--reporter=json --outputFile=/home/agent-runner/projects/calorix/.superpowers/sdd/2026-10-14-calibration-durable-runtime-evidence/logs/full-functions.json`, retaining the actual process exit separately. Use separate task-numbered filenames for earlier checkpoints so evidence is not overwritten. Run focused new test files for tasks completed so far and old controls named in that task. Expected every applicable command exit0, no new skipped tests. Preserve the single existing opt-in test `public-manifest fetches and verifies all 20 public case images against their SHA-256`; report actual counts, not a prerecorded target.

After Task 4 source checkpoint, run the full serial Functions suite again as postcommit verification with executing-plans task-done and the recorded task BASE. Collect actual exit, counts, skip identity, source/test/config fingerprints and no active owned workers before final tracking push. Only after push/remote equality recoverably clean this plan's exact owned workspace, never the completed predecessor or shared `/tmp`.

No Firebase/emulator `test:verify`, Flutter/APK/device/UI, provider/live gate or calorie-accuracy/production/security approval is claimed from this unused slice. Record these as intentional scope exclusions, not passing gates. No UI run ID or visual artifacts; diff counts, `auditLimited`, `visualClassificationStatus` are N/A. Reviewers inspect source/tests/results, not real food predictions or exhaustive visual diffs.

## Spec coverage / self-review

Task4 Steps1–2 full REDfreeze accepted 2026-10-16T21:51:43Z: host38143/task-4-host-red-a oldnative367pass exit0, finalnative170=58existingpass112sole-missing-factoryfail exit1, prior708pass exit0, all0skip, strict/lint/protected0. Native1697lines92770B SHA9323478581eba10183d13d29d4cce3eb0c3d5d65fa259fd98a85153e3b06abde/helper1455lines61041B SHA88f56c960dcb51c609cce26e93773551fb3b6d5cb675db76c94265131a2372ff fully frozen; originalprefix/protected121/config unchanged. Actual MCP primary3.8 requestedHigh/persistent calorix-task4-native-red-matrix-20261016/yolo explicitagree/MUSTnone, isErrorfalse; sameconversation retractions remove future-body proof/universal certification/incorrect temp-root claims, retaining bounded RED-specification acceptance. MCP current route worked, no new CLI/fallback/config repair. Missing guarded factory/module remains absent at freeze. Steps3–4 open, native Task4-only Ruling22 source authority onlycalibration-file-store.ts +new calibration-runtime-evidence-ledger.ts; source-phase checker freezes fulltests/helper+otheroldsource. All170 actualGREEN/fullgates/MCP code-result/ONEfresh strongest native wholeplan review/commitpush/postcommitFULLFunctions remain. No default/producer/benchmark/live/security/production approval.

Task4 native artifact tests 2026-10-16T19:03:30Z: host-v87989 finished actualnative1/137=53existingGREEN84sole-native-missing0skip/strict0/lint0/protected0.12new actual existing controls: JSON/Markdown physical byte tamper on binding retry and fresh acquisition; duplicate/orphan/hash/key journals; receipt hash; binding digest/profile/epoch; source-header mismatch; actual report files without receipts verified/admitted/bound under freshowner after restoring observed ledger prefix, retry no append/outcomes unchanged. No artifact repair or lock release on rejection. Native whole2a94693efe9cf0601d742c98061508f23f63eb281372cdcba8dd33e52e04f6da, original70969B d6f28049 prefix/helper88f56c96/protected121/config unchanged. Remaining pending-operation/capture/ancestor/private-path/defaultCLI/fullhostREDfreeze before source; Task4 boxesopen/BASE77b6057/Ruling22ONLY/externalgateOPEN, no production/live/security approval.

Task4 real-disk recovery tests2026-10-16T18:55:56Z: host-u58592 actualnative1/113=41existingGREEN72sole-native-missing0skip/strict0/lint0/protected0. Added12SAME oldnative/future crash-cut drivers plus read-only barcode snapshot interruption after preceding actual native stages; all13new oldnative controls passed. Independently parse actual persisted prefix, owner epochs, counts, existing interrupted journals/failure terminals, resumable keys and idempotent repeated recovery; no reserved redispatch/orphan repair/terminal rewrite, oldinstance fails authority. Fullnative wholed6f28049d465aa9c9ff7007da726041407752edca6b14a43da4026c18a108841/helper88f56c96 unchanged/originalprefix/protected121/config unchanged. Guarded body still absent/unproven. Artifact/capture/path remainder +full hostREDfreeze remain before source; allTask4boxesopen/BASE77b6057/Ruling22ONLY/externalgateOPEN.

Task4 native stage FIXTURE2026-10-16T18:49:10Z: host-s87=27pass60fail genuine missingstagehelper plus59native-missing; strictlintprotected0. New-only stage blocks under frozen nativef83a1852/helper outsidea47b305a; host-t22659 finished actualnative1/87=28existingGREEN59sole-native-missing0skip/strict0/lint0/protected0/stagechecker0. Existing native driver real fullstage passed110253.91563ms with actual JSON independently asserting158outcomes146images12barcodes(4×3), benchmark60(48image/12nonReservation), snapshots12/no barcode reservations, selectedMEDIUM, completed stages onlypreflight/development/validation and exact unconditional benchmark denial/unchanged disk. Actual native published reports/scorer/gates, synthetic predictions not SDK/live calibration/nativefuture authority. Helper88f56c960dcb51c609cce26e93773551fb3b6d5cb675db76c94265131a2372ff; originalprefix/protected121/config unchanged. Next crash/artifact/closed-capture matrix/fullhostREDfreeze before source; Task4 boxesopen/BASE77b6057/Ruling22/externalgateOPEN.

Task4 liveness FIXTURE checkpoint2026-10-16T18:43:05Z: genuine host-q85=22pass63fail included five reader-simulation defects; scoped reader+one field correction under frozen native539648cb/outsideReader9782692e. Host-r40506 finished actualnative1/85=27existingGREEN58sole-native-missing0skip/strict0/lint0/protection0/livenesschecker0. Native /proc parser, actual disk ownership/history/newattempt2 after dead/reused owner verified; live/unknown/malformed retain exact original lock bytes+inode and ledger. No process killed; no guarded factory behavior proven yet. Helpera47b305a9f09a76ee363dacc12f244109684610eda10fec8e1edb4a7a9210953, protected prefixes/source/config unchanged. Readiness40c451f pushed27130actual0/liveexact; earlier18:42Z readiness hand-written label was inaccurate (collected before18:40:09Z). Next fullstage helper RED then recovery/artifacts/fullREDfreeze, all Task4 boxes open/BASE77b6057/Ruling22ONLY/externalgateOPEN.

Task4 readiness FIXTURE checkpoint2026-10-16T18:42Z: genuine explicit-readiness→preflight RED host-m73=19pass54fail followed shared-driver fix/GREEN host-n73=20pass53native-missing. Premature local-cache fix discarded before independent reverse-order RED host-o75=21pass54fail; then ONLY local readiness function corrected. Host-p99931 actualnative1/75=22existingGREEN53sole-native-missing0skip/strict0/lint0/protection0/localphasechecker0. Pending-token anti-repair control passes with unchanged disk/no completion; real publication/admission flow unchanged. Native wholefb31320639845afd720222778ab156aba926710219ac93db9c79b8e86ae2e6f5 frozen across final fix; helper9ea6f18ec3ff04c87b413f15759ddef50e2fc017b23ab72dc856165e7f8f2b21; original helper prefixes/protected121/config unchanged. All Task4 boxes OPEN/BASE77b6057/Ruling22-only; full liveness/stage/crash/artifact matrix and host complete REDfreeze still required before source. External result gate OPEN, no native/live/production approval.

Task4 restart FIXTURE regression RED→GREEN2026-10-16T18:22:28Z: host-k72=18pass53native-missing+1genuineacquireLockfailure/strictlintprotection0, then ONLY2restart-body owner-context lines changed; WHOLE nativebf49d423 and outsideRestart227fab frozen. Host-l89465 actualnative1/72=19existingGREEN53sole-native-missing0skip, strict/lint/protection0/newrestartchecker0. Newhelper919f5574, old29360+4792prefix/source121/config unchanged. Receipt replay now natively verifies current newowner while old header/history remain unchanged; future branch passes newownercontext but native module still absent, no native behavior claim. Remaining readiness/liveness/stage/recovery/artifact/fullREDfreeze and externalgate OPEN, allTask4boxesopen/BASE77b6057/Ruling22onlyTask4/no production/liveapproval.

Task4 physical-path/FD test checkpoint2026-10-16T18:16Z: host-i71=18existingGREEN53sole-native-missingfail0skip/strict0/protection0/lint1preferconst; lexical binding fix then WHOLEhost-j60713 same71/18/53/0skip actualnative1, strict/lint/protection0. Currentnative1022lines53006B SHA577c1ee950a951aa5f9c94a6567dce7412794d0c391e43c5927bbca305324244; original43743authorityprefix/prior34132/foundation21475/helper094/source121/config unchanged. New foreign lock metadata/inode timing, symlink/nonregular leaves/root, postdirsync finalinode and reusedFD controls; actualoldsource reusedFD control passed. Native source absent, no fullmatrix freeze or hardware/race/security approval. Next fresh-owner restart helper regression RED first, then narrowly scoped helper repair, remainingliveness/recovery/artifacts/stages/fullREDfreeze/externalgate. AllTask4boxesopen/BASE77b6057/Ruling22onlyTask4.

Task4 closed-input/source test checkpoint2026-10-16T18:10:35Z: host-h54136 native1/onefile55=17existingcontrolsGREEN38sole-native-missingfail0skip, strict/lint/protection0; native844lines43743B, original34132Bf9736d37/foundation21475/helper094/source121/config unchanged. Added real miniature Git docs-only/dirtyFunctions/committedFunctions/pinnedasset SAME-driver controls and future closed native inputs, no-eager-publication, synchronous caller capture and provisional-replay cases. Absent loaders outside rejection assertions. Full lock/path/recovery/artifact/stage matrix and host wholeREDfreeze remain before SOURCE; external gate OPEN (3.8 interrupted twice, fallbacks unavailable), allTask4boxesopen/BASE77b6057/Ruling22onlyTask4, no production/live/security/accuracy approval.

Task4 persistence-test partial RED checkpoint2026-10-16T18:03Z: native676lines34132B SHA f9736d37050a46bcba88db2ed5401ecb5d1a1829cdab569662b351ab9a20c26f, frozenfoundation21475B/helper094/protected121/config unchanged. Host-f30=13existingGREEN17missingfactoryfail0skip/strict0/protection0/lint1unusedtype; type-only annotation then WHOLE host-g50728 same30/13/17/0skip actualnative1 withstrict/lint/protection0. Real SAME driver disarmed through tokens, actual syscall completion/bytes/prefix/sequence/fdclosure/staticerror/zeroeffect/poison/lock/candidate uncertainty assertions. Futurefactory remains absent. Review83958 primary3.8High CLIactual0 returned ERROR: The stream was interrupted. Please continue the task you were working on. Embedded agree/MUSTnone NOT green. New-UUID resume warning recorded; actual conversation7810e2c1-f99d-4edf-854b-d529a8e7d45c authoritative, canonical fallbacks next. Ruling22 Task4ONLY nativeediting/all4boxesopen/BASE77b6057/fullremainingmatrix+hostREDfreeze beforeSOURCE; no completedTask4/native/hardware/live/production approval.

Ruling22: user explicitly approved native authoring for Task4 only with `yes go on` in response to the Task4-specific exception request. Main uses apply_patch for Task4 tests/source; exception ends with Task4. Cost: reduced implementer/host separation, while all test-first/REDfreeze, external review, ONE final independent native whole-plan review, verification, commit/push/postcommit gates remain. No source-before-fullREDfreeze, default/producer/live activation, deploy, other-task authority or unrestricted worker shell is authorized. Start with newly authored valid persistence tests, not the invalid unapplied worker payload.

Task4 blocked handoff 2026-10-16T17:41Z: after free route runtime timeouts and paid worker method violation, Ruling21 restricted paid retries74996/16407 both actual0/noedit with explicit Bash dontAsk permission denial for exact raw helper (including exact-name rule retry). No source/tests added; native21475B16fab5a1/helper094/protected121/config unchanged, foundation host-e4GREEN2missingfuture/strict-lint-protection0 and scoped CLI63730review remain last actual results. Read-only shell search worked, so do not claim all Bash blocked or diagnose wrapper cause. Main does not restore unrestricted bypass or infer Task4 native exception from continue; explicit user authoring direction needed. Attempted unapplied worker patch is unaccepted: faults armed during initialization, before-close leak wrongly expected, ordering/sequence/error/effect assertions insufficient. Must author corrected genuine tests and finish full native matrix/hostREDfreeze before SOURCE. All4Task4checkboxes remain open, BASE77b6057, Tasks1–3 complete; retain workspace/rulings1–21 and no production/live/accuracy approval.

Ruling21 (2026-10-16): after the paid worker violated no-scratch/patch-only by shell-writing/removing a `/tmp` probe (no app edits), retry SAME `claude-sonnet-5` with tighter `dontAsk` permission mode and only read/search plus the exact preallowed raw-patch executable. Main runs all verification instead of granting general worker shell/test access. This narrows the route's normal bypass invocation, not model/app scope or native-host editing authority. Cost: valid patch commands can be denied by pattern compatibility and require diagnosis; no RED/strict/lint/full-suite/external/native review/commit/push gate is waived. The worker's initial unvalidated deletion at `/tmp/apply_patch_probe` has unknown prior contents; current path is absent, not claimed recoverable. All repository fingerprints stayed unchanged.

Task4 foundation checkpoint 2026-10-16T16:55Z: native test21475B/SHA16fab5a19c1f09b40c074d30c016f8da6e945c1ad9e3b815dfd7acd5c4169455; full helper0948265b and all oldsource/prefix/config unchanged. Final FD-only worker69488 rawpatched then stalled without verification; exact owned process locally terminated, actual143, not provider/quota failure or success. Host39311/task-4-foundation-host-e independently native1/onefile6=4existingcontrolsGREEN2missingfactoryfail0skip, strict/lint/protection0. Actual primary3.8High user-approved temporary headlessCLI review63730/sameaf9e1a2d `TASK4_FD_COMPLETION_ACTUAL_REVIEW` explicitagree/MUSTnone; only bounded existing-source per-publication FD/completion/dir-barrier oracle accepted, not hardware/all-races/security/native composition. Full native RED matrix remains required: append-only persistence faults next, then owner/recovery/artifact/stages/source/closedparams, host fullRED+oldcontrols/prior708/strict/lint before SOURCE. Task4 BASE77b6057 and all4unchecked boxes unchanged; no Task4 native-host exception inferred from continue. Tasks1–3 not reopened, no live/default/producer/benchmark authority.

- Codec/mode/privacy/bounds/digests: Task 1; actual atomic header/old-mode refusal also Tasks 3/4.
- Keyed operations, plan/profile/modality, terminal references, immutable prefix binding: Task 2, enforced in live mutation/replay by Task 3.
- Existing reservation/stage/model/report authority, poison, recovery/seals and benchmark block: Task 3; native verifier/source/owner behavior Task 4.
- Physical fsync/close/rename/lock-path faults and real artifacts/current clean Git tree: Task 4.
- Every recovery-matrix row: pure Task 2, core Task 3, real disk cuts Task 4. Existing orphan rejection remains a stop, not repaired success.
- Unused/default/producer/live boundaries, worker routing, source preservation, reviews, commits/pushes and postcommit evidence: Global Constraints and Completion gates.

## Planning receipts and handoff

Written spec approved by user on 2026-10-14 at `8ec53d378ee93e4ed290c8eef3f7f3780a148cff`. This plan is a new artifact: its existence is not user plan approval. Preserve the inline host-orchestrated/editing-worker execution method already established for the prerequisite, subject to user confirmation that this written plan captures the requested stage. Do not launch workers or create its execution workspace during planning. Exact-text MCP plan review and user plan review must precede implementation.

Plan review: Antigravity MCP, primary `gemini-3.8-flash`, persistent scoped conversation `calorix-durable-runtime-evidence-plan-20261014`, two text-only calls. A bounded new plan-artifact conversation preserves the earlier contract conversation's receipts rather than replaying its full accumulated text. First call received the entire approved spec and actual 434-line plan; `IMPLEMENTATION_PLAN_ONLY`, agree/MUST_FIX none. Three nonblocking reminders were verified: `assertGitState` is declared on `CalibrationLedger`; disk TMPDIR/fallback paths were already explicit; current versus stored-prefix pair queries were already covered. Its phrase “Unforgeable References” was rejected and explicitly retracted in call two: attempt refs are forgeable data tuples, not admission tokens.

Host self-review refined only Task 3 after the first snapshot: immediate poison checks after source reading/capture and each persistence callback, same-owner recovery exclusion, physical-write uncertainty instead of rollback/zero-write claims, and safe hostile-value assertion handling. Second call received that exact updated block and the source declaration; agree/MUST_FIX none/SHOULD_FIX none/QUESTIONS none. The final normative snapshot before these provenance paragraphs was 438 lines/50,473 bytes, SHA-256 `9d8e622a32c0ad88a154e4bbe122e573684a98949f9fc296314592cf0fd236ef`; host comparison confirmed all text outside the reviewed Task 3 block unchanged. No fallback, tool failure or reviewer repository mutation was observed. Reviewer summaries are not independent source/syscall verification or guarantees against arbitrary trusted code.

Planning verification: document structure/reference/fence/placeholder/whitespace checks passed; Functions source/tests remained unchanged against `8ec53d378ee93e4ed290c8eef3f7f3780a148cff`; no new Functions files or execution workspace. No application tests/builds, workers, provider/device/visual runs or production changes occurred. All 16 implementation checkboxes intentionally remain unchecked. Next gate: user reviews this written plan; retain the established inline worker execution method only after that approval.

User plan approval received 2026-10-15 after the linked plan at `deb8bf6e042a71d4fffd868acb9138c4c8a127e6`. Inline execution starts with Task1 BASE `deb8bf6e042a71d4fffd868acb9138c4c8a127e6`; executing-plans ledger/task brief created in this plan's new ignored workspace, verified `/dev/sda2` ext4. Preserve feature checkout/dependencies and use fresh relevant existing baseline plus full per-task/postcommit gates; these rulings and interface pre-flight are recorded in the ledger and will be copied here at checkpoints. No previously completed workspace/task is reopened. Initial focused baseline active; no GREEN/implementation completion claimed.

Execution checkpoint 2026-10-15: fresh existing journal/protocol/authoritative baseline actual0, 306passed/0failed/0skipped across3files, 248.653s. Existing Vite CJS deprecation and npm update notice were recorded; no package changes. Protected115 tracked source/test/eval files and user-config fingerprint unchanged. Startup tracking7607ccebe6da5a057efd1e1430f55d69ec342106 normal pushed/liveequal. Task1 RED-only worker route: grok-4.6 rejected unknown model (04:58:44Z); qwen3.7-max403 free quota exhausted (04:59:30Z); exact messages recorded in status before each fallback. OpenCode1.18.3 shared-config catalog load rejected `plugins` (05:00:38Z); shared config untouched. Task-local isolated catalog actual0 confirms Nemotron Ultra/Muse1.3/Nemotron Lightning/Big Pickle, with Ling absent and excluded. RED-only Nemotron Ultra worker unified45511 active; no source authorized, no completed implementation checkbox yet.

Execution rulings (chronological, costs retained):

1. Preserve the explicitly approved checkout/dependencies rather than create another worktree/reinstall — user preference and dirty config preservation — cost: less filesystem isolation, requiring strict path/fingerprint controls.
2. Use a fresh focused existing baseline, retaining full per-task/postcommit gates — old source is unchanged but historical green is not fresh evidence — cost: unrelated failures can surface later in full verification.
3. Host performs inline orchestration; literal strongest-first CLI workers author app/tests — user AGENTS.md overrides host-edit skill wording — cost: worker setup/context overhead.
4. Isolate worker XDG config/data/state/cache and use documented --pure rather than fix shared invalid config — preserve exact model order and unrelated plugins/MCP settings — cost: no inherited plugins/auth state; provider availability remains a separate gate.
5. Retain the two in-scope unaccepted fixture/control drafts after upstream timeout and have the next route inspect/complete them — preserve owned work without accepting partial output — cost: inherited draft defects require independent host/control checks before freeze.
6. Provide a task-only wrapper for the installed native patch engine and disable native Write/Edit tools in isolated worker config — the first worker used Write despite the requested patch method because no shell apply_patch existed — cost: setup compatibility overhead; initial draft creation is not patch-provenanced and remains unaccepted. The helper was verified on owned scratch only, not application code, and does not invoke a coding model.
7. Extend the frozen codec-test file append-only for source-inspection regressions while keeping its original97778-byte prefix/hash immutable — host reproduced two contract defects not covered by the initial110 tests, and normal TDD requires failing regressions before repair — cost: extra focused/full verification and external review time; original assertions cannot be weakened to hide the failures.
8. Reopen only the unused fixture binding name in the frozen test prefix for a mechanical `f`→`_f` lint correction, keeping the call and every assertion unchanged — full lint rejects the unused binding; no behavior/source change or weakened test is needed — cost: byte-level freeze hashes must be refreshed and full gates rerun. Normalize only this name back to verify both original full/prefix hashes; this is the explicit narrow exception to ruling7's byte-identity promise, not an assertion change.
9. Extend the frozen state-test file append-only for independently reproduced source defects, preserving its original108930-byte prefix/SHA6b1749ac and the helper/Task1 files — actual-source probes found missing capture, operation, recovery and prefix safeguards beyond the initial62 behavior cases; approved test-first execution requires witnessed new regressions before source repair — cost: more focused/full verification and external review time; old assertions cannot be weakened, and no native authority or live behavior is added.

Routing continuation 2026-10-15: Nemotron Ultra unified45511 FINISHED actual1 at05:08:00Z, provider_timeout, exact ANSI-stripped `Error: "Streaming response failed: [504] Upstream idle timeout exceeded"`; recorded in status before fallback. Only fixture/control drafts exist, no codec source or behavioral tests and no test execution accepted. Patch-only isolated config/catalog check93724 actual0 confirms Muse1.3 present; Muse1.3 RED-only continuation unified6490 now active with the same three-test-file allowlist. No source authorization or completed implementation step is implied. This supersedes the earlier ACTIVE45511 note; baseline306 and prior route failures are not rerun.

Task1 RED receipt 2026-10-15T05:41:47Z: Muse6490/81378/43339/83522 finished; host inspection rejected invalid initial drafts, corrected receipt/key grammar, exact UTF8/escape byte arithmetic, samepair/sorted syntactic cap fixtures, foreign-error normalization checks, nested alias contamination and omitted settled operation before acceptance. Those were test-validity corrections, not changes to normative scope. Personal host unified82014 finished with controls7passed/0failed/0skipped actual0, codec0passed/110failed/0skipped actual1, every failure solely the absent codec dynamic import. Fresh real-source/test strict diagnostic actual2 has only TS2307 at test94 for that missing module; no other type error. JSON/actual exits retained in the owned task-1-host-* receipts. Codec source confirmed absent, protected115/config unchanged. Freeze SHA256: fixture `15643c0a256a5e580e67bd703d4d3015f8f5156965bfe2e2f697952d4a83240f`, controls `6d51cdb1beda751d90780f01087d81b54c74d51b53f42639011ced7839d7b68d`, codec tests `f80a46fc197a426cf0b10e1f03420f2e232afef70fb876ef3b76788c845742b1`. Independently verified canonical binding literal1799B/SHA190922da41dc936d0d73ad99f23b1e940a375a68a4c043af1354fb415acccd98. Source-only Task1 author now authorized; Steps3/4 and every later task remain incomplete, no completion/live/production authority.

Task1 source inspection 2026-10-15T05:53:07Z: source worker17175 finishedactual0, focused117pass/strictactual0, tests unchanged. Host read actual1079line sourceSHA76ee9c8c077506d22de604ec8692475b72d8406f534a3bf5f9440467cfa3efea and reproduced raw TypeError from revokedProxy Array.isArray plus changing-length eventsProxy index traversal4097 beforelate cap rejection. Antigravity MCP gemini-3.8-flash/calorix-durable-runtime-codec-20261015 reviewed actualsource/probes/bounded TDD repairplan: REGRESSION_FIX_PLAN_ONLY agree/MUSTnone, both defects confirmed. Its approximate line references are not accurate source locations; host verified named functions/mechanisms directly. No mutation/fallback/tool failure. Code/result green/fullgates stillpending, not production approval. Append-only regressionRED then source-only repair is next. Nonblocking dense-array names.includes quadratic lookup polish is deferred (bounded4096), not a must-fix approval condition.

RegressionRED receipt 2026-10-15T06:03:33Z: four regressiontests appended, original97778B prefix/SHA preserved. Host68012 focused117pass4expectedfailactual1; strict caught ONLY two TS2559 array-handler typing errors. Worker83459 corrected exactly2emptyhandlers to objects, strictactual0 and same117/4RED. Host personally reran92210: actual1,117pass4fail0skip, exactlystaticfatal and4097/159 indexreadcounter assertions. Extendedtest112944B/SHAa9f0e4b7633ace3918d30e231e59366c87fbb8049dd4e5d21c1278e03dbf696d nowfrozen; originalprefix/fixture/control/source unchanged. Initial prematureJSON read got ENOENT beforeactivewriterfinished, then actualsameprocess result collected; no duplicate test or concealed failure. Source-only boundedrepair nowauthorized, allfullgates/code-resultreview/taskcompletion pending.

Task1 source/result checkpoint preparation 2026-10-15T06:46:58Z: source-repair14334actual0, hostfocused24633actual0/121pass0fail0skip. Source1050lines/SHA53ea3e54c916460cdf06e2f158369bac08dd30ff06f3aca1eb4c9303efb8ad8c; helper140lines/SHA15643c0a256a5e580e67bd703d4d3015f8f5156965bfe2e2f697952d4a83240f; controls218lines/SHA6d51cdb1beda751d90780f01087d81b54c74d51b53f42639011ced7839d7b68d. Firstgate36271strict0/build0/lint1 onlyunusedtestbindingf, nutrition/fullnotrun. Ruling8 mechanicallintworker64993 changedonly f→_f, keptcall/asserts; nativehost normalizeback recovered originalfulla9f.../prefixf80a46... exactly. Refrozen fulltest2326lines112945B/SHA c60c8663e1827c3314697f45a9d5a83369846c2d825760683e0e4701e7afd191; prefix97779B/SHA93ae472f6c99a354abb7231ad7d956e59e1e60df7e97c26a0cf3db253df8d524.

Fresh completion gates83029/task-1-host-b allactual0: real-source strict, build, full lint, nutrition38files2728pass0fail1skip and fullFunctions51files3123pass0fail1skip. Exactonlyexisting public-manifest20imagefetchoptinskip, newcodec114+controls7allpass/no newskip; intentional live/provider/Firebaseemulator/Flutter/device/UI exclusions are notpassedgates. Task-local diskTMPDIR/cache/heap1024 preserved. Actual code/result MCP gemini-3.8-flash/calorix-durable-runtime-codec-20261015 confirms complete current4files/spec/referencedtypes inspection, CODE_RESULT_TASK1_ONLY agree/MUSTnone/QUESTIONSnone; optional bounded quadraticlookup minor remainsdeferred. Reviewer line counts include trailingemptyline; no substantive mismatch. Its “authentic” hash/comprehensive wording is not execution provenance/all-inputproof, and Task4 remains unusednativeassembly notproducer wiring. Explicit production/benchmark/liveaccuracy/futuretasks/mobile gates setaside are approvedscope, not additionalapproval. Postreview all4hashes/old115/config unchanged, no mutation/toolfailure/fallback. Normal sourcecheckpoint/push then task-done wholeTask1focusedcommand next; Step4 and Task1 completion await those actualreceipts.

Task1 COMPLETE: normal sourcecommit/push9c5a23273c940e6f0b3401816ddb2a084f369821, actual0/exactHEAD-liveoriginequality; sixexpectedfiles only, userconfignotstaged. Postcheckpoint task-done46556 actual0,121pass0fail0skip (114codec+7controls), ledger range deb8bf6..9c5a232. Allfour Task1boxes checked; Tasks2–4 remainunchecked. Task2task-start read fullbrief with BASE9c5a23273c940e6f0b3401816ddb2a084f369821; next actual RED transition tests with no state source yet, reuse fresh unchanged Task1/full-suite baseline without claiming futuregate success. Continue approvedinline/strongest-first editing workflow; no newapproval/live/default/producer/benchmark authorization.
