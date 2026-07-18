import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/time/clock_provider.dart';
import '../models/macro_target_plan.dart';
import 'auth_provider.dart';

final activePlanProvider = StreamProvider<MacroTargetPlan?>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) {
    return Stream.value(MacroTargetPlan.defaultPlan(
        startDate: ref.watch(clockProvider).nowTZ()));
  }
  return ref.watch(macroTargetRepositoryProvider).watchActivePlan(uid);
});
