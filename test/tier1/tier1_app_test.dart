import 'support/dashboard_navigation.dart';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/shared/services/camera_service.dart';
import '../scan/support/fake_camera_service.dart';

class _MemoryStore extends Tier1MealStore {
  _MemoryStore() : super(Directory('.'));
  final List<Tier1Meal> records = [];
  @override
  Future<List<Tier1Meal>> load() async => List.of(records);
  @override
  Future<void> save(Tier1Meal meal) async {
    records.removeWhere((m) => m.id == meal.id);
    records.add(meal.withRevision(meal.revision + 1));
  }
}

class _ThrowingCamera extends FakeCameraService
    implements CameraLifecycleService {
  @override
  Future<void> resume() async => throw StateError('Camera unavailable');
  @override
  Future<void> pause() async {}
  @override
  Future<void> dispose() async {}
}

void main() {
  testWidgets('manual food search fills editable values for 100 grams',
      (tester) async {
    final store = _MemoryStore();
    await tester
        .pumpWidget(Tier1App(store: store, camera: FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manual entry'));
    await tester.pumpAndSettle();
    expect(find.text('Camera-free logging'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Search foods'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, 'Search foods'), 'white rice');
    await tester.pumpAndSettle();
    await tester
        .tap(find.text('Rice, white, long-grain, regular, enriched, cooked'));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<TextFormField>(
                find.widgetWithText(TextFormField, 'Calories (kcal)'))
            .controller!
            .text,
        '130');
    expect(
        tester
            .widget<TextFormField>(
                find.widgetWithText(TextFormField, 'Protein g (optional)'))
            .controller!
            .text,
        '2.69');
    expect(find.textContaining('100 g'), findsWidgets);
  });
  testWidgets(
      'offline manual save and history work without cloud initialization',
      (tester) async {
    final store = _MemoryStore();
    var cloudStarts = 0;
    final CameraService camera = FakeCameraService();
    await tester.pumpWidget(Tier1App(
        store: store,
        camera: camera,
        initializeCloud: () async {
          cloudStarts++;
        }));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manual entry'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Meal name'), 'Weighed test');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Calories (kcal)'), '420');
    await tester.ensureVisible(find.text('Save meal'));
    await tester.tap(find.text('Save meal'));
    await tester.pumpAndSettle();
    // a meal of today lands on the Today tab, counted by the ring
    expect(find.text('KCAL EATEN'), findsOneWidget);
    expect(find.text('420'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Weighed test'), 200,
        scrollable: find
            .byWidgetPredicate((widget) =>
                widget is Scrollable &&
                widget.axisDirection == AxisDirection.down)
            .first);
    expect(find.text('Weighed test'), findsWidgets);
    expect(find.textContaining('420 kcal'), findsWidgets);
    expect(cloudStarts, 0);
    final saved = (await store.load()).single;
    expect(saved.served!.kcal, 420);
    expect(saved.consumedKcal, isNull);
  });
  testWidgets('home counts today and history groups meals under day totals',
      (tester) async {
    final store = _MemoryStore();
    final now = DateTime.now();
    await store.save(Tier1Meal(
        id: 'today-a',
        capturedAt: now,
        name: 'Lunch',
        served: Tier1Nutrients(kcal: 459, proteinG: 44, carbsG: 56, fatG: 5)));
    await store.save(Tier1Meal(
        id: 'today-b',
        capturedAt: now,
        name: 'Breakfast',
        served: Tier1Nutrients(kcal: 380)));
    await store.save(Tier1Meal(
        id: 'old',
        capturedAt: now.subtract(const Duration(days: 3)),
        name: 'Older dinner',
        served: Tier1Nutrients(kcal: 720)));
    await tester
        .pumpWidget(Tier1App(store: store, camera: FakeCameraService()));
    await tester.pumpAndSettle();
    final summary = find.byKey(const ValueKey('scan-today-summary'));
    expect(find.descendant(of: summary, matching: find.text('839')),
        findsOneWidget);
    expect(find.descendant(of: summary, matching: find.text('2 meals')),
        findsOneWidget);
    await tester.tap(summary);
    await tester.pumpAndSettle();
    // the Today tab: the ring's figure against the default target
    expect(find.text('KCAL EATEN'), findsOneWidget);
    expect(find.text('839'), findsOneWidget);
    expect(find.text('1561 kcal left'), findsOneWidget);
    expect(find.text('44 / 170 g'), findsOneWidget);
    // targets are the user's: change the calorie target and the ring follows
    await tester.scrollUntilVisible(find.text('Change targets'), 200,
        scrollable: find
            .byWidgetPredicate((widget) =>
                widget is Scrollable &&
                widget.axisDirection == AxisDirection.down)
            .first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Change targets'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Calories (kcal)'), '2000');
    await tester.tap(find.text('Save targets'));
    await tester.pumpAndSettle();
    expect(find.text('1161 kcal left'), findsOneWidget);
    expect(find.text('of 2000'), findsOneWidget);
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    // The current week's day total and the older meal remain available.
    expect(find.text('Day log'), findsOneWidget);
    expect(find.text('839 kcal'), findsOneWidget);
    expect(find.textContaining('720 kcal'), findsWidgets);
    expect(find.text('44 g'), findsOneWidget);
    expect(find.text('Older dinner'), findsOneWidget);
  });

  testWidgets('camera initialization failure leaves manual entry available',
      (tester) async {
    await tester
        .pumpWidget(Tier1App(store: _MemoryStore(), camera: _ThrowingCamera()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manual entry'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'Meal name'), findsOneWidget);
  });

  testWidgets('repeat confirmation closes cleanly and resets consumption',
      (tester) async {
    final store = _MemoryStore();
    await store.save(Tier1Meal(
            id: 'repeat-source',
            capturedAt: DateTime.utc(2026, 11, 8),
            name: 'Repeat source',
            served: Tier1Nutrients(kcal: 420))
        .confirmConsumption(1));
    await tester
        .pumpWidget(Tier1App(store: store, camera: FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    await openSavedMeal(tester, 'Repeat source');
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Repeat meal'), 200,
        scrollable: find
            .byWidgetPredicate((widget) =>
                widget is Scrollable &&
                widget.axisDirection == AxisDirection.down)
            .first);
    await tester.tap(find.text('Repeat meal'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, '1.5');
    await tester.pump();
    await tester.tap(find.text('Confirm repeat'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    final repeated =
        (await store.load()).where((m) => m.repeatOf == 'repeat-source').single;
    expect(repeated.served!.kcal, 630);
    expect(repeated.consumedKcal, isNull);
    expect(find.text('SCAN'), findsOneWidget);
  });

  testWidgets('cancel repeat preserves the source and stays in the editor',
      (tester) async {
    final store = _MemoryStore();
    await store.save(Tier1Meal(
            id: 'cancel-source',
            capturedAt: DateTime.utc(2026, 11, 8),
            name: 'Cancel source',
            served: Tier1Nutrients(kcal: 420))
        .confirmConsumption(1));
    await tester
        .pumpWidget(Tier1App(store: store, camera: FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    await openSavedMeal(tester, 'Cancel source');
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Repeat meal'), 200,
        scrollable: find
            .byWidgetPredicate((widget) =>
                widget is Scrollable &&
                widget.axisDirection == AxisDirection.down)
            .first);
    await tester.tap(find.text('Repeat meal'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, '1.5');
    await tester.pump();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Meal estimate'), findsOneWidget);
    expect((await store.load()).single.consumedKcal, 420);
  });
}
