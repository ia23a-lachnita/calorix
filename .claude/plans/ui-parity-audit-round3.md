# Calorix UI Parity Audit — Round 3

Source of truth: `docs/mockups/source-code/*.jsx` + `docs/mockups/images/`.
User annotated 5 screenshots with red circles showing regressions. Issues below are derived from direct comparison of JSX mockup code vs current Flutter implementation.

---

## FONT MISMATCH — BLOCKER (all screens)

**Mockup font stack**: `"Geist"` (body/UI) + `"Geist Mono"` (labels, mono numerals)
**Flutter font stack**: `Barlow` (body) + `BarlowCondensed` (headings)

Geist is a clean, geometric, modern sans-serif (Vercel). Barlow is a condensed industrial/sports font. The visual character is completely different — headlines especially feel condensed and sporty where the mockup feels clean and minimal.

**Decision needed from user**: Keep Barlow (already embedded) or add Geist + Geist Mono to pubspec? Geist is free and open source. This is the highest-impact single change.

---

## B1 — TODAY SCREEN: Macro sub-cards nested incorrectly

**Mockup** (`cx-screen-today.jsx` line 77–103): Hero card wraps BOTH the macro ring AND three sub-cards in a SINGLE outer container with `borderRadius: 28, background: t.card`. Sub-cards inside have `borderRadius: 18, background: '#FAF8F3'` (light) / `rgba(255,255,255,0.03)` (dark), NO card shadow — just a flat surface tint.

**Flutter** (`today_screen.dart` line 101–115): `_HeroMacroCard` (ring only) and `_MacroSubCards` (three separate `Card` widgets) are SEPARATE sibling widgets with `SizedBox(height: 20)` between them. Each sub-card is an independent Flutter `Card` with its own shadow and full card treatment.

**Effect**: Three visually distinct cards float below the ring instead of being contained inside one unified hero card. Looks like 4 separate cards stacked.

**Fix**:
- Remove `_MacroSubCards` as a sibling widget.
- Move sub-card content inside `_HeroMacroCard`, below the ring section.
- Sub-cards inside: `Container` (not `Card`), `color: isDark ? Color(0x08FFFFFF) : Color(0xFFFAF8F3)`, `borderRadius: BorderRadius.circular(18)`, `border: Border.all(color: isDark ? Color(0x12FFFFFF) : Color(0x12000000), width: 0.5)`.
- Outer hero `Card` gets `borderRadius: BorderRadius.circular(28)`, `margin: EdgeInsets.symmetric(horizontal: 16)`.

---

## B2 — SCAN SCREEN: Controls layout completely wrong

**Mockup** (`cx-screen-scan.jsx`):
- Top chrome: `position: absolute, top: 56` — Flash chip LEFT, Profile chip RIGHT
- Mode selector: `position: absolute, top: 110, centered`
- Capture row: `position: absolute, bottom: 150` — Library | CaptureButton | Recent, all with `borderRadius: 999` (fully circular chips)
- Hint text: near the center of frame, above the capture row

**Flutter** (`scan_screen.dart`):
- Top chrome: `SafeArea` + `padding: vertical: 12` — OK position-wise
- Mode selector: Inside `Positioned(bottom: 0)` column — **placed at bottom of screen**, not top
- Library/Recent buttons: `borderRadius: BorderRadius.circular(12)` — square, not round
- Hint text: also inside the bottom column — wrong position

**Capture button — idle gradient wrong**:
- Mockup idle ring: `rgba(255,255,255,0.10)` dark / `rgba(11,13,16,0.58)` light — subtle translucent ring, NO color
- Flutter idle ring: draws `sweepGradient` (blue→cyan→green) even when idle — should only appear when capturing
- Mockup size: 92×92. Flutter size: 76×76.

**Fix**:
- Move mode selector to absolutely positioned overlay near top (below top chrome, ~110px from top)
- Move capture row to absolute position ~150px above bottom nav
- Change Library/Recent button decoration to `BoxShape.circle` or `borderRadius: 999`
- Fix idle capture ring: no gradient when idle, just a subtle white/dark translucent border
- Increase capture button to 92×92

---

## B3 — GOALS SCREEN: 4 structural issues

### B3a — Period selector + Title + Adjust button layout
**Mockup** (line 14–48):
- Header row: period selector pill (top-left, appears ABOVE the "Goals" title), Adjust button (top-right, `padding: '6px 10px', borderRadius: 10`, inline sliders icon — NOT in appbar)
- "Goals" title appears with `marginTop: 8` BELOW the period selector pill

**Flutter**: Adjust button is a `TextButton.icon` in `SliverAppBar` actions. Period selector is below the appbar title "Goals". Structure is inverted.

**Fix**: Remove Adjust from appbar. Add a header section within the scroll content: period pill (row 1), then row with "Goals" title + Adjust chip (row 2). Adjust chip: `Container(padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: BoxDecoration(color: cardColor, border: ..., borderRadius: BorderRadius.circular(10)))` with `Icons.tune` (14px) + "Adjust" text.

### B3b — Body Goal segmented control
**Mockup** (line 51–86): 4-column grid all equal width inside a `borderRadius: 16` container with `background: '#EDE9E1'` (light). Active pill is `background: t.card` (white card) with shadow and `border: hairline`. Sub-label (e.g. `-0.5kg/wk`) is green for active.

**Flutter**: `SingleChildScrollView` horizontal row with rounded buttons with `border: Border.all(color: borderLight)`. NOT a grid. NOT inside a container background. Scrollable = wrong (all 4 should fit).

**Fix**: Replace with `Container(decoration: BoxDecoration(color: Color(0xFFEDE9E1), borderRadius: BorderRadius.circular(16)))` containing `Row` with 4 `Expanded` children. Active child: white card bg + shadow. No scroll.

### B3c — AI label icon wrong
**Mockup** (line 107): `CXIcon name="ai"` = sparkle/star icon (⭐ style). Text: `AI · TDEE 2,820 − 420`.
**Flutter**: Uses `↑` arrow text prefix. Should be `Icons.auto_awesome` (sparkle star).

### B3d — Macro tiles "too colorful"
**Mockup** (`TargetTile`, line 274–293): `background: '#F8F6F1'` (light) / `rgba(255,255,255,0.03)` (dark) — neutral, no color tint. Only a colored dot for the label.

**Flutter** (`_MacroTile`): `color: color.withAlpha(15), border: Border.all(color: color.withAlpha(60))` — each tile has its macro color tinted background and border. Protein = blue-tinted, carbs = cyan-tinted, fat = green-tinted. This makes the goals screen look garish.

**Fix**: Change macro tile decoration to neutral: `color: isDark ? Color(0x08FFFFFF) : Color(0xFFF8F6F1)`, `border: Border.all(color: isDark ? Color(0x12FFFFFF) : Color(0x12000000), width: 0.5)`. Keep only the colored dot.

---

## W1 — HISTORY SCREEN: W/M toggle uses wrong active color

**Mockup** (`cx-screen-history.jsx` line 51–70):
- Toggle container: `background: '#F4F2EE'` (light) / `rgba(255,255,255,0.04)` (dark), `borderRadius: 8`
- Active item: `background: t.card` (white), `boxShadow`, ink-colored text
- Inactive item: transparent background, muted-colored text
- NO cyan color used

**Flutter** (`_ViewToggleButton`): Active uses `color: AppColors.cyan.withAlpha(30)` background and `border: Border.all(color: AppColors.cyan)` — this makes the active toggle look cyan, which doesn't match.

**Fix**: Replace active state with: `color: isDark ? AppColors.surfaceDark : Colors.white`, `border: Border.all(color: Colors.transparent)`, text color `isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight`. Add subtle shadow. Wrap both toggles in a `Container` with `color: isDark ? Color(0x0AFFFFFF) : Color(0xFFF4F2EE), borderRadius: BorderRadius.circular(8)`.

---

## W2 — HISTORY SCREEN: Screen empty (no seed data → SizedBox.shrink)

**Flutter**: `_WeeklyStats` returns `SizedBox.shrink()` when `logs.isEmpty`. `_DayRow` list also empty. Calendar card exists but shows no data in rings.

**Effect**: Screen appears to only show the calendar strip — everything below it (weekly stats card with sparkline, streak badge, day rows) is invisible.

**Fix**: Add seed `DailyLog` data in `main.dart` or via a seed provider that pre-populates Firestore emulator on first load. At minimum add 5–7 days of history entries so all three sections render.

---

## W3 — AI SCREEN: Composer background wrong in light mode

**Mockup** (`cx-screen-ai.jsx` line 115–143): Composer outer container: `background: t.card` = `#FFFFFF` (light mode), pill-shaped `borderRadius: 999`.

**Flutter** (`_Composer`): Uses `color: Theme.of(context).cardColor` on outer container. The inner `TextField` may inherit InputDecorationTheme which adds a grey fill. Result: the textarea area appears noticeably different color from the card white.

**Fix**: Explicitly set `color: isDark ? AppColors.surfaceDark : Colors.white` on the composer container. Set `TextField(decoration: InputDecoration(filled: false, ...))` to prevent any fill override.

---

## N1 — GOALS SCREEN: Missing calorie stepper (+/−)

**Mockup** (line 113): `<Stepper theme={t}/>` sits in the top-right of the calorie card — a small +/− stepper control for nudging kcal target.

**Flutter**: No stepper in calorie card — there's only a `Slider`. Stepper is missing.

**Fix**: Add a small stepper widget (two `IconButton`s for `−` and `+` in a `Row`) aligned to the top-right of the calorie card header, alongside the kcal number. Steps of 50 kcal.

---

## N2 — FOOD DETAIL SCREEN: Never shown (no path in without scan data)

Without seed data, food entries are empty, so Food Detail is never accessible. Once seed data exists this resolves itself if meal cards tap through to food detail.

---

## N3 — HISTORY: Day pill container not rounded for today highlight

**Mockup** (`DayPill`, line 242–265): The entire column item has `borderRadius: 14` and `border: '0.5px solid cyan55'` for today. The `DayPill` visual wrapper is rounded.

**Flutter**: No rounded container wrapping each day pill column item — just a bare `Column`. Today shows a `BoxShape.circle` on the inner number only, not an outer `borderRadius: 14` highlight.

---

## SEED DATA REQUIREMENT

To make the app testable without a real camera scan:
- Pre-populate today's entries (3 meals: ~620 kcal chicken rice bowl, ~180 kcal protein yogurt, ~45 kcal espresso) in Firestore emulator on startup
- Pre-populate 7 days of `DailyLog` history (Mon–Sun, ~2200–2400 kcal/day)
- Goals: set active plan with protein=170g, carbs=250g, fat=70g, kcal=2400

---

## AVD Internet Status

**Yes** — Android Virtual Device has internet by default via NAT through host. Firebase calls work. Gemini API calls work. No extra setup needed.

---

## Summary Table

| ID | Screen | Issue | Severity |
|----|--------|-------|----------|
| FONT | All | Barlow ≠ Geist — wrong typeface entirely | Blocker |
| B1 | Today | Macro sub-cards not inside hero card | Blocker |
| B2 | Scan | Mode selector at bottom, wrong button shape, idle gradient wrong | Blocker |
| B3a | Goals | Header layout inverted (title/adjust/period) | Blocker |
| B3b | Goals | Body goal control is scrollable row, not 4-col grid | Blocker |
| B3c | Goals | AI label uses ↑ arrow not sparkle star icon | Warning |
| B3d | Goals | Macro tiles colored background (too colorful) | Warning |
| W1 | History | W/M toggle uses cyan color, should be neutral card | Warning |
| W2 | History | No seed data → empty screen | Warning |
| W3 | AI | Composer area wrong background color | Warning |
| N1 | Goals | Missing kcal +/− stepper in calorie card | Nit |
| N2 | Food Detail | Never shown without seed data | Nit |
| N3 | History | Day pill today-highlight not wrapped in rounded container | Nit |
