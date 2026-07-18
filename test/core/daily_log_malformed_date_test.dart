import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/shared/models/daily_log.dart';

void main() {
  group('DailyLog.fromFirestore — malformed date handling', () {
    test('malformed date string resolves to sentinel 1970-01-01', () {
      final doc = _fakeDoc({
        'date': 'not-a-date',
        'kcal': 100,
        'protein': 10,
        'carbs': 20,
        'fat': 5,
        'entryCount': 1,
      }, 'users/u1/dailyLogs/bad-date');

      final log = DailyLog.fromFirestore(doc);

      expect(log.date.year, 1970);
      expect(log.date.month, 1);
      expect(log.date.day, 1);
    });

    test('missing date field resolves to sentinel 1970-01-01 (null date)', () {
      final doc = _fakeDoc({
        'kcal': 200,
        'protein': 20,
        'carbs': 30,
        'fat': 10,
        'entryCount': 2,
      }, 'users/u1/dailyLogs/missing-date');

      final log = DailyLog.fromFirestore(doc);

      // When date is null and doc.id is not a parseable date,
      // it should resolve to the sentinel 1970-01-01.
      expect(log.date.year, 1970);
      expect(log.date.month, 1);
      expect(log.date.day, 1);
    });

    test('empty string date resolves to sentinel 1970-01-01', () {
      final doc = _fakeDoc({
        'date': '',
        'kcal': 50,
        'protein': 5,
        'carbs': 10,
        'fat': 3,
        'entryCount': 0,
      }, 'users/u1/dailyLogs/empty-date');

      final log = DailyLog.fromFirestore(doc);

      expect(log.date.year, 1970);
      expect(log.date.month, 1);
      expect(log.date.day, 1);
    });

    test('corrupted non-ISO date resolves to sentinel 1970-01-01', () {
      final doc = _fakeDoc({
        'date': '2026/07/15',
        'kcal': 300,
        'protein': 30,
        'carbs': 40,
        'fat': 12,
        'entryCount': 3,
      }, 'users/u1/dailyLogs/corrupted-date');

      final log = DailyLog.fromFirestore(doc);

      expect(log.date.year, 1970);
      expect(log.date.month, 1);
      expect(log.date.day, 1);
    });

    test('valid date string is parsed correctly', () {
      final doc = _fakeDoc({
        'date': '2026-07-15',
        'kcal': 150,
        'protein': 15,
        'carbs': 25,
        'fat': 8,
        'entryCount': 2,
      }, 'users/u1/dailyLogs/2026-07-15');

      final log = DailyLog.fromFirestore(doc);

      expect(log.date.year, 2026);
      expect(log.date.month, 7);
      expect(log.date.day, 15);
    });

    test('malformed date resolves to exact fixed sentinel, not DateTime.now()', () {
      final doc = _fakeDoc({
        'date': 'garbage-data',
        'kcal': 100,
        'protein': 10,
        'carbs': 20,
        'fat': 5,
        'entryCount': 1,
      }, 'users/u1/dailyLogs/garbage');

      final log = DailyLog.fromFirestore(doc);

      // Assert exact fixed sentinel — never a real-time or current-year value.
      expect(log.date, DateTime(1970, 1, 1));
    });
  });
}

/// Minimal fake DocumentSnapshot for testing DailyLog.fromFirestore.
DocumentSnapshot<Map<String, dynamic>> _fakeDoc(
  Map<String, dynamic> data,
  String path,
) {
  return _FakeDocumentSnapshot(data, path);
}

class _FakeDocumentSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDocumentSnapshot(this._data, this._path);

  final Map<String, dynamic> _data;
  final String _path;

  @override
  Map<String, dynamic> data() => _data;

  @override
  bool get exists => true;

  @override
  String get id => _path.split('/').last;

  @override
  DocumentReference<Map<String, dynamic>> get reference =>
      throw UnimplementedError();

  @override
  SnapshotMetadata get metadata => throw UnimplementedError();

  @override
  Object? get(Object field) => _data[field];

  @override
  dynamic noSuchMethod(Invocation invocation) {
    // Provide a safe fallback for any interface members not explicitly
    // overridden, keeping this fake compile-complete.
    return null;
  }
}
