import 'dart:io';

import 'package:calorix/core/time/clock.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/timezone.dart' as tz;
import '../scan/support/fake_camera_service.dart';

class _Store extends Tier1MealStore {
  _Store() : super(Directory('.'));
  @override
  Future<List<Tier1Meal>> load() async => [
        Tier1Meal(
            id: 'one',
            name: 'Local porridge',
            capturedAt: DateTime(2026, 7, 15, 10),
            served:
                Tier1Nutrients(kcal: 500, proteinG: 30, carbsG: 60, fatG: 14),
            consumedFraction: .5),
        Tier1Meal(
            id: 'local',
            name: 'Saved photo',
            capturedAt: DateTime(2026, 7, 15, 12)),
      ];
}

void main() {
  testWidgets(
      'History opens real week and month views and drills into local meals',
      (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(Tier1App(
        store: _Store(),
        camera: FakeCameraService(),
        clock: FakeClock(tz.TZDateTime(tz.UTC, 2026, 7, 15, 12))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    expect(find.text('THIS WEEK'), findsOneWidget);
    expect(find.text('250 kcal'), findsWidgets);
    await tester.tap(find.text('M').first);
    await tester.pumpAndSettle();
    expect(find.text('JULY 2026'), findsOneWidget);
    final day = find.byKey(const Key('history-day-row-2026-07-15'));
    await tester.ensureVisible(day);
    await tester.tap(day);
    await tester.pumpAndSettle();
    expect(find.text('Local porridge'), findsOneWidget);
    expect(find.text('Saved photo'), findsOneWidget);
    await tester.ensureVisible(find.text('Local porridge'));
    await tester.tap(find.text('Local porridge'));
    await tester.pumpAndSettle();
    expect(find.text('Edit totals'), findsOneWidget);
    await tester.ensureVisible(find.text('Edit totals'));
    await tester.tap(find.text('Edit totals'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'Meal name'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
