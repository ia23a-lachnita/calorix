# Native Calibration Report Artifact Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for this single prerequisite. Preserve the approved host-led workflow: ordinary strongest-first workers edit, host verifies/reviews/commits/pushes, one fresh whole-plan reviewer. No inherited native application-edit exception.

**Goal:** Independently read the actual canonical published JSON/Markdown and verify both against source-bound synchronous reconstruction, without admitting receipts to the ledger or evaluating stage gates.

**Architecture:** A new standalone asynchronous factory captures the native path/owner and prepares the existing owned reconstructor once. Its frozen synchronous verifier reconstructs the expected report from a closed request, inspects actual files while checking the cooperative lock, and returns the existing publication result/receipt types with hashes from verified actual bytes. Keep the audited publisher, reconstructor, ledger, codecs and existing tests unchanged.

**Tech Stack:** Node20 native fs/crypto/path, existing TypeScript/Zod/Vitest; no dependencies, native addon, executable, provider or runtime command added.

**Spec:** Approved `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`, parent `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md` Task7Steps4–7. Completed reconstruction prerequisite `7ca7d87`/closure`2a5e5c2` supplies the pure seam. This plan does not complete parentTask7 or authorize live Tasks8–10.

## Global Constraints

- Fixed provider identity remains Vertex `calorix-xurschnell` / `us` / `gemini-3.8-flash` / APIv1. Zero nutrition provider/client/network/device/Firebase/deployment calls; no new2.5 request, fallback, defaults, prompt/schema/scorer/normalizer/Review changes.
- Exactly four changed files: NEW `functions/src/nutrition-eval/calibration-report-artifact-verification.ts`, NEW `functions/test/nutrition-eval/calibration-report-artifact-verification.test.ts`, this plan, `docs/implementation-status.md`. No package/config/fixture/existing source/test edits.
- Existing assembler SHA`0e0f827a6e64c39e48c3d6423216c604c2f320ba3fb9f6d800aa911c7176d419`, publisher`830ba5c9b4b9d0ed0e8b3566d4c32d838c76a8e8ceb8606c25ddd2e32e61c323`, reconstructor test`9bffae3a53203d2424734101fe887d575ed1bab90ec43ddfd83b5b63121ec6c1`, existing92assembler test`f1f79ff8b8b9b6e83850ac03364f920fc635ccd09328e168a17187c18c2f708a`, existing100publisher test`bee1e05bfe0c046b570e35bff9741df4b54cf541426c94b66d36c8940f61acaa`, and old eight digest pairs remain byte-identical.
- User `.mcp.json` SHA`9c9622f5dfd38f8eed1ac0d1b69034dc5399e77481600030148547235b06a688`: no reading/diffing/editing/staging/restoring; SHA-only checks permitted.
- Use existing `CALIBRATION_ROOT` export, resolved once against captured baseDir. Exact root is `.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/`, never an abbreviated `v1/` substitute. Filenames are only `reports/<stage>-<low|medium>.json` and `.md`. No caller path/hash/report/receipt/read hook accepted.
- Only root/reports require exact0700. Ordinary ancestors may0755; require directory/non-symlink shape and observed inode stability, never chmod caller directories. Lock/artifacts require regular0600/single-link files. Lock bytes bounded4096; artifact allocation bounded by exact expected rendered length, not untrusted stat size.
- Factory performs zero filesystem/clock/network operations. Verification uses native lstat/open/fstat/read/close/crypto only; no writes, mkdir/chmod, fsync, link/unlink/rename, random, tmp files, ledger readers, callbacks, clock or provider. OS-level read atime changes are not promised absent.
- Both lock and artifacts open with `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`, never create/write/truncate flags. Required nonzero nofollow/nonblock constants must exist or preparation fails before fs. No public fs overrides: delegated native mocks are test-only.
- Cooperative single-tenant private-lock/local-filesystem model. Matching owner/inode is not flock, `/proc` liveness, a portable capability or hostile same-UID authenticity. Path-based nofollow protects the final component only; ancestor rechecks and repeated byte checks are not atomic pair snapshots or race-free hostile-writer protection. No NFS/hostile mount/kernel/security-release guarantee.
- Future core integration must inject the prepared verifier, never statically import this reader/assembler into `calibration.ts`. Type-only direct imports alone do not remove assembler->bootstrap->ledger runtime dependencies. Reusing the canonical root constant here creates no cycle while the core does not import the reader.
- No receipt admission, fifth opt-in ledger option/events, gate/selection enforcement, durable acceptance seal, controller/CLI, compatibility changes to strict3arg/4arg/preflight sessions or live dispatch. Verified bytes are not a passing gate or accuracy proof; future admission must verify against its authoritative captured snapshot again.
- Keep existing branch/checkout `fix/scan-photo-flow-viewer`, no merge/PR. Plan-owned ignored scratch/TMPDIR must be verified ext4; serial Vitest maxWorkers1/minWorkers1. No reopening completed reconstruction scratch. Normal commit/push and postcommit task-done required.

## Review Focus

1. Caller path/owner/files/identity/first-case mutation across preparation suspension: capture primitives synchronously; returned closure never recaptures or retains caller metadata and never freezes caller objects.
2. Checking only caller hashes or parsed report validity: verify actual bytes against source-bound reconstruction, including same-size alterations, profile/sample-copy drift and both documents; derive receipt hashes from verified bytes.
3. Lock/artifact replacement during reads: compare each artifact fd to its own lstat, lock to its held lock inode, and recheck directories/path bindings while retaining all three fds; never confuse lock and artifact identity.
4. Malicious special files and native faults: nonblocking opens for lock/artifacts; reject symlinks/hardlinks/modes/sizes, correct short-read offsets, static causeless errors and complete descriptor cleanup even after a close failure.
5. Scope confusion: immutable verification result is not durable publication, stage success, selection enforcement or portable receipt admission; source INVALID/INCOMPLETE errors precede all native fs effects and factory performs none.

## Exact Interfaces and Error Contract

New module exports:

```ts
export interface VerifyCalibrationStageReportArtifactsParams {
  readonly stage: StageName;
  readonly profile: CalibrationProfile;
  readonly snapshot: CalibrationStageReportSnapshot;
}
export interface CalibrationStageReportArtifactVerifier {
  readonly verify: (params: unknown) => Readonly<CalibrationReportPublicationResult>;
}
export async function prepareCalibrationStageReportArtifactVerifier(
  context: unknown,
): Promise<Readonly<CalibrationStageReportArtifactVerifier>>;
```

Import `CALIBRATION_ROOT` as the existing canonical constant; other calibration types and publication result/receipt are type-only. Runtime preparation consumes `prepareCalibrationStageReportReconstructor(context:unknown)` from the unchanged assembler. Do not duplicate its calculator or add another asset verifier.

Factory context has EXACT6 enumerable own-data fields: baseDir/identity/owner/firstDevelopmentCaseId/report/files; no hidden/symbol/accessor/undefined/foreign-prototype fields. Capture baseDir string (nonblank/noNUL; resolve before await) and owner through exact5field descriptor capture, with identical publisher owner rules: nonblank hostname/bootId, safe integer pid/startTicks>0, exact valid millisecond UTC acquiredAt. Call the existing factory immediately with the owned outer record so all source primitives are captured before suspension; preserve its source failure codes. Ignore report metadata completely. Return a frozen verifier built by a separate module-scope constructor closing only owned root/owner/reconstructor, not the original context/files/metadata.

Verify request has EXACT3 enumerable own-data fields stage/profile/snapshot. Reject malformed request or invalid enums with fresh causeless `calibration:report-artifact-input-invalid` before snapshot reflection/native fs. Invoke the trusted reconstructor next; preserve `calibration:stage-report-invalid` and `calibration:stage-report-incomplete` unchanged and do zero fs on those failures.

Native failures use fresh causeless static codes only:

- root/ancestor shape/mode/observed inode drift, lock owner/bytes/shape/mode/link/size/missing/replacement: `calibration:report-artifact-lock-invalid`;
- reports directory or artifact shape/mode/link/size/missing/inode drift/bytes/short-read mismatch: existing `calibration:report-file-tampered`;
- other artifact open/fstat/read errors, rendering/allocation or close failure: `calibration:report-artifact-read-failed`.

Use private LOCK/TAMPER/FAILED symbols for native-phase classification, comparing only identity; never inspect a foreign message/cause/stack/prototype. Lock operation failures always map LOCK. Missing artifact lstat maps TAMPER by reading only a native errno's own data `code` descriptor; other artifact lstat failures map FAILED. Source reconstruction is outside this native catch so its static errors are not relabeled. A primary native failure survives cleanup failures; any close failure on an otherwise successful call changes success to READ_FAILED. Always attempt closure of every acquired descriptor; no blind retry after close (Linux may already have released it).

## Task 1: Owned preparation and synchronous native artifact reader

**Consumes:** exact prepared reconstructor, genuine bootstrap/legacy4arg ledger snapshots, unchanged publisher, existing canonical root/result types/renderers.

**Produces:** immutable sync actual-byte verification result only. Parent receipt/gate/controller integration remains a separate task.

- [ ] **Step1: Worker NEW TEST ONLY.** Strongest-first ordinary editing route. No source file yet. Add local real-file fixture, do not import existing test modules (their describes execute). Test setup consumes existing source functions; all files are inside tracked task disk mkdtemp directories cleaned afterEach/afterAll. File-local60s test/hook allowance only, no config edits. Here is the complete preflight fixture body (normal imports are existing native fs/path/url/crypto/Vitest and the named source modules):

```ts
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const dirs: string[] = [];
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
async function fixture(full = false) {
  const dir = mkdtempSync(resolve(tmpdir(), 'report-artifact-'));
  dirs.push(dir);
  const context = await prepareCalibrationBootstrapContext({
    baseDir: dir,
    readGitState: () => ({headCommit:'a'.repeat(40),implementationCommit:'b'.repeat(40),functionsTreeId:'c'.repeat(40),dirtyPaths:[]}),
    readCommittedFile: path => readFileSync(resolve(repo,path),'utf8'),
    readOwner: () => ({hostname:'artifact-fixture',bootId:'artifact-boot',pid:44,startTicks:44,acquiredAt:'2026-10-09T00:00:00.000Z'}),
  });
  const native = createFileCalibrationLedgerDeps(dir);
  const effects = {append:0,fsync:0,clock:0};
  let ticks = 0;
  const ledger = createProtocolCalibrationLedger({ ...native,
    appendLedgerEvent: e => { effects.append++; native.appendLedgerEvent(e); },
    fsyncLedgerFile: () => { effects.fsync++; native.fsyncLedgerFile(); },
    fsyncLedgerDir: () => { effects.fsync++; native.fsyncLedgerDir(); },
    fsyncJournalFile: () => { effects.fsync++; native.fsyncJournalFile(); },
    fsyncJournalDir: () => { effects.fsync++; native.fsyncJournalDir(); },
    nowIso: () => { effects.clock++; return new Date(Date.UTC(2026,9,9)+ticks++*1000).toISOString(); },
  }, context.identity, selected => deriveCanonicalAllowedKeys(context.files,selected), {
    getReportOutcomePlan: selected => deriveCanonicalReportOutcomePlan(context.files,selected),
  });
  ledger.acquireLock(context.owner);
  const token = {kind:'token_count',stage:'preflight',caseId:context.firstDevelopmentCaseId,model:'gemini-3.8-flash'} as const;
  ledger.reserveTokenCount(token); ledger.completeTokenCount(token,42);
  for (const profile of ['LOW','MEDIUM'] as const) {
    const key = {stage:'preflight',profile,caseId:context.firstDevelopmentCaseId,sampleIndex:1} as const;
    const four = {kcal:120,proteinG:10,carbsG:0,fatG:8};
    const prediction = captureCalibrationReportPrediction({parseStatus:'success',source:'meal',...four,
      confidence:0.8,basis:'portion',amount:1,unit:'portion',decision:'needs_review',reviewReasons:[],
      latencyMs:17,sampleIndex:1,cached:false,diagnostics:{rawNutrients:four,detectedItemCount:1,
        estimatedTotalMassG:90,declaredBasis:'portion',declaredAmount:1,declaredUnit:'portion'}});
    ledger.reserve(key);
    if (profile === 'LOW') ledger.pinModelVersion('gemini-3.8-fixture-pin');
    ledger.complete(key, ledger.appendResultJournal({key,normalizedPrediction:{...four,estimatedTotalMassG:90},
      predictionHash:sha256(JSON.stringify(four)),analysisLatencyMs:17,errorCategory:'none',
      responseModelVersion:'gemini-3.8-fixture-pin',reportPrediction:prediction}));
  }
  const root = resolve(dir,CALIBRATION_ROOT), reports = resolve(root,'reports');
  const snapshots = {LOW:ledger.getStageReportSnapshot('preflight','LOW'),MEDIUM:ledger.getStageReportSnapshot('preflight','MEDIUM')};
  const allSnapshots = new Map<string,CalibrationStageReportSnapshot>([
    ['preflight/LOW',snapshots.LOW],['preflight/MEDIUM',snapshots.MEDIUM],
  ]);
  const save = (stage:StageName,profile:CalibrationProfile) => allSnapshots.set(`${stage}/${profile}`,ledger.getStageReportSnapshot(stage,profile));
  const terminal = (key:ReservationKey,mode:'meal'|'label') => {
    const four = {kcal:120,proteinG:10,carbsG:0,fatG:8};
    const p = captureCalibrationReportPrediction({parseStatus:'success',source:mode,...four,
      confidence:0.8,basis:'portion',amount:1,unit:'portion',decision:'needs_review',reviewReasons:[],
      latencyMs:17,sampleIndex:key.sampleIndex,cached:false,
      ...(mode==='meal'?{diagnostics:{rawNutrients:four,detectedItemCount:1,estimatedTotalMassG:90,
        declaredBasis:'portion',declaredAmount:1,declaredUnit:'portion'}}:{})});
    ledger.reserve(key);
    ledger.complete(key,ledger.appendResultJournal({key,normalizedPrediction:{...four,...(mode==='meal'?{estimatedTotalMassG:90}:{})},
      predictionHash:sha256(JSON.stringify(four)),analysisLatencyMs:17,errorCategory:'none',
      responseModelVersion:'gemini-3.8-fixture-pin',reportPrediction:p}));
  };
  if (full) {
    // Legacy fixture transitions are NOT measured gate-pass evidence.
    ledger.completeStage('preflight',{stage:'preflight',passed:true,completedStages:[]});
    for (const row of deriveCanonicalReportOutcomePlan(context.files).filter(r=>r.key.stage==='development')) terminal(row.key,'meal');
    save('development','LOW'); save('development','MEDIUM');
    ledger.recordProfileSelection('MEDIUM','default_medium_tie_breaker',{stage:'development',passed:true,completedStages:['preflight']});
    ledger.completeStage('development',{stage:'development',passed:true,completedStages:['preflight']});
    const expanded = deriveCanonicalReportOutcomePlan(context.files,'MEDIUM');
    for (const row of expanded.filter(r=>r.key.stage==='validation')) terminal(row.key,'meal');
    ledger.completeStage('validation',{stage:'validation',passed:true,completedStages:['preflight','development']});
    save('validation','MEDIUM');
    for (const row of expanded.filter(r=>r.key.stage==='benchmark')) {
      if (row.scanMode!=='barcode') terminal(row.key,row.scanMode);
      else ledger.recordNonReservationResult({key:row.key,reason:'barcode',prediction:{parseStatus:'failure',
        source:'barcode',decision:'error',failureCategory:'product',failureCode:'off_product_invalid',
        sampleIndex:row.key.sampleIndex,cached:false,latencyMs:17}});
    }
    save('benchmark','MEDIUM');
  }
  const published = {} as Record<CalibrationProfile, Readonly<CalibrationReportPublicationResult>>;
  const allPublished = new Map<string,Readonly<CalibrationReportPublicationResult>>();
  for (const [slot,snapshot] of allSnapshots) {
    const result = await publishCalibrationStageReport({stage:snapshot.stage,profile:snapshot.profile,context,readSnapshot:()=>snapshot});
    allPublished.set(slot,result);
    if (snapshot.stage==='preflight') published[snapshot.profile] = result;
  }
  const path = (profile:CalibrationProfile,ext:'json'|'md',stage:StageName='preflight') => resolve(reports,`${stage}-${profile.toLowerCase()}.${ext}`);
  const state = () => Object.fromEntries(['ledger.json','journal.json','lock.json'].map(name => [name,readFileSync(resolve(root,name),'utf8')]));
  return {dir,root,reports,context,ledger,effects,snapshots,published,allSnapshots,allPublished,path,state};
}
type Prepared = {readonly verify:(params:unknown)=>Readonly<CalibrationReportPublicationResult>};
type Prepare = (context:unknown)=>Promise<Readonly<Prepared>>;
async function loadPrepare():Promise<Prepare> {
  const path = '../../src/nutrition-eval/calibration-report-artifact-verification';
  let module:Record<string,unknown>;
  try { module = await import(/* @vite-ignore */ path) as Record<string,unknown>; }
  catch { throw new Error('artifact-verifier-module-missing'); }
  if (typeof module.prepareCalibrationStageReportArtifactVerifier !== 'function') throw new Error('artifact-verifier-module-missing');
  return module.prepareCalibrationStageReportArtifactVerifier as Prepare;
}
it.each(['LOW','MEDIUM'] as const)('verifies actual preflight/%s and returns immutable actual-byte hashes',async profile => {
  const fx = await fixture(), prepare = await loadPrepare(), ready = await prepare(fx.context);
  const before = fx.state(), effects = {...fx.effects};
  const result = ready.verify({stage:'preflight',profile,snapshot:fx.snapshots[profile]});
  expect(result instanceof Promise).toBe(false);
  expect(Object.isFrozen(ready)).toBe(true);
  expect(result).toEqual(fx.published[profile]);
  expect(result.receipt.jsonSha256).toBe(sha256(readFileSync(fx.path(profile,'json'))));
  expect(result.receipt.markdownSha256).toBe(sha256(readFileSync(fx.path(profile,'md'))));
  expect(fx.state()).toEqual(before); expect(fx.effects).toEqual(effects);
});
it('one prepared reader verifies all six actual stage/profile pairs, without evaluating failure gates',async () => {
  const fx = await fixture(true), prepare = await loadPrepare(), ready = await prepare(fx.context);
  expect([...fx.allSnapshots.keys()]).toEqual(['preflight/LOW','preflight/MEDIUM','development/LOW','development/MEDIUM','validation/MEDIUM','benchmark/MEDIUM']);
  const before = fx.state(), effects = {...fx.effects};
  for (const [slot,snapshot] of fx.allSnapshots) {
    const result = ready.verify({stage:snapshot.stage,profile:snapshot.profile,snapshot});
    expect(result).toEqual(fx.allPublished.get(slot));
    expect(result.receipt.jsonSha256).toBe(sha256(readFileSync(fx.path(snapshot.profile,'json',snapshot.stage))));
    expect(result.receipt.markdownSha256).toBe(sha256(readFileSync(fx.path(snapshot.profile,'md',snapshot.stage))));
    if (snapshot.stage==='benchmark') {
      const barcode = result.report.cases.filter(row=>row.prediction.source==='barcode');
      expect(barcode).toHaveLength(12);
      expect(barcode.every(row=>row.prediction.parseStatus==='failure')).toBe(true);
    }
  }
  expect(fx.state()).toEqual(before); expect(fx.effects).toEqual(effects);
});
```

Add recursive deep-freeze assertions on result and independence/reuse: LOW/MEDIUM/LOW returns distinct report/result/receipt objects, stable prior bytes, no snapshot/caller freezing. Fake fixture identities are not real run IDs or provider evidence.

Required fault table, exercised as real behavior tests (every case invokes the new API, no absence-pass canary):

1. Factory exact6field/context and strict5field owner faults: missing/extra/hidden/symbol/accessor/presentundefined/foreign prototype, wrong baseDir type/blank/NUL, owner type/ISO/safe integer faults; honest descriptor proxies accepted, zero property Get/coercion. Factory source corruption/identity/firstcase faults preserve STAGE_REPORT_INVALID. Ignored report nested proxies never traversed/frozen/retained. Mutate baseDir/owner and source files/identity/firstcase before await resolves and afterward: original owned values prevail; caller objects remain mutable.
2. Verify exact3field faults and invalid enums reject INPUT before snapshot ownKeys/Get. No extra receipt/path/hash/report/context/readSnapshot/override accepted. Invalid/incomplete/mismatched snapshots use existing codec/reconstructor policy and preserve INVALID/INCOMPLETE with zero native reads/opens; JSON clones of the genuine snapshot provide each coherent mutation (pending1 must also adjust reserved/completed coherently).
3. Missing either artifact/reports directory, wrong modes (including special bits), symlink/directory/FIFO artifact, hardlink/nlink2, empty/truncated/oversized byte size, malformed/invalid UTF8, same-size altered numeric/identity bytes, copied MEDIUM bytes at LOW path, JSON-only or MD-only drift: TAMPER, never overwrite/repair/create. Oversized guard proves no buffer/read allocated from attacker size. Ordinary owned fixture baseDir0755 remains accepted while root/reports0700 remain required.
4. Root/ancestor symlink/non-directory/observed inode replacement and root badmode; missing/oversized/nonregular/symlink/hardlinked/badmode/malformedUTF8/JSON/extraowner/wrongowner lock; lock deleted, replaced or owner changed persistently during reads: LOCK. Tests never require live process/PID checks or flock. Different valid artifact inodes from lock must succeed; artifact fd replacement between lstat/open must fail against its own lstat, not lock.
5. Delegated native `vi.mock('node:fs', importOriginal)` race/fault tests: after genuine target lstat, replace JSON/MD/lock with another inode/symlink/FIFO; open flags include nonblock/nofollow and no write/create. Use real `mkfifo` via argument-array execFileSync on ONLY owned fixture path for FIFO race; no mocked FIFO stats masquerading as real files, no hanging read. Track every acquired fd/close and check all are released; close-fault injection genuinely closes then throws, and must not prevent attempts on other fds.
6. Force native readSync to deliver bounded short chunks using the real fd and actual readSync; verify offsets/positions/remaining lengths for every initial and final read. Zero/negative/fractional/oversized return before full length is TAMPER. Foreign open/fstat/read/close exceptions become fresh causeless READ_FAILED (lock operations LOCK), zero error traps; failures do not leak paths/content. Persistence of primary LOCK/TAMPER despite close failure; otherwise close failure prevents success.
7. Recheck both still-open artifact fds and path bindings before final reread. Mutate/truncate/replace first document during second-document reading and keep alteration in place: rejected, with stable other file and zero verifier writes. Recheck canonical directory identities and held lock after final reads. No hostile ABA/atomic-pair guarantee is asserted.
8. Arm importOriginal delegate guards ONLY after fixture setup/module loading/capture preparation, disarm in finally. Factory window blocks ALL fs funcs including promises; verify permits only lstatSync/openSync/fstatSync/readSync/closeSync and blocks mutations/fsync/asyncfs. Global fetch dispatch and Date.now counters remainzero; ledger/journal/lock bytes, modes/inodes/artifact names/bytes and ledger effect counters unchanged (ignore OS atime). Fault injection's deliberate native mutations are separately owned test actions, not counted as verifier writes. Do not vi.spyOn nonconfigurable fs ESM exports or weaken guards/assertions/config.

- [ ] **Step2: Host RED/freeze.** Read the entire new test, witness valid existing publisher fixtures, then independently run the five-suite focused command below and changed-test ESLint. Existing363 tests pass; all new verifier behavior cases fail only deliberate artifact-verifier-module-missing, not compile/fixture/RPC failure. Fix test defects via worker BEFORE source. Freeze exact newtest hash and all protected hashes; no new source until accepted RED. No baseline digest regeneration.

- [ ] **Step3: Worker NEW SOURCE ONLY.** Implement exact interfaces and factory above. Use existing publisher's descriptor/owner/bounded-read policy as provenance, but independent reader-only helpers in the new module; do not export/import its private helpers, refactor it or apply nonblock changes to the old writer. Production flow and helper contracts are explicit below:

```ts
// All helper names below are private to the NEW source module.
type Failure = typeof LOCK | typeof TAMPER | typeof FAILED;
type Inode = {readonly dev:number;readonly ino:number};
type Directory = Inode & {readonly path:string;readonly privateMode:boolean;readonly failure:Failure};
type Opened = Inode & {readonly path:string;readonly fd:number;readonly size:number;readonly mtimeMs:number;readonly ctimeMs:number};
type Document = Opened & {readonly expected:Buffer;actual:Buffer};
const LOCK = Symbol('lock-invalid'), TAMPER = Symbol('file-tampered'), FAILED = Symbol('artifact-read-failed');
const INPUT = 'calibration:report-artifact-input-invalid';
function fatal(failure:Failure):CalibrationFatalError {
  return new CalibrationFatalError(failure===LOCK?'calibration:report-artifact-lock-invalid':
    failure===TAMPER?'calibration:report-file-tampered':'calibration:report-artifact-read-failed');
}
function createVerifier(root:string,owner:Readonly<CalibrationOwner>,ready:Readonly<CalibrationStageReportReconstructor>):Readonly<CalibrationStageReportArtifactVerifier> {
  return Object.freeze({verify:(params:unknown):Readonly<CalibrationReportPublicationResult> => {
    const request = ownRecord(params,['stage','profile','snapshot']);
    const stage = request.stage, profile = request.profile;
    if ((stage!=='preflight'&&stage!=='development'&&stage!=='validation'&&stage!=='benchmark') ||
        (profile!=='LOW'&&profile!=='MEDIUM')) throw new CalibrationFatalError(INPUT);
    const report = ready.reconstruct({stage,profile,snapshot:request.snapshot});
    const fds = new Set<number>();
    let failure:Failure|undefined, result:Readonly<CalibrationReportPublicationResult>|undefined;
    try {
      const reports = resolve(root,'reports');
      const directories = captureDirectories(root,reports);
      const held = openLock(root,owner,fds);
      const documents:Document[] = [];
      for (const [ext,text] of [['json',renderNutritionEvalJson(report)],['md',renderNutritionEvalMarkdown(report)]] as const) {
        assertDirectories(directories); checkLock(root,owner,held,fds);
        documents.push(openDocument(resolve(reports,`${stage}-${profile.toLowerCase()}.${ext}`),Buffer.from(text,'utf8'),fds));
      }
      for (const document of documents) {
        assertDirectories(directories); checkLock(root,owner,held,fds);
        assertDocument(document);
        document.actual = readBounded(document.fd,document.expected.length,TAMPER);
        if (!document.actual.equals(document.expected)) throw TAMPER;
        assertDocument(document);
      }
      assertDirectories(directories); checkLock(root,owner,held,fds);
      for (const document of documents) assertDocument(document);
      result = Object.freeze({report,receipt:Object.freeze({stage,profile,runId:report.runId,
        jsonSha256:sha256(documents[0]!.actual),markdownSha256:sha256(documents[1]!.actual)})});
    } catch (error) { failure = error===LOCK?LOCK:error===TAMPER?TAMPER:FAILED; }
    finally {
      for (const fd of Array.from(fds).reverse()) {
        fds.delete(fd); // Mark attempted before close; never blind-retry.
        try { closeSync(fd); } catch { failure ??= FAILED; }
      }
    }
    if (failure!==undefined) throw fatal(failure);
    return result!;
  }});
}
export async function prepareCalibrationStageReportArtifactVerifier(context:unknown):Promise<Readonly<CalibrationStageReportArtifactVerifier>> {
  const captured = ownRecord(context,['baseDir','identity','owner','firstDevelopmentCaseId','report','files']);
  if (typeof captured.baseDir!=='string'||captured.baseDir.trim().length===0||captured.baseDir.includes('\0')||
      typeof constants.O_NOFOLLOW!=='number'||constants.O_NOFOLLOW<=0||
      typeof constants.O_NONBLOCK!=='number'||constants.O_NONBLOCK<=0) throw new CalibrationFatalError(INPUT);
  const root = resolve(captured.baseDir,CALIBRATION_ROOT);
  const owner = captureOwner(captured.owner);
  const ready = await prepareCalibrationStageReportReconstructor(captured);
  return createVerifier(root,owner,ready);
}
```

Implement the following named helpers with these exact operations; these are constraints, not injectable callbacks:

- `ownRecord(value:unknown,fields:readonly string[]):Record<string,unknown>`: descriptor-only exact capture like the publisher, fresh INPUT on any failure, no foreign error inspection. `captureOwner` applies the exact5field publisher scalar rules and freezes ONLY the newly owned record. `sha256(Buffer):string` uses native crypto.
- `safeInode(stat):boolean`: require safe nonnegative integer dev/ino before equality (fail closed instead of rounding huge filesystem identities). `sameInode` compares those two scalar values only. `privateRegular` requires native isFile(), nlink1, exact0600 and safe nonnegative size; optional size must match exactly.
- `captureDirectories(root,reports):Directory[]`: start at `parse(root).root`, lstat each resolved component through root, then reports. Each must be directory/non-symlink/safeInode; root/reports exact0700 only. Capture owned path/dev/ino/privateMode/failure records. Any root/ancestor inspect failure maps LOCK; reports inspect failure maps TAMPER. `assertDirectories` repeats these checks and equality against each captured inode. This detects observed swaps, not malicious ABA.
- `openLock(root,owner,fds:Set<number>):Opened`: lstat canonical lock, regular0600/nlink1/safe size<=4096 and finite mtimeMs/ctimeMs, open with readonly|nofollow|nonblock. Register fd immediately after successful open; fstat must match that lock's own lstat, size and modification/change times, then bounded native reads with explicit offsets, fatal UTF8 decode, JSON parse and exact captured-owner equality. Recheck fd metadata after reading; any lock operation failure maps LOCK, without inspecting foreign errors. Return owned path/fd/dev/ino/size/mtimeMs/ctimeMs. `checkLock` validates original held fd still regular/same size/inode/times, opens/re-reads current canonical lock with same owner policy and compares its inode/metadata to held lock. Remove its temporary check fd from the Set BEFORE attempting close. Preserve an already-observed LOCK if that close fails, otherwise throw FAILED; every other registered fd still reaches outer cleanup. No blind second close attempt.
- `readBounded(fd,size,failure):Buffer`: allocate ONLY after validated bound, offset0; each readSync(fd,buffer,offset,size-offset,offset) must return safe integer1..remaining; advance until complete. Zero before expected length or invalid count throws the supplied private failure.
- `openDocument(path,expected,fds:Set<number>):Document`: missing lstat ->TAMPER (native own-data errno only), other lstat fault ->FAILED; reject nonregular/link/mode/size before read or allocation. Require finite native mtimeMs/ctimeMs. Open readonly|nofollow|nonblock and register immediately; fstat matches file's own lstat/safe identity/exact expected length/times, not lock. Read bounded and compare exact expected bytes, then recheck original metadata. Keep fd open through pair verification and return owned records/actual buffer.
- `assertDocument(document)`: recheck that still-open fd and its current canonical lstat remain private regular, exact expected size and original dev/ino/mtimeMs/ctimeMs, before/after final bounded reread and for BOTH documents after the final lock check. Artifact native operation faults map FAILED; observed invalid shape/size/link/mode/identity/time change ->TAMPER. Native time equality detects observed changes, not every hostile ABA/finite-resolution race. Never return actual unexpected bytes or paths.

The owned descriptor Set registers only successful opens, removes each descriptor BEFORE close, and attempts every remaining descriptor on any error. Never reopen during final cleanup or blind-retry a failed close. Preserve first native LOCK/TAMPER/FAILED; close failure on a previously successful call prevents result return. Do not return a receipt until all required reads/checks and successful closes have completed. No user-controlled factory/closure callbacks or overrides.

- [ ] **Step4: Host GREEN/reviews.** Inspect entire new source and actual scope/protected hashes. Run newfile/focused5/build/lint/full serial, whitespace and no-side-effect checks. Old eight render digest pairs and all363 existing cases stay green without editing any existing fixture. Fresh whole-plan read-only review via most-capable native reviewer; Critical/Important one test-first fix pass, Minor deferred/recorded. Mandatory exact CODE Antigravity agree/MUST_FIXnone in this workstream. No provider/APK/Flutter/live/emulator gates for unused offline reader; parent test:verify/live146 still pending.

- [ ] **Step5: Commit/push/task-done/closure.** Update tracking/rulings/minors, commit exactly four allowed files with `Verify published calibration report artifacts`, normal hooks/push/liveorigin equality. Postcommit task-done full serial BEFORE task complete checkbox. Persist every ruling/minor before trashing ONLY this plan's scratch; keep branch/checkout/noPR/noMerge. Next separately reviewed fifth-opt-in receipt and measured-gate binding, then controller/CLI/live protocol. No general calorie-accuracy/release/security approval.

## Verification Commands and Expected Results

```bash
# Set TMPDIR to this plan's verified disk-backed tmp for every command.
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1 test/nutrition-eval/calibration-report-artifact-verification.test.ts test/nutrition-eval/calibration-report-reconstructor.test.ts test/nutrition-eval/calibration-report-assembly.test.ts test/nutrition-eval/calibration-report-publication.test.ts test/nutrition-eval/report.test.ts
# RED-only changed-test lint from functions cwd:
node_modules/.bin/eslint test/nutrition-eval/calibration-report-artifact-verification.test.ts
npm --prefix functions run build
npm --prefix functions run lint
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1
```

RED: new verifier behavior cases fail only missing module; existing363/fixture controls pass, no compile/fixture/RPC errors. GREEN: all new/focused/full cases pass, build/lint0, existing public-manifest skip only, protected hash check0. Prior2343pass1skip is historical baseline, not a fresh new-stage result; record actual new totals rather than predict a count.

## Research, Self-Review and Approval Gate

Primary `gemini-3.8-flash` RESEARCH plus targeted clarification in `calorix-calibration-artifact-admission-20261009`: agree/MUST_FIXnone; advises standalone reader, nonblocking opens, cooperative scope. Main corrected all-parent0700 claim, indirect import-cycle claim and abbreviated root; existing canonical constant is authoritative. New reader only gets nonblocking flags; old publisher remains frozen. This is not exact PLAN/CODE approval.

Official sources: [Node20 native fs flags/readSync](https://nodejs.org/docs/latest-v20.x/api/fs.html), [Linux open(2)](https://man7.org/linux/man-pages/man2/open.2.html). Nofollow is leaf-only and read returns byte count; directory-FD/native-addon alternatives are outside this no-new-dependency slice, not claimed impossible by all techniques.

Self-review: exact artifact byte fidelity is separate from gate success/durability/receipt admission; source ownership before await, inode identity and bounded actual reads are explicit. Existing source/tests/config frozen. Exact PLAN review and required human written-plan review precede editing worker/test/source dispatch. Preserve existing host-led execution method; no new native application-edit exception. No task-start/BASE/completed checkbox, new source/test, provider/model/default/project/gate change or new full-suite evidence yet.

## Exact PLAN Review Receipt and Written-Plan Handoff

Functional plan SHA`a1ab4d21349527e2d2c68217981764c7698b9c25ec92ee82dbbcfd805790f2e8` received fallback`gemini-3.7-flash` exact PLAN agreement in `calorix-calibration-artifact-admission-20261009`: `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`. Primary3.8 priorc0cf8dc1 plan timed out after300s; exact tool error recorded before fallback, not quota exhaustion or approval. Host independently added all-six genuine artifact coverage and corrected result-row modality before fallback; originalc0 never approved. Reviewer off-by-one326line wording is not source evidence; host count was325 before this tracking append. No reviewer mutation/noisy wrapper. This appended receipt is tracking-only; functional requirements above are unchanged.

Handoff status at publication: required human review before implementation. Subsequently approved by the user with “looks good continue”. Execution uses ordinary editing workers and the existing branch/checkout. No live, deployment, model-default or broader readiness authority is added.

Execution ruling: normalize the heading from `Task1` to `Task 1` so the required task-start script can extract its brief; no functional requirement changes. Cost if wrong: tracking extraction only.

Execution checkpoint (2026-10-10 local): Task 1 Step1 remains incomplete. Fresh unchanged-source focused4 baseline363/363 passed; protected hashes/Functions tree unchanged. Newtest draft1992lines SHA3b490c4c919a75e48df1745d7cefc5860b11568a37835ca9c88d80fc10ff83de remains unaccepted/untracked, source absent, no RED/freeze/completed step. Primary3.8 draft-debug review rejected original04f428ad with12must-fixgroups; corrections/gate closure still pending. All ordinary worker routes were attempted and failed/incomplete or refused required privacy/patch scope (exact chronology in status). Work pauses for explicit user THIS-plan native Codex apply_patch exception or alternative permitted-worker direction; none inferred from previous exceptions. Keep all original four-file/old-source/test/digest/config protections and verification/review gates unchanged. Incomplete ext4 scratch retained, no active owned worker. No live/UI/accuracy/readiness claim; no workspace deletion, deferred minors:none recorded yet. Heading-space ruling above is the only execution ruling so far.
