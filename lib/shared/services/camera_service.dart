import 'package:camera/camera.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';

/// Camera capture/permission contract for the scan flow. Still-photo only —
/// no video, no live-preview primitive — so widget tests can inject a
/// deterministic fake without touching platform channels.
abstract class CameraService {
  Future<bool> hasPermission();
  Future<CameraPermissionRequestResult> requestPermission();
  Future<XFile?> captureStill();
  Future<XFile?> pickFromLibrary();
}

enum CameraPermissionRequestResult { granted, denied, settingsRequired }

/// Lifecycle operations kept separate from the capture contract so test
/// cameras can stay minimal while device cameras release platform resources.
abstract class CameraLifecycleService {
  Future<void> pause();
  Future<void> resume();
  Future<void> dispose();
}

/// Device-backed [CameraService]. Owns the [CameraController] lifecycle
/// internally; [previewController], [setFlashMode], [pause], and [resume]
/// are a minimal typed seam for [ScanScreen]'s live preview and flash
/// chrome. They live outside the abstract contract so widget tests (and
/// their fakes) never need to reference [CameraController].
class DeviceCameraService implements CameraService, CameraLifecycleService {
  CameraController? _controller;
  final ImagePicker _picker = ImagePicker();
  Future<void> _operations = Future<void>.value();

  // Permission dialogs resume the app while the shutter is still awaiting
  // the grant. Both paths must use the same controller, including its cleanup.
  Future<T> _serialize<T>(Future<T> Function() operation) {
    final result = _operations.then((_) => operation());
    _operations =
        result.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return result;
  }

  Future<void> _releaseController() async {
    final controller = _controller;
    _controller = null;
    await controller?.dispose();
  }

  CameraController? get previewController => _controller;

  Future<bool> _ensureController() async {
    if (_controller != null && _controller!.value.isInitialized) return true;
    await _releaseController();
    final cameras = await availableCameras();
    if (cameras.isEmpty) return false;
    final controller = CameraController(
      cameras.first,
      ResolutionPreset.high,
      enableAudio: false,
    );
    try {
      await controller.initialize();
      _controller = controller;
      return controller.value.isInitialized;
    } catch (_) {
      await controller.dispose();
      rethrow;
    }
  }

  @override
  Future<bool> hasPermission() => Permission.camera.isGranted;

  @override
  Future<CameraPermissionRequestResult> requestPermission() async {
    final status = await Permission.camera.request();
    if (status.isGranted) return CameraPermissionRequestResult.granted;
    final canExplainDenial = await Permission.camera.shouldShowRequestRationale;
    if (status.isPermanentlyDenied || !canExplainDenial) {
      return CameraPermissionRequestResult.settingsRequired;
    }
    return CameraPermissionRequestResult.denied;
  }

  @override
  Future<XFile?> captureStill() => _serialize(() async {
        if (!await _ensureController()) return null;
        final controller = _controller;
        if (controller == null || !controller.value.isInitialized) return null;
        return controller.takePicture();
      });

  @override
  Future<XFile?> pickFromLibrary() =>
      _picker.pickImage(source: ImageSource.gallery, imageQuality: 90);

  Future<void> setFlashMode(FlashMode mode) => _serialize(() async {
        await _controller?.setFlashMode(mode);
      });

  @override
  Future<void> pause() => _serialize(_releaseController);

  @override
  Future<void> resume() => _serialize(() async {
        if (!await hasPermission()) return;
        await _ensureController();
      });

  @override
  // Legacy scan routes share a provider-owned service and may resume it later.
  Future<void> dispose() => _serialize(_releaseController);
}
