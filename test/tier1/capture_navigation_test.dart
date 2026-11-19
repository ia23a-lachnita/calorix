import 'dart:async';
import 'dart:io';

import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/shared/services/camera_service.dart';
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

class _PermissionCamera extends FakeCameraService
    implements CameraLifecycleService {
  _PermissionCamera() {
    granted = false;
    returnNullFile = true;
  }

  late Completer<CameraPermissionRequestResult> _permission;
  Completer<bool>? permissionCheck;
  bool previewReady = false;

  @override
  Future<bool> hasPermission() =>
      permissionCheck?.future ?? super.hasPermission();

  @override
  Future<CameraPermissionRequestResult> requestPermission() async {
    requestPermissionCount++;
    _permission = Completer<CameraPermissionRequestResult>();
    final result = await _permission.future;
    granted = result == CameraPermissionRequestResult.granted;
    return result;
  }

  void answer(CameraPermissionRequestResult result) =>
      _permission.complete(result);

  @override
  Future<void> resume() async => previewReady = granted;
  @override
  Future<void> pause() async => previewReady = false;
  @override
  Future<void> dispose() async => previewReady = false;
}

void main() {
  testWidgets('startup grant readies the camera for the first shutter tap',
      (tester) async {
    final camera = _PermissionCamera();
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 1);
    expect(camera.previewReady, isFalse);
    expect(camera.captureCount, 0);

    camera.answer(CameraPermissionRequestResult.granted);
    await tester.pumpAndSettle();
    expect(camera.previewReady, isTrue);
    expect(camera.captureCount, 0);
    await tester.tap(find.text('Take photo'));
    await tester.pumpAndSettle();
    expect(camera.captureCount, 1);
    expect(camera.requestPermissionCount, 1);
  });

  testWidgets('startup denial keeps manual entry and one shutter retry works',
      (tester) async {
    final camera = _PermissionCamera();
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 1);
    camera.answer(CameraPermissionRequestResult.denied);
    await tester.pumpAndSettle();

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 1);
    expect(camera.captureCount, 0);
    await tester.tap(find.text('Manual entry'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'Meal name'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Take photo'));
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 2);
    expect(camera.captureCount, 0);
    camera.answer(CameraPermissionRequestResult.granted);
    await tester.pumpAndSettle();
    expect(camera.captureCount, 1);
  });

  testWidgets('a shutter tap joins the startup request through dialog resume',
      (tester) async {
    final camera = _PermissionCamera();
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 1);
    await tester.tap(find.text('Take photo'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('tier1-capture-ring')));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 1);
    expect(camera.captureCount, 0);
    camera.answer(CameraPermissionRequestResult.granted);
    await tester.pumpAndSettle();
    expect(camera.captureCount, 1);
    expect(camera.requestPermissionCount, 1);
  });

  testWidgets('grant does not take a queued photo after leaving Scan',
      (tester) async {
    final camera = _PermissionCamera();
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 1);
    await tester.tap(find.text('Take photo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    camera.answer(CameraPermissionRequestResult.granted);
    await tester.pumpAndSettle();
    expect(camera.previewReady, isTrue);
    expect(camera.captureCount, 0);
  });

  testWidgets('launch while inactive defers prompt to the first resume',
      (tester) async {
    final camera = _PermissionCamera();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    addTearDown(() => tester.binding
        .handleAppLifecycleStateChanged(AppLifecycleState.resumed));
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 0);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 1);
    camera.answer(CameraPermissionRequestResult.granted);
    await tester.pumpAndSettle();
    expect(camera.previewReady, isTrue);
    expect(camera.captureCount, 0);
  });

  testWidgets('losing focus during the permission check defers the prompt',
      (tester) async {
    final pendingCheck = Completer<bool>();
    final camera = _PermissionCamera()..permissionCheck = pendingCheck;
    addTearDown(() => tester.binding
        .handleAppLifecycleStateChanged(AppLifecycleState.resumed));
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 0);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    pendingCheck.complete(false);
    camera.permissionCheck = null;
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 0);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(camera.requestPermissionCount, 1);
    camera.answer(CameraPermissionRequestResult.granted);
    await tester.pumpAndSettle();
    expect(camera.previewReady, isTrue);
    expect(camera.captureCount, 0);
  });

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
