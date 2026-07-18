import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

bool _timezoneDatabaseInitialized = false;

void initializeTimezoneDatabase() {
  if (_timezoneDatabaseInitialized) return;
  tz_data.initializeTimeZones();
  _timezoneDatabaseInitialized = true;
}

enum TimezoneSyncStatus { updated, unchanged, fallbackUtc, retainedPrevious }

class TimezoneSyncDiagnostic {
  const TimezoneSyncDiagnostic({
    required this.status,
    required this.activeIdentifier,
    this.requestedIdentifier,
    this.error,
  });
  final TimezoneSyncStatus status;
  final String activeIdentifier;
  final String? requestedIdentifier;
  final Object? error;
}

abstract class NativeTimezoneSource {
  Future<String> getLocalTimezoneIdentifier();
}

class FlutterTimezoneSource implements NativeTimezoneSource {
  @override
  Future<String> getLocalTimezoneIdentifier() async {
    final info = await FlutterTimezone.getLocalTimezone();
    return info.identifier;
  }
}

typedef DiagnosticCallback = void Function(TimezoneSyncDiagnostic);

class TimezoneSynchronizer {
  TimezoneSynchronizer(NativeTimezoneSource source,
      {DiagnosticCallback? onDiagnostic})
      : _source = source,
        _onDiagnostic = onDiagnostic;
  final NativeTimezoneSource _source;
  final DiagnosticCallback? _onDiagnostic;
  tz.Location? _lastValidLocation;
  String? _lastIdentifier;

  Future<TimezoneSyncDiagnostic> syncOnce() async {
    try {
      final identifier = await _source.getLocalTimezoneIdentifier();
      if (identifier == _lastIdentifier) {
        final diagnostic = TimezoneSyncDiagnostic(
          status: TimezoneSyncStatus.unchanged,
          activeIdentifier: tz.local.name,
        );
        _onDiagnostic?.call(diagnostic);
        return diagnostic;
      }
      final location = tz.getLocation(identifier);
      tz.setLocalLocation(location);
      _lastIdentifier = identifier;
      _lastValidLocation = location;
      final diagnostic = TimezoneSyncDiagnostic(
        status: TimezoneSyncStatus.updated,
        activeIdentifier: tz.local.name,
        requestedIdentifier: identifier,
      );
      _onDiagnostic?.call(diagnostic);
      return diagnostic;
    } catch (e) {
      if (_lastValidLocation != null) {
        tz.setLocalLocation(_lastValidLocation!);
        final diagnostic = TimezoneSyncDiagnostic(
          status: TimezoneSyncStatus.retainedPrevious,
          activeIdentifier: tz.local.name,
          error: e,
        );
        _onDiagnostic?.call(diagnostic);
        return diagnostic;
      } else {
        tz.setLocalLocation(tz.getLocation('Etc/UTC'));
        final diagnostic = TimezoneSyncDiagnostic(
          status: TimezoneSyncStatus.fallbackUtc,
          activeIdentifier: 'Etc/UTC',
          error: e,
        );
        _onDiagnostic?.call(diagnostic);
        return diagnostic;
      }
    }
  }
}

class TimezoneLifecycleHandler extends StatefulWidget {
  const TimezoneLifecycleHandler({
    super.key,
    required this.synchronizer,
    required this.child,
  });
  final TimezoneSynchronizer synchronizer;
  final Widget child;

  @override
  State<TimezoneLifecycleHandler> createState() =>
      _TimezoneLifecycleHandlerState();
}

class _TimezoneLifecycleHandlerState extends State<TimezoneLifecycleHandler>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(widget.synchronizer.syncOnce());
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
