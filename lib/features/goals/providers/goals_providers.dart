import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/time/clock_provider.dart';
import '../../../shared/models/daily_log.dart';
import '../../../shared/models/macro_target_plan.dart';
import '../../../shared/providers/auth_provider.dart';
import '../../../shared/providers/plan_provider.dart';
import '../../../shared/utils/date_key.dart';

export '../../../shared/providers/plan_provider.dart' show activePlanProvider;

/// Last 30 weight entries in chronological order. Document ids are
/// YYYY-MM-DD, so lexicographic ordering is date ordering.
final weightLogsProvider = StreamProvider<List<WeightLog>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value([]);
  return ref
      .watch(firestoreProvider)
      .collection(AppConstants.usersCollection)
      .doc(uid)
      .collection(AppConstants.weightLogsSubCollection)
      .orderBy(FieldPath.documentId, descending: true)
      .limit(30)
      .snapshots()
      .map((q) =>
          q.docs.map(WeightLog.fromFirestore).toList().reversed.toList());
});

/// Writes today's weight (one entry per calendar day, latest value wins).
Future<void> logWeight(Ref ref, double kg) async {
  final uid = ref.read(currentUidProvider);
  if (uid == null) return;
  final dateKey = localDateKey(ref.read(clockProvider).nowTZ());
  await ref
      .read(firestoreProvider)
      .collection(AppConstants.usersCollection)
      .doc(uid)
      .collection(AppConstants.weightLogsSubCollection)
      .doc(dateKey)
      .set(WeightLog(date: dateKey, weight: kg).toMap());
}

final logWeightProvider = Provider<Future<void> Function(double kg)>((ref) {
  return (kg) => logWeight(ref, kg);
});

final allPlansProvider = StreamProvider<List<MacroTargetPlan>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value([]);
  return ref.watch(macroTargetRepositoryProvider).watchAllPlans(uid);
});

final bodyGoalProvider = StateProvider<BodyGoal>((ref) {
  final plan = ref.watch(activePlanProvider).valueOrNull;
  return plan?.goal ?? BodyGoal.loseFat;
});

class MacroSplitNotifier
    extends StateNotifier<({int kcal, int protein, int carbs, int fat})> {
  MacroSplitNotifier(MacroTargetPlan? plan)
      : super((
          kcal: plan?.kcal ?? 2400,
          protein: plan?.protein ?? 170,
          carbs: plan?.carbs ?? 250,
          fat: plan?.fat ?? 70,
        ));

  void setKcal(int kcal) {
    // Recompute macros proportionally
    final totalMacroKcal = state.protein * 4 + state.carbs * 4 + state.fat * 9;
    if (totalMacroKcal == 0) return;
    final ratio = kcal / totalMacroKcal;
    state = (
      kcal: kcal,
      protein: (state.protein * ratio).round(),
      carbs: (state.carbs * ratio).round(),
      fat: (state.fat * ratio).round(),
    );
  }

  void setProtein(int protein) {
    final fatKcal = state.kcal - protein * 4 - state.carbs * 4;
    final fat = (fatKcal / 9).round().clamp(0, 999);
    state = (kcal: state.kcal, protein: protein, carbs: state.carbs, fat: fat);
  }

  void setCarbs(int carbs) {
    final fatKcal = state.kcal - state.protein * 4 - carbs * 4;
    final fat = (fatKcal / 9).round().clamp(0, 999);
    state = (kcal: state.kcal, protein: state.protein, carbs: carbs, fat: fat);
  }

  void setFat(int fat) {
    final carbsKcal = state.kcal - state.protein * 4 - fat * 9;
    final carbs = (carbsKcal / 4).round().clamp(0, 999);
    state = (kcal: state.kcal, protein: state.protein, carbs: carbs, fat: fat);
  }
}

// Use ref.read to avoid rebuilding on every Firestore stream emission,
// which would wipe unsaved macro edits the user is making.
final macroSplitProvider = StateNotifierProvider<MacroSplitNotifier,
    ({int kcal, int protein, int carbs, int fat})>((ref) {
  final plan = ref.read(activePlanProvider).valueOrNull;
  return MacroSplitNotifier(plan);
});
