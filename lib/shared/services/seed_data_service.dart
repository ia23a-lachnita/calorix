import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../../core/constants/app_constants.dart';

class SeedDataService {
  final FirebaseFirestore _db;
  SeedDataService(this._db);

  static const _seedDays = [
    (kcal: 1980.0, protein: 148.0, carbs: 210.0, fat: 62.0, entries: 3),
    (kcal: 2140.0, protein: 162.0, carbs: 228.0, fat: 68.0, entries: 4),
    (kcal: 1760.0, protein: 135.0, carbs: 188.0, fat: 54.0, entries: 3),
    (kcal: 2310.0, protein: 170.0, carbs: 248.0, fat: 74.0, entries: 5),
    (kcal: 2050.0, protein: 155.0, carbs: 218.0, fat: 65.0, entries: 3),
    (kcal: 1890.0, protein: 142.0, carbs: 200.0, fat: 60.0, entries: 4),
    (kcal: 2200.0, protein: 165.0, carbs: 235.0, fat: 70.0, entries: 4),
  ];

  // Exact mockup values — sum: 1420 kcal, 96g P, 132g C, 38g F
  // Chicken Rice Bowl is first in the "Recent scans" list (latest timestamp).
  static const _mockupTodayEntries = [
    (
      name: 'Scrambled Eggs & Toast',
      kcal: 390.0,
      protein: 32.0,
      carbs: 36.0,
      fat: 12.0,
      confidence: 0.93,
      meal: 'breakfast',
      hour: 8,
      minute: 0,
    ),
    (
      name: 'Chicken Rice Bowl',
      kcal: 620.0,
      protein: 48.0,
      carbs: 72.0,
      fat: 16.0,
      confidence: 0.91,
      meal: 'lunch',
      hour: 12,
      minute: 48,
    ),
    (
      name: 'Salmon & Vegetables',
      kcal: 410.0,
      protein: 16.0,
      carbs: 24.0,
      fat: 10.0,
      confidence: 0.88,
      meal: 'dinner',
      hour: 16,
      minute: 0,
    ),
  ];

  Future<void> seedIfEmpty(String uid) async {
    await _seedDailyLogs(uid);
    await _seedTodayEntries(uid);
  }

  /// Wipes today's data and reseeds with exact mockup values.
  /// Debug builds only — called via the calorix://debug/reseed deep link
  /// before each ui-diff screenshot run.
  Future<void> forceReseedForUiDiff(String uid) async {
    assert(kDebugMode, 'forceReseedForUiDiff is debug-only');
    final todayStr = _todayDateStr();
    await _deleteTodayEntries(uid, todayStr);
    await _deleteTodayLog(uid, todayStr);
    await _writeMockupEntries(uid, todayStr);
    await _writeTodayLog(uid, todayStr);
  }

  Future<void> _deleteTodayEntries(String uid, String todayStr) async {
    final snap = await _db
        .collection(AppConstants.entriesCollection)
        .where('uid', isEqualTo: uid)
        .where('date', isEqualTo: todayStr)
        .get();
    if (snap.docs.isEmpty) return;
    final batch = _db.batch();
    for (final doc in snap.docs) {
      batch.delete(doc.reference);
    }
    await batch.commit();
  }

  Future<void> _deleteTodayLog(String uid, String todayStr) async {
    await _db
        .collection(AppConstants.dailyLogsCollection)
        .doc('${uid}_$todayStr')
        .delete();
  }

  Future<void> _writeMockupEntries(String uid, String todayStr) async {
    final col = _db.collection(AppConstants.entriesCollection);
    final now = DateTime.now();
    final batch = _db.batch();
    for (final e in _mockupTodayEntries) {
      batch.set(col.doc(), {
        'uid': uid,
        'date': todayStr,
        'foodName': e.name,
        'kcal': e.kcal,
        'protein': e.protein,
        'carbs': e.carbs,
        'fat': e.fat,
        'confidence': e.confidence,
        'mealType': e.meal,
        'servingSize': 1.0,
        'quantity': 1.0,
        'status': 'complete',
        'scanMode': 'meal',
        'servingMultiplier': 1.0,
        'corrected': false,
        'detectedItems': <Map<String, dynamic>>[],
        'imageUrl': null,
        'timestamp': Timestamp.fromDate(
          now.copyWith(hour: e.hour, minute: e.minute, second: 0, millisecond: 0),
        ),
      });
    }
    await batch.commit();
  }

  Future<void> _writeTodayLog(String uid, String todayStr) async {
    await _db
        .collection(AppConstants.dailyLogsCollection)
        .doc('${uid}_$todayStr')
        .set({
      'kcal': 1420.0,
      'protein': 96.0,
      'carbs': 132.0,
      'fat': 38.0,
      'entryCount': 3,
      'date': todayStr,
    });
  }

  Future<void> _seedDailyLogs(String uid) async {
    final col = _db.collection(AppConstants.dailyLogsCollection);
    final existing = await col
        .where(FieldPath.documentId, isGreaterThanOrEqualTo: '${uid}_')
        .where(FieldPath.documentId, isLessThan: '${uid}_z')
        .limit(1)
        .get();
    if (existing.docs.isNotEmpty) return;

    final now = DateTime.now();
    final batch = _db.batch();
    for (int i = 0; i < _seedDays.length; i++) {
      final day = now.subtract(Duration(days: _seedDays.length - 1 - i));
      final dateStr =
          '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
      batch.set(col.doc('${uid}_$dateStr'), {
        'kcal': _seedDays[i].kcal,
        'protein': _seedDays[i].protein,
        'carbs': _seedDays[i].carbs,
        'fat': _seedDays[i].fat,
        'entryCount': _seedDays[i].entries,
        'date': dateStr,
      });
    }
    await batch.commit();
  }

  Future<void> _seedTodayEntries(String uid) async {
    final col = _db.collection(AppConstants.entriesCollection);
    final todayStr = _todayDateStr();
    final existing = await col
        .where('uid', isEqualTo: uid)
        .where('date', isEqualTo: todayStr)
        .limit(1)
        .get();
    if (existing.docs.isNotEmpty) return;

    final now = DateTime.now();
    final batch = _db.batch();
    for (final e in _mockupTodayEntries) {
      batch.set(col.doc(), {
        'uid': uid,
        'date': todayStr,
        'foodName': e.name,
        'kcal': e.kcal,
        'protein': e.protein,
        'carbs': e.carbs,
        'fat': e.fat,
        'confidence': e.confidence,
        'mealType': e.meal,
        'servingSize': 1.0,
        'quantity': 1.0,
        'status': 'complete',
        'scanMode': 'meal',
        'servingMultiplier': 1.0,
        'corrected': false,
        'detectedItems': <Map<String, dynamic>>[],
        'imageUrl': null,
        'timestamp': Timestamp.fromDate(
          now.copyWith(hour: e.hour, minute: e.minute, second: 0, millisecond: 0),
        ),
      });
    }
    await batch.commit();
  }

  String _todayDateStr() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }
}
