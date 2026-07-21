import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';

enum ConnectivityState { online, offline }

abstract class ConnectivityMonitor {
  Future<ConnectivityState> current();
  Stream<ConnectivityState> get changes;
}

class RealConnectivityMonitor implements ConnectivityMonitor {
  RealConnectivityMonitor([Connectivity? connectivity])
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  @override
  Future<ConnectivityState> current() async =>
      _toState(await _connectivity.checkConnectivity());

  @override
  Stream<ConnectivityState> get changes =>
      _connectivity.onConnectivityChanged.map(_toState).distinct();

  static ConnectivityState _toState(List<ConnectivityResult> results) =>
      results.any((result) => result != ConnectivityResult.none)
          ? ConnectivityState.online
          : ConnectivityState.offline;
}

class UploadRetryCoordinator {
  UploadRetryCoordinator({
    required ConnectivityMonitor monitor,
    required Future<void> Function() drainPending,
    required bool Function() isAuthenticated,
  })  : _monitor = monitor,
        _drainPending = drainPending,
        _isAuthenticated = isAuthenticated;

  final ConnectivityMonitor _monitor;
  final Future<void> Function() _drainPending;
  final bool Function() _isAuthenticated;

  StreamSubscription<ConnectivityState>? _subscription;
  ConnectivityState? _lastState;
  bool _foreground = true;
  bool _draining = false;

  Future<void> start() async {
    _subscription ??= _monitor.changes.listen(_onConnectivityChanged);
    final state = await _monitor.current();
    _lastState = state;
    await _tryDrain(state);
  }

  Future<void> onLifecycleStateChanged(AppLifecycleState state) async {
    _foreground = state == AppLifecycleState.resumed;
    if (!_foreground) return;
    final connectivity = await _monitor.current();
    _lastState = connectivity;
    await _tryDrain(connectivity);
  }

  Future<void> dispose() async => _subscription?.cancel();

  void _onConnectivityChanged(ConnectivityState state) {
    final transitionedOnline =
        _lastState == ConnectivityState.offline &&
            state == ConnectivityState.online;
    _lastState = state;
    if (transitionedOnline) unawaited(_tryDrain(state));
  }

  Future<void> _tryDrain(ConnectivityState state) async {
    if (!_foreground ||
        !_isAuthenticated() ||
        state != ConnectivityState.online ||
        _draining) {
      return;
    }
    _draining = true;
    try {
      await _drainPending();
    } finally {
      _draining = false;
    }
  }
}
