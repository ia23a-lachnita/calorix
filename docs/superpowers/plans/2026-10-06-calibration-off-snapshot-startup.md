# Calibration snapshot-only startup implementation plan

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development, with the mandatory AGENTS.md editing-worker route. Continue autonomously under the already approved parent calibration design; no routine task approval pauses.

**Goal:** Bind the four OFF payloads to the checksum-pinned calibration lock before parsing, then prove the twelve supplied-barcode samples use only immutable preloaded products.

**Architecture:** Add an explicit calibration-only startup factory around the existing snapshot store. It owns the production parser and preloads/checks all payload strings before parsing any product. Widen the adapter's lookup type to its existing get-only dependency; do not change generic runtime behavior or activate a CLI.

**Tech Stack:** TypeScript, Node crypto, production OFF parser and package normalizer, Vitest; no dependency additions.

**Spec:** `docs/superpowers/specs/2026-09-23-gemini-38-nutrition-calibration-design.md`; execution refinement of parent `docs/superpowers/plans/2026-09-23-gemini-38-nutrition-calibration.md` Task 5.

**Baseline:** `fix/scan-photo-flow-viewer`, `aec937be72ac7b227a30a595b41bfb5e2b25c7ca`. Existing full Functions suite: 1839 passed, one existing public-manifest skip. Protected `.mcp.json` remains untouched/unstaged. Continue in the existing feature checkout; do not create another worktree or install dependencies.

## Global constraints

- Calibration model remains `gemini-3.8-flash`, project `calorix-xurschnell`, location `us`; this slice constructs no provider client and sends no requests.
- `gemini-2.5-flash` remains saved historical evidence only; no new requests or fallback.
- Protocol remains 146 planned image calls, hard ceiling 300; twelve barcode outcomes reserve no images.
- Preserve prompts, nutrition schema, normalizer, Review policy, confidence threshold and production defaults.
- Never alter committed OFF payloads/lock, expose private caller errors, or perform live OFF fetches.
- Host edits planning/tracking only; source/tests use editing workers; workers never commit/push.
- No deployment, cloud data mutation, device/UI operations or production-readiness/accuracy claims.

## Review focus

1. A later corrupted snapshot must prevent every parser call and return no partial store.
2. A forged/reformatted lock or parser/expected-hash override must fail before reader access.
3. Reader/reflection failures carrying private paths/tokens must produce fresh static causeless fatal errors.
4. Returned nested products must remain immutable, with no usable map mutation methods or runtime reader/parser access.
5. All twelve real benchmark barcode outcomes must exercise the unchanged production normalizer while performing zero image, vision, reservation, live OFF, cache or runtime snapshot operations.

## Task 1 — Owned parser and prevalidated payload startup

**Files:** create `functions/src/nutrition-eval/calibration-off-snapshot-store.ts`; create `functions/test/nutrition-eval/calibration-off-snapshot-store.test.ts`; modify only the `offSnapshotMap` type in `functions/src/nutrition-eval/live-adapter.ts`; update this plan and implementation status. Existing generic snapshot store/parser/runner remain unchanged.

**Interfaces:**

```ts
export type CalibrationOffSnapshotPath =
  | 'functions/eval/nutrition/off-snapshots/3017624010701.json'
  | 'functions/eval/nutrition/off-snapshots/5449000000996.json'
  | 'functions/eval/nutrition/off-snapshots/4056489686941.json'
  | 'functions/eval/nutrition/off-snapshots/7622210449283.json';
export interface CalibrationOffSnapshotStartupDeps {
  readonly lockText: string;
  readonly readSnapshot: (path: CalibrationOffSnapshotPath) => Promise<string>;
}
export async function prepareCalibrationOffSnapshotStore(deps: unknown): Promise<OffSnapshotStore>;
// Adapter consumes its actual get-only dependency, preserving ReadonlyMap callers:
offSnapshotMap?: Pick<ReadonlyMap<string, OffProduct>, 'get'>;
```

- [ ] **Step 1: Write tests only.** Load actual committed UTF8 lock and four payloads locally. Spy by wrapping the real production parser, never replacing products. Add cases for all five review-focus groups, private rejected reader/error getters/proxies, invalid payload types, all four checksum failures, and exact fixed reader paths. A global fetch trap must remain unused. Build the genuine four supplied-barcode cases from the public manifest; run three samples each through the existing adapter/default normalizer and calibration runner with cache/image/vision/reservation/live OFF traps. Assert twelve successful parsed outcomes, exact case/sample coverage, independently checked nutrients and `cached: false`. Snapshot reads occur only at startup, each exactly once; production parser runs once per barcode. Unknown lookup returns undefined.
- [ ] **Step 2: Witness host RED.** Run the focused command below with source untouched. Missing new export/module is the accepted new-feature failure; existing suites must stay green. Fix fixture mistakes in tests before authorizing source. Check source/protected hashes and new-test lint.
- [ ] **Step 3: Implement minimal source.** Guard closed own-data deps with only `lockText`/`readSnapshot`; reject extra/symbol/inherited overrides and trap exceptions before effects. Bind immutable lock string to `CALIBRATION_OFF_SNAPSHOT_LOCK_SHA256`, parse and use existing exact lock validation. Read only four literal paths in committed barcode order, snapshot strings and check their pinned SHA256s. Complete all reads/checks before calling the existing store with an internal captured-string reader and imported `fetchOffProduct`. That store owns freezing products/map-only lookup. No caller parser/normalizer/hash overrides, mutable payload references, generic helper edits, file/ledger/client effects or runtime reader closures. Input errors become `calibration:off-snapshot-input-invalid`; payload/parser/IO errors become `calibration:off-snapshot-startup-failed`, always fresh/causeless, without inspecting foreign errors. Widen only adapter lookup type as shown above.
- [ ] **Step 4: Witness host GREEN.** Run focused tests, full Functions tests, build/lint and whitespace/protected-config checks. Inspect source and every regression failure/result; do not accept worker summary alone.
- [ ] **Step 5: Review and checkpoint.** Obtain one fresh native read-only review of this entire bounded plan and required same-conversation Antigravity CODE/result review. Fix Important/Critical findings in one RED→GREEN pass, ledger minors/rulings, retain all unrelated user edits. Update tracking, commit selected paths and push; verify exact live origin equality. Run task-done with full suite. Continue parent driver/report work without marking its unchecked steps complete.

Focused RED/GREEN:

```bash
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1 test/nutrition-eval/calibration-off-snapshot-store.test.ts test/nutrition-eval/off-snapshot-store.test.ts test/nutrition-eval/live-adapter.test.ts test/nutrition-eval/runner.test.ts
```

Expected RED: only new factory cases fail because source is absent; existing suites pass. Expected GREEN: all focused cases pass.

Whole task verification:

```bash
npm --prefix functions run build
npm --prefix functions run lint
npm --prefix functions test -- --reporter=dot --maxWorkers=1 --minWorkers=1
```

Expected: build/lint exit zero; full suite passes with only the existing public-manifest skip. Serial workers change scheduling, not coverage. Flutter/APK/device/UI/provider/emulator gates are intentionally omitted for this unused, explicit offline helper; full integrated CLI `test:verify` remains a parent activation gate.

## Sequencing and remaining boundaries

The future driver must supply `lockText` from its verified prepared context, read committed snapshot strings using a source-bound native reader, and await this factory before any ledger reservation. This helper does not prove that future sequencing or ambient Git/account identity. Parent Task 5 complete startup wiring and Task 7 whole-driver, durable metric/report reconstruction, stage report hashes, exact 146 image execution and 60 benchmark outcomes remain pending. A twelve-outcome barcode proof is structural/local catalog evidence, not live-model calorie accuracy.

Pre/post-review workstream: `calorix-off-snapshot-startup-20261006`; `gemini-3.8-flash`, canonical 3.7/3.6 fallback only with exact errors recorded. No-write prompts and explicit agree/none required.
