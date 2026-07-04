# Placeholder App UI — Flutter implementation handoff

Goal: implement this mobile UI **1:1** in Flutter. The ground truth is the JSX source in `src/` — every dimension, color, radius and font size is written explicitly inline there. Screenshots in `screenshots/` are visual reference only; when a screenshot and the code disagree, **the code wins**.

## Placeholder app repo integration
- This folder is the active Claude-design handoff. The repo keeps the JSX files flattened in this directory for existing tooling compatibility; treat them as the handoff's `src/` files.
- The active visual references are the PNGs in `screenshots/`. The old May mockup composites and old single-screen PNGs under `docs/mockups/image/` were removed to avoid stale comparisons.
- `docs/mockups/image/dark/single/Today.png` and `docs/mockups/image/light/single/Today.png` remain only as Today UI-diff compatibility mirrors of `screenshots/today--dark.png` and `screenshots/today--light.png`.
- The app name and logo remain placeholders. Do not replace `AppName`/`CX_APPNAME` with a final brand name or mark until the brand decision is explicit; `Ravlo` is a candidate, not a decision.
- The populated Today handoff intentionally shows `1,420 kcal` in the hero while the visible cards sum to `845 kcal`. Flutter keeps that as a debug/ui-diff fixture override only.

## What's in this folder
- `cx-theme.jsx` (tokens), `cx-icons.jsx` (icon set + logo placeholder), `cx-shell.jsx` (bottom nav, top bar, avatar, macro ring), one `cx-screen-*.jsx` per screen, and `handoff.html` (composition + lock-screen mock).
- `tokens/` — the same tokens as CSS custom properties.
- `design_tokens.dart` — tokens pre-translated to Flutter constants. Start here.
- `screens.md` — screen inventory, states, and flow map.
- `screenshots/` — every screen in dark + light (402×874 logical px). **Known limitation:** these PNGs are color-quantized by the export pipeline, so smooth gradients/glows show slight banding. The live design does not band — treat gradients in the JSX source as ground truth, or open `screens.html` in a browser and take a native screenshot for pixel-perfect reference.
- `assets/` — food photography used in the mocks.
- `screens.html` — interactive screen browser: pick any screen from the dropdown (←/→ to step, `m` to toggle dark/light). Use it for pixel-perfect visual reference.

## Hard rules for 1:1 fidelity
1. **Copy exact values.** Paddings like 13px, font sizes like 13.5px, radii like 22px are intentional. Do NOT snap to 4/8 grids or Material defaults.
2. **Fonts:** Geist (UI) + Geist Mono (eyebrow labels + ALL numerals). Both on Google Fonts → `google_fonts` package. Numerals always tabular: `FontFeature.tabularFigures()`.
3. **Kill Material defaults:** no ink splash (use opacity ~0.7 on press), no default elevation, no Material icons — icons are custom hairline SVG paths in `cx-icons.jsx` (24px grid, stroke 1.6, round caps; 2.0 when active). Port them as `CustomPainter`s or export as SVGs for `flutter_svg`.
4. **Hairlines are 0.5px** (`Border.all(width: 0.5)`), cards get the soft layered shadow from tokens — never Material elevation.
5. **The tri-color gradient (`gradAI`)** appears at most once per screen: primary CTA / scan FAB / progress fill. Ink on gradient is always dark `#0B0D10`, both themes.
6. **Theming:** one `mode` switch drives everything — mirror `cxTheme(mode)` from `cx-theme.jsx` with a `ThemeExtension`. Camera surfaces (scan, processing) keep white chrome over the viewfinder in both modes.
7. **Glass chrome** over camera = blur 20 + translucent tint + 0.5px hairline + inset shine (`BackdropFilter` + `ImageFiltered`). Bottom nav over camera uses the lighter "floating" variant (see `CXBottomNav floating`).
8. **Branding:** app name and logo are PLACEHOLDERS (`CX_APPNAME = 'AppName'`, striped `CXLogo`). Build them as one swappable widget + one string constant.
9. **Motion:** entry count-ups + ring fills ≈1.2–1.4s easeOutCubic; capture ring spins 1s linear; scan shimmer 1.6s. No bounces, no overshoot.
10. **Confidence logic:** ≥80% → green "Confirmed"; below → amber "Review" badge and the review-sheet branch.

## Suggested build order
tokens/theme → icons → shell (nav, top bar, macro ring) → Today → Scan flow (scan → processing → review → notification) → Food detail → Manual add → History → Goals → AI → onboarding (loading, login, permission, profile).
