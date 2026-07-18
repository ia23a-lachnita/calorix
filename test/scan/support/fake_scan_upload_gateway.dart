import 'dart:async';

import 'package:calorix/features/scan/providers/scan_providers.dart'
    show ScanUploadGateway;

/// Deterministic [ScanUploadGateway] test double. Mirrors
/// [FakeCameraService]'s hold/complete pattern so upload-path tests can
/// observe capture-state recovery without ever touching real Firebase.
class FakeScanUploadGateway implements ScanUploadGateway {
  bool holdUpload = false;
  bool throwOnUpload = false;
  int callCount = 0;
  String? lastLocalPath;
  String? lastUid;
  String? lastScanMode;

  final List<Completer<String>> _pending = [];

  @override
  Future<String> enqueueAndUpload({
    required String localPath,
    required String uid,
    required String scanMode,
  }) async {
    callCount++;
    lastLocalPath = localPath;
    lastUid = uid;
    lastScanMode = scanMode;
    if (throwOnUpload) {
      throw Exception('fake upload failure');
    }
    if (holdUpload) {
      final completer = Completer<String>();
      _pending.add(completer);
      return completer.future;
    }
    return 'fake-entry-$callCount';
  }

  void completeUpload([String entryId = 'fake-entry-completed']) {
    for (final completer in _pending) {
      if (!completer.isCompleted) completer.complete(entryId);
    }
    _pending.clear();
  }
}
