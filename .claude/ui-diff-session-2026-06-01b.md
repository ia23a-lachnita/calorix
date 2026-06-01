# UI Diff Session — 2026-06-01b

## Goal

Make one small, targeted visual improvement to the macro ring/pill composition inside the unified `_HeroMacroCard`, then rerun `mobile-ui-diff` to confirm whether it improved macro-ring-hero structural diff or created regressions.

---

## Git Starting State

Branch: `main`, up to date with `origin/main`.

Recent commits at session start:
```
d824468 Add Today screen screenshot 2026-06-01b (post-revert, overflow fixed)
7f4639f docs: ui-diff session 2026-06-01 — revert split-card, fix overflow, run-038 baseline
43d94ab Fix meal card subtitle overflow — move macro pips to own row
c6e813b Wire animation stabilization and harden ui-diff config
0bba0aa Revert split hero card regression
```

Run-038 baseline (inherited):
- global: 12.71% PASS
- macro-ring-hero structural: **20.17% FAIL** (threshold 12%)
- macro-rows structural: 8.96% PASS (threshold 15%)
- meal-cards structural: 15.62% PASS (threshold 25%)

---

## Code Change

**File:** `lib/shared/widgets/macro_ring.dart` — `_MacroRingPainter._drawArc()`

**Hypothesis:** The `glowPaint` used `strokeWidth * 1.8` with `alpha: 45` and `blur: 5`. For the innermost (fat) ring at ~58px radius, this produces a ~32px-wide glow stroke that bleeds inward toward the center pill region, contaminating pixel comparison. Reducing glow spread and intensity should reduce structural diff in the ring/center area.

**Change (single, targeted):**

| Parameter | Before | After |
|---|---|---|
| Glow stroke width | `strokeWidth * 1.8` | `strokeWidth * 1.4` |
| Glow alpha | `45` | `28` |
| Blur radius | `5` | `3` |

No ring size, stroke width, gap, or layout changes were made.

---

## Build / Install

```
fvm flutter build apk --debug   → Success (Gradle assembleDebug, 18.9s)
adb install -r app-debug.apk    → Success
pm grant POST_NOTIFICATIONS      → Success
```

---

## VLM Health (pre-run)

- `qwen2.5vl:3b`: installed but failed to load (Ollama request failed)
- `moondream:latest`: usable — selected as fallback
- Run proceeded with `vlmPolicy: required`, `moondream:latest`

---

## Run-039 Results

| Metric | Value |
|---|---|
| Run name | run-039 |
| Global diff | 12.36% |
| Global status | **PASS** |
| qualityStatus | **FAIL** (critical ROI) |

### ROI Table

| ROI | Raw diff | Structural diff | Threshold | Status | Critical | Dynamic masked % |
|---|---|---|---|---|---|---|
| macro-ring-hero | 20.06% | **18.55%** | 12% | FAIL | yes | 12.15% |
| macro-rows | 7.39% | 8.82% | 15% | PASS | no | 25.04% |
| meal-cards | 13.10% | 15.71% | 25% | PASS | no | 25.04% |

---

## Comparison vs Run-038 Baseline

| ROI | Run-038 structural | Run-039 structural | Delta |
|---|---|---|---|
| macro-ring-hero | 20.17% | **18.55%** | **−1.62% improved** |
| macro-rows | 8.96% | 8.82% | −0.14% (stable) |
| meal-cards | 15.62% | 15.71% | +0.09% (noise) |
| Global | 12.71% | 12.36% | −0.35% improved |

---

## Artifact Inspection

- **actual.png**: not black; shows animated hero card with 1,420 kcal, unified ring
- **macro-ring-hero actual**: three arcs visible, reduced glow bleed around center pill
- **macro-rows**: protein/carbs/fat progress bars present, pass maintained
- **meal-cards**: Chicken Rice Bowl first, 620 kcal, macro pips on second row, no overflow
- **Bottom nav**: visible, content does not appear truncated by nav overlay
- **980 kcal left pill**: visible, legible, not obscured by arc glow

---

## Ring/Pill Assessment

The glow reduction hypothesis is confirmed:
- Reducing `strokeWidth * 1.8 → 1.4`, `alpha 45 → 28`, `blur 5 → 3` removed ~1.6 structural diff points from the critical macro-ring-hero ROI
- The pill remains fully legible in the screenshot
- No macro-rows regression
- No meal-cards regression
- The change is safe to commit

The 18.55% structural diff still fails the 12% threshold. The remaining gap is attributed to the geometric mismatch between the app (360dp, 220dp ring, three concentric arcs) and the mockup (402dp, larger ring with outer halo/glow decoration). This is a device-geometry floor requiring further in-card tuning, not the glow bleed that was addressed today.

---

## Bottom-Nav / Content Fit

No overflow marker present. The first meal card (Chicken Rice Bowl) is fully visible in the screenshot above the bottom nav. A `SliverPadding(bottom: 80)` spacer is already in place. No additional change needed this session.

---

## Screenshot

`docs/screenshots/today-screen-2026-06-01c-glow-reduced.png` — post-glow-reduction visual baseline.

---

## Next Recommendation

The glow-bleed vector is now addressed. The remaining ~18.55% structural diff is concentrated in the ring geometry mismatch vs the mockup halo. Next targeted directions:

1. **Add outer decorative ring layer** — the mockup shows an outer glow/halo ring that the implementation lacks. Adding a thin outer arc with soft glow at the outer perimeter of the protein ring may close several diff points.
2. **Adjust center content vertical alignment** — the center column (KCAL EATEN, number, "of 2400", pill) may sit slightly differently than the mockup; a 2–4px vertical nudge could reduce center-area diff.
3. **Android-specific baseline** — if the device-geometry gap is irreducible at 360dp vs 402dp mockup, an Android-specific expected image at actual device resolution should be considered.

Do not split the hero card. Do not increase ring size without evidence from diff artifacts.
