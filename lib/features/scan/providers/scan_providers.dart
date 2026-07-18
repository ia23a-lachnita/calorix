import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/time/clock_provider.dart';
import '../../../shared/services/camera_service.dart';
import '../../../shared/services/camera_settings_service.dart';
import '../../../shared/services/upload_queue_service.dart';

enum ScanMode { meal, barcode, label }

enum CaptureState { idle, capturing, denied }

final scanModeProvider = StateProvider<ScanMode>((ref) => ScanMode.meal);
final captureStateProvider =
    StateProvider.autoDispose<CaptureState>((ref) => CaptureState.idle);
final fcmPermissionProvider = StateProvider<bool?>((ref) => null);

final cameraServiceProvider = Provider<CameraService>((ref) {
  final service = DeviceCameraService();
  ref.onDispose(() => unawaited(service.dispose()));
  return service;
});

final cameraSettingsServiceProvider = Provider<CameraSettingsService>(
  (ref) => const DeviceCameraSettingsService(),
);

class _NoopCameraLifecycleService implements CameraLifecycleService {
  const _NoopCameraLifecycleService();

  @override
  Future<void> pause() async {}

  @override
  Future<void> resume() async {}

  @override
  Future<void> dispose() async {}
}

final cameraLifecycleServiceProvider = Provider<CameraLifecycleService>((ref) {
  final service = ref.watch(cameraServiceProvider);
  return service is CameraLifecycleService
      ? service as CameraLifecycleService
      : const _NoopCameraLifecycleService();
});

abstract class ScanUploadGateway {
  Future<String> enqueueAndUpload({
    required String localPath,
    required String uid,
    required String scanMode,
  });
}

class _DeviceScanUploadGateway implements ScanUploadGateway {
  _DeviceScanUploadGateway(this._service);

  final UploadQueueService _service;

  @override
  Future<String> enqueueAndUpload({
    required String localPath,
    required String uid,
    required String scanMode,
  }) =>
      _service.enqueueAndUpload(
        localPath: localPath,
        uid: uid,
        scanMode: scanMode,
      );
}

final scanUploadGatewayProvider = Provider<ScanUploadGateway>(
  (ref) => _DeviceScanUploadGateway(
    UploadQueueService(ref.watch(clockProvider)),
  ),
);
