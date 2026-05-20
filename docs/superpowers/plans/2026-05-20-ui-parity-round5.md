# Calorix UI Parity — Round 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all remaining visual and data discrepancies between the live Flutter app and the light-mode JSX mockups across all 5 screens.

**Architecture:** Targeted, surgical edits — no broad rewrites. Each task is self-contained and verifiable with `fvm flutter analyze`. The biggest unblock is fixing the Firestore `dailyLogs` rule so History actually renders data. All other tasks are pure Dart/widget changes.

**Tech Stack:** Flutter 3.x / Dart, Riverpod, Firestore, GoRouter, `intl` (NumberFormat), `app_colors.dart` design tokens.

**AVD internet:** Confirmed working (WiFi shown in status bar, Goals screen loads Firestore data). History is blank due to a Firestore security rule mismatch, not connectivity.

---

## Gap Analysis Reference

| Screen | Issue | Cause |
|---|---|---|
| History | Blank (no data, no weekly stats, no day rows) | Firestore rule upper-bound `uid+'z'` doesn't exactly match query bound `uid+'_z'` — permission denied on list |
| History | Missing "Day log" header + streak badge | Not implemented |
| History | Day row: score ring on RIGHT, no macro pips, kcal no comma | Layout order, data, NumberFormat |
| Today | Macro ring tracks almost invisible | `color.withAlpha(40)` too faint |
| Today | Shows 0 kcal / ring empty | food_entries not seeded |
| Goals | "2400 kcal" missing comma | Direct `'$kcal kcal'` string interpolation |
| Goals | "Save Goals" button at bottom | Not in mockup — remove |
| Scan | Profile icon shows blocked/muted glyph | Wrong `Icons.*` used |
| AI Chat | No × close button | Not implemented |
| AI Chat | Third suggested prompt cut off at right edge | Row not scrollable |
| App colors | textTertiary tokens missing; textSecondary off from spec | Incomplete token set |

---

## Task 1: Fix Firestore dailyLogs rule boundary + deploy

**Files:**
- Modify: `firestore.rules:48-55`

The query in `history_providers.dart` uses `isLessThan: '${uid}_z'` but the Firestore rule uses `request.auth.uid + 'z'` (no underscore). Firestore cannot statically verify these match, so list queries are denied. Fix: align the rule to `uid + '_z'`.

- [ ] **Step 1: Edit firestore.rules**

Change lines 48–55 from:
```
match /dailyLogs/{logId} {
  allow read: if request.auth != null &&
    logId >= request.auth.uid + '_' &&
    logId < request.auth.uid + 'z';
  allow write: if request.auth != null &&
    logId >= request.auth.uid + '_' &&
    logId < request.auth.uid + 'z';
}
```

To:
```
match /dailyLogs/{logId} {
  allow read: if request.auth != null &&
    logId >= request.auth.uid + '_' &&
    logId < request.auth.uid + '_z';
  allow write: if request.auth != null &&
    logId >= request.auth.uid + '_' &&
    logId < request.auth.uid + '_z';
}
```

- [ ] **Step 2: Confirm Firebase project before deploying**

```powershell
firebase use
```
Expected: `calorix-xurschnell (current)` or equivalent. If wrong, run `firebase use <project-id>`.

- [ ] **Step 3: Deploy only Firestore rules (not everything)**

```powershell
firebase deploy --only firestore:rules
```
Expected output: `✔  firestore: released rules ...`

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "fix: align dailyLogs Firestore rule upper bound to match query (_z)"
```

---

## Task 2: Fix app_colors.dart — add missing design tokens

**Files:**
- Modify: `lib/core/theme/app_colors.dart`

The design spec defines `textTertiary` and `surfaceRaised` tokens that are missing. Also `textSecondary` values are off from the spec (#6B6F77 light / #A8B0BC dark).

- [ ] **Step 1: Read current app_colors.dart**

Already read at line 1-71 above.

- [ ] **Step 2: Update existing + add missing tokens**

`textSecondaryLight` and `textSecondaryDark` ALREADY EXIST on lines 22-23 with wrong values — REPLACE them, do not add duplicates (compile error):

```dart
// REPLACE lines 22-23 in lib/core/theme/app_colors.dart:
  static const Color textSecondaryLight = Color(0xFF6B6F77);  // spec: #6B6F77 (was 0xFF5A5A6E)
  static const Color textSecondaryDark = Color(0xFFA8B0BC);   // spec: #A8B0BC (was 0xFF8A8A9A)
```

Then ADD after `textSecondaryDark` (line 23):
```dart
  static const Color textTertiaryLight = Color(0xFF9A9EA6);   // spec: #9A9EA6
  static const Color textTertiaryDark = Color(0xFF6F7885);    // spec: #6F7885
```

And ADD after the `navBarDark` token (around line 51):
```dart
  // Surface raised
  static const Color surfaceRaisedLight = Color(0xFFFFFDF7);
  static const Color surfaceRaisedDark = Color(0xFF171C24);
```

- [ ] **Step 3: Verify analyze passes**

```powershell
fvm flutter analyze --no-pub
```
Expected: `No issues found!`

- [ ] **Step 4: Commit**

```bash
git add lib/core/theme/app_colors.dart
git commit -m "fix: add textTertiary + surfaceRaised tokens; align textSecondary to spec"
```

---

## Task 3: Fix macro ring track visibility on Today screen

**Files:**
- Modify: `lib/shared/widgets/macro_ring.dart:101-105`

The track ring uses `color.withAlpha(40)` which is ~16% opacity — almost invisible on a white background. Spec/mockup shows clearly visible faded tracks. Fix: increase to alpha=70 (~27%). Also bump stroke width from 8 to 10 for better visual weight.

- [ ] **Step 1: Update _drawArc track paint alpha**

In `lib/shared/widgets/macro_ring.dart`, change the `trackPaint` color:

```dart
// Before (line 105):
..color = color.withAlpha(40);

// After:
..color = color.withAlpha(70);
```

- [ ] **Step 2: Increase default strokeWidth**

In `class MacroRing` (line 20):

```dart
// Before:
this.strokeWidth = 8,

// After:
this.strokeWidth = 10,
```

- [ ] **Step 3: Hot reload and verify ring tracks are visible on Today screen**

```powershell
# app must be running; otherwise: fvm flutter run -d emulator-5554
```

Ring tracks for Protein (blue), Carbs (cyan), Fat (green) should be visible as faint arcs even when all fractions are 0.

- [ ] **Step 4: Commit**

```bash
git add lib/shared/widgets/macro_ring.dart
git commit -m "fix: increase macro ring track alpha and stroke width for visibility"
```

---

## Task 4: Seed food entries for Today screen

**Files:**
- Modify: `lib/shared/services/seed_data_service.dart`

`SeedDataService.seedIfEmpty` seeds `dailyLogs` but not `food_entries`. Today screen shows 0/2,400 with empty ring. Seed 3 realistic food entries for today so the ring fills partially and meal cards render.

- [ ] **Step 1: Read current seed_data_service.dart**

Already read at lines 1-45 above.

- [ ] **Step 2: Add food entry seeding**

Replace the entire `seed_data_service.dart` content:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/constants/app_constants.dart';

class SeedDataService {
  final FirebaseFirestore _db;
  SeedDataService(this._db);

  static const _seedDays = [
    (kcal: 1980.0, protein: 148.0, carbs: 210.0, fat: 62.0, entries: 3),
    (kcal: 2140.0, protein: 162.0, carbs: 228.0, fat: 68.0, entries: 4),
    (kcal: 1760.0, protein: 135.0, carbs: 188.0, fat: 54.0, entries: 3),
    (kcal: 2310.0, protein: 170.0, carbs: 248.0, fat: 74.0, entries: 5),
    (kcal: 2050.0, protein: 155.0, carbs: 218.0, fat: 65.0, entries: 3),
    (kcal: 1890.0, protein: 142.0, carbs: 200.0, fat: 60.0, entries: 4),
    (kcal: 2200.0, protein: 165.0, carbs: 235.0, fat: 70.0, entries: 4),
  ];

  static const _todayEntries = [
    (
      name: 'Chicken Rice Bowl',
      kcal: 620.0,
      protein: 48.0,
      carbs: 72.0,
      fat: 16.0,
      confidence: 0.91,
      meal: 'lunch',
    ),
    (
      name: 'Greek Yogurt & Berries',
      kcal: 210.0,
      protein: 18.0,
      carbs: 28.0,
      fat: 4.0,
      confidence: 0.95,
      meal: 'breakfast',
    ),
    (
      name: 'Protein Shake',
      kcal: 180.0,
      protein: 30.0,
      carbs: 8.0,
      fat: 3.0,
      confidence: 0.97,
      meal: 'snack',
    ),
  ];

  Future<void> seedIfEmpty(String uid) async {
    await _seedDailyLogs(uid);
    await _seedTodayEntries(uid);
  }

  Future<void> _seedDailyLogs(String uid) async {
    final col = _db.collection(AppConstants.dailyLogsCollection);
    final existing = await col
        .where(FieldPath.documentId, isGreaterThanOrEqualTo: '${uid}_')
        .where(FieldPath.documentId, isLessThan: '${uid}_z')
        .limit(1)
        .get();
    if (existing.docs.isNotEmpty) return;

    final now = DateTime.now();
    final batch = _db.batch();
    for (int i = 0; i < _seedDays.length; i++) {
      final day = now.subtract(Duration(days: _seedDays.length - 1 - i));
      final dateStr =
          '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
      final docId = '${uid}_$dateStr';
      batch.set(col.doc(docId), {
        'kcal': _seedDays[i].kcal,
        'protein': _seedDays[i].protein,
        'carbs': _seedDays[i].carbs,
        'fat': _seedDays[i].fat,
        'entryCount': _seedDays[i].entries,
        'date': dateStr,
      });
    }
    await batch.commit();
  }

  Future<void> _seedTodayEntries(String uid) async {
    final col = _db.collection(AppConstants.entriesCollection);
    final todayStr = _todayDateStr();
    final existing = await col
        .where('uid', isEqualTo: uid)
        .where('date', isEqualTo: todayStr)
        .limit(1)
        .get();
    if (existing.docs.isNotEmpty) return;

    final now = DateTime.now();
    final batch = _db.batch();
    final mealTimes = [
      now.copyWith(hour: 8, minute: 30),
      now.copyWith(hour: 12, minute: 48),
      now.copyWith(hour: 16, minute: 15),
    ];
    for (int i = 0; i < _todayEntries.length; i++) {
      final e = _todayEntries[i];
      final doc = col.doc();
      batch.set(doc, {
        'uid': uid,
        'date': todayStr,
        'foodName': e.name,
        'kcal': e.kcal,
        'protein': e.protein,
        'carbs': e.carbs,
        'fat': e.fat,
        'confidence': e.confidence,
        'mealType': e.meal,
        'servingSize': 1.0,
        'quantity': 1.0,
        'status': 'confirmed',
        'timestamp': Timestamp.fromDate(mealTimes[i]),
        'imageUrl': null,
      });
    }
    await batch.commit();
  }

  String _todayDateStr() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }
}
```

- [ ] **Step 3: Note on collection constant name**

`AppConstants.foodEntriesCollection` does NOT exist. The correct constant is:
```dart
AppConstants.entriesCollection  // = 'entries'
```

Replace any occurrence of `AppConstants.foodEntriesCollection` in the seed code above with `AppConstants.entriesCollection`.

- [ ] **Step 4: Verify analyze**

```powershell
fvm flutter analyze --no-pub
```

- [ ] **Step 5: Hot restart app on emulator to trigger re-seed**

Today screen should now show ~1,010 kcal eaten with 3 meal cards visible.

- [ ] **Step 6: Commit**

```bash
git add lib/shared/services/seed_data_service.dart
git commit -m "feat: seed today food entries so macro ring and meal cards show data"
```

---

## Task 5: Fix History screen — day log header + day row layout

**Files:**
- Modify: `lib/features/history/history_screen.dart:168-196`

Two changes: (1) add a "Day log" header row with the streak badge above the day rows; (2) fix `_DayRow` layout to match mockup: score ring LEFT, date + macro pips middle, kcal right.

- [ ] **Step 1: Add "Day log" section header**

In `history_screen.dart`, replace the comment `// Day rows` section (around lines 177-195) with:

```dart
// Day log header + rows
historyAsync.when(
  loading: () => const Center(child: CircularProgressIndicator()),
  error: (e, _) => const SizedBox.shrink(),
  data: (logs) {
    if (logs.isEmpty) return const SizedBox.shrink();
    final streak = _computeStreak(logs);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // "Day log" header with streak badge
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Day log',
                style: AppTextStyles.heading3.copyWith(color: textColor),
              ),
              if (streak > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.green.withAlpha(25),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '$streak DAY STREAK',
                    style: AppTextStyles.labelSmall.copyWith(color: AppColors.green),
                  ),
                ),
            ],
          ),
        ),
        ...logs.map((log) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _DayRow(
            log: log,
            isDark: isDark,
            onTap: () => context.go(
                '/history/${DateFormat('yyyy-MM-dd').format(log.date)}'),
          ),
        )),
      ],
    );
  },
),
```

Note: `_computeStreak` is a private method on `_WeeklyStats`. Extract it by adding a top-level helper or moving it to `_HistoryScreenState`. Add this method to `_HistoryScreenState`:

```dart
int _computeStreak(List<DailyLog> logs) {
  int streak = 0;
  final today = DateTime.now();
  for (int i = 0; i < logs.length; i++) {
    final log = logs[i];
    if (!log.hasData) break;
    final expected = today.subtract(Duration(days: i));
    if (DateFormat('yyyy-MM-dd').format(log.date) !=
        DateFormat('yyyy-MM-dd').format(expected)) break;
    streak++;
  }
  return streak;
}
```

Remove `_computeStreak` from `_WeeklyStats` and call the state method from `_WeeklyStats` instead — OR keep it duplicated (simpler, no coupling). Keep it duplicated.

- [ ] **Step 2: Fix _DayRow layout to match mockup**

Replace the `_DayRow.build` method return with:

```dart
@override
Widget build(BuildContext context) {
  final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
  final subtextColor =
      isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
  final pct = AppConstants.defaultKcalTarget > 0
      ? log.kcal / AppConstants.defaultKcalTarget
      : 0.0;
  final ringColor = pct >= 0.85 ? AppColors.green : AppColors.needsReview;

  return GestureDetector(
    onTap: onTap,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            // Score ring — LEFT (matches mockup)
            SizedBox(
              width: 40,
              height: 40,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CustomPaint(
                    size: const Size(40, 40),
                    painter: _SmallRingPainter(
                        fraction: pct.clamp(0.0, 1.0), color: ringColor),
                  ),
                  Text(
                    '${(pct * 100).clamp(0, 100).round()}',
                    style: AppTextStyles.labelSmall.copyWith(
                      color: ringColor,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            // Date + meal count + macro pips — MIDDLE
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    DateFormat('EEE, MMM d').format(log.date),
                    style: AppTextStyles.labelLarge.copyWith(color: textColor),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(
                        '${log.entryCount} meals',
                        style: AppTextStyles.bodySmall.copyWith(color: subtextColor),
                      ),
                      const SizedBox(width: 6),
                      _MacroPip(value: log.protein, color: AppColors.protein),
                      const SizedBox(width: 4),
                      _MacroPip(value: log.carbs, color: AppColors.carbs),
                      const SizedBox(width: 4),
                      _MacroPip(value: log.fat, color: AppColors.fat),
                    ],
                  ),
                ],
              ),
            ),
            // Kcal — RIGHT
            Text(
              '${NumberFormat('#,###').format(log.kcal.round())} kcal',
              style: AppTextStyles.labelLarge.copyWith(color: textColor),
            ),
            const SizedBox(width: 6),
            Icon(Icons.chevron_right, color: subtextColor, size: 16),
          ],
        ),
      ),
    ),
  );
}
```

Add a private `_MacroPip` widget inside `history_screen.dart` (after `_SmallRingPainter`):

```dart
class _MacroPip extends StatelessWidget {
  final double value;
  final Color color;
  const _MacroPip({required this.value, required this.color});

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5, height: 5,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 2),
          Text('${value.round()}g',
              style: AppTextStyles.bodySmall.copyWith(color: color, fontSize: 10)),
        ],
      );
}
```

Make sure `DailyLog` exposes `.protein`, `.carbs`, `.fat` fields. If they're named differently, adjust accordingly.

- [ ] **Step 3: Verify analyze passes**

```powershell
fvm flutter analyze --no-pub
```

- [ ] **Step 4: Commit**

```bash
git add lib/features/history/history_screen.dart
git commit -m "fix: add Day log header with streak, move score ring left, add macro pips in day row"
```

---

## Task 6: Fix Goals screen — number format + remove Save button

**Files:**
- Modify: `lib/features/goals/goals_screen.dart:312, 101-108`

Two changes: (1) format kcal with comma (`NumberFormat`); (2) remove the "Save Goals" button (not in mockup).

- [ ] **Step 1: Fix kcal number formatting**

In `_CalorieCard.build` (around line 312):

```dart
// Before:
Text(
  '$kcal kcal',
  style: AppTextStyles.heroNumber.copyWith(color: textColor, fontSize: 32),
),

// After:
Text(
  '${NumberFormat('#,###').format(kcal)} kcal',
  style: AppTextStyles.heroNumber.copyWith(color: textColor, fontSize: 32),
),
```

Add `import 'package:intl/intl.dart';` at the top of `goals_screen.dart` if not already present.

- [ ] **Step 2: Remove Save Goals button**

In `GoalsScreen.build`, delete these lines (around 100-108):

```dart
const SizedBox(height: 24),

// Save button
SizedBox(
  width: double.infinity,
  child: ElevatedButton(
    onPressed: () => _savePlan(context, ref, macroSplit, bodyGoal),
    child: const Text('Save Goals'),
  ),
),
```

Also remove the `_savePlan` method (lines 134-144) and `SizedBox(height: 24)` before it.

- [ ] **Step 3: Verify analyze**

```powershell
fvm flutter analyze --no-pub
```

- [ ] **Step 4: Commit**

```bash
git add lib/features/goals/goals_screen.dart
git commit -m "fix: comma-format kcal in Goals; remove Save button per mockup"
```

---

## Task 7: Fix Scan screen — profile button icon

**Files:**
- Modify: `lib/features/scan/scan_screen.dart` (top controls area)

The profile button at top-right shows a wrong icon (blocked/muted glyph). Mockup shows "A" user initial — use `Icons.person_outline` as a placeholder.

- [ ] **Step 1: Find the profile button in scan_screen.dart**

```powershell
grep -n "profile\|person\|avatar\|Icons\." lib/features/scan/scan_screen.dart
```

- [ ] **Step 2: Replace the icon**

Find the circular icon button at the top-right of the Scan screen build method. Replace whatever icon is used with:

```dart
child: Icon(
  Icons.person_outline,
  size: 20,
  color: AppColors.cameraOverlayText,
),
```

The containing Container should remain a 36×36 or 40×40 circle with `AppColors.cameraOverlayBg` background:

```dart
Container(
  width: 36,
  height: 36,
  decoration: BoxDecoration(
    shape: BoxShape.circle,
    color: AppColors.cameraOverlayBg,
  ),
  child: const Icon(
    Icons.person_outline,
    size: 18,
    color: AppColors.cameraOverlayText,
  ),
),
```

- [ ] **Step 3: Verify analyze**

```powershell
fvm flutter analyze --no-pub
```

- [ ] **Step 4: Commit**

```bash
git add lib/features/scan/scan_screen.dart
git commit -m "fix: Scan screen profile button uses person_outline icon"
```

---

## Task 8: Fix AI Chat — close button + suggested prompts scroll

**Files:**
- Modify: `lib/features/ai_chat/ai_chat_screen.dart`

Two changes: (1) add a × close button to the AI chat header; (2) wrap the suggested prompts row in a horizontal `SingleChildScrollView` so the third prompt isn't clipped.

- [ ] **Step 1: Find the AI chat header and prompts**

```powershell
grep -n "close\|actions\|suggestedPrompt\|Plan my\|Adjust for" lib/features/ai_chat/ai_chat_screen.dart
```

- [ ] **Step 2: Add × close button**

In the AI chat header/AppBar, add a close action. If the screen uses a `Column` header (not a standard `AppBar`), add a `GestureDetector` × button at the top right:

```dart
// In the header row, add to the end:
GestureDetector(
  onTap: () => context.pop(),
  child: Container(
    width: 32,
    height: 32,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: isDark ? const Color(0x14FFFFFF) : const Color(0x0F000000),
    ),
    child: Icon(
      Icons.close,
      size: 16,
      color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight,
    ),
  ),
),
```

- [ ] **Step 3: Fix suggested prompts overflow**

Find the Row that contains the suggested prompt chips and wrap it in a horizontal scroll:

```dart
// Before (something like):
Row(
  children: _suggestedPrompts.map((p) => _PromptChip(label: p)).toList(),
)

// After:
SingleChildScrollView(
  scrollDirection: Axis.horizontal,
  padding: const EdgeInsets.symmetric(horizontal: 16),
  child: Row(
    children: _suggestedPrompts.map((p) => Padding(
      padding: const EdgeInsets.only(right: 8),
      child: _PromptChip(label: p),
    )).toList(),
  ),
),
```

Remove any `Expanded` wrappers inside the Row since it's now scrollable.

- [ ] **Step 4: Verify analyze**

```powershell
fvm flutter analyze --no-pub
```

- [ ] **Step 5: Commit**

```bash
git add lib/features/ai_chat/ai_chat_screen.dart
git commit -m "fix: add close button to AI chat header; make suggested prompts horizontally scrollable"
```

---

## Task 9: Live verification on AVD

**Goal:** Run all 5 screens on the emulator and confirm fixes. AVD (emulator-5554) is available. App must be restarted (not just hot-reloaded) after seed changes.

- [ ] **Step 1: Full restart**

```powershell
fvm flutter run -d emulator-5554
```

Wait for build and app launch. If app is already running: hot restart via `R` in the terminal or via Dart MCP `mcp__dart__hot_restart`.

- [ ] **Step 2: Navigate to each screen and capture screenshots**

Using ADB:
```powershell
adb shell screencap /sdcard/r5_scan.png && adb pull /sdcard/r5_scan.png docs/live-app-screenshots/round5/01_scan.png
# Then tap to Today:
adb shell input tap 70 1460
adb shell screencap /sdcard/r5_today.png && adb pull /sdcard/r5_today.png docs/live-app-screenshots/round5/02_today.png
# History:
adb shell input tap 210 1460
adb shell screencap /sdcard/r5_history.png && adb pull /sdcard/r5_history.png docs/live-app-screenshots/round5/03_history.png
# Goals:
adb shell input tap 493 1460
adb shell screencap /sdcard/r5_goals.png && adb pull /sdcard/r5_goals.png docs/live-app-screenshots/round5/04_goals.png
# AI:
adb shell input tap 636 1460
adb shell screencap /sdcard/r5_ai.png && adb pull /sdcard/r5_ai.png docs/live-app-screenshots/round5/05_ai.png
```

Create the directory first:
```powershell
New-Item -ItemType Directory -Force docs/live-app-screenshots/round5
```

- [ ] **Step 3: Verify each screen against mockup**

| Screen | Check |
|---|---|
| Today | Ring tracks visible as faint arcs; meal cards show Chicken Rice Bowl, Greek Yogurt, Protein Shake |
| History | Weekly average card shows kcal/day; Day log header shows streak; day rows have score ring LEFT + macro pips |
| Goals | "2,400 kcal" with comma; no Save button |
| Scan | Profile button top-right shows person icon |
| AI Chat | × button at top right; all 3 prompt chips scrollable |

- [ ] **Step 4: Final commit with screenshots**

```bash
git add docs/live-app-screenshots/round5/
git commit -m "chore: add round 5 verification screenshots"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] History blank → Task 1 (Firestore rules) + Task 5 (header/layout)
- [x] Today ring invisible → Task 3 (alpha)
- [x] Today no data → Task 4 (seed)
- [x] Goals kcal format → Task 6
- [x] Goals Save button → Task 6
- [x] Scan icon → Task 7
- [x] AI close button → Task 8
- [x] AI prompts clip → Task 8
- [x] App color tokens → Task 2

**Placeholder scan:** None — all steps contain exact file paths and code.

**Type consistency:** `DailyLog.protein/carbs/fat` are accessed in Task 5's `_MacroPip` — if the model uses different field names, adjust. `AppConstants.foodEntriesCollection` used in Task 4 — verify constant name before running.

**Risky step:** Task 1 deploys Firestore rules to production. Confirm `firebase use` shows the right project first.
