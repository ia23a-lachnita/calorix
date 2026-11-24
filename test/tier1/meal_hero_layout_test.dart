import 'dart:io';

import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/meal_photo.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
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
        served: Tier1Nutrients(kcal: 200),
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
    final image = tester
        .widget<Image>(find.descendant(of: hero, matching: find.byType(Image)));
    expect(image.fit, BoxFit.contain);
    await tester.tap(find.byTooltip('View full photo'));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsOneWidget);
  });
}
