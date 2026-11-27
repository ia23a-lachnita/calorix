import 'dart:io';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/packaged_drink.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../scan/support/fake_camera_service.dart';

class _Store extends Tier1MealStore {
  _Store() : super(Directory('.'));
  final records = <Tier1Meal>[];
  @override
  Future<List<Tier1Meal>> load() async => List.of(records);
  @override
  Future<void> save(Tier1Meal meal) async {
    records.removeWhere((m) => m.id == meal.id);
    records.add(meal.withRevision(meal.revision + 1));
  }
}

void main() {
  test(
    'label volume scales nutrients and survives local JSON; total edits invalidate basis',
    () {
      final label = PackagedDrink(
        volumeMl: 330,
        per100Ml: Tier1Nutrients(kcal: 40, carbsG: 10),
      );
      final blank = Tier1Meal(
        id: 'drink',
        capturedAt: DateTime(2026),
        name: 'New meal',
      );
      final saved = blank.withPackagedDrink('Soda', label).withRevision(1);
      expect(saved.served!.kcal, closeTo(132, 1e-9));
      expect(saved.served!.carbsG, closeTo(33, 1e-9));
      expect(saved.served!.proteinG, isNull);
      final restored = Tier1Meal.fromJson(saved.toJson());
      expect(restored.packagedDrink!.volumeMl, 330);
      expect(restored.packagedDrink!.per100Ml.kcal, 40);
      expect(
        restored.edit('Renamed', restored.served!).packagedDrink,
        isNotNull,
      );
      final edited = restored.edit('Soda', Tier1Nutrients(kcal: 120));
      expect(edited.packagedDrink, isNull);
      expect(edited.adjustmentHistory.last['kind'], 'manual_totals');
      expect(saved.packagedDrink, isNotNull);
    },
  );
  test('invalid volume and computed totals are rejected', () {
    expect(
      () => PackagedDrink(volumeMl: 0, per100Ml: Tier1Nutrients(kcal: 1)),
      throwsArgumentError,
    );
    expect(
      () => PackagedDrink(
        volumeMl: double.infinity,
        per100Ml: Tier1Nutrients(kcal: 1),
      ),
      throwsArgumentError,
    );
    expect(
      () => PackagedDrink(
        volumeMl: 1000000,
        per100Ml: Tier1Nutrients(kcal: 1000000),
      ),
      throwsArgumentError,
    );
  });
  test(
    'corrupt drink basis is rejected without changing original and cannot alter a photo meal',
    () {
      final label = PackagedDrink(
        volumeMl: 200,
        per100Ml: Tier1Nutrients(kcal: 10),
      );
      final photo = Tier1Meal(
        id: 'photo',
        capturedAt: DateTime(2026),
        name: 'Photo',
        photoPath: '/local/photo.jpg',
      );
      expect(() => photo.withPackagedDrink('Drink', label), throwsStateError);
      final original = Tier1Meal(
        id: 'd',
        capturedAt: DateTime(2026),
        name: 'New meal',
      ).withPackagedDrink('Drink', label);
      final json = original.toJson();
      json['metadata'] = {
        'packagedDrink': {
          'schemaVersion': 1,
          'volumeMl': -1,
          'per100Ml': {'kcal': 10},
        },
      };
      expect(() => Tier1Meal.fromJson(json), throwsFormatException);
      expect(original.packagedDrink!.volumeMl, 200);
    },
  );
  testWidgets('invalid volume does not save a drink', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final store = _Store();
    await tester.pumpWidget(
      Tier1App(store: store, camera: FakeCameraService()),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manual entry'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Packaged drink'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Meal name'),
      'Drink',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Volume (mL)'),
      '0',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Calories per 100 mL'),
      '40',
    );
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Save meal'),
      200,
      scrollable: find
          .byWidgetPredicate(
            (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
          )
          .last,
    );
    await tester.tap(find.text('Save meal'));
    await tester.pumpAndSettle();
    expect(store.records, isEmpty);
  });

  testWidgets('manual picker transitions into an interactive entry form',
      (tester) async {
    await tester.pumpWidget(
      Tier1App(store: _Store(), camera: FakeCameraService()),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manual entry'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create custom food'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 60));
    final input = find.widgetWithText(TextFormField, 'Meal name');
    expect(input, findsOneWidget);
    final fades =
        find.ancestor(of: input, matching: find.byType(FadeTransition));
    expect(fades, findsWidgets);
    expect(
        tester.widgetList<FadeTransition>(fades).any(
              (fade) => fade.opacity.value > 0 && fade.opacity.value < 1,
            ),
        isTrue);
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Meal name'), 'Soup');
    expect(find.text('Soup'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('drink and custom form titles crossfade with current semantics',
      (tester) async {
    final store = _Store();
    await tester.pumpWidget(
      Tier1App(store: store, camera: FakeCameraService()),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manual entry'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Packaged drink'));
    await tester.pumpAndSettle();

    final title = find.byKey(const Key('manual-entry-kind'));
    expect(tester.getSemantics(title).label, 'Packaged drink');
    await tester.tap(find.text('Enter food'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 60));
    expect(find.descendant(of: title, matching: find.text('Packaged drink')),
        findsOneWidget);
    expect(
        find.descendant(of: title, matching: find.text('Create custom food')),
        findsOneWidget);
    expect(tester.getSemantics(title).label, 'Create custom food');
    expect(find.widgetWithText(TextFormField, 'Meal name'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.descendant(of: title, matching: find.text('Packaged drink')),
        findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'manual drink previews scaled label totals and saves only on request',
    (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final store = _Store();
      await tester.pumpWidget(
        Tier1App(store: store, camera: FakeCameraService()),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Manual entry'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Packaged drink'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Meal name'),
        'Apple drink',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Volume (mL)'),
        '250',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Calories per 100 mL'),
        '40',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Carbs per 100 mL (g, optional)'),
        '10',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Fat per 100 mL (g, optional)'),
        '0',
      );
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(tester.testTextInput.isVisible, isFalse);
      expect(find.textContaining('Serving: 100 kcal'), findsOneWidget);
      expect(store.records, isEmpty);
      await tester.scrollUntilVisible(
        find.text('Save meal'),
        200,
        scrollable: find
            .byWidgetPredicate(
              (widget) =>
                  widget is Scrollable &&
                  widget.axisDirection == AxisDirection.down,
            )
            .last,
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('100 kcal'), findsOneWidget);
      expect(find.textContaining('25 g carbs'), findsOneWidget);
      expect(store.records, isEmpty);
      await tester.tap(find.text('Save meal'));
      await tester.pumpAndSettle();
      final saved = store.records.single;
      expect(saved.served!.kcal, 100);
      expect(saved.served!.carbsG, 25);
      expect(saved.served!.proteinG, isNull);
      expect(saved.served!.fatG, 0);
      expect(saved.packagedDrink!.volumeMl, 250);
      await tester.scrollUntilVisible(
        find.text('Apple drink'),
        200,
        scrollable: find
            .byWidgetPredicate(
              (widget) =>
                  widget is Scrollable &&
                  widget.axisDirection == AxisDirection.down,
            )
            .first,
      );
      await tester.tap(find.text('Apple drink').first);
      await tester.pumpAndSettle();
      expect(find.textContaining('250 mL'), findsOneWidget);
      expect(find.textContaining('40 kcal per 100 mL'), findsOneWidget);
      expect(find.textContaining('10 g carbs'), findsOneWidget);
    },
  );
}
