import 'dart:async';

import 'package:calorix/core/time/clock.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/repositories/food_entry_repository.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/timezone.dart' as tz;

class _FixedClock implements Clock {
  const _FixedClock(this.value);
  final DateTime value;

  @override
  tz.TZDateTime nowTZ() => tz.TZDateTime.from(value, tz.UTC);

  @override
  DateTime now() => value;
}

class _MemoryFoodEntryStore implements FoodEntryDataStore {
  final Map<String, Map<String, dynamic>> documents = {};
  final Map<String, StreamController<FoodEntryDocument?>> controllers = {};
  final List<String> touchedPaths = [];
  int nextId = 1;

  String _path(String uid, String id) => 'users/$uid/entries/$id';

  @override
  Stream<FoodEntryDocument?> watchEntry(String uid, String id) {
    final path = _path(uid, id);
    touchedPaths.add(path);
    final controller = controllers.putIfAbsent(
      path,
      () => StreamController<FoodEntryDocument?>.broadcast(),
    );
    scheduleMicrotask(() {
      final data = documents[path];
      controller.add(data == null ? null : (id: id, data: data));
    });
    return controller.stream;
  }

  @override
  Stream<List<FoodEntryDocument>> watchEntriesForDate(
    String uid,
    String date,
    List<String> statuses,
  ) =>
      const Stream.empty();

  @override
  Future<String> add(String uid, Map<String, dynamic> data) async {
    final id = 'new-${nextId++}';
    final path = _path(uid, id);
    touchedPaths.add(path);
    documents[path] = Map.of(data);
    controllers[path]?.add((id: id, data: documents[path]!));
    return id;
  }

  @override
  Future<void> set(
    String uid,
    String id,
    Map<String, dynamic> data,
  ) async {
    final path = _path(uid, id);
    touchedPaths.add(path);
    documents[path] = Map.of(data);
    controllers[path]?.add((id: id, data: documents[path]!));
  }

  @override
  Future<void> update(
    String uid,
    String id,
    Map<String, dynamic> fields,
  ) async {
    final path = _path(uid, id);
    touchedPaths.add(path);
    documents[path] = {...?documents[path], ...fields};
    controllers[path]?.add((id: id, data: documents[path]!));
  }

  @override
  Future<void> delete(String uid, String id) async {
    final path = _path(uid, id);
    touchedPaths.add(path);
    documents.remove(path);
    controllers[path]?.add(null);
  }

  @override
  Future<List<FoodEntryDocument>> getRecentEntries(
    String uid,
    int limit,
  ) async =>
      const [];

  Future<void> dispose() async {
    for (final controller in controllers.values) {
      await controller.close();
    }
  }
}

FoodEntry _entry({String id = 'entry-1'}) => FoodEntry(
      id: id,
      uid: 'user-1',
      timestamp: DateTime.utc(2026, 7, 22, 12),
      date: '2026-07-22',
      scanMode: 'meal',
      status: FoodEntryStatus.complete,
      foodName: 'Rice bowl',
      baseKcal: 500,
      baseProtein: 30,
      baseCarbs: 60,
      baseFat: 12,
      servingMultiplier: 1.5,
    );

void main() {
  test('correction fields use deterministic timestamps and mark corrected', () {
    final now = DateTime.utc(2026, 7, 22, 12, 30);
    final fields = correctionUpdateFields(
      {'baseProtein': 25.0, 'servingMultiplier': 2.0},
      now,
    );

    expect(fields['baseProtein'], 25);
    expect(fields['servingMultiplier'], 2);
    expect(fields['corrected'], isTrue);
    expect(
      (fields['correctedAt'] as Timestamp).toDate().isAtSameMomentAs(now),
      isTrue,
    );
    expect(
      (fields['updatedAt'] as Timestamp).toDate().isAtSameMomentAs(now),
      isTrue,
    );
  });

  test('multiplier-only correction does not invent base nutrition fields', () {
    final fields = correctionUpdateFields(
      {'servingMultiplier': 1.5},
      DateTime.utc(2026, 7, 22),
    );

    expect(fields['servingMultiplier'], 1.5);
    expect(fields.keys.where((key) => key.startsWith('base')), isEmpty);
  });

  test('watch emits the entry and then null after scoped deletion', () async {
    final store = _MemoryFoodEntryStore();
    addTearDown(store.dispose);
    store.documents['users/user-1/entries/entry-1'] = _entry().toMap();
    final repository = FoodEntryRepository.withStore(
      store,
      _FixedClock(DateTime.utc(2026, 7, 22, 13)),
    );

    final values = <FoodEntry?>[];
    final subscription =
        repository.watchEntry('user-1', 'entry-1').listen(values.add);
    addTearDown(subscription.cancel);
    await Future<void>.delayed(Duration.zero);
    await repository.delete('user-1', 'entry-1');
    await Future<void>.delayed(Duration.zero);

    expect(values.map((entry) => entry?.id), ['entry-1', null]);
    expect(
      store.touchedPaths,
      everyElement('users/user-1/entries/entry-1'),
    );
  });

  test('duplicate creates a distinct scoped document with same base values',
      () async {
    final store = _MemoryFoodEntryStore();
    addTearDown(store.dispose);
    final repository = FoodEntryRepository.withStore(
      store,
      _FixedClock(DateTime.utc(2026, 7, 22, 14)),
    );

    final id = await repository.duplicate(_entry());

    expect(id, 'new-1');
    final copy = store.documents['users/user-1/entries/new-1']!;
    expect(copy['baseKcal'], 500);
    expect(copy['baseProtein'], 30);
    expect(copy['baseCarbs'], 60);
    expect(copy['baseFat'], 12);
    expect(copy['servingMultiplier'], 1.5);
    expect(copy.containsKey('kcal'), isFalse);
    expect(
      (copy['timestamp'] as Timestamp)
          .toDate()
          .isAtSameMomentAs(DateTime.utc(2026, 7, 22, 14)),
      isTrue,
    );
  });

  test('saveCorrection is scoped and writes deterministic metadata', () async {
    final store = _MemoryFoodEntryStore();
    addTearDown(store.dispose);
    store.documents['users/user-1/entries/entry-1'] = _entry().toMap();
    final now = DateTime.utc(2026, 7, 22, 15);
    final repository = FoodEntryRepository.withStore(store, _FixedClock(now));

    await repository.saveCorrection(
      'user-1',
      'entry-1',
      const NutritionCorrection(baseProtein: 25, servingMultiplier: 2),
    );

    final saved = store.documents['users/user-1/entries/entry-1']!;
    expect(saved['baseProtein'], 25);
    expect(saved['servingMultiplier'], 2);
    expect(saved['corrected'], isTrue);
    expect(
      (saved['correctedAt'] as Timestamp).toDate().isAtSameMomentAs(now),
      isTrue,
    );
    expect(saved.keys.where((key) => key == 'protein'), isEmpty);
    expect(store.touchedPaths.last, 'users/user-1/entries/entry-1');
  });
}
