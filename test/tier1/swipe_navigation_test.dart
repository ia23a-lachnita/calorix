import 'dart:io';

import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../scan/support/fake_camera_service.dart';

class _Store extends Tier1MealStore {
  _Store({this.populated = false}) : super(Directory('.'));
  final bool populated;
  @override
  Future<List<Tier1Meal>> load() async => populated
      ? [
          for (var i = 0; i < 30; i++)
            Tier1Meal(
                id: '$i',
                capturedAt: DateTime.now(),
                name: 'Meal $i',
                served: Tier1Nutrients(kcal: 100))
        ]
      : [];
}

Future<FakeCameraService> _start(WidgetTester tester,
    {bool populated = false}) async {
  tester.view.physicalSize = const Size(360, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final camera = FakeCameraService();
  await tester.pumpWidget(
      Tier1App(store: _Store(populated: populated), camera: camera));
  await tester.pumpAndSettle();
  return camera;
}

// The nav bar no longer carries per-tab selection keys; the PageView
// controller is the single source of truth for which tab is active.
bool _selected(WidgetTester tester, int tab) =>
    (tester
                .widget<PageView>(find.byType(PageView, skipOffstage: false))
                .controller!
                .page! -
            tab)
        .abs() <
    0.01;

void main() {
  testWidgets(
      'header and content follow a held finger and short drag snaps back',
      (tester) async {
    await _start(tester);
    final header = find.text('Ravlo');
    final content = find.text('One photo of your meal');
    final headerX = tester.getTopLeft(header).dx;
    final contentX = tester.getTopLeft(content).dx;
    final finger = await tester.startGesture(const Offset(280, 400));
    await finger.moveBy(const Offset(-80, 0));
    await tester.pump();
    final headerShift = tester.getTopLeft(header.first).dx - headerX;
    final contentShift = tester.getTopLeft(content).dx - contentX;
    expect(contentShift, lessThan(-30));
    expect(headerShift, closeTo(contentShift, .5));
    await tester.pump(const Duration(milliseconds: 300));
    await finger.up();
    await tester.pumpAndSettle();
    expect(_selected(tester, 2), isTrue);
    expect(find.text('Take photo').hitTestable(), findsOneWidget);
  });

  testWidgets('swipes reach both neighbours and stay within first and last tab',
      (tester) async {
    await _start(tester);
    // Scan(2) forward to Goals(3).
    await tester.dragFrom(const Offset(300, 400), const Offset(-270, 0));
    await tester.pumpAndSettle();
    expect(_selected(tester, 3), isTrue);
    expect(find.byTooltip('Target period'), findsOneWidget);
    // Goals(3) forward to AI(4), the last tab.
    await tester.dragFrom(const Offset(300, 400), const Offset(-270, 0));
    await tester.pumpAndSettle();
    expect(_selected(tester, 4), isTrue);
    // Forward again stays bounded at the last tab.
    await tester.dragFrom(const Offset(300, 400), const Offset(-270, 0));
    await tester.pumpAndSettle();
    expect(_selected(tester, 4), isTrue);
    // AI(4) backward to Goals(3).
    await tester.dragFrom(const Offset(60, 400), const Offset(270, 0));
    await tester.pumpAndSettle();
    expect(_selected(tester, 3), isTrue);
    // Goals(3) backward to Scan(2).
    await tester.dragFrom(const Offset(60, 400), const Offset(270, 0));
    await tester.pumpAndSettle();
    expect(_selected(tester, 2), isTrue);
    // Scan(2) backward to History(1).
    await tester.dragFrom(const Offset(60, 400), const Offset(270, 0));
    await tester.pumpAndSettle();
    expect(_selected(tester, 1), isTrue);
    expect(find.byTooltip('Previous period').hitTestable(), findsOneWidget);
    // History(1) backward to Today(0).
    await tester.dragFrom(const Offset(60, 400), const Offset(270, 0));
    await tester.pumpAndSettle();
    expect(_selected(tester, 0), isTrue);
    // Backward again stays bounded at the first tab.
    await tester.dragFrom(const Offset(60, 400), const Offset(270, 0));
    await tester.pumpAndSettle();
    expect(_selected(tester, 0), isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('nav taps animate the track without capturing and can skip a tab',
      (tester) async {
    final camera = await _start(tester);
    final pager = tester.widget<PageView>(find.byType(PageView)).controller!;
    await tester.tap(find.text('Today').last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 80));
    expect(pager.page, allOf(greaterThan(0), lessThan(2)));
    await tester.pumpAndSettle();
    expect(_selected(tester, 0), isTrue);
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    expect(_selected(tester, 1), isTrue);
    expect(camera.captureCount, 0);
  });

  testWidgets('vertical meal scrolling keeps Today selected', (tester) async {
    await _start(tester, populated: true);
    await tester.tap(find.text('Today').last);
    await tester.pumpAndSettle();
    await tester.drag(
        find.byKey(const PageStorageKey('tier1-today')), const Offset(0, -440));
    await tester.pumpAndSettle();
    expect(_selected(tester, 0), isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'text selection in the manual editor cannot swipe underlying tabs',
      (tester) async {
    await _start(tester);
    await tester.tap(find.text('Manual entry').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create custom food'));
    await tester.pumpAndSettle();
    final field = find.widgetWithText(TextFormField, 'Meal name');
    await tester.enterText(field, 'Local meal');
    await tester.drag(field, const Offset(-120, 0));
    await tester.pumpAndSettle();
    expect(find.text('Local meal'), findsOneWidget);
    final pager =
        tester.widget<PageView>(find.byType(PageView, skipOffstage: false));
    // Opening from Scan prepares Today behind the editor.
    expect(pager.controller!.page, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('remove animations jumps navigation straight to its target',
      (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await _start(tester);
    await tester.tap(find.text('Today').last);
    await tester.pump();
    final pager = tester.widget<PageView>(find.byType(PageView));
    expect(pager.controller!.page, 0);
    await tester.tap(find.text('History'));
    await tester.pump();
    expect(pager.controller!.page, 1);
  });
  testWidgets(
      'changing remove animations at runtime snaps the next released swipe',
      (tester) async {
    await _start(tester);
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await tester.pumpAndSettle();
    final finger = await tester.startGesture(const Offset(60, 400));
    await finger.moveBy(const Offset(240, 0));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await finger.up();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 16));
    final pager = tester.widget<PageView>(find.byType(PageView));
    expect(pager.controller!.page, 1);
  });
}
