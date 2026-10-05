# Durable calibration protocol and restart safety implementation plan

> Implement inline using executing-plans, test-driven-development and mandatory editing workers. Execute all three tasks continuously; checkpoint each reviewed stage without asking for routine approval.

**Goal:** Make the offline calibration ledger authoritative after lock acquisition, close the demonstrated stale-lock archive race, and durably bind protocol identity, response model version, selected profile and completed stages. Compose a new explicit strict preflight session. No live calls or default CLI activation.

**Baseline:** branch `fix/scan-photo-flow-viewer`, pushed HEAD `1787ec2ee3be38f299daaa58890a72e7c8032644`. Protected user `.mcp.json` stays untouched and unstaged. Source changes use strongest-first Linux workers from AGENTS.md, never host edits. Retain legacy hermetic factories/APIs except corrections to actual lock/replay bugs.

**Architecture:** shared ledger core with legacy and strict protocol factories; metadata remains in the existing fsynced ledger array, not a third storage format. A pure canonical key resolver starts with 50 keys and expands under replay/lock to 146 for one selected profile. Strict metadata validates sequencing and complete terminal coverage, not nutrition metric approval: the later stage driver must compute actual gates and persist bound report digests before live activation.

**Tech Stack:** TypeScript, Node synchronous filesystem primitives, Vitest; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`, parent `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md`, and independently reproduced lock/replay defects recorded in implementation status.

**Global constraints:** no new 2.5 calls; exact 146 planned images/300 ceiling; v1/vertex-ai/gemini-3.8-flash; no retry; no production mutation; protected user files preserved.

**Review focus:** delayed archive contenders, replacement inode, crash between link/unlink, stale construction replay, and privacy-unsafe injected callbacks are covered explicitly in Task 1 tests. This plan has no additional unassigned input classes.

## Task 1 — Atomic stale archive claim and authoritative locked replay

- [x] Write tests only, witness focused RED.
- [x] Implement the smallest source fix, inspect and witness GREEN.
- [x] Run focused/full/build/lint, obtain external and independent review, update tracking, commit/push.

**Files:** modify `functions/src/nutrition-eval/calibration.ts`, `calibration-file-store.ts`; add `functions/test/nutrition-eval/calibration-replay-lock.test.ts`, `calibration-archive-claim.test.ts`; update the existing recovery-order expectation in `calibration.test.ts` only where it asserts the unsafe old order.

Native archive algorithm: validate canonical chain, regular non-symlink lock and matching stale owner, capture expected `dev`/`ino`, then atomically `linkSync(lock, archive)` to the existing sibling `lock.archive.<pid>.<ticks>.json` name. EEXIST returns static `calibration:lock-archive-destination-exists`; never fall back to overwrite/rename. Fsync directory before unlink; verify archive/current lock remain regular, matching expected inode/device and stale owner before unlink; mismatch fails closed without unlinking replacement. Unlink old lock and fsync directory again. Add archive-specific `linkSync`/`unlinkSync` overrides; retain atomic JSON-array rename and unrelated native cleanup/release behavior. Failures retain evidence; crash after link but before unlink requires operator intervention on the existing archive, never automatic adoption/removal. This protects normal competing recoverers, not arbitrary hostile/manual mutations between the last inode check and unlink.

Core acquisition sequence: archive stale owner, acquire new lock with wx, mark held owner, reset all replay state and reread journal/events under exclusive ownership, then append recovery audit. Fresh acquisition also refreshes authoritatively. Preserve initial construction-time read-only replay for inspectors. Reset reservations/order, journal/pending hashes, image/token counters and token state completely; Task 2 adds metadata reset. No audit/write on unsuccessful archive/wx acquisition. Failed under-lock refresh permanently poisons the instance; every public method, including getters, acquire/release and recoverAfterCrash, then throws a fresh static causeless fatal before effects. Retain lock on fatal rather than permit catch-and-continue or automatic release. Add an ownership guard to crash recovery. Sanitize foreign refresh errors without retaining private cause. Ensure double acquisition fails rather than invalidating owned state.

Tests: exact delayed-contender interleaving (winner archives/writes new lock during loser link hook; loser EEXIST preserves winner and old archive); substituted inode before link; existing file/symlink archive; unsupported link/no fallback; link-fsync/unlink-fsync order and injected failures; crash after link; fresh contender wins wx after old unlink. Stale constructor counts/journal updated before acquire must refresh exactly once on fresh/dead paths without doubled counts. Replay corruption preserves held lock and poisons all methods with no further reads/writes; private foreign errors cannot escape. Recovery audit follows ownership and refresh, never precedes archive.

RED/GREEN: `npm --prefix functions test -- --reporter=dot test/nutrition-eval/calibration-replay-lock.test.ts test/nutrition-eval/calibration-archive-claim.test.ts test/nutrition-eval/calibration.test.ts test/nutrition-eval/calibration-file-store.test.ts`. GREEN also `npm --prefix functions run build`, `npm --prefix functions run lint`, full `npm --prefix functions test -- --reporter=dot`.

## Task 2 — Strict protocol factory and durable metadata grammar

- [ ] Write tests only, witness focused RED.
- [ ] Implement and inspect the shared-core strict factory; witness GREEN.
- [ ] Run focused/full/build/lint, obtain external and independent review, update tracking, commit/push.

**Files:** modify `calibration.ts`; add `functions/test/nutrition-eval/calibration-protocol-ledger.test.ts`. Keep source refactoring bounded; split private strict helpers into a new module if necessary, without circular runtime imports.

Expose `CalibrationKeyResolver = (selectedProfile?: CalibrationProfile) => readonly ReservationKey[]`, `CalibrationProtocolLedger extends CalibrationLedger`, and `createProtocolCalibrationLedger(deps, identity, keyResolver)`. Methods: `pinModelVersion(version)`, `getPinnedModelVersion()`, `recordProfileSelection(profile, reason, gateSummary)`, `getSelectedProfile()`, `completeStage(stage, gateSummary)`, `getCompletedStages()` (fresh frozen snapshot). All writes require lock; all methods honor poison. Selection reasons are exactly `fewer_unsafe`, `higher_parse`, `fewer_catastrophic`, `lower_macro_error`, `lower_kcal_error`, `lower_latency`, `default_medium_tie_breaker`, never freeform error/provider text.

Strict replay requires event zero `protocol_identity` with exact 15 identity fields and canonical ISO timestamp. Fixed v1/vertex-ai/gemini-3.8-flash/146/300, two 40-lowercase-hex Git IDs, eight 64-lowercase-hex hashes. Duplicate header, extra properties, drift, non-empty legacy history or journal without header fail closed. Empty initial inspection does not write a header; only under-lock refresh initializes it before any lifecycle/recovery event. Legacy factory rejects strict headers (`calibration:protocol-ledger-required`) rather than bypass binding. Immutable snapshots use guarded indexed/key reads and fresh plain/null-prototype data; never serialize caller toJSON or retain foreign errors/causes.

`model_version_pinned`: safe 1–128 character `[A-Za-z0-9_./-]` version, not `n/a`, immutable; matching repeat pin is no-op, mismatch fatal. Pin first successful LOW response before journal completion/MEDIUM. Every successful journal version must match pinned version; error/interrupted journals may use `n/a`. Replay validates terminal success/failure journal hashes and planned keys; strict event fields/timestamps are closed and privacy safe. Legacy lifecycle fixtures retain existing loose grammar.

`profile_selected`: one immutable LOW/MEDIUM plus closed reason, after passed development summary, completed preflight and full 48 terminal development keys. Key resolver runs under replay/lock on selection, validates unique stage/profile/sample shape and exact stage counts, preserves all initial 50 keys, and expands to exactly 146 (50 + 48 validation + 48 benchmark). No key from another downstream profile. Resolver failure is static causeless fatal; no provider callbacks.

`stage_completed`: ordered once-only stage plus `passed:true` and timestamp; a method requires matching passed gate summary with already completed predecessor stages. Preflight requires successful token count, two successful images and version pin; development requires 48 terminal outcomes and selection; validation requires 48 terminal outcomes and prior development/selection/version; benchmark requires 48 terminal image outcomes and prior validation. Replay enforces the same structure/coverage. Repeated identical completion is no-op; contradictions fatal. Coverage is not proof of accuracy gates or the 12 barcode outcomes; those remain explicit activation blockers.

Reservation sequencing is part of the strict replay grammar, not merely the future driver: token count precedes LOW; LOW is terminal-successful and version-pinned before MEDIUM; no development reservation before durable preflight completion, no validation before durable development completion/selection, no benchmark before durable validation completion. No reservation in a completed stage. Reject the same forbidden sequence both on new writes and replay. The first pin requires completed token count plus an active LOW reservation. Gate summaries supply exactly already completed predecessor stages (`[]` for preflight, `['preflight']` for development/selection, and so on); this is structural evidence, never a claim that nutrition thresholds have been independently measured.

Task 1 nonblocking follow-ups belong to this task's tests: make both new regression-suite headers timeless, add backing journal/token arrivals after construction, exact once-per-acquire journal/events reads, and pending-hash reset across release/reacquire. Preserve original RED evidence and all assertions.

Tests: strict header initialization under fresh/recovered lock; constructor no metadata writes; identity/hash/extra-field/duplicate/headerless rejection; frozen defensive snapshots and private getter/toJSON failures; restart pin/profile/stage replay; model drift and success-version mismatch; all closed reasons and invalid reasons; complete terminal coverage and ordered gates; dynamic resolver 50→146 invariant and rejection of 242/both profiles; lifecycle/journal mismatch; poisoned methods; legacy strict-header refusal without changing old hermetic APIs.

RED/GREEN: focused `calibration-protocol-ledger.test.ts` plus all Task 1 ledger/store suites, then build/lint/full Functions.

## Task 3 — Canonical keys and explicit strict preflight session

- [ ] Write tests only, witness focused RED.
- [ ] Implement new explicit composition, inspect and witness GREEN.
- [ ] Run focused/full/build/lint, obtain external and independent review, update parent/status tracking, commit/push.

**Files:** modify `calibration-bootstrap.ts`, `calibration-preflight-session.ts` (and bridge only if required); add `functions/test/nutrition-eval/calibration-canonical-keys.test.ts`, `calibration-protocol-session.test.ts`.

Expose pure `deriveCanonicalAllowedKeys(files, selectedProfile?)` using the prepared checksum-verified strict manifest: 2 preflight keys on the first development case, 24×2 development keys, and after selection 16×3 validation plus 16×3 public vision benchmark keys. Barcode cases receive zero image keys. Reject malformed/drifted/duplicate inputs or invalid profile, preserve source fixtures, return frozen keys/array. Do not assume eight public barcode cases or derive benchmark keys from calibration cases.

Add `runCalibrationProtocolPreflightSession` taking prepared frozen context and only explicit injected countTokens/generateImage callbacks; no arbitrary key resolver/identity override or caller safe-error recorder. Preserve `runCalibrationPreflightSession` and `runCalibrationPreflightDurableSession` compatibility. Before file-store/provider effects validate prepared context and canonical keys. Acquire strict ledger, recover interrupted reservations without resending, reject invalid already-started preflight rather than guess restart behavior. Bind callbacks to existing durable hooks and recordSafeError. On successful LOW image response pin safe model version before hook terminal journal/completion; no pin for provider/parse failure. Persist preflight completion only after successful count+LOW+MEDIUM with same pinned version. Success-only release; failure retains lock. Foreign input/provider callback errors remain privacy-safe. Session performs no implicit SDK creation, live inference or deployment.

Use the terminal journal hook (not raw provider response) to pin after parse success:

```ts
appendResultJournal: (entry) => {
  if (entry.key.stage === 'preflight' && entry.key.profile === 'LOW' &&
      entry.normalizedPrediction !== null && entry.errorCategory === 'none') {
    ledger.pinModelVersion(entry.responseModelVersion);
  }
  return ledger.appendResultJournal(entry);
}
// After successful primitive:
ledger.completeStage('preflight', {
  stage: 'preflight', passed: true, completedStages: [],
});
```

Tests: actual verified fixture context; 50/146 arithmetic, selected-only expansion, barcode zero keys; new session disk header→token→LOW pin-before-completion→MEDIUM→stage; restart inspection reconstructs exact identity/version/stage/counts; LOW failure stops MEDIUM and retains lock; model drift stops with no completion; tampering/unbound disk refuses before callbacks; private caller getter/errors and forbidden overrides; old sessions remain compatible. Complete parent Task 7 Step 4 only when whole-driver/default/report/arithmetic requirements are actually satisfied, not on this helper plan alone.

RED/GREEN: focused canonical/protocol session tests plus bootstrap, protocol ledger, preflight bridge/primitive and both legacy sessions; build/lint/full Functions. Use no live provider/device/UI gate because this is injected offline backend plumbing; explicitly record this scope reason.

## Verification and continuation

For each task: host witnesses RED and fresh GREEN, inspects worker diff, `git diff --check`, protected `.mcp.json` hash equality, full Functions/build/lint, mandatory Antigravity MCP post-review and fresh read-only independent review. Update this plan's checkboxes and its own ignored `.superpowers/sdd/2026-10-05-calibration-protocol-metadata/progress.md`, not another plan's ledger. Commit/push exact selected paths, then record exact remote equality and immediately proceed to the next task.

Antigravity pre/post conversation: `calorix-task7-protocol-metadata-20261005`, primary `gemini-3.8-flash`, canonical 3.7/3.6 fallbacks with exact timestamp/category/message logging. Each prompt includes the no-write prohibition; only explicit `AGREEMENT_STATUS: agree` / `MUST_FIX: none` is approval. Research consultation with architectural must-fixes is not green.

After all three tasks proceed to the pending whole-driver offline proof: exact 146 image reservations, no retry/no-new-2.5, 60 benchmark outcomes including 12 snapshot-only barcodes, bound metric reports, prevalidated OFF products and zero provider creation on failed startup. Default activation/live calibration remains gated; no production readiness or accuracy claims from this plan.
