import 'dart:async';

import 'package:image_picker/image_picker.dart';
import 'package:calorix/shared/services/camera_service.dart';

/// Deterministic [CameraService] test double.
///
/// Set [holdCapture] before calling [captureStill] to keep the returned
/// future pending until [completeCapture] is invoked — this lets tests
/// observe the `CaptureState.capturing` UI before the capture resolves.
class FakeCameraService implements CameraService {
  bool granted = true;
  bool holdCapture = false;
  bool returnNullFile = false;
  bool throwOnCapture = false;
  bool grantOnRequest = false;
  CameraPermissionRequestResult permissionRequestResult =
      CameraPermissionRequestResult.denied;
  int captureCount = 0;
  int libraryCount = 0;
  int requestPermissionCount = 0;
  int hasPermissionCallCount = 0;

  final List<Completer<XFile?>> _pendingCaptures = [];

  @override
  Future<bool> hasPermission() async {
    hasPermissionCallCount++;
    return granted;
  }

  @override
  Future<CameraPermissionRequestResult> requestPermission() async {
    requestPermissionCount++;
    if (grantOnRequest) {
      granted = true;
      return CameraPermissionRequestResult.granted;
    }
    return permissionRequestResult;
  }

  @override
  Future<XFile?> captureStill() async {
    captureCount++;
    if (throwOnCapture) {
      throw Exception('fake capture failure');
    }
    if (returnNullFile) {
      return null;
    }
    if (holdCapture) {
      final completer = Completer<XFile?>();
      _pendingCaptures.add(completer);
      return completer.future;
    }
    return XFile('fake_capture_$captureCount.jpg');
  }

  void completeCapture() {
    for (final completer in _pendingCaptures) {
      if (!completer.isCompleted) {
        completer.complete(XFile('fake_capture_$captureCount.jpg'));
      }
    }
    _pendingCaptures.clear();
  }

  @override
  Future<XFile?> pickFromLibrary() async {
    libraryCount++;
    return XFile('fake_library_$libraryCount.jpg');
  }
}
