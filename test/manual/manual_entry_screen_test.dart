import 'package:calorix/features/manual/manual_entry_screen.dart';
import 'package:calorix/features/manual/providers/manual_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

class _Saver implements ManualEntrySaver {
  ManualFoodDraft? saved;
  int saveCalls = 0;

  @override
  Future<String> save(ManualFoodDraft draft) async {
    saveCalls += 1;
    saved = draft;
    return 'manual-1';
  }
}

Future<_Saver> _pump(WidgetTester tester) async {
  final saver = _Saver();
  final router = GoRouter(initialLocation: '/manual', routes: [
    GoRoute(path: '/manual', builder: (_, __) => const ManualEntryScreen()),
    GoRoute(
        path: '/today', name: 'today', builder: (_, __) => const Text('Today')),
  ]);
  await tester.pumpWidget(ProviderScope(overrides: [
    manualEntrySaverProvider.overrideWithValue(saver),
  ], child: MaterialApp.router(routerConfig: router)));
  await tester.pumpAndSettle();
  return saver;
}

void main() {
  ManualFoodDraft draft({
    double kcal = 100,
    double protein = 10,
    double carbs = 20,
    double fat = 5,
    double quantity = 1,
  }) =>
      ManualFoodDraft(
        name: 'Test food',
        kcal: kcal,
        proteinG: protein,
        carbsG: carbs,
        fatG: fat,
        servingSize: '1 portion',
        quantity: quantity,
        mealType: MealType.lunch,
      );

  test('manual draft accepts Firestore numeric boundaries', () {
    expect(
      draft(
        kcal: 10000,
        protein: 1000000000,
        carbs: 1000000000,
        fat: 1000000000,
        quantity: 1000000000,
      ).validate(),
      isEmpty,
    );
    expect(
      draft(kcal: 0, protein: 0, carbs: 0, fat: 0, quantity: 1).validate(),
      isEmpty,
    );
  });

  test('manual draft rejects nonfinite and out-of-bound nutrition', () {
    final cases = <(ManualFoodDraft, String)>[
      (draft(kcal: -1), 'kcal'),
      (draft(kcal: double.nan), 'kcal'),
      (draft(kcal: double.infinity), 'kcal'),
      (draft(kcal: double.negativeInfinity), 'kcal'),
      (draft(kcal: 10000.0001), 'kcal'),
      (draft(protein: -1), 'protein'),
      (draft(protein: double.nan), 'protein'),
      (draft(protein: double.infinity), 'protein'),
      (draft(protein: double.negativeInfinity), 'protein'),
      (draft(protein: 1000000000.0001), 'protein'),
      (draft(carbs: -1), 'carbs'),
      (draft(carbs: double.nan), 'carbs'),
      (draft(carbs: double.infinity), 'carbs'),
      (draft(carbs: double.negativeInfinity), 'carbs'),
      (draft(carbs: 1000000000.0001), 'carbs'),
      (draft(fat: -1), 'fat'),
      (draft(fat: double.nan), 'fat'),
      (draft(fat: double.infinity), 'fat'),
      (draft(fat: double.negativeInfinity), 'fat'),
      (draft(fat: 1000000000.0001), 'fat'),
    ];
    for (final (value, field) in cases) {
      expect(value.validate(), contains(field), reason: field);
    }
  });

  test('manual draft rejects nonfinite nonpositive and excessive quantity', () {
    for (final quantity in <double>[
      0,
      -1,
      double.nan,
      double.infinity,
      double.negativeInfinity,
      1000000000.0001,
    ]) {
      expect(
        draft(quantity: quantity).validate(),
        contains('quantity'),
        reason: 'quantity $quantity',
      );
    }
  });

  testWidgets('renders search, filters, food rows, and custom action',
      (tester) async {
    await _pump(tester);
    expect(find.byKey(const ValueKey('manual-search')), findsOneWidget);
    expect(find.text('Recent'), findsOneWidget);
    expect(find.text('Favorites'), findsOneWidget);
    expect(find.byIcon(Icons.add), findsWidgets);
    expect(find.text('Create custom food'), findsOneWidget);
  });

  testWidgets('invalid custom draft shows field errors and does not save',
      (tester) async {
    final saver = await _pump(tester);
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('manual-create-custom')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('manual-kcal')), '-1');
    await tester.scrollUntilVisible(
      find.text('Save food'),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await Scrollable.ensureVisible(
      tester.element(find.text('Save food')),
      alignment: 0.5,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save food'));
    await tester.pump();
    expect(find.text('Name is required'), findsOneWidget);
    expect(find.text('Must be zero or greater'), findsOneWidget);
    expect(saver.saved, isNull);
  });

  testWidgets('valid custom draft saves a complete manual entry',
      (tester) async {
    final saver = await _pump(tester);
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('manual-create-custom')));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('manual-name')), 'Tofu bowl');
    await tester.enterText(find.byKey(const ValueKey('manual-kcal')), '430');
    await tester.enterText(find.byKey(const ValueKey('manual-protein')), '28');
    await tester.enterText(find.byKey(const ValueKey('manual-carbs')), '52');
    await tester.enterText(find.byKey(const ValueKey('manual-fat')), '14');
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
    await tester.pumpAndSettle();
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
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save food'));
    await tester.pumpAndSettle();
    expect(saver.saved?.name, 'Tofu bowl');
    expect(saver.saved?.servingSize, '2 cups');
    expect(saver.saved?.quantity, 1.5);
    expect(saver.saved?.mealType, MealType.dinner);
    expect(saver.saveCalls, 1);
    expect(find.text('Today'), findsOneWidget);
  });

  testWidgets('quick add saves the default quantity exactly once',
      (tester) async {
    final saver = await _pump(tester);

    await tester.tap(find.byTooltip('Add Protein Yogurt'));
    await tester.pumpAndSettle();

    expect(saver.saveCalls, 1);
    expect(saver.saved?.name, 'Protein Yogurt');
    expect(saver.saved?.kcal, 180);
    expect(saver.saved?.quantity, 1);
    expect(find.text('Today'), findsOneWidget);
  });

  testWidgets('unsaved search prompts before destructive exit', (tester) async {
    await _pump(tester);
    await tester.enterText(
        find.byKey(const ValueKey('manual-search')), 'unfinished');
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();

    expect(find.text('Discard this entry?'), findsOneWidget);
    await tester.tap(find.text('Keep editing'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('manual-search')), findsOneWidget);
  });
}
