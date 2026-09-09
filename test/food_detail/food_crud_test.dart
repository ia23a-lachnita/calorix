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

class _UncheckedReviewConfirmation implements ReviewConfirmation {
  const _UncheckedReviewConfirmation({
    required this.consumedAmount,
  });

  @override
  final double consumedAmount;

  @override
  ReviewCandidate? get selectedCandidate => null;
}

class _MemoryFoodEntryStore implements FoodEntryDataStore {
  final Map<String, Map<String, dynamic>> documents = {};
  final Map<String, StreamController<FoodEntryDocument?>> controllers = {};
  final List<String> touchedPaths = [];
  int updateCalls = 0;
  Map<String, dynamic>? lastUpdate;
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
    updateCalls += 1;
    lastUpdate = Map.of(fields);
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

FoodEntry _canonicalEntry({String id = 'canonical-entry'}) =>
    FoodEntry.fromData(
      id: id,
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 7, 22, 12),
        'date': '2026-07-22',
        'scanMode': 'barcode',
        'status': 'needs_review',
        'foodName': 'Vitamin Well Reload',
        'baseKcal': 85.0,
        'baseProtein': 0.0,
        'baseCarbs': 21.0,
        'baseFat': 0.0,
        'servingMultiplier': 9.0,
        'nutritionBasis': 'package',
        'nutritionAmount': 500.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 250.0,
        'packageUnitCount': 6,
        'unitAmount': 83.3333333333,
        'per100Reference': {
          'kcal': 17.0,
          'proteinG': 0.0,
          'carbsG': 4.2,
          'fatG': 0.0,
          'amount': 100.0,
          'unit': 'ml',
        },
        'servingReference': {
          'kcal': 42.5,
          'proteinG': 0.0,
          'carbsG': 10.5,
          'fatG': 0.0,
          'amount': 250.0,
          'unit': 'ml',
        },
        'reviewReasons': ['barcode_unconfirmed'],
        'rawBarcode': '7350042716380',
        'modelBarcode': '7350042716380',
      },
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

  test(
      'duplicate preserves canonical nutrition, references, reasons, and barcode provenance',
      () async {
    final store = _MemoryFoodEntryStore();
    addTearDown(store.dispose);
    final repository = FoodEntryRepository.withStore(
      store,
      _FixedClock(DateTime.utc(2026, 7, 22, 14)),
    );

    final id = await repository.duplicate(_canonicalEntry());

    final copy = store.documents['users/user-1/entries/$id']!;
    expect(copy['nutritionBasis'], 'package');
    expect(copy['nutritionAmount'], 500.0);
    expect(copy['nutritionUnit'], 'ml');
    expect(copy['consumedAmount'], 250.0);
    expect(copy['packageUnitCount'], 6);
    expect(copy['unitAmount'], 83.3333333333);
    expect(copy['per100Reference'], {
      'kcal': 17.0,
      'proteinG': 0.0,
      'carbsG': 4.2,
      'fatG': 0.0,
      'amount': 100.0,
      'unit': 'ml',
    });
    expect(copy['servingReference'], {
      'kcal': 42.5,
      'proteinG': 0.0,
      'carbsG': 10.5,
      'fatG': 0.0,
      'amount': 250.0,
      'unit': 'ml',
    });
    expect(copy['reviewReasons'], ['barcode_unconfirmed']);
    expect(copy['rawBarcode'], '7350042716380');
    expect(copy['modelBarcode'], '7350042716380');
    expect(copy.containsKey('confirmedBarcode'), isFalse);
    expect(copy['confirmedBarcode'], isNull);
  });

  test('duplicate preserves a malformed legacy multiplier as unresolved',
      () async {
    final store = _MemoryFoodEntryStore();
    addTearDown(store.dispose);
    final repository = FoodEntryRepository.withStore(
      store,
      _FixedClock(DateTime.utc(2026, 7, 22, 14)),
    );
    final malformed = FoodEntry.fromData(
      id: 'malformed-legacy',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 7, 22, 12),
        'date': '2026-07-22',
        'scanMode': 'meal',
        'status': 'complete',
        'baseKcal': 100.0,
        'servingMultiplier': 'invalid',
      },
    );
    expect(malformed.hasResolvedConsumption, isFalse);

    final id = await repository.duplicate(malformed);

    final copy = store.documents['users/user-1/entries/$id']!;
    expect(copy.containsKey('servingMultiplier'), isTrue);
    expect(copy['servingMultiplier'], isNull);
    final roundTrip = FoodEntry.fromData(id: id, data: copy);
    expect(roundTrip.usesLegacyServingMultiplier, isTrue);
    expect(roundTrip.hasResolvedConsumption, isFalse);
    expect(roundTrip.scaledKcal, 0.0);
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
    expect(store.touchedPaths, ['users/user-1/entries/entry-1']);
  });

  test('ReviewConfirmation rejects every non-positive or non-finite amount',
      () {
    for (final amount in <double>[
      0,
      -1,
      double.nan,
      double.infinity,
      double.negativeInfinity,
    ]) {
      expect(
        () => ReviewConfirmation(consumedAmount: amount),
        throwsArgumentError,
        reason: 'consumedAmount $amount must be rejected at runtime',
      );
    }
  });

  test('confirmReview writes one complete candidate confirmation update',
      () async {
    final store = _MemoryFoodEntryStore();
    addTearDown(store.dispose);
    final now = DateTime.utc(2026, 9, 9, 10, 30);
    final repository = FoodEntryRepository.withStore(store, _FixedClock(now));
    const candidate = ReviewCandidate(
      name: 'Chicken Rice Bowl',
      confidence: 0.62,
      kcal: 620,
      proteinG: 38,
      carbsG: 72,
      fatG: 18,
    );

    await repository.confirmReview(
      'user-1',
      'entry-1',
      ReviewConfirmation(
        consumedAmount: 250,
        selectedCandidate: candidate,
      ),
    );

    expect(store.updateCalls, 1);
    final update = store.lastUpdate!;
    expect(store.touchedPaths, ['users/user-1/entries/entry-1']);
    expect(update.keys, {
      'foodName',
      'confidence',
      'baseKcal',
      'baseProtein',
      'baseCarbs',
      'baseFat',
      'consumedAmount',
      'status',
      'corrected',
      'correctedAt',
      'updatedAt',
    });
    expect(update['foodName'], 'Chicken Rice Bowl');
    expect(update['confidence'], 0.62);
    expect(update['baseKcal'], 620);
    expect(update['baseProtein'], 38);
    expect(update['baseCarbs'], 72);
    expect(update['baseFat'], 18);
    expect(update['consumedAmount'], 250);
    expect(update['status'], FoodEntryStatus.complete.wireName);
    expect(update['corrected'], isTrue);
    expect(
      (update['correctedAt'] as Timestamp).toDate().isAtSameMomentAs(now),
      isTrue,
    );
    expect(
      (update['updatedAt'] as Timestamp).toDate().isAtSameMomentAs(now),
      isTrue,
    );
  });

  test('amount-only confirmation omits every candidate-owned field', () async {
    final store = _MemoryFoodEntryStore();
    addTearDown(store.dispose);
    final repository = FoodEntryRepository.withStore(
      store,
      _FixedClock(DateTime.utc(2026, 9, 9, 10, 30)),
    );

    await repository.confirmReview(
      'user-1',
      'entry-1',
      ReviewConfirmation(consumedAmount: 250),
    );

    expect(store.updateCalls, 1);
    expect(store.touchedPaths, ['users/user-1/entries/entry-1']);
    final update = store.lastUpdate!;
    expect(update.keys, {
      'consumedAmount',
      'status',
      'corrected',
      'correctedAt',
      'updatedAt',
    });
    expect(update['consumedAmount'], 250);
    expect(update['status'], FoodEntryStatus.complete.wireName);
    expect(update['corrected'], isTrue);
    final expectedTime = DateTime.utc(2026, 9, 9, 10, 30);
    expect(
      (update['correctedAt'] as Timestamp)
          .toDate()
          .isAtSameMomentAs(expectedTime),
      isTrue,
    );
    expect(
      (update['updatedAt'] as Timestamp)
          .toDate()
          .isAtSameMomentAs(expectedTime),
      isTrue,
    );
    for (final key in <String>[
      'foodName',
      'confidence',
      'baseKcal',
      'baseProtein',
      'baseCarbs',
      'baseFat',
    ]) {
      expect(store.lastUpdate!.containsKey(key), isFalse, reason: key);
    }
  });

  test(
      'nullable candidate macros round-trip and each absent edit is omitted independently',
      () async {
    final store = _MemoryFoodEntryStore();
    addTearDown(store.dispose);
    final repository = FoodEntryRepository.withStore(
      store,
      _FixedClock(DateTime.utc(2026, 9, 9, 10, 30)),
    );
    const candidate = ReviewCandidate(
      name: 'Fruit smoothie',
      confidence: 0.72,
      kcal: 310,
      proteinG: null,
      carbsG: 42,
      fatG: 7,
    );

    final restored = ReviewCandidate.fromMap(candidate.toMap());

    expect(restored.proteinG, isNull);
    expect(restored.carbsG, 42);
    expect(restored.fatG, 7);
    expect(candidate.toMap().containsKey('proteinG'), isFalse);
    expect(candidate.toMap()['carbsG'], 42);
    expect(candidate.toMap()['fatG'], 7);

    await repository.confirmReview(
      'user-1',
      'entry-1',
      ReviewConfirmation(
        consumedAmount: 250,
        selectedCandidate: candidate,
      ),
    );

    expect(store.updateCalls, 1);
    expect(store.lastUpdate!['baseKcal'], 310);
    expect(store.lastUpdate!.containsKey('baseProtein'), isFalse);
    expect(store.lastUpdate!['baseCarbs'], 42);
    expect(store.lastUpdate!['baseFat'], 7);
  });

  test('confirmReview revalidates an adversarial confirmation at its boundary',
      () async {
    final store = _MemoryFoodEntryStore();
    addTearDown(store.dispose);
    final repository = FoodEntryRepository.withStore(
      store,
      _FixedClock(DateTime.utc(2026, 9, 9, 10, 30)),
    );

    for (final amount in <double>[
      0,
      -1,
      double.nan,
      double.infinity,
      double.negativeInfinity,
    ]) {
      await expectLater(
        repository.confirmReview(
          'user-1',
          'entry-1',
          _UncheckedReviewConfirmation(consumedAmount: amount),
        ),
        throwsArgumentError,
        reason: 'repository must reject consumedAmount $amount',
      );
    }

    expect(store.updateCalls, 0);
    expect(store.lastUpdate, isNull);
    expect(store.touchedPaths, isEmpty);
  });
}
