import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/macro_target_plan.dart';
import '../../core/constants/app_constants.dart';

class MacroTargetRepository {
  MacroTargetRepository(this._firestore);
  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> _targetsCol(String uid) =>
      _firestore
          .collection(AppConstants.usersCollection)
          .doc(uid)
          .collection(AppConstants.targetsSubCollection);

  Stream<MacroTargetPlan?> watchActivePlan(String uid) => _targetsCol(uid)
      .where('isActive', isEqualTo: true)
      .limit(1)
      .snapshots()
      .map((q) => q.docs.isEmpty
          ? null
          : MacroTargetPlan.fromFirestore(
              q.docs.first as DocumentSnapshot<Map<String, dynamic>>));

  Stream<List<MacroTargetPlan>> watchAllPlans(String uid) => _targetsCol(uid)
      .orderBy('startDate', descending: true)
      .snapshots()
      .map((q) => q.docs
          .map((d) => MacroTargetPlan.fromFirestore(
              d as DocumentSnapshot<Map<String, dynamic>>))
          .toList());

  Future<void> updatePlan(String uid, String planId, Map<String, dynamic> fields) =>
      _targetsCol(uid).doc(planId).update(fields);

  Future<String> createPlan(String uid, MacroTargetPlan plan) async {
    final ref = _targetsCol(uid).doc();
    await ref.set(plan.toMap());
    return ref.id;
  }

  Future<void> setActivePlan(String uid, String planId) async {
    final batch = _firestore.batch();
    final existing = await _targetsCol(uid).where('isActive', isEqualTo: true).get();
    for (final doc in existing.docs) {
      batch.update(doc.reference, {'isActive': false});
    }
    batch.update(_targetsCol(uid).doc(planId), {'isActive': true});
    await batch.commit();
  }
}
