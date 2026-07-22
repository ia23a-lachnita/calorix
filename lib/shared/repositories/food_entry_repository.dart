import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/food_entry.dart';
import '../utils/date_key.dart';
import '../../core/constants/app_constants.dart';
import '../../core/time/clock.dart';

typedef FoodEntryDocument = ({String id, Map<String, dynamic> data});

abstract class FoodEntryDataStore {
  Stream<FoodEntryDocument?> watchEntry(String uid, String id);

  Stream<List<FoodEntryDocument>> watchEntriesForDate(
    String uid,
    String date,
    List<String> statuses,
  );

  Future<String> add(String uid, Map<String, dynamic> data);

  Future<void> set(String uid, String id, Map<String, dynamic> data);

  Future<void> update(String uid, String id, Map<String, dynamic> fields);

  Future<void> delete(String uid, String id);

  Future<List<FoodEntryDocument>> getRecentEntries(String uid, int limit);
}

class FirestoreFoodEntryDataStore implements FoodEntryDataStore {
  FirestoreFoodEntryDataStore(this._firestore);
  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> _col(String uid) => _firestore
      .collection(AppConstants.usersCollection)
      .doc(uid)
      .collection(AppConstants.entriesSubCollection);

  @override
  Stream<FoodEntryDocument?> watchEntry(String uid, String id) =>
      _col(uid).doc(id).snapshots().map(
            (snapshot) => snapshot.exists
                ? (id: snapshot.id, data: snapshot.data()!)
                : null,
          );

  @override
  Stream<List<FoodEntryDocument>> watchEntriesForDate(
    String uid,
    String date,
    List<String> statuses,
  ) =>
      _col(uid)
          .where('date', isEqualTo: date)
          .where('status', whereIn: statuses)
          .orderBy('timestamp', descending: true)
          .snapshots()
          .map(
            (query) => query.docs
                .map((doc) => (id: doc.id, data: doc.data()))
                .toList(),
          );

  @override
  Future<String> add(String uid, Map<String, dynamic> data) async {
    final reference = _col(uid).doc();
    await reference.set(data);
    return reference.id;
  }

  @override
  Future<void> set(String uid, String id, Map<String, dynamic> data) =>
      _col(uid).doc(id).set(data);

  @override
  Future<void> update(String uid, String id, Map<String, dynamic> fields) =>
      _col(uid).doc(id).update(fields);

  @override
  Future<void> delete(String uid, String id) => _col(uid).doc(id).delete();

  @override
  Future<List<FoodEntryDocument>> getRecentEntries(
    String uid,
    int limit,
  ) async {
    final query = await _col(uid)
        .where('status', isEqualTo: 'complete')
        .orderBy('timestamp', descending: true)
        .limit(limit)
        .get();
    return query.docs.map((doc) => (id: doc.id, data: doc.data())).toList();
  }
}

class NutritionCorrection {
  const NutritionCorrection({
    this.baseKcal,
    this.baseProtein,
    this.baseCarbs,
    this.baseFat,
    this.servingMultiplier,
  });

  final double? baseKcal;
  final double? baseProtein;
  final double? baseCarbs;
  final double? baseFat;
  final double? servingMultiplier;

  Map<String, dynamic> toMap() => {
        if (baseKcal != null) 'baseKcal': baseKcal,
        if (baseProtein != null) 'baseProtein': baseProtein,
        if (baseCarbs != null) 'baseCarbs': baseCarbs,
        if (baseFat != null) 'baseFat': baseFat,
        if (servingMultiplier != null) 'servingMultiplier': servingMultiplier,
      };
}

Map<String, dynamic> correctionUpdateFields(
  Map<String, dynamic> fields,
  DateTime now,
) {
  final timestamp = Timestamp.fromDate(now);
  return {
    ...fields,
    'corrected': true,
    'correctedAt': timestamp,
    'updatedAt': timestamp,
  };
}

class FoodEntryRepository {
  FoodEntryRepository(FirebaseFirestore firestore, Clock clock)
      : this.withStore(FirestoreFoodEntryDataStore(firestore), clock);

  FoodEntryRepository.withStore(this._store, this._clock);

  final FoodEntryDataStore _store;
  final Clock _clock;

  /// Statuses visible in diary lists: confirmed entries plus low-confidence
  /// scans awaiting review (shown with the amber badge, excluded from totals).
  static const _visibleStatuses = ['complete', 'needs_review'];

  Stream<FoodEntry?> watchEntry(String uid, String id) =>
      _store.watchEntry(uid, id).map(
            (document) => document == null
                ? null
                : FoodEntry.fromData(
                    id: document.id,
                    data: document.data,
                  ),
          );

  Stream<List<FoodEntry>> watchTodayEntries(String uid) =>
      watchEntriesForDate(uid, _clock.nowTZ());

  Stream<List<FoodEntry>> watchEntriesForDate(String uid, DateTime date) {
    return _store
        .watchEntriesForDate(uid, localDateKey(date), _visibleStatuses)
        .map(
          (documents) => documents
              .map((document) => FoodEntry.fromData(
                    id: document.id,
                    data: document.data,
                  ))
              .toList(),
        );
  }

  Future<String> createPendingEntry(
      String uid, Map<String, dynamic> data) async {
    return _store.add(
      uid,
      {...data, 'timestamp': FieldValue.serverTimestamp()},
    );
  }

  Future<String> create(String uid, FoodEntry entry) =>
      _store.add(uid, {...entry.toMap(), 'uid': uid});

  Future<void> update(
    String uid,
    String id,
    Map<String, dynamic> fields, {
    bool markCorrected = false,
  }) {
    final now = _clock.nowTZ();
    return _store.update(
      uid,
      id,
      markCorrected
          ? correctionUpdateFields(fields, now)
          : {...fields, 'updatedAt': Timestamp.fromDate(now)},
    );
  }

  Future<void> saveCorrection(
    String uid,
    String id,
    NutritionCorrection correction,
  ) =>
      update(uid, id, correction.toMap(), markCorrected: true);

  /// Confirms a low-confidence scan; the aggregation trigger then counts it.
  Future<void> confirmReview(String uid, String id) =>
      update(uid, id, {'status': FoodEntryStatus.complete.wireName});

  Future<String> createManualEntry({
    required String uid,
    required String name,
    required double kcal,
    required double protein,
    required double carbs,
    required double fat,
    required String servingSize,
    required double quantity,
    required MealType mealType,
  }) async {
    final now = _clock.nowTZ();
    return _store.add(uid, {
      'uid': uid,
      'timestamp': Timestamp.fromDate(now),
      'date': localDateKey(now),
      'scanMode': 'manual',
      'status': FoodEntryStatus.complete.wireName,
      'foodName': name,
      'baseKcal': kcal,
      'baseProtein': protein,
      'baseCarbs': carbs,
      'baseFat': fat,
      'servingSize': servingSize,
      'servingMultiplier': quantity,
      'mealType': mealType.name,
      'confidence': 1.0,
      'corrected': true,
    });
  }

  Future<void> delete(String uid, String id) => _store.delete(uid, id);

  Future<String> duplicate(FoodEntry entry) async {
    final now = _clock.nowTZ();
    return _store.add(entry.uid, {
      ...entry.toMap(),
      'timestamp': Timestamp.fromDate(now),
      'date': localDateKey(now),
      'corrected': true,
    });
  }

  Future<List<FoodEntry>> getRecentEntries(String uid, {int limit = 3}) async {
    final documents = await _store.getRecentEntries(uid, limit);
    return documents
        .map((document) => FoodEntry.fromData(
              id: document.id,
              data: document.data,
            ))
        .toList();
  }
}
