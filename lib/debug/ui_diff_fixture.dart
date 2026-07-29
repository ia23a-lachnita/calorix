import 'dart:collection';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:timezone/timezone.dart' as tz;

import '../core/time/clock.dart';
import '../shared/models/ai_chat_thread.dart';
import '../shared/utils/date_key.dart';
import 'debug_deep_links.dart';

const String uiDiffFixtureDocumentPrefix = 'ui_diff_fixture_';

class FixtureNutrition {
  const FixtureNutrition({
    required this.kcal,
    required this.protein,
    required this.carbs,
    required this.fat,
  });

  const FixtureNutrition.zero()
      : kcal = 0,
        protein = 0,
        carbs = 0,
        fat = 0;

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

/// Canonical 12-thread AI chat history fixture spanning pinned/today/
/// yesterday/earlier date groups and all four thread categories. This is the
/// single source of truth for the `populated` capture fixture's `aiThreads`
/// content and for tests asserting the AI-history IA — never duplicate this
/// list elsewhere. Dates are relative to [now] so grouping stays correct
/// regardless of when a physical capture runs. Only ever written to the
/// in-memory [UiDiffFixtureManifest]; never to cloud/network.
List<AiChatThread> populatedAiThreadsFixture({
  required String uid,
  required DateTime now,
}) {
  DateTime at(int daysAgo, int hour, int minute) => DateTime.utc(
        now.year,
        now.month,
        now.day - daysAgo,
        hour,
        minute,
      );

  return [
    // Pinned
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}pinned',
      uid: uid,
      title: 'Macro plan for 5×/week training',
      preview:
          'Raised protein to 180 g/day, pulled carbs slightly to keep 2,400 kcal.',
      pinned: true,
      category: AiChatThreadCategory.goals,
      createdAt: at(0, 8, 30),
      updatedAt: at(0, 14, 10),
      appliedActionCount: 1,
    ),
    // Today (3)
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}today_meal',
      uid: uid,
      title: 'Chicken Rice Bowl — wrong scan',
      preview: 'Re-estimated 12:48 lunch to 620 kcal · 48P/72C/16F.',
      category: AiChatThreadCategory.meals,
      unread: true,
      createdAt: at(0, 12, 48),
      updatedAt: at(0, 13, 4),
      appliedActionCount: 1,
    ),
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}today_plan',
      uid: uid,
      title: 'What can I still eat tonight?',
      preview: '980 kcal left, ~72 g protein. Try 200 g salmon, rice, veg.',
      category: AiChatThreadCategory.goals,
      createdAt: at(0, 10, 50),
      updatedAt: at(0, 11, 20),
    ),
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}today_scan',
      uid: uid,
      title: 'Espresso scan check',
      preview: 'Verified 45 kcal · 1P/8C/1F.',
      category: AiChatThreadCategory.scans,
      createdAt: at(0, 8, 5),
      updatedAt: at(0, 8, 15),
    ),
    // Yesterday (3)
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}yesterday_meal',
      uid: uid,
      title: 'Greek yogurt brand swap',
      preview: 'Switched default to Fage 0% — saved as your usual breakfast.',
      category: AiChatThreadCategory.meals,
      createdAt: at(1, 19, 30),
      updatedAt: at(1, 21, 42),
      appliedActionCount: 1,
    ),
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}yesterday_nutrition',
      uid: uid,
      title: 'Why are my carbs low?',
      preview: 'Two skipped snacks. I added a 80 g carb suggestion to today.',
      category: AiChatThreadCategory.goals,
      createdAt: at(1, 17, 0),
      updatedAt: at(1, 19, 8),
    ),
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}yesterday_general',
      uid: uid,
      title: 'Travel day prep',
      preview: 'Packed portable snacks for tomorrow.',
      category: AiChatThreadCategory.general,
      createdAt: at(1, 14, 0),
      updatedAt: at(1, 15, 30),
    ),
    // Earlier (5)
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}earlier_plan',
      uid: uid,
      title: 'Cut vs. maintain — May plan',
      preview: '14-day soft cut at −300 kcal. Auto-applied to weekday goals.',
      category: AiChatThreadCategory.goals,
      createdAt: at(3, 10, 0),
      updatedAt: at(3, 10, 0),
      appliedActionCount: 2,
    ),
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}earlier_export',
      uid: uid,
      title: 'Grocery list from this week',
      preview: 'Compiled 18 items from logged meals. Tap to export.',
      category: AiChatThreadCategory.general,
      createdAt: at(4, 14, 0),
      updatedAt: at(4, 14, 0),
    ),
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}earlier_nutrition',
      uid: uid,
      title: 'Travel day — eating out',
      preview: 'Flagged 2 best options at JFK Terminal 5 under 700 kcal.',
      category: AiChatThreadCategory.scans,
      createdAt: at(5, 12, 0),
      updatedAt: at(5, 12, 0),
    ),
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}earlier_meal',
      uid: uid,
      title: 'Dinner prep suggestion',
      preview: 'Batch-cook chicken thighs with roasted vegetables.',
      category: AiChatThreadCategory.meals,
      createdAt: at(6, 18, 0),
      updatedAt: at(6, 18, 0),
      linkedMealId: '${uiDiffFixtureDocumentPrefix}meal_ref',
    ),
    AiChatThread(
      id: '${uiDiffFixtureDocumentPrefix}earlier_plan2',
      uid: uid,
      title: 'Protein target review',
      preview: 'Evaluated current intake vs. recommended 1.6 g/kg.',
      category: AiChatThreadCategory.goals,
      createdAt: at(7, 9, 0),
      updatedAt: at(7, 9, 0),
      appliedActionCount: 1,
    ),
  ];
}

class UiDiffFixtureManifest {
  UiDiffFixtureManifest._(this.documents, this.profile);

  factory UiDiffFixtureManifest.create({
    required String uid,
    required Clock clock,
    required UiDiffFixtureProfile profile,
  }) {
    final now = clock.nowTZ();
    final today = localDateKey(now);
    final root = 'users/$uid';
    final documents = SplayTreeMap<String, Map<String, Object?>>();

    void add(String collection, String id, Map<String, Object?> value) {
      documents['$root/$collection/$id'] = value;
    }

    switch (profile) {
      case UiDiffFixtureProfile.populated:
        _addPopulatedData(now, today, uid, root, add, documents);
      case UiDiffFixtureProfile.flowReview:
        _addReviewData(now, today, uid, add);
      case UiDiffFixtureProfile.flowProcessing:
        _addProcessingData(now, today, uid, add);
      case UiDiffFixtureProfile.flowManual:
        _addManualData(now, today, uid, add);
      case UiDiffFixtureProfile.empty:
      case UiDiffFixtureProfile.flowPermission:
      case UiDiffFixtureProfile.flowScan:
      case UiDiffFixtureProfile.flowLoading:
      case UiDiffFixtureProfile.flowLogin:
        break;
    }

    return UiDiffFixtureManifest._(documents, profile);
  }

  final UiDiffFixtureProfile profile;
  final SplayTreeMap<String, Map<String, Object?>> documents;

  List<String> get sortedPaths => documents.keys.toList(growable: false);

  Iterable<MapEntry<String, Map<String, Object?>>> get visibleTodayDocuments =>
      documents.entries.where(
        (entry) =>
            entry.key
                .contains('/entries/${uiDiffFixtureDocumentPrefix}today_') ||
            entry.key
                .contains('/entries/${uiDiffFixtureDocumentPrefix}review_') ||
            entry.key
                .contains('/entries/${uiDiffFixtureDocumentPrefix}processing_'),
      );

  String get canonicalJson => jsonEncode({
        'profile': profile.name,
        'documents': _sortedMap(
          documents.entries.map(
            (entry) => MapEntry(entry.key, _canonicalize(entry.value)),
          ),
        ),
      });

  String get fixtureHash =>
      sha256.convert(utf8.encode(canonicalJson)).toString();

  FixtureNutrition get rawVisibleTotals {
    switch (profile) {
      case UiDiffFixtureProfile.populated:
        return const FixtureNutrition(
            kcal: 845, protein: 74, carbs: 92, fat: 20);
      case UiDiffFixtureProfile.flowReview:
        return const FixtureNutrition(
            kcal: 350, protein: 15, carbs: 40, fat: 12);
      case UiDiffFixtureProfile.empty:
      case UiDiffFixtureProfile.flowPermission:
      case UiDiffFixtureProfile.flowScan:
      case UiDiffFixtureProfile.flowProcessing:
      case UiDiffFixtureProfile.flowManual:
      case UiDiffFixtureProfile.flowLoading:
      case UiDiffFixtureProfile.flowLogin:
        return const FixtureNutrition.zero();
    }
  }

  FixtureNutrition get acceptedTotals {
    switch (profile) {
      case UiDiffFixtureProfile.populated:
        return const FixtureNutrition(
            kcal: 800, protein: 73, carbs: 84, fat: 19);
      case UiDiffFixtureProfile.empty:
      case UiDiffFixtureProfile.flowPermission:
      case UiDiffFixtureProfile.flowScan:
      case UiDiffFixtureProfile.flowProcessing:
      case UiDiffFixtureProfile.flowReview:
      case UiDiffFixtureProfile.flowManual:
      case UiDiffFixtureProfile.flowLoading:
      case UiDiffFixtureProfile.flowLogin:
        return const FixtureNutrition.zero();
    }
  }

  static void _addPopulatedData(
    tz.TZDateTime now,
    String today,
    String uid,
    String root,
    void Function(String, String, Map<String, Object?>) add,
    SplayTreeMap<String, Map<String, Object?>> documents,
  ) {
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
        'baseKcal': entry.kcal,
        'baseProtein': entry.protein,
        'baseCarbs': entry.carbs,
        'baseFat': entry.fat,
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

    const historyDays = [
      (kcal: 2350.0, protein: 172.0, carbs: 245.0, fat: 68.0, meals: 5),
      (kcal: 1980.0, protein: 148.0, carbs: 220.0, fat: 56.0, meals: 4),
      (kcal: 2410.0, protein: 178.0, carbs: 258.0, fat: 71.0, meals: 6),
      (kcal: 2280.0, protein: 166.0, carbs: 245.0, fat: 66.0, meals: 5),
      (kcal: 2050.0, protein: 151.0, carbs: 226.0, fat: 61.0, meals: 4),
      (kcal: 1890.0, protein: 143.0, carbs: 205.0, fat: 58.0, meals: 4),
      (kcal: 2010.0, protein: 149.0, carbs: 218.0, fat: 60.0, meals: 4),
    ];
    for (var i = 0; i < historyDays.length; i++) {
      final history = historyDays[i];
      final day = DateTime.utc(now.year, now.month, now.day - i - 1, 12, 15);
      add('entries', '${uiDiffFixtureDocumentPrefix}history_${i + 1}', {
        'uid': uid,
        'date': _utcDateKey(day),
        'foodName': 'Fixture day ${i + 1}',
        'baseKcal': history.kcal,
        'baseProtein': history.protein,
        'baseCarbs': history.carbs,
        'baseFat': history.fat,
        'confidence': .95,
        'mealType': 'lunch',
        'status': 'complete',
        'scanMode': 'meal',
        'servingMultiplier': 1.0,
        'corrected': false,
        'detectedItems': <Map<String, Object?>>[],
        'imageUrl': null,
        'entryCount': history.meals,
        'timestamp': day,
      });
    }

    add('weightLogs', '${uiDiffFixtureDocumentPrefix}weight_previous', {
      'date': _utcDateKey(DateTime.utc(now.year, now.month, now.day - 14)),
      'weight': 83.2,
    });
    add('weightLogs', '${uiDiffFixtureDocumentPrefix}weight_current', {
      'date': today,
      'weight': 81.4,
    });
    add('targets', '${uiDiffFixtureDocumentPrefix}active_plan', {
      'planName': 'Cut Phase',
      'goal': 'loseFat',
      'startDate': DateTime.utc(
        now.year,
        now.month,
        now.day - (now.weekday - DateTime.monday) - 21,
      ),
      'endDate': null,
      'kcal': 2400,
      'protein': 170,
      'carbs': 250,
      'fat': 70,
      'isActive': true,
    });
    final threads = populatedAiThreadsFixture(uid: uid, now: now);
    for (final thread in threads) {
      add('aiThreads', thread.id, thread.toMap());
    }
    const threadId = '${uiDiffFixtureDocumentPrefix}pinned';
    documents[
        '$root/aiThreads/$threadId/messages/${uiDiffFixtureDocumentPrefix}chat_user_1'] = {
      'role': 'user',
      'content':
          'That last scan is wrong — it was chicken and rice, not a curry.',
      'createdAt': now.subtract(const Duration(minutes: 4)).toUtc(),
      'status': 'complete',
    };
    documents[
        '$root/aiThreads/$threadId/messages/${uiDiffFixtureDocumentPrefix}chat_reply_1'] = {
      'role': 'assistant',
      'content':
          'Got it. I re-estimated your 12:48 Lunch as a chicken rice bowl, ~380g. The macros come down a bit:',
      'createdAt': now.subtract(const Duration(minutes: 3)).toUtc(),
      'status': 'complete',
    };
    documents[
        '$root/aiThreads/$threadId/messages/${uiDiffFixtureDocumentPrefix}chat_user_2'] = {
      'role': 'user',
      'content': "Also bump protein up — I'm hitting the gym 5×/week now.",
      'createdAt': now.subtract(const Duration(minutes: 2)).toUtc(),
      'status': 'complete',
    };
    documents[
        '$root/aiThreads/$threadId/messages/${uiDiffFixtureDocumentPrefix}chat_reply_2'] = {
      'role': 'assistant',
      'content':
          "Reasonable. At your current weight (81.4 kg) and training load I'd raise protein to 180 g/day and pull carbs slightly to keep calories at 2,400.",
      'createdAt': now.subtract(const Duration(minutes: 1)).toUtc(),
      'status': 'complete',
      'action': {
        'field': 'Protein',
        'macro': 'protein',
        'old': 170,
        'new': 180,
      },
    };
  }

  static void _addReviewData(
    tz.TZDateTime now,
    String today,
    String uid,
    void Function(String, String, Map<String, Object?>) add,
  ) {
    add('entries', '${uiDiffFixtureDocumentPrefix}review_food', {
      'uid': uid,
      'date': today,
      'foodName': 'Chicken Rice Bowl',
      'baseKcal': 620,
      'baseProtein': 48,
      'baseCarbs': 72,
      'baseFat': 16,
      'confidence': 0.62,
      'mealType': 'lunch',
      'servingSize': 1.0,
      'quantity': 1.0,
      'status': 'needs_review',
      'scanMode': 'meal',
      'servingMultiplier': 1.0,
      'corrected': false,
      'detectedItems': <Map<String, Object?>>[],
      'candidates': <Map<String, Object?>>[
        {
          'name': 'Chicken Rice Bowl',
          'confidence': 0.62,
          'kcal': 620,
          'proteinG': 48.0,
          'carbsG': 72.0,
          'fatG': 16.0,
          'imageUrl': null
        },
        {
          'name': 'Teriyaki Chicken Bowl',
          'confidence': 0.52,
          'kcal': 655,
          'proteinG': 45.0,
          'carbsG': 78.0,
          'fatG': 18.0,
          'imageUrl': null
        },
        {
          'name': 'Pork Katsu Bowl',
          'confidence': 0.38,
          'kcal': 690,
          'proteinG': 42.0,
          'carbsG': 82.0,
          'fatG': 22.0,
          'imageUrl': null
        },
      ],
      'imageUrl': null,
      'timestamp': now.toUtc(),
    });
  }

  static void _addProcessingData(
    tz.TZDateTime now,
    String today,
    String uid,
    void Function(String, String, Map<String, Object?>) add,
  ) {
    add('entries', '${uiDiffFixtureDocumentPrefix}processing_entry', {
      'uid': uid,
      'date': today,
      'foodName': 'Processing...',
      'baseKcal': 0,
      'baseProtein': 0,
      'baseCarbs': 0,
      'baseFat': 0,
      'confidence': null,
      'mealType': 'lunch',
      'servingSize': 1.0,
      'quantity': 1.0,
      'status': 'pending',
      'scanMode': 'meal',
      'servingMultiplier': 1.0,
      'corrected': false,
      'detectedItems': <Map<String, Object?>>[],
      'imageUrl': null,
      'timestamp': now.toUtc(),
    });
  }

  static void _addManualData(
    tz.TZDateTime now,
    String today,
    String uid,
    void Function(String, String, Map<String, Object?>) add,
  ) {
    add('entries', '${uiDiffFixtureDocumentPrefix}manual_search_1', {
      'uid': uid,
      'date': today,
      'foodName': 'Grilled Chicken Breast',
      'baseKcal': 284,
      'baseProtein': 43,
      'baseCarbs': 0,
      'baseFat': 11,
      'confidence': 1.0,
      'mealType': 'manual_search',
      'servingSize': 1.0,
      'quantity': 0,
      'status': 'complete',
      'scanMode': 'manual',
      'servingMultiplier': 1.0,
      'corrected': false,
      'detectedItems': <Map<String, Object?>>[],
      'imageUrl': null,
      'timestamp': now.toUtc(),
    });
    add('entries', '${uiDiffFixtureDocumentPrefix}manual_search_2', {
      'uid': uid,
      'date': today,
      'foodName': 'Brown Rice',
      'baseKcal': 216,
      'baseProtein': 5,
      'baseCarbs': 45,
      'baseFat': 2,
      'confidence': 1.0,
      'mealType': 'manual_search',
      'servingSize': 1.0,
      'quantity': 0,
      'status': 'complete',
      'scanMode': 'manual',
      'servingMultiplier': 1.0,
      'corrected': false,
      'detectedItems': <Map<String, Object?>>[],
      'imageUrl': null,
      'timestamp': now.toUtc(),
    });
    add('entries', '${uiDiffFixtureDocumentPrefix}manual_search_3', {
      'uid': uid,
      'date': today,
      'foodName': 'Steamed Broccoli',
      'baseKcal': 55,
      'baseProtein': 4,
      'baseCarbs': 11,
      'baseFat': 1,
      'confidence': 1.0,
      'mealType': 'manual_search',
      'servingSize': 1.0,
      'quantity': 0,
      'status': 'complete',
      'scanMode': 'manual',
      'servingMultiplier': 1.0,
      'corrected': false,
      'detectedItems': <Map<String, Object?>>[],
      'imageUrl': null,
      'timestamp': now.toUtc(),
    });
  }
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
