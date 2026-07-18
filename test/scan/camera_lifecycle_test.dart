import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/shared/services/camera_service.dart';
import 'package:calorix/debug/debug_deep_links.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';

import 'support/fake_camera_lifecycle_service.dart';
import 'support/fake_camera_service.dart';
import 'support/pump_scan.dart';

void main() {
  testWidgets(
    'initial permission completion rebuilds the screen with the live preview',
    (tester) async {
      final camera = _DelayedPreviewCameraService();
      await pumpScan(tester, camera: camera);

      expect(find.text('Camera initializing…'), findsOneWidget);
      expect(find.byKey(const ValueKey('fake-camera-preview')), findsNothing);

      camera.completeInitialization();
      await tester.pump();
      await tester.pump();

      expect(find.text('Camera initializing…'), findsNothing);
      expect(find.byKey(const ValueKey('fake-camera-preview')), findsOneWidget);
    },
  );

  testWidgets(
    'scan capture readiness is emitted only after the live preview mounts',
    (tester) async {
      final camera = _DelayedPreviewCameraService();
      final messages = <String>[];
      final priorDebugPrint = debugPrint;
      debugPrint = (message, {wrapWidth}) {
        if (message != null) messages.add(message);
      };

      final signal = UiDiffCaptureSignal.ready(
        nonce: 'scan-ready-test',
        screenId: 'scan_idle',
        theme: UiDiffCaptureTheme.dark,
        fixtureHash: 'fixture-hash',
      );
      await pumpScan(
        tester,
        camera: camera,
        extraOverrides: [
          uiDiffPendingCaptureSignalProvider.overrideWith((_) => signal),
        ],
      );

      expect(messages, isNot(contains(signal.line)));

      camera.completeInitialization();
      await tester.pump();

      expect(messages, isNot(contains(signal.line)));

      await tester.pump();
      expect(messages, isNot(contains(signal.line)));

      await tester.pump();
      await tester.pump();

      expect(find.byKey(const ValueKey('fake-camera-preview')), findsOneWidget);
      expect(messages, contains(signal.line));
      debugPrint = priorDebugPrint;
    },
  );

  testWidgets(
    'unmounting the scan screen disposes the injected camera lifecycle',
    (tester) async {
      final lifecycle = FakeCameraLifecycleService();
      await pumpScan(
        tester,
        camera: FakeCameraService(),
        extraOverrides: [
          cameraLifecycleServiceProvider.overrideWithValue(lifecycle),
        ],
      );

      expect(lifecycle.disposeCount, 0);

      await tester.pumpWidget(const SizedBox());
      await tester.pump();

      expect(lifecycle.disposeCount, 1);
    },
  );

  testWidgets('initial denied permission never resumes camera hardware',
      (tester) async {
    final lifecycle = FakeCameraLifecycleService();
    final camera = FakeCameraService()..granted = false;
    await pumpScan(
      tester,
      camera: camera,
      extraOverrides: [
        cameraLifecycleServiceProvider.overrideWithValue(lifecycle),
      ],
    );

    expect(lifecycle.resumeCount, 0);
  });

  testWidgets('initial granted permission resumes camera hardware once',
      (tester) async {
    final lifecycle = FakeCameraLifecycleService();
    await pumpScan(
      tester,
      camera: FakeCameraService(),
      extraOverrides: [
        cameraLifecycleServiceProvider.overrideWithValue(lifecycle),
      ],
    );

    expect(lifecycle.resumeCount, 1);
  });

  testWidgets(
    'resuming rechecks permission and resumes the lifecycle when still '
    'granted',
    (tester) async {
      final lifecycle = FakeCameraLifecycleService();
      final camera = FakeCameraService();
      await pumpScan(
        tester,
        camera: camera,
        extraOverrides: [
          cameraLifecycleServiceProvider.overrideWithValue(lifecycle),
        ],
      );
      final priorPermissionChecks = camera.hasPermissionCallCount;
      final priorResumeCount = lifecycle.resumeCount;

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(lifecycle.resumeCount, priorResumeCount + 1);
      // Recheck must consult the camera service again on resume, not
      // merely resume the platform preview blindly.
      expect(
        camera.hasPermissionCallCount,
        greaterThan(priorPermissionChecks),
      );
      expect(find.byKey(const ValueKey('capture-button')), findsOneWidget);
    },
  );

  testWidgets(
    'resuming after permission was revoked routes to the permission screen',
    (tester) async {
      final lifecycle = FakeCameraLifecycleService();
      final camera = FakeCameraService();
      await pumpScan(
        tester,
        camera: camera,
        extraOverrides: [
          cameraLifecycleServiceProvider.overrideWithValue(lifecycle),
        ],
      );
      expect(find.byKey(const ValueKey('capture-button')), findsOneWidget);

      camera.granted = false;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('capture-button')), findsNothing);
    },
  );

  testWidgets(
    'backgrounding (inactive) pauses the lifecycle',
    (tester) async {
      final lifecycle = FakeCameraLifecycleService();
      await pumpScan(
        tester,
        camera: FakeCameraService(),
        extraOverrides: [
          cameraLifecycleServiceProvider.overrideWithValue(lifecycle),
        ],
      );

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pump();

      expect(lifecycle.pauseCount, 1);
    },
  );
}

class _DelayedPreviewCameraService extends DeviceCameraService {
  final _permission = Completer<void>();
  final _controller = _FakePreviewController();
  bool _ready = false;

  void completeInitialization() {
    _ready = true;
    _permission.complete();
  }

  @override
  CameraController? get previewController => _ready ? _controller : null;

  @override
  Future<bool> hasPermission() async {
    await _permission.future;
    return true;
  }

  @override
  Future<void> resume() async {}

  @override
  Future<void> dispose() async {
    await _controller.dispose();
  }
}

class _FakePreviewController extends CameraController {
  _FakePreviewController()
      : super(
          const CameraDescription(
            name: 'fake',
            lensDirection: CameraLensDirection.back,
            sensorOrientation: 0,
          ),
          ResolutionPreset.low,
          enableAudio: false,
        ) {
    value = CameraValue(
      isInitialized: true,
      previewSize: const Size(100, 200),
      isRecordingVideo: false,
      isTakingPicture: false,
      isStreamingImages: false,
      isRecordingPaused: false,
      flashMode: FlashMode.auto,
      exposureMode: ExposureMode.auto,
      focusMode: FocusMode.auto,
      exposurePointSupported: false,
      focusPointSupported: false,
      deviceOrientation: DeviceOrientation.portraitUp,
      description: description,
    );
  }

  @override
  Widget buildPreview() =>
      const ColoredBox(key: ValueKey('fake-camera-preview'), color: Colors.red);

  @override
  Future<void> dispose() async {
    // The fake never touches the platform camera, so only dispose the notifier.
    super.dispose();
  }
}
