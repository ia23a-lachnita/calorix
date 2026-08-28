import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'view current goals, maintain to lose fat auto-adjusts kcal to 2000, '
      'protein to 180g, slider/input to 2200 kcal, weight 82.5kg persists '
      'and chart/store updates', (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester, initialLocation: '/goals');

    // ── 1. View current goals ──────────────────────────────────────────
    // The default plan is "Cut Phase" with loseFat goal, 2400 kcal, 170g protein.
    expect(find.text('Goals'), findsWidgets);
    expect(find.text('Lose fat'), findsOneWidget);
    expect(find.textContaining('2,400'), findsWidgets);
    expect(find.text('PROTEIN'), findsOneWidget);

    // ── 2. Switch body goal: Lose fat → Maintain (kcal 2400) ──────────
    await tester.tap(find.byKey(const Key('goals-adjust-save')));
    await tester.pump();
    await tester.tap(find.text('Maintain'));
    await tester.pump();

    // Maintain should set kcal to 2400 (same as default, but confirm it's there).
    expect(find.textContaining('2,400'), findsWidgets);

    // ── 3. Switch body goal: Maintain → Lose fat (kcal auto-adjusts to 2000)
    await tester.tap(find.text('Lose fat'));
    await tester.pump();

    // Lose fat should set kcal to 2000.
    expect(find.textContaining('2,000'), findsWidgets);

    // ── 4. Adjust kcal via the + stepper to 2200 kcal ─────────────────
    // The multiplier stepper has a + button (Icons.add) that increments by 100.
    // From 2000 kcal we need 2 taps to reach 2200 kcal.
    await tester.tap(find.byIcon(Icons.add).hitTestable());
    await tester.pump();
    await tester.tap(find.byIcon(Icons.add).hitTestable());
    await tester.pump();

    // Verify kcal is now 2200.
    expect(find.textContaining('2,200'), findsWidgets);

    // ── 5. Manually adjust protein target to 180g ─────────────────────
    await tester.ensureVisible(find.text('PROTEIN'));
    await tester.tap(find.text('PROTEIN').hitTestable());
    await tester.pumpAndSettle();
    expect(find.text('Set protein target (g)'), findsOneWidget);

    final proteinField =
        find.byKey(const ValueKey('goals-target-input-PROTEIN'));
    expect(proteinField, findsOneWidget);
    await tester.enterText(proteinField, '180');
    await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(
      find.widgetWithText(ElevatedButton, 'Done').hitTestable(),
    );
    await tester.pumpAndSettle();
    expect(find.text('180'), findsWidgets);

    // ── 6. Save the goals ─────────────────────────────────────────────
    final saveGoals = find.byKey(const Key('goals-adjust-save'));
    await dragUntilVisible(
      tester,
      target: saveGoals,
      scrollable: find.byType(CustomScrollView),
      moveStep: const Offset(0, 600),
      description: 'Goals Save control',
    );
    await Scrollable.ensureVisible(
      tester.element(saveGoals),
      alignment: 0.5,
    );
    await tester.pump();
    expect(saveGoals.hitTestable(), findsOneWidget);
    await tester.tap(saveGoals.hitTestable());
    await pumpUntil(
      tester,
      () =>
          harness.macroStore.activePlan?.kcal == 2200 &&
          harness.macroStore.activePlan?.protein == 180,
      description: 'persisted goal targets',
    );

    // After saving, the draft resets from the new plan.
    // Verify the plan was persisted through the in-memory store.
    final savedPlan = harness.macroStore.activePlan;
    expect(savedPlan, isNotNull);
    expect(savedPlan!.kcal, 2200);
    expect(savedPlan.protein, 180);
    expect(savedPlan.goal.name, 'loseFat');

    // ── 7. Log weight: 82.5kg → chart updates ─────────────────────────
    // Scroll down to find the "Log weight" button.
    await tester.ensureVisible(find.text('Log weight'));
    await tester.tap(find.text('Log weight'));
    await tester.pumpAndSettle();

    // The weight bottom sheet is shown.
    expect(find.text('Log weight'), findsWidgets);

    // Enter 82.5 in the weight input.
    final weightField = find.byKey(const ValueKey('goals-weight-input'));
    expect(weightField, findsOneWidget);
    await tester.enterText(weightField, '82.5');
    await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(
      find.widgetWithText(ElevatedButton, 'Save').hitTestable(),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // Verify the weight was persisted.
    final weightStore = harness.weightStore;
    final logs = await weightStore.watchRecent(harness.uid, 30).first;
    expect(logs, isNotEmpty);
    expect(logs.last.weight, 82.5);

    // After logging a single weight, the chart area shows the helper text.
    expect(find.text('Log another weight to see your trend.'), findsOneWidget);
  });
}
