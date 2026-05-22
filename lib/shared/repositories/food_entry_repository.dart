import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/food_entry.dart';
import '../../core/constants/app_constants.dart';

class FoodEntryRepository {
  FoodEntryRepository(this._firestore);
  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _col =>
      _firestore.collection(AppConstants.entriesCollection);

  Stream<FoodEntry> watchEntry(String id) =>
      _col.doc(id).snapshots().where((s) => s.exists).map(
            (s) => FoodEntry.fromFirestore(s),
          );

  Stream<List<FoodEntry>> watchTodayEntries(String uid) {
    final start = DateTime.now().copyWith(
        hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0);
    final end = start.add(const Duration(days: 1));
    return _col
        .where('uid', isEqualTo: uid)
        .where('timestamp', isGreaterThanOrEqualTo: Timestamp.fromDate(start))
        .where('timestamp', isLessThan: Timestamp.fromDate(end))
        .where('status', isEqualTo: 'complete')
        .orderBy('timestamp', descending: true)
        .snapshots()
        .map((q) => q.docs
            .map((d) => FoodEntry.fromFirestore(
                d as DocumentSnapshot<Map<String, dynamic>>))
            .toList());
  }

  Stream<List<FoodEntry>> watchEntriesForDate(String uid, DateTime date) {
    final start =
        date.copyWith(hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0);
    final end = start.add(const Duration(days: 1));
    return _col
        .where('uid', isEqualTo: uid)
        .where('timestamp', isGreaterThanOrEqualTo: Timestamp.fromDate(start))
        .where('timestamp', isLessThan: Timestamp.fromDate(end))
        .where('status', isEqualTo: 'complete')
        .orderBy('timestamp', descending: true)
        .snapshots()
        .map((q) => q.docs
            .map((d) => FoodEntry.fromFirestore(
                d as DocumentSnapshot<Map<String, dynamic>>))
            .toList());
  }

  Future<String> createPendingEntry(Map<String, dynamic> data) async {
    final ref = _col.doc();
    await ref.set({...data, 'timestamp': FieldValue.serverTimestamp()});
    return ref.id;
  }

  Future<void> update(String id, Map<String, dynamic> fields,
      {bool markCorrected = false}) =>
      _col.doc(id).update({
        ...fields,
        if (markCorrected) 'corrected': true,
        'updatedAt': FieldValue.serverTimestamp(),
      });

  Future<void> delete(String id) => _col.doc(id).delete();

  Future<String> duplicate(FoodEntry entry) async {
    final ref = _col.doc();
    await ref.set({
      ...entry.toMap(),
      'timestamp': FieldValue.serverTimestamp(),
      'corrected': true,
    });
    return ref.id;
  }

  Future<List<FoodEntry>> getRecentEntries(String uid, {int limit = 3}) async {
    final q = await _col
        .where('uid', isEqualTo: uid)
        .where('status', isEqualTo: 'complete')
        .orderBy('timestamp', descending: true)
        .limit(limit)
        .get();
    return q.docs
        .map((d) =>
            FoodEntry.fromFirestore(d as DocumentSnapshot<Map<String, dynamic>>))
        .toList();
  }
}
