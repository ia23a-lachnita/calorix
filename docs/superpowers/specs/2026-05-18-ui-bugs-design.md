# Calorix UI Polish + Bug Fix — Design Spec
Date: 2026-05-18

## Goal
Fix all known bugs and bring every visible screen to pixel-fidelity with `docs/mockups/image/dark/single/` and `docs/mockups/image/light/single/`. Write blackbox widget/integration tests, get Gemini review, and pass all tests before claiming done.

## Scope

### Bugs (must fix first — blockers)

#### B1 — History: Firestore `permission-denied`
**Root cause:** `historyProvider` uses `.where(FieldPath.documentId, isGreaterThanOrEqualTo/isLessThan)` range query. The Firestore rule uses `logId.matches(regex)` which Firestore's query evaluator cannot prove at query time — only individual-doc reads can verify regex. Collection range queries require field-comparison rules.  
**Fix:** Replace `logId.matches(...)` with `logId >= request.auth.uid + '_' && logId < request.auth.uid + 'z'` in `firestore.rules`. Deploy updated rules.

#### B2 — Today + History day: "Error loading meals" / missing entries
**Root cause:** `watchTodayEntries`, `watchEntriesForDate`, `getRecentEntries` use multi-field queries (`uid ==`, `timestamp range`, `status ==`, `orderBy timestamp DESC`) with no composite index.  
**Fix:** Add composite indexes to `firestore.indexes.json` and deploy:
- Collection `entries`: `uid ASC` + `status ASC` + `timestamp DESC`
- Collection `entries`: `uid ASC` + `timestamp ASC` (for range queries)

#### B3 — Bottom overflow 5.5px on Today screen
**Fix:** Add `SliverPadding(padding: EdgeInsets.only(bottom: 80))` as the last sliver in `TodayScreen`'s `CustomScrollView`.

---

### UI — Today Screen (`lib/features/today/today_screen.dart`)

#### U1 — Macro ring: add glow on filled arcs
Mockup shows each filled arc with a soft radial glow/bloom matching its color. Implementation: draw each arc twice — first with a blurred wider stroke (`maskFilter: MaskFilter.blur(BlurStyle.normal, 6)`) in the arc color at ~50% opacity, then draw the sharp arc on top. Apply in `_MacroRingPainter._drawArc`.

#### U2 — Hero number: comma-formatted
Use `NumberFormat('#,###')` from `intl` to format the kcal count-up and the target. Changes `0` → `0`, `1420` → `1,420`.

#### U3 — App bar: date sub-label + icons match mockup
- Title area: two-line `Column` — large "Today" heading + small day-date line (`Friday · May 15` format).
- Right actions: notification bell (`Icons.notifications_none`) + circular avatar/profile chip (matching mockup top-right).
- Keep `SliverAppBar` pinned for the header feel.

#### U4 — Meals section header: "Recent scans" + count badge
Replace `"Today's Meals"` text with a `Row` containing:
- Left: `"Recent scans"` (heading3 style)
- Right: `"${entries.length} TODAY"` in a green pill badge (same style as mockup)

#### U5 — Meal card: meal type label + time formatting
Mockup shows `"12:48 · Lunch · 48g · 72g · 16g"` in the sub-row. Add `entry.mealType` label if non-null between time and macros.

---

### UI — History Screen (`lib/features/history/history_screen.dart`)

#### U6 — Calendar card header: "THIS WEEK" label + W/M toggle
Add a `Row` at the top of the calendar card:
- Left: `"THIS WEEK"` / `"THIS MONTH"` uppercase mono label (updates with view mode).
- Right: `W` / `M` toggle pills (tapping swaps `_isMonthView`).

#### U7 — Week strip: navigation arrows + week label
Add `< >` `IconButton`s at the edges of the week strip to navigate ±7 days. Update `_selectedDate` / `selectedWeekProvider` accordingly.

#### U8 — Day pills: per-day completion rings
Each day pill should show a thin (2px) circular ring behind the date number. Ring fill = fraction of that day's kcal vs target. Data comes from existing `historyProvider` logs. When no data, ring is track-only (very low opacity).

#### U9 — Weekly stats: macro averages row
Below the sparkline, add a `Row` of three `_MacroChip`s:  
`• PROTEIN Xg/d  • CARBS Xg/d  • FAT Xg/d`  
Using blue/cyan/green dot + monospace label matching mockup.

---

### Blackbox Tests

Write tests in `test/` (widget tests using `flutter_test`). Scope: render each screen in a `ProviderScope` with stubbed Firestore data, assert key UI elements present, interact with taps where relevant.

**Test cases to write:**
1. `today_screen_test.dart` — renders hero ring, macro rows, "Recent scans" header; "Error loading meals" NOT shown when provider returns data; overflow NOT present.
2. `history_screen_test.dart` — renders week strip with 7 day pills; navigation arrows present; "THIS WEEK" label visible; error text NOT shown.
3. `app_shell_test.dart` — bottom nav has 5 tabs; Scan FAB present at index 2; tapping Today/History/Goals/AI navigates to correct screen.
4. `firestore_rules_test.dart` — (if firebase-functions emulator available) — verifies permission-denied is gone and dailyLogs returns expected docs for a valid uid.

---

## Definition of Done
- `fvm flutter analyze` passes with 0 errors, 0 warnings.
- All 4 test files pass (`fvm flutter test`).
- Gemini diff review returns no BLOCKERS.
- Visual screenshots match the dark mockup within tolerable margin (no pixel-perfect comparison required — gross structure, colors, and typography must match).
- Firebase rules + indexes deployed to `calorix-xurschnell`.
