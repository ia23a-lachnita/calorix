import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timezone/timezone.dart' as tz;
import '../../../core/constants/app_constants.dart';
import '../../../core/time/clock_provider.dart';
import '../../../shared/models/daily_log.dart';
import '../../../shared/models/macro_target_plan.dart';
import '../../../shared/providers/auth_provider.dart';
import '../../../shared/providers/plan_provider.dart';

export '../../../shared/providers/plan_provider.dart' show activePlanProvider;

class GoalsDraft {
  const GoalsDraft({
    required this.sourcePlanId,
    required this.planName,
    required this.startDate,
    required this.goal,
    required this.kcal,
    required this.protein,
    required this.carbs,
    required this.fat,
    this.editing = false,
    this.dirty = false,
    this.saving = false,
    this.error,
  });

  factory GoalsDraft.fromPlan(MacroTargetPlan plan) => GoalsDraft(
        sourcePlanId: plan.id,
        planName: plan.planName,
        startDate: plan.startDate,
        goal: plan.goal,
        kcal: plan.kcal,
        protein: plan.protein,
        carbs: plan.carbs,
        fat: plan.fat,
      );

  final String sourcePlanId;
  final String planName;
  final DateTime startDate;
  final BodyGoal goal;
  final int kcal;
  final int protein;
  final int carbs;
  final int fat;
  final bool editing;
  final bool dirty;
  final bool saving;
  final String? error;

  GoalsDraft copyWith({
    String? sourcePlanId,
    String? planName,
    DateTime? startDate,
    BodyGoal? goal,
    int? kcal,
    int? protein,
    int? carbs,
    int? fat,
    bool? editing,
    bool? dirty,
    bool? saving,
    String? error,
    bool clearError = false,
  }) =>
      GoalsDraft(
        sourcePlanId: sourcePlanId ?? this.sourcePlanId,
        planName: planName ?? this.planName,
        startDate: startDate ?? this.startDate,
        goal: goal ?? this.goal,
        kcal: kcal ?? this.kcal,
        protein: protein ?? this.protein,
        carbs: carbs ?? this.carbs,
        fat: fat ?? this.fat,
        editing: editing ?? this.editing,
        dirty: dirty ?? this.dirty,
        saving: saving ?? this.saving,
        error: clearError ? null : error ?? this.error,
      );
}

class GoalsDraftNotifier extends StateNotifier<GoalsDraft> {
  GoalsDraftNotifier(MacroTargetPlan plan)
      : _sourcePlan = plan,
        super(GoalsDraft.fromPlan(plan));

  MacroTargetPlan _sourcePlan;
  MacroTargetPlan get sourcePlan => _sourcePlan;

  void syncPlan(MacroTargetPlan? plan) {
    if (plan == null || state.dirty || state.saving) return;
    _sourcePlan = plan;
    state = GoalsDraft.fromPlan(plan);
  }

  void beginEditing() {
    if (state.saving) return;
    state = state.copyWith(editing: true, clearError: true);
  }

  void discard() => state = GoalsDraft.fromPlan(_sourcePlan);

  void setGoal(BodyGoal goal) {
    _requireEditing();
    final targetKcal = switch (goal) {
      BodyGoal.loseFat => 2000,
      BodyGoal.maintain => 2400,
      BodyGoal.leanPlus => 2800,
      BodyGoal.custom => state.kcal,
    };
    state = state.copyWith(goal: goal, dirty: true, clearError: true);
    if (goal != BodyGoal.custom) _setKcal(targetKcal);
  }

  void setKcal(int kcal) {
    _requireEditing();
    _validateKcal(kcal);
    _setKcal(kcal);
  }

  void _setKcal(int kcal) {
    final total = state.protein * 4 + state.carbs * 4 + state.fat * 9;
    if (total <= 0) throw StateError('Macro energy must be positive.');
    final ratio = kcal / total;
    state = state.copyWith(
      kcal: kcal,
      protein: (state.protein * ratio).round().clamp(1, 999),
      carbs: (state.carbs * ratio).round().clamp(1, 999),
      fat: (state.fat * ratio).round().clamp(1, 999),
      dirty: true,
      clearError: true,
    );
  }

  void setProtein(int protein) {
    _requireEditing();
    _validateMacro('protein', protein);
    final fat = ((state.kcal - protein * 4 - state.carbs * 4) / 9)
        .round()
        .clamp(1, 999);
    state = state.copyWith(
      protein: protein,
      fat: fat,
      dirty: true,
      clearError: true,
    );
  }

  void setCarbs(int carbs) {
    _requireEditing();
    _validateMacro('carbs', carbs);
    final fat = ((state.kcal - state.protein * 4 - carbs * 4) / 9)
        .round()
        .clamp(1, 999);
    state = state.copyWith(
      carbs: carbs,
      fat: fat,
      dirty: true,
      clearError: true,
    );
  }

  void setFat(int fat) {
    _requireEditing();
    _validateMacro('fat', fat);
    final carbs =
        ((state.kcal - state.protein * 4 - fat * 9) / 4).round().clamp(1, 999);
    state = state.copyWith(
      carbs: carbs,
      fat: fat,
      dirty: true,
      clearError: true,
    );
  }

  void beginSaving() => state = state.copyWith(saving: true, clearError: true);

  void saveSucceeded(String planId) {
    _sourcePlan = desiredPlan.copyWith(id: planId, isActive: true);
    state = GoalsDraft.fromPlan(_sourcePlan);
  }

  void saveFailed(Object error) => state = state.copyWith(
        saving: false,
        editing: true,
        dirty: true,
        error: error.toString(),
      );

  MacroTargetPlan get desiredPlan => _sourcePlan.copyWith(
        goal: state.goal,
        kcal: state.kcal,
        protein: state.protein,
        carbs: state.carbs,
        fat: state.fat,
        isActive: true,
      );

  void _requireEditing() {
    if (!state.editing || state.saving) {
      throw StateError('Goals are not editable.');
    }
  }

  static void _validateKcal(int kcal) {
    if (kcal < AppConstants.kcalSliderMin ||
        kcal > AppConstants.kcalSliderMax) {
      throw ArgumentError.value(kcal, 'kcal', 'outside supported range');
    }
  }

  static void _validateMacro(String name, int value) {
    if (value <= 0 || value > 999) {
      throw ArgumentError.value(value, name, 'must be between 1 and 999');
    }
  }
}

final goalsDraftProvider =
    StateNotifierProvider<GoalsDraftNotifier, GoalsDraft>((ref) {
  final fallback = MacroTargetPlan.defaultPlan(
    startDate: ref.read(clockProvider).nowTZ(),
  );
  final notifier = GoalsDraftNotifier(
    ref.read(activePlanProvider).valueOrNull ?? fallback,
  );
  ref.listen<AsyncValue<MacroTargetPlan?>>(activePlanProvider, (_, next) {
    next.whenData(notifier.syncPlan);
  }, fireImmediately: true);
  return notifier;
});

final saveGoalsDraftProvider = Provider<Future<void> Function()>((ref) {
  return () async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) throw StateError('Sign in before saving goals.');
    final notifier = ref.read(goalsDraftProvider.notifier);
    notifier.beginSaving();
    try {
      final id = await ref.read(macroTargetRepositoryProvider).saveActivePlan(
            uid,
            notifier.sourcePlan,
            notifier.desiredPlan,
          );
      notifier.saveSucceeded(id);
    } catch (error) {
      notifier.saveFailed(error);
      rethrow;
    }
  };
});

int planWeekNumber(MacroTargetPlan plan, tz.TZDateTime now) {
  final start = tz.TZDateTime.from(plan.startDate, now.location);
  final startDate = DateTime.utc(start.year, start.month, start.day);
  final today = DateTime.utc(now.year, now.month, now.day);
  final days = today.difference(startDate).inDays;
  return days < 0 ? 1 : (days ~/ 7) + 1;
}

/// Last 30 weight entries in chronological order. Document ids are
/// YYYY-MM-DD, so lexicographic ordering is date ordering.
final weightLogsProvider = StreamProvider<List<WeightLog>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value([]);
  return ref.watch(weightLogRepositoryProvider).watchRecent(uid);
});

/// Writes today's weight (one entry per calendar day, latest value wins).
Future<void> logWeight(Ref ref, double kg) async {
  final uid = ref.read(currentUidProvider);
  if (uid == null) return;
  await ref.read(weightLogRepositoryProvider).log(uid, kg);
}

final logWeightProvider = Provider<Future<void> Function(double kg)>((ref) {
  return (kg) => logWeight(ref, kg);
});

final allPlansProvider = StreamProvider<List<MacroTargetPlan>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value([]);
  return ref.watch(macroTargetRepositoryProvider).watchAllPlans(uid);
});
