import 'package:cloud_firestore/cloud_firestore.dart';
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

  static const _todayEntries = [
    (
      name: 'Chicken Rice Bowl',
      kcal: 620.0,
      protein: 48.0,
      carbs: 72.0,
      fat: 16.0,
      confidence: 0.91,
      meal: 'lunch',
    ),
    (
      name: 'Greek Yogurt & Berries',
      kcal: 210.0,
      protein: 18.0,
      carbs: 28.0,
      fat: 4.0,
      confidence: 0.95,
      meal: 'breakfast',
    ),
    (
      name: 'Protein Shake',
      kcal: 180.0,
      protein: 30.0,
      carbs: 8.0,
      fat: 3.0,
      confidence: 0.97,
      meal: 'snack',
    ),
  ];

  Future<void> seedIfEmpty(String uid) async {
    await _seedDailyLogs(uid);
    await _seedTodayEntries(uid);
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
      final docId = '${uid}_$dateStr';
      batch.set(col.doc(docId), {
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
    final mealTimes = [
      now.copyWith(hour: 8, minute: 30),
      now.copyWith(hour: 12, minute: 48),
      now.copyWith(hour: 16, minute: 15),
    ];
    for (int i = 0; i < _todayEntries.length; i++) {
      final e = _todayEntries[i];
      final doc = col.doc();
      batch.set(doc, {
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
        'status': 'confirmed',
        'timestamp': Timestamp.fromDate(mealTimes[i]),
        'imageUrl': null,
      });
    }
    await batch.commit();
  }

  String _todayDateStr() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }
}
