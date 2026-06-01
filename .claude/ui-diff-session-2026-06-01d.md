# UI Diff Session — 2026-06-01d — Macro Ring Center-Stack Nudge

## Goal

Try the next lowest-risk untried vector to reduce the critical `macro-ring-hero`
structural diff: a small upward nudge of the center content stack (`-4.0`
logical pixels) inside the macro ring, without touching ring arcs, stroke,
glow, pill styling, seed data, or macro rows.

## Exact code change (tested, then reverted)

File: `lib/features/today/today_screen.dart`, inside `_HeroMacroCard` →
`AnimatedMacroRing.center`. Wrapped only the center `Column`
(`KCAL EATEN` / `1,420` / `of 2,400` / `980 kcal left` pill) in a
`Transform.translate`:

```dart
center: Transform.translate(
  offset: const Offset(0, -4),
  child: Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text('KCAL EATEN', ...),
      Text(NumberFormat('#,###').format(kcalNow.round()), ...),
      Text('of ${NumberFormat('#,###').format(plan.kcal)}', ...),
      const SizedBox(height: 4),
      Container( /* 980 kcal left pill */ ... ),
    ],
  ),
),
```

Ring arcs, `size: 220`, `strokeWidth: 18`, glow, track color, pill
color/opacity/border, and seed totals were all left unchanged. Only the center
text/pill stack was translated. `fvm flutter analyze` → "No issues found".

## Build / install / run

- `fvm flutter build apk --debug` → built `app-debug.apk` (Gradle assembleDebug OK)
- `adb -s R58R61161NA install -r ...` → Success
- `adb -s R58R61161NA shell pm grant com.calorix.calorix android.permission.POST_NOTIFICATIONS` → OK
- Device profile applied: `SM-G780G` / serial `R58R61161NA` / density 480

## Run metadata

- Run id: **run-041**
- Output: `.ui-diff/today/run-041/`
- Screen profile: `today`
- Global diff: **12.46%** (`0.124580820788`), status `pass`
- qualityStatus: **fail** (critical ROI failed)
- VLM: `vlm_health` reachable; `qwen2.5vl:3b` would not warm (~90s timeout);
  usable fallback `moondream:latest` used — same model as run-039, so the
  comparison is apples-to-apples.
- preCapture reseed (`calorix://debug/reseed`) ran OK; actual shows final
  stabilized `1,420` (deterministic capture, animation = `Duration.zero`).

## ROI table (run-041)

| ROI | Status | Structural diff | maxDiffPercent |
|---|---|---|---|
| macro-ring-hero (critical) | **fail** | **19.02%** | 12% |
| macro-rows | pass | 8.96% | 15% |
| meal-cards | pass | 15.60% | 25% |

## Comparison vs run-039 (accepted baseline)

| Metric | run-039 | run-041 (nudge) | Δ | Verdict |
|---|---|---|---|---|
| global diff | 12.36% | 12.46% | +0.10pp | worse |
| macro-ring-hero structural | 18.55% | **19.02%** | **+0.47pp** | **worse (wrong direction)** |
| macro-rows structural | 8.82% | 8.96% | +0.14pp | slightly worse, still pass |
| meal-cards structural | 15.71% | 15.60% | −0.11pp | slightly better, still pass |

(The MCP `delta` block compared to run-040 — the reverted pill attempt — not to
the accepted run-039 baseline. The run-039 figures above are the correct
reference, since the code before this change was the post-revert run-039 state.)

## Manual artifact interpretation

Artifacts inspected: `expected.png`, `actual.png`, `diff.png`, and the
`macro-ring-hero` expected / actual / structural-diff crops.

- **actual.png** confirms acceptance preconditions: final `1,420`, `of 2,400`,
  and the `980 kcal left` pill are all rendered; Chicken Rice Bowl remains the
  first meal card; no overflow marker.
- **macro-ring-hero structural-diff** shows the `980 kcal left` pill text
  **doubled** vertically — the nudged (actual) pill now sits ~4px *above* the
  expected pill position. The expected mockup places the center stack slightly
  *lower* (more vertically centered in the ring), so translating up by 4px
  *increased* the center/pill misalignment rather than reducing it.
- The dominant red in the structural diff is the persistent **ring-arc
  position/shape mismatch** on the right side — the true root cause of the
  ~18–19% critical ROI floor. The center-stack nudge does not touch the arcs,
  so it cannot move that component of the diff.

## Did the center nudge improve the ring/pill composition?

**No.** It moved the center stack the wrong way. The critical ROI worsened by
+0.47pp and the pill drifted further from its expected (lower) position. Both
revert triggers from the task fired: macro-ring-hero worsened materially, and
the center stack looked too high relative to the mockup.

## Decision: REVERTED

- `lib/features/today/today_screen.dart` restored to the committed run-039
  baseline (`git checkout` — working tree clean for this file; the unrelated
  `dart format` line-wrap on the animation `duration` line was also dropped to
  keep the tree byte-identical to baseline).
- Post-change capture saved at
  `docs/screenshots/today-screen-2026-06-01e-center-stack-nudge.png`
  (copied from `.ui-diff/today/run-041/actual.png`) for the record.
- No commit of code (change rejected). Documentation/screenshot may be committed.

## Next recommendation

The center-stack position is **not** the lever. Three vectors are now spent
(split-card, glow, pill opacity/border) plus this center nudge, and the
critical ROI has held at ~18.5–20% throughout. Every attempt that only touches
center content moves fractions of a percent because the dominant red is the
**ring arc geometry** — arc start angle, sweep direction, radius, and cap shape
relative to the mockup.

The highest-value next investigation (one isolated change, deterministic
capture) is the **ring arc geometry itself** in `AnimatedMacroRing`
(`lib/shared/widgets/macro_ring.dart`): verify start angle (12 o'clock vs
mockup), sweep direction (clockwise), per-arc radius/gap, and stroke cap
(round vs butt) against `macro-ring-hero-expected.png`. That is where the
~18% structural floor lives. Before spending another build cycle, overlay
expected vs actual arcs directly to confirm the angular offset, rather than
nudging center content again.
