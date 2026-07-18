import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/shared/models/daily_log.dart';

void main() {
  group('DailyLog.fromMap — malformed date handling', () {
    test('malformed date string resolves to sentinel 1970-01-01', () {
      final log = DailyLog.fromMap({
        'date': 'not-a-date',
        'kcal': 100,
        'protein': 10,
        'carbs': 20,
        'fat': 5,
        'entryCount': 1,
      }, 'bad-date');

      expect(log.date.year, 1970);
      expect(log.date.month, 1);
      expect(log.date.day, 1);
    });

    test('missing date field resolves to sentinel 1970-01-01 (null date)', () {
      final log = DailyLog.fromMap({
        'kcal': 200,
        'protein': 20,
        'carbs': 30,
        'fat': 10,
        'entryCount': 2,
      }, 'missing-date');

      // When date is null and doc.id is not a parseable date,
      // it should resolve to the sentinel 1970-01-01.
      expect(log.date.year, 1970);
      expect(log.date.month, 1);
      expect(log.date.day, 1);
    });

    test('empty string date resolves to sentinel 1970-01-01', () {
      final log = DailyLog.fromMap({
        'date': '',
        'kcal': 50,
        'protein': 5,
        'carbs': 10,
        'fat': 3,
        'entryCount': 0,
      }, 'empty-date');

      expect(log.date.year, 1970);
      expect(log.date.month, 1);
      expect(log.date.day, 1);
    });

    test('corrupted non-ISO date resolves to sentinel 1970-01-01', () {
      final log = DailyLog.fromMap({
        'date': '2026/07/15',
        'kcal': 300,
        'protein': 30,
        'carbs': 40,
        'fat': 12,
        'entryCount': 3,
      }, 'corrupted-date');

      expect(log.date.year, 1970);
      expect(log.date.month, 1);
      expect(log.date.day, 1);
    });

    test('valid date string is parsed correctly', () {
      final log = DailyLog.fromMap({
        'date': '2026-07-15',
        'kcal': 150,
        'protein': 15,
        'carbs': 25,
        'fat': 8,
        'entryCount': 2,
      }, '2026-07-15');

      expect(log.date.year, 2026);
      expect(log.date.month, 7);
      expect(log.date.day, 15);
    });

    test('malformed date resolves to exact fixed sentinel, not DateTime.now()',
        () {
      final log = DailyLog.fromMap({
        'date': 'garbage-data',
        'kcal': 100,
        'protein': 10,
        'carbs': 20,
        'fat': 5,
        'entryCount': 1,
      }, 'garbage');

      // Assert exact fixed sentinel — never a real-time or current-year value.
      expect(log.date, DateTime(1970, 1, 1));
    });
  });
}
