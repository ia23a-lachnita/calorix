# Calibration Bootstrap Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for this bounded task. Calorix AGENTS.md controls worker editing, host review/verification, commits and pushes. User explicitly requested continuous execution without per-subtask approval pauses.

**Goal:** Assemble the validated, immutable source/input/owner context needed by the default calibration runtime, without constructing a provider client or creating calibration files.

**Architecture:** A new read-only preparation module consumes injectable Git, committed-file and owner readers. Native readers use argument-array Git commands and Linux process metadata. Preparation always uses the existing pinned asset verifier, then rechecks source identity before returning a frozen context; it does not alter the injected CLI or either session API.

**Tech Stack:** TypeScript, Node child_process/fs/os/path/crypto, existing asset verifier and process-stat parser, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`; parent plan `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md` Task 7 Step 4.

## Global Constraints

- Fixed Vertex project `calorix-xurschnell`, location `us`, model `gemini-3.8-flash`, protocol `v1`, planned image calls `146`, hard ceiling `300`. No new 2.5 call or fallback.
- No client, SDK construction, provider callback, image download, OFF network call, ledger creation/lock, output write, account check, Firebase or device operation belongs to this module. Importing it must have no read/write/network side effects.
- Keep `runCalibrationCli`, both session APIs, existing prompt/schema/parser/normalizer, and calibration file-store grammar unchanged. No live opt-in or npm command is enabled by this task.
- Required live prerequisites remain open: durable protocol identity/model-version/stage metadata, account readiness, image verification, default CLI wiring and whole-stage accounting. In-memory identity assertions are not cross-process proof.
- Preserve protected `.mcp.json` byte-identically and unstaged; use the established in-place branch checkout and required external editing-worker route.
- Native process/Git/read failures become fixed-message, causeless `CalibrationFatalError`; raw stdout/stderr/parser errors, private paths, commands or messages must not be echoed or attached.

## Review Focus

1. A dirty Functions tree, including untracked files, stops before committed-asset or process-owner reads; unrelated root `.mcp.json` changes do not block preparation.
2. Assets come from one explicit pinned commit, not mutable working-tree bytes or a moving HEAD; an asynchronous verifier cannot mix commits.
3. Docs-only HEAD movement is accepted only when Functions tree and latest Functions implementation commit remain unchanged; source drift or new dirt fails before returning context.
4. Missing/unparseable boot ID, proc start ticks, invalid PID or noncanonical timestamp never reaches a session; `startTicks` is strictly positive.
5. Every foreign read/Git error drops raw error data; fixed verifier failures remain causeless and no injected private sentinel reaches the exported error.

## Files and Public Interfaces

- Create `functions/src/nutrition-eval/calibration-bootstrap.ts`.
- Create `functions/test/nutrition-eval/calibration-bootstrap.test.ts`.
- Modify only this plan and `docs/implementation-status.md` for tracking.

Consume the canonical Git-state type through the ledger method instead of duplicating it or changing its existing export:

```ts
import type { CalibrationIdentity, CalibrationLedger, CalibrationOwner } from './calibration';
import type { CalibrationPreflightFileName, CalibrationPreflightReport } from './calibration-cli';

export type CalibrationBootstrapGitState =
  Parameters<CalibrationLedger['assertGitState']>[0] & { implementationCommit: string };

export const CALIBRATION_BOOTSTRAP_ASSET_PATHS = {
  'public-manifest': 'functions/eval/nutrition/public-manifest.json',
  'source-lock': 'functions/eval/nutrition/calibration-source-lock.json',
  'calibration-manifest': 'functions/eval/nutrition/calibration-manifest.json',
  'off-lock': 'functions/eval/nutrition/off-snapshot-lock.json',
  'historical-reference': 'functions/eval/nutrition/historical-reference-v1.json',
} as const;
export type CalibrationBootstrapAssetPath =
  (typeof CALIBRATION_BOOTSTRAP_ASSET_PATHS)[keyof typeof CALIBRATION_BOOTSTRAP_ASSET_PATHS];

export interface CalibrationBootstrapReadDeps {
  readonly baseDir: string;
  readonly readGitState: () => CalibrationBootstrapGitState;
  readonly readCommittedFile: (path: CalibrationBootstrapAssetPath, commit: string) => string;
  readonly readOwner: () => CalibrationOwner;
}

export interface CalibrationPreparedContext {
  readonly baseDir: string;
  readonly identity: Readonly<CalibrationIdentity>;
  readonly owner: Readonly<CalibrationOwner>;
  readonly firstDevelopmentCaseId: string;
  readonly report: Readonly<CalibrationPreflightReport>;
  readonly files: Readonly<Record<CalibrationPreflightFileName, string>>;
}

export function createCalibrationBootstrapReadDeps(
  repoRoot?: string,
): CalibrationBootstrapReadDeps;
export function prepareCalibrationBootstrapContext(
  deps: CalibrationBootstrapReadDeps,
): Promise<CalibrationPreparedContext>;
```

## Task 1: Prepare committed calibration context

**Produces:** The interfaces above and a context compatible with the durable session's identity/owner/baseDir/case-ID input. No callback or verifier override is exposed.

- [x] **Step 1: Write focused RED tests.** Use committed five asset fixtures read from the real repository with Node `readFileSync`, plus literal Git IDs (`'a'.repeat(40)`, `'b'.repeat(40)`, `'c'.repeat(40)`) and a literal valid owner. Import the absent preparation export. A basic fixture is:

```ts
const gitState = {
  headCommit: 'a'.repeat(40), implementationCommit: 'b'.repeat(40),
  functionsTreeId: 'c'.repeat(40), dirtyPaths: [],
};
const owner = {
  hostname: 'fixture-host', bootId: 'fixture-boot', pid: 123, startTicks: 42,
  acquiredAt: '2026-10-05T00:00:00.000Z',
};
const readCommittedFile = vi.fn((path: CalibrationBootstrapAssetPath, _commit: string) =>
  readFileSync(resolve(realRepoRoot, path), 'utf8'));
const deps = {
  baseDir: '/tmp/calorix-bootstrap-fixture', readGitState: vi.fn(() => gitState),
  readCommittedFile, readOwner: vi.fn(() => owner),
};
const result = await prepareCalibrationBootstrapContext(deps);
expect(result.firstDevelopmentCaseId).toBe('calibration-dish_1565117892');
expect(result.identity.implementationCommit).toBe('b'.repeat(40));
expect(result.identity.functionsTreeId).toBe('c'.repeat(40));
expect(result.identity.model).toBe('gemini-3.8-flash');
expect(result.identity.plannedImageCalls).toBe(146);
expect(result.report.historicalCompatible).toBe(false);
expect(readCommittedFile).toHaveBeenCalledTimes(5);
for (const [, commit] of readCommittedFile.mock.calls) expect(commit).toBe('a'.repeat(40));
expect(Object.isFrozen(result)).toBe(true);
expect(Object.isFrozen(result.identity)).toBe(true);
expect(Object.isFrozen(result.owner)).toBe(true);
expect(Object.isFrozen(result.files)).toBe(true);
```

Also test: missing deps/readers/relative baseDir; tracked and untracked Functions dirt before file/owner reads; unrelated `.mcp.json` only accepted; malformed Git IDs/dirty-path shapes; each of five missing/tampered assets before owner read; secret-bearing Git/file/owner exceptions with fresh fatal/no cause/no private sentinel; invalid owner hostname/bootId/PID/ticks/time; second-read tree or implementation-commit drift and new dirt; docs-only second HEAD movement accepted; caller mutations of returned identity/owner/report/files cannot change prepared values. Use separate tests or literal table rows so one first rejection cannot hide later subcases.

Native-reader tests use a real temporary Git repository with fixture source/assets copied only inside its owned temp directory using test utilities, `git init`, local fixture author identity supplied with `git -c` arguments, and commits (never Calorix commits). Verify commit/tree derivation, reading original committed bytes despite an edited working file, NUL-delimited tracked/untracked status and a filename with spaces, root `.mcp.json` exclusion, and docs-only latest-Functions-commit stability. Owned fixture cleanup stays in test helpers. No worker may commit/push the actual checkout.

- [x] **Step 2: Witness RED.** Run `cd functions && npx vitest run test/nutrition-eval/calibration-bootstrap.test.ts --reporter=dot`, plus direct ESLint. Expected missing preparation/native-reader exports; fix test fixture/type/lint mistakes before application edits. Record host-observed RED and names/counts.

- [x] **Step 3: Implement preparation and native reads minimally.** Validate deps object, absolute canonical baseDir, and three reader functions before effects. Read/validate a snapshot of Git state first: all three IDs lowercase 40-hex; dirtyPaths is a string array. Ignore only paths outside the `functions/` path boundary; any path under it blocks. Clone the Git state before awaits. Read the five fixed asset paths using the first `headCommit`. Assemble `prompt` as `JSON.stringify([MEAL_ANALYSIS_PROMPT, LABEL_ANALYSIS_PROMPT, BARCODE_ANALYSIS_PROMPT])`; assemble `response-schema` as `JSON.stringify([visionResponseJsonSchema('meal'), visionResponseJsonSchema('label'), visionResponseJsonSchema('barcode')])`. Call `verifyCalibrationPreflightState({ files })` with no expected override. Derive and validate the owner only after assets pass, then reread Git state; require clean same Functions tree and implementation commit, allow docs-only HEAD movement. Build identity with verified pinned hashes, `implementationCommit` from latest Functions commit, `functionsTreeId` from snapshot, `datasetHash` and `publicManifestHash` both verified public-manifest hash; `manifestHash` is the pinned raw calibration-manifest digest. Deep-freeze fresh cloned output structures without freezing caller-owned objects.

The native reader factory does no reads at construction. Resolve default root from `__dirname` with the existing `resolveNutritionEvalRuntimePaths` convention. Use `execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })`:

```ts
['rev-parse', 'HEAD']
['rev-parse', `${headCommit}:functions`]
['log', '-1', '--format=%H', headCommit, '--', 'functions']
['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', 'functions']
['show', `${commit}:${assetPath}`]
```

Parse NUL records safely, including rename/copy second paths and filenames containing spaces; do not silently discard malformed status records. `readCommittedFile` accepts only the fixed asset allowlist and 40-hex commit before invoking Git. Native owner reads `hostname()`, `process.pid`, boot ID and `/proc/${process.pid}/stat`, using `parseProcStartTicks`; validate positive safe integer PID/ticks and canonical valid ISO timestamp from `new Date().toISOString()`. Catch foreign failures into static causeless messages `calibration:bootstrap-git-failed`, `calibration:bootstrap-file-failed`, `calibration:bootstrap-owner-failed`; input/Git-state/dirty/identity-drift failures have separate static bootstrap messages. Preserve existing verifier fatal messages only if reconstructed causeless and without arbitrary attached data; never expose raw error objects.

- [x] **Step 4: Verify GREEN and existing boundaries.** Run the new suite plus calibration-cli, preflight-durable-session, preflight-session, preflight-ledger and safe-error-ledger suites, then Functions build/lint/full `nice -n 10 npm test -- --reporter=dot`. Expected all green, existing recorder/session tests unchanged. Check scoped diff, new-file whitespace and protected `.mcp.json` hash. No live/emulator/device gate applies to read-only preparation; parent whole-CLI verification remains open.

- [x] **Step 5: Review, checkpoint and continue.** Fresh read-only Antigravity post-review must return explicit `AGREEMENT_STATUS: agree` and `MUST_FIX: none`; independently inspect source/test integration. Fix must-fix test-first through workers. Update status, stage only bootstrap source/test and tracking, commit `Prepare calibration startup context`, push and prove exact remote equality. Mark this plan complete in docs-only tracking after push. Keep parent Task 7 Step 4 unchecked and proceed to the durable protocol-metadata/default runtime integration workstream without enabling live calls prematurely.

**Completion evidence:** implementation/tracking commit `7796b8a88dd9b41586463ebf48b500980bb272eb` pushed with exact origin equality. Host focused **286/286**, build/lint `0`, full suite and task-close rerun **33 files / 1647 passed / 1 existing skip**. Required MCP revision review: `gemini-3.8-flash`, `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `READ_ONLY_NOISE_FREE: yes`; independent review no remaining Important/Critical issue. Native read-only preparation on the clean committed real checkout passed: implementation commit above, Functions tree `efdce27586960eaf30212fb5e45f890c5b8897f7`, first development case `calibration-dish_1565117892`, historical compatibility false, frozen output and positive Linux owner verified. No client/inference/output files or live activation. Deferred minors recorded in status; parent integration remains open.
