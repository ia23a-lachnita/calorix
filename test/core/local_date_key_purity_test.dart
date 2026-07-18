import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/shared/utils/date_key.dart';

void main() {
  group('localDateKey', () {
    test('extracts year, month, day from the supplied DateTime', () {
      final dt = DateTime(2026, 7, 15);
      expect(localDateKey(dt), '2026-07-15');
    });

    test('pads single-digit month and day', () {
      final dt = DateTime(2026, 1, 5);
      expect(localDateKey(dt), '2026-01-05');
    });

    test('pads both month and day when single digits', () {
      final dt = DateTime(2026, 3, 9);
      expect(localDateKey(dt), '2026-03-09');
    });

    test('end of year', () {
      final dt = DateTime(2026, 12, 31);
      expect(localDateKey(dt), '2026-12-31');
    });

    test('start of year', () {
      final dt = DateTime(2026, 1, 1);
      expect(localDateKey(dt), '2026-01-01');
    });

    test('uses the supplied DateTime fields, not wall-clock', () {
      // Even if a "now" DateTime were in a different timezone,
      // localDateKey extracts the year/month/day from the supplied object.
      final dt = DateTime.utc(2026, 12, 25);
      expect(localDateKey(dt), '2026-12-25');
    });

    test('ignores time components', () {
      final dt = DateTime(2026, 6, 15, 23, 59, 59, 999);
      expect(localDateKey(dt), '2026-06-15');
    });
  });
}
