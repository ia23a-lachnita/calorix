import 'package:calorix/core/time/clock.dart';
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

void main() {
  UiDiffFixtureManifest createManifest({Clock? clock}) =>
      UiDiffFixtureManifest.create(
        uid: 'test-user',
        clock: clock ?? FakeClock(tz.TZDateTime.utc(2026, 7, 18, 10, 30)),
      );

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
      productionMath.read(todayMacroSummaryProvider),
      (kcal: 800.0, protein: 73.0, carbs: 84.0, fat: 19.0),
    );
    expect(
      fixtureHero.read(todayMacroSummaryProvider),
      (kcal: 1420.0, protein: 96.0, carbs: 132.0, fat: 38.0),
    );
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
