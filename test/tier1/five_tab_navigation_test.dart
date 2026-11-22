import 'dart:io';

import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../scan/support/fake_camera_service.dart';

class _Store extends Tier1MealStore {
  _Store() : super(Directory('.'));
  @override
  Future<List<Tier1Meal>> load() async => [];
}

const _tabKeys = [
  'nav-item-today',
  'nav-item-history',
  'nav-item-scan',
  'nav-item-goals',
  'nav-item-ai',
];

double _page(WidgetTester tester) => tester
    .widget<PageView>(find.byType(PageView, skipOffstage: false))
    .controller!
    .page!;

Future<FakeCameraService> _start(WidgetTester tester) async {
  tester.view.physicalSize = const Size(360, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final camera = FakeCameraService();
  await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
  await tester.pumpAndSettle();
  return camera;
}

void main() {
  testWidgets('five nav items appear in order Today, History, Scan, Goals, AI',
      (tester) async {
    await _start(tester);
    for (final key in _tabKeys) {
      expect(find.byKey(ValueKey(key)), findsOneWidget);
    }
    final xs = [
      for (final key in _tabKeys) tester.getTopLeft(find.byKey(ValueKey(key))).dx
    ];
    for (var i = 1; i < xs.length; i++) {
      expect(xs[i], greaterThan(xs[i - 1]));
    }
  });

  testWidgets('Scan is selected by default on launch', (tester) async {
    await _start(tester);
    expect(find.text('Take photo'), findsOneWidget);
    expect(_page(tester), closeTo(2, 0.01));
  });

  testWidgets(
      'tapping Today, History, Goals and AI selects the right tab without capturing',
      (tester) async {
    final camera = await _start(tester);
    await tester.tap(find.byKey(const ValueKey('nav-item-today')));
    await tester.pumpAndSettle();
    expect(_page(tester), closeTo(0, 0.01));
    await tester.tap(find.byKey(const ValueKey('nav-item-history')));
    await tester.pumpAndSettle();
    expect(_page(tester), closeTo(1, 0.01));
    await tester.tap(find.byKey(const ValueKey('nav-item-goals')));
    await tester.pumpAndSettle();
    expect(_page(tester), closeTo(3, 0.01));
    await tester.tap(find.byKey(const ValueKey('nav-item-ai')));
    await tester.pumpAndSettle();
    expect(_page(tester), closeTo(4, 0.01));
    expect(camera.captureCount, 0);
  });

  testWidgets('Scan nav button keeps its gradient FAB regardless of active tab',
      (tester) async {
    await _start(tester);
    expect(find.byKey(const ValueKey('scan-fab-outer')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('nav-item-today')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('scan-fab-outer')), findsOneWidget);
  });
}
