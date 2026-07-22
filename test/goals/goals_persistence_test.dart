import 'package:calorix/core/time/clock.dart';
import 'package:calorix/features/goals/providers/goals_providers.dart';
import 'package:calorix/shared/models/daily_log.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/repositories/macro_target_repository.dart';
import 'package:calorix/shared/repositories/weight_log_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

class _PlanStore implements MacroTargetDataStore {
  MacroTargetPlan? active;
  int updateCalls = 0;
  int atomicCreateCalls = 0;

  @override
  Stream<MacroTargetPlan?> watchActivePlan(String uid) => Stream.value(active);

  @override
  Stream<List<MacroTargetPlan>> watchAllPlans(String uid) =>
      Stream.value(active == null ? [] : [active!]);

  @override
  Future<void> updatePlan(
      String uid, String planId, Map<String, dynamic> fields) async {
    updateCalls++;
    active = active!.copyWith(
      goal: fields['goal'] == null
          ? null
          : BodyGoal.values.byName(fields['goal'] as String),
      kcal: fields['kcal'] as int?,
      protein: fields['protein'] as int?,
      carbs: fields['carbs'] as int?,
      fat: fields['fat'] as int?,
    );
  }

  @override
  Future<String> createPlan(String uid, MacroTargetPlan plan) async {
    active = plan;
    return 'created';
  }

  @override
  Future<void> setActivePlan(String uid, String planId) async {}

  @override
  Future<String> createAndSetActivePlan(
      String uid, MacroTargetPlan plan) async {
    atomicCreateCalls++;
    active = plan.copyWith(isActive: true);
    return 'created-active';
  }
}

class _WeightStore implements WeightLogDataStore {
  final logs = <String, WeightLog>{};
  int setCalls = 0;

  @override
  Stream<List<WeightLog>> watchRecent(String uid, int limit) => Stream.value(
        (logs.values.toList()..sort((a, b) => a.date.compareTo(b.date)))
            .reversed
            .take(limit)
            .toList()
            .reversed
            .toList(),
      );

  @override
  Future<void> set(String uid, WeightLog log) async {
    setCalls++;
    logs[log.date] = log;
  }
}

MacroTargetPlan _plan({String id = 'plan-1', int kcal = 2400}) =>
    MacroTargetPlan(
      id: id,
      planName: 'Cut Phase',
      goal: BodyGoal.loseFat,
      startDate: DateTime.utc(2026, 3, 20),
      kcal: kcal,
      protein: 170,
      carbs: 250,
      fat: 70,
      isActive: true,
    );

void main() {
  late tz.Location location;
  setUpAll(() {
    tz_data.initializeTimeZones();
    location = tz.getLocation('Europe/Zurich');
  });

  test('existing plan save updates in place and survives repository recreation',
      () async {
    final store = _PlanStore()..active = _plan();
    final first = MacroTargetRepository.withStore(store);
    final desired = _plan(kcal: 2200);

    expect(
        await first.saveActivePlan('user', store.active!, desired), 'plan-1');
    expect(store.updateCalls, 1);

    final restarted = MacroTargetRepository.withStore(store);
    expect((await restarted.watchActivePlan('user').first)!.kcal, 2200);
  });

  test('default plan uses one atomic create-and-activate store operation',
      () async {
    final store = _PlanStore();
    final repository = MacroTargetRepository.withStore(store);
    final current = _plan(id: 'default');

    expect(
      await repository.saveActivePlan('user', current, current),
      'created-active',
    );
    expect(store.atomicCreateCalls, 1);
    expect(store.updateCalls, 0);
  });

  test('invalid macro targets are rejected before any store call', () async {
    final store = _PlanStore()..active = _plan();
    final repository = MacroTargetRepository.withStore(store);

    await expectLater(
      repository.saveActivePlan(
        'user',
        store.active!,
        store.active!.copyWith(protein: 0),
      ),
      throwsArgumentError,
    );
    expect(store.updateCalls, 0);
    expect(store.atomicCreateCalls, 0);
  });

  test('weight log uses clock date, overwrites same day, and extends next day',
      () async {
    final store = _WeightStore();
    final clock = FakeClock(tz.TZDateTime(location, 2026, 3, 28, 10));
    final repository = WeightLogRepository.withStore(store, clock);

    await repository.log('user', 81.2);
    await repository.log('user', 81.0);
    clock.setTo(tz.TZDateTime(location, 2026, 3, 29, 10));
    await repository.log('user', 80.8);

    final logs = await repository.watchRecent('user').first;
    expect(logs.map((log) => log.date), ['2026-03-28', '2026-03-29']);
    expect(logs.first.weight, 81.0);
    expect(store.setCalls, 3);
  });

  test('invalid weight is rejected before the store', () async {
    final store = _WeightStore();
    final repository = WeightLogRepository.withStore(
      store,
      FakeClock(tz.TZDateTime(location, 2026, 3, 28)),
    );

    expect(() => repository.log('user', double.nan), throwsArgumentError);
    expect(() => repository.log('user', 0), throwsArgumentError);
    expect(store.setCalls, 0);
  });

  test('clean draft hydrates late plan but dirty edits survive stream changes',
      () {
    final initial = _plan(id: 'default');
    final notifier = GoalsDraftNotifier(initial);
    final remote = _plan(id: 'remote', kcal: 2300);

    notifier.syncPlan(remote);
    expect(notifier.state.kcal, 2300);
    expect(notifier.state.sourcePlanId, 'remote');

    notifier.beginEditing();
    notifier.setKcal(2100);
    notifier.syncPlan(_plan(id: 'remote', kcal: 2500));
    expect(notifier.state.kcal, 2100);
    expect(notifier.state.dirty, isTrue);
  });

  test('body goal selection applies deterministic calorie and macro split', () {
    final notifier = GoalsDraftNotifier(_plan())..beginEditing();

    notifier.setGoal(BodyGoal.maintain);
    expect(notifier.state.kcal, 2400);
    expect(notifier.state.protein, greaterThan(0));
    expect(notifier.state.carbs, greaterThan(0));
    expect(notifier.state.fat, greaterThan(0));

    notifier.setGoal(BodyGoal.leanPlus);
    expect(notifier.state.kcal, 2800);
  });

  test('draft rejects out-of-range calories and non-positive macros', () {
    final notifier = GoalsDraftNotifier(_plan())..beginEditing();

    expect(() => notifier.setKcal(1499), throwsArgumentError);
    expect(() => notifier.setProtein(0), throwsArgumentError);
    expect(notifier.state.dirty, isFalse);
  });

  test('plan week increments after seven calendar days across DST', () {
    final plan = _plan().copyWith(startDate: DateTime.utc(2026, 3, 23, 12));
    final before = tz.TZDateTime(location, 2026, 3, 29, 12);
    final after = tz.TZDateTime(location, 2026, 3, 30, 12);

    expect(planWeekNumber(plan, before), 1);
    expect(planWeekNumber(plan, after), 2);
  });
}
