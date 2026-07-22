import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/time/clock.dart';
import 'package:calorix/core/time/timezone_utils.dart';
import 'package:calorix/features/history/history_time_travel.dart';
import 'package:calorix/shared/models/daily_log.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

late tz.Location _tz;

DailyLog _log(String dateKey, {double kcal = 1200, int entries = 3}) =>
    DailyLog(
      id: dateKey,
      kcal: kcal,
      protein: 80,
      carbs: 140,
      fat: 35,
      entryCount: entries,
      date: DateTime.parse(dateKey),
    );

void main() {
  setUpAll(() {
    tz_data.initializeTimeZones();
    _tz = tz.getLocation('Europe/Zurich');
  });

  // ── HistoryRange ────────────────────────────────────────────────────────────

  group('HistoryRange canonical value equality', () {
    test('equal start/end keys produce identical ranges', () {
      final a = HistoryRange(
        start: tz.TZDateTime(_tz, 2026, 7, 13),
        endExclusive: tz.TZDateTime(_tz, 2026, 7, 20),
      );
      final b = HistoryRange(
        start: tz.TZDateTime(_tz, 2026, 7, 13),
        endExclusive: tz.TZDateTime(_tz, 2026, 7, 20),
      );
      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });

    test('different start dates produce unequal ranges', () {
      final a = HistoryRange(
        start: tz.TZDateTime(_tz, 2026, 7, 13),
        endExclusive: tz.TZDateTime(_tz, 2026, 7, 20),
      );
      final b = HistoryRange(
        start: tz.TZDateTime(_tz, 2026, 7, 6),
        endExclusive: tz.TZDateTime(_tz, 2026, 7, 13),
      );
      expect(a, isNot(equals(b)));
    });

    test('same wall-clock dates across DST boundary are equal', () {
      final a = HistoryRange(
        start: tz.TZDateTime(_tz, 2026, 3, 30),
        endExclusive: tz.TZDateTime(_tz, 2026, 4, 6),
      );
      final b = HistoryRange(
        start: tz.TZDateTime(_tz, 2026, 3, 30),
        endExclusive: tz.TZDateTime(_tz, 2026, 4, 6),
      );
      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
    });
  });

  group('HistoryRange DST-safe period bounds', () {
    test('startOfWeek crosses DST spring-forward correctly', () {
      // 2026-03-30 is a Monday; DST spring-forward in Europe/Zurich is 2026-03-29
      final range = HistoryRange(
        start: tz.TZDateTime(_tz, 2026, 3, 30),
        endExclusive: tz.TZDateTime(_tz, 2026, 4, 6),
      );
      expect(dateKeyFor(range.start), '2026-03-30');
      expect(dateKeyFor(range.endExclusive), '2026-04-06');
      // Both bounds share the same location
      expect(range.start.location.name, 'Europe/Zurich');
      expect(range.endExclusive.location.name, 'Europe/Zurich');
    });

    test('startOfWeek crosses DST fall-back correctly', () {
      // 2026-10-26 is a Monday; DST fall-back in Europe/Zurich is 2026-10-25
      final range = HistoryRange(
        start: tz.TZDateTime(_tz, 2026, 10, 26),
        endExclusive: tz.TZDateTime(_tz, 2026, 11, 2),
      );
      expect(dateKeyFor(range.start), '2026-10-26');
      expect(dateKeyFor(range.endExclusive), '2026-11-02');
    });
  });

  // ── buildHistoryWeekRows ────────────────────────────────────────────────────

  group('buildHistoryWeekRows with FakeClock', () {
    test(
        'advancing now by 3 calendar days adds exactly 3 empty elapsed rows '
        'while retaining real earlier rows', () {
      final fake = FakeClock(tz.TZDateTime(_tz, 2026, 7, 15, 10));
      final logs = [_log('2026-07-13'), _log('2026-07-14')];
      final weekStart = startOfWeek(fake.nowTZ());
      final before = buildHistoryWeekRows(
        weekStart: weekStart,
        logs: logs,
        now: fake.nowTZ(),
        accountCreated: tz.TZDateTime(_tz, 2026, 7, 1),
      );
      fake.advance(const Duration(days: 3));
      final after = buildHistoryWeekRows(
        weekStart: weekStart,
        logs: logs,
        now: fake.nowTZ(),
        accountCreated: tz.TZDateTime(_tz, 2026, 7, 1),
      );

      expect(after, hasLength(before.length + 3));
      expect(after.where((row) => row.hasData).map((row) => row.dateKey),
          ['2026-07-13', '2026-07-14']);
      expect(
        after.skip(before.length).map((row) => row.dateKey),
        ['2026-07-16', '2026-07-17', '2026-07-18'],
      );
      expect(after.skip(before.length).every((row) => !row.hasData), isTrue);
    });

    test('future dates are omitted from day rows', () {
      final now = tz.TZDateTime(_tz, 2026, 7, 15, 10);
      final weekStart = startOfWeek(tz.TZDateTime(_tz, 2026, 7, 15));
      final rows = buildHistoryWeekRows(
        weekStart: weekStart,
        logs: [_log('2026-07-13'), _log('2026-07-14')],
        now: now,
        accountCreated: tz.TZDateTime(_tz, 2026, 7, 1),
      );

      // Only Mon 13, Tue 14, Wed 15 should appear — Thu-Sun are future
      final keys = rows.map((r) => r.dateKey).toList();
      expect(keys, contains('2026-07-13'));
      expect(keys, contains('2026-07-14'));
      expect(keys, contains('2026-07-15'));
      expect(keys, isNot(contains('2026-07-16')));
      expect(keys, isNot(contains('2026-07-17')));
      expect(keys, isNot(contains('2026-07-18')));
      expect(keys, isNot(contains('2026-07-19')));
    });

    test('stable date keys across provider rebuilds', () {
      final now = tz.TZDateTime(_tz, 2026, 7, 15, 10);
      final weekStart = startOfWeek(tz.TZDateTime(_tz, 2026, 7, 15));
      final rows1 = buildHistoryWeekRows(
        weekStart: weekStart,
        logs: [_log('2026-07-14')],
        now: now,
        accountCreated: tz.TZDateTime(_tz, 2026, 7, 1),
      );
      final rows2 = buildHistoryWeekRows(
        weekStart: weekStart,
        logs: [_log('2026-07-14')],
        now: now,
        accountCreated: tz.TZDateTime(_tz, 2026, 7, 1),
      );
      expect(rows1.map((r) => r.dateKey).toList(),
          equals(rows2.map((r) => r.dateKey).toList()));
    });

    test('rows respect account creation lower bound', () {
      final weekStart = startOfWeek(tz.TZDateTime(_tz, 2026, 7, 15));
      final rows = buildHistoryWeekRows(
        weekStart: weekStart,
        logs: [],
        now: tz.TZDateTime(_tz, 2026, 7, 15, 10),
        accountCreated: tz.TZDateTime(_tz, 2026, 7, 14),
      );

      final keys = rows.map((r) => r.dateKey).toList();
      expect(keys, ['2026-07-14', '2026-07-15']);
    });
  });

  // ── computeActiveStreak ─────────────────────────────────────────────────────

  group('computeActiveStreak', () {
    test('active streak starts yesterday when today is empty', () {
      final logs = [
        _log('2026-07-15', entries: 0), // today — empty
        _log('2026-07-14'), // yesterday — has data
        _log('2026-07-13'),
        _log('2026-07-12'),
      ];
      final today = DateTime(2026, 7, 15);
      final streak = computeActiveStreak(logs: logs, today: today);
      expect(streak, 3);
    });

    test('active streak starts today when today has data', () {
      final logs = [
        _log('2026-07-15', entries: 2), // today — has data
        _log('2026-07-14'),
        _log('2026-07-13'),
      ];
      final today = DateTime(2026, 7, 15);
      final streak = computeActiveStreak(logs: logs, today: today);
      expect(streak, 3);
    });

    test('streak is 0 when yesterday has no data', () {
      final logs = [
        _log('2026-07-15', entries: 0), // today empty
        _log('2026-07-14', entries: 0), // yesterday empty too
        _log('2026-07-13'),
      ];
      final today = DateTime(2026, 7, 15);
      final streak = computeActiveStreak(logs: logs, today: today);
      expect(streak, 0);
    });

    test('streak breaks at a gap day', () {
      final logs = [
        _log('2026-07-15', entries: 2), // today
        _log('2026-07-14'), // yesterday
        // 13 missing
        _log('2026-07-12'),
        _log('2026-07-11'),
      ];
      final today = DateTime(2026, 7, 15);
      final streak = computeActiveStreak(logs: logs, today: today);
      expect(streak, 2);
    });

    test('streak is 0 on completely empty day', () {
      final logs = <DailyLog>[];
      final today = DateTime(2026, 7, 15);
      final streak = computeActiveStreak(logs: logs, today: today);
      expect(streak, 0);
    });
  });

  // ── account-creation navigation boundary ────────────────────────────────────

  group('previous week/month chevron', () {
    test('disabled at account-creation period', () {
      final selectedWeek = startOfWeek(tz.TZDateTime(_tz, 2026, 7, 15));
      final accountCreated = tz.TZDateTime(_tz, 2026, 7, 14);
      final canGoPrevious = canGoToPreviousWeek(
        selectedWeek: selectedWeek,
        accountCreated: accountCreated,
      );
      expect(canGoPrevious, isFalse);
    });

    test('enabled when account creation is before the previous period', () {
      final selectedWeek = startOfWeek(tz.TZDateTime(_tz, 2026, 7, 20));
      final accountCreated = tz.TZDateTime(_tz, 2026, 7, 1);
      final canGoPrevious = canGoToPreviousWeek(
        selectedWeek: selectedWeek,
        accountCreated: accountCreated,
      );
      expect(canGoPrevious, isTrue);
    });
  });
}
