import 'dart:collection';
import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../core/time/clock.dart';
import '../shared/utils/date_key.dart';

const String uiDiffFixtureDocumentPrefix = 'ui_diff_fixture_';

class FixtureNutrition {
  const FixtureNutrition({
    required this.kcal,
    required this.protein,
    required this.carbs,
    required this.fat,
  });

  final double kcal;
  final double protein;
  final double carbs;
  final double fat;

  @override
  bool operator ==(Object other) =>
      other is FixtureNutrition &&
      kcal == other.kcal &&
      protein == other.protein &&
      carbs == other.carbs &&
      fat == other.fat;

  @override
  int get hashCode => Object.hash(kcal, protein, carbs, fat);
}

class UiDiffFixtureManifest {
  UiDiffFixtureManifest._(this.documents);

  factory UiDiffFixtureManifest.create({
    required String uid,
    required Clock clock,
  }) {
    final now = clock.nowTZ();
    final today = localDateKey(now);
    final root = 'users/$uid';
    final documents = SplayTreeMap<String, Map<String, Object?>>();

    void add(String collection, String id, Map<String, Object?> value) {
      documents['$root/$collection/$id'] = value;
    }

    final visibleEntries = <({
      String id,
      String name,
      double kcal,
      double protein,
      double carbs,
      double fat,
      double confidence,
      String status,
      String meal,
      int hour,
      int minute,
      String imageUrl,
    })>[
      (
        id: '${uiDiffFixtureDocumentPrefix}today_chicken',
        name: 'Chicken Rice Bowl',
        kcal: 620,
        protein: 48,
        carbs: 72,
        fat: 16,
        confidence: .91,
        status: 'complete',
        meal: 'lunch',
        hour: 12,
        minute: 48,
        imageUrl: 'assets/images/chicken_rice_bowl_square.jpg',
      ),
      (
        id: '${uiDiffFixtureDocumentPrefix}today_yogurt',
        name: 'Protein Yogurt',
        kcal: 180,
        protein: 25,
        carbs: 12,
        fat: 3,
        confidence: .88,
        status: 'complete',
        meal: 'breakfast',
        hour: 9,
        minute: 12,
        imageUrl: 'assets/images/protein_joghurt.jpg',
      ),
      (
        id: '${uiDiffFixtureDocumentPrefix}today_espresso',
        name: 'Espresso · Oat',
        kcal: 45,
        protein: 1,
        carbs: 8,
        fat: 1,
        confidence: .62,
        status: 'needs_review',
        meal: 'drink',
        hour: 8,
        minute: 5,
        imageUrl: 'assets/images/coffee-oatmeal.jpg',
      ),
    ];

    for (final entry in visibleEntries) {
      add('entries', entry.id, {
        'uid': uid,
        'date': today,
        'foodName': entry.name,
        'kcal': entry.kcal,
        'protein': entry.protein,
        'carbs': entry.carbs,
        'fat': entry.fat,
        'confidence': entry.confidence,
        'mealType': entry.meal,
        'servingSize': 1.0,
        'quantity': 1.0,
        'status': entry.status,
        'scanMode': 'meal',
        'servingMultiplier': 1.0,
        'corrected': false,
        'detectedItems': <Map<String, Object?>>[],
        'imageUrl': entry.imageUrl,
        'timestamp': DateTime.utc(
          now.year,
          now.month,
          now.day,
          entry.hour,
          entry.minute,
        ),
      });
    }

    const historyKcal = [
      1980.0,
      2140.0,
      1760.0,
      2310.0,
      2050.0,
      1890.0,
      2010.0
    ];
    for (var i = 0; i < historyKcal.length; i++) {
      final day = DateTime.utc(now.year, now.month, now.day - i - 1, 12, 15);
      add('entries', '${uiDiffFixtureDocumentPrefix}history_${i + 1}', {
        'uid': uid,
        'date': _utcDateKey(day),
        'foodName': 'Fixture day ${i + 1}',
        'kcal': historyKcal[i],
        'protein': 140.0 + i,
        'carbs': 200.0 + i,
        'fat': 60.0 + i,
        'confidence': .95,
        'mealType': 'lunch',
        'status': 'complete',
        'scanMode': 'meal',
        'servingMultiplier': 1.0,
        'corrected': false,
        'detectedItems': <Map<String, Object?>>[],
        'imageUrl': null,
        'timestamp': day,
      });
    }

    add('weightLogs', '${uiDiffFixtureDocumentPrefix}weight_previous', {
      'date': _utcDateKey(DateTime.utc(now.year, now.month, now.day - 14)),
      'weight': 81.2,
    });
    add('weightLogs', '${uiDiffFixtureDocumentPrefix}weight_current', {
      'date': today,
      'weight': 79.8,
    });
    add('targets', '${uiDiffFixtureDocumentPrefix}active_plan', {
      'planName': 'Cut Phase',
      'goal': 'loseFat',
      'startDate': DateTime.utc(now.year, now.month, now.day - 21),
      'endDate': null,
      'kcal': 2400,
      'protein': 170,
      'carbs': 250,
      'fat': 70,
      'isActive': true,
    });
    add('aiThreads', '${uiDiffFixtureDocumentPrefix}chat_thread', {
      'title': 'Today’s plan',
      'createdAt': now.toUtc(),
      'updatedAt': now.toUtc(),
      'messages': <Map<String, Object?>>[
        {
          'role': 'assistant',
          'content': 'Your fixture plan is ready.',
          'timestamp': now.toUtc(),
        },
      ],
    });

    return UiDiffFixtureManifest._(documents);
  }

  final SplayTreeMap<String, Map<String, Object?>> documents;

  List<String> get sortedPaths => documents.keys.toList(growable: false);

  String get canonicalJson => jsonEncode(_sortedMap(
        documents.entries.map(
          (entry) => MapEntry(entry.key, _canonicalize(entry.value)),
        ),
      ));

  String get fixtureHash =>
      sha256.convert(utf8.encode(canonicalJson)).toString();

  FixtureNutrition get rawVisibleTotals =>
      const FixtureNutrition(kcal: 845, protein: 74, carbs: 92, fat: 20);

  FixtureNutrition get acceptedTotals =>
      const FixtureNutrition(kcal: 800, protein: 73, carbs: 84, fat: 19);
}

abstract interface class UiDiffFixtureStore {
  Future<Map<String, Map<String, Object?>>> readAll();

  Future<void> setDocument(String path, Map<String, Object?> value);

  Future<void> deleteDocument(String path);
}

Future<String> reseedUiDiffFixture(
  UiDiffFixtureStore store,
  UiDiffFixtureManifest manifest,
) async {
  final existing = await store.readAll();
  for (final path in existing.keys) {
    if (_isReservedPath(path) && !manifest.documents.containsKey(path)) {
      await store.deleteDocument(path);
    }
  }
  for (final entry in manifest.documents.entries) {
    await store.setDocument(entry.key, entry.value);
  }
  return manifest.fixtureHash;
}

void enforceUiDiffDebugGuard({required bool isDebug}) {
  if (!isDebug) {
    throw UnsupportedError('UI-diff fixture APIs are debug-only.');
  }
}

bool _isReservedPath(String path) =>
    path.split('/').last.startsWith(uiDiffFixtureDocumentPrefix);

String _utcDateKey(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-'
    '${value.month.toString().padLeft(2, '0')}-'
    '${value.day.toString().padLeft(2, '0')}';

Object? _canonicalize(Object? value) {
  if (value is DateTime) {
    return value.toUtc().toIso8601String();
  }
  if (value is Map) {
    return _sortedMap(
      value.entries.map(
        (entry) => MapEntry(entry.key.toString(), _canonicalize(entry.value)),
      ),
    );
  }
  if (value is Iterable) {
    return value.map(_canonicalize).toList(growable: false);
  }
  return value;
}

SplayTreeMap<String, Object?> _sortedMap(
  Iterable<MapEntry<String, Object?>> entries,
) {
  final result = SplayTreeMap<String, Object?>();
  for (final entry in entries) {
    result[entry.key] = entry.value;
  }
  return result;
}
