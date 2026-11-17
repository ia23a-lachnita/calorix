import 'dart:async';
import 'dart:io';

import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

import '../scan/support/fake_camera_service.dart';

class _Store extends Tier1MealStore {
  _Store() : super(Directory('.'));
  @override
  Future<List<Tier1Meal>> load() async => [];
}

class _HeldCamera extends FakeCameraService {
  final result = Completer<XFile?>();
  @override
  Future<XFile?> captureStill() async {
    captureCount++;
    return result.future;
  }
}

void main() {
  testWidgets('Scan navigation and reselection never take a photo',
      (tester) async {
    final camera = FakeCameraService()..returnNullFile = true;
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    await tester.tap(find.text('SCAN'));
    await tester.pumpAndSettle();
    expect(camera.captureCount, 0);
    await tester.tap(find.text('Today'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('SCAN'));
    await tester.pumpAndSettle();
    expect(camera.captureCount, 0);
    await tester.tap(find.text('Take photo'));
    await tester.pumpAndSettle();
    expect(camera.captureCount, 1);
    expect(tester.takeException(), isNull);
  });

  for (final size in [const Size(360, 800), const Size(402, 874)]) {
    for (final brightness in Brightness.values) {
      testWidgets('one content ring clears nav and inset at $size $brightness',
          (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        tester.view.padding = const FakeViewPadding(bottom: 24);
        tester.platformDispatcher.platformBrightnessTestValue = brightness;
        addTearDown(tester.view.reset);
        addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
        await tester
            .pumpWidget(Tier1App(store: _Store(), camera: FakeCameraService()));
        await tester.pumpAndSettle();
        final ring = find.byKey(const ValueKey('tier1-capture-ring'));
        expect(ring, findsOneWidget);
        final bounds = tester.getRect(ring);
        expect(bounds.size, const Size(80, 80));
        final nav = tester.getRect(find.text('SCAN'));
        expect(bounds.bottom, lessThan(nav.top));
        final dot = tester.getRect(find.byKey(const ValueKey('tab-dot-1')));
        expect(dot.bottom, lessThanOrEqualTo(size.height - 24));
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('held shutter ignores repeat taps and recovers after failure',
      (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      final camera = _HeldCamera();
      await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
      await tester.pumpAndSettle();
      expect(
          tester
              .getSemantics(find.bySemanticsLabel('Take meal photo'))
              .getSemanticsData()
              .hasAction(SemanticsAction.tap),
          isTrue);
      await tester.tap(find.text('Take photo'));
      await tester.pump();
      expect(
          tester
              .getSemantics(find.bySemanticsLabel('Saving photo'))
              .getSemanticsData()
              .hasAction(SemanticsAction.tap),
          isFalse);
      await tester.tap(find.byKey(const ValueKey('tier1-capture-ring')));
      await tester.pump();
      expect(camera.captureCount, 1);
      camera.result.completeError(StateError('capture failed'));
      await tester.pumpAndSettle();
      expect(find.text('Photo could not be saved. Retake or use manual entry.'),
          findsOneWidget);
      expect(find.text('Take photo'), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });
}
