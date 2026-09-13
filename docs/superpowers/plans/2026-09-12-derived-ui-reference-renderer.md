# Derived UI Reference Renderer Implementation Plan — Samsung S20 FE 360×800 DPR3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the separate hermetic derived renderer that re-renders the same JSX handoff into fixed git-ignored S20 FE leaves at true 360×800 CSS px, DPR 3 (1080×2400 physical), with locked local dependencies, deterministic clock settlement, fail-closed validation, and a manual `workflow_dispatch` workflow, without ever mutating the immutable canonical 402×874 38-file set. The full leaf `.ui-diff/expected-derived/samsung-s20fe/<sourceFingerprint>/` contains exactly 38 PNGs plus `manifest.json` and nothing else; subset diagnostics live separately at `.ui-diff/expected-derived/samsung-s20fe/subsets/<sourceFingerprint>/<selectionSha256>/`, never nested inside the full leaf.

**Architecture:** `tool/ui_capture/reference_renderer` owns a locked npm package (engines Node `>=20 <21`) plus a CLI entry (`bin/render.mjs` with pure `parseCliArgs`, ARM refusal before dynamic import) and four ESM harness modules (`harness/profile.mjs` frozen geometry/locale/flags/guard, `harness/settlement.mjs` exhaustive settlement map, `harness/server.mjs` loopback-only static server, `harness/manifest.mjs` fingerprint plus deterministic manifest plus safe leaf replace, `harness/render.mjs` dynamic-import Playwright driver). The authoritative `docs/design-handoff/placeholder-app/preview/screens.html` gains only a capture-profile API (existing `capture=1` keeps 402×874; only exact `capture=1&profile=samsung-s20fe` activates 360×800) plus a React `CaptureBoundary` `useLayoutEffect` single commit token; interactive default 402×874 behavior stays unchanged. Chromium loads the actual preview through the strict local server with local interception of the preview's existing unpkg and Google-font requests, advances a pinned clock per state, asserts fonts/images/viewport/DPR plus locale-normalized Today settlement, takes a native stage-element screenshot without `svgizeGradients`, and writes exactly the fixed full leaf or a separate subset diagnostic leaf. A dedicated manual workflow installs the pinned browser via `npx playwright install --with-deps chromium`, renders, validates, and uploads artifacts without committing.

**Tech Stack:** Node.js 20 with bundled npm (engines `>=20 <21`), ESM (`"type": "module"`), `node:test` plus `node:assert/strict` for the pure unit gate, Playwright 1.63.0 managed Chromium only, React 18.3.1, ReactDOM 18.3.1, `@babel/standalone` 7.29.0, `@fontsource/geist` 5.3.0, `@fontsource/geist-mono` 5.3.0 woff2, GitHub Actions `ubuntu-latest` x86_64 remote runner.

**Spec:** `docs/superpowers/specs/2026-09-12-derived-ui-reference-renderer-design.md`

## Global Constraints

- Documentation-plus-plan task boundary for this change: this plan change creates only this plan file and the new top renderer checkpoint in `docs/implementation-status.md`. It does not create or modify `.mcp.json`, implementation files, test files, workflow files, config files, package files, preview files, committed assets, or manifests.
- Canonical set immutable: no edit, overwrite, delete, rename, re-encode, re-export, or manifest change under `docs/design-handoff/placeholder-app/reference-images/` (including `reference-images-manifest.json`, `reference-images-buggy/`, `good-screenshots/`). Canonical `test/reference_images_manifest_test.dart` stays unchanged.
- Derived output lives only in the fixed ignored full leaf `.ui-diff/expected-derived/samsung-s20fe/<sourceFingerprint>/` (exactly 38 PNGs plus `manifest.json`, nothing else, no subdirectories) for full gates or the separate subset leaf `.ui-diff/expected-derived/samsung-s20fe/subsets/<sourceFingerprint>/<selectionSha256>/` for subset diagnostics, never nested inside the full leaf. Never beside canonical files, never committed.
- True stage geometry activates only for the exact derived URL `?screen=<id>&mode=<dark|light>&capture=1&profile=samsung-s20fe`: `#stage` 360×800 CSS px at scale 1, origin x0/y0 of a 360×800 viewport, `box-shadow: none`, `border: 0`, no floating chrome, no centering translate, no capture bar in capture output. Existing `capture=1` without that exact profile keeps canonical 402×874 fit/stage; missing/unknown profile never activates derived geometry. Native stage-element screenshot yields exactly 1080×2400 pixels. The driver asserts exact fit/stage rects before capture.
- Hermetic locked package: exact pins React 18.3.1, ReactDOM 18.3.1, `@babel/standalone` 7.29.0, `@fontsource/geist` 5.3.0, `@fontsource/geist-mono` 5.3.0, Playwright 1.63.0 in `tool/ui_capture/reference_renderer/package.json` with committed `package-lock.json` and engines Node `>=20 <21`. No committed vendor UMD or font directories, no cloned `stage.html`. Generated `node_modules/` stays ignored as the ignored dependency tree. Runtime bytes are served from exact `node_modules` package files and individually SHA256-recorded without claiming the old CDN SRI.
- `npm test` is pure `node:test` with no browser installed and no network. Browser integration is proven only on remote x86 CI in Task 7.
- ARM/ARM64 refuses before browser import unless explicit `--allow-local-render` is passed. That option is forbidden on this Pi host; no Pi override belongs to any task. `bin/render.mjs` parses CLI without importing Playwright and refuses before dynamically importing `harness/render.mjs`. The workflow CLI passes no `--allow-local-render` because x64 does not require it.
- Frozen deterministic custom Chromium flags — the exact custom args passed to launch, each with leading double hyphens — are exactly `--disable-lcd-text`, `--font-render-hinting=none`, `--disable-threaded-animation`, `--force-color-profile=srgb`, `--hide-scrollbars`. Playwright default internal args are outside this custom list. No `no-sandbox` unless CI proves need with an exact error log. Omission or substitution of any frozen flag fails the run.
- Browser context locale is exactly `en-US` and timezone is exactly `UTC`. Exhaustive frozen `SETTLEMENT_MS_BY_STATE` covers all 19 inventory IDs: 1600 ms for `today`/`today_empty`, 0 ms for the other 17. `clockAdvanceMsFor(stateId)` throws `RENDER_INVALID_INPUT` for unknown IDs; there is no silent default. `page.clock.install` runs before `page.goto` per https://playwright.dev/docs/clock. Pinned browser install follows https://playwright.dev/docs/browsers with exactly `npx playwright install --with-deps chromium` at the pinned version only.
- Today settlement is locale-normalized: strip locale separators then require numeric content `1420` plus `kcal` and `96`/`132`/`38` plus `g` (zeros variant for `today_empty`). The pinned `en-US` hero displays `1,420`. Settlement never depends on punctuation and never uses computed no-pure-color checks. `todaySettlementExpectation(stateId)` and `assertTodaySettlement(domText, stateId)` take a state ID (`today` or `today_empty`).
- No computed no-pure-color checks, no `svgizeGradients`, no second parent render token, no `no pending RAF` claim. The single capture token only confirms the selected screen commit and never increments for child state updates; Today settlement uses DOM numbers.
- Source changes update the actual-byte source fingerprint; there is no `FINGERPRINT_DRIFT` failure. Runs fail only on invalid, missing, or unallowlisted inputs or readiness, path, or contract violations.
- Renderer-only stages carry no auditor, reviewer, or recovery provider route and no ui-diff finding counts until the historical comparison in Task 7. Provider routes for renderer stages are none. The Task 7 historical report states run ID if the tool produces one, provider routes (none — deterministic-only), real deterministic diff counts/metrics, `auditLimited`/`visualClassificationStatus` only if emitted otherwise explicitly not applicable, blockers, and sampled scope from the real result.
- Mandatory Antigravity plan review before Task 1 and mandatory post-implementation reviews after substantive tasks use conversation `calorix-derived-reference-renderer-20260912` with `approvalMode: yolo` and the read-only clause `Do not edit files, do not run write commands, and do not mutate the repository; only inspect, reason, debug, review, and propose changes for the main agent to apply.` A review is green only on explicit `AGREEMENT_STATUS: agree` and `MUST_FIX: none`.
- Every implementation task records source SHA, run IDs, docs and status updates per stage, then commits and pushes with plain imperative English and no hook-rejected tokens.
- No browser, Flutter/Dart, Docker, phone (`phone-adb`), LocateAnything, deployment, Firebase/GCP write, or VLM audit belongs to Tasks 1–6. Task 7 uses only remote x86 CI artifacts plus the preserved Samsung actual file; no fresh device capture, no VLM, no LocateAnything, no provider calls, and no exhaustive-parity claim belongs to Task 7.

## File Map

- `tool/ui_capture/reference_renderer/package.json` — ESM locked package with exact pins (React 18.3.1, ReactDOM 18.3.1, `@babel/standalone` 7.29.0, `@fontsource/geist` 5.3.0, `@fontsource/geist-mono` 5.3.0, Playwright 1.63.0), engines Node `>=20 <21`, scripts `test` = `node --test test/*.test.mjs` (browserless and portable), `render` = `node bin/render.mjs`, `validate` = `node bin/render.mjs --validate-only`.
- `tool/ui_capture/reference_renderer/package-lock.json` — committed lockfile; generated at implementation time by `npm install --package-lock-only`.
- `tool/ui_capture/reference_renderer/bin/render.mjs` — CLI entry exporting pure `parseCliArgs(argv)` returning `{ selection, replace, allowLocalRender, validateOnly }`; parses `--selection`, `--replace`/`--no-replace`, `--allow-local-render`, `--validate-only` without importing Playwright; enforces ARM refusal before dynamically importing `harness/render.mjs`. Exit codes: `0` success, `11` ARM refusal, `20` invalid input, `30` render/validation failure.
- `tool/ui_capture/reference_renderer/harness/profile.mjs` — frozen profile constants plus ARM guard (exact ESM signatures below).
- `tool/ui_capture/reference_renderer/harness/settlement.mjs` — exhaustive `SETTLEMENT_MS_BY_STATE` plus `clockAdvanceMsFor` (exact ESM signatures below).
- `tool/ui_capture/reference_renderer/harness/manifest.mjs` — fingerprint, deterministic manifest, symlink-safe leaf validation, atomic exact-leaf replacement with default-no-replace plus temp/backup/rollback.
- `tool/ui_capture/reference_renderer/harness/server.mjs` — loopback-only static server with strict route allowlist and `resolveCdnResource` local interception map.
- `tool/ui_capture/reference_renderer/harness/render.mjs` — dynamic-import Playwright orchestrator with clock, settlement, fail-closed checks (incl. `img.decode`, exact font weights, exact rects), native stage screenshot.
- `tool/ui_capture/reference_renderer/test/profile.test.mjs` — pure `node:test` for Task 1 profile constants and guard.
- `tool/ui_capture/reference_renderer/test/settlement.test.mjs` — pure `node:test` for Task 1 exhaustive settlement map versus inventory IDs.
- `tool/ui_capture/reference_renderer/test/cli.test.mjs` — pure `node:test` for Task 1 CLI parsing, normalized selection, exit mapping, and guard-before-dynamic-import source order.
- `tool/ui_capture/reference_renderer/test/manifest.test.mjs` — pure `node:test` for Task 2.
- `tool/ui_capture/reference_renderer/test/server.test.mjs` — pure `node:test` for Task 3.
- `tool/ui_capture/reference_renderer/test/preview-capture.test.mjs` — static pure `node:test` for Task 4 (reads preview file bytes via `../../../../docs/design-handoff/placeholder-app/preview/screens.html`, no browser).
- `tool/ui_capture/reference_renderer/test/render.test.mjs` — pure `node:test` for Task 5 (URL incl. profile, settlement helpers, guard order; no browser).
- `tool/ui_capture/reference_renderer/test/workflow.test.mjs` — static pure `node:test` workflow contract for Task 6 (reads workflow YAML as text, asserts dispatch-only trigger, exact install/test/browser-install steps, render/validate CLI, artifact upload, no commit; no YAML execution, no `node --check` on YAML, no shell-only fake validation).
- `tool/ui_capture/reference_renderer/README.md` — operator runbook pointer with fixed full leaf, separate subset leaf pattern, forbidden Pi flag, and manual workflow pointer.
- `docs/design-handoff/placeholder-app/preview/screens.html` — authoritative preview shell modified only with the capture-profile API (derived geometry only for exact `profile=samsung-s20fe`) plus React `CaptureBoundary` `useLayoutEffect` single commit token.
- `.github/workflows/derived-ui-reference.yml` — dedicated manual `workflow_dispatch` workflow (`all` or subset), install, render, validate, upload, no commit, no `--allow-local-render`.
- `.gitignore` — append only the renderer `node_modules/` ignore line plus the existing `.ui-diff/` coverage (already present); no other ignore change.
- `docs/implementation-status.md` — per-stage checkpoints only.

---

### Task 0: Antigravity plan review before Task 1

**Files:**
- Read: `docs/superpowers/specs/2026-09-12-derived-ui-reference-renderer-design.md`
- Read: `docs/superpowers/plans/2026-09-12-derived-ui-reference-renderer.md`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Conversation `calorix-derived-reference-renderer-20260912`, primary model `gemini-3.8-flash`, fallbacks `gemini-3.7-flash` then `gemini-3.6-flash`, `approvalMode: yolo`, read-only clause as stated in Global Constraints.

- [ ] **Step 1: Request plan review**

Prompt the conversation with the read-only clause plus this plan path and the spec path, asking for agreement status, must-fix list, placeholder check, contradiction check, path/count/subset-full check (full leaf exact 38+manifest with nothing else; subsets separate, never nested), and ESM signature consistency check across Tasks 1–5 (including `bin/render.mjs` `parseCliArgs`, `resolveCdnResource`, `replaceLeafAtomically` replace flag, `stateId` params, and no empty function bodies).

- [ ] **Step 2: Witness review**

Expected: explicit `AGREEMENT_STATUS: agree` and `MUST_FIX: none`. Otherwise apply each must-fix to this plan file, rerun the same conversation, and repeat until green.

- [ ] **Step 3: Verify no mutation**

Run: `git status --short`

Expected: the pre-existing protected `M .mcp.json` plus this plan file (untracked) and `M docs/implementation-status.md`. No other implementation, workflow, config, package, preview, asset, or manifest difference; the reviewer makes no mutation.

- [ ] **Step 4: Record, commit, and push**

Update status with conversation ID, model, verdict, and exact error text for any fallback route. Commit `Review derived renderer plan` and push `origin/fix/scan-photo-flow-viewer`, then verify remote equality with `git ls-remote origin refs/heads/fix/scan-photo-flow-viewer`.

---

### Task 1: Locked package, ignored dependency tree, pure profile/settlement constants, CLI entry, ARM pre-import guard

**Files:**
- Create: `tool/ui_capture/reference_renderer/package.json`
- Create: `tool/ui_capture/reference_renderer/package-lock.json`
- Create: `tool/ui_capture/reference_renderer/bin/render.mjs`
- Create: `tool/ui_capture/reference_renderer/harness/profile.mjs`
- Create: `tool/ui_capture/reference_renderer/harness/settlement.mjs`
- Create: `tool/ui_capture/reference_renderer/test/profile.test.mjs`
- Create: `tool/ui_capture/reference_renderer/test/settlement.test.mjs`
- Create: `tool/ui_capture/reference_renderer/test/cli.test.mjs`
- Create: `tool/ui_capture/reference_renderer/README.md`
- Modify: `.gitignore`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `tool/ui_capture/reference_renderer/package.json` sets `"type": "module"`, `"engines": { "node": ">=20 <21" }`, `"scripts": { "test": "node --test test/*.test.mjs", "render": "node bin/render.mjs", "validate": "node bin/render.mjs --validate-only" }`, exact `dependencies` pins `react@18.3.1`, `react-dom@18.3.1`, `@babel/standalone@7.29.0`, `@fontsource/geist@5.3.0`, `@fontsource/geist-mono@5.3.0`, and exact `devDependencies` pin `playwright@1.63.0`.
- `harness/profile.mjs` exact ESM surface — behavior: frozen S20 FE geometry/locale/flags/guard; `FROZEN_CHROMIUM_FLAGS` values include leading `--` and are the exact custom args passed to launch (Playwright default internal args are outside this list):
```js
export const PROFILE_ID = 'samsung-s20fe';
export const VIEWPORT_WIDTH = 360;
export const VIEWPORT_HEIGHT = 800;
export const DEVICE_SCALE_FACTOR = 3;
export const PHYSICAL_WIDTH = 1080;
export const PHYSICAL_HEIGHT = 2400;
export const BROWSER_LOCALE = 'en-US';
export const BROWSER_TIMEZONE = 'UTC';
export const FROZEN_CHROMIUM_FLAGS = ['--disable-lcd-text', '--font-render-hinting=none', '--disable-threaded-animation', '--force-color-profile=srgb', '--hide-scrollbars'];
export const RENDER_GUARD_EXIT_CODE = 11;
export function isArmArch(arch = process.arch) // returns true for 'arm'/'arm64', false otherwise
export function assertLocalRenderAllowed({ arch = process.arch, allowLocalRender = false } = {}) // throws RENDER_ARM_REFUSED when ARM without allowLocalRender
```
- `harness/settlement.mjs` exact ESM surface — behavior: exhaustive frozen map over all 19 inventory IDs; `today`/`today_empty` 1600, other 17 zero; `clockAdvanceMsFor` throws `RENDER_INVALID_INPUT` for unknown IDs (no silent default):
```js
export const SETTLEMENT_MS_BY_STATE = Object.freeze({ today: 1600, today_empty: 1600, loading: 0, login: 0, permission: 0, scan_idle: 0, scan_capturing: 0, processing: 0, review: 0, manual: 0, food: 0, food_edit: 0, history_week: 0, history_month: 0, goals: 0, goals_select: 0, ai: 0, ai_history: 0, profile: 0 });
export function clockAdvanceMsFor(stateId) // returns mapped ms; throws RENDER_INVALID_INPUT for unknown stateId
```
- `bin/render.mjs` exact ESM surface — behavior: pure CLI parsing without importing Playwright; `selection` is exactly `'all'` or a sorted duplicate-free array of explicit `<id>--<mode>` keys; ARM refusal before dynamic import of `harness/render.mjs`; exit mapping `0` success / `11` ARM refusal / `20` invalid input / `30` render failure:
```js
export function parseCliArgs(argv) // pure: parses --selection <all|<id>--<mode>,...>, --replace/--no-replace, --allow-local-render, --validate-only into { selection: 'all' | string[], replace, allowLocalRender, validateOnly }; selection defaults to 'all' when omitted; explicit keys are sorted/deduped; throws RENDER_INVALID_INPUT on empty, mixed-all, conflicting, or bad input
export async function main(argv = process.argv.slice(2)) // enforces assertLocalRenderAllowed first, then dynamically imports harness/render.mjs; maps errors to exit codes 11/20/30
```
- `.gitignore` appends exactly `tool/ui_capture/reference_renderer/node_modules/` on its own line (the ignored dependency tree). Existing `.ui-diff/` line already covers derived leaves and stays unchanged.
- `README.md` states the fixed full leaf, the separate subset leaf pattern (never nested), the forbidden Pi flag, the manual workflow name, the `test`/`render`/`validate` scripts, and that `npm test` needs no browser.

- [x] **Step 1: Write RED pure profile/settlement/CLI tests**

`test/profile.test.mjs` constructs fixtures directly from the defined profile surface (no external fixture file needed):
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_ID, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, DEVICE_SCALE_FACTOR, PHYSICAL_WIDTH, PHYSICAL_HEIGHT, BROWSER_LOCALE, BROWSER_TIMEZONE, FROZEN_CHROMIUM_FLAGS, isArmArch, assertLocalRenderAllowed, RENDER_GUARD_EXIT_CODE } from '../harness/profile.mjs';
test('frozen S20 FE profile', () => {
  assert.equal(PROFILE_ID, 'samsung-s20fe');
  assert.equal(VIEWPORT_WIDTH, 360);
  assert.equal(VIEWPORT_HEIGHT, 800);
  assert.equal(DEVICE_SCALE_FACTOR, 3);
  assert.equal(PHYSICAL_WIDTH, 1080);
  assert.equal(PHYSICAL_HEIGHT, 2400);
  assert.equal(BROWSER_LOCALE, 'en-US');
  assert.equal(BROWSER_TIMEZONE, 'UTC');
  assert.deepEqual(FROZEN_CHROMIUM_FLAGS, ['--disable-lcd-text', '--font-render-hinting=none', '--disable-threaded-animation', '--force-color-profile=srgb', '--hide-scrollbars']);
});
test('ARM refuses before browser import', () => {
  assert.equal(isArmArch('arm64'), true);
  assert.equal(isArmArch('x64'), false);
  assert.throws(() => assertLocalRenderAllowed({ arch: 'arm64', allowLocalRender: false }), /ARM without --allow-local-render/);
  assert.doesNotThrow(() => assertLocalRenderAllowed({ arch: 'x64', allowLocalRender: false }));
  assert.doesNotThrow(() => assertLocalRenderAllowed({ arch: 'arm64', allowLocalRender: true }));
  assert.equal(RENDER_GUARD_EXIT_CODE, 11);
});
test('locked pins and engines recorded', async () => {
  const pkg = JSON.parse(await import('node:fs/promises').then(async (fs) => fs.readFile(new URL('../package.json', import.meta.url), 'utf8')));
  assert.equal(pkg.dependencies['react'], '18.3.1');
  assert.equal(pkg.dependencies['react-dom'], '18.3.1');
  assert.equal(pkg.dependencies['@babel/standalone'], '7.29.0');
  assert.equal(pkg.dependencies['@fontsource/geist'], '5.3.0');
  assert.equal(pkg.dependencies['@fontsource/geist-mono'], '5.3.0');
  assert.equal(pkg.devDependencies['playwright'], '1.63.0');
  assert.equal(pkg.engines['node'], '>=20 <21');
  assert.equal(pkg.scripts['test'], 'node --test test/*.test.mjs');
  assert.ok(pkg.scripts['render'].includes('bin/render.mjs'));
  assert.ok(pkg.scripts['validate'].includes('--validate-only'));
});
```

The locked-pins test also parses `package-lock.json`, requires lockfile
version 3, requires its root dependencies/devDependencies to equal
`package.json`, and requires every direct non-link package entry to carry
the exact version plus a nonempty integrity string.

`test/settlement.test.mjs` builds the expected 19-ID list inline from the inventory contract and compares map keys (reads the real inventory file for key equality):
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SETTLEMENT_MS_BY_STATE, clockAdvanceMsFor } from '../harness/settlement.mjs';
const EXPECTED_IDS = ['loading', 'login', 'permission', 'scan_idle', 'scan_capturing', 'processing', 'review', 'manual', 'today', 'today_empty', 'food', 'food_edit', 'history_week', 'history_month', 'goals', 'goals_select', 'ai', 'ai_history', 'profile'];
test('settlement map is exhaustive over inventory IDs', () => {
  assert.deepEqual(Object.keys(SETTLEMENT_MS_BY_STATE).sort(), EXPECTED_IDS.sort());
  const inventory = JSON.parse(readFileSync(new URL('../../../../docs/design-handoff/placeholder-app/visual-state-inventory.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(SETTLEMENT_MS_BY_STATE).sort(), inventory.states.map((s) => s.id).sort());
  assert.equal(SETTLEMENT_MS_BY_STATE.today, 1600);
  assert.equal(SETTLEMENT_MS_BY_STATE.today_empty, 1600);
  for (const id of EXPECTED_IDS) { if (id !== 'today' && id !== 'today_empty') assert.equal(SETTLEMENT_MS_BY_STATE[id], 0); }
});
test('clockAdvanceMsFor maps and rejects unknown', () => {
  assert.equal(clockAdvanceMsFor('today'), 1600);
  assert.equal(clockAdvanceMsFor('today_empty'), 1600);
  assert.equal(clockAdvanceMsFor('loading'), 0);
  assert.equal(clockAdvanceMsFor('scan_idle'), 0);
  assert.throws(() => clockAdvanceMsFor('unknown'), /RENDER_INVALID_INPUT/);
});
```

`test/cli.test.mjs` tests `parseCliArgs` with inline argv arrays (for example `['--selection', 'today--dark', '--replace']` yields `{ selection: ['today--dark'], replace: true, allowLocalRender: false, validateOnly: false }`; `all` stays the string `all`; explicit keys are sorted and deduplicated; mixed `all` plus explicit keys, unknown flags, missing values, and conflicting replace flags throw `RENDER_INVALID_INPUT`). It also source-checks that `bin/render.mjs` has no static `playwright` import, compares the exact `assertLocalRenderAllowed({` call position against the exact dynamic `await import('../harness/render.mjs')` position, and invokes `main()` only under an ESM direct-execution guard so importing it in tests has no side effect. Real child-process tests require direct invalid input to exit `20`, require direct no-flag execution on ARM to exit `11`, and simulate x64 by overriding `process.arch` in an isolated child (without `--allow-local-render`) so the intentionally absent Task 5 module proves render-failure exit `30` without launching a browser.

- [x] **Step 2: Witness RED**

Run: `npm test --prefix tool/ui_capture/reference_renderer`

Expected: FAIL because `harness/profile.mjs`, `harness/settlement.mjs`, `bin/render.mjs`, `package.json` pins/engines/scripts, and the ignore line do not exist.

- [x] **Step 3: Implement minimal GREEN**

Create `package.json` with the exact pins/engines/scripts above, generate the lockfile with `npm install --package-lock-only --prefix tool/ui_capture/reference_renderer` without committing `node_modules`, create `harness/profile.mjs`, `harness/settlement.mjs`, and `bin/render.mjs` with the exact surfaces above, create `README.md`, and append the single ignore line. Do not add `no-sandbox`, vendor directories, or a cloned stage file.

- [x] **Step 4: Verify GREEN**

Run: `npm test --prefix tool/ui_capture/reference_renderer`

Expected: PASS (12 tests on the ARM host) with no browser installed. Also run `git status --short` and confirm `tool/ui_capture/reference_renderer/node_modules/` is ignored and untracked.

- [x] **Step 5: Record, review, commit, and push**

Request Antigravity post-task review in conversation `calorix-derived-reference-renderer-20260912` because the locked supply chain is substantive. Update status with source SHA, RED/GREEN evidence, and review verdict. Commit `Pin derived renderer dependencies` and push `origin/fix/scan-photo-flow-viewer`, then verify remote equality.

---

### Task 2: Input fingerprint, inventory selection, deterministic manifest, symlink-safe fixed leaves, atomic exact-leaf replacement

**Files:**
- Create: `tool/ui_capture/reference_renderer/harness/manifest.mjs`
- Create: `tool/ui_capture/reference_renderer/test/manifest.test.mjs`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `harness/manifest.mjs` exact ESM surface — behavior: deterministic fingerprint/manifest over allowlisted inputs; fixed full leaf plus separate subset leaf; default-no-replace atomic swap with temp/backup/rollback; per-component symlink plus nearest-ancestor realpath plus device/mount checks:
```js
export const MANIFEST_SCHEMA_VERSION = 1;
export const FULL_LEAF_PREFIX = '.ui-diff/expected-derived/samsung-s20fe';
export const EXPECTED_FULL_COUNT = 38;
export function selectionSha256(selection) // stable hex of sorted selection list
export function fullLeafPath(repoRoot, sourceFingerprint) // joins FULL_LEAF_PREFIX + sourceFingerprint
export function subsetLeafPath(repoRoot, sourceFingerprint, selection) // joins FULL_LEAF_PREFIX + 'subsets' + sourceFingerprint + selectionSha256(selection); never inside the full leaf
export async function sha256File(absolutePath) // hex digest of file bytes
export async function computeSourceFingerprint(repoRoot, { allowlist, readBytes } = {}) // hashes actual consumed bytes in sorted path order; returns { fingerprint, files, inventoryHash, jsxTree, previewHash, foodHash, fontDigests, lockDigest, rendererDigest, profileDigest, settlementDigest }; throws RENDER_INVALID_INPUT on missing/unallowlisted inputs
export async function readInventorySelection(repoRoot, selection) // reads visual-state-inventory.json, requires all 19 state IDs, expands 'all' to 38 sorted <id>--<mode> pairs, validates explicit selections, throws RENDER_INVALID_INPUT for unknown IDs/bad modes
export function buildDerivedManifest({ sourceFingerprint, gitCommit, gitDirty, dirtyPaths, inventoryHash, jsxTree, previewHash, foodHash, fontDigests, lockDigest, rendererDigest, profileDigest, settlementDigest, nodeVersion, npmVersion, playwrightVersion, chromiumVersion, selection, readiness, images }) // sorted keys/entries; timestamp-free; exact schema below
export async function validateFullLeaf(leafDir, manifest) // requires exactly 38 PNGs + manifest.json and nothing else (no subdirectories); throws RENDER_LEAF_EXTRA otherwise
export async function validateSubsetLeaf(leafDir, manifest, selection) // requires exactly selected count + manifest; throws RENDER_LEAF_EXTRA otherwise
export async function replaceLeafAtomically(leafDir, stagedDir, { replace = false } = {}) // default replace=false: existing target fails; replace=true swaps only a fully validated exact full leaf or exact subset leaf via validated temp/backup sibling; every pre-commit failure rolls back, while post-commit backup-cleanup failure retains the valid target plus validated backup and throws; never deletes unknown/stale files or any ancestor
export async function validateReferenceLeaf({ repoRoot, selection = 'all' } = {}) // recomputes current source fingerprint, resolves the existing full/subset leaf, parses its manifest, and validates without rendering, staging, replacing, or mutating
```
- `computeSourceFingerprint` hashes actual consumed bytes in sorted path order: the inventory JSON, every loaded `docs/design-handoff/placeholder-app/src/cx-*.jsx` file, `docs/design-handoff/placeholder-app/preview/screens.html`, referenced `docs/design-handoff/placeholder-app/assets/food/*` bytes, the exact served `node_modules` runtime JS/font files, `package.json`, `package-lock.json`, and all renderer source/profile/settlement modules (`bin/render.mjs`, `harness/profile.mjs`, `harness/settlement.mjs`, `harness/server.mjs`, `harness/render.mjs`, `harness/manifest.mjs`). Missing or unallowlisted inputs throw `RENDER_INVALID_INPUT`. The relevant dirty path set is `docs/design-handoff/placeholder-app/{visual-state-inventory.json, src/cx-*.jsx, preview/screens.html, assets/food/**}` plus `tool/ui_capture/reference_renderer/{package.json, package-lock.json, bin/render.mjs, harness/*.mjs}`; git commit plus dirty boolean/list are stored separately in the manifest.
- `readInventorySelection` reads `docs/design-handoff/placeholder-app/visual-state-inventory.json`, requires all 19 state IDs (`loading`, `login`, `permission`, `scan_idle`, `scan_capturing`, `processing`, `review`, `manual`, `today`, `today_empty`, `food`, `food_edit`, `history_week`, `history_month`, `goals`, `goals_select`, `ai`, `ai_history`, `profile`), expands `all` to 38 `<id>--<mode>` pairs in sorted order, validates explicit `<id>--<mode>` selections, and throws `RENDER_INVALID_INPUT` for unknown IDs, bad modes, or subset written at the full leaf.
- `buildDerivedManifest` emits sorted keys and sorted file entries with exactly `schemaVersion`, `sourceFingerprint`, `gitCommit`, `gitDirty`, `dirtyPaths`, `inventoryHash`, `jsxTree`, `previewHash`, `foodHash`, `fontDigests`, `lockDigest`, `rendererDigest`, `profileDigest`, `settlementDigest`, `nodeVersion`, `npmVersion`, `playwrightVersion`, `chromiumVersion`, `profile` (`logicalWidth` 360, `logicalHeight` 800, `physicalWidth` 1080, `physicalHeight` 2400, `deviceScaleFactor` 3, `locale` `en-US`, `timezone` `UTC`, `flags` frozen five with leading `--`), `selection`, `readiness`, and per-image `path`, `sha256`, `bytes`, `width` 1080, `height` 2400, `clockAdvanceMs`. No timestamps, no absolute host paths, no hostnames, no user info.
- `validateFullLeaf` requires exactly 38 PNGs plus `manifest.json` at the full leaf and no extras (any subdirectory or extra file throws `RENDER_LEAF_EXTRA`). Subset leaves require exactly the selected count plus their own manifest. Both validators require manifest names/counts, SHA256, byte sizes, and 1080×2400 PNG dimensions to match the files. All leaf/staged/temp/backup paths get per-component symlink checks, nearest-existing-ancestor `realpath` containment under the fixed prefix, device/mount escape rejection, and traversal rejection.
- `replaceLeafAtomically` with default `{ replace: false }` fails when the target exists. With `{ replace: true }` it swaps only a fully validated exact full leaf or exact subset leaf: stage to a validated temp sibling, validate it, move the existing leaf to a validated backup sibling, rename staged into place, and roll back from backup on every failure before the new target passes post-install validation. That validation is the commit point. Backup removal happens afterward; if cleanup fails, the valid committed target and retained validated backup remain and a cleanup error is thrown, because rollback from a potentially partially removed backup is unsafe. Stale or extra files fail instead of silent deletion of unknown files. Never removes any ancestor. Never touches the canonical tree.
- `validateReferenceLeaf` is side-effect free: it recomputes the current fingerprint, resolves the corresponding existing leaf, parses its manifest, and invokes the correct validator. It never imports Playwright, launches a browser, creates staging/backup paths, rewrites a manifest, or calls `replaceLeafAtomically`.

- [x] **Step 1: Write RED manifest tests**

`test/manifest.test.mjs` constructs fixtures inline (no external fixture directory needed): build a temp full-leaf fixture with 38 zero-byte PNG names plus manifest via `node:os.tmpdir()`, a subset fixture with 1 PNG, and symlink-escape fixtures created at test time:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDerivedManifest, selectionSha256, fullLeafPath, subsetLeafPath, validateFullLeaf } from '../harness/manifest.mjs';
function minimalManifestInput() {
  return { sourceFingerprint: 'abc', gitCommit: 'deadbeef', gitDirty: false, dirtyPaths: [], inventoryHash: 'i', jsxTree: 'j', previewHash: 'p', foodHash: 'f', fontDigests: {}, lockDigest: 'l', rendererDigest: 'r', profileDigest: 'pr', settlementDigest: 's', nodeVersion: '20.0.0', npmVersion: '10.0.0', playwrightVersion: '1.63.0', chromiumVersion: 'x', selection: ['today--dark'], readiness: {}, images: [] };
}
test('manifest is deterministic and timestamp-free', () => {
  const a = buildDerivedManifest(minimalManifestInput());
  const b = buildDerivedManifest(minimalManifestInput());
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(!JSON.stringify(a).match(/20\d\d-\d\d-\d\dT/));
});
test('subset leaf path is separate from full leaf', () => {
  const full = fullLeafPath('/repo', 'fp');
  const sub = subsetLeafPath('/repo', 'fp', ['today--dark']);
  assert.ok(!sub.startsWith(full + '/') || sub.includes('/subsets/'));
  assert.ok(sub.includes('/subsets/fp/'));
});
test('selection hash is stable', () => {
  assert.equal(selectionSha256(['today--dark']), selectionSha256(['today--dark']));
});
```

Plus tests, all with test-created temp dirs, that unknown inventory IDs throw `RENDER_INVALID_INPUT`, full leaves with 37 or 39 PNGs throw `RENDER_LEAF_EXTRA`, a nested `subsets/` dir inside the full leaf throws `RENDER_LEAF_EXTRA`, manifest image names/counts/hashes/bytes/dimensions must match the files, `replaceLeafAtomically` with default options fails on existing target, a forced rename failure restores the original leaf byte-for-byte, symlink path components and nearest-ancestor escapes are rejected, and device/mount escapes are rejected. A `validateReferenceLeaf` test asserts validation performs no write/rename and does not import or launch Playwright.

- [x] **Step 2: Witness RED**

Run: `npm test --prefix tool/ui_capture/reference_renderer -- test/manifest.test.mjs`

Expected: FAIL because `harness/manifest.mjs` does not exist.

- [x] **Step 3: Implement minimal GREEN**

Implement the exact surface above with sorted-key output, fixed full plus separate subset helpers, allowlisted fingerprint inputs with the documented return structure, and atomic rename with default-no-replace plus temp/backup/rollback. Keep error codes `RENDER_INVALID_INPUT` and `RENDER_LEAF_EXTRA`. Do not introduce `FINGERPRINT_DRIFT`.

- [x] **Step 4: Verify GREEN**

Run: `npm test --prefix tool/ui_capture/reference_renderer`

Expected: PASS with no browser installed. Confirm byte-identical rerun of `buildDerivedManifest` on fixed input.

- [ ] **Step 5: Record, review, commit, and push**

Request Antigravity post-task review in the same conversation because the manifest is the downstream gate contract. Update status with source SHA and RED/GREEN/review evidence. Commit `Add derived manifest and leaf safety` and push `origin/fix/scan-photo-flow-viewer`, then verify remote equality.

---

### Task 3: Strict loopback server with local interception of preview CDN URLs

**Files:**
- Create: `tool/ui_capture/reference_renderer/harness/server.mjs`
- Create: `tool/ui_capture/reference_renderer/test/server.test.mjs`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `harness/server.mjs` exact ESM surface — behavior: loopback-only allowlisted server; deterministic `resolveCdnResource` returning exact file paths or in-memory CSS bodies; Google Fonts CSS generated from exact font files; pathname-only allowlist check:
```js
export const ALLOWLIST_PATH_PREFIXES = Object.freeze(['/preview/screens.html', '/src/', '/assets/food/', '/vendor/react.development.js', '/vendor/react-dom.development.js', '/vendor/babel.min.js', '/fonts/']);
export const CDN_INTERCEPT_HOSTS = Object.freeze(['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);
export function resolveCdnResource(cdnUrl, { nodeModulesDir } = {}) // returns null for unknown URLs, else { contentType, absolutePath?, body? } with exactly one of absolutePath/body; file routes resolve exact node_modules bytes, Google CSS is deterministic in-memory body
export function isAllowedServerPath(pathname) // accepts a URL pathname only (for example '/preview/screens.html'); full URLs and non-allowlisted pathnames return false
export async function createReferenceServer({ repoRoot, nodeModulesDir } = {}) // binds 127.0.0.1 ephemeral; serves allowlisted GET paths with realpath containment; 404 non-allowlisted; rejects non-GET with RENDER_REMOTE_FETCH; content-type for .html/.jsx/.js/.css/.woff2/.png/.jpg
```
- `resolveCdnResource` maps exactly the preview's existing CDN requests to pinned local bytes: `https://unpkg.com/react@18.3.1/umd/react.development.js` to `node_modules/react/umd/react.development.js`, `https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js` to `node_modules/react-dom/umd/react-dom.development.js`, `https://unpkg.com/@babel/standalone@7.29.0/babel.min.js` to `node_modules/@babel/standalone/babel.min.js`, and Google-font CSS requests to deterministic in-memory `body` generated from the exact `node_modules/@fontsource/geist` and `node_modules/@fontsource/geist-mono` woff2 files referencing loopback `/fonts/` URLs (plus direct woff2 file mappings). Unknown CDN URLs (including unexpected `fonts.gstatic.com` file requests and unpinned React versions) return null so the caller aborts.
- `createReferenceServer` binds only `127.0.0.1` on an ephemeral port, serves only allowlisted GET paths with per-component symlink plus `realpath` containment under the repo root, returns 404 for non-allowlisted paths, rejects non-GET methods with `RENDER_REMOTE_FETCH`, and sets `content-type` for `.html`, `.jsx`, `.js`, `.css`, `.woff2`, `.png`, and `.jpg`.
- Playwright routing (used by Task 5) intercepts `CDN_INTERCEPT_HOSTS` with these resolved local bytes and aborts every other unexpected external request with `route.abort()`.

- [ ] **Step 1: Write RED server tests**

`test/server.test.mjs` asserts resolved paths (not regex-matched bytes) and pathname-only semantics:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCdnResource, isAllowedServerPath, ALLOWLIST_PATH_PREFIXES } from '../harness/server.mjs';
test('unpkg React resolves to pinned local path', () => {
  const r = resolveCdnResource('https://unpkg.com/react@18.3.1/umd/react.development.js', { nodeModulesDir: '/pkg' });
  assert.equal(r.absolutePath, '/pkg/react/umd/react.development.js');
  assert.equal(r.body, undefined);
  assert.ok(r.contentType.includes('javascript'));
});
test('unexpected external fetch resolves to null', () => {
  assert.equal(resolveCdnResource('https://example.com/evil.js', { nodeModulesDir: '/pkg' }), null);
  assert.equal(resolveCdnResource('https://unpkg.com/react@99.0.0/umd/react.development.js', { nodeModulesDir: '/pkg' }), null);
});
test('allowlist accepts pathnames only', () => {
  assert.equal(isAllowedServerPath('/preview/screens.html'), true);
  assert.equal(isAllowedServerPath('http://localhost:9999/evil'), false);
  assert.equal(isAllowedServerPath('http://127.0.0.1:9/preview/screens.html'), false);
});
```

Plus tests that traversal `..`, absolute escapes, non-GET methods, unpinned versions, and unexpected `fonts.gstatic.com` file requests return null or false, and that the Google stylesheet result has `absolutePath === undefined`, a deterministic `body` referencing only loopback `/fonts/` URLs, and exact @fontsource face/weight coverage.

- [ ] **Step 2: Witness RED**

Run: `npm test --prefix tool/ui_capture/reference_renderer -- test/server.test.mjs`

Expected: FAIL because `harness/server.mjs` does not exist.

- [ ] **Step 3: Implement minimal GREEN**

Implement the exact allowlist, `resolveCdnResource` map with deterministic font CSS, loopback bind, GET-only check, pathname-only check, and `realpath` containment. Abort semantics stay in the Task 5 driver; this module returns null or false for disallowed inputs.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --prefix tool/ui_capture/reference_renderer`

Expected: PASS with no browser installed and no network access.

- [ ] **Step 5: Record, review, commit, and push**

Request Antigravity post-task review in the same conversation because network isolation is security-substantive. Update status with source SHA and RED/GREEN/review evidence. Commit `Add derived loopback server` and push `origin/fix/scan-photo-flow-viewer`, then verify remote equality.

---

### Task 4: Capture-only API in the authoritative preview shell with React CaptureBoundary token

**Files:**
- Modify: `docs/design-handoff/placeholder-app/preview/screens.html`
- Create: `tool/ui_capture/reference_renderer/test/preview-capture.test.mjs`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Preview URL contract: `?screen=<id>&mode=<dark|light>&capture=1&profile=samsung-s20fe`. Existing `capture=1` without the exact profile keeps the canonical 402×874 fit/stage (`body.capture` + `window.CX_STATIC = true` + 402×874 centered layout, frozen motion). Only the exact `profile=samsung-s20fe` selects the derived capture profile (360×800 stage at x0/y0, `box-shadow: none`, `border: 0`, no `#bar`, no centering translate) and freezes motion. A missing or unknown profile never activates derived geometry. Without `capture=1` the interactive default 402×874 centered behavior is byte-for-byte unchanged except the additive capture branch.
- `CaptureBoundary` wraps only the selected screen in the derived profile and publishes on `#stage` exactly `data-cx-capture-screen`, `data-cx-capture-theme`, and a single `data-cx-capture-token` via React `useLayoutEffect` after commit (no ambiguous `mode` attribute). The token confirms the selected screen commit only; child state updates do not increment it, and Today settlement uses settled DOM numbers.
- `window.CX_CAPTURE_PROFILE` exposes `{ profile: 'samsung-s20fe', width: 360, height: 800, scale: 1 }` in the derived profile only, for the Task 5 driver to assert before screenshot.

- [ ] **Step 1: Write RED static preview tests**

`test/preview-capture.test.mjs` reads the preview file at the exact test-dir-relative path `../../../../docs/design-handoff/placeholder-app/preview/screens.html` (four levels up from `tool/ui_capture/reference_renderer/test/`), no browser:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../../../../docs/design-handoff/placeholder-app/preview/screens.html', import.meta.url), 'utf8');
test('capture profile keeps 402x874 default; derived needs exact profile', () => {
  assert.match(html, /width:\s*402px;\s*height:\s*874px/);
  assert.match(html, /CX_CAPTURE_PROFILE/);
  assert.match(html, /box-shadow:\s*none/);
  assert.match(html, /profile=samsung-s20fe|profile === 'samsung-s20fe'|"samsung-s20fe"/);
});
test('CaptureBoundary publishes single useLayoutEffect token without mode attribute', () => {
  assert.match(html, /CaptureBoundary/);
  assert.match(html, /useLayoutEffect/);
  assert.match(html, /data-cx-capture-token/);
  assert.match(html, /data-cx-capture-screen/);
  assert.match(html, /data-cx-capture-theme/);
  assert.ok(!html.match(/data-cx-capture-mode/));
});
```

Plus assertions that `#stage` derived CSS sets 360×800 at x0/y0 only under the exact profile branch, that `window.CX_STATIC` follows `capture=1`, that default 402×874 fit logic is intact, and that no cloned `stage.html` path appears.

- [ ] **Step 2: Witness RED**

Run: `npm test --prefix tool/ui_capture/reference_renderer -- test/preview-capture.test.mjs`

Expected: FAIL because the preview has no `CaptureBoundary`, no `CX_CAPTURE_PROFILE`, and no exact-profile 360×800 stage rule.

- [ ] **Step 3: Implement minimal GREEN**

Edit only `docs/design-handoff/placeholder-app/preview/screens.html`: add the exact-profile capture CSS branch, the `CX_CAPTURE_PROFILE` publisher (derived profile only), and the `CaptureBoundary` wrapper with single-commit `useLayoutEffect` token (screen/theme/token only). Keep the default 402×874 interactive layout, bar, and fit logic unchanged, including existing `capture=1`-without-profile behavior. Do not add vendor files, cloned stage files, or app-shipped code.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --prefix tool/ui_capture/reference_renderer`

Expected: PASS with no browser installed. Also run `git diff --check` and confirm the preview diff touches only the capture branch.

- [ ] **Step 5: Record, review, commit, and push**

Request Antigravity post-task review in the same conversation because the authoritative preview is behavior-touching. Update status with source SHA and RED/GREEN/review evidence. Commit `Add derived capture profile` and push `origin/fix/scan-photo-flow-viewer`, then verify remote equality.

---

### Task 5: CLI entry wiring plus dynamic-import Playwright orchestrator with pinned locale, frozen flags, ordered clock, settlement, fail-closed checks, native stage screenshot

**Files:**
- Modify: `tool/ui_capture/reference_renderer/bin/render.mjs` (created in Task 1; Task 5 wires its `main` to the driver below)
- Create: `tool/ui_capture/reference_renderer/harness/render.mjs`
- Create: `tool/ui_capture/reference_renderer/test/render.test.mjs`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- `harness/render.mjs` exact ESM surface — behavior: derived-profile URL builder; locale-normalized Today settlement by state ID; ordered driver with guard-first dynamic import, `img.decode`, exact font-weight and rect checks, native stage screenshot:
```js
export function buildCaptureUrl(serverBaseUrl, stateId, mode) // returns '${serverBaseUrl}/preview/screens.html?screen=<enc(stateId)>&mode=<mode>&capture=1&profile=samsung-s20fe'; throws RENDER_INVALID_INPUT for unknown state IDs or modes other than dark/light
export function normalizeTodayText(text) // strips locale grouping separators (',' plus narrow no-break space U+202F plus regular no-break space U+00A0) and trims
export function todaySettlementExpectation(stateId) // stateId 'today' returns { hero: '1420', macros: ['96', '132', '38'], requiresKcal: true, requiresG: true }; stateId 'today_empty' returns zeros; unknown stateId throws RENDER_INVALID_INPUT
export function assertTodaySettlement(domText, stateId) // requires numeric 1420 plus kcal and 96/132/38 plus g for 'today', or zeros plus kcal/g for 'today_empty', after normalization; throws RENDER_INVALID_INPUT otherwise
export async function runReferenceRender({ repoRoot, selection = 'all', replace = false, allowLocalRender = false, validateOnly = false, serverBaseUrl = null } = {}) // validateOnly delegates to validateReferenceLeaf with no browser import/write; render path follows the fixed order below
```
- When `validateOnly === true`, `runReferenceRender` calls `validateReferenceLeaf({ repoRoot, selection })` and returns before any Playwright import, server creation, browser launch, staging, manifest write, or replacement. On the render path, `runReferenceRender` order is fixed: call `assertLocalRenderAllowed({ allowLocalRender })` from `profile.mjs` before any `playwright` import; dynamically `await import('playwright')` only after the guard (no static import); launch pinned Chromium with exactly the five `--`-prefixed frozen custom flags plus pinned `en-US` locale and `UTC` timezone; create a 360×800 viewport with `deviceScaleFactor: 3`; call `page.clock.install()` before `page.goto()`; intercept `CDN_INTERCEPT_HOSTS` with `resolveCdnResource` bytes/body and abort unexpected external requests; assert `window.innerWidth === 360`, `window.innerHeight === 800`, and `window.devicePixelRatio === 3` plus exact fit/stage rects (360×800 at x0/y0); wait `document.fonts.ready` plus per-face `document.fonts.check()` for Geist weights 200/400/500/600/700 and Geist Mono weights 400/500/600 plus loaded `FontFace` entries; call `img.decode()` for every stage image then require every stage `<img>` `complete && naturalWidth > 0`; advance `clockAdvanceMsFor(stateId)` from `settlement.mjs` (1600 for `today`/`today_empty`, 0 otherwise; unknown throws); wait the settled-DOM Today numbers where applicable; assert the single `data-cx-capture-token` present (commit confirmation only, no increment claim); screenshot only the `#stage` element handle to the fixed leaves; then `buildDerivedManifest` plus `validateFullLeaf`/`validateSubsetLeaf` plus `replaceLeafAtomically(leafDir, stagedDir, { replace })`. Typed errors are `RENDER_REMOTE_FETCH`, `RENDER_FONT_MISSING`, `RENDER_IMAGE_INCOMPLETE`, `RENDER_VIEWPORT_MISMATCH`, `RENDER_DPR_MISMATCH`, `RENDER_CLOCK_MISORDER`, `RENDER_LEAF_EXTRA`, `RENDER_ARM_REFUSED`, `RENDER_INVALID_INPUT` with screen and state context and nonzero exit (CLI `11`/`20`/`30`). No partial manifest on failure.

- [ ] **Step 1: Write RED pure render tests**

`test/render.test.mjs` uses the defined helpers directly plus source-text checks on `harness/render.mjs` and `bin/render.mjs` (no browser):
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptureUrl, normalizeTodayText, todaySettlementExpectation, assertTodaySettlement } from '../harness/render.mjs';
import { FROZEN_CHROMIUM_FLAGS } from '../harness/profile.mjs';
import { clockAdvanceMsFor } from '../harness/settlement.mjs';
test('clock map and frozen custom flags', () => {
  assert.equal(clockAdvanceMsFor('today'), 1600);
  assert.equal(clockAdvanceMsFor('today_empty'), 1600);
  assert.equal(clockAdvanceMsFor('loading'), 0);
  assert.equal(clockAdvanceMsFor('food'), 0);
  assert.deepEqual(FROZEN_CHROMIUM_FLAGS, ['--disable-lcd-text', '--font-render-hinting=none', '--disable-threaded-animation', '--force-color-profile=srgb', '--hide-scrollbars']);
});
test('locale-normalized Today values by stateId', () => {
  assert.equal(normalizeTodayText('1,420'), '1420');
  assert.deepEqual(todaySettlementExpectation('today').macros, ['96', '132', '38']);
  assert.doesNotThrow(() => assertTodaySettlement('1,420 kcal 96 g 132 g 38 g', 'today'));
  assert.doesNotThrow(() => assertTodaySettlement('0 kcal 0 g 0 g 0 g', 'today_empty'));
  assert.throws(() => assertTodaySettlement('1,419 kcal 96 g 132 g 38 g', 'today'));
  assert.throws(() => todaySettlementExpectation('unknown'), /RENDER_INVALID_INPUT/);
});
test('capture URL pins screen mode capture profile', () => {
  assert.match(buildCaptureUrl('http://127.0.0.1:9', 'today', 'dark'), /screen=today&mode=dark&capture=1&profile=samsung-s20fe/);
  assert.throws(() => buildCaptureUrl('http://127.0.0.1:9', 'unknown', 'dark'));
  assert.throws(() => buildCaptureUrl('http://127.0.0.1:9', 'today', 'sepia'));
});
```

Plus source-text tests that `bin/render.mjs` parses `selection`/`replace`/`allow-local-render`/`validate-only` without importing Playwright, that `harness/render.mjs` calls the ARM guard before the dynamic `playwright` import, calls `page.clock.install` before `page.goto`, calls `img.decode`, checks `document.fonts.check` for the exact Geist/Geist Mono weights, asserts fit/stage rects, never imports `playwright` statically, never adds `no-sandbox`, never uses `svgizeGradients`, and never claims `no pending RAF`. An injected/import-seam test proves `validateOnly: true` returns through `validateReferenceLeaf` before Playwright import and performs no filesystem mutation.

- [ ] **Step 2: Witness RED**

Run: `npm test --prefix tool/ui_capture/reference_renderer -- test/render.test.mjs`

Expected: FAIL because `harness/render.mjs` and its Today normalization plus profiled URL helpers do not exist.

- [ ] **Step 3: Implement minimal GREEN**

Implement the exact helpers plus both the side-effect-free validation branch and ordered render branch of `runReferenceRender`, wiring `bin/render.mjs` `main` to pass `validateOnly` through. Keep font (exact weights), image (`decode` + complete), viewport, DPR, and rect checks fail-closed. Keep stage checks at 360×800 and DPR 3. Use the native stage handle only.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --prefix tool/ui_capture/reference_renderer`

Expected: PASS with no browser installed. No browser is launched by any unit test; browser integration belongs only to remote x86 CI in Task 7.

- [ ] **Step 5: Record, review, commit, and push**

Request Antigravity post-task review in the same conversation because the driver is the substantive runtime contract. Update status with source SHA and RED/GREEN/review evidence. Commit `Add derived Playwright orchestrator` and push `origin/fix/scan-photo-flow-viewer`, then verify remote equality.

---

### Task 6: Dedicated manual workflow for full or subset renders with install, render, validate, upload, no commit

**Files:**
- Create: `.github/workflows/derived-ui-reference.yml`
- Create: `tool/ui_capture/reference_renderer/test/workflow.test.mjs`
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Workflow `derived-ui-reference` triggers only on `workflow_dispatch` with input `subset` (comma list of `<id>--<mode>` or `all`, default `all`). It never runs on push or pull request and never gates routine `Verify`.
- Jobs run on `ubuntu-latest` x86_64 with Node 20 and execute exactly: checkout the dispatched SHA, `npm ci --prefix tool/ui_capture/reference_renderer`, `npm test --prefix tool/ui_capture/reference_renderer`, `npx playwright install --with-deps chromium` at pinned Playwright 1.63.0, render via `npm run render --prefix tool/ui_capture/reference_renderer -- --selection "$SUBSET"`, validate via `npm run validate --prefix tool/ui_capture/reference_renderer -- --selection "$SUBSET"`, and upload the validated full leaf (38 PNGs + manifest at `.ui-diff/expected-derived/samsung-s20fe/<sourceFingerprint>/` for `all`) or the selected-count subset leaf (at `.ui-diff/expected-derived/samsung-s20fe/subsets/<sourceFingerprint>/<selectionSha256>/` otherwise) plus manifest as workflow artifacts. The workflow passes no `--allow-local-render` (x64 does not require it). The workflow commits nothing, deploys nothing, and writes outside the fixed leaves only under `os.tmpdir()`.
- Full default writes and validates all 38 at the full leaf. Subset diagnostics write only at the separate subset leaf with their own selected-count manifest and are never nested inside the full leaf, never a full gate or downstream expected set.
- `test/workflow.test.mjs` is a static pure `node:test` contract: it reads `.github/workflows/derived-ui-reference.yml` as text (resolved from the test dir via `../../../../.github/workflows/derived-ui-reference.yml`) plus `package.json` scripts, and asserts dispatch-only trigger, exact `npm ci`, exact `npm test`, exact `npx playwright install --with-deps chromium`, render and validate CLI steps, artifact upload, subset-leaf separation, and no push trigger/commit/deploy/`--allow-local-render`. No YAML execution, no `node --check` on YAML, no shell-only fake validation.

- [ ] **Step 1: Write RED static workflow contract**

Create `test/workflow.test.mjs` per the interface above (reads workflow YAML as text and asserts the exact steps). RED is witnessed with the unit gate:

Run: `npm test --prefix tool/ui_capture/reference_renderer -- test/workflow.test.mjs`

Expected RED: FAIL because `.github/workflows/derived-ui-reference.yml` is absent, so the contract test fails on the missing file. Record this missing-file RED explicitly.

- [ ] **Step 2: Witness RED**

Run: `test -f .github/workflows/derived-ui-reference.yml && echo PRESENT || echo MISSING`

Expected: `MISSING` before GREEN (supplements the RED unit failure above; it is not the validation itself).

- [ ] **Step 3: Implement minimal GREEN**

Create the workflow with the exact trigger, inputs, install, test, browser install (`npx playwright install --with-deps chromium`), render, validate, and upload steps above. Add no push trigger, no `Verify` coupling, no deploy, no secret, no `--allow-local-render`, and no `no-sandbox` flag.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --prefix tool/ui_capture/reference_renderer`

Expected: PASS, including `test/workflow.test.mjs`. Also run `git diff --check` and confirm `test -f .github/workflows/derived-ui-reference.yml` prints `PRESENT`.

- [ ] **Step 5: Record, review, commit, and push**

Request Antigravity post-task review in the same conversation because CI execution is substantive. Update status with source SHA and RED/GREEN/review evidence. Commit `Add derived reference workflow` and push `origin/fix/scan-photo-flow-viewer`, then verify remote equality.

---

### Task 7: First remote x86 CI integration run, identical-rerun evidence, sampled historical Today dark comparison only

**Files:**
- Modify: `docs/implementation-status.md`

**Interfaces:**
- Consumes the Task 1–6 implementation at its pushed source SHA. Produces only status evidence: dispatch SHA, workflow run IDs, artifact IDs, manifest SHA256, PNG SHA256 list, identical-rerun comparison, and the sampled historical comparison for `today--dark.png` only.
- This task is the first remote integration run, not a forced remote RED: dispatch once; diagnose and fix only if it fails (bounded fixes return to their owning Task 1–6 contract with tests first). Determinism requires two successful runs at the same pushed SHA with byte-identical manifests and PNG hashes.
- Renderer-only report contract until the historical comparison: no auditor, reviewer, or recovery provider route (none) and no ui-diff finding counts. The historical report states run ID if the comparison tool produces one, provider routes (none — deterministic-only), real deterministic diff counts/metrics, `auditLimited`/`visualClassificationStatus` only if emitted otherwise explicitly not applicable, blockers, and sampled scope from the real result. No fresh device capture, no VLM audit, no LocateAnything, no provider calls, and no exhaustive-parity claim belongs here.

- [ ] **Step 1: Dispatch first remote integration run**

Dispatch `.github/workflows/derived-ui-reference.yml` with `subset: all` at the pushed source SHA. Record the run ID. Download the full-leaf artifact (38 PNGs plus `manifest.json`).

Use the exact GitHub CLI flow from the Calorix repo:
```bash
SOURCE_SHA="$(git rev-parse HEAD)"
gh workflow run derived-ui-reference.yml --ref fix/scan-photo-flow-viewer -f subset=all
RUN_ID="$(gh run list --workflow derived-ui-reference.yml --branch fix/scan-photo-flow-viewer --commit "$SOURCE_SHA" --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId')"
test -n "$RUN_ID"
gh run watch "$RUN_ID" --exit-status
ARTIFACT_ROOT="$(mktemp -d)"
gh run download "$RUN_ID" --dir "$ARTIFACT_ROOT"
```

Expected: PASS on a correct implementation. If it fails, record the exact failure log excerpt and run ID, then proceed to Step 2; otherwise proceed directly to Step 3.

- [ ] **Step 2: Diagnose and fix only on failure**

Apply only the minimal reviewed fixes required by the failure log. Each fix returns to its owning Task 1–6 contract, updates tests first where applicable, and re-pushes a new source SHA. Record each fix SHA. Skip this step entirely when Step 1 passes.

- [ ] **Step 3: Verify determinism with two successful runs at the same SHA**

Obtain exactly two successful `subset: all` runs at the same pushed source SHA. If Step 1 passed and no fix changed the SHA, reuse it as run A and dispatch one additional run B. If Step 1 failed or Step 2 changed the SHA, dispatch two fresh runs A/B at the final SHA. Record both run IDs and artifact IDs, download each into a distinct `mktemp -d` directory bound to `ARTIFACT_ROOT_A` and `ARTIFACT_ROOT_B`, and verify both manifests are byte-identical and every PNG SHA256 matches across reruns. If identical input and selection do not produce identical manifest plus PNG hashes, the gate fails rather than excluding PNGs from the claim.

Expected commands after both downloads (remote artifact evidence, not a local browser):
```bash
mapfile -t MANIFEST_A < <(find "$ARTIFACT_ROOT_A" -type f -name manifest.json -print)
mapfile -t MANIFEST_B < <(find "$ARTIFACT_ROOT_B" -type f -name manifest.json -print)
test "${#MANIFEST_A[@]}" -eq 1
test "${#MANIFEST_B[@]}" -eq 1
LEAF_A="$(dirname "${MANIFEST_A[0]}")"
LEAF_B="$(dirname "${MANIFEST_B[0]}")"
HASH_A="$(mktemp)"
HASH_B="$(mktemp)"
(cd "$LEAF_A" && sha256sum manifest.json ./*.png | sort) > "$HASH_A"
(cd "$LEAF_B" && sha256sum manifest.json ./*.png | sort) > "$HASH_B"
cmp "$HASH_A" "$HASH_B"
ARTIFACT_ROOT="$ARTIFACT_ROOT_A"
```

Expected: PASS with two matching hash sets. Record both run IDs, artifact IDs, manifest SHA256, and the 38 PNG hashes summary.

- [ ] **Step 4: Sampled historical Today dark comparison against the preserved Samsung actual**

Compare only the derived `today--dark.png` (1080×2400 expected) against the preserved Samsung actual `.ui-diff/captures/today-2026-08-27T15-58-52-075Z.png`: first verify that file exists and its SHA-256 equals the known `e13d6783aac36ef3fd13244401b000fb4fa1069df1dcc9f4d5c6c626ce9ba621`, failing with an exact blocker if absent or mismatched. Do not compare derived output against the canonical 402×874 set as the result.

Use ui-diff-mcp's built `handleCompareUiImages(..., defaultServerDeps, 'deterministic_only')` directly with `UI_DIFF_DETERMINISTIC_LOCATOR` unset; this executes the common-grid/pixel pipeline without model probes, VLM, or LocateAnything. Run from `/home/agent-runner/projects/ui-diff-mcp` after its normal build:
```bash
npm run build
mapfile -t DERIVED_TODAY_MATCHES < <(find "$ARTIFACT_ROOT" -type f -name today--dark.png -print)
test "${#DERIVED_TODAY_MATCHES[@]}" -eq 1
DERIVED_TODAY="${DERIVED_TODAY_MATCHES[0]}"
env -u UI_DIFF_DETERMINISTIC_LOCATOR node --input-type=module -e 'import { handleCompareUiImages, defaultServerDeps } from "./dist/src/server.js"; const [expectedImagePath,actualImagePath,projectRoot]=process.argv.slice(1); const out=await handleCompareUiImages({expectedImagePath,actualImagePath,projectRoot,runLabel:"derived-today-dark-historical"},defaultServerDeps,"deterministic_only"); process.stdout.write(JSON.stringify(out.structuredContent)+"\n");' -- "$DERIVED_TODAY" "/home/agent-runner/projects/calorix/.ui-diff/captures/today-2026-08-27T15-58-52-075Z.png" "/home/agent-runner/projects/calorix"
```

Report provider routes as none, the real deterministic diff counts/metrics, the comparison run ID if the tool produces one, `auditLimited`/`visualClassificationStatus` only if emitted otherwise explicitly not applicable, the exact blocker if the preserved actual is unavailable, and the sampled scope. This sample is historical evidence only: reflow at 360 px does not override canonical truth. Make no exhaustive-parity and no production-readiness claim from this sample.

- [ ] **Step 5: Record, review, commit, and push**

Request final Antigravity post-implementation review in conversation `calorix-derived-reference-renderer-20260912` covering Tasks 1–7 evidence. Update status with source SHAs, both run IDs, artifact IDs, manifest and PNG hashes, historical sample report fields, and review verdict. Commit `Verify derived renderer on CI` as a tracking-only commit if status changes remain, and push `origin/fix/scan-photo-flow-viewer`, then verify remote equality.

---

## Report Contract

- Tasks 1–6 reports state source SHA, RED command and expected failure, GREEN command and pass result, review conversation plus model plus verdict, and blockers. They state no auditor, reviewer, or recovery provider route (none) and no ui-diff finding counts.
- Task 7 historical report states run ID if produced, provider routes (none — deterministic-only), real deterministic diff counts/metrics, `auditLimited`/`visualClassificationStatus` only if emitted otherwise explicitly not applicable, blockers (including the exact blocker if the preserved Samsung actual is absent/mismatched), and sampled scope from the real result. It never claims fresh device evidence, VLM audit, LocateAnything, provider calls, exhaustive parity, or production readiness.

## Official References

- Playwright clock (`page.clock.install` before `page.goto`, fixed advance): https://playwright.dev/docs/clock
- Playwright browsers (pinned Chromium install): https://playwright.dev/docs/browsers
- Handoff ground truth: `docs/design-handoff/placeholder-app/README.md`, `docs/design-handoff/placeholder-app/src/*.jsx`, `docs/design-handoff/placeholder-app/preview/screens.html`, `docs/design-handoff/placeholder-app/screens.md`, `docs/design-handoff/placeholder-app/reference-images-manifest.json`.

## Self-Review: Spec Coverage, Types, Placeholders, Task Sizing

- Spec coverage: canonical immutability, fixed full leaf (exact 38+manifest, nothing else) plus separate subset leaves never nested inside it, true 360×800 stage only for exact `capture=1&profile=samsung-s20fe` with 402×874 preserved otherwise, hermetic exact pins with engines `>=20 <21` and ignored `node_modules` dependency tree plus SHA256-recorded runtime bytes, actual preview plus `CaptureBoundary` single-commit `useLayoutEffect` token (screen/theme/token only, no mode attribute, no child-update increments) with unchanged 402×874 default, strict loopback plus `resolveCdnResource` local interception with abort (resolved-path assertions; deterministic font CSS; pathname-only allowlist), exhaustive `SETTLEMENT_MS_BY_STATE` over 19 inventory IDs with throwing `clockAdvanceMsFor`, `en-US` plus `UTC` with `1,420` display and `1420` normalized settlement by state ID, font (`img.decode`, exact Geist/Geist Mono weights via `document.fonts.check` plus `FontFace`) /image/viewport/DPR/rect fail-closed checks, native stage screenshot without `svgizeGradients`, exact five `--`-prefixed custom flags (defaults outside the list) with no `no-sandbox` unless CI proves need, CLI entry `bin/render.mjs` with pure `parseCliArgs` and exit mapping `0`/`11`/`20`/`30` plus ARM pre-import refusal with Pi forbidden and no workflow `--allow-local-render`, pure `node:test` plus static `test/workflow.test.mjs` contract (no YAML `node --check`), manual dispatch with `all` default and `npx playwright install --with-deps chromium` plus `render`/`validate` scripts and artifact upload without commit, two-successful-runs determinism, and sampled historical Today dark comparison against the preserved Samsung actual (SHA-verified, deterministic-only, no canonical comparison) are each owned by exactly one task above.
- Types: error codes are exactly `RENDER_INVALID_INPUT`, `RENDER_REMOTE_FETCH`, `RENDER_FONT_MISSING`, `RENDER_IMAGE_INCOMPLETE`, `RENDER_VIEWPORT_MISMATCH`, `RENDER_DPR_MISMATCH`, `RENDER_CLOCK_MISORDER`, `RENDER_LEAF_EXTRA`, and `RENDER_ARM_REFUSED`. No `FINGERPRINT_DRIFT` type exists. CLI exit codes are exactly `0`/`11`/`20`/`30`. Manifest schema, profile/settlement constants, server allowlist, capture token attributes (screen/theme/token), Today expectations by state ID, and workflow inputs use the exact names above consistently across tasks.
- Placeholders: no `TODO`, `TBD`, `XXX`, `Lorem`, empty section, empty function body, guessed URL, or unpinned version remains. Package path is everywhere `tool/ui_capture/reference_renderer`. URLs are only the two official Playwright docs above. File names and ESM surfaces match across Tasks 1–5, and every function referenced in a test sketch is defined in its task's interface with constructible inline or temp-dir fixtures.
- Task sizing: Task 0 is review-only; Task 1 is package plus profile/settlement plus CLI entry; Task 2 is fingerprint plus manifest plus leaves; Task 3 is server plus interception; Task 4 is preview plus static tests; Task 5 is CLI wiring plus the Playwright driver plus pure tests; Task 6 is the workflow file plus static contract test; Task 7 is first remote integration plus determinism plus sampled history. Each task ends with status, review where substantive, commit, and push.
- Scope check: only this plan file and the status checkpoint change in the documentation task; no code, workflow, asset, config, package, preview, or manifest file is created or modified here.
