import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/time/timezone_utils.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

void main() {
  late tz.Location berlin;

  setUpAll(() {
    tz_data.initializeTimeZones();
    berlin = tz.getLocation('Europe/Berlin');
  });

  group('startOfDay', () {
    test('strips hour, minute, second, millisecond', () {
      final dt = tz.TZDateTime(berlin, 2026, 7, 15, 14, 30, 45, 123);
      final result = startOfDay(dt);
      expect(result.year, 2026);
      expect(result.month, 7);
      expect(result.day, 15);
      expect(result.hour, 0);
      expect(result.minute, 0);
      expect(result.second, 0);
      expect(result.millisecond, 0);
    });

    test('preserves the location', () {
      final dt = tz.TZDateTime(berlin, 2026, 1, 1, 6, 0);
      final result = startOfDay(dt);
      expect(result.location.name, 'Europe/Berlin');
    });

    test('midnight input is unchanged', () {
      final dt = tz.TZDateTime(berlin, 2026, 12, 31, 0, 0);
      final result = startOfDay(dt);
      expect(result.hour, 0);
      expect(result.day, 31);
      expect(result.month, 12);
    });
  });

  group('startOfWeek', () {
    test('Monday returns same day', () {
      // 2026-07-13 is a Monday
      final dt = tz.TZDateTime(berlin, 2026, 7, 13, 14, 30);
      final result = startOfWeek(dt);
      expect(result.day, 13);
      expect(result.month, 7);
      expect(result.hour, 0);
    });

    test('Wednesday goes back 2 days', () {
      // 2026-07-15 is a Wednesday
      final dt = tz.TZDateTime(berlin, 2026, 7, 15, 10, 0);
      final result = startOfWeek(dt);
      expect(result.day, 13); // Monday
      expect(result.month, 7);
    });

    test('Sunday goes back 6 days', () {
      // 2026-07-19 is a Sunday
      final dt = tz.TZDateTime(berlin, 2026, 7, 19, 8, 0);
      final result = startOfWeek(dt);
      expect(result.day, 13); // Monday
      expect(result.month, 7);
    });

    test('crosses month boundary backward', () {
      // 2026-07-02 is a Thursday
      final dt = tz.TZDateTime(berlin, 2026, 7, 2, 20, 0);
      final result = startOfWeek(dt);
      expect(result.day, 29); // Monday June 29
      expect(result.month, 6);
    });

    test('preserves the location', () {
      final dt = tz.TZDateTime(berlin, 2026, 7, 15, 10, 0);
      final result = startOfWeek(dt);
      expect(result.location.name, 'Europe/Berlin');
    });
  });

  group('startOfMonth', () {
    test('returns the first day at midnight', () {
      final dt = tz.TZDateTime(berlin, 2026, 3, 15, 14, 30);
      final result = startOfMonth(dt);
      expect(result.year, 2026);
      expect(result.month, 3);
      expect(result.day, 1);
      expect(result.hour, 0);
    });

    test('preserves the location', () {
      final dt = tz.TZDateTime(berlin, 2026, 9, 10, 12, 0);
      final result = startOfMonth(dt);
      expect(result.location.name, 'Europe/Berlin');
    });
  });

  group('dateKeyFor', () {
    test('formats as yyyy-MM-dd', () {
      final dt = tz.TZDateTime(berlin, 2026, 1, 5, 14, 30);
      expect(dateKeyFor(dt), '2026-01-05');
    });

    test('pads single-digit month and day', () {
      final dt = tz.TZDateTime(berlin, 2026, 9, 3, 0);
      expect(dateKeyFor(dt), '2026-09-03');
    });

    test('end of year', () {
      final dt = tz.TZDateTime(berlin, 2026, 12, 31, 23, 59);
      expect(dateKeyFor(dt), '2026-12-31');
    });
  });

  group('weekKeyFor', () {
    test('returns the Monday of the current week', () {
      // 2026-07-15 is Wednesday; week starts Monday 2026-07-13
      final dt = tz.TZDateTime(berlin, 2026, 7, 15, 10, 0);
      expect(weekKeyFor(dt), '2026-07-13');
    });

    test('on Monday returns the same day', () {
      final dt = tz.TZDateTime(berlin, 2026, 7, 13, 8, 0);
      expect(weekKeyFor(dt), '2026-07-13');
    });

    test('on Sunday returns the previous Monday', () {
      final dt = tz.TZDateTime(berlin, 2026, 7, 19, 20, 0);
      expect(weekKeyFor(dt), '2026-07-13');
    });
  });

  group('monthKeyFor', () {
    test('formats as yyyy-MM', () {
      final dt = tz.TZDateTime(berlin, 2026, 3, 15, 14, 30);
      expect(monthKeyFor(dt), '2026-03');
    });

    test('pads single-digit month', () {
      final dt = tz.TZDateTime(berlin, 2026, 9, 1, 0);
      expect(monthKeyFor(dt), '2026-09');
    });
  });

  group('yearKeyFor', () {
    test('formats as yyyy', () {
      final dt = tz.TZDateTime(berlin, 2026, 6, 15, 14, 30);
      expect(yearKeyFor(dt), '2026');
    });
  });
}
