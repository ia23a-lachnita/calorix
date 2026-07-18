import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/food_entry.dart';
import '../utils/date_key.dart';
import '../../core/constants/app_constants.dart';
import '../../core/time/clock.dart';

class FoodEntryRepository {
  FoodEntryRepository(this._firestore, this._clock);
  final FirebaseFirestore _firestore;
  final Clock _clock;

  CollectionReference<Map<String, dynamic>> _col(String uid) => _firestore
      .collection(AppConstants.usersCollection)
      .doc(uid)
      .collection(AppConstants.entriesSubCollection);

  /// Statuses visible in diary lists: confirmed entries plus low-confidence
  /// scans awaiting review (shown with the amber badge, excluded from totals).
  static const _visibleStatuses = ['complete', 'needs_review'];

  Stream<FoodEntry> watchEntry(String uid, String id) =>
      _col(uid).doc(id).snapshots().where((s) => s.exists).map(
            (s) => FoodEntry.fromFirestore(s),
          );

  Stream<List<FoodEntry>> watchTodayEntries(String uid) =>
      watchEntriesForDate(uid, _clock.nowTZ());

  Stream<List<FoodEntry>> watchEntriesForDate(String uid, DateTime date) {
    return _col(uid)
        .where('date', isEqualTo: localDateKey(date))
        .where('status', whereIn: _visibleStatuses)
        .orderBy('timestamp', descending: true)
        .snapshots()
        .map((q) => q.docs
            .map((d) => FoodEntry.fromFirestore(
                d as DocumentSnapshot<Map<String, dynamic>>))
            .toList());
  }

  Future<String> createPendingEntry(
      String uid, Map<String, dynamic> data) async {
    final ref = _col(uid).doc();
    await ref.set({...data, 'timestamp': FieldValue.serverTimestamp()});
    return ref.id;
  }

  Future<void> update(String uid, String id, Map<String, dynamic> fields,
          {bool markCorrected = false}) =>
      _col(uid).doc(id).update({
        ...fields,
        if (markCorrected) 'corrected': true,
        'updatedAt': FieldValue.serverTimestamp(),
      });

  /// Confirms a low-confidence scan; the aggregation trigger then counts it.
  Future<void> confirmReview(String uid, String id) =>
      update(uid, id, {'status': FoodEntryStatus.complete.wireName});

  Future<void> delete(String uid, String id) => _col(uid).doc(id).delete();

  Future<String> duplicate(FoodEntry entry) async {
    final ref = _col(entry.uid).doc();
    final now = _clock.nowTZ();
    await ref.set({
      ...entry.toMap(),
      'timestamp': Timestamp.fromDate(now),
      'date': localDateKey(now),
      'corrected': true,
    });
    return ref.id;
  }

  Future<List<FoodEntry>> getRecentEntries(String uid, {int limit = 3}) async {
    final q = await _col(uid)
        .where('status', isEqualTo: 'complete')
        .orderBy('timestamp', descending: true)
        .limit(limit)
        .get();
    return q.docs.map((d) => FoodEntry.fromFirestore(d)).toList();
  }
}
