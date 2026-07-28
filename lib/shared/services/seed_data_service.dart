import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:timezone/timezone.dart' as tz;
import '../utils/date_key.dart';
import '../../core/constants/app_constants.dart';
import '../../core/time/clock.dart';
import '../../debug/debug_deep_links.dart';
import '../../debug/ui_diff_fixture.dart';

/// Seeds demo diary data by writing ENTRIES only. Daily logs are
/// server-maintained: the aggregateDailyLogs trigger recomputes them from
/// entry state, so seeding (and everything else) can never desync aggregates.
class SeedDataService {
  final FirebaseFirestore _db;
  final Clock _clock;
  SeedDataService(this._db, this._clock);

  static const _seedDays = [
    (kcal: 1980.0, protein: 148.0, carbs: 210.0, fat: 62.0, entries: 3),
    (kcal: 2140.0, protein: 162.0, carbs: 228.0, fat: 68.0, entries: 4),
    (kcal: 1760.0, protein: 135.0, carbs: 188.0, fat: 54.0, entries: 3),
    (kcal: 2310.0, protein: 170.0, carbs: 248.0, fat: 74.0, entries: 5),
    (kcal: 2050.0, protein: 155.0, carbs: 218.0, fat: 65.0, entries: 3),
    (kcal: 1890.0, protein: 142.0, carbs: 200.0, fat: 60.0, entries: 4),
  ];

  static const _seedMealNames = [
    'Oatmeal & Berries',
    'Grilled Chicken Salad',
    'Protein Shake',
    'Salmon & Rice',
    'Greek Yogurt Bowl',
  ];

  static const _seedMealTypes = [
    'breakfast',
    'lunch',
    'snack',
    'dinner',
    'drink'
  ];
  static const _seedHours = [8, 12, 15, 19, 10];

  // Exact visible handoff meal-card values. The hero summary is intentionally
  // fixed separately in ui-diff mode because the static design shows 1,420 kcal
  // while these three visible cards sum to 845 kcal.
  static const _mockupTodayEntries = [
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
      imageUrl: 'assets/images/chicken_rice_bowl_square.jpg',
    ),
    (
      name: 'Protein Yogurt',
      kcal: 180.0,
      protein: 25.0,
      carbs: 12.0,
      fat: 3.0,
      confidence: 0.88,
      meal: 'breakfast',
      hour: 9,
      minute: 12,
      imageUrl: 'assets/images/protein_joghurt.jpg',
    ),
    (
      name: 'Espresso · Oat',
      kcal: 45.0,
      protein: 1.0,
      carbs: 8.0,
      fat: 1.0,
      confidence: 0.62,
      meal: 'drink',
      hour: 8,
      minute: 5,
      imageUrl: 'assets/images/coffee-oatmeal.jpg',
    ),
  ];

  CollectionReference<Map<String, dynamic>> _entriesCol(String uid) => _db
      .collection(AppConstants.usersCollection)
      .doc(uid)
      .collection(AppConstants.entriesSubCollection);

  Future<void> seedIfEmpty(String uid) async {
    await _seedHistoryEntries(uid);
    await _seedTodayEntries(uid);
  }

  /// Applies only fixed, reserved fixture documents. The hard runtime guard is
  /// intentionally stronger than an assert so profile/release builds reject
  /// invocation even when assertions are stripped.
  Future<String> forceReseedForUiDiff(String uid) async {
    enforceUiDiffDebugGuard(isDebug: kDebugMode);
    final manifest = UiDiffFixtureManifest.create(
      uid: uid,
      clock: _clock,
      profile: UiDiffFixtureProfile.populated,
    );
    return reseedUiDiffFixture(
      _FirestoreUiDiffFixtureStore(_db, uid),
      manifest,
    );
  }

  Future<void> _writeMockupEntries(String uid, String dateKey) async {
    final col = _entriesCol(uid);
    final now = _clock.nowTZ();
    final batch = _db.batch();
    for (final e in _mockupTodayEntries) {
      batch.set(col.doc(), {
        'uid': uid,
        'date': dateKey,
        'foodName': e.name,
        'baseKcal': e.kcal,
        'baseProtein': e.protein,
        'baseCarbs': e.carbs,
        'baseFat': e.fat,
        'confidence': e.confidence,
        'mealType': e.meal,
        'servingSize': 1.0,
        'quantity': 1.0,
        'status': 'complete',
        'scanMode': 'meal',
        'servingMultiplier': 1.0,
        'corrected': false,
        'detectedItems': <Map<String, dynamic>>[],
        'imageUrl': e.imageUrl,
        'timestamp': Timestamp.fromDate(
          tz.TZDateTime(
              now.location, now.year, now.month, now.day, e.hour, e.minute),
        ),
      });
    }
    await batch.commit();
  }

  /// Seeds the six days before today with deterministic entries whose sums
  /// match the historical targets exactly, so History reads realistic
  /// server-computed daily logs and each day detail shows real rows.
  Future<void> _seedHistoryEntries(String uid) async {
    final now = _clock.nowTZ();
    tz.TZDateTime dayOffset(int offset) =>
        tz.TZDateTime(now.location, now.year, now.month, now.day - offset);
    final firstDayKey = localDateKey(dayOffset(_seedDays.length));
    final existing = await _entriesCol(uid)
        .where('date', isEqualTo: firstDayKey)
        .limit(1)
        .get();
    if (existing.docs.isNotEmpty) return;

    final batch = _db.batch();
    for (int i = 0; i < _seedDays.length; i++) {
      final day = dayOffset(_seedDays.length - i);
      final dateKey = localDateKey(day);
      final target = _seedDays[i];
      final parts = _splitDay(
        kcal: target.kcal,
        protein: target.protein,
        carbs: target.carbs,
        fat: target.fat,
        count: target.entries,
      );
      for (int j = 0; j < parts.length; j++) {
        final part = parts[j];
        batch.set(_entriesCol(uid).doc(), {
          'uid': uid,
          'date': dateKey,
          'foodName': _seedMealNames[j % _seedMealNames.length],
          'baseKcal': part.kcal,
          'baseProtein': part.protein,
          'baseCarbs': part.carbs,
          'baseFat': part.fat,
          'confidence': 0.9,
          'mealType': _seedMealTypes[j % _seedMealTypes.length],
          'status': 'complete',
          'scanMode': 'meal',
          'servingMultiplier': 1.0,
          'corrected': false,
          'detectedItems': <Map<String, dynamic>>[],
          'imageUrl': null,
          'timestamp': Timestamp.fromDate(tz.TZDateTime(
            day.location,
            day.year,
            day.month,
            day.day,
            _seedHours[j % _seedHours.length],
            15,
          )),
        });
      }
    }
    await batch.commit();
  }

  /// Deterministically splits a day target into `count` entries that sum to
  /// the target exactly (the last entry absorbs rounding remainders).
  List<({double kcal, double protein, double carbs, double fat})> _splitDay({
    required double kcal,
    required double protein,
    required double carbs,
    required double fat,
    required int count,
  }) {
    double roundOne(double v) => (v * 10).roundToDouble() / 10;
    final parts = <({double kcal, double protein, double carbs, double fat})>[];
    double usedKcal = 0, usedProtein = 0, usedCarbs = 0, usedFat = 0;
    for (int i = 0; i < count - 1; i++) {
      final fraction = (i + 1) * 2 / (count * (count + 1));
      final part = (
        kcal: roundOne(kcal * fraction),
        protein: roundOne(protein * fraction),
        carbs: roundOne(carbs * fraction),
        fat: roundOne(fat * fraction),
      );
      usedKcal += part.kcal;
      usedProtein += part.protein;
      usedCarbs += part.carbs;
      usedFat += part.fat;
      parts.add(part);
    }
    parts.add((
      kcal: roundOne(kcal - usedKcal),
      protein: roundOne(protein - usedProtein),
      carbs: roundOne(carbs - usedCarbs),
      fat: roundOne(fat - usedFat),
    ));
    return parts;
  }

  Future<void> _seedTodayEntries(String uid) async {
    final todayKey = localDateKey(_clock.nowTZ());
    final existing = await _entriesCol(uid)
        .where('date', isEqualTo: todayKey)
        .limit(1)
        .get();
    if (existing.docs.isNotEmpty) return;
    await _writeMockupEntries(uid, todayKey);
  }
}

class _FirestoreUiDiffFixtureStore implements UiDiffFixtureStore {
  _FirestoreUiDiffFixtureStore(this._db, this._uid);

  final FirebaseFirestore _db;
  final String _uid;

  static const _fixtureCollections = <String>{
    'entries',
    'weightLogs',
    'targets',
    'aiThreads',
  };

  @override
  Future<Map<String, Map<String, Object?>>> readAll() async {
    final result = <String, Map<String, Object?>>{};
    for (final collection in _fixtureCollections) {
      final snapshot = await _db
          .collection(AppConstants.usersCollection)
          .doc(_uid)
          .collection(collection)
          .orderBy(FieldPath.documentId)
          .startAt([uiDiffFixtureDocumentPrefix]).endAt(
              ['$uiDiffFixtureDocumentPrefix\uf8ff']).get();
      for (final document in snapshot.docs) {
        result[document.reference.path] =
            Map<String, Object?>.from(document.data());
        if (collection == AppConstants.aiThreadsSubCollection) {
          for (final nestedCollection in const [
            AppConstants.aiMessagesSubCollection,
            AppConstants.aiMessageArchiveSubCollection,
          ]) {
            final nested = await document.reference
                .collection(nestedCollection)
                .orderBy(FieldPath.documentId)
                .startAt([uiDiffFixtureDocumentPrefix]).endAt(
                    ['$uiDiffFixtureDocumentPrefix\uf8ff']).get();
            for (final nestedDocument in nested.docs) {
              result[nestedDocument.reference.path] =
                  Map<String, Object?>.from(nestedDocument.data());
            }
          }
        }
      }
    }
    return result;
  }

  @override
  Future<void> setDocument(
    String path,
    Map<String, Object?> value,
  ) =>
      _db.doc(path).set(value);

  @override
  Future<void> deleteDocument(String path) => _db.doc(path).delete();
}
