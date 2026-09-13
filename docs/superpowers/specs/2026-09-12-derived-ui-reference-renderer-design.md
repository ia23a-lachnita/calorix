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
2. Derived output lives only in fixed ignored leaves; never beside canonical
   files, never committed. The full leaf is exactly
   `.ui-diff/expected-derived/samsung-s20fe/<sourceFingerprint>/` and contains
   exactly 38 PNGs plus `manifest.json` and nothing else — no subdirectories,
   no extra files. Subset diagnostics live separately at
   `.ui-diff/expected-derived/samsung-s20fe/subsets/<sourceFingerprint>/<selectionSha256>/`,
   never nested inside the full leaf.
3. True stage geometry: 360×800 CSS px stage at scale 1, origin x0/y0, no
   shadow/chrome/scaling in capture output (`box-shadow: none` in capture).
   Derived geometry activates only for the exact capture URL
   `?screen=<id>&mode=<dark|light>&capture=1&profile=samsung-s20fe`. Existing
   `capture=1` behavior without that exact profile stays at the canonical
   402×874 fit/stage; a missing or unknown profile never activates derived
   geometry.
4. Hermetic: locked local Node/Playwright/npm package
   (`tool/ui_capture/reference_renderer` `package.json` +
   `package-lock.json` tracked; `react`/`react-dom`/`@babel/standalone`
   plus `@fontsource/geist` + `@fontsource/geist-mono` exact pins;
   generated `node_modules` stays ignored as the ignored dependency tree),
   no committed vendor UMD/font directories and no cloned `stage.html`;
   runtime bytes are served from exact `node_modules` package files and
   individually SHA256-recorded; strict loopback-only routing with local
   interception of the preview's existing unpkg/Google-font requests; all
   unexpected external requests abort.
5. Deterministic: `page.clock.install` runs before `page.goto`; exhaustive
   frozen `SETTLEMENT_MS_BY_STATE` map with exactly the 19 inventory IDs —
   `today`/`today_empty` advance 1600 ms, the other 17 advance 0 ms (see §9);
   `clockAdvanceMsFor` throws `RENDER_INVALID_INPUT` for unknown IDs (no
   silent default); browser context locale `en-US` and timezone `UTC`; frozen
   Chromium custom flags are exactly the custom args passed to launch:
   `--disable-lcd-text`, `--font-render-hinting=none`,
   `--disable-threaded-animation`, `--force-color-profile=srgb`,
   `--hide-scrollbars` (each value includes its leading double hyphens;
   Playwright's own default internal Chromium args are outside this custom
   list and are not enumerated here); timestamp-free manifest.
6. Fail-closed on fonts, images, viewport, and DPR mismatch.
7. ARM/ARM64 refuses before browser import unless explicit
   `--allow-local-render` is passed; that option is forbidden on this Pi
   (see §12). The CLI entry `bin/render.mjs` parses `selection`, `replace`,
   and `allow-local-render` without importing Playwright; the ARM refusal
   happens before the dynamic import of `harness/render.mjs`.
8. Manual `workflow_dispatch` only; never part of routine `Verify`.
9. `npm test` is pure `node:test`; no browser required for unit gate. Package
   engine is `>=20 <21`. Package scripts define separate `test` (browserless
   unit gate), `render`, and `validate` CLIs consistently with Task 6.

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
| E. Separate hermetic derived renderer (chosen) | Accepted. Same JSX inputs, true 360×800 stage, locked deps, loopback-only, deterministic clock, fail-closed checks, ignored leaves, manual workflow. Canonical set untouched. |

## 5. Architecture

### 5.1 Inputs (fingerprinted, never mutated)

- JSX sources: every `docs/design-handoff/placeholder-app/src/cx-*.jsx` file
  loaded by `preview/screens.html` (`cx-theme.jsx`, `cx-icons.jsx`,
  `cx-shell.jsx`, and each `cx-screen-*.jsx`).
- Inventory: `docs/design-handoff/placeholder-app/visual-state-inventory.json`
  (all 19 state IDs).
- Authoritative preview shell: the actual `preview/screens.html`, modified
  only with a capture-profile API and a React `CaptureBoundary`
  `useLayoutEffect` token; existing `capture=1` 402×874 behavior stays
  unchanged, and derived 360×800 geometry activates only when the exact
  `profile=samsung-s20fe` parameter is present alongside `capture=1`
  (§6, Task 4). No cloned `stage.html` is added.
- Pinned npm dependencies (exact versions in
  `tool/ui_capture/reference_renderer/package.json` with committed
  `package-lock.json`): React 18.3.1, ReactDOM 18.3.1, Babel 7.29.0
  (`@babel/standalone`), Geist 5.3.0 (`@fontsource/geist`) + Geist Mono
  5.3.0 (`@fontsource/geist-mono`) woff2 with `font-display: block` and
  tabular numerals via `font-variant-numeric: tabular-nums`. No committed
  vendor UMD/font directories; generated `node_modules` stays ignored as the
  ignored dependency tree; runtime bytes are served from the exact
  `node_modules` package files and individually SHA256-recorded. Local npm
  bytes are hash-pinned without claiming the old CDN SRI.
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
                          # lockfile committed; engines node >=20 <21;
                          # scripts: test (browserless), render, validate
  package-lock.json       # committed; renderer node_modules itself is ignored
  bin/render.mjs          # CLI entry: parseCliArgs pure parser; ARM refusal
                          # before dynamic import of harness/render.mjs
  harness/
    profile.mjs           # frozen geometry/locale/flags/ARM-guard constants
    settlement.mjs        # exhaustive SETTLEMENT_MS_BY_STATE + clockAdvanceMsFor
    server.mjs            # loopback-only static server (127.0.0.1, ephemeral port)
    render.mjs            # Playwright driver: clock, viewport, capture
    manifest.mjs          # fingerprint + deterministic manifest + safe leaf replace
  test/                   # pure node:test unit tests (no browser)
    profile.test.mjs, settlement.test.mjs, cli.test.mjs, manifest.test.mjs,
    server.test.mjs, preview-capture.test.mjs, render.test.mjs,
    workflow.test.mjs
  README.md               # operator runbook pointer (no secrets)
```

- `local node_modules ignored`: the renderer's installed `node_modules/` is
  git-ignored as the ignored dependency tree; only `package.json` +
  `package-lock.json` are tracked. No committed vendor UMD/font directories
  and no cloned `stage.html`; runtime bytes are served from exact
  `node_modules` package files and individually SHA256-recorded.
- `preview-only React commit token`: the capture-only branch in
  `preview/screens.html` wraps the selected screen in a `CaptureBoundary`
  that publishes exactly one commit token on `#stage` confirming the selected
  screen commit (`data-cx-capture-screen`, `data-cx-capture-theme`,
  `data-cx-capture-token`; no ambiguous `mode` attribute), published only in
  the derived profile. The token does not increment for child state updates;
  Today settlement uses settled DOM numbers (§9), not token counting. This
  preview harness code never ships in the Flutter app or Functions bundle.
- `bin/render.mjs` CLI entry: exports pure `parseCliArgs(argv)` returning
  `{ selection, replace, allowLocalRender, validateOnly }`, where
  `selection` is exactly the string `all` or a sorted, duplicate-free
  array of explicit `<id>--<mode>` keys; parses
  `--selection`, `--replace`/`--no-replace`, `--allow-local-render`, and
  `--validate-only` without importing Playwright; enforces the ARM refusal
  before dynamically importing `harness/render.mjs`. Exit codes: `0` success;
  `11` ARM refusal (`RENDER_ARM_REFUSED`); `20` invalid CLI/input
  (`RENDER_INVALID_INPUT`); `30` render/validation failure (other `RENDER_*`).

### 5.3 Data flow

```text
JSX + inventory JSON + pinned local dependency bytes + food assets
  -> loopback static server serving the actual preview/screens.html
     (strict route allowlist, §8; existing unpkg/Google-font requests
     intercepted with pinned local dependency bytes via resolveCdnResource)
  -> Chromium 360×800 CSS, DPR 3, en-US/UTC context, frozen custom flags (§11)
  -> page.clock.install runs before page.goto; fixed advance per screen (§9)
  -> per-screen route (?screen=<id>&mode=<dark|light>&capture=1&profile=samsung-s20fe)
     with capture-profile API (derived geometry only for that exact profile)
  -> readiness predicate (fonts ready + images complete incl. img.decode) then
     settled-DOM text wait after 1600 ms for today/today_empty (§9)
  -> native stage-element screenshot (elementHandle, no svgizeGradients)
  -> fixed ignored full leaf:
     .ui-diff/expected-derived/samsung-s20fe/<sourceFingerprint>/
     (38 <id>--<mode>.png + manifest.json, nothing else)
     or, for subset diagnostics only, the separate subset leaf:
     .ui-diff/expected-derived/samsung-s20fe/subsets/<sourceFingerprint>/<selectionSha256>/
```

No step writes outside the fixed leaves except temp files under `os.tmpdir()`
and validated temp/backup siblings of the target leaf (§10).

## 6. Canonical vs derived geometry

- Canonical: 402×874 logical px, 38 files, source of visual parity for JSX
  truth. Unchanged.
- Derived: Samsung S20 FE 360×800 CSS px at `deviceScaleFactor: 3`
  (1080×2400 physical pixels). Separate renderer, separate leaves.
- Existing `capture=1` without `profile=samsung-s20fe` keeps the canonical
  402×874 fit/stage behavior byte-for-byte. Only the exact derived URL with
  `capture=1&profile=samsung-s20fe` changes fit/stage to `#stage {
  width: 360px; height: 800px; }` at scale 1, positioned at x0/y0 of a
  360×800 viewport, `box-shadow: none`, `border: 0`, no floating chrome, no
  `translate(-50%)` centering, no capture bar. A missing or unknown profile
  never activates derived geometry. Screenshot targets the stage element
  handle only, so output PNGs are exactly 1080×2400 bytes-mapped pixels.
- The Task 5 driver asserts exact fit/stage rects (360×800 stage at x0/y0)
  before capture in the derived profile.
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
`.ui-diff/expected-derived/samsung-s20fe/<sourceFingerprint>/` contains
exactly 38 PNGs plus `manifest.json` and nothing else — no subdirectories,
no extra files — and is the only downstream ui-diff input. Full default
writes/validates all 38 at the full leaf. Optional subset diagnostics are
written only at the separate subset leaf
`.ui-diff/expected-derived/samsung-s20fe/subsets/<sourceFingerprint>/<selectionSha256>/`
with their own selected-count manifest; they are never nested inside the full
leaf and are never a full gate/downstream expected set.

## 8. Network isolation

- Actual preview through the strict local server: the renderer loads the
  actual `preview/screens.html` (as modified only by the capture-profile API
  in §5.1) through the loopback-only server and intercepts its existing
  `unpkg.com`/Google-font (`fonts.googleapis.com`, `fonts.gstatic.com`)
  requests with the pinned local dependency bytes resolved from exact
  `node_modules` package files via `resolveCdnResource`.
- `resolveCdnResource(cdnUrl, { nodeModulesDir })` returns `null` for unknown
  URLs or `{ contentType, absolutePath?, body? }` for known ones, with exactly
  one of `absolutePath` or `body`. JavaScript and direct font routes use
  `absolutePath` for the exact pinned `node_modules` file; the Google Fonts
  stylesheet route uses deterministic in-memory `body`. Callers test resolved
  paths for file-backed routes and exact generated CSS for the stylesheet.
- Google Fonts CSS is generated deterministically from the exact
  `@fontsource` woff2 files and references loopback `/fonts/` URLs; every
  unexpected `fonts.gstatic.com`/`fonts.googleapis.com` request aborts.
- Capture aborts all unexpected external requests: any other remote origin,
  non-allowlisted path, `http://localhost:<other-port>`, or non-GET method
  returns 404/abort via Playwright `route.abort()` and fails the run.
- `isAllowedServerPath(pathname)` accepts a URL pathname (for example
  `/preview/screens.html`), not a full URL; full-URL inputs are rejected.
- Production Firebase/provider/OFF/Vertex calls are out of scope and must not
  occur.

## 9. Deterministic time and motion

- `page.clock.install` runs before `page.goto`,
  per official clock guidance (https://playwright.dev/docs/clock).
- Exhaustive frozen settlement map `SETTLEMENT_MS_BY_STATE` (in
  `harness/settlement.mjs`) covers all 19 exact inventory IDs:
  `today: 1600`, `today_empty: 1600`, and `0` for each of the other 17
  (`loading`, `login`, `permission`, `scan_idle`, `scan_capturing`,
  `processing`, `review`, `manual`, `food`, `food_edit`, `history_week`,
  `history_month`, `goals`, `goals_select`, `ai`, `ai_history`, `profile`).
  `clockAdvanceMsFor(stateId)` returns the mapped value and throws
  `RENDER_INVALID_INPUT` for unknown IDs; there is no silent default. The
  pure test compares the map keys against the 19 inventory IDs.
- Fixed advance per screen after the readiness predicate (fonts ready +
  images complete incl. `img.decode`; no `no pending RAF` claim and no second
  parent render token):
  - `today` / `today_empty`: advance exactly 1600 ms, then wait on the exact
    settled DOM numeric values. Normalize locale separators before matching
    `1420`, `96`, `132`, `38` or zeros; with the pinned `en-US` context the
    hero is displayed as `1,420` (covers ~1.4 s count-up and ~1.2 s macro-bar
    fill end-states).
  - The other 17 IDs: advance 0 ms; capture frozen end-state
    (`CX_STATIC`-equivalent flag, animations/transitions disabled, shimmer
    off).
- No wall-clock, no `Date.now()` in manifest, no random seeds.

## 10. Output leaves, manifest, and replacement safety

- Full output path, stated literally (ignored, never committed):
  `.ui-diff/expected-derived/samsung-s20fe/<sourceFingerprint>/`, validated
  as a symlink-safe directory: every path component is checked for symlinks,
  the nearest existing ancestor's `realpath` must contain the resolved leaf,
  device/mount escapes are rejected, and traversal is rejected; the leaf
  resolves `realpath` containment under the fixed prefix.
- The full-gate leaf contains exactly 38 PNGs plus `manifest.json` and
  nothing else (no subdirectories) and is the only downstream ui-diff input.
  Full default writes/validates all 38 at the full leaf.
- Subset conflict resolution: subset diagnostics are written only at the
  separate subset leaf
  `.ui-diff/expected-derived/samsung-s20fe/subsets/<sourceFingerprint>/<selectionSha256>/`
  with their own selected-count manifest; they are never nested inside the
  full leaf and are never a full gate/downstream expected set.
- Timestamp-free deterministic manifest with sorted keys and sorted file
  entries. Schema must include: `schemaVersion`, `sourceFingerprint`, git
  commit, relevant-path dirty boolean/list, inventory and JSX hashes/tree,
  preview hash, food/font/lock/renderer/profile/settlement component hashes,
  Node/npm/Playwright/Chromium versions, profile logical/physical/DPR
  (360×800 CSS, 1080×2400 physical, DPR 3), exact frozen custom flags (§11),
  browser locale `en-US` and timezone `UTC`, selection and readiness
  assertions, and for each image its path/hash/bytes
  dimensions (`1080×2400`)/clock advance. No timestamps, no absolute host
  paths, no hostnames, no user info.
- `computeSourceFingerprint(repoRoot, { allowlist, readBytes })` hashes actual
  consumed bytes in sorted path order and returns `{ fingerprint, files,
  inventoryHash, jsxTree, previewHash, foodHash, fontDigests, lockDigest,
  rendererDigest, profileDigest, settlementDigest }`, where `files` is the
  sorted `[{ path, sha256, bytes }]` list. Fingerprint inputs: the inventory
  JSON, every loaded `src/cx-*.jsx`, the preview HTML, referenced existing
  food files, the exact served npm JS/font files, `package.json`,
  `package-lock.json`, and
  all renderer source/profile/settlement modules (`bin/render.mjs`,
  `harness/profile.mjs`, `harness/settlement.mjs`, `harness/server.mjs`,
  `harness/render.mjs`, `harness/manifest.mjs`). Missing or unallowlisted
  inputs throw `RENDER_INVALID_INPUT`. Source changes update that
  fingerprint; they do not fail merely because bytes drift. Runs fail only on
  invalid/missing/unallowlisted inputs or readiness/path/contract violations.
  The current git commit and the relevant-path dirty boolean/list are kept
  separately in the manifest; the relevant dirty path set is
  `docs/design-handoff/placeholder-app/{visual-state-inventory.json,
  src/cx-*.jsx, preview/screens.html, assets/food/**}` plus
  `tool/ui_capture/reference_renderer/{package.json, package-lock.json,
  bin/render.mjs, harness/*.mjs}`.
- Full/subset validation requires manifest image names and counts, SHA256
  digests, byte sizes, and PNG dimensions to match the exact files before a
  leaf is accepted or replaced.
- Safe replacement API is `replaceLeafAtomically(leafDir, stagedDir,
  { replace = false })`: with the default `replace=false`, an existing
  target leaf fails instead of being overwritten. With `replace=true`, only a
  fully validated exact derived full leaf (38 PNGs + manifest) or a fully
  validated exact subset leaf (selected count + manifest) may be swapped in:
  the renderer stages to a validated temp sibling, validates it, moves the
  existing leaf to a validated backup sibling, renames the staged leaf into
  place, and rolls back from backup on any pre-commit failure. The commit
  point is the successful post-install validation of the new target. Backup
  removal is post-commit cleanup: if it fails, the valid new target and the
  retained validated backup remain in place and the operation reports a
  cleanup error instead of attempting an unsafe rollback from a potentially
  partially deleted backup. It never silently deletes unknown/stale
  files, never removes any ancestor directory, and never touches the
  canonical tree. Symlink path-component, nearest-existing-ancestor realpath
  containment, and device/mount escape checks apply to the leaf, staged, temp,
  and backup paths alike.
- Validation-only execution is side-effect free:
  `validateReferenceLeaf({ repoRoot, selection = 'all' })` recomputes the
  source fingerprint from current consumed bytes, resolves the corresponding
  existing full or subset leaf, parses its manifest, and runs
  `validateFullLeaf` or `validateSubsetLeaf`. It never launches Chromium,
  creates a staged leaf, rewrites the manifest, or calls
  `replaceLeafAtomically`.

## 11. Browser determinism

- Pinned browser: Playwright 1.63.0 managed Chromium (see
  https://playwright.dev/docs/browsers); `npx playwright install --with-deps
  chromium` with pinned version only.
- Browser context is pinned to locale `en-US` and timezone `UTC`. Frozen
  deterministic custom Chromium flags — the exact custom args passed to
  launch — are exactly: `--disable-lcd-text`,
  `--font-render-hinting=none`, `--disable-threaded-animation`,
  `--force-color-profile=srgb`, `--hide-scrollbars` (leading double hyphens
  included). Playwright's default internal Chromium args are outside this
  custom list. No other custom flags are added; nonexistent or unapproved
  flags (including `disable-animations` and `gpu-shader-disk-cache`) are
  removed. `no-sandbox` is not added unless implementation proves CI
  requires it. Omission or substitution of any frozen flag fails the run.
- Native stage screenshot without `svgizeGradients`: element screenshot via
  the stage handle; no SVG gradient rewriting (avoids color-space drift on
  the tri-color gradient).
- Exact Today final checks (post-capture assertions before manifest write):
  normalize locale separators and require numeric content `1420` plus `kcal`
  and `96`/`132`/`38` plus `g` (zeros variant for `today_empty`); the pinned
  `en-US` hero display is `1,420`, triple macro ring settled,
  protein/carbs/fat rows at fixture values, bottom nav 5-tab order with
  centered Scan FAB, tabular numerals active. Settlement does not depend on
  punctuation. Renderer calls `img.decode()` for every stage image and
  requires `complete && naturalWidth > 0`. Font readiness explicitly checks
  Geist weights 200/400/500/600/700 and Geist Mono weights 400/500/600 via
  `document.fonts.check()` plus loaded `FontFace` entries. Exact fit/stage
  rects (360×800 at x0/y0) are asserted. Do not require computed
  no-pure-color checks unrelated to renderer readiness.

## 12. Platform guard

- ARM/ARM64 refusal before browser import: `bin/render.mjs` checks
  `process.arch` (`arm`/`arm64`) and exits `11` with stable error code
  `RENDER_ARM_REFUSED` before dynamically importing `harness/render.mjs`
  (which is the only module that imports `playwright`), unless the explicit
  `--allow-local-render` option is passed.
- That option is forbidden on this Pi: the current host is a
  resource-constrained ARM Pi where emulated Chromium + Flutter previously
  contributed to CPU/I/O starvation and reboot; local browser runs stay
  prohibited here. Authoritative renders run on pinned x86 CI
  (`workflow_dispatch`) or a capable x86 host. The workflow CLI passes no
  `--allow-local-render` because x64 does not require it.

## 13. Validation, errors, and path safety

- Fonts fail-closed: `document.fonts.ready` + per-face `FontFaceSet.check()`
  for the exact Geist/Geist Mono weights used (Geist 200/400/500/600/700,
  Geist Mono 400/500/600) plus loaded `FontFace` entries; any missing face
  fails the screen.
- Images fail-closed: the renderer calls `img.decode()` for every `<img>` in
  the stage, then requires `complete && naturalWidth > 0`; broken/missing
  food art fails the screen.
- Viewport/DPR fail-closed: assert
  `window.innerWidth === 360 && window.innerHeight === 800` and
  `window.devicePixelRatio === 3` inside the page before capture, plus exact
  fit/stage rects; mismatch fails the run.
- Validation errors are typed (`RENDER_*` codes: `REMOTE_FETCH`,
  `FONT_MISSING`, `IMAGE_INCOMPLETE`, `VIEWPORT_MISMATCH`, `DPR_MISMATCH`,
  `CLOCK_MISORDER`, `LEAF_EXTRA`, `INVALID_INPUT`, `ARM_REFUSED`) with
  screen/state context; nonzero exit (CLI mapping: `11` ARM refusal, `20`
  invalid input, `30` other render/validation failure); no partial manifest.
  There is no `FINGERPRINT_DRIFT` failure: source changes update the
  actual-byte source fingerprint (§10) and fail only on
  invalid/missing/unallowlisted inputs or readiness/path/contract violations.
- Path safety: all served/derived paths get per-component symlink checks plus
  nearest-existing-ancestor `realpath` containment against repo root / fixed
  leaves; rejects `..`, absolute escapes, device/mount escapes, and symlinks
  pointing outside.

## 14. TDD and CI

- `npm test` is pure `node:test` (no browser): manifest determinism
  (byte-identical rerun), route allowlist with local interception via
  `resolveCdnResource` (resolved-path assertions), full/subset leaf-replace
  safety with default-no-replace plus temp/backup/rollback semantics,
  exhaustive settlement map (`SETTLEMENT_MS_BY_STATE` keys equal the 19
  inventory IDs; `clockAdvanceMsFor` throws for unknown),
  pinned `en-US`/UTC context, frozen exact custom flag list with leading `--`
  (§11), `--allow-local-render` guard before dynamic import, static workflow
  contract via `test/workflow.test.mjs` (no YAML `node --check`, no
  shell-only fake validation), failure taxonomy without `FINGERPRINT_DRIFT`.
- RED first: each contract fails for the intended gap (e.g. unexpected
  external fetch allowed, timestamp in manifest, missing/substituted flag,
  ARM import before guard, subset written at the full leaf or nested inside
  it), then GREEN with minimal implementation.
- Manual `workflow_dispatch`, full default `all` 38: inputs `subset` (comma
  list of `<id>--<mode>` or `all`, default `all`), runner installs pinned
  browser via `npx playwright install --with-deps chromium`, writes/validates
  the full 38 + manifest at the full leaf
  `.ui-diff/expected-derived/samsung-s20fe/<sourceFingerprint>/` for `all`,
  or writes/validates only subset diagnostics at the separate subset leaf
  `.ui-diff/expected-derived/samsung-s20fe/subsets/<sourceFingerprint>/<selectionSha256>/`
  with their own selected-count manifest for a selection; subset leaves are
  never nested inside the full leaf and are never a full gate/downstream
  expected set. The workflow CLI passes no `--allow-local-render` (x64 needs
  none). The workflow validates leaf + manifest, uploads them as artifacts,
  and never commits. This workflow is not routine `Verify` and never gates
  pushes.
- Routine `Verify` remains Functions/Flutter; renderer changes do not alter it.

## 15. Acceptance criteria

1. `npm test` (pure `node:test`) green with no browser installed.
2. Determinism: the same locked x86 CI runtime and identical
   input/selection produce identical manifest and PNG hashes; if that cannot
   be achieved the gate fails rather than excluding PNGs from the claim.
   Task 7 determinism requires two successful runs at the same pushed SHA.
3. Canonical tree byte-identical before/after (manifest test
   `test/reference_images_manifest_test.dart` unaffected).
4. Unexpected external fetch provably aborted; loopback-only plus local
   interception proof in logs.
5. Today/today_empty dark/light locale-normalized settled-text checks pass
   (`1420` plus `kcal` and `96`/`132`/`38` plus `g`, or zeros; displayed hero
   `1,420` under pinned `en-US`); all screens 1080×2400 output.
6. ARM run without `--allow-local-render` exits before browser import with
   stable code `11`.
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
- No VLM/LocateAnything/provider calls in the Task 7 historical comparison;
  deterministic-only comparison only.

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
  3. `hide-scrollbars` — adopted as one of the five frozen custom flags
     in §11.
  4. Prior must-fix closure already described above (green
     `AGREEMENT_STATUS: agree`, `MUST_FIX: none`).

## 19. Self-review: placeholders and contradictions

- Placeholder check: no `TODO`, `TBD`, `XXX`, `Lorem`, or empty section
  remains; version pins are exact (React 18.3.1, ReactDOM 18.3.1, Babel
  7.29.0 via `@babel/standalone`, `@fontsource/geist` 5.3.0,
  `@fontsource/geist-mono` 5.3.0, Playwright 1.63.0; engines Node `>=20
  <21`); package path is everywhere `tool/ui_capture/reference_renderer`;
  URLs are the two official Playwright docs above; no guessed URLs elsewhere.
- Contradiction check: derived reflow at 360 px does not override canonical
  402 px truth (§6 vs §2.1 — resolved: canonical immutable, derived
  separate); existing `capture=1` keeps 402×874 behavior while only the exact
  `capture=1&profile=samsung-s20fe` URL activates derived geometry (§2.3,
  §5.1, §6 — resolved: missing/unknown profile never changes geometry);
  Today locale-normalized `1420` plus `kcal` and `96`/`132`/`38` plus `g`
  (or zeros) matches the source while the pinned `en-US` capture displays
  `1,420`; settlement is punctuation-independent and excludes computed
  no-pure-color checks (§9, §11); the single commit token only confirms the
  selected screen commit and never increments for child state updates, and
  Today settlement uses DOM numbers (§5.2, §9 — resolved, no token-counting
  claim); `preview-only React commit token` does not ship React to the app
  (resolved: §5.2 capture-only preview branch + ignored `node_modules`,
  runtime bytes from exact package files, installed not committed); no
  committed vendor UMD/font directories and no cloned `stage.html`
  (resolved: §5.1–§5.2 actual `preview/screens.html` plus capture-profile
  API and `CaptureBoundary` token, local interception); source changes update
  the actual-byte source fingerprint and fail only on
  invalid/missing/unallowlisted inputs or readiness/path/contract violations
  (resolved: §5.1, §10, §13 — no `FINGERPRINT_DRIFT`); `page.clock.install`
  runs before `page.goto` with no `no pending RAF` claim, and no second
  parent render token (resolved: §9); frozen custom flags are exactly the
  five `--`-prefixed args in §11 with no `disable-animations`,
  `gpu-shader-disk-cache`, or `no-sandbox` unless implementation proves CI
  requires it, and Playwright default internal args are outside the custom
  list; manual workflow does not gate `Verify` (resolved: §14);
  `--allow-local-render` exists but is forbidden on this Pi (resolved: §12 —
  the option exists for capable x86 runs, never for this host; the workflow
  CLI passes no such flag).
- Paths/counts/subset-full check: full output path is literally
  `.ui-diff/expected-derived/samsung-s20fe/<sourceFingerprint>/` (§10); the
  full-gate leaf contains exactly 38 PNGs plus `manifest.json` and nothing
  else — no subdirectories — and is the only downstream ui-diff input (§7,
  §10); full default writes/validates all 38 at the full leaf; subset
  diagnostics live only at the separate subset leaf
  `.ui-diff/expected-derived/samsung-s20fe/subsets/<sourceFingerprint>/<selectionSha256>/`
  with their own selected-count manifest, never nested inside the full leaf,
  and are never a full gate/downstream expected set (§7, §10, §14); safe
  replace is `replaceLeafAtomically(leafDir, stagedDir, { replace = false })`
  with default-no-replace, validated temp/backup sibling, rollback on every
  pre-commit failure, post-commit backup cleanup that retains the valid target
  and remaining validated backup on cleanup error, no silent
  deletion of unknown/stale files, no ancestor removal, and
  symlink-component plus nearest-ancestor realpath plus device/mount checks
  (§10); inventory names count 38 (§7); `SETTLEMENT_MS_BY_STATE` keys equal
  the 19 inventory IDs (§9); manifest schema lists `schemaVersion`,
  `sourceFingerprint`, git commit, dirty boolean/list, inventory/JSX
  hashes/tree, preview/food/font/lock/renderer/profile/settlement hashes,
  Node/npm/Playwright/Chromium versions, profile logical/physical/DPR, exact
  custom flags, selection/readiness assertions, and per-image
  path/hash/bytes/dimensions/clock advance with no timestamps or absolute
  host paths (§10); `computeSourceFingerprint` returns fingerprint plus
  per-file hashes plus component digests (§10); `resolveCdnResource` returns
  null or an exact file-backed / deterministic in-memory-body response plus
  content type (§8); side-effect-free `validateReferenceLeaf` performs no
  browser import or write (§10); CLI entry `bin/render.mjs`
  with pure `parseCliArgs` and exit mapping `0`/`11`/`20`/`30` (§5.2).
- Scope check: only this spec file, the plan file, and the status checkpoint
  change in the documentation task; no code, workflow, asset, or config file
  is created or modified here.

## 20. Next steps (not in this task)

1. Mandatory spec re-review in the same Antigravity conversation before
   implementation (green required).
2. Then a bounded implementation plan (renderer skeleton, hermetic pins,
   harness TDD) as a separate change; implementation itself follows later.
