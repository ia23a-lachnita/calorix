# Derived UI Reference Renderer Design — Samsung S20 FE 360×800 DPR3

Date: 2026-09-12
Status: spec only, externally reviewed; user review pending
Branch: `fix/scan-photo-flow-viewer`
Baseline: `cb64320e6315885c8206b2a00ec76360c734798d`
Scope: documentation only. No application, Functions, test, Firebase, device,
  Docker, Flutter, browser, LocateAnything, deployment, or backend change in
  this task. Protected user-owned `.mcp.json` untouched.

## 1. Purpose

Calorix UI parity needs a second, device-true reference set alongside the
immutable canonical handoff, without ever mutating the canonical set.

- The canonical 38-file PNG set in
  `docs/design-handoff/placeholder-app/reference-images/` is immutable ground
  truth at 402×874 logical px. Code wins over screenshots on disagreement
  (`docs/design-handoff/placeholder-app/README.md`); screenshots are visual
  reference only.
- The physical default local device is Samsung `SM-G780G` (Galaxy S20 FE),
  Android 13, serial `R58R61161NA`, whose logical viewport is 360×800 at DPR 3.
  Flutter renders there, not at 402×874.
- This design specifies a separate derived renderer that re-renders the same
  JSX handoff (`docs/design-handoff/placeholder-app/src/`, `preview/`) into a
  fixed, symlink-safe, git-ignored derived leaf at exact S20 FE geometry, with
  hermetic dependencies, deterministic clock/animation control, fail-closed
  validation, and a manual CI workflow. It never edits, overwrites, deletes,
  or re-exports the canonical set.

Historical note: Today dark was the first parity subject; fresh
device/exhaustive parity across the full set comes later under this renderer.

## 2. Non-negotiables

1. Canonical set immutable: no edit, overwrite, delete, rename, re-encode,
   re-export, or manifest change under
   `docs/design-handoff/placeholder-app/reference-images/` (including
   `reference-images-manifest.json`, `reference-images-buggy/`,
   `good-screenshots/`).
2. Derived output lives only in one fixed ignored leaf; never beside canonical
   files, never committed.
3. True stage geometry: 360×800 CSS px stage at scale 1, origin x0/y0, no
   shadow/chrome/scaling in capture output (`box-shadow: none` in capture).
4. Hermetic: locked local Node/Playwright/npm package
   (`tool/ui_capture/reference_renderer` `package.json` +
   `package-lock.json` tracked; `react`/`react-dom`/`@babel/standalone`
   plus `@fontsource/geist` + `@fontsource/geist-mono` exact pins;
   generated `node_modules` stays ignored), no committed vendor UMD/font
   directories and no cloned `stage.html`; runtime bytes are served from
   exact `node_modules` package files and individually SHA256-recorded;
   strict loopback-only routing with local interception of the preview's
   existing unpkg/Google-font requests; all unexpected external requests
   abort.
5. Deterministic: `page.clock.install` runs before `page.goto`; fixed advance
   (1600 ms for `today`/`today_empty`, 0 ms for `loading` and every other
   current ID); browser context locale `en-US` and timezone `UTC`; frozen
   Chromium custom flags exactly `disable-lcd-text`,
   `font-render-hinting=none`, `disable-threaded-animation`,
   `force-color-profile=srgb`, `hide-scrollbars`; timestamp-free manifest.
6. Fail-closed on fonts, images, viewport, and DPR mismatch.
7. ARM/ARM64 refuses before browser import unless explicit
   `--allow-local-render` is passed; that option is forbidden on this Pi
   (see §12).
8. Manual `workflow_dispatch` only; never part of routine `Verify`.
9. `npm test` is pure `node:test`; no browser required for unit gate.

## 3. Source-of-truth order

1. `requirements.md` (camera-first, Scan default, 5-tab order, macro colors,
   under-5-second logging, cloud processing + push, amber low-confidence,
   full CRUD, Firebase Auth only).
2. `docs/design-handoff/placeholder-app/README.md` (JSX ground truth, exact
   values, Geist + Geist Mono, hairlines, gradient, theming, glass, motion,
   confidence rule).
3. `.claude/design.md` (tokens, navigation, macro mapping, motion, screen
   contracts; Today hero discrepancy isolated to debug/ui-diff fixtures).
4. `.claude/tools.md` (FVM, serial-pinned `phone-adb`, MCP catalog, ui-diff
   workflow; read before any build/device/runtime/UI-diff operation).

## 4. Alternatives considered

| Option | Verdict |
|---|---|
| A. Scale canonical 402×874 PNGs down to 360×800 in an image tool | Rejected. Resampling invents pixels, blurs hairlines/text, breaks 1:1 JSX fidelity, and hides layout reflow at true width. |
| B. Screenshot `preview/screens.html` live in a browser manually | Rejected. CDN React/Babel/fonts, live clock, uncontrolled viewport/DPR, shadows/scaling, and network flakiness make it non-reproducible. |
| C. Capture on the Samsung via `phone-adb screencap` only | Rejected as the reference producer. Device captures are runtime evidence of Flutter, not of the JSX handoff; they belong on the actual side of ui-diff, not the expected side. |
| D. Extend canonical set in place with 360×800 exports | Rejected. Mutates immutable ground truth and invalidates `reference-images-manifest.json` + `test/reference_images_manifest_test.dart`. |
| E. Separate hermetic derived renderer (chosen) | Accepted. Same JSX inputs, true 360×800 stage, locked deps, loopback-only, deterministic clock, fail-closed checks, ignored leaf, manual workflow. Canonical set untouched. |

## 5. Architecture

### 5.1 Inputs (fingerprinted, never mutated)

- JSX sources: `docs/design-handoff/placeholder-app/src/cx-theme.jsx`,
  `cx-icons.jsx`, `cx-shell.jsx`, and `cx-screen-*.jsx` loaded by
  `preview/screens.html`.
- Authoritative preview shell: the actual `preview/screens.html`, modified
  only with a capture-profile API and a React `CaptureBoundary`
  `useLayoutEffect` token; interactive/default 402×874 behavior stays
  unchanged. No cloned `stage.html` is added.
- Pinned npm dependencies (exact versions in
  `tool/ui_capture/reference_renderer/package.json` with committed
  `package-lock.json`): React 18.3.1, ReactDOM 18.3.1, Babel 7.29.0
  (`@babel/standalone`), Geist 5.3.0 (`@fontsource/geist`) + Geist Mono
  5.3.0 (`@fontsource/geist-mono`) woff2 with `font-display: block` and
  tabular numerals via `font-variant-numeric: tabular-nums`. No committed
  vendor UMD/font directories; generated `node_modules` stays ignored;
  runtime bytes are served from the exact `node_modules` package files and
  individually SHA256-recorded. Local npm bytes are hash-pinned without
  claiming the old CDN SRI.
- Food photography under `docs/design-handoff/placeholder-app/assets/food/`
  as referenced by the JSX; no new committed image assets (food assets remain
  existing).
- Manifest + test: `reference-images-manifest.json`
  (source_commit `307dfc04ee23bee022f85059cc09dc363b2e80f6`,
  source_tree `97339699422bcec8d92f2ec8e47c4179c184e034`),
  `test/reference_images_manifest_test.dart`.

Source changes update the actual-byte source fingerprint; they do not fail
merely because bytes drift. Runs fail only on invalid/missing/unallowlisted
inputs or readiness/path/contract violations. The current git commit and the
relevant-path dirty boolean/list are kept separately in the manifest (§10).

### 5.2 Components

```text
tool/ui_capture/reference_renderer/
  package.json            # locked deps: playwright 1.63.0, react 18.3.1,
                          # react-dom 18.3.1, @babel/standalone 7.29.0,
                          # @fontsource/geist 5.3.0,
                          # @fontsource/geist-mono 5.3.0 — exact pins,
                          # lockfile committed
  package-lock.json       # committed; renderer node_modules itself is ignored
  harness/
    server.mjs            # loopback-only static server (127.0.0.1, ephemeral port)
    render.mjs            # Playwright driver: clock, viewport, capture
    manifest.mjs          # deterministic manifest writer (no timestamps)
  test/                   # pure node:test unit tests (no browser)
  README.md               # operator runbook pointer (no secrets)
```

- `local node_modules ignored`: the renderer's installed `node_modules/` is
  git-ignored; only `package.json` + `package-lock.json` are tracked. No
  committed vendor UMD/font directories and no cloned `stage.html`; runtime
  bytes are served from exact `node_modules` package files and individually
  SHA256-recorded.
- `preview-only React commit token`: the capture-only branch in
  `preview/screens.html` wraps the selected screen in a `CaptureBoundary` and
  publishes the committed screen, theme, and monotonically increasing token
  on `#stage`. This preview harness code never ships in the Flutter app or
  Functions bundle.

### 5.3 Data flow

```text
JSX + pinned local dependency bytes + food assets
  -> loopback static server serving the actual preview/screens.html
     (strict route allowlist, §8; existing unpkg/Google-font requests
     intercepted with pinned local dependency bytes)
  -> Chromium 360×800 CSS, DPR 3, en-US/UTC context, frozen flags (§11)
  -> page.clock.install runs before page.goto; fixed advance per screen (§9)
  -> per-screen route (?screen=<id>&mode=<dark|light>&capture=1)
     with capture-profile API
  -> readiness predicate (fonts ready + images complete) then settled-DOM
     text wait after 1600 ms for today/today_empty (§9)
  -> native stage-element screenshot (elementHandle, no svgizeGradients)
  -> fixed ignored leaf:
     .ui-diff/expected-derived/samsung-s20fe/<source-fingerprint>/
     (<id>--<mode>.png + manifest.json)
```

No step writes outside the fixed leaf except temp files under `os.tmpdir()`.

## 6. Canonical vs derived geometry

- Canonical: 402×874 logical px, 38 files, source of visual parity for JSX
  truth. Unchanged.
- Derived: Samsung S20 FE 360×800 CSS px at `deviceScaleFactor: 3`
  (1080×2400 physical pixels). Separate renderer, separate leaf.
- Derived stage is true size: `#stage { width: 360px; height: 800px; }` at
  scale 1, positioned at x0/y0 of a 360×800 viewport, `box-shadow: none`,
  `border: 0`, no floating chrome, no `translate(-50%)` centering, no capture
  bar. Screenshot targets the stage element handle only, so output PNGs are
  exactly 1080×2400 bytes-mapped pixels.
- Responsive consequence: 360 px width reflows JSX written at 402 px. That
  reflow is the point — it shows what the handoff means on the S20 FE — but
  derived PNGs never redefine correctness of the canonical set.

## 7. Exact derived inventory (38 files, fixed names)

Same basenames as canonical, same dark/light pairing, written only into the
full-gate leaf stated literally in §10:

```text
ai--dark.png, ai--light.png,
ai_history--dark.png, ai_history--light.png,
food--dark.png, food--light.png,
food_edit--dark.png, food_edit--light.png,
goals--dark.png, goals--light.png,
goals_select--dark.png, goals_select--light.png,
history_month--dark.png, history_month--light.png,
history_week--dark.png, history_week--light.png,
loading--dark.png, loading--light.png,
login--dark.png, login--light.png,
manual--dark.png, manual--light.png,
permission--dark.png, permission--light.png,
processing--dark.png, processing--light.png,
profile--dark.png, profile--light.png,
review--dark.png, review--light.png,
scan_capturing--dark.png, scan_capturing--light.png,
scan_idle--dark.png, scan_idle--light.png,
today--dark.png, today--light.png,
today_empty--dark.png, today_empty--light.png
```

Plus exactly one `manifest.json` (timestamp-free, §10). The full-gate leaf
contains exactly 38 PNGs plus `manifest.json` and is the only downstream
ui-diff input. Full default writes/validates all 38 at the base leaf. No
other files may appear at the base leaf; extras fail validation (`safe
exact-leaf replace`, §10). Optional subset diagnostics are written only
beneath `.ui-diff/expected-derived/samsung-s20fe/<source-fingerprint>/subsets/<selection-sha256>/`
with their own selected-count manifest; they are never a full
gate/downstream expected set.

## 8. Network isolation

- Actual preview through the strict local server: the renderer loads the
  actual `preview/screens.html` (as modified only by the capture-profile API
  in §5.1) through the loopback-only server and intercepts its existing
  `unpkg.com`/Google-font (`fonts.googleapis.com`, `fonts.gstatic.com`)
  requests with the pinned local dependency bytes from exact `node_modules`
  package files.
- Capture aborts all unexpected external requests: any other remote origin,
  non-allowlisted path, `http://localhost:<other-port>`, or non-GET method
  returns 404/abort via Playwright `route.abort()` and fails the run.
- Production Firebase/provider/OFF/Vertex calls are out of scope and must not
  occur.

## 9. Deterministic time and motion

- `page.clock.install` runs before `page.goto`,
  per official clock guidance (https://playwright.dev/docs/clock).
- Fixed advance per screen after the readiness predicate (fonts ready +
  images complete; no `no pending RAF` claim and no second parent render
  token):
  - `today` / `today_empty`: advance exactly 1600 ms, then wait on the exact
    settled DOM numeric values. Normalize locale separators before matching
    `1420`, `96`, `132`, `38` or zeros; with the pinned `en-US` context the
    hero is displayed as `1,420` (covers ~1.4 s count-up and ~1.2 s macro-bar
    fill end-states).
  - `loading` and every other current ID: advance 0 ms; capture frozen
    end-state (`CX_STATIC`-equivalent flag, animations/transitions disabled,
    shimmer off).
- No wall-clock, no `Date.now()` in manifest, no random seeds.

## 10. Output leaf, manifest, and replacement safety

- Full output path, stated literally (ignored, never committed):
  `.ui-diff/expected-derived/samsung-s20fe/<source-fingerprint>/`, validated
  as a symlink-safe directory (rejects symlinks, mount escapes, and
  traversal; resolves `realpath` and requires containment).
- The full-gate leaf contains exactly 38 PNGs plus `manifest.json` and is the
  only downstream ui-diff input. Full default writes/validates all 38 at the
  base leaf.
- Optional subset conflict resolution: subset diagnostics are written only
  beneath
  `.ui-diff/expected-derived/samsung-s20fe/<source-fingerprint>/subsets/<selection-sha256>/`
  with their own selected-count manifest; they are never a full
  gate/downstream expected set.
- Timestamp-free deterministic manifest with sorted keys and sorted file
  entries. Schema must include: `schemaVersion`, `sourceFingerprint`, git
  commit, relevant-path dirty boolean/list, inventory and JSX hashes/tree,
  preview hash, food/font/lock/renderer/profile/settlement component hashes,
  Node/npm/Playwright/Chromium versions, profile logical/physical/DPR
  (360×800 CSS, 1080×2400 physical, DPR 3), exact frozen flags (§11),
  browser locale `en-US` and timezone `UTC`, selection and readiness
  assertions, and for each image its path/hash/bytes
  dimensions (`1080×2400`)/clock advance. No timestamps, no absolute host
  paths, no hostnames, no user info.
- Fingerprint all actual inputs: SHA-256 over every JSX/preview/food/font
  byte consumed from exact `node_modules` package files, plus
  `package-lock.json` digest; recorded in the manifest as the actual-byte
  source fingerprint. Source changes update that fingerprint; they do not
  fail merely because bytes drift. Runs fail only on
  invalid/missing/unallowlisted inputs or readiness/path/contract violations.
  The current git commit and the relevant-path dirty boolean/list are kept
  separately in the manifest.
- Safe replace targets exactly either one validated full leaf or one
  validated subset leaf: the renderer writes to a temp sibling, validates
  the full 38 + manifest inventory (or the selected-count subset inventory
  for a subset leaf), then atomically renames; stale/extra files cause
  failure instead of silent deletion of unknown user files. Never touches
  the canonical tree.

## 11. Browser determinism

- Pinned browser: Playwright 1.63.0 managed Chromium (see
  https://playwright.dev/docs/browsers); `npx playwright install chromium`
  with pinned version only.
- Browser context is pinned to locale `en-US` and timezone `UTC`. Frozen
  deterministic custom Chromium flags are exactly:
  `--disable-lcd-text`, `--font-render-hinting=none`,
  `--disable-threaded-animation`, `--force-color-profile=srgb`,
  `--hide-scrollbars`. No other flags are added; nonexistent or unapproved
  flags (including `disable-animations` and `gpu-shader-disk-cache`) are
  removed. `no-sandbox` is not added unless implementation proves CI
  requires it. Omission or substitution of any frozen flag fails the run.
- Native stage screenshot without `svgizeGradients`: element screenshot via
  the stage handle; no SVG gradient rewriting (avoids color-space drift on
  the tri-color gradient).
- Exact Today final checks (post-capture assertions before manifest write):
  normalize locale separators and require numeric content `1420` plus `kcal`
  and `96`/`132`/`38` plus `g` (zeros variant for `today_empty`); the pinned
  `en-US` hero display is `1,420`,
  triple macro ring settled, protein/carbs/fat rows at fixture values,
  bottom nav 5-tab order with centered Scan FAB, tabular numerals active.
  but settlement does not depend on punctuation. Do not require computed
  no-pure-color checks unrelated to renderer readiness.

## 12. Platform guard

- ARM/ARM64 refusal before browser import: `render.mjs` checks
  `process.arch` (`arm`/`arm64`) and exits nonzero with a stable error code
  before importing `playwright`, unless the explicit `--allow-local-render`
  option is passed.
- That option is forbidden on this Pi: the current host is a
  resource-constrained ARM Pi where emulated Chromium + Flutter previously
  contributed to CPU/I/O starvation and reboot; local browser runs stay
  prohibited here. Authoritative renders run on pinned x86 CI
  (`workflow_dispatch`) or a capable x86 host.

## 13. Validation, errors, and path safety

- Fonts fail-closed: `document.fonts.ready` + per-face `FontFaceSet.check()`
  for Geist/Geist Mono weights used; any missing face fails the screen.
- Images fail-closed: every `<img>` in the stage must be `complete &&
  naturalWidth > 0`; broken/missing food art fails the screen.
- Viewport/DPR fail-closed: assert
  `window.innerWidth === 360 && window.innerHeight === 800` and
  `window.devicePixelRatio === 3` inside the page before capture; mismatch
  fails the run.
- Validation errors are typed (`RENDER_*` codes: `REMOTE_FETCH`,
  `FONT_MISSING`, `IMAGE_INCOMPLETE`, `VIEWPORT_MISMATCH`, `DPR_MISMATCH`,
  `CLOCK_MISORDER`, `LEAF_EXTRA`) with screen/mode context; nonzero exit;
  no partial manifest. There is no `FINGERPRINT_DRIFT` failure: source
  changes update the actual-byte source fingerprint (§10) and fail only on
  invalid/missing/unallowlisted inputs or readiness/path/contract
  violations.
- Path safety: all served/derived paths resolved + `realpath` containment
  checked against repo root / fixed leaf; rejects `..`, absolute escapes,
  and symlinks pointing outside.

## 14. TDD and CI

- `npm test` is pure `node:test` (no browser): manifest determinism
  (byte-identical rerun), route allowlist with local interception,
  full/subset leaf-replace safety, clock-map (`1600` for
  `today`/`today_empty`, `0` for `loading` and every other current ID),
  pinned `en-US`/UTC context,
  frozen exact flag list (§11), `--allow-local-render` guard, failure
  taxonomy without `FINGERPRINT_DRIFT`.
- RED first: each contract fails for the intended gap (e.g. unexpected
  external fetch allowed, timestamp in manifest, missing/substituted flag,
  ARM import before guard, subset written at the base leaf), then GREEN with
  minimal implementation.
- Manual `workflow_dispatch`, full default `all` 38: inputs `subset` (comma
  list of `<id>--<mode>` or `all`, default `all`), runner installs pinned
  browser, writes/validates the full 38 + manifest at the base leaf
  `.ui-diff/expected-derived/samsung-s20fe/<source-fingerprint>/` for `all`,
  or writes/validates only subset diagnostics beneath
  `subsets/<selection-sha256>/` with their own selected-count manifest for a
  selection; subset leaves are never a full gate/downstream expected set.
  The workflow validates leaf + manifest, uploads them as artifacts, and
  never commits. This workflow is not routine `Verify` and never gates pushes.
- Routine `Verify` remains Functions/Flutter; renderer changes do not alter it.

## 15. Acceptance criteria

1. `npm test` (pure `node:test`) green with no browser installed.
2. Determinism: the same locked x86 CI runtime and identical
   input/selection produce identical manifest and PNG hashes; if that cannot
   be achieved the gate fails rather than excluding PNGs from the claim.
3. Canonical tree byte-identical before/after (manifest test
   `test/reference_images_manifest_test.dart` unaffected).
4. Unexpected external fetch provably aborted; loopback-only plus local
   interception proof in logs.
5. Today/today_empty dark/light locale-normalized settled-text checks pass
   (`1420` plus `kcal` and `96`/`132`/`38` plus `g`, or zeros; displayed hero
   `1,420` under pinned `en-US`); all screens 1080×2400 output.
6. ARM run without `--allow-local-render` exits before browser import with
   stable code.
7. Manual workflow validates, uploads, and commits nothing.

## 16. Non-goals

- No Flutter/Dart change; no Functions/backend change.
- No Firebase/GCP write, deploy, rules, or production-data change.
- No phone operation (`phone-adb`), no LocateAnything, no ui-diff pipeline
  change, no VLM audit.
- No canonical PNG/manifest edit; no new committed image assets (food assets
  remain existing and derived PNGs stay ignored; local dependency font bytes
  are installed, not committed).
- No release build, signing, or store submission.
- No meal-mass/macro calibration, prompt, or nutrition-behavior change.
- No production-readiness or exhaustive-parity claim from derived PNGs alone.

## 17. Official references

- Playwright clock: https://playwright.dev/docs/clock
- Playwright browsers (Chromium install/pinning):
  https://playwright.dev/docs/browsers
- Handoff ground truth: `docs/design-handoff/placeholder-app/README.md`,
  `src/*.jsx`, `preview/screens.html`, `screens.md`,
  `reference-images-manifest.json`.

## 18. External review

- Antigravity MCP conversation `calorix-derived-reference-renderer-20260912`,
  model `gemini-3.8-flash`, `approvalMode: yolo`, read-only prompt (no file
  edits, no write commands, no repository mutation; inspect, reason, review,
  and propose only).
- Result: `AGREEMENT_STATUS: agree`, `MUST_FIX: none`.
- Adopted SHOULD fixes (non-blocking, folded into this spec):
  1. Capture `box-shadow: none` — adopted as §2.3 and §6 true-stage geometry.
  2. Settled text rather than a second parent render token — adopted as §9
     settled-DOM numeric wait (`1420`, `96`, `132`, `38` or zeros) and §11
     locale-normalized Today text-content checks.
  3. `hide-scrollbars` — adopted as one of the five frozen flags in §11.
  4. Prior must-fix closure already described above (green
     `AGREEMENT_STATUS: agree`, `MUST_FIX: none`).

## 19. Self-review: placeholders and contradictions

- Placeholder check: no `TODO`, `TBD`, `XXX`, `Lorem`, or empty section
  remains; version pins are exact (React 18.3.1, ReactDOM 18.3.1, Babel
  7.29.0 via `@babel/standalone`, `@fontsource/geist` 5.3.0,
  `@fontsource/geist-mono` 5.3.0, Playwright 1.63.0); package path is
  everywhere `tool/ui_capture/reference_renderer`; URLs are the two official
  Playwright docs above; no guessed URLs elsewhere.
- Contradiction check: derived reflow at 360 px does not override canonical
  402 px truth (§6 vs §2.1 — resolved: canonical immutable, derived separate);
  Today locale-normalized `1420` plus `kcal` and `96`/`132`/`38` plus `g`
  (or zeros) matches the source while the pinned `en-US` capture displays
  `1,420`; settlement is punctuation-independent and excludes computed
  no-pure-color checks (§9, §11); `preview-only React commit token` does not
  ship React to the app (resolved: §5.2 capture-only preview branch + ignored
  `node_modules`,
  runtime bytes from exact package files, installed not committed); no
  committed vendor UMD/font directories and no cloned `stage.html`
  (resolved: §5.1–§5.2 actual `preview/screens.html` plus capture-profile
  API and `CaptureBoundary` token, local interception); source changes update
  the actual-byte source fingerprint and fail only on
  invalid/missing/unallowlisted inputs or readiness/path/contract violations
  (resolved: §5.1, §10, §13 — no `FINGERPRINT_DRIFT`); `page.clock.install`
  runs before `page.goto` with no `no pending RAF`
  claim, and no second parent render token (resolved: §9); frozen flags are
  exactly the five in §11 with no `disable-animations`,
  `gpu-shader-disk-cache`, or `no-sandbox` unless implementation proves CI
  requires it; manual workflow does not gate `Verify` (resolved: §14);
  `--allow-local-render` exists but is forbidden on this Pi (resolved: §12 —
  the option exists for capable x86 runs, never for this host).
- Paths/counts/subset-full check: full output path is literally
  `.ui-diff/expected-derived/samsung-s20fe/<source-fingerprint>/` (§10);
  full-gate leaf is exactly 38 PNGs plus `manifest.json` and is the only
  downstream ui-diff input (§7, §10); full default writes/validates all 38 at
  the base leaf; subset diagnostics live only beneath
  `subsets/<selection-sha256>/` with their own selected-count manifest and
  are never a full gate/downstream expected set (§7, §10, §14); safe replace
  targets exactly either one validated full leaf or one validated subset leaf
  (§10); inventory names count 38 (§7); manifest schema lists
  `schemaVersion`, `sourceFingerprint`, git commit, dirty boolean/list,
  inventory/JSX hashes/tree, preview/food/font/lock/renderer/profile/
  settlement hashes, Node/npm/Playwright/Chromium versions, profile
  logical/physical/DPR, exact flags, selection/readiness assertions, and
  per-image path/hash/bytes/dimensions/clock advance with no timestamps or
  absolute host paths (§10).
- Scope check: only this spec file and the status checkpoint change in the
  documentation task; no code, workflow, asset, or config file is created or
  modified here.

## 20. Next steps (not in this task)

1. Mandatory spec re-review in the same Antigravity conversation before
   implementation (green required).
2. Then a bounded implementation plan (renderer skeleton, hermetic pins,
   harness TDD) as a separate change; implementation itself follows later.
