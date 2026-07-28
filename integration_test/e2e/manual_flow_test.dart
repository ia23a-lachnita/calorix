import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/shared/models/food_entry.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('permission denial fallback opens manual entry', (tester) async {
    final harness = await E2EHarness.create();
    harness.camera.granted = false;
    await harness.pump(tester);
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(
      find.byKey(const ValueKey('permission-add-manually-card')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Add food'), findsOneWidget);
  });

  testWidgets('review none-of-these path opens manual entry', (tester) async {
    final harness = await E2EHarness.create();
    harness.seed(makeFixtureEntry(
      id: 'manual-review-entry',
      status: FoodEntryStatus.needsReview,
      confidence: 0.62,
      candidates: const [
        ReviewCandidate(
          name: 'Candidate meal',
          confidence: 0.4,
          kcal: 400,
          proteinG: 20,
          carbsG: 40,
          fatG: 12,
        ),
      ],
    ));
    await harness.pump(
      tester,
      initialLocation: '/review/manual-review-entry',
    );

    await tester.tap(find.text('None of these'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Add food'), findsOneWidget);
  });

  testWidgets('recent food can be added without the camera', (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester, initialLocation: '/manual');

    await tester.tap(find.byTooltip('Add Chicken Rice Bowl'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byType(TodayScreen), findsOneWidget);
    expect(
      harness.foodStore.allEntries.single.foodName,
      'Chicken Rice Bowl',
    );
    expect(find.text('Chicken Rice Bowl'), findsWidgets);
  });

  testWidgets('custom food validates and persists entered nutrition',
      (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester, initialLocation: '/manual');

    await tester.tap(find.byKey(const ValueKey('manual-create-custom')));
    await tester.pump();
    await tester.enterText(
      find.byKey(const ValueKey('manual-name')),
      'Homemade soup',
    );
    await tester.enterText(
      find.byKey(const ValueKey('manual-kcal')),
      '330',
    );
    await tester.enterText(
      find.byKey(const ValueKey('manual-protein')),
      '18',
    );
    await tester.enterText(
      find.byKey(const ValueKey('manual-carbs')),
      '40',
    );
    await tester.enterText(
      find.byKey(const ValueKey('manual-fat')),
      '9',
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('manual-serving-size')),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const ValueKey('manual-serving-size')),
      '2 cups',
    );
    await tester.enterText(
      find.byKey(const ValueKey('manual-quantity')),
      '1.5',
    );
    await tester.tap(find.byKey(const ValueKey('manual-meal-type')));
    await tester.pump();
    await tester.tap(find.text('Dinner').last);
    await tester.scrollUntilVisible(
      find.text('Save food'),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await Scrollable.ensureVisible(
      tester.element(find.text('Save food')),
      alignment: 0.5,
    );
    await tester.pump();
    await tester.tap(find.text('Save food'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    final entry = harness.foodStore.allEntries.single;
    expect(entry.foodName, 'Homemade soup');
    expect(entry.baseKcal, 330);
    expect(entry.baseProtein, 18);
    expect(entry.servingMultiplier, 1.5);
    expect(entry.mealType, MealType.dinner);
    expect(
      harness.foodStore.rawEntryData(entry.id)?['servingSize'],
      '2 cups',
    );
  });
}
