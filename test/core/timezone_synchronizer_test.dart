import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/time/timezone_init.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

class _FakeNativeTimezoneSource implements NativeTimezoneSource {
  _FakeNativeTimezoneSource(this._identifier);
  String _identifier;

  void setIdentifier(String id) => _identifier = id;

  @override
  Future<String> getLocalTimezoneIdentifier() async => _identifier;
}

class _FailingNativeTimezoneSource implements NativeTimezoneSource {
  final Object error;

  _FailingNativeTimezoneSource(this.error);

  @override
  Future<String> getLocalTimezoneIdentifier() async => throw error;
}

class _CountingNativeTimezoneSource implements NativeTimezoneSource {
  _CountingNativeTimezoneSource(this._identifier);
  String _identifier;
  int callCount = 0;

  @override
  Future<String> getLocalTimezoneIdentifier() async {
    callCount++;
    return _identifier;
  }
}

void main() {
  setUpAll(() {
    tz_data.initializeTimeZones();
  });

  setUp(() {
    tz.setLocalLocation(tz.getLocation('Etc/UTC'));
  });

  group('TimezoneSynchronizer — valid startup', () {
    test('sets tz.local to the identifier returned by the source', () async {
      final source = _FakeNativeTimezoneSource('Europe/Berlin');
      final synchronizer = TimezoneSynchronizer(source);

      final diagnostic = await synchronizer.syncOnce();

      expect(diagnostic.status, TimezoneSyncStatus.updated);
      expect(diagnostic.activeIdentifier, 'Europe/Berlin');
      expect(diagnostic.requestedIdentifier, 'Europe/Berlin');
      expect(diagnostic.error, isNull);
      expect(tz.local.name, 'Europe/Berlin');
    });

    test('diagnostic callback is invoked with the diagnostic', () async {
      final source = _FakeNativeTimezoneSource('Asia/Tokyo');
      TimezoneSyncDiagnostic? captured;
      final synchronizer = TimezoneSynchronizer(
        source,
        onDiagnostic: (d) => captured = d,
      );

      await synchronizer.syncOnce();

      expect(captured, isNotNull);
      expect(captured!.status, TimezoneSyncStatus.updated);
      expect(captured!.activeIdentifier, 'Asia/Tokyo');
    });
  });

  group('TimezoneSynchronizer — unchanged zone', () {
    test('reports unchanged when identifier matches previous sync', () async {
      final source = _FakeNativeTimezoneSource('Europe/Berlin');
      final synchronizer = TimezoneSynchronizer(source);

      await synchronizer.syncOnce();
      final second = await synchronizer.syncOnce();

      expect(second.status, TimezoneSyncStatus.unchanged);
      expect(second.activeIdentifier, 'Europe/Berlin');
      expect(second.requestedIdentifier, isNull);
    });

    test('unchanged does not call setLocalLocation', () async {
      final source = _FakeNativeTimezoneSource('Europe/Berlin');
      final synchronizer = TimezoneSynchronizer(source);

      await synchronizer.syncOnce();
      final locationBefore = tz.local;
      await synchronizer.syncOnce();

      expect(identical(tz.local, locationBefore), isTrue);
    });
  });

  group('TimezoneSynchronizer — valid zone change', () {
    test('changing from one valid zone to another updates tz.local', () async {
      final source = _FakeNativeTimezoneSource('Europe/Berlin');
      final synchronizer = TimezoneSynchronizer(source);

      await synchronizer.syncOnce();
      expect(tz.local.name, 'Europe/Berlin');

      source.setIdentifier('America/New_York');
      final third = await synchronizer.syncOnce();

      expect(third.status, TimezoneSyncStatus.updated);
      expect(third.requestedIdentifier, 'America/New_York');
      expect(tz.local.name, 'America/New_York');
    });
  });

  group('TimezoneSynchronizer — invalid startup (fallback to UTC)', () {
    test('first sync failure sets Etc/UTC and returns fallbackUtc', () async {
      final source = _FailingNativeTimezoneSource(
        FormatException('invalid timezone'),
      );
      final synchronizer = TimezoneSynchronizer(source);

      final diagnostic = await synchronizer.syncOnce();

      expect(diagnostic.status, TimezoneSyncStatus.fallbackUtc);
      expect(diagnostic.activeIdentifier, 'Etc/UTC');
      expect(diagnostic.error, isA<FormatException>());
      expect(tz.local.name, 'Etc/UTC');
    });
  });

  group('TimezoneSynchronizer — invalid after valid (retained previous)', () {
    test('failure after valid sync retains previous location', () async {
      final source = _FakeNativeTimezoneSource('Europe/Berlin');
      final synchronizer = TimezoneSynchronizer(source);

      await synchronizer.syncOnce();
      expect(tz.local.name, 'Europe/Berlin');

      source.setIdentifier('not-a-real-zone');
      final third = await synchronizer.syncOnce();

      expect(third.status, TimezoneSyncStatus.retainedPrevious);
      expect(third.activeIdentifier, 'Europe/Berlin');
      expect(third.error, isA<Object>());
      expect(tz.local.name, 'Europe/Berlin');
    });

    test('retained previous preserves the last valid location', () async {
      final source = _FakeNativeTimezoneSource('America/New_York');
      final synchronizer = TimezoneSynchronizer(source);

      await synchronizer.syncOnce();
      expect(tz.local.name, 'America/New_York');

      source.setIdentifier('bad-zone');
      await synchronizer.syncOnce();
      expect(tz.local.name, 'America/New_York');
    });
  });

  group('TimezoneSynchronizer — startup never crashes', () {
    test('consecutive failures keep fallback UTC', () async {
      final source = _FailingNativeTimezoneSource(ArgumentError('test'));
      final synchronizer = TimezoneSynchronizer(source);

      await synchronizer.syncOnce();
      expect(tz.local.name, 'Etc/UTC');

      final second = await synchronizer.syncOnce();
      expect(second.status, TimezoneSyncStatus.fallbackUtc);
      expect(tz.local.name, 'Etc/UTC');
    });
  });

  group('TimezoneLifecycleHandler — resume calls syncOnce', () {
    testWidgets('resumed lifecycle state triggers syncOnce on the source', (tester) async {
      final source = _CountingNativeTimezoneSource('Europe/Berlin');
      final synchronizer = TimezoneSynchronizer(source);

      await tester.pumpWidget(
        TimezoneLifecycleHandler(
          synchronizer: synchronizer,
          child: const SizedBox(),
        ),
      );

      expect(source.callCount, 0);

      // Drive the lifecycle handler to resumed state.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      // syncOnce was called on resume.
      expect(source.callCount, 1);
      expect(tz.local.name, 'Europe/Berlin');
    });
  });

  group('TimezoneLifecycleHandler — dispose stops future resume calls', () {
    testWidgets('after dispose, resumed does not call syncOnce', (tester) async {
      final source = _CountingNativeTimezoneSource('Asia/Tokyo');
      final synchronizer = TimezoneSynchronizer(source);

      await tester.pumpWidget(
        TimezoneLifecycleHandler(
          synchronizer: synchronizer,
          child: const SizedBox(),
        ),
      );

      // Unmount the widget — removes observer.
      await tester.pumpWidget(const SizedBox());

      // Drive resumed after dispose — should NOT trigger syncOnce.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(source.callCount, 0);
    });
  });

  group('TimezoneLifecycleHandler — builds child', () {
    testWidgets('builds its child', (tester) async {
      final source = _FakeNativeTimezoneSource('Europe/Berlin');
      final synchronizer = TimezoneSynchronizer(source);

      await tester.pumpWidget(
        TimezoneLifecycleHandler(
          synchronizer: synchronizer,
          child: const Text('child'),
        ),
      );

      expect(find.text('child'), findsOneWidget);
    });
  });

  group('TimezoneSyncDiagnostic', () {
    test('holds all fields immutably', () {
      const d = TimezoneSyncDiagnostic(
        status: TimezoneSyncStatus.updated,
        activeIdentifier: 'Europe/Berlin',
        requestedIdentifier: 'Europe/Berlin',
        error: 'test',
      );

      expect(d.status, TimezoneSyncStatus.updated);
      expect(d.activeIdentifier, 'Europe/Berlin');
      expect(d.requestedIdentifier, 'Europe/Berlin');
      expect(d.error, 'test');
    });

    test('optional fields default to null', () {
      const d = TimezoneSyncDiagnostic(
        status: TimezoneSyncStatus.unchanged,
        activeIdentifier: 'Etc/UTC',
      );

      expect(d.requestedIdentifier, isNull);
      expect(d.error, isNull);
    });
  });
}
