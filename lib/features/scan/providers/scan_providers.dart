import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/time/clock_provider.dart';
import '../../../shared/services/camera_service.dart';
import '../../../shared/services/camera_settings_service.dart';
import '../../../shared/services/upload_queue_service.dart';
import '../../../shared/services/connectivity_monitor.dart';
import '../../../shared/providers/auth_provider.dart';

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

final uploadQueueServiceProvider =
    FutureProvider<UploadQueueService>((ref) async {
  final service = await UploadQueueService.production(ref.watch(clockProvider));
  ref.onDispose(() => unawaited(service.dispose()));
  return service;
});

final connectivityMonitorProvider = Provider<ConnectivityMonitor>(
  (ref) => RealConnectivityMonitor(),
);

final uploadRetryCoordinatorProvider = FutureProvider<UploadRetryCoordinator>(
  (ref) async {
    final queue = await ref.watch(uploadQueueServiceProvider.future);
    final coordinator = UploadRetryCoordinator(
      monitor: ref.watch(connectivityMonitorProvider),
      drainPending: queue.drainPending,
      isAuthenticated: () => ref.read(currentUidProvider) != null,
    );
    ref.onDispose(() => unawaited(coordinator.dispose()));
    await coordinator.start();
    return coordinator;
  },
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
  Future<String> enqueue({
    required String localPath,
    required String uid,
    required String scanMode,
  });

  void scheduleDrain();
}

class _DeviceScanUploadGateway implements ScanUploadGateway {
  _DeviceScanUploadGateway(this._service);

  final Future<UploadQueueService> _service;

  @override
  Future<String> enqueue({
    required String localPath,
    required String uid,
    required String scanMode,
  }) async =>
      (await _service).enqueueScan(
        localPath: localPath,
        uid: uid,
        scanMode: scanMode,
      );

  @override
  void scheduleDrain() {
    unawaited(_drainSafely());
  }

  Future<void> _drainSafely() async {
    try {
      final service = await _service;
      await service.drainPending();
    } catch (_) {
      // Service initialization or drain failed; errors are consumed.
    }
  }
}

final scanUploadGatewayProvider = Provider<ScanUploadGateway>(
  (ref) => _DeviceScanUploadGateway(
    ref.watch(uploadQueueServiceProvider.future),
  ),
);
