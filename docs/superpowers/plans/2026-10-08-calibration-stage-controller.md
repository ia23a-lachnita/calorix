# Calibration Controller: Durable Report Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for this bounded task and its ledger. Repository source/test edits follow the strongest-first editing-worker policy in AGENTS.md; the host reviews, verifies, commits and pushes. No host application-edit exception carries over from the completed report plan.

**Goal:** Publish an internally reconstructed calibration stage/profile report durably and idempotently at fixed private paths, without treating publication as ledger receipt or stage acceptance.

**Architecture:** A new opt-in module composes the existing pure assembler with calibration-only filesystem publication. It consumes the same owned source/context and snapshot callback, verifies the caller's existing stage lock, renders/hash-checks the actual bytes, and returns immutable report plus byte receipt. It never accepts caller-scored reports, digest/path overrides or gate booleans. Existing writers, ledger modes, preflight session and CLI remain unchanged.

**Tech Stack:** Installed TypeScript/Node fs/crypto, Zod, Vitest; no dependencies added.

**Spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`; approved parent `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md`, Task7Steps4–7. This plan implements publication only; it does not complete parent Task7.

## Global Constraints

- Vertex identity remains project `calorix-xurschnell`, location `us`, model `gemini-3.8-flash`, API `v1`; no inference/client construction, new2.5calls, fallback, Firebase, device or deployment here.
- Protocol root is **`CALIBRATION_ROOT`**, currently `.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/`; never substitute `.nutrition-eval/calibration/v1/` or accept run-directory overrides.
- Preserve production defaults, prompt/schema/normalizer, scorer, existing generic report writer, strict3arg/4arg ledger modes and old preflight session. No ledger events, reservations, pins, recoveries, selections, stage completion or clock reads from this module.
- Source/report identity and measured/missing latency come only from existing assembly; no truth/results/hash/timestamp/runId overrides, repairs or invented latencies.
- Publication input is captured through own enumerable data descriptors before effects, including absolute baseDir and a closed owned owner record. Foreign getter/reflection/fs failures produce fresh static causeless errors, not copied messages/stacks.
- Task TMPDIR/logs/cache remain under this plan's ignored workspace on verified ext4. Tests serial `--maxWorkers=1 --minWorkers=1`; preserve original user.mcp SHA9c9622f5 untouched/unstaged.
- Test-first, independent focused/build/lint/full verification, required Antigravity PLAN/CODE gates, normal commits/pushes and postcommit task-done. Keep existing feature branch/worktree, no merge/PR.

## Review Focus

1. Caller context/owner/callback mutation across assembly's first await: captured base/owner/source must stay bound; one snapshot callback, zero malformed-input getter effects.
2. Crash after JSON publication before Markdown, or after both links before directory fsync: no publication receipt on failure; retry can finish only missing bytes when every existing byte matches the reconstructed report.
3. Existing conflicting, nonregular, symlinked or hard-linked artifacts: fail without overwriting/chmodding/removing them or touching external targets; newly created owned temp files only may be cleaned.
4. Short/zero/invalid fd writes and fsync/link/close failures: complete byte loop, writable-fd fsync before close, no-replace final claim, readback/hash and directory fsync before success.
5. Lock absent/changed/lost during publication: fail closed; never acquire/release/recover a lock or authorize stage progress. Serialized cooperating-controller ownership is the boundary, not authenticated storage or protection against hostile same-UID directory replacement races.

## Shared Interfaces

Create `functions/src/nutrition-eval/calibration-report-publication.ts`:

```ts
export interface CalibrationPublishedReportReceipt {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly runId: string;
  readonly jsonSha256: string;
  readonly markdownSha256: string;
}
export interface CalibrationReportPublicationResult {
  readonly report: NutritionEvalReport;
  readonly receipt: Readonly<CalibrationPublishedReportReceipt>;
}
export interface CalibrationReportPublicationOverrides {
  readonly fdWriteSync?: (fd: number, buffer: Buffer, offset: number, length: number) => number;
  readonly fdFsyncSync?: (fd: number) => void;
  readonly fdCloseSync?: (fd: number) => void;
  readonly linkSync?: (from: string, to: string) => void;
  readonly unlinkSync?: (path: string) => void;
  readonly fsyncDirSync?: (dir: string) => void;
}
export async function publishCalibrationStageReport(
  params: unknown,
  overrides?: CalibrationReportPublicationOverrides,
): Promise<Readonly<CalibrationReportPublicationResult>>;
```

`params` has exactly `stage`, `profile`, `context`, `readSnapshot`, identical to `AssembleCalibrationStageReportParams`. No new end-user override surface; filesystem hooks are privileged test seams, captured/validated once separately before effects. Reuse exported assembler/types/renderer and CALIBRATION_ROOT. No barrel exports or import from publication into ledger core; future ledger uses receipt types only through type-only imports if required.

Paths are exactly `resolve(ownedBaseDir, CALIBRATION_ROOT, 'reports', stage + '-' + profile.toLowerCase() + '.json')` and the matching `.md`. Root/base are never derived from report fields. Existing canonical root must already exist with a held lock matching all FIVE captured context.owner fields (`hostname`, `bootId`, `pid`, `startTicks`, `acquiredAt`); outer context has six fields, owner has five. Implement a PRIVATE non-mutating lock reader in this module: validate existing path components, open the fixed canonical `lock.json` O_RDONLY|O_NOFOLLOW, fstat regular/nlink1/mode0600, read/parse a bounded owner packet, descriptor-capture its exact five fields and compare them to owned context.owner. Retain the original lock fd's dev/ino identity and compare on each subsequent lock read, so replacement with identical owner bytes still refuses. Native owner packet maximum4096UTF8 bytes; reject larger lock before read. Never use existing file-store.readLock here: it invokes ensureCanonicalChain, which creates missing directories and chmods canonical root. Do not trust a caller lock callback or change the lock. Only create the private reports directory, not another protocol root. Caller base and pre-existing unrelated directories/files are not chmodded.

## Task 1: Source-bound private report publication

**Files:** Create publication module and `functions/test/nutrition-eval/calibration-report-publication.test.ts`; modify this plan/status only. No edits to any existing production/test source or package/config/assets.

**Consumes:** `assembleCalibrationStageReport(params: unknown): Promise<NutritionEvalReport>`, `renderNutritionEvalJson/Markdown(report)`, genuine bootstrap context, real-file strict ledger snapshot, CALIBRATION_ROOT. Existing file store is used only for test fixture setup, never as publication lock reader.

**Produces:** frozen report plus stage/profile/runId/raw-UTF8 byte hashes only after both canonical artifacts match and are fsynced. This is a byte publication result, NOT a ledger event, authenticated proof, profile-selection or gate approval.

- [x] **Step 1: Write real-file tests only.** New local fixture prepares actual committed assets with injected clean Git/owner identity, creates actual file store/strict ledger and report plan, acquires lock, records token plus LOW/MEDIUM preflight image terminals, and keeps the lock held. Build journals exactly like existing assembly fixtures; do not import a test module with side-effecting describes or modify its private fixture. Minimal fixture setup:

```ts
const context = await prepareCalibrationBootstrapContext({
  baseDir: dir,
  readGitState: () => ({headCommit: 'a'.repeat(40), implementationCommit: 'b'.repeat(40), functionsTreeId: 'c'.repeat(40), dirtyPaths: []}),
  readCommittedFile: path => readFileSync(resolve(repo, path), 'utf8'),
  readOwner: () => ({hostname:'publication-fixture',bootId:'publication-boot',pid:44,startTicks:44,acquiredAt:'2026-10-08T00:00:00.000Z'}),
});
const fileDeps = createFileCalibrationLedgerDeps(dir);
const ledger = createProtocolCalibrationLedger(fileDeps, context.identity,
  selected => deriveCanonicalAllowedKeys(context.files, selected),
  {getReportOutcomePlan: selected => deriveCanonicalReportOutcomePlan(context.files, selected)});
ledger.acquireLock(context.owner);
const token = {kind:'token_count',stage:'preflight',caseId:context.firstDevelopmentCaseId,model:'gemini-3.8-flash'} as const;
ledger.reserveTokenCount(token); ledger.completeTokenCount(token,42);
for (const profile of ['LOW','MEDIUM'] as const) {
  const key = {stage:'preflight',profile,caseId:context.firstDevelopmentCaseId,sampleIndex:1} as const;
  const p = captureCalibrationReportPrediction({parseStatus:'success',source:'meal',kcal:120,proteinG:10,carbsG:0,fatG:8,
    confidence:0.8,basis:'portion',amount:1,unit:'portion',decision:'needs_review',reviewReasons:[],latencyMs:17,sampleIndex:1,cached:false,
    diagnostics:{rawNutrients:{kcal:120,proteinG:10,carbsG:0,fatG:8},detectedItemCount:1,estimatedTotalMassG:90,
      declaredBasis:'portion',declaredAmount:1,declaredUnit:'portion'}});
  const four = {kcal:120,proteinG:10,carbsG:0,fatG:8};
  ledger.reserve(key); if (profile === 'LOW') ledger.pinModelVersion('gemini-3.8-fixture-pin');
  ledger.complete(key,ledger.appendResultJournal({key,normalizedPrediction:{...four,estimatedTotalMassG:90},
    predictionHash:sha256(JSON.stringify(four)),analysisLatencyMs:17,errorCategory:'none',
    responseModelVersion:'gemini-3.8-fixture-pin',reportPrediction:p}));
}
const request = {stage:'preflight',profile:'LOW',context,readSnapshot:ledger.getStageReportSnapshot} as const;
```

Define local `sha256(text)` using createHash, repo from import.meta.url and dir from mkdtempSync(tmpdir()) with test afterEach cleanup of only those tracked dirs. Import production functions named above. Capture ledger bytes/counts/events/clock effects before publication; assert unchanged after both success/failure. Missing module/export must generate deliberate missing-publication RED, not fixture/import/TS errors.

Required tests (actual new module calls, no fake writer/scorer):

```ts
const expected = await assembleCalibrationStageReport(request);
const result = await publishCalibrationStageReport(request);
expect(readFileSync(jsonPath,'utf8')).toBe(renderNutritionEvalJson(expected));
expect(readFileSync(mdPath,'utf8')).toBe(renderNutritionEvalMarkdown(expected));
expect(result.receipt).toEqual({stage:'preflight',profile:'LOW',runId:expected.runId,
  jsonSha256:sha256(renderNutritionEvalJson(expected)),markdownSha256:sha256(renderNutritionEvalMarkdown(expected))});
expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.receipt)).toBe(true);
```

Assert actual mode0700 reports dir/mode0600 artifacts, no changed base/canonical-root permissions or missing-root creation, snapshot callback once, no provider/network/cache/clock/stage/reserve effects. Publish both LOW/MEDIUM and verify exact fixed lowercase paths/no collision. Idempotent identical files retain bytes/inodes and return same hashes, no additional temp or final writes (readback/fsync still allowed). Delete only the test-owned Markdown to simulate partial publication, then retry: existing JSON unchanged, missing Markdown safely restored, success only after both verify/fsync. Conflicting JSON OR Markdown, unknown extras in input, caller report/hash/path overrides, symlink/hardlink/nonregular targets, symlink reports dir/canonical path, mismatched/missing/lost lock and identical-byte lock replacement reject without touching those targets. Oversized sparse existing artifact refuses before allocating/reading its contents; fstat.size must equal expected UTF8 document size. Oversized/malformed/extra-field lock refuses before publication, lock size bounded4096bytes. Use real external test-owned sentinel targets to prove unchanged bytes/mode. Owner/baseDir/callback getters and hidden/symbol/foreign-prototype inputs reject without getter reads; honest metadata proxies/owner mutation after first await cannot redirect publication. Foreign fs/proxy exceptions never escape unchanged or with cause/message sentinel.

Low-level faults: native fdWrite wrapped to write at most3bytes; verify complete exact output. Reject0/negative/NaN/fractional/oversized byte counts. Trace actual fd fsync/close/link/unlink/dirfsync to assert ordering; throw at each boundary, including second final link and final directory fsync. No success receipt on any failure; retry may reuse matching already-published bytes and finish missing counterpart only. Keep lock held on failures; publisher never releases it. Cleanup only tracked per-invocation temp files after exclusive creation; never sweep other temp names or remove final artifacts on failure.

- [x] **Step 2: Host RED and freeze.** Corrected focused6:100 missing-module failures only/372 existing pass,248.06s; changed-test lint0. Frozen test SHAbee1e05bfe0c046b570e35bff9741df4b54cf541426c94b66d36c8940f61acaa, existing source/test hash-check0 and protected config9c962 unchanged. Real-file Step1 tests accepted; source-only Step3 follows under the explicit native-edit exception.

- [x] **Step 3: Worker source only (native exception).** Exact module implemented under explicit plan-only direct-edit authority. Input/source capture, held-lock validation, fixed paths, private no-replace publication/readback and static errors verified with frozen new tests and both reviews. Existing source/test/config untouched. Focused6 GREEN472/472,356.06s; final build0/lint0. Full serial suite remains pending Step4.

Publication algorithm (no alternate paths or generic-writer refactor):

```ts
// report comes only from assembleCalibrationStageReport(ownedRequest).
const documents = [[jsonPath,renderNutritionEvalJson(report)], [mdPath,renderNutritionEvalMarkdown(report)]] as const;
for (const [target,text] of documents) {
  // Check unchanged matching lock and validated path components.
  // Existing target: O_NOFOLLOW read fd, fstat regular/nlink1/mode0600/exact byte size;
  // compare every UTF8 byte to text; conflict is fatal, never overwritten.
  // Missing target: exclusive private sibling temp; full valid byte loop;
  // fsync writable fd, close, then link(temp,target) as atomic NO-REPLACE claim.
  // EEXIST race: re-open/verify exact existing bytes, never overwrite.
  // Unlink only this invocation's successfully-created temp; fsync directory.
}
// Reopen both with O_NOFOLLOW, verify full bytes and sha256, fsync open fds,
// close; fsync reports dir and canonical parent after any directory creation.
// Recheck lock; return deeply frozen {report,receipt}, no ledger mutation/clock.
```

Use Node fs.constants.O_NOFOLLOW and fstat on opened artifacts, exclusive temp mode0600 and newly-created directory mode0700; never follow final symlinks. Native missing-file detection may inspect only own-data errno codes (ENOENT/EEXIST) under guarded reflection, never foreign message/stack/cause. Fs errors become fresh static `calibration:report-publication-failed`; structural overrides/request errors `calibration:report-publication-input-invalid`; lock mismatch `calibration:report-publication-lock-invalid`; conflicting artifact `calibration:report-file-tampered`. Existing assembler errors remain its documented fresh static stage-report codes. No blanket authenticated or hostile-same-UID race-safety claim.

- [x] **Step 4: Host GREEN and review.** Final focused472/472,356.06s/build0/lint0/full serial2230pass1existing skip2231,43files,300.17s exit0; whitespace0/old-source-testmanifest0/protectedconfig9c962/source830ba5c9/testbee1e05 unchanged. Fresh native review no Critical/Important and mandatory primary3.8 CODE agree/none; all rulings/deferred minors retained below. No live/APK/Flutter/provider gates: intentionally unused offline module, not parent completion or accuracy/readiness approval.

- [x] **Step 5: Commit/push/task-done/closure.** Implementation01db78ba5a8e62d493f3ccf377a5e6abb830ef71 normalhook0/push0/liveoriginexact, exactly4approvedfiles. Postcommit task-done fullserial2230passed/1existing public-manifest skip2231,43files,315.95s exit0; ledger Task1complete BASEdacfeec..01db78b. All rulings/minors retained below before own-workspace cleanup. Existing branch/worktree kept/no merge/PR. Native exception ends with this plan; parent receipt/gate binding, per-outcome/resumable driver and nativeCLI remain pending; no live/accuracy/readiness/security approval.

Focused:

```bash
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1 test/nutrition-eval/calibration-report-publication.test.ts test/nutrition-eval/calibration-report-assembly.test.ts test/nutrition-eval/calibration-stage-outcomes.test.ts test/nutrition-eval/calibration-file-store.test.ts test/nutrition-eval/report.test.ts test/nutrition-eval/calibration-protocol-session.test.ts
npm --prefix functions run build
npm --prefix functions run lint
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1
```

Expected RED: new publication only, existing suites green. Expected GREEN: focused/all full tests pass, existing public-manifest skip retained; build/lint0. No new accuracy/UI run IDs; visual fields N/A. This plan and exact external PLAN review require user review before editing-worker implementation.

## Research provenance and open gates

Controller research conversation calorix-calibration-stage-controller-20261008:3.8transporttimeout300s recorded, canonical3.7 fallback research agree/none followed by source-confirmed correction.3.7 clarification supports publication-first but still supplied a wrongshortroot, caller-report API and nonexistent reservation getter/sample filter; these are rejected, not implementation instructions. This exact plan preserves CALIBRATION_ROOT and source-bound assembly, uses no caller report/hash and defines partial-file recovery explicitly rather than assuming partial means accepted. Research agreement is not exact PLAN/CODE or production approval. New bounded publication PLAN/CODE conversation calorix-calibration-report-publication-20261008, primary3.8->3.7->3.6 on exact recorded failure. User plan approval and usable editing route remain pending.

Plan self-review amendment: existing file-store.readLock has directory creation/chmod side effects and is not suitable for this module's lock read. Replace the proposed reuse with a private fixed-path descriptor/fd reader, bounded owner bytes and dev/ino continuity. Add missing-root/wrong-mode/no-repair, identical-owner lock replacement and oversized-artifact read-refusal regressions. Main detected this before source; initial pending PLAN response applies to an older draft until the amended exact plan receives agreement.

## Execution checkpoint — 2026-10-08

- **Completion closure:** postcommit task-done2230pass1existing skip/43files/315.95s exit0 and Task1complete ledger recorded. Original source/test/config hashes retained; no application edits after the two accepted code reviews. Complete this tracking-only closure checkpoint/push and remove only this plan's36MiB ignored disk workspace; keep existing branch/worktree. No other plan scratch, shared/tmp or unrelated cache cleanup. All seven rulings/two deferred minors above remain the durable record. ParentTask7 is still incomplete and current native-edit exception expires here.
- Implementation checkpoint01db78ba5a8e62d493f3ccf377a5e6abb830ef71 normalhook0/push0/liveoriginexact; exactly4approvedfiles, protectedconfig untouched/unstaged. Required postcommit task-done full serial Functions pending, so Step5/task completion remains unchecked.
- Final full serial Functions2230passed/1existing public-manifest skip2231,43files,300.17s exit0. Focused472/build0/lint0 and both reviews accepted; Step5 implementation checkpoint/push/liveorigin verification then postcommit full serial task-done still pending. Exact4file allowlist only, source/test/config hashes retained. Existing Vite CJS/SDK project notices are baseline warnings, not new failures.
- Final focused6 exit0:472/472,356.06s; final build0/lint0/source830ba5c9/testbee1e05/config9c962 unchanged. Current Task Step4 full serial Functions running with diskTMPDIR; Step5 checkpoint/push/postcommit task-done pending. Both required reviews green; no live gates for unused offline module (intentional scope, not missing provider evidence).
- Final native whole-plan read-only review gpt-6-astra/high: no Critical/Important; final primarygemini-3.8-flash MCP CODE in calorix-calibration-report-publication-20261008 explicitly agree/MUST_FIXnone/SHOULD_FIXnone for source830ba5c9/testbee1e05. No fallback, mutation or live/security/readiness approval. Final build0/lint0; focused6/full serial still pending.

### Final review rulings and deferred minors

Every ruling below is retained from this plan's ledger; no Critical/Important native review fix pass was needed.

1. Fault assertions follow actual publication phase; unlink-fault JSON is retained because link precedes temp unlink and final artifacts must never be deleted on failure. Cost if wrong: broad retention assertions could miss premature publication; the separate actual fd/link ordering test constrains it.
2. Recovery guarantees matching single-link partial files, not all byte-matching crash remnants. Death between link/temp unlink leaves nlink2, which mandatory hardlink rejection/current-invocation-only cleanup refuses; separately authorized remediation is required. Cost if wrong: interrupted runs may need operator intervention rather than automatic retry.
3. Missing JSON plus conflicting Markdown may create JSON then reject without a receipt or touching Markdown; the approved sequential algorithm does not promise absence of every new file on conflict. Cost if wrong: a valid partial JSON remains requiring later reconciliation.
4. Hostile same-UID directory replacement/authenticated storage are not established under the serialized cooperating-controller boundary. Cost if wrong: hostile local writers can defeat assumptions; no security approval is claimed.
5. Parent receipt acceptance, stage gates, resumable dispatch and CLI remain pending; this unused publication module never advances the ledger. Cost if wrong: confusing byte publication with gate approval bypasses unfinished integration.
6. Production readiness, model accuracy and security approval remain unestablished by offline byte/fs tests and read-only review. Cost if wrong: inflated readiness claims could release an unvalidated tracker.
7. Native review's unexecuted verification list is not a pass; host must collect fresh focused/full/build/lint and MCP agreement. Cost if wrong: unobserved regressions would be reported as verified.

Deferred minors:
- Add hard-link crash-remnant guidance to future controller/operator recovery documentation (limitation is retained here/status; no broader cleanup added).
- Nominal final-directory-fsync fault test triggers at the earlier Markdown directory sync, not the final sync after both readbacks. Code has final-sync failure handling and successful final ordering coverage; more precisely targeted final-sync fault coverage/description remains followup.

- Corrected tests frozen SHAbee1e05: focused RED100 genuine missing-module failures/372existinggreen,248.06s; testlint0/config9c962/old-source-testmanifest0. Native source initial GREEN100/100,54.93s/build0. Changed-file lint found two explicit finally-throw statements; replaced with native read-lock close helper preserving static fresh failure mapping, tests unchanged. Current source SHA830ba5c9; final focused6/full/lint/build and fresh whole-plan/MCP CODE gates pending. No new live inference or release claim.
- **Current explicit exception (2026-10-08T01:56:43Z):** user answered `sure` to the host's request to complete THIS approved publication slice directly while keeping all test/review gates after permitted editing routes failed/session-limited. Native edits to ONLY new module/test and tracking are now authorized for this plan; exception ends at this plan's completion and does not cover parent tasks. Functional scope/architecture unchanged. Tiny phase-correct tests, corrected RED/lint/freeze, source, GREEN/full/native/MCP reviews and commit/push/task-done remain mandatory.

- User approved this exact functional plan after primarygemini-3.8-flash PLAN agree/MUST_FIXnone/SHOULD_FIXnone for original SHA96dcd84c. Ordinary worker editing policy applies; no host application-edit exception carries over or is inferred from approval.
- Task1 BASEdacfeecb220d46c1e06a29cd731f2f0a48733a29 on existing fix/scan-photo-flow-viewer branch. No shared-task interfaces. Tests-only paidclaude-sonnet-5 actual route worked after all documented stronger-route failures. No existing source/test/package/config edits. Source publication module remains absent; steps1–5 remain unchecked.
- Independent full Functions baseline2130passed/1existing public-manifest skip2131,42files,393.14s/exit0. Latest focused6 existingfive372green plus100 deliberate missing-publication failures,341.38s/exit1; no fixture/reflection/type/timeouts. Current newtest1031lines SHAa8f7f5e040e7e8340761622dc74faa36a8f694368bc65530101d345732853add, changed-test ESLint0. Draft is local/untracked/uncommitted; final source checkpoint still requires all original gates.
- A tiny tests-only correction is required before exact final RED/freeze: the all-six-hook foreign-error table must retain final JSON after an unlink-hook failure rather than expect universal absence. Also move boolean identity check before Chai instance checks. Paid continuation failed before patch: session_limit, exact `You've hit your session limit · resets 5:20am (Europe/Zurich)` at2026-10-08T01:47:27Z. Literal /usage exit0 at01:50:29Z confirms session100%/reset05:19Zurich, weekly38%/resetOct13 02:59Zurich; extra-spend status unreported. Do not infer whole-account exhaustion.
- **Task1 Ruling:** fault assertions follow actual publication phase; unlink-fault final JSON is retained rather than universally absent because final link precedes temp unlink and the contract forbids deleting final artifacts on failure. **Cost if wrong:** an overly broad retention assertion might miss premature publication; the separate fd/link ordering test constrains that sequence. Architecture unchanged.
- Current Task blocked at required editing route; continue when worker capacity returns or user explicitly grants a NEW narrow native-edit exception. Next permitted edit is the tiny newtest correction, then approved focused6/lint, freeze, source-only worker, GREEN/reviews/commit/push/task-done. No source implementation, CODE or fresh whole-plan native review, live dispatch or production qualification yet. Keep27MiB task workspace on ext4 while incomplete; all owned processes collected, no shared/tmp sweep. Protected user.mcp SHA9c9622f5dfd38f8eed1ac0d1b69034dc5399e77481600030148547235b06a688 unchanged/unstaged; Functions tree251bff8a097421e07c21dd6b4b73d82fb0fc9de4 unchanged.
