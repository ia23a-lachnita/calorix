import 'dart:async';

import 'package:calorix/shared/services/connectivity_monitor.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

class _ControllableMonitor implements ConnectivityMonitor {
  _ControllableMonitor(this.state);

  ConnectivityState state;
  final _controller = StreamController<ConnectivityState>.broadcast();

  @override
  Stream<ConnectivityState> get changes => _controller.stream;

  @override
  Future<ConnectivityState> current() async => state;

  void emit(ConnectivityState next) {
    state = next;
    _controller.add(next);
  }

  Future<void> dispose() => _controller.close();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('UploadRetryCoordinator', () {
    late _ControllableMonitor monitor;
    late int drainCount;
    var authenticated = true;

    setUp(() {
      monitor = _ControllableMonitor(ConnectivityState.online);
      drainCount = 0;
      authenticated = true;
    });

    tearDown(() => monitor.dispose());

    UploadRetryCoordinator coordinator() => UploadRetryCoordinator(
          monitor: monitor,
          drainPending: () async => drainCount++,
          isAuthenticated: () => authenticated,
        );

    test('drains on authenticated online startup', () async {
      final subject = coordinator();

      await subject.start();

      expect(drainCount, 1);
      await subject.dispose();
    });

    test('does not drain on unauthenticated or offline startup', () async {
      authenticated = false;
      final unauthenticated = coordinator();
      await unauthenticated.start();
      expect(drainCount, 0);
      await unauthenticated.dispose();

      authenticated = true;
      monitor.state = ConnectivityState.offline;
      final offline = coordinator();
      await offline.start();
      expect(drainCount, 0);
      await offline.dispose();
    });

    test('drains exactly once after an offline to online transition', () async {
      monitor.state = ConnectivityState.offline;
      final subject = coordinator();
      await subject.start();

      monitor.emit(ConnectivityState.online);
      await pumpEventQueue();
      monitor.emit(ConnectivityState.online);
      await pumpEventQueue();

      expect(drainCount, 1);
      await subject.dispose();
    });

    test('defers online transition while backgrounded and drains on resume',
        () async {
      monitor.state = ConnectivityState.offline;
      final subject = coordinator();
      await subject.start();
      await subject.onLifecycleStateChanged(AppLifecycleState.paused);

      monitor.emit(ConnectivityState.online);
      await pumpEventQueue();
      expect(drainCount, 0);

      await subject.onLifecycleStateChanged(AppLifecycleState.resumed);
      expect(drainCount, 1);
      await subject.dispose();
    });

    test('prevents overlapping queue drains', () async {
      final release = Completer<void>();
      var calls = 0;
      final subject = UploadRetryCoordinator(
        monitor: monitor,
        drainPending: () async {
          calls++;
          await release.future;
        },
        isAuthenticated: () => true,
      );

      final startup = subject.start();
      await pumpEventQueue();
      await subject.onLifecycleStateChanged(AppLifecycleState.resumed);
      expect(calls, 1);

      release.complete();
      await startup;
      await subject.dispose();
    });

    test('stops reacting after disposal', () async {
      monitor.state = ConnectivityState.offline;
      final subject = coordinator();
      await subject.start();
      await subject.dispose();

      monitor.emit(ConnectivityState.online);
      await pumpEventQueue();

      expect(drainCount, 0);
    });
  });
}
