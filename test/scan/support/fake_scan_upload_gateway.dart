import 'dart:async';

import 'package:calorix/features/scan/providers/scan_providers.dart'
    show ScanUploadGateway;

/// Ordered event types emitted by the fake gateway for assertion.
enum FakeGatewayEvent {
  enqueueStart,
  enqueueComplete,
  scheduleDrainCalled,
  drainStart,
  drainComplete,
  drainError,
}

/// Deterministic [ScanUploadGateway] test double matching the planned
/// split API: `enqueue()` returns a Future<String> (entryId) and
/// `scheduleDrain()` starts a fire-and-forget drain whose errors are
/// consumed internally.
///
/// The fake exposes separate completers for enqueue and drain so tests
/// can hold each independently. It records ordered events, counts,
/// and arguments for precise behavioral assertions.
class FakeScanUploadGateway implements ScanUploadGateway {
  /// When true, [enqueue] returns a future held by [completeEnqueue].
  bool holdEnqueue = false;

  /// When true, [scheduleDrain] starts a future held by [completeDrain].
  bool holdDrain = false;

  /// When non-null, [enqueue] throws this error.
  Object? throwOnEnqueue;

  /// When non-null, the drain future completes with this error.
  Object? drainError;

  int enqueueCallCount = 0;
  int scheduleDrainCallCount = 0;

  String? lastEnqueueLocalPath;
  String? lastEnqueueUid;
  String? lastEnqueueScanMode;

  final List<String> enqueueResults = [];
  final List<FakeGatewayEvent> events = [];

  final List<Completer<String>> _enqueueCompleters = [];
  Completer<void>? _drainCompleter;

  /// Whether a drain future is currently held (not yet completed).
  bool get isDrainPending =>
      _drainCompleter != null && !_drainCompleter!.isCompleted;

  @override
  Future<String> enqueue({
    required String localPath,
    required String uid,
    required String scanMode,
  }) async {
    events.add(FakeGatewayEvent.enqueueStart);
    enqueueCallCount++;
    lastEnqueueLocalPath = localPath;
    lastEnqueueUid = uid;
    lastEnqueueScanMode = scanMode;

    if (throwOnEnqueue != null) {
      throw throwOnEnqueue!;
    }

    if (holdEnqueue) {
      final completer = Completer<String>();
      _enqueueCompleters.add(completer);
      final entryId = await completer.future;
      enqueueResults.add(entryId);
      events.add(FakeGatewayEvent.enqueueComplete);
      return entryId;
    }

    final entryId = 'fake-entry-$enqueueCallCount';
    enqueueResults.add(entryId);
    events.add(FakeGatewayEvent.enqueueComplete);
    return entryId;
  }

  @override
  void scheduleDrain() {
    events.add(FakeGatewayEvent.scheduleDrainCalled);
    scheduleDrainCallCount++;

    events.add(FakeGatewayEvent.drainStart);

    if (holdDrain) {
      _drainCompleter = Completer<void>();
      _drainCompleter!.future.then((_) {
        events.add(FakeGatewayEvent.drainComplete);
      }, onError: (_) {
        events.add(FakeGatewayEvent.drainError);
      });
      return;
    }

    // Drain completes immediately; errors are consumed as production will.
    Future<void>(() {}).then((_) {
      if (drainError != null) {
        throw drainError!;
      } else {
        events.add(FakeGatewayEvent.drainComplete);
      }
    }).catchError((Object _) {
      events.add(FakeGatewayEvent.drainError);
    });
  }

  /// Completes all pending enqueue futures with [entryId].
  void completeEnqueue([String entryId = 'fake-entry-completed']) {
    for (final completer in _enqueueCompleters) {
      if (!completer.isCompleted) completer.complete(entryId);
    }
    _enqueueCompleters.clear();
  }

  /// Completes the pending drain future successfully.
  void completeDrain() {
    if (_drainCompleter != null && !_drainCompleter!.isCompleted) {
      _drainCompleter!.complete();
    }
    _drainCompleter = null;
  }

  /// Completes the pending drain future with [error].
  void failDrain(Object error) {
    if (_drainCompleter != null && !_drainCompleter!.isCompleted) {
      _drainCompleter!.completeError(error);
    }
    _drainCompleter = null;
  }
}
