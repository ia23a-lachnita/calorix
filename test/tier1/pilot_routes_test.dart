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

class _FailingStore extends Tier1MealStore {
  _FailingStore(this.gate) : super(Directory('.'));
  final Completer<void> gate;
  @override
  Future<List<Tier1Meal>> load() async {
    await gate.future;
    throw const FormatException('synthetic local history failure');
  }
}

class _RefreshFailingStore extends Tier1MealStore {
  _RefreshFailingStore() : super(Directory('.'));
  var fail = false;
  final gate = Completer<void>();
  @override
  Future<List<Tier1Meal>> load() async {
    if (fail) {
      await gate.future;
      throw const FormatException('synthetic refresh failure');
    }
    return [];
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets('loading ends on Scan after local records load', (tester) async {
    tester.view.physicalSize = const Size(720, 1600);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final gate = Completer<void>();
    await tester.pumpWidget(
        Tier1App(store: _Store(gate: gate), camera: FakeCameraService()));
    await tester.pump();
    expect(find.byKey(const ValueKey('pilot-loading-ring')), findsOneWidget);
    expect(find.text('GETTING READY'), findsOneWidget);
    expect(find.text('SNAP · TRACK · STAY ON TARGET'), findsOneWidget);
    expect(find.textContaining('%'), findsNothing);
    expect(find.textContaining('CLOUD'), findsNothing);
    expect(find.textContaining('SYNC'), findsNothing);
    expect(find.textContaining('v1.0'), findsNothing);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Take photo'), findsOneWidget);
  });

  testWidgets('startup readiness fades in without delaying the ready route',
      (tester) async {
    final gate = Completer<void>();
    await tester.pumpWidget(
        Tier1App(store: _Store(gate: gate), camera: FakeCameraService()));
    await tester.pump();
    expect(find.byKey(const ValueKey('pilot-loading-ring')), findsOneWidget);

    gate.complete();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    expect(find.byKey(const ValueKey('pilot-loading-ring')), findsOneWidget);
    expect(find.text('Take photo'), findsOneWidget);

    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('pilot-loading-ring')), findsNothing);
    expect(find.text('Take photo'), findsOneWidget);
  });

  testWidgets('startup failure fades into the local history error state',
      (tester) async {
    final gate = Completer<void>();
    await tester.pumpWidget(
        Tier1App(store: _FailingStore(gate), camera: FakeCameraService()));
    await tester.pump();
    expect(find.byKey(const ValueKey('pilot-loading-ring')), findsOneWidget);

    gate.complete();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    expect(find.byKey(const ValueKey('pilot-loading-ring')), findsOneWidget);
    expect(find.textContaining('Could not open local history'), findsOneWidget);

    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('pilot-loading-ring')), findsNothing);
    expect(find.textContaining('Could not open local history'), findsOneWidget);
  });

  testWidgets('loading artwork settles when reduced motion is enabled',
      (tester) async {
    final gate = Completer<void>();
    await tester.pumpWidget(MediaQuery(
      data: const MediaQueryData(disableAnimations: true),
      child: Tier1App(store: _Store(gate: gate), camera: FakeCameraService()),
    ));
    await tester.pump();
    await tester.pumpAndSettle();
    expect(find.text('GETTING READY'), findsOneWidget);
    expect(tester.binding.hasScheduledFrame, isFalse);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Take photo'), findsOneWidget);
  });

  testWidgets('loading artwork fits a phone with large text', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    final gate = Completer<void>();
    await tester.pumpWidget(
        Tier1App(store: _Store(gate: gate), camera: FakeCameraService()));
    await tester.pump();

    expect(find.byKey(const ValueKey('pilot-loading-ring')), findsOneWidget);
    expect(tester.takeException(), isNull);

    gate.complete();
    await tester.pumpAndSettle();
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

  testWidgets('local history refresh error expands without replacing the shell',
      (tester) async {
    final store = _RefreshFailingStore();
    await tester.pumpWidget(Tier1App(store: store, camera: FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manual entry'));
    await tester.pumpAndSettle();
    store.fail = true;
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    store.gate.complete();
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    final banner = find.byKey(const ValueKey('history-error-motion-0'));
    expect(banner, findsOneWidget);
    final partialHeight = tester.getSize(banner).height;
    expect(partialHeight, greaterThan(0));
    await tester.pumpAndSettle();
    expect(tester.getSize(banner).height, greaterThan(partialHeight));
    expect(find.textContaining('Could not refresh local history'), findsOneWidget);
    expect(find.text('Manual entry'), findsOneWidget);
  });

  testWidgets('camera permission warning expands and collapses smoothly',
      (tester) async {
    final camera = FakeCameraService();
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    expect(find.textContaining('Camera access is off'), findsNothing);

    camera.granted = false;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    final banner = find.byKey(const ValueKey('camera-warning-motion'));
    expect(banner, findsOneWidget);
    final partialHeight = tester.getSize(banner).height;
    expect(partialHeight, greaterThan(0));
    await tester.pumpAndSettle();
    final fullHeight = tester.getSize(banner).height;
    expect(fullHeight, greaterThan(partialHeight));
    expect(find.textContaining('Camera access is off'), findsOneWidget);

    camera.granted = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    final shrinkingHeight = tester.getSize(banner).height;
    expect(shrinkingHeight, greaterThan(0));
    expect(shrinkingHeight, lessThan(fullHeight));
    await tester.pumpAndSettle();
    expect(tester.getSize(banner).height, 0);
    expect(find.textContaining('Camera access is off'), findsNothing);
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
