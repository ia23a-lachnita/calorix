import 'dart:async';
import 'dart:io';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../scan/support/fake_camera_service.dart';

class _Store extends Tier1MealStore {
  _Store({this.gate, this.meals = const []}) : super(Directory('.'));
  final Completer<void>? gate;
  final List<Tier1Meal> meals;
  @override
  Future<List<Tier1Meal>> load() async {
    await gate?.future;
    return List.of(meals);
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets('loading ends on Scan after local records load', (tester) async {
    final gate = Completer<void>();
    await tester.pumpWidget(
        Tier1App(store: _Store(gate: gate), camera: FakeCameraService()));
    await tester.pump();
    expect(find.text('GETTING READY'), findsOneWidget);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Take photo'), findsOneWidget);
  });
  testWidgets('profile opens and applies persisted appearance', (tester) async {
    await tester
        .pumpWidget(Tier1App(store: _Store(), camera: FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('Local profile'), findsOneWidget);
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.text('Local profile'))).brightness,
        Brightness.dark);
    expect(
        (await SharedPreferences.getInstance())
            .getString('app_settings.themeMode'),
        'dark');
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Take photo'), findsOneWidget);
  });
  testWidgets('denied camera explains options without requesting again',
      (tester) async {
    final camera = FakeCameraService()..granted = false;
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    final requests = camera.requestPermissionCount;
    expect(requests, 1);
    expect(find.textContaining('Camera access is off'), findsOneWidget);
    await tester.tap(find.text('Why camera?'));
    await tester.pumpAndSettle();
    expect(find.textContaining('enter a meal manually'), findsOneWidget);
    expect(camera.requestPermissionCount, requests);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Manual entry'), findsOneWidget);
  });
  testWidgets('account welcome returns to profile without signing in',
      (tester) async {
    await tester
        .pumpWidget(Tier1App(store: _Store(), camera: FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Profile'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Account options'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Account options'));
    await tester.pumpAndSettle();
    expect(find.text('Continue locally'), findsOneWidget);
    expect(find.textContaining('Sign-in is not available'), findsOneWidget);
    await tester.tap(find.text('Continue locally'));
    await tester.pumpAndSettle();
    expect(find.text('Local profile'), findsOneWidget);
  });
  testWidgets('profile metrics summarize local meals and corrections',
      (tester) async {
    final meals = [
      Tier1Meal(
          id: 'a',
          name: 'Lunch',
          capturedAt: DateTime(2026, 1, 1),
          adjustmentHistory: const [
            {'kind': 'portion'}
          ]),
      Tier1Meal(id: 'b', name: 'Dinner', capturedAt: DateTime(2026, 1, 1)),
    ];
    await tester.pumpWidget(
        Tier1App(store: _Store(meals: meals), camera: FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('LOGGED DAYS'), findsOneWidget);
    expect(find.text('MEALS'), findsOneWidget);
    expect(find.text('CORRECTIONS'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text('1'), findsNWidgets(2));
  });
  testWidgets('profile goals opens the real target editor', (tester) async {
    await tester
        .pumpWidget(Tier1App(store: _Store(), camera: FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Profile'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Goals & macros'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Adjust'));
    await tester.pumpAndSettle();
    expect(
        find.widgetWithText(TextFormField, 'Calories (kcal)'), findsOneWidget);
  });
}
