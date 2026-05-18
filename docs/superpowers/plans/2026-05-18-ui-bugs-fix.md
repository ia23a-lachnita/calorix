# Calorix UI Polish + Bug Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 runtime bugs (Firestore permission-denied on History, missing composite index on Today, 5.5px overflow) and bring Today and History screens to visual parity with `docs/mockups/image/dark/single/`. Write and pass 3 widget-test files.

**Architecture:** All Firestore fixes first (they unblock visual QA). Then polish widgets file-by-file. Tests use Riverpod `ProviderScope` overrides — no Firestore emulator needed for widget tests. Firebase deploy runs via Firebase MCP after rule/index changes.

**Tech Stack:** Flutter/Dart (FVM), Riverpod, GoRouter, Cloud Firestore, intl, flutter_test

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `firestore.rules` | Modify | Fix `permission-denied` on History — replace `.matches()` regex with string comparison |
| `firestore.indexes.json` | Modify | Add composite indexes for `entries` collection |
| `lib/shared/widgets/macro_ring.dart` | Modify | Add glow/bloom on filled arcs |
| `lib/features/today/today_screen.dart` | Modify | Comma-formatted numbers, date sub-label, bell icon, "Recent scans" label, overflow fix |
| `lib/features/history/history_screen.dart` | Modify | "THIS WEEK" header, W/M toggle, week navigation arrows, day completion rings, macro averages |
| `test/today_screen_test.dart` | Create | Widget tests for Today screen |
| `test/history_screen_test.dart` | Create | Widget tests for History screen |
| `test/app_shell_test.dart` | Create | Widget tests for bottom nav shell |

---

## Task 1: Fix Firestore security rule — History `permission-denied` (B1)

**Files:**
- Modify: `firestore.rules`

**Why it's broken:** `logId.matches('^' + request.auth.uid + '_.*')` uses a regex. Firestore's query security evaluator cannot prove that all results of a range query satisfy a regex — it only applies regex checks to individual doc reads. String comparison operators (`>=`, `<`) ARE provable from query constraints.

- [ ] **Step 1: Edit `firestore.rules`**

Replace the `dailyLogs` block (lines 48-53):

```
# BEFORE:
match /dailyLogs/{logId} {
  allow read: if request.auth != null &&
    logId.matches('^' + request.auth.uid + '_.*');
  allow write: if false;
}

# AFTER:
match /dailyLogs/{logId} {
  allow read: if request.auth != null &&
    logId >= request.auth.uid + '_' &&
    logId < request.auth.uid + 'z';
  allow write: if false;
}
```

- [ ] **Step 2: Deploy updated rules using Firebase MCP**

Use `mcp__firebase__firebase_deploy` with `targets: ["firestore:rules"]` and project `calorix-xurschnell`. Alternatively run:
```powershell
firebase deploy --only firestore:rules --project calorix-xurschnell
```
Expected output: `✔  firestore: released rules firestore.rules`

- [ ] **Step 3: Commit**
```powershell
git add firestore.rules
git commit -m "fix: replace regex rule with string comparison for dailyLogs collection query"
```

---

## Task 2: Add Firestore composite indexes — fix "Error loading meals" (B2)

**Files:**
- Modify: `firestore.indexes.json`

**Why it's broken:** `watchTodayEntries`, `watchEntriesForDate`, and `getRecentEntries` all query with `uid ==`, `status ==`, `timestamp orderBy DESC`. Firestore requires a composite index for any query combining equality and ordering on different fields.

- [ ] **Step 1: Replace `firestore.indexes.json` content**

```json
{
  "indexes": [
    {
      "collectionGroup": "entries",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "uid", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "entries",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "uid", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 2: Deploy updated indexes using Firebase MCP**

Use `mcp__firebase__firebase_deploy` with `targets: ["firestore:indexes"]` or:
```powershell
firebase deploy --only firestore:indexes --project calorix-xurschnell
```
Expected: `✔  firestore: deployed indexes`  
Note: index building takes 1-5 minutes in the Firebase console. The app query will work once the index status changes to "Enabled".

- [ ] **Step 3: Commit**
```powershell
git add firestore.indexes.json
git commit -m "fix: add composite indexes for entries collection queries"
```

---

## Task 3: Fix 5.5px bottom overflow on Today screen (B3)

**Files:**
- Modify: `lib/features/today/today_screen.dart`

- [ ] **Step 1: Write the failing test**

Create `test/today_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';

Widget _buildTodayScreen({List<FoodEntry> entries = const []}) {
  return ProviderScope(
    overrides: [
      todayEntriesProvider.overrideWith((_) => Stream.value(entries)),
      todayMacroSummaryProvider.overrideWith(
        (_) => (kcal: 0.0, protein: 0.0, carbs: 0.0, fat: 0.0),
      ),
      activePlanProvider.overrideWith(
        (_) => Stream.value<MacroTargetPlan?>(MacroTargetPlan.defaultPlan()),
      ),
    ],
    child: const MaterialApp(home: TodayScreen()),
  );
}

void main() {
  testWidgets('Today screen has no overflow', (tester) async {
    await tester.pumpWidget(_buildTodayScreen());
    await tester.pump(const Duration(seconds: 2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today screen shows macro ring', (tester) async {
    await tester.pumpWidget(_buildTodayScreen());
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('KCAL EATEN'), findsOneWidget);
  });

  testWidgets('Today screen shows Recent scans header', (tester) async {
    await tester.pumpWidget(_buildTodayScreen());
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Recent scans'), findsOneWidget);
  });

  testWidgets('Today screen shows empty state when no meals', (tester) async {
    await tester.pumpWidget(_buildTodayScreen(entries: []));
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('No meals logged yet'), findsOneWidget);
  });

  testWidgets('Today screen does NOT show error text on success', (tester) async {
    await tester.pumpWidget(_buildTodayScreen());
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Error loading meals'), findsNothing);
  });
}
```

- [ ] **Step 2: Run test — expect compile error or FAIL**
```powershell
fvm flutter test test/today_screen_test.dart --no-pub
```
Expected: fails (if `activePlanProvider` signature doesn't match or overflow exists).

- [ ] **Step 3: Add trailing sliver padding in `TodayScreen.build()`**

In `lib/features/today/today_screen.dart`, after the last `SliverPadding` block (the one containing the sliver list), add a new sliver as the final child of the `CustomScrollView`:

```dart
// Add this AFTER the closing of SliverPadding containing SliverList:
const SliverPadding(padding: EdgeInsets.only(bottom: 80)),
```

The `CustomScrollView` slivers list should end:
```dart
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // ... all existing children ...
              ]),
            ),
          ),
          // ADD THIS:
          const SliverPadding(padding: EdgeInsets.only(bottom: 80)),
        ],
      ),
```

- [ ] **Step 4: Run tests — expect PASS**
```powershell
fvm flutter test test/today_screen_test.dart --no-pub
```

- [ ] **Step 5: Commit**
```powershell
git add lib/features/today/today_screen.dart test/today_screen_test.dart
git commit -m "fix: add trailing sliver padding to clear bottom nav; add today screen widget tests"
```

---

## Task 4: Macro ring glow effect (U1)

**Files:**
- Modify: `lib/shared/widgets/macro_ring.dart`

The mockup shows filled arcs with a soft radial bloom matching their color. Implement by drawing a blurred wider stroke before the sharp arc.

- [ ] **Step 1: Modify `_drawArc` in `macro_ring.dart`**

Replace the entire `_drawArc` method body:

```dart
void _drawArc({
  required Canvas canvas,
  required Offset center,
  required double radius,
  required double fraction,
  required Color color,
  required double strokeWidth,
}) {
  final trackPaint = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = strokeWidth
    ..strokeCap = StrokeCap.round
    ..color = color.withAlpha(25);

  final fillPaint = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = strokeWidth
    ..strokeCap = StrokeCap.round
    ..color = color;

  final glowPaint = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = strokeWidth * 2.0
    ..strokeCap = StrokeCap.round
    ..color = color.withAlpha(55)
    ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);

  final rect = Rect.fromCircle(center: center, radius: radius);
  const startAngle = -math.pi / 2;
  const fullSweep = 2 * math.pi;

  canvas.drawArc(rect, startAngle, fullSweep, false, trackPaint);
  if (fraction > 0) {
    canvas.drawArc(rect, startAngle, fullSweep * fraction, false, glowPaint);
    canvas.drawArc(rect, startAngle, fullSweep * fraction, false, fillPaint);
  }
}
```

Also update `shouldRepaint` to allow repaint on any fraction change (already correct — no change needed).

- [ ] **Step 2: Hot-reload and visually verify on device/emulator**

The arcs should now show a soft bloom. If glow looks too strong, reduce `color.withAlpha(55)` to `color.withAlpha(40)` or reduce blur radius from `6` to `4`.

- [ ] **Step 3: Commit**
```powershell
git add lib/shared/widgets/macro_ring.dart
git commit -m "feat: add glow bloom to macro ring filled arcs"
```

---

## Task 5: Today screen — comma-formatted kcal numbers, date sub-label, bell icon (U2 + U3)

**Files:**
- Modify: `lib/features/today/today_screen.dart`

- [ ] **Step 1: Update the `SliverAppBar` in `TodayScreen.build()`**

Replace the current `SliverAppBar`:
```dart
SliverAppBar(
  floating: true,
  title: Text('Today', style: AppTextStyles.heading1.copyWith(color: textColor)),
  actions: [
    IconButton(
      icon: const Icon(Icons.person_outline),
      onPressed: () => context.goNamed(RouteNames.profile),
    ),
  ],
),
```

With:
```dart
SliverAppBar(
  floating: true,
  title: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('Today', style: AppTextStyles.heading1.copyWith(color: textColor)),
      Text(
        DateFormat('EEEE · MMM d').format(DateTime.now()),
        style: AppTextStyles.labelSmall.copyWith(
          color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight,
        ),
      ),
    ],
  ),
  actions: [
    IconButton(
      icon: Icon(Icons.notifications_none,
          color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight),
      onPressed: () {},
    ),
    GestureDetector(
      onTap: () => context.goNamed(RouteNames.profile),
      child: Container(
        margin: const EdgeInsets.only(right: 16),
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.blue.withAlpha(30),
          border: Border.all(
            color: AppColors.blue.withAlpha(80),
            width: 1,
          ),
        ),
        child: Icon(Icons.person,
            size: 16,
            color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight),
      ),
    ),
  ],
),
```

`DateFormat` is already imported (`package:intl/intl.dart`). No new imports needed.

- [ ] **Step 2: Format the kcal count-up number with commas**

In `_HeroMacroCard.build()`, find this line:
```dart
Text(
  kcalNow.round().toString(),
  style: AppTextStyles.heroNumber.copyWith(color: textColor),
),
```

Replace with:
```dart
Text(
  NumberFormat('#,###').format(kcalNow.round()),
  style: AppTextStyles.heroNumber.copyWith(color: textColor),
),
```

Add `NumberFormat` import at top of the file (intl is already imported — just use `NumberFormat` directly from `package:intl/intl.dart`).

Also format the "of TARGET" line and the kcal left pill:
```dart
// "of ${plan.kcal}" becomes:
Text(
  'of ${NumberFormat('#,###').format(plan.kcal)}',
  ...
),
// '${kcalLeft.round()} kcal left' becomes:
'${NumberFormat('#,###').format(kcalLeft.round())} kcal left'
```

- [ ] **Step 3: Run tests**
```powershell
fvm flutter test test/today_screen_test.dart --no-pub
```
Expected: all pass.

- [ ] **Step 4: Commit**
```powershell
git add lib/features/today/today_screen.dart
git commit -m "feat: add date sub-label, notification bell, comma-formatted kcal on Today screen"
```

---

## Task 6: Today screen — "Recent scans" header with count badge (U4)

**Files:**
- Modify: `lib/features/today/today_screen.dart`

- [ ] **Step 1: Replace the meals section header in `TodayScreen.build()`**

Find:
```dart
// Meals header
Text(
  "Today's Meals",
  style: AppTextStyles.heading3.copyWith(color: textColor),
),
```

Replace with:
```dart
// Meals header
entriesAsync.when(
  loading: () => Text('Recent scans',
      style: AppTextStyles.heading3.copyWith(color: textColor)),
  error: (_, __) => Text('Recent scans',
      style: AppTextStyles.heading3.copyWith(color: textColor)),
  data: (entries) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text('Recent scans',
          style: AppTextStyles.heading3.copyWith(color: textColor)),
      if (entries.isNotEmpty)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: AppColors.green.withAlpha(30),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            '${entries.length} TODAY',
            style: AppTextStyles.labelSmall.copyWith(color: AppColors.green),
          ),
        ),
    ],
  ),
),
```

- [ ] **Step 2: Run tests**
```powershell
fvm flutter test test/today_screen_test.dart --no-pub
```
Expected: `Recent scans` test passes.

- [ ] **Step 3: Commit**
```powershell
git add lib/features/today/today_screen.dart
git commit -m "feat: replace 'Today Meals' with 'Recent scans' header + count badge"
```

---

## Task 7: History screen — "THIS WEEK" header, W/M toggle, navigation arrows (U6 + U7)

**Files:**
- Modify: `lib/features/history/history_screen.dart`

- [ ] **Step 1: Write the failing history test**

Create `test/history_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/history/history_screen.dart';
import 'package:calorix/features/history/providers/history_providers.dart';
import 'package:calorix/shared/models/daily_log.dart';

Widget _buildHistoryScreen({List<DailyLog> logs = const []}) {
  return ProviderScope(
    overrides: [
      historyProvider.overrideWith((_) => Stream.value(logs)),
    ],
    child: const MaterialApp(home: HistoryScreen()),
  );
}

void main() {
  testWidgets('History screen shows THIS WEEK label', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await tester.pump();
    expect(find.text('THIS WEEK'), findsOneWidget);
  });

  testWidgets('History screen shows W and M toggle buttons', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await tester.pump();
    expect(find.text('W'), findsOneWidget);
    expect(find.text('M'), findsOneWidget);
  });

  testWidgets('History screen shows 7 day pills', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await tester.pump();
    // Check for day number labels — today's week always has 7 days
    final monday = DateTime.now().subtract(Duration(days: DateTime.now().weekday - 1));
    expect(find.text(monday.day.toString()), findsWidgets);
  });

  testWidgets('History screen shows prev/next navigation', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await tester.pump();
    expect(find.byIcon(Icons.chevron_left), findsOneWidget);
    expect(find.byIcon(Icons.chevron_right), findsOneWidget);
  });

  testWidgets('History screen does NOT show error when no logs', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen(logs: []));
    await tester.pump();
    expect(find.textContaining('permission-denied'), findsNothing);
  });
}
```

- [ ] **Step 2: Run test — expect FAIL**
```powershell
fvm flutter test test/history_screen_test.dart --no-pub
```

- [ ] **Step 3: Add "THIS WEEK"/"THIS MONTH" header + W/M toggle + week navigation to `_HistoryScreenState`**

In `_HistoryScreenState`, the calendar `Card` in `build()` currently starts directly with `Column`. Wrap its children with a new header row.

Replace the calendar `Card` block:
```dart
Card(
  child: Column(
    children: [
      const SizedBox(height: 12),
      AnimatedSize(
        // ...
      ),
      // drag bar ...
    ],
  ),
),
```

With:
```dart
Card(
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      // Header row
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 12, 0),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              _isMonthView ? 'THIS MONTH' : 'THIS WEEK',
              style: AppTextStyles.labelMono.copyWith(
                color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight,
              ),
            ),
            Row(
              children: [
                _ViewToggleButton(
                  label: 'W',
                  isActive: !_isMonthView,
                  onTap: () => setState(() => _isMonthView = false),
                  isDark: isDark,
                ),
                const SizedBox(width: 4),
                _ViewToggleButton(
                  label: 'M',
                  isActive: _isMonthView,
                  onTap: () => setState(() => _isMonthView = true),
                  isDark: isDark,
                ),
              ],
            ),
          ],
        ),
      ),
      const SizedBox(height: 8),
      AnimatedSize(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        child: _isMonthView
            ? _MonthGrid(
                selectedDate: _selectedDate,
                onDateSelected: (d) => setState(() => _selectedDate = d),
              )
            : _WeekStrip(
                selectedDate: _selectedDate,
                onDateSelected: (d) => setState(() => _selectedDate = d),
                onPrevWeek: () => setState(
                    () => _selectedDate = _selectedDate.subtract(const Duration(days: 7))),
                onNextWeek: _canGoNextWeek
                    ? () => setState(
                        () => _selectedDate = _selectedDate.add(const Duration(days: 7)))
                    : null,
                logs: historyAsync.valueOrNull ?? [],
              ),
      ),
      // drag bar
      GestureDetector(
        onVerticalDragEnd: (details) {
          if (details.primaryVelocity! < 0) {
            setState(() => _isMonthView = false);
          } else {
            setState(() => _isMonthView = true);
          }
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.borderLight,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
        ),
      ),
    ],
  ),
),
```

Add helper getter to `_HistoryScreenState`:
```dart
bool get _canGoNextWeek {
  final now = DateTime.now();
  final weekStart = _selectedDate.subtract(Duration(days: _selectedDate.weekday - 1));
  final thisWeekStart = now.subtract(Duration(days: now.weekday - 1));
  return weekStart.isBefore(thisWeekStart);
}
```

Add new widget `_ViewToggleButton` at the bottom of the file (before or after `_DayPill`):
```dart
class _ViewToggleButton extends StatelessWidget {
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final bool isDark;

  const _ViewToggleButton({
    required this.label,
    required this.isActive,
    required this.onTap,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 28,
        height: 24,
        decoration: BoxDecoration(
          color: isActive
              ? AppColors.cyan.withAlpha(30)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: isActive ? AppColors.cyan : Colors.transparent,
            width: 1,
          ),
        ),
        child: Center(
          child: Text(
            label,
            style: AppTextStyles.labelSmall.copyWith(
              color: isActive
                  ? AppColors.cyan
                  : (isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight),
              fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Update `_WeekStrip` signature to add navigation + logs**

Change `_WeekStrip`:
```dart
class _WeekStrip extends StatelessWidget {
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateSelected;
  final VoidCallback onPrevWeek;
  final VoidCallback? onNextWeek;
  final List<DailyLog> logs;

  const _WeekStrip({
    required this.selectedDate,
    required this.onDateSelected,
    required this.onPrevWeek,
    this.onNextWeek,
    required this.logs,
  });

  @override
  Widget build(BuildContext context) {
    final monday = selectedDate.subtract(Duration(days: selectedDate.weekday - 1));
    final days = List.generate(7, (i) => monday.add(Duration(days: i)));
    final today = DateTime.now();

    // Build a map of date string -> kcal fraction from logs for ring display
    final logMap = <String, double>{};
    for (final log in logs) {
      final key = '${log.date.year}-${log.date.month.toString().padLeft(2, '0')}-${log.date.day.toString().padLeft(2, '0')}';
      logMap[key] = log.kcal;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left, size: 18),
            onPressed: onPrevWeek,
            color: AppColors.textSecondaryLight,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: days.map((day) {
                final isToday = DateFormat('yyyy-MM-dd').format(day) ==
                    DateFormat('yyyy-MM-dd').format(today);
                final isSelected = DateFormat('yyyy-MM-dd').format(day) ==
                    DateFormat('yyyy-MM-dd').format(selectedDate);
                final key = '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
                final kcal = logMap[key] ?? 0.0;
                const target = 2400.0; // fallback; ideally pass from plan
                final fraction = target > 0 ? (kcal / target).clamp(0.0, 1.0) : 0.0;
                return _DayPill(
                  day: day,
                  isToday: isToday,
                  isSelected: isSelected,
                  onTap: () => onDateSelected(day),
                  completionFraction: fraction,
                );
              }).toList(),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right, size: 18),
            onPressed: onNextWeek,
            color: onNextWeek != null
                ? AppColors.textSecondaryLight
                : AppColors.textSecondaryLight.withAlpha(60),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 5: Update `_DayPill` to accept and render `completionFraction`**

```dart
class _DayPill extends StatelessWidget {
  final DateTime day;
  final bool isToday;
  final bool isSelected;
  final VoidCallback onTap;
  final double completionFraction;

  const _DayPill({
    required this.day,
    required this.isToday,
    required this.isSelected,
    required this.onTap,
    this.completionFraction = 0.0,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Text(
            DateFormat('E').format(day).substring(0, 1),
            style: AppTextStyles.labelSmall.copyWith(
                color: isToday ? AppColors.cyan : AppColors.textSecondaryLight),
          ),
          const SizedBox(height: 4),
          SizedBox(
            width: 36,
            height: 36,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(
                  size: const Size(36, 36),
                  painter: _DayRingPainter(
                    fraction: completionFraction,
                    isToday: isToday,
                  ),
                ),
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isToday ? AppColors.cyan.withAlpha(20) : Colors.transparent,
                  ),
                  child: Center(
                    child: Text(
                      day.day.toString(),
                      style: AppTextStyles.labelLarge.copyWith(
                          color: isToday ? AppColors.cyan : AppColors.textPrimaryLight,
                          fontWeight: isToday ? FontWeight.w700 : FontWeight.w400),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

Add `_DayRingPainter` class:
```dart
class _DayRingPainter extends CustomPainter {
  final double fraction;
  final bool isToday;
  _DayRingPainter({required this.fraction, required this.isToday});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 1;

    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = AppColors.cyan.withAlpha(20);

    canvas.drawCircle(center, radius, trackPaint);

    if (fraction > 0) {
      final fillColor = fraction >= 0.85 ? AppColors.green : AppColors.cyan;
      final fillPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..color = fillColor;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -math.pi / 2,
        2 * math.pi * fraction,
        false,
        fillPaint,
      );
    }
  }

  @override
  bool shouldRepaint(_DayRingPainter old) =>
      old.fraction != fraction || old.isToday != isToday;
}
```

Note: `import 'dart:math' as math;` is already at the top of `history_screen.dart`.

Also need: `import '../../../shared/models/daily_log.dart';` — already present.

- [ ] **Step 6: Remove old `GestureDetector` wrapping the whole `Card` (now redundant)**

In `_HistoryScreenState.build()`, the outer `GestureDetector` that wrapped the card previously handled drag — this is now inside the card. Remove the outer `GestureDetector` around the `Card`, keeping only the card itself (and the inner drag-bar `GestureDetector`).

- [ ] **Step 7: Run tests**
```powershell
fvm flutter test test/history_screen_test.dart --no-pub
```
Expected: all 5 tests pass.

- [ ] **Step 8: Commit**
```powershell
git add lib/features/history/history_screen.dart test/history_screen_test.dart
git commit -m "feat: add THIS WEEK header, W/M toggle, week navigation, day completion rings to History"
```

---

## Task 8: History screen — macro averages row below sparkline (U9)

**Files:**
- Modify: `lib/features/history/history_screen.dart`

- [ ] **Step 1: Add macro averages to `_WeeklyStats.build()`**

`DailyLog` contains `.protein`, `.carbs`, `.fat` fields (check `lib/shared/models/daily_log.dart` to confirm field names).

In `_WeeklyStats.build()`, after `_Sparkline(logs: weekLogs)`, add:

```dart
const SizedBox(height: 12),
_MacroAverageRow(logs: weekLogs, isDark: isDark),
```

Add new widget class `_MacroAverageRow`:
```dart
class _MacroAverageRow extends StatelessWidget {
  final List<DailyLog> logs;
  final bool isDark;
  const _MacroAverageRow({required this.logs, required this.isDark});

  @override
  Widget build(BuildContext context) {
    if (logs.isEmpty) return const SizedBox.shrink();
    final avgProtein = logs.fold(0.0, (s, l) => s + l.protein) / logs.length;
    final avgCarbs = logs.fold(0.0, (s, l) => s + l.carbs) / logs.length;
    final avgFat = logs.fold(0.0, (s, l) => s + l.fat) / logs.length;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceAround,
      children: [
        _MacroChip(label: 'PROTEIN', value: avgProtein, color: AppColors.protein, isDark: isDark),
        _MacroChip(label: 'CARBS', value: avgCarbs, color: AppColors.carbs, isDark: isDark),
        _MacroChip(label: 'FAT', value: avgFat, color: AppColors.fat, isDark: isDark),
      ],
    );
  }
}

class _MacroChip extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  final bool isDark;
  const _MacroChip({required this.label, required this.value, required this.color, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: AppTextStyles.labelSmall.copyWith(
                color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight,
                fontSize: 9,
                letterSpacing: 0.6,
              ),
            ),
            Text(
              '${value.round()}g/d',
              style: AppTextStyles.labelLarge.copyWith(color: color),
            ),
          ],
        ),
      ],
    );
  }
}
```

- [ ] **Step 2: Check `DailyLog` model fields**

Open `lib/shared/models/daily_log.dart` and confirm the field names. If `DailyLog` doesn't have `.protein`, `.carbs`, `.fat` as top-level fields, check `hasData`, and adapt accordingly.

- [ ] **Step 3: Run all tests**
```powershell
fvm flutter test --no-pub
```
Expected: all tests pass.

- [ ] **Step 4: Commit**
```powershell
git add lib/features/history/history_screen.dart
git commit -m "feat: add protein/carbs/fat averages row to History weekly stats"
```

---

## Task 9: App shell widget test (bottom nav)

**Files:**
- Create: `test/app_shell_test.dart`

- [ ] **Step 1: Write the test**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/shell/app_shell.dart';
import 'package:go_router/go_router.dart';
import 'package:calorix/core/router/app_router.dart';

void main() {
  testWidgets('Bottom nav has 5 tab labels', (tester) async {
    final router = GoRouter(
      routes: [
        ShellRoute(
          builder: (context, state, child) => AppShell(
            navigationShell: child as StatefulNavigationShell,
          ),
          routes: [], // minimal — just test nav bar labels
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();

    expect(find.text('Today'), findsWidgets);
    expect(find.text('History'), findsWidgets);
    expect(find.text('Scan'), findsWidgets);
    expect(find.text('Goals'), findsWidgets);
    expect(find.text('AI'), findsWidgets);
  });
}
```

Note: `AppShell` requires `StatefulNavigationShell`. A minimal test via the full router is complex — instead test `_CalorixBottomNav` in isolation. If `_CalorixBottomNav` is private, test via a public-facing smoke test on the app's router.

**Alternative simpler test** (avoids router complexity — just smoke-test the nav labels using the real router):

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/main.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/features/history/providers/history_providers.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/daily_log.dart';

void main() {
  testWidgets('App renders bottom nav with 5 items', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          todayEntriesProvider.overrideWith((_) => Stream.value(<FoodEntry>[])),
          todayMacroSummaryProvider.overrideWith(
            (_) => (kcal: 0.0, protein: 0.0, carbs: 0.0, fat: 0.0),
          ),
          activePlanProvider.overrideWith(
            (_) => Stream.value<MacroTargetPlan?>(MacroTargetPlan.defaultPlan()),
          ),
          historyProvider.overrideWith((_) => Stream.value(<DailyLog>[])),
        ],
        child: const CalorixApp(),
      ),
    );
    await tester.pumpAndSettle(const Duration(seconds: 3));

    expect(find.text('Today'), findsWidgets);
    expect(find.text('Scan'), findsWidgets);
    expect(find.text('Goals'), findsWidgets);
    expect(find.text('AI'), findsWidgets);
  });
}
```

- [ ] **Step 2: Check that `CalorixApp` is exported from `main.dart`**

Open `lib/main.dart` and verify there's a `class CalorixApp extends StatelessWidget`. If the widget is only used inside `main()`, extract it or write the test using the full `MaterialApp.router` approach from `app_router.dart`.

- [ ] **Step 3: Run test**
```powershell
fvm flutter test test/app_shell_test.dart --no-pub
```
Expected: PASS.

- [ ] **Step 4: Commit**
```powershell
git add test/app_shell_test.dart
git commit -m "test: add app shell bottom nav smoke test"
```

---

## Task 10: Run full test suite and `analyze`

- [ ] **Step 1: Run analyze**
```powershell
fvm flutter analyze
```
Expected: 0 errors. Fix any warnings introduced by this work.

- [ ] **Step 2: Run all tests**
```powershell
fvm flutter test --no-pub
```
Expected: all tests pass.

- [ ] **Step 3: Run Gemini diff review**
```powershell
git diff main...HEAD | gemini -m gemini-2.5-pro -p "Review this Calorix Flutter diff for correctness, design spec compliance (.claude/design.md), test coverage, and security. Return BLOCKERS / WARNINGS / NITS sections."
```

Address any BLOCKERs. Document any WARNINGS with a reason if not fixing.

- [ ] **Step 4: Commit any fixes from review**
```powershell
git add -A
git commit -m "fix: address Gemini review findings"
```

---

## Task 11: Deploy Firebase and verify on device

- [ ] **Step 1: Confirm active Firebase project**

Use `mcp__firebase__firebase_get_environment` or:
```powershell
firebase use
```
Expected: `calorix-xurschnell`

- [ ] **Step 2: Deploy rules and indexes (if not done in Tasks 1-2)**
```powershell
firebase deploy --only firestore:rules,firestore:indexes --project calorix-xurschnell
```

- [ ] **Step 3: Build and run on device**
```powershell
fvm flutter run --debug
```

- [ ] **Step 4: Visual verification checklist**

| Screen | Check |
|---|---|
| Today | Macro ring shows 3 colored arcs with glow |
| Today | Number "0" (no comma needed at 0) displays correctly |
| Today | App bar shows date sub-label (e.g. "Monday · May 18") |
| Today | Bell icon and profile circle avatar in top-right |
| Today | Section header reads "Recent scans" (not "Today's Meals") |
| Today | No "BOTTOM OVERFLOWED" debug overlay |
| History | "THIS WEEK" label visible on calendar card |
| History | W and M buttons visible, W active by default |
| History | `<` and `>` arrows visible beside week strip |
| History | No `permission-denied` error text |
| History | Weekly average + macro averages visible when logs exist |

- [ ] **Step 5: Final commit**
```powershell
git add -A
git commit -m "chore: final verification pass — UI parity with mockups achieved"
```
