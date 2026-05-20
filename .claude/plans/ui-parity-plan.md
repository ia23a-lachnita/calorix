# Calorix UI Parity Plan — Full Screen Audit

Generated: 2026-05-19  
Live screenshots: `docs/live-app-screenshots/screen_0{1-5}_*.png`  
Mockup reference: `docs/mockups/image/dark/single/*.png`  
Spec: `docs/mockups/source-code/README.md`, `.claude/design.md`

---

## CRITICAL BUGS (fix first — blocking data on Today and History)

### B-CRITICAL-1: Firestore permission-denied on entries query
**Symptom**: Today shows "Error loading meals"; History shows `[cloud_firestore/permission-denied]`  
**Root cause**: Rules and indexes file exist locally but may not be deployed (last agent claimed to deploy but the error persists on device). The `watchTodayEntries` query uses compound filters `uid + status + timestamp`. The security rule `(resource == null || resource.data.uid == request.auth.uid)` may not satisfy Firestore's static query evaluation. Also the `dailyLogs` rule requires `logId >= uid + '_'` which is valid for document reads but borderline for collection list queries.

**Fix steps**:
1. Run `firebase deploy --only firestore:rules,firestore:indexes` and confirm success
2. If rules deploy but error persists, restructure the `entries` read rule to use `allow list` + `allow get` separately:
   ```
   allow get: if request.auth != null && resource.data.uid == request.auth.uid;
   allow list: if request.auth != null;  // Further constrained by query
   ```
   OR add explicit query constraint checking (preferred):
   ```
   allow list: if request.auth != null &&
     request.auth.uid == request.resource.data.uid;  // Not valid for list
   ```
   Actually the cleanest fix is to keep the rule as-is but ensure the composite index is deployed:
   `[uid ASC, status ASC, timestamp DESC]` - already in firestore.indexes.json
3. Add a `status` field to the composite index query scope verification
4. Test via `firebase emulators:start` with `fvm flutter run` pointing to emulator

**Files**: `firestore.rules`, `firestore.indexes.json`

### B-CRITICAL-2: History screen right overflow (4px)
**Symptom**: Debug yellow "RIGHT OVERFLOWED BY 4.0 PIXELS" banner showing in History screen header  
**Root cause**: The calendar card header Row with `padding: EdgeInsets.fromLTRB(16, 14, 12, 0)` and "THIS WEEK" + W/M toggle buttons overflows. The right padding is 12px but available width is tight on some devices.

**Fix**: In `history_screen.dart` around line 55, change:
```dart
padding: const EdgeInsets.fromLTRB(16, 14, 12, 0),
```
to:
```dart
padding: const EdgeInsets.fromLTRB(16, 14, 8, 0),
```
AND wrap the header Row's label in a `Flexible`:
```dart
Flexible(child: Text('THIS WEEK' / 'THIS MONTH', ...)),
```

**Files**: `lib/features/history/history_screen.dart:55`

---

## SCAN SCREEN (screen_01_scan.png vs `01 _ Scan _ idle _ capturing.png`)

### Mockup vs Live Delta:
| Element | Mockup | Live | Status |
|---|---|---|---|
| Flash control | "⚡ Flash · Auto" pill (top-left) | "⚡ Auto" text | ❌ Wrong |
| Profile button | Round avatar "A" (top-right) | "Profile" text button | ❌ Wrong |
| Scan mode selector | Meal/Barcode/Label at top center | Present but positioned differently | ~OK |
| Capture button | Large white square-stop icon, cyan glow ring | Blue circle, eye icon, no glow | ❌ Wrong |
| Library button | Left of capture, "LIBRARY" label | Present as icon only (no label) | ~OK |
| Recent button | Right of capture, "RECENT" label (flame icon) | Present as icon only (no label) | ~OK |
| Camera preview | Full-screen live feed | Black (may be device/debug issue) | ❓ |
| Bottom nav FAB | Blue→cyan→green gradient ring | Gradient ring present | ✅ OK |

### Fixes:
**S1 — Flash pill** (`lib/features/scan/scan_screen.dart`):
- Change the flash toggle widget to render as a pill container: `[⚡ icon] Flash · Auto` 
- Use `Container` with `BorderRadius.circular(20)`, semi-transparent dark bg, padding 8×4
- Cycle through Flash.auto → Flash.always → Flash.off on tap; update label

**S2 — Profile avatar**:
- Replace `Text('Profile')` button with a `Container` circle (32px diameter)
- Fill with `AppColors.blue.withAlpha(30)`, border `AppColors.blue.withAlpha(80)`
- Show first letter of user displayName or fallback `?` icon
- Already done in today_screen.dart — replicate the same `GestureDetector` + avatar Container

**S3 — Capture button glow ring**:
- Idle state: outer ring with `3px` translucent border, inner white circle with small AI gradient dot
- Capturing state: outer ring becomes rotating conic gradient (blue→cyan→green)
- Add `AnimationController` for the rotating gradient (infinite loop)
- The inner icon should be a square stop icon (not an eye)
- Implement via `CustomPainter` sweeping gradient arc

**S4 — Library/Recent labels**:
- Add `Text('LIBRARY')` and `Text('RECENT')` labels below each icon (labelMono style, ~9px, secondary color)
- Layout: `Column(children: [IconButton, Text(label)])`

**Files**: `lib/features/scan/scan_screen.dart`

---

## TODAY SCREEN (screen_02_today.png vs `Today.png`)

### Mockup vs Live Delta:
| Element | Mockup | Live | Status |
|---|---|---|---|
| App bar sub-label | "FRIDAY · MAY 15" | "Tuesday · May 19" | ✅ OK |
| Bell + avatar | Bell icon + "EK" circle | Bell icon + person circle | ✅ OK (close) |
| Macro ring | 3 colored arcs with glow; protein outer/blue, carbs middle/cyan, fat inner/green | Single track rings only (all 0) | ⚠️ Data bug |
| Ring center text | "KCAL EATEN" mono, large number, "of 2,400", green pill | Same structure | ✅ OK |
| Percentage display | "56%" plain text right-aligned | "0%" in a green chip/badge | ❌ Wrong style |
| Macro row format | "96 / 170g  56%" right side | "0g / 170g  0%" | ✅ OK (when data loads) |
| Progress bar | Filled colored bar bottom of each sub-card | Empty bar (0%) | ⚠️ Data bug |
| "Recent scans" header | "Recent scans" left + "3 TODAY" right badge | Same | ✅ OK |
| Meal card | Thumbnail + name + kcal + time + macro pips + confidence | Same structure | ✅ OK |
| Error state | Not shown in mockup | "Error loading meals" | ❌ Bug |

### Fixes:
**T1 — Fix percentage chip** (`lib/shared/widgets/macro_progress_bar.dart` or `today_screen.dart`):
- Check `MacroProgressBar` widget — the `0%` chip styling uses a colored container
- Mockup shows plain text percentage, not a pill/chip
- Change the percentage display from:
  ```dart
  Container(padding..., child: Text('$pct%', style...color: AppColors.green))
  ```
  to:
  ```dart
  Text('$pct%', style: AppTextStyles.labelSmall.copyWith(color: color.withAlpha(200)))
  ```
- Read `macro_progress_bar.dart` first to confirm the current implementation

**T2 — Empty state** (already implemented `_EmptyMeals`): looks functional, keep

**T3 — Meal card image**: Thumbnail gradient placeholder is functional. Confirm `CachedNetworkImage` shows correctly when data loads.

**T4 — Data loads once B-CRITICAL-1 is fixed**: Ring arcs, macro bars, and meal cards will all populate automatically.

**Files**: `lib/shared/widgets/macro_progress_bar.dart`, `lib/features/today/today_screen.dart`

---

## HISTORY SCREEN (screen_03_history.png vs `History _ week.png`)

### Mockup vs Live Delta:
| Element | Mockup | Live | Status |
|---|---|---|---|
| Screen subtitle | "WEEK 20 · MAY" below title | Nothing | ❌ Missing |
| Nav arrows | "< >" in top right of screen | Inside calendar card | ❌ Wrong location |
| W/M toggle | Top right of calendar card | Present but overflows 4px | ❌ Overflow |
| Day letter format | "MON TUE WED THU FRI SAT SUN" (3-letter) | "M T W T F S S" (1-letter) | ❌ Wrong |
| Day completion rings | Colored rings per day (green≥85%, amber<85%) | Plain circles, no color fill | ❌ Missing |
| Weekly Average card | Separate card with kcal/day + sparkline + macro chips | Missing (SizedBox.shrink on error) | ❌ Missing |
| Sparkline | 7-pt cyan line chart, area fill, dashed target line | Missing | ❌ Missing |
| PROTEIN/CARBS/FAT chips | Average g/d chips row | Missing | ❌ Missing |
| Day log section | "Day log" header + streak badge + day rows | Shows Firestore error | ❌ Bug |
| Day row | Score circle + date + kcal + meal count + macro pips + chevron | Missing (error) | ❌ Bug |
| Streak badge | "🔥 5 DAY STREAK" green pill | Missing | ❌ Missing |
| Error state | Not shown | `[cloud_firestore/permission-denied]` full error text | ❌ Bug |

### Fixes:
**H1 — Fix B-CRITICAL-1 first** (Firestore error blocks all data display)

**H2 — Fix overflow** (see B-CRITICAL-2 above)

**H3 — Week header subtitle** (`history_screen.dart` SliverAppBar):
```dart
title: Column(
  crossAxisAlignment: CrossAxisAlignment.start,
  children: [
    Text('History', style: AppTextStyles.heading1...),
    Text('WEEK ${weekNumber} · ${monthName}', style: AppTextStyles.labelMono...),
  ],
),
actions: [
  IconButton(icon: Icon(Icons.chevron_left), onPressed: prevWeek),
  IconButton(icon: Icon(Icons.chevron_right), onPressed: nextWeek),
],
```

**H4 — Day letter format**: Change `DateFormat('E').format(day).substring(0, 1)` to `DateFormat('EEE').format(day).substring(0, 3).toUpperCase()` — mockup shows 3-letter abbreviations (MON TUE etc.)

**H5 — Day completion rings**: `_DayRingPainter` exists but rings appear to not be filling. Check that `completionFraction` is non-zero when data loads. Ensure colors: green `#1FCC74` if ≥0.85, amber `#F6A63A` if <0.85 and >0, transparent if 0.

**H6 — Weekly Average card** (`_WeeklyStats`): Currently uses `SizedBox.shrink()` on error. When fixed:
- Large "X,XXX kcal/day" number
- "95% target" badge
- Sparkline chart (7 points, Mon–Sun, cyan line with area fill)
- Dashed horizontal target line
- PROTEIN/CARBS/FAT average chips row

Implement `_Sparkline` using `CustomPainter` drawing:
- `Path` for line + closed area fill with `AppColors.cyan.withAlpha(30)`
- Dashed horizontal line at `plan.kcal`

**H7 — Streak badge**: Add to Day log section header:
```dart
Row(children: [
  Text('Day log', style: AppTextStyles.heading3),
  Container(
    decoration: BoxDecoration(color: AppColors.green.withAlpha(30), borderRadius: BorderRadius.circular(12)),
    child: Row(children: [Icon(Icons.local_fire_department, color: AppColors.green, size: 12), Text('${streak} DAY STREAK')]),
  ),
])
```
Streak = consecutive days with non-empty logs (compute from `logs` list sorted by date).

**H8 — Day row** (`_DayRow`): Add score circle left side:
- Score = `(log.kcal / plan.kcal * 100).clamp(0, 100).round()`
- `Container` 32px circle, green border if ≥85, amber if <85
- Text `score` inside

**Files**: `lib/features/history/history_screen.dart`

---

## GOALS SCREEN (screen_04_goals.png vs `Goals _ idle.png`)

### Mockup vs Live Delta:
| Element | Mockup | Live | Status |
|---|---|---|---|
| Plan header | "● PLAN · CUT PHASE · Week 4" (all caps) | "● Plan · Cut phase · Week 4" (title case) | ❌ Wrong case |
| "Adjust" button | "⊞ Adjust" top right | Missing | ❌ Missing |
| Body goal layout | Single row: Lose fat (selected) · Maintain · Lean+ +0.2kg/wk · Custom | 2×2 grid | ❌ Wrong layout |
| Goal sub-label | "-0.5kg/wk" under Lose fat | Missing | ❌ Missing |
| Section header style | "BODY GOAL", "DAILY CALORIE TARGET", "MACRO SPLIT" (uppercase labels) | "Body Goal", "Daily Calories", "Macro Split" (title case) | ❌ Wrong |
| Calorie card layout | Number on left, "− 1.0x +" control on right (same line) | Number on left, AI chip on right, no multiplier | ❌ Missing multiplier |
| AI chip position | Below the number "↑ AI · TDEE 2,820 − 420" | Top right of section | ❌ Wrong position |
| Macro Split label | "28% / 42% / 26%" text right of header | Missing | ❌ Missing |
| Macro chip g/kg | "2.1g/kg" sub-label under each macro chip | Missing | ❌ Missing |
| Weight section | "Log weight" button, current kg + delta, 30-day sparkline | "On pace" badge only | ❌ Incomplete |

### Fixes:
**G1 — Plan header text case** (`lib/features/goals/goals_screen.dart`):
- Change `'Plan · Cut phase · Week 4'` → `'PLAN · CUT PHASE · Week 4'`
- OR use `text.toUpperCase()` for the plan name portion only

**G2 — Add Adjust button**:
```dart
actions: [
  TextButton.icon(
    icon: Icon(Icons.tune, size: 14),
    label: Text('Adjust', style: AppTextStyles.labelSmall),
    onPressed: () => _showAdjustSheet(context),
  ),
],
```

**G3 — Body goal single row**: Change the `Wrap` or `GridView` to:
```dart
SingleChildScrollView(
  scrollDirection: Axis.horizontal,
  child: Row(children: [
    _GoalChip('Lose fat', subtitle: '-0.5kg/wk', isActive: true),
    _GoalChip('Maintain'),
    _GoalChip('Lean+', subtitle: '+0.2kg/wk'),
    _GoalChip('Custom'),
  ]),
)
```
Active chip: white card bg + shadow. Inactive: transparent with border.

**G4 — Section header labels**: Change to uppercase mono style:
```dart
Text('BODY GOAL', style: AppTextStyles.labelMono.copyWith(color: textSecondary))
Text('DAILY CALORIE TARGET', ...)
Text('MACRO SPLIT', ...)
```

**G5 — Calorie card layout**:
- Move AI chip from top-right to below the kcal number
- Add `− 1.0x +` multiplier control (three `TextButton`s or `IconButton` row)
- Slider with BMR + TDEE landmark labels

**G6 — Macro Split percentage**:
```dart
Row(
  mainAxisAlignment: MainAxisAlignment.spaceBetween,
  children: [
    Text('MACRO SPLIT', style: labelMono),
    Text('${proteinPct}% / ${carbsPct}% / ${fatPct}%', style: labelSmall.copyWith(color: textSecondary)),
  ],
)
```

**G7 — g/kg sub-labels in macro chips**:
```dart
Column(children: [
  Text('170g', style: heading3),
  Text('2.1g/kg', style: labelSmall.copyWith(color: textSecondary)),
])
```
Weight assumed from `plan.weightKg` or default 80kg.

**G8 — Weight section**: Add "Log weight" button, show weight delta badge, render 30-day sparkline (similar to History sparkline).

**Files**: `lib/features/goals/goals_screen.dart`

---

## AI SCREEN (screen_05_ai.png vs `AI chat.png`)

### Mockup vs Live Delta:
| Element | Mockup | Live | Status |
|---|---|---|---|
| Screen title | "Calorix AI" with green AI icon on left | "AI" plain | ❌ Wrong |
| Header layout | Icon + "Calorix AI" title + "×" close on right | Just "AI" title | ❌ Missing |
| "CAN EDIT YOUR PLAN" badge | Green dot + mono label below title | Present | ✅ OK |
| User bubbles | Right-aligned, blue-tinted bg, sharp bottom-right corner | Basic | ~OK |
| AI bubbles | Left-aligned, dark card bg, sharp bottom-left corner | Basic | ~OK |
| AI action confirm card | "AI ACTION" badge, old→new table, Keep/Apply buttons | Missing entirely | ❌ Missing |
| Time stamps | "TODAY · 13:02" date separator | Missing | ❌ Missing |
| Message area | Scrollable chat | Present but empty (only greeting) | ✅ OK |
| Input composer | "+" icon + "Ask anything…" + mic + send arrow | Present | ✅ OK |
| Suggested prompts | Horizontal scroll chips | Present | ✅ OK |

### Fixes:
**AI1 — Title** (`lib/features/ai_chat/ai_chat_screen.dart`):
```dart
// SliverAppBar or AppBar title:
Row(children: [
  Container(
    width: 28, height: 28,
    decoration: BoxDecoration(
      gradient: LinearGradient(colors: [AppColors.blue, AppColors.cyan]),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Icon(Icons.auto_awesome, size: 16, color: Colors.white),
  ),
  SizedBox(width: 10),
  Text('Calorix AI', style: AppTextStyles.heading1),
])
```

**AI2 — Timestamp separators**:
```dart
// Add date separator widget between messages from different days
Container(
  child: Text('TODAY · ${DateFormat('HH:mm').format(msg.timestamp)}',
    style: AppTextStyles.labelMono.copyWith(color: textSecondary)),
)
```

**AI3 — AI action confirmation card**: Add `_AiActionCard` widget:
```dart
Card(
  shape: RoundedRectangleBorder(
    side: BorderSide(color: AppColors.blue.withAlpha(60)),
    borderRadius: BorderRadius.circular(16),
  ),
  child: Column(children: [
    Row(children: [
      Text('Correct meal to...', style: labelLarge),
      Container(child: Text('AI ACTION', style: labelMono.copyWith(color: AppColors.cyan))),
    ]),
    // Table rows: old → new values with strikethrough old, delta badge
    ...changes.map((c) => _ChangeRow(c)),
    Row(children: [
      OutlinedButton(child: Text('Keep original'), onPressed: onReject),
      FilledButton(child: Text('Apply correction'), onPressed: onApply),
    ]),
  ]),
)
```

**AI4 — Message bubble border radii** (spec says):
- User: `BorderRadius.only(topLeft: r18, topRight: r18, bottomLeft: r18, bottomRight: r6)` — sharp sent corner
- AI: `BorderRadius.only(topLeft: r18, topRight: r18, bottomLeft: r6, bottomRight: r18)` — sharp received corner

**Files**: `lib/features/ai_chat/ai_chat_screen.dart`

---

## BOTTOM NAV / SHELL (app_shell.dart)

### Mockup vs Live Delta:
| Element | Mockup | Live | Status |
|---|---|---|---|
| Tab icons | Custom icons per tab | Material icons | ~OK |
| Active dot | Small green dot below "Scan" label | Present | ✅ OK |
| Scan FAB | Center, raised, gradient ring | Present with gradient ring | ✅ OK |
| "SCAN" label | Below FAB, uppercase | Present | ✅ OK |

---

## IMPLEMENTATION ORDER

1. **B-CRITICAL-1**: Deploy Firestore rules + indexes → verify on device → data loads
2. **B-CRITICAL-2**: History overflow fix (2-line change)
3. **T1**: Today percentage chip → plain text
4. **H3-H8**: History screen full rebuild (weekly avg, sparkline, streak, day rows)
5. **G1-G8**: Goals screen layout + missing elements
6. **S1-S4**: Scan screen chrome (flash pill, avatar, capture glow, labels)
7. **AI1-AI4**: AI screen title + action card + bubbles

Each phase should: implement → `fvm flutter analyze` → `fvm flutter test` → hot reload on device → screenshot comparison.

---

## ACCEPTANCE CRITERIA

- [ ] No "Error loading meals" or permission-denied errors visible on device
- [ ] History screen has no overflow
- [ ] Today: macro ring fills with correct arcs when meals exist; percentage shows as plain text
- [ ] History: weekly average card with sparkline; day rows with score circles; streak badge
- [ ] Goals: single-row body goal pills; uppercase section headers; g/kg labels; Adjust button
- [ ] Scan: Flash · Auto pill; avatar circle; capture button with glow ring; Library/Recent labels
- [ ] AI: "Calorix AI" title with icon; action confirmation card component exists
- [ ] `fvm flutter analyze` passes (0 errors)
- [ ] All existing widget tests pass
