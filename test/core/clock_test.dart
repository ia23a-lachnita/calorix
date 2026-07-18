import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/time/clock.dart';
import 'package:calorix/core/time/clock_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

void main() {
  setUpAll(() {
    tz_data.initializeTimeZones();
  });

  group('Clock abstract contract', () {
    test('nowTZ returns a TZDateTime in tz.local', () {
      final clock = RealClock();
      final result = clock.nowTZ();
      expect(result, isA<tz.TZDateTime>());
      expect(result.location, tz.local);
    });

    test('now returns a DateTime', () {
      final clock = RealClock();
      final result = clock.now();
      expect(result, isA<DateTime>());
    });

    test('nowTZ and now are in the same calendar moment', () {
      final clock = RealClock();
      final tzResult = clock.nowTZ();
      final dtResult = clock.now();
      expect(tzResult.year, dtResult.year);
      expect(tzResult.month, dtResult.month);
      expect(tzResult.day, dtResult.day);
      expect(tzResult.hour, dtResult.hour);
    });
  });

  group('FakeClock', () {
    test('returns the time it was constructed with', () {
      final fake = FakeClock(tz.TZDateTime.utc(2026, 3, 15, 10, 30));
      expect(fake.nowTZ().year, 2026);
      expect(fake.nowTZ().month, 3);
      expect(fake.nowTZ().day, 15);
      expect(fake.nowTZ().hour, 10);
      expect(fake.nowTZ().minute, 30);
    });

    test('advance moves the clock forward by the given duration', () {
      final fake = FakeClock(tz.TZDateTime.utc(2026, 3, 15, 10, 0));
      fake.advance(const Duration(hours: 3));
      expect(fake.nowTZ().hour, 13);
      expect(fake.nowTZ().day, 15);
    });

    test('advance wraps day boundaries', () {
      final fake = FakeClock(tz.TZDateTime.utc(2026, 3, 15, 23, 0));
      fake.advance(const Duration(hours: 2));
      expect(fake.nowTZ().day, 16);
      expect(fake.nowTZ().hour, 1);
    });

    test('setTo overrides the current time', () {
      final fake = FakeClock(tz.TZDateTime.utc(2026, 1, 1));
      fake.setTo(tz.TZDateTime.utc(2027, 6, 20, 14, 30));
      expect(fake.nowTZ().year, 2027);
      expect(fake.nowTZ().month, 6);
      expect(fake.nowTZ().day, 20);
    });

    test('now() and nowTZ() return the same instant', () {
      final fake = FakeClock(tz.TZDateTime.utc(2026, 7, 4, 12, 0));
      final tzResult = fake.nowTZ();
      final dtResult = fake.now();
      expect(tzResult.year, dtResult.year);
      expect(tzResult.month, dtResult.month);
      expect(tzResult.day, dtResult.day);
      expect(tzResult.hour, dtResult.hour);
      expect(tzResult.minute, dtResult.minute);
    });
  });

  group('clockProvider', () {
    test('default provider yields a RealClock', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final clock = container.read(clockProvider);
      expect(clock, isA<RealClock>());
    });

    test('overrideWithValue supplies a FakeClock', () {
      final fake = FakeClock(tz.TZDateTime.utc(2026, 8, 1));
      final container = ProviderContainer(
        overrides: [clockProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);
      final clock = container.read(clockProvider);
      expect(identical(clock, fake), isTrue);
      expect(clock.nowTZ().year, 2026);
      expect(clock.nowTZ().month, 8);
    });

    test('override survives provider re-read', () {
      final fake = FakeClock(tz.TZDateTime.utc(2026, 12, 25));
      final container = ProviderContainer(
        overrides: [clockProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);
      fake.advance(const Duration(days: 1));
      final clock = container.read(clockProvider);
      expect(clock.nowTZ().day, 26);
    });
  });
}
