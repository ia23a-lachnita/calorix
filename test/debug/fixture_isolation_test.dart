import 'package:calorix/core/time/clock.dart';
import 'package:calorix/debug/debug_deep_links.dart';
import 'package:calorix/debug/ui_diff_fixture.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/timezone.dart' as tz;

class _CountingClock implements Clock {
  _CountingClock(this.instant);

  final tz.TZDateTime instant;
  int reads = 0;

  @override
  DateTime now() => nowTZ();

  @override
  tz.TZDateTime nowTZ() {
    reads++;
    return instant;
  }
}

class _MemoryFixtureStore implements UiDiffFixtureStore {
  _MemoryFixtureStore([Map<String, Map<String, Object?>>? initial])
      : documents = {
          for (final entry in (initial ?? {}).entries)
            entry.key: Map<String, Object?>.from(entry.value),
        };

  final Map<String, Map<String, Object?>> documents;
  final List<String> mutatedPaths = [];

  @override
  Future<Map<String, Map<String, Object?>>> readAll() async => {
        for (final entry in documents.entries)
          entry.key: Map<String, Object?>.from(entry.value),
      };

  @override
  Future<void> setDocument(
    String path,
    Map<String, Object?> value,
  ) async {
    mutatedPaths.add(path);
    documents[path] = Map<String, Object?>.from(value);
  }

  @override
  Future<void> deleteDocument(String path) async {
    mutatedPaths.add(path);
    documents.remove(path);
  }
}

FoodEntry _entry({
  required String id,
  required double kcal,
  required double protein,
  required double carbs,
  required double fat,
  required FoodEntryStatus status,
}) =>
    FoodEntry(
      id: id,
      uid: 'test-user',
      timestamp: DateTime.utc(2026, 7, 18, 12),
      date: '2026-07-18',
      scanMode: 'meal',
      status: status,
      kcal: kcal,
      protein: protein,
      carbs: carbs,
      fat: fat,
    );

UiDiffFixtureManifest createManifest({
  Clock? clock,
  UiDiffFixtureProfile profile = UiDiffFixtureProfile.populated,
}) =>
    UiDiffFixtureManifest.create(
      uid: 'test-user',
      clock: clock ?? FakeClock(tz.TZDateTime.utc(2026, 7, 18, 10, 30)),
      profile: profile,
    );

void main() {
  test('fixture reads the clock once and has stable canonical bytes and hash',
      () {
    final clock = _CountingClock(tz.TZDateTime.utc(2026, 7, 18, 10, 30));
    final first = createManifest(clock: clock);
    final second = createManifest(
      clock: FakeClock(tz.TZDateTime.utc(2026, 7, 18, 10, 30)),
    );

    expect(clock.reads, 1);
    expect(first.canonicalJson, second.canonicalJson);
    expect(first.fixtureHash, second.fixtureHash);
    expect(first.documents.keys.toList(), orderedEquals(first.sortedPaths));
  });

  test('same epoch and profile produces stable hash across invocations', () {
    final instant = tz.TZDateTime.utc(2026, 7, 18, 10, 30);
    final a = UiDiffFixtureManifest.create(
      uid: 'u',
      clock: FakeClock(instant),
      profile: UiDiffFixtureProfile.empty,
    );
    final b = UiDiffFixtureManifest.create(
      uid: 'u',
      clock: FakeClock(instant),
      profile: UiDiffFixtureProfile.empty,
    );
    expect(a.fixtureHash, b.fixtureHash);
  });

  test('all nine profiles produce distinct fixture hashes', () {
    final instant = tz.TZDateTime.utc(2026, 7, 18, 10, 30);
    final hashes = <String>{};
    for (final profile in UiDiffFixtureProfile.values) {
      final manifest = UiDiffFixtureManifest.create(
        uid: 'u',
        clock: FakeClock(instant),
        profile: profile,
      );
      hashes.add(manifest.fixtureHash);
    }
    expect(hashes, hasLength(9));
  });

  test('empty profile produces no documents', () {
    final manifest = createManifest(profile: UiDiffFixtureProfile.empty);
    expect(manifest.documents, isEmpty);
    expect(manifest.visibleTodayDocuments, isEmpty);
    expect(manifest.rawVisibleTotals.kcal, 0);
    expect(manifest.acceptedTotals.kcal, 0);
  });

  test('populated profile keeps existing data and totals', () {
    final manifest = createManifest(profile: UiDiffFixtureProfile.populated);
    expect(manifest.visibleTodayDocuments, hasLength(3));
    expect(manifest.rawVisibleTotals,
        const FixtureNutrition(kcal: 845, protein: 74, carbs: 92, fat: 20));
    expect(manifest.acceptedTotals,
        const FixtureNutrition(kcal: 800, protein: 73, carbs: 84, fat: 19));
  });

  test('flow_review profile has low-confidence entry with candidates', () {
    final manifest = createManifest(profile: UiDiffFixtureProfile.flowReview);
    final docs = manifest.visibleTodayDocuments.toList();
    expect(docs, hasLength(1));
    final entry = docs.first.value;
    expect(entry['status'], 'needs_review');
    expect(entry['confidence'], lessThan(0.5));
    final candidates = entry['candidates'] as List<Object?>;
    expect(candidates, hasLength(greaterThanOrEqualTo(2)));
    final firstCandidate = candidates.first as Map<String, Object?>;
    expect(firstCandidate['name'], isNotEmpty);
    expect(firstCandidate['confidence'], isA<double>());
    expect(firstCandidate['kcal'], isA<int>());
    expect(firstCandidate['proteinG'], isA<double>());
    expect(firstCandidate['carbsG'], isA<double>());
    expect(firstCandidate['fatG'], isA<double>());
  });

  test('flow_processing profile has pending entry without missing asset', () {
    final manifest =
        createManifest(profile: UiDiffFixtureProfile.flowProcessing);
    final docs = manifest.visibleTodayDocuments.toList();
    expect(docs, hasLength(1));
    final entry = docs.first.value;
    expect(entry['status'], 'pending');
    expect(entry['imageUrl'], isNull);
    expect(entry['confidence'], isNull);
    expect(entry['baseKcal'], 0);
  });

  test('flow_manual profile has deterministic search fixture', () {
    final manifest = createManifest(profile: UiDiffFixtureProfile.flowManual);
    final docs = manifest.sortedPaths;
    expect(docs, isNotEmpty);
    for (final path in docs) {
      expect(path, contains('manual_search'));
    }
    final instant = tz.TZDateTime.utc(2026, 7, 18, 10, 30);
    final duplicate = UiDiffFixtureManifest.create(
      uid: 'test-user',
      clock: FakeClock(instant),
      profile: UiDiffFixtureProfile.flowManual,
    );
    expect(manifest.canonicalJson, duplicate.canonicalJson);
  });

  test('flow profiles produce distinct hashes even without production data',
      () {
    final instant = tz.TZDateTime.utc(2026, 7, 18, 10, 30);
    final empty = UiDiffFixtureManifest.create(
      uid: 'u',
      clock: FakeClock(instant),
      profile: UiDiffFixtureProfile.empty,
    );
    final loading = UiDiffFixtureManifest.create(
      uid: 'u',
      clock: FakeClock(instant),
      profile: UiDiffFixtureProfile.flowLoading,
    );
    final login = UiDiffFixtureManifest.create(
      uid: 'u',
      clock: FakeClock(instant),
      profile: UiDiffFixtureProfile.flowLogin,
    );
    final permission = UiDiffFixtureManifest.create(
      uid: 'u',
      clock: FakeClock(instant),
      profile: UiDiffFixtureProfile.flowPermission,
    );
    final scan = UiDiffFixtureManifest.create(
      uid: 'u',
      clock: FakeClock(instant),
      profile: UiDiffFixtureProfile.flowScan,
    );
    final hashes = {
      empty.fixtureHash,
      loading.fixtureHash,
      login.fixtureHash,
      permission.fixtureHash,
      scan.fixtureHash,
    };
    expect(hashes, hasLength(5));
    expect(empty.documents, isEmpty);
    expect(loading.documents, isEmpty,
        reason: 'flow_loading has no production data');
    expect(login.documents, isEmpty,
        reason: 'flow_login has no production data');
    expect(permission.documents, isEmpty,
        reason: 'flow_permission has no production data');
    expect(scan.documents, isEmpty, reason: 'flow_scan has no production data');
  });

  test('fixture raw card sum and production accepted sum stay distinct', () {
    final manifest = createManifest();

    expect(
      manifest.rawVisibleTotals,
      const FixtureNutrition(kcal: 845, protein: 74, carbs: 92, fat: 20),
    );
    expect(
      manifest.acceptedTotals,
      const FixtureNutrition(kcal: 800, protein: 73, carbs: 84, fat: 19),
    );
  });

  test('reseed is idempotent and only mutates reserved fixture paths',
      () async {
    const unrelatedPath = 'users/test-user/entries/real-user-entry';
    const obsoleteFixture = 'users/test-user/entries/ui_diff_fixture_obsolete';
    final unrelated = <String, Object?>{'foodName': 'Keep me', 'kcal': 123};
    final store = _MemoryFixtureStore({
      unrelatedPath: unrelated,
      obsoleteFixture: <String, Object?>{'obsolete': true},
    });
    final manifest = createManifest();

    final firstHash = await reseedUiDiffFixture(store, manifest);
    final firstSnapshot = await store.readAll();
    final secondHash = await reseedUiDiffFixture(store, manifest);
    final secondSnapshot = await store.readAll();

    expect(firstHash, manifest.fixtureHash);
    expect(secondHash, firstHash);
    expect(secondSnapshot, firstSnapshot);
    expect(secondSnapshot[unrelatedPath], unrelated);
    expect(secondSnapshot, isNot(contains(obsoleteFixture)));
    expect(
      store.mutatedPaths,
      everyElement(contains('/ui_diff_fixture_')),
    );
  });

  test('release/profile invocation is rejected by a hard debug guard', () {
    expect(
      () => enforceUiDiffDebugGuard(isDebug: false),
      throwsUnsupportedError,
    );
    expect(() => enforceUiDiffDebugGuard(isDebug: true), returnsNormally);
  });

  test('hero shows 1420 only when fixture override is enabled', () async {
    final entries = [
      _entry(
        id: 'chicken',
        kcal: 620,
        protein: 48,
        carbs: 72,
        fat: 16,
        status: FoodEntryStatus.complete,
      ),
      _entry(
        id: 'yogurt',
        kcal: 180,
        protein: 25,
        carbs: 12,
        fat: 3,
        status: FoodEntryStatus.complete,
      ),
      _entry(
        id: 'espresso',
        kcal: 45,
        protein: 1,
        carbs: 8,
        fat: 1,
        status: FoodEntryStatus.needsReview,
      ),
    ];

    ProviderContainer container({required bool fixtureEnabled}) =>
        ProviderContainer(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => fixtureEnabled),
            todayEntriesProvider.overrideWith((_) => Stream.value(entries)),
          ],
        );

    final productionMath = container(fixtureEnabled: false);
    final fixtureHero = container(fixtureEnabled: true);
    addTearDown(productionMath.dispose);
    addTearDown(fixtureHero.dispose);
    await productionMath.read(todayEntriesProvider.future);
    await fixtureHero.read(todayEntriesProvider.future);

    expect(
      productionMath.read(todaySummaryProvider).kcal,
      800,
    );
    expect(
      fixtureHero.read(todaySummaryProvider).kcal,
      800,
    );
    expect(fixtureHero.read(todayDisplaySummaryProvider).kcal, 1420);
  });

  test('today entries can be served entirely from the local fixture manifest',
      () async {
    final manifest = createManifest();
    final container = ProviderContainer(
      overrides: [
        uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
      ],
    );
    addTearDown(container.dispose);

    final entries = await container.read(todayEntriesProvider.future);

    expect(entries, hasLength(3));
    expect(
        entries.map((entry) => entry.scaledKcal).reduce((a, b) => a + b), 845);
    expect(entries.where((entry) => entry.needsReview), hasLength(1));
  });
}
