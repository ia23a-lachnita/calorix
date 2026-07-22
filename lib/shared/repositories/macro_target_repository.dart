import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/constants/app_constants.dart';
import '../models/macro_target_plan.dart';

abstract class MacroTargetDataStore {
  Stream<MacroTargetPlan?> watchActivePlan(String uid);

  Stream<List<MacroTargetPlan>> watchAllPlans(String uid);

  Future<void> updatePlan(
    String uid,
    String planId,
    Map<String, dynamic> fields,
  );

  Future<String> createPlan(String uid, MacroTargetPlan plan);

  Future<void> setActivePlan(String uid, String planId);

  Future<String> createAndSetActivePlan(String uid, MacroTargetPlan plan);
}

class FirestoreMacroTargetDataStore implements MacroTargetDataStore {
  FirestoreMacroTargetDataStore(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> _targetsCol(String uid) =>
      _firestore
          .collection(AppConstants.usersCollection)
          .doc(uid)
          .collection(AppConstants.targetsSubCollection);

  @override
  Stream<MacroTargetPlan?> watchActivePlan(String uid) => _targetsCol(uid)
      .where('isActive', isEqualTo: true)
      .limit(1)
      .snapshots()
      .map((query) => query.docs.isEmpty
          ? null
          : MacroTargetPlan.fromFirestore(query.docs.first));

  @override
  Stream<List<MacroTargetPlan>> watchAllPlans(String uid) => _targetsCol(uid)
      .orderBy('startDate', descending: true)
      .snapshots()
      .map((query) => query.docs
          .map(MacroTargetPlan.fromFirestore)
          .toList(growable: false));

  @override
  Future<void> updatePlan(
    String uid,
    String planId,
    Map<String, dynamic> fields,
  ) =>
      _targetsCol(uid).doc(planId).update(fields);

  @override
  Future<String> createPlan(String uid, MacroTargetPlan plan) async {
    final reference = _targetsCol(uid).doc();
    await reference.set(plan.toMap());
    return reference.id;
  }

  @override
  Future<void> setActivePlan(String uid, String planId) async {
    final batch = _firestore.batch();
    final existing =
        await _targetsCol(uid).where('isActive', isEqualTo: true).get();
    for (final document in existing.docs) {
      batch.update(document.reference, {'isActive': false});
    }
    batch.update(_targetsCol(uid).doc(planId), {'isActive': true});
    await batch.commit();
  }

  @override
  Future<String> createAndSetActivePlan(
    String uid,
    MacroTargetPlan plan,
  ) async {
    final batch = _firestore.batch();
    final collection = _targetsCol(uid);
    final existing = await collection.where('isActive', isEqualTo: true).get();
    for (final document in existing.docs) {
      batch.update(document.reference, {'isActive': false});
    }
    final reference = collection.doc();
    batch.set(reference, plan.copyWith(isActive: true).toMap());
    await batch.commit();
    return reference.id;
  }
}

class MacroTargetRepository {
  MacroTargetRepository(FirebaseFirestore firestore)
      : this.withStore(FirestoreMacroTargetDataStore(firestore));

  MacroTargetRepository.withStore(this._store);

  final MacroTargetDataStore _store;

  Stream<MacroTargetPlan?> watchActivePlan(String uid) =>
      _store.watchActivePlan(uid);

  Stream<List<MacroTargetPlan>> watchAllPlans(String uid) =>
      _store.watchAllPlans(uid);

  Future<void> updatePlan(
    String uid,
    String planId,
    Map<String, dynamic> fields,
  ) {
    _validateFields(fields);
    return _store.updatePlan(uid, planId, fields);
  }

  Future<String> createPlan(String uid, MacroTargetPlan plan) {
    _validatePlan(plan);
    return _store.createPlan(uid, plan);
  }

  Future<void> setActivePlan(String uid, String planId) =>
      _store.setActivePlan(uid, planId);

  Future<String> saveActivePlan(
    String uid,
    MacroTargetPlan current,
    MacroTargetPlan desired,
  ) async {
    _validatePlan(desired);
    if (current.id == 'default') {
      return _store.createAndSetActivePlan(
        uid,
        desired.copyWith(isActive: true),
      );
    }

    await _store.updatePlan(uid, current.id, {
      'goal': desired.goal.name,
      'kcal': desired.kcal,
      'protein': desired.protein,
      'carbs': desired.carbs,
      'fat': desired.fat,
    });
    return current.id;
  }

  void _validatePlan(MacroTargetPlan plan) => _validateFields({
        'kcal': plan.kcal,
        'protein': plan.protein,
        'carbs': plan.carbs,
        'fat': plan.fat,
      });

  void _validateFields(Map<String, dynamic> fields) {
    final kcal = fields['kcal'] as num?;
    if (kcal != null &&
        (kcal < AppConstants.kcalSliderMin ||
            kcal > AppConstants.kcalSliderMax)) {
      throw ArgumentError.value(kcal, 'kcal', 'outside supported range');
    }
    for (final key in ['protein', 'carbs', 'fat']) {
      final value = fields[key] as num?;
      if (value != null && (value <= 0 || value > 999)) {
        throw ArgumentError.value(value, key, 'must be between 1 and 999');
      }
    }
  }
}
