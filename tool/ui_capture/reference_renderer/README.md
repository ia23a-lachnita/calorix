# Derived UI Reference Renderer — Samsung S20 FE

Hermetic renderer that re-renders the JSX handoff at true S20 FE geometry
(360x800 CSS px, DPR 3, 1080x2400 physical) without mutating the immutable
canonical 402x874 set.

Spec: `docs/superpowers/specs/2026-09-12-derived-ui-reference-renderer-design.md`
Plan: `docs/superpowers/plans/2026-09-12-derived-ui-reference-renderer.md`

## Output leaves (git-ignored, never committed)

- Full gate leaf (exactly 38 PNGs plus `manifest.json`, nothing else):
  `.ui-diff/expected-derived/samsung-s20fe/<sourceFingerprint>/`
- Subset diagnostics only (own selected-count manifest, never nested inside
  the full leaf):
  `.ui-diff/expected-derived/samsung-s20fe/subsets/<sourceFingerprint>/<selectionSha256>/`

## Scripts

- `npm test` — pure `node --test test/*.test.mjs` unit gate; needs no browser.
- `npm run render` — `node bin/render.mjs` (full `all` selection by default).
- `npm run validate` — `node bin/render.mjs --validate-only`.

## Platform guard

ARM/ARM64 refuses with exit `11` (`RENDER_ARM_REFUSED`) before the dynamic
import of `harness/render.mjs` unless `--allow-local-render` is passed.
`--allow-local-render` is forbidden on the resource-constrained ARM Pi host;
authoritative renders run on pinned x86 CI. The manual workflow
`derived-ui-reference.yml` passes no `--allow-local-render` because x64 does
not require it.

## Exit codes

`0` success, `11` ARM refusal, `20` invalid CLI/input, `30` render or
validation failure.
