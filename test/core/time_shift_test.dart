import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/time/clock.dart';
import 'package:calorix/core/time/clock_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

void main() {
  late tz.Location berlin;

  setUpAll(() {
    tz_data.initializeTimeZones();
    berlin = tz.getLocation('Europe/Berlin');
  });

  group('DST spring-forward (CET → CEST)', () {
    testWidgets('clockProvider override uses FakeClock for DST spring-forward', (tester) async {
      // 2026-03-29 01:59 CET is the last moment before spring-forward
      final fake = FakeClock(tz.TZDateTime(berlin, 2026, 3, 29, 1, 59));
      final container = ProviderContainer(
        overrides: [clockProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      expect(fake.nowTZ().hour, 1);
      expect(fake.nowTZ().timeZone.isDst, isFalse);

      // Advance past the DST boundary (02:00 → 03:00)
      fake.advance(const Duration(minutes: 2));
      final result = fake.nowTZ();
      expect(result.hour, 3);
      expect(result.timeZone.isDst, isTrue);
      expect(result.day, 29);
    });
  });

  group('DST fall-back (CEST → CET)', () {
    testWidgets('DST fall-back repeats 02:30 local hour/minute with changed offset', (tester) async {
      // Construct the FIRST 02:30 occurrence (CEST, UTC+2) via a known UTC instant:
      // 2026-10-25T00:30Z == 2026-10-25 02:30 CEST (first occurrence before fall-back).
      // The ambiguous wall-clock constructor tz.TZDateTime(berlin, 2026,10,25,2,30) resolves
      // to the SECOND occurrence (standard time, UTC+1) in the timezone algorithm, so adding
      // 1h would give 03:30, not the repeated 02:30. UTC-instant construction disambiguates
      // the first occurrence.
      final beforeFallBack = tz.TZDateTime.from(
        DateTime.utc(2026, 10, 25, 0, 30),
        berlin,
      );
      expect(beforeFallBack.hour, 2);
      expect(beforeFallBack.minute, 30);
      expect(beforeFallBack.timeZone.isDst, isTrue);
      expect(beforeFallBack.timeZoneOffset, const Duration(hours: 2));

      final fake = FakeClock(beforeFallBack);
      final container = ProviderContainer(
        overrides: [clockProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      // Advance one absolute hour past 02:30 CEST → 02:30 CET
      fake.advance(const Duration(hours: 1));
      final afterFallBack = fake.nowTZ();

      // Same local date
      expect(afterFallBack.year, 2026);
      expect(afterFallBack.month, 10);
      expect(afterFallBack.day, 25);
      // Repeated local time
      expect(afterFallBack.hour, 2);
      expect(afterFallBack.minute, 30);
      // Changed offset: CEST is +02:00, CET is +01:00
      expect(afterFallBack.timeZoneOffset, const Duration(hours: 1));
      expect(afterFallBack.timeZone.isDst, isFalse);
    });
  });

  group('DST spring-forward with provider override', () {
    testWidgets('FakeClock via provider reflects DST spring-forward transition', (tester) async {
      final fake = FakeClock(tz.TZDateTime(berlin, 2026, 3, 29, 1, 0));
      final container = ProviderContainer(
        overrides: [clockProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      final clock = container.read(clockProvider);
      expect(clock.nowTZ().hour, 1);

      // Advance the original fake — the provider-read Clock is abstract and has no advance().
      fake.advance(const Duration(hours: 1));
      final result = clock.nowTZ();
      // After spring-forward: 01:00 CET → 03:00 CEST
      expect(result.hour, 3);
      expect(result.timeZone.isDst, isTrue);
    });
  });

  group('DST fall-back with provider override', () {
    testWidgets('FakeClock via provider reflects DST fall-back transition', (tester) async {
      // Use UTC-instant construction to disambiguate the first 02:30 occurrence.
      final beforeFallBack = tz.TZDateTime.from(
        DateTime.utc(2026, 10, 25, 0, 30),
        berlin,
      );
      final fake = FakeClock(beforeFallBack);
      final container = ProviderContainer(
        overrides: [clockProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      fake.advance(const Duration(hours: 1));
      final result = fake.nowTZ();

      expect(result.hour, 2);
      expect(result.minute, 30);
      expect(result.day, 25);
      expect(result.timeZone.isDst, isFalse);
    });
  });
}
