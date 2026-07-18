import 'package:calorix/shared/services/camera_service.dart'
    show CameraLifecycleService;

/// Deterministic [CameraLifecycleService] test double for asserting
/// screen-level pause/resume/dispose wiring without touching the platform
/// camera plugin.
class FakeCameraLifecycleService implements CameraLifecycleService {
  int pauseCount = 0;
  int resumeCount = 0;
  int disposeCount = 0;

  @override
  Future<void> pause() async => pauseCount++;

  @override
  Future<void> resume() async => resumeCount++;

  @override
  Future<void> dispose() async => disposeCount++;
}
