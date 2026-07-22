import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/constants/app_constants.dart';
import '../../core/time/clock.dart';
import '../models/daily_log.dart';
import '../utils/date_key.dart';

abstract class WeightLogDataStore {
  Stream<List<WeightLog>> watchRecent(String uid, int limit);

  Future<void> set(String uid, WeightLog log);
}

class FirestoreWeightLogDataStore implements WeightLogDataStore {
  FirestoreWeightLogDataStore(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> _collection(String uid) =>
      _firestore
          .collection(AppConstants.usersCollection)
          .doc(uid)
          .collection(AppConstants.weightLogsSubCollection);

  @override
  Stream<List<WeightLog>> watchRecent(String uid, int limit) => _collection(uid)
      .orderBy(FieldPath.documentId, descending: true)
      .limit(limit)
      .snapshots()
      .map((query) => query.docs
          .map(WeightLog.fromFirestore)
          .toList()
          .reversed
          .toList(growable: false));

  @override
  Future<void> set(String uid, WeightLog log) =>
      _collection(uid).doc(log.date).set(log.toMap());
}

class WeightLogRepository {
  WeightLogRepository(FirebaseFirestore firestore, Clock clock)
      : this.withStore(FirestoreWeightLogDataStore(firestore), clock);

  WeightLogRepository.withStore(this._store, this._clock);

  final WeightLogDataStore _store;
  final Clock _clock;

  Stream<List<WeightLog>> watchRecent(String uid, {int limit = 30}) =>
      _store.watchRecent(uid, limit);

  Future<void> log(String uid, double kg) {
    if (!kg.isFinite || kg <= 20 || kg >= 400) {
      throw ArgumentError.value(kg, 'kg', 'must be between 20 and 400');
    }
    final date = localDateKey(_clock.nowTZ());
    return _store.set(uid, WeightLog(date: date, weight: kg));
  }
}
