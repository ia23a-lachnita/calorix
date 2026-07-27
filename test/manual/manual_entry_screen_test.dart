import 'package:calorix/features/manual/manual_entry_screen.dart';
import 'package:calorix/features/manual/providers/manual_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

class _Saver implements ManualEntrySaver {
  ManualFoodDraft? saved;

  @override
  Future<String> save(ManualFoodDraft draft) async {
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
