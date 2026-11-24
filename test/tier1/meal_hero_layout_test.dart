import 'dart:io';

import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/meal_photo.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/targets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../scan/support/fake_camera_service.dart';
import 'support/dashboard_navigation.dart';

class _Store extends Tier1MealStore {
  _Store(this.meal) : super(Directory('.'));
  final Tier1Meal meal;
  @override
  Future<List<Tier1Meal>> load() async => [meal];
}

void main() {
  testWidgets(
      'photo detail uses a full-width hero and preserves the entire image',
      (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final meal = Tier1Meal(
        id: 'hero',
        name: 'Meal',
        capturedAt: DateTime(2026, 11, 22),
        photoPath:
            'docs/design-handoff/placeholder-app/assets/food/chicken_rice_bowl_square.jpg',
        served: Tier1Nutrients(kcal: 200, proteinG: 40, carbsG: 30, fatG: 10),
        consumedFraction: .5,
        revision: 1);
    await tester
        .pumpWidget(Tier1App(store: _Store(meal), camera: FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    await openSavedMeal(tester, 'Meal');
    await tester.pumpAndSettle();
    final hero = find.byType(MealPhotoPreview);
    expect(tester.getRect(hero).left, 0);
    expect(tester.getSize(hero).width, 402);
    for (final label in ['Back', 'Export meal', 'Delete meal']) {
      final control = find.byTooltip(label);
      expect(control, findsOneWidget);
      expect(tester.getRect(hero).contains(tester.getCenter(control)), isTrue,
          reason: '$label should overlay the photo');
    }
    final proteinPercent = (20 / Tier1Targets.defaults.proteinG * 100).round();
    expect(find.text('Calories in serving'), findsOneWidget);
    expect(find.text('40 g served'), findsOneWidget);
    expect(find.text('20 g eaten · $proteinPercent% of protein target'),
        findsOneWidget);
    expect(tester.getTopLeft(find.text('Meal').last).dy,
        lessThan(tester.getTopLeft(find.text('Estimate photo')).dy));
    expect(
        tester
            .getSemantics(find.text('Meal estimate'))
            .getSemanticsData()
            .flagsCollection
            .isHeader,
        isTrue);
    final image = tester
        .widget<Image>(find.descendant(of: hero, matching: find.byType(Image)));
    expect(image.fit, BoxFit.contain);
    await tester.tap(find.byTooltip('View full photo'));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsOneWidget);
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, -600));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Back').hitTestable(), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.byType(MealPhotoPreview), findsNothing);
    expect(find.byTooltip('Back'), findsNothing);
  });
  testWidgets(
      'detail uses changed daily target and stays usable with large text',
      (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final meal = Tier1Meal(
        id: 'target',
        name: 'Target meal',
        capturedAt: DateTime(2026, 11, 22),
        photoPath:
            'docs/design-handoff/placeholder-app/assets/food/chicken_rice_bowl_square.jpg',
        served: Tier1Nutrients(kcal: 200, proteinG: 40),
        consumedFraction: .5,
        revision: 1);
    await tester
        .pumpWidget(Tier1App(store: _Store(meal), camera: FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Today'));
    await tester.pumpAndSettle();
    final change = find.text('Change targets');
    await tester.scrollUntilVisible(change, 200,
        scrollable: find.byType(Scrollable).first);
    await tester.tap(change);
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Protein (g)'), '100');
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Save targets'));
    await tester.tap(find.text('Save targets'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    await openSavedMeal(tester, 'Target meal');
    await tester.pumpAndSettle();
    expect(find.text('20 g eaten · 20% of protein target'), findsOneWidget);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    await tester.pumpAndSettle();
    expect(find.byTooltip('Back').hitTestable(), findsOneWidget);
    expect(find.byTooltip('Delete meal').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
