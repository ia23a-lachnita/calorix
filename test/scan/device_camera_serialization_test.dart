import 'dart:async';

// The platform boundary is deliberately faked; the service and controller are real.
// ignore: depend_on_referenced_packages
import 'package:camera_platform_interface/camera_platform_interface.dart';
import 'package:calorix/shared/services/camera_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

class _GrantedCamera extends DeviceCameraService {
  @override
  Future<bool> hasPermission() async => true;
}

class _Platform extends CameraPlatform {
  final entered = Completer<void>();
  final ready = Completer<void>();
  final released = <int>[];
  int created = 0;
  bool fail = false;
  Completer<void>? photoReady;
  final photoEntered = Completer<void>();

  @override
  Future<List<CameraDescription>> availableCameras() async => [
        const CameraDescription(
            name: 'rear',
            lensDirection: CameraLensDirection.back,
            sensorOrientation: 90)
      ];
  @override
  Future<int> createCameraWithSettings(
          CameraDescription description, MediaSettings settings) async =>
      ++created;
  @override
  Future<void> initializeCamera(int id,
      {ImageFormatGroup imageFormatGroup = ImageFormatGroup.unknown}) async {
    if (!entered.isCompleted) entered.complete();
    await ready.future;
    if (fail) throw CameraException('CameraAccessDenied', 'denied');
  }

  @override
  Stream<CameraInitializedEvent> onCameraInitialized(int id) =>
      Stream.value(CameraInitializedEvent(
          id, 1280, 720, ExposureMode.auto, true, FocusMode.auto, true));
  @override
  Stream<CameraErrorEvent> onCameraError(int id) =>
      Stream<CameraErrorEvent>.multi((_) {});
  @override
  Stream<DeviceOrientationChangedEvent> onDeviceOrientationChanged() =>
      Stream.value(
          const DeviceOrientationChangedEvent(DeviceOrientation.portraitUp));
  @override
  Future<XFile> takePicture(int id) async {
    if (!photoEntered.isCompleted) photoEntered.complete();
    await photoReady?.future;
    if (released.contains(id)) throw StateError('capturing disposed camera');
    return XFile('photo-$id.jpg');
  }

  @override
  Future<void> dispose(int id) async => released.add(id);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late CameraPlatform original;
  late _Platform platform;
  late _GrantedCamera camera;
  setUp(() {
    original = CameraPlatform.instance;
    platform = _Platform();
    CameraPlatform.instance = platform;
    camera = _GrantedCamera();
  });
  tearDown(() async {
    if (!platform.ready.isCompleted) platform.ready.complete();
    if (platform.photoReady case final ready? when !ready.isCompleted) {
      ready.complete();
    }
    await camera.dispose();
    CameraPlatform.instance = original;
  });

  test('grant resume and shutter share one initialized live controller',
      () async {
    final resume = camera.resume();
    await platform.entered.future;
    final photo = camera.captureStill();
    await Future<void>.delayed(Duration.zero);
    platform.ready.complete();
    await resume;
    expect((await photo)!.path, 'photo-1.jpg');
    expect(platform.created, 1);
    expect(camera.previewController!.value.isInitialized, isTrue);
    expect(platform.released, isEmpty);
  });

  test('background during initialization releases the resulting controller',
      () async {
    final resume = camera.resume();
    await platform.entered.future;
    final pause = camera.pause();
    platform.ready.complete();
    await Future.wait([resume, pause]);
    expect(camera.previewController, isNull);
    expect(platform.released, [1]);
  });

  test('denied initialization does not poison the next camera attempt',
      () async {
    platform.fail = true;
    platform.ready.complete();
    await expectLater(camera.resume(), throwsA(isA<CameraException>()));
    platform.fail = false;
    await camera.resume();
    expect(camera.previewController!.value.isInitialized, isTrue);
    expect((await camera.captureStill())!.path, 'photo-2.jpg');
    expect(platform.released, [1]);
  });

  test(
      'dispose during initialization releases hardware and permits route reuse',
      () async {
    final resume = camera.resume();
    await platform.entered.future;
    final dispose = camera.dispose();
    platform.ready.complete();
    await Future.wait([resume, dispose]);
    expect(camera.previewController, isNull);
    expect(platform.released, [1]);
    await camera.resume();
    expect(camera.previewController!.value.isInitialized, isTrue);
    expect(platform.created, 2);
  });

  test('background waits for the shutter before releasing its controller',
      () async {
    platform.ready.complete();
    platform.photoReady = Completer<void>();
    final capture = camera.captureStill();
    await platform.photoEntered.future;
    final pause = camera.pause();
    await Future<void>.delayed(Duration.zero);
    expect(platform.released, isEmpty);
    platform.photoReady!.complete();
    expect((await capture)!.path, 'photo-1.jpg');
    await pause;
    expect(camera.previewController, isNull);
    expect(platform.released, [1]);
  });
}
