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

- [ ] **Step 1: Write real-file tests only.** New local fixture prepares actual committed assets with injected clean Git/owner identity, creates actual file store/strict ledger and report plan, acquires lock, records token plus LOW/MEDIUM preflight image terminals, and keeps the lock held. Build journals exactly like existing assembly fixtures; do not import a test module with side-effecting describes or modify its private fixture. Minimal fixture setup:

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

- [ ] **Step 2: Host RED and freeze.** Run focused command below and changed-test ESLint from functions cwd. Existing five suites must pass; all new failures must be real missing-publication behavior, not fixture defects. Correct fixtures through editing worker before source, then freeze test/source/config hashes.

- [ ] **Step 3: Worker source only.** Implement exact module interface and closed input capture. Before first await capture baseDir/owner and request callbacks; assemble once through existing assembler so all source strings and snapshot are owned. Verify actual matching stage lock before file effects. Render owned JSON/Markdown; validate fixed canonical path components/regular artifacts without symlink traversal, create private reports directory only if absent. Existing wrong permissions/hardlinks/nonregular artifacts fail, not repaired.

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

- [ ] **Step 4: Host GREEN and review.** Run focused/build/lint/full serial, whitespace and protected-config checks. Obtain final native whole-plan read-only review under executing-plans, handle Important/Critical in one tests-first pass, defer Minor; mandatory same-publication-workstream Antigravity CODE agree/none. No live/APK/Flutter/emulator/provider gates for unused offline module; parent full eval fixtures/test:verify/dispatch remain pending.

- [ ] **Step 5: Commit/push/task-done/closure.** Update status/plan, commit module/newtest/tracking only (`Publish durable calibration stage reports`), push and verify liveorigin exact. Postcommit task-done full serial before checked completion. Preserve every ruling/minor before cleaning only this plan's workspace. Keep branch/worktree. Next parent ledger receipt+gate binding, then per-outcome runner/resumable dispatch, then nativeCLI; not a new live/accuracy/readiness claim.

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
