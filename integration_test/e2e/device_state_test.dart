import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integration_test/integration_test.dart';
import 'package:timezone/timezone.dart' as tz;

import 'package:calorix/core/time/clock.dart';

import 'package:calorix/features/history/history_screen.dart';
import 'package:calorix/features/onboarding/loading_screen.dart';
import 'package:calorix/features/processing/processing_screen.dart';
import 'package:calorix/features/scan/permission_screen.dart';
import 'package:calorix/features/scan/scan_screen.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/shared/models/daily_log.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/providers/settings_provider.dart';

import 'support/e2e_harness.dart';

/// Returns the [FocusNode] of the [EditableText] resolved from [finder].
FocusNode _editableFocusNode(WidgetTester tester, Finder finder) {
  final editableFinder =
      find.descendant(of: finder, matching: find.byType(EditableText)).first;
  final editable = tester.widget<EditableText>(editableFinder);
  return editable.focusNode;
}

/// Pumps a fixed number of frames instead of waiting for all animations to
/// settle. This avoids timeouts on intentional perpetual animations (e.g.
/// skeleton shimmer on the processing screen).
Future<void> _settle(
  WidgetTester tester, {
  int frames = 20,
  Duration step = const Duration(milliseconds: 50),
}) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(step);
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // ─── Rapid capture taps ──────────────────────────────────────────────
  testWidgets('rapid capture taps trigger exactly one processing navigation',
      (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester, initialLocation: '/scan');

    final button = find.byKey(const ValueKey('capture-button'));
    expect(button, findsOneWidget);

    harness.camera.holdCapture = true;

    await tester.tap(button);
    await tester.tap(button);
    await tester.tap(button);
    await tester.pump();

    expect(harness.camera.captureCount, 1,
        reason: 'Only one capture should start while held');
    expect(harness.uploadGateway.callCount, 0,
        reason: 'No upload while capture is held');

    harness.camera.completeCapture();
    await _settle(tester);

    expect(find.byType(ProcessingScreen), findsOneWidget);
    expect(find.byType(ScanScreen), findsNothing);
    expect(harness.camera.captureCount, 1);
    expect(harness.uploadGateway.callCount, 1);
    expect(tester.takeException(), isNull);
  });

  // ─── Keyboard open/close on search ───────────────────────────────────
  testWidgets(
      'keyboard open/close on manual search field focuses and dismisses',
      (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester, initialLocation: '/manual');

    final searchField = find.byKey(const ValueKey('manual-search'));
    expect(searchField, findsOneWidget);
    await tester.tap(searchField);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    final focusAfterTap = _editableFocusNode(tester, searchField);
    expect(focusAfterTap.hasFocus, isTrue,
        reason: 'Search field must gain focus after tap');
    expect(tester.takeException(), isNull);

    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(focusAfterTap.hasFocus, isFalse,
        reason: 'Search field must lose focus after done action');
    expect(tester.takeException(), isNull);
  });

  // ─── Keyboard open/close on AI composer ──────────────────────────────
  testWidgets('keyboard open/close on AI chat composer focuses and dismisses',
      (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester, initialLocation: '/ai');

    final composer = find.byType(TextField).hitTestable();
    expect(composer, findsOneWidget);
    await tester.tap(composer);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    final focusAfterTap = _editableFocusNode(tester, composer);
    expect(focusAfterTap.hasFocus, isTrue,
        reason: 'Composer field must gain focus after tap');
    expect(tester.takeException(), isNull);

    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(focusAfterTap.hasFocus, isFalse,
        reason: 'Composer field must lose focus after done action');
    expect(tester.takeException(), isNull);
  });

  // ─── Keyboard open/close on manual entry fields ──────────────────────
  testWidgets(
      'keyboard open/close on manual entry name field focuses and dismisses',
      (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester, initialLocation: '/manual');

    await tester.tap(
      find.byKey(const ValueKey('manual-create-custom')),
    );
    await tester.pump();

    final nameField = find.byKey(const ValueKey('manual-name'));
    expect(nameField, findsOneWidget);
    await tester.tap(nameField);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    final focusAfterTap = _editableFocusNode(tester, nameField);
    expect(focusAfterTap.hasFocus, isTrue,
        reason: 'Name field must gain focus after tap');
    expect(tester.takeException(), isNull);

    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(focusAfterTap.hasFocus, isFalse,
        reason: 'Name field must lose focus after done action');
    expect(tester.takeException(), isNull);
  });

  // ─── Camera denial → manual entry → regrant ──────────────────────────
  testWidgets(
      'camera denial shows permission screen, add manually works, '
      'regrant returns to scan idle', (tester) async {
    final harness = await E2EHarness.create();
    harness.camera.granted = false;
    await harness.pump(tester, initialLocation: '/scan');
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byType(PermissionScreen), findsOneWidget);
    expect(
      find.byKey(const ValueKey('permission-add-manually-card')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey('permission-add-manually-card')),
    );
    await pumpUntilVisible(
      tester,
      find.text('Add food'),
      description: 'manual entry after camera denial',
    );
    expect(find.text('Add food'), findsOneWidget);

    await harness.go(tester, '/scan');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.byType(PermissionScreen), findsOneWidget);

    harness.camera.granted = true;
    final regrantBtn = find.byKey(const ValueKey('permission-regrant-button'));
    expect(regrantBtn, findsOneWidget,
        reason: 'Regrant button must be present when camera is granted');
    await tester.tap(regrantBtn);
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(PermissionScreen), findsNothing,
        reason: 'PermissionScreen must disappear after regrant');
    expect(find.byKey(const ValueKey('capture-button')), findsOneWidget,
        reason: 'ScanScreen capture control must be ready after regrant');
    expect(tester.takeException(), isNull);
  });

  // ─── Empty state renders with named variant ──────────────────────────
  testWidgets('today empty renders empty-variant UI', (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester, initialLocation: '/today');
    await _settle(tester);
    expect(find.byType(TodayScreen), findsOneWidget);
    expect(find.text('Nothing logged yet'), findsOneWidget);
    expect(
      find.text(
        "Point the camera at your first meal — one tap and it's tracked.",
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  // ─── Loading state renders with named variant ────────────────────────
  testWidgets('loading state renders progress-fill variant', (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester, initialLocation: '/loading');
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byType(LoadingScreen), findsOneWidget);
    expect(
      find.byKey(const ValueKey('loading-progress-fill')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  // ─── Error state renders with explicit error UI ──────────────────────
  testWidgets('processing error renders only error-state variant',
      (tester) async {
    final harness = await E2EHarness.create();
    const errorId = 'err-seeded-1';
    // Seed the error entry BEFORE navigating so the processing screen
    // finds it immediately and skips the perpetual skeleton animation.
    harness.foodStore.seed(
      FoodEntry(
        id: errorId,
        uid: harness.uid,
        timestamp: harness.clock.now(),
        date: dateKey(harness.clock.nowTZ()),
        scanMode: 'meal',
        status: FoodEntryStatus.error,
        foodName: 'Failed Scan',
        baseKcal: 0,
        baseProtein: 0,
        baseCarbs: 0,
        baseFat: 0,
      ),
    );
    await harness.pump(tester, initialLocation: '/processing/$errorId');
    await _settle(tester);

    expect(
      find.byKey(const ValueKey('processing-error-state')),
      findsOneWidget,
      reason: 'Error UI must be visible for an error-status entry',
    );
    expect(
      find.byKey(const ValueKey('processing-skeleton')),
      findsNothing,
      reason: 'Skeleton must not appear when entry is in error state',
    );
    expect(
      find.byKey(const ValueKey('processing-complete-card')),
      findsNothing,
      reason: 'Complete card must not appear when entry is in error state',
    );
    expect(find.byKey(const ValueKey('processing-error-icon')), findsOneWidget,
        reason: 'Error icon must be visible in error state');
    expect(tester.takeException(), isNull);
  });

  // ─── Each main tab visited 10× without state corruption ─────────────
  testWidgets('visiting every main tab 10 times preserves seeded state',
      (tester) async {
    final harness = await E2EHarness.create(
      accountCreated: DateTime(2025, 1, 1),
    );
    await harness.pump(tester, initialLocation: '/today');
    await _settle(tester);

    // Seed a food entry visible on Today.
    final seedEntry = makeFixtureEntry(
      id: 'tab-persist-1',
      foodName: 'Persistence Rice Bowl',
      baseKcal: 550,
      baseProtein: 38,
      baseCarbs: 62,
      baseFat: 14,
    );
    harness.seed(seedEntry);
    await _settle(tester);

    // Confirm the seeded entry is visible on Today.
    expect(find.text('Persistence Rice Bowl'), findsOneWidget);

    // ── Set History Month view to June 2026 ──
    await harness.go(tester, '/history');
    await _settle(tester);
    await tester.tap(find.text('M').hitTestable());
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('JULY 2026').hitTestable(), findsOneWidget);
    await tester.tap(find.byKey(const Key('history.previous')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('JUNE 2026').hitTestable(), findsOneWidget);

    // ── Set AI assistant unsent draft ──
    await harness.go(tester, '/ai');
    await _settle(tester);
    final composer = find.byType(TextField).hitTestable();
    await tester.enterText(composer, 'unsent draft');
    await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
    await tester.pump(const Duration(milliseconds: 200));

    for (var i = 0; i < 10; i++) {
      await tester.tap(find.byKey(const ValueKey('nav-item-history')));
      await _settle(tester, frames: 5);
      await tester.tap(find.byKey(const ValueKey('nav-item-scan')));
      await _settle(tester, frames: 5);
      await tester.tap(find.byKey(const ValueKey('nav-item-goals')));
      await _settle(tester, frames: 5);
      await tester.tap(find.byKey(const ValueKey('nav-item-ai')));
      await _settle(tester, frames: 5);
      await tester.tap(find.byKey(const ValueKey('nav-item-today')));
      await _settle(tester, frames: 5);
    }

    // After 10 full traversals, Today still renders with the seeded entry.
    expect(find.byType(TodayScreen), findsOneWidget);
    expect(find.text('Persistence Rice Bowl'), findsOneWidget);
    expect(find.text('550'), findsWidgets,
        reason: 'Kcal value from seeded entry is still visible');

    // History month view preserved as June 2026.
    await tester.tap(find.byKey(const ValueKey('nav-item-history')));
    await _settle(tester);
    expect(find.text('JUNE 2026').hitTestable(), findsOneWidget,
        reason: 'History month heading must survive 10 traversals');

    // AI assistant unsent draft preserved.
    await tester.tap(find.byKey(const ValueKey('nav-item-ai')));
    await _settle(tester);
    final restoredComposer =
        tester.widget<TextField>(find.byType(TextField).hitTestable());
    expect(restoredComposer.controller?.text, 'unsent draft',
        reason: 'AI unsent draft must survive 10 traversals');

    // Goals plan survived.
    await tester.tap(find.byKey(const ValueKey('nav-item-goals')));
    await _settle(tester);
    expect(harness.macroStore.activePlan, isNotNull,
        reason: 'Goals plan survived 10 traversals');
    expect(harness.macroStore.activePlan!.kcal, 2400,
        reason: 'Default plan kcal survived 10 traversals');
    expect(tester.takeException(), isNull);
  });

  // ─── Cold restart: Scan landing + persisted shared stores ────────────
  testWidgets(
      'cold restart reuses shared stores and asserts persisted '
      'dark theme, weight, macro target, and shifted dates', (tester) async {
    final initialTime = tz.TZDateTime.utc(2026, 7, 17, 12, 0);
    final clock = FakeClock(initialTime);
    final historyLogs = <DailyLog>[];

    // Create first harness (session 1).
    final h1 = await E2EHarness.create(
      clock: clock,
      accountCreated: initialTime,
      sharedHistoryLogs: historyLogs,
    );
    await h1.pump(tester, initialLocation: '/scan');
    await _settle(tester);

    // ── Session 1: cold start lands on Scan ──
    expect(find.byKey(const ValueKey('capture-button')), findsOneWidget,
        reason: 'Capture control ready on Scan cold landing');

    // ── Session 1: seed original-date FoodEntry ──
    final originalEntry = makeFixtureEntry(
      id: 'restart-entry-1',
      foodName: 'Original Poke Bowl',
      baseKcal: 620,
      timestamp: initialTime,
      nowTZ: initialTime,
    );
    h1.seed(originalEntry);

    // ── Session 1: seed original-date DailyLog ──
    historyLogs.add(DailyLog(
      id: '2026-07-17',
      kcal: 620,
      protein: 42,
      carbs: 68,
      fat: 18,
      entryCount: 1,
      date: DateTime(2026, 7, 17),
    ));

    // ── Session 1: set dark theme ──
    final ctx = tester.element(find.byType(MaterialApp));
    final container = ProviderScope.containerOf(ctx);
    container.read(settingsProvider.notifier).updateThemeMode(ThemeMode.dark);
    await container.read(settingsProvider.notifier).hydrated;
    expect(container.read(settingsProvider).themeMode, ThemeMode.dark);

    // ── Session 1: log weight 82.5 ──
    await h1.weightStore.set(
      h1.uid,
      WeightLog(date: dateKey(clock.nowTZ()), weight: 82.5),
    );
    final w1 = await h1.weightStore.watchRecent(h1.uid, 30).first;
    expect(w1.last.weight, 82.5);

    // ── Session 1: active plan is default 2400 kcal ──
    expect(h1.macroStore.activePlan!.kcal, 2400);
    expect(h1.macroStore.activePlan!.planName, 'Cut Phase');

    // ── Session 1: advance clock 3 days (to July 20) ──
    clock.advance(const Duration(days: 3));
    expect(clock.nowTZ().day, 20);

    // ── Simulate restart: create session 2 with SAME shared stores ──
    final h2 = await E2EHarness.create(
      clock: clock,
      accountCreated: initialTime,
      sharedFoodStore: h1.foodStore,
      sharedMacroStore: h1.macroStore,
      sharedWeightStore: h1.weightStore,
      sharedSettingsStore: h1.settingsStore,
      sharedHistoryLogs: historyLogs,
    );
    await h2.pump(tester, initialLocation: '/scan');
    await _settle(tester);

    // ── Session 2: cold restart lands on Scan ──
    expect(find.byKey(const ValueKey('capture-button')), findsOneWidget,
        reason: 'Capture control ready on Scan cold landing');

    // ── Session 2: dark theme persists via shared settings store ──
    final ctx2 = tester.element(find.byType(MaterialApp));
    final container2 = ProviderScope.containerOf(ctx2);
    await container2.read(settingsProvider.notifier).hydrated;
    expect(
      container2.read(settingsProvider).themeMode,
      ThemeMode.dark,
      reason: 'Dark theme must persist across restart',
    );

    // ── Session 2: weight 82.5 persists via shared weight store ──
    final w2 = await h2.weightStore.watchRecent(h2.uid, 30).first;
    expect(w2.last.weight, 82.5,
        reason: 'Weight 82.5 must persist across restart');
    expect(w2.last.date, dateKey(initialTime),
        reason: 'Weight log date must match the original seed date');

    // ── Session 2: macro target persists via shared macro store ──
    expect(h2.macroStore.activePlan!.kcal, 2400,
        reason: 'Macro kcal must persist across restart');
    expect(h2.macroStore.activePlan!.planName, 'Cut Phase',
        reason: 'Plan name must persist across restart');

    // ── Session 2: food store has exact original entry ──
    final stored = h2.foodStore.entry('restart-entry-1');
    expect(stored, isNotNull, reason: 'Original entry must persist');
    expect(stored!.id, 'restart-entry-1');
    expect(stored.foodName, 'Original Poke Bowl');
    expect(stored.date, '2026-07-17');

    // ── Session 2: advance another 5 days (total +8 → July 25) ──
    clock.advance(const Duration(days: 5));
    expect(clock.nowTZ().day, 25);

    // ── Session 2: append shifted DailyLog ──
    historyLogs.add(DailyLog(
      id: '2026-07-25',
      kcal: 480,
      protein: 30,
      carbs: 55,
      fat: 12,
      entryCount: 2,
      date: DateTime(2026, 7, 25),
    ));

    // ── Session 2: history weekly view shows shifted day-row ──
    await h2.go(tester, '/history');
    await _settle(tester);
    expect(find.byType(HistoryScreen), findsOneWidget);
    expect(
      find.byKey(const Key('history-day-row-2026-07-25')),
      findsOneWidget,
      reason: 'Shifted DailyLog row visible in weekly view',
    );

    // ── Session 2: navigate back to July 17 week ──
    await tester.tap(find.byKey(const Key('history.previous')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(
      find.byKey(const Key('history-day-row-2026-07-17')),
      findsOneWidget,
      reason: 'Original DailyLog row visible after week navigation',
    );

    // ── Session 2: goals shows plan progression ──
    await h2.go(tester, '/goals');
    await _settle(tester);
    expect(find.text('PLAN · CUT PHASE ·'), findsOneWidget,
        reason: 'Plan name persists across restart');
    expect(find.text('Week 2'), findsOneWidget,
        reason: 'Plan week progressed from July 17 to July 25');

    // ── Session 2: Scan cold landing after restart ──
    await h2.go(tester, '/scan');
    await _settle(tester);
    expect(find.byKey(const ValueKey('capture-button')), findsOneWidget,
        reason: 'Capture control ready on Scan cold landing');

    expect(tester.takeException(), isNull);
  });
}
