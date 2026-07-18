import 'package:permission_handler/permission_handler.dart';

/// Opens the operating-system settings surface where a previously denied
/// camera permission can be changed. Permission status is rechecked by the
/// scan screen when the app resumes.
abstract class CameraSettingsService {
  Future<bool> requiresSettings();
  Future<bool> openSettings();
}

class DeviceCameraSettingsService implements CameraSettingsService {
  const DeviceCameraSettingsService();

  @override
  Future<bool> requiresSettings() => Permission.camera.isPermanentlyDenied;

  @override
  Future<bool> openSettings() => openAppSettings();
}
