import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:uuid/uuid.dart';

import 'package:calorix/core/router/app_router.dart';
import 'package:calorix/core/time/clock.dart';
import 'package:calorix/core/time/clock_provider.dart';
import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/features/food_detail/food_detail_sheet.dart';
import 'package:calorix/features/goals/goals_screen.dart';
import 'package:calorix/features/history/history_screen.dart';
import 'package:calorix/features/history/history_time_travel.dart';
import 'package:calorix/features/history/providers/history_providers.dart';
import 'package:calorix/features/manual/manual_entry_screen.dart';
import 'package:calorix/features/onboarding/loading_screen.dart';
import 'package:calorix/features/onboarding/login_screen.dart';
import 'package:calorix/features/processing/processing_screen.dart';
import 'package:calorix/features/processing/providers/processing_providers.dart';
import 'package:calorix/features/profile/profile_sheet.dart';
import 'package:calorix/features/review/review_screen.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/features/scan/scan_screen.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/shared/models/app_settings.dart';
import 'package:calorix/shared/models/daily_log.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/providers/notification_provider.dart';
import 'package:calorix/shared/providers/settings_provider.dart';
import 'package:calorix/shared/providers/viewed_entry_store.dart';
import 'package:calorix/shared/models/ai_chat_thread.dart';
import 'package:calorix/shared/repositories/ai_thread_repository.dart';
import 'package:calorix/shared/repositories/food_entry_repository.dart';
import 'package:calorix/shared/repositories/macro_target_repository.dart';
import 'package:calorix/shared/repositories/weight_log_repository.dart';
import 'package:calorix/shared/services/ai_chat_service.dart';
import 'package:calorix/shared/services/camera_service.dart';
import 'package:calorix/shared/services/camera_settings_service.dart';
import 'package:calorix/shared/services/connectivity_monitor.dart';
import 'package:calorix/shared/services/entry_existence_checker.dart';
import 'package:calorix/shared/services/notification_service.dart';
import 'package:calorix/shared/services/notification_routing.dart';
import 'package:calorix/shared/services/retry_analysis_service.dart';
import 'package:calorix/shared/services/upload_queue_service.dart';
import 'package:calorix/shell/app_shell.dart';
import 'package:calorix/shell/tab_swipe_shell.dart';

// ---------------------------------------------------------------------------
// In-memory data stores
// ---------------------------------------------------------------------------

class InMemoryFoodEntryDataStore implements FoodEntryDataStore {
  final Map<String, Map<String, dynamic>> _entries = {};
  final _controllers = <String, StreamController<FoodEntryDocument?>>{};
  final _changes = StreamController<void>.broadcast();

  List<FoodEntryDocument> _forDate(
    String uid,
    String date,
    List<String> statuses,
  ) {
    final matching = _entries.entries
        .where((entry) =>
            entry.value['uid'] == uid &&
            entry.value['date'] == date &&
            statuses.contains(entry.value['status']))
        .map((entry) => (id: entry.key, data: entry.value))
        .toList();
    matching.sort((a, b) {
      final aTime = FoodEntry.fromData(id: a.id, data: a.data).timestamp;
      final bTime = FoodEntry.fromData(id: b.id, data: b.data).timestamp;
      return bTime.compareTo(aTime);
    });
    return matching;
  }

  @override
  Stream<FoodEntryDocument?> watchEntry(String uid, String id) {
    _controllers.putIfAbsent(
        id, () => StreamController<FoodEntryDocument?>.broadcast());
    return (() async* {
      final data = _entries[id];
      yield data != null ? (id: id, data: data) : null;
      yield* _controllers[id]!.stream;
    })();
  }

  @override
  Stream<List<FoodEntryDocument>> watchEntriesForDate(
    String uid,
    String date,
    List<String> statuses,
  ) async* {
    yield _forDate(uid, date, statuses);
    yield* _changes.stream.map((_) => _forDate(uid, date, statuses));
  }

  @override
  Future<String> add(String uid, Map<String, dynamic> data) async {
    final id = const Uuid().v4();
    _entries[id] = {...data, 'uid': uid};
    _notify(id);
    return id;
  }

  @override
  Future<void> set(String uid, String id, Map<String, dynamic> data) async {
    _entries[id] = {...data, 'uid': uid};
    _notify(id);
  }

  @override
  Future<void> update(
      String uid, String id, Map<String, dynamic> fields) async {
    final existing = _entries[id];
    if (existing == null) return;
    _entries[id] = {...existing, ...fields};
    _notify(id);
  }

  @override
  Future<void> delete(String uid, String id) async {
    _entries.remove(id);
    _controllers[id]?.add(null);
    _changes.add(null);
  }

  @override
  Future<List<FoodEntryDocument>> getRecentEntries(
      String uid, int limit) async {
    return _entries.entries
        .where((e) => e.value['status'] == 'complete' && e.value['uid'] == uid)
        .take(limit)
        .map((e) => (id: e.key, data: e.value))
        .toList();
  }

  void _notify(String id) {
    final data = _entries[id];
    final ctrl = _controllers[id];
    if (ctrl != null) {
      ctrl.add(data != null ? (id: id, data: data) : null);
    }
    _changes.add(null);
  }

  void seed(FoodEntry entry) {
    _entries[entry.id] = entry.toMap();
    _notify(entry.id);
  }

  FoodEntry? entry(String id) {
    final data = _entries[id];
    return data == null ? null : FoodEntry.fromData(id: id, data: data);
  }

  Map<String, dynamic>? rawEntryData(String id) {
    final data = _entries[id];
    return data == null ? null : Map<String, dynamic>.from(data);
  }

  List<FoodEntry> get allEntries => _entries.entries
      .map((entry) => FoodEntry.fromData(id: entry.key, data: entry.value))
      .toList(growable: false);

  void reset() {
    _entries.clear();
    _changes.add(null);
  }
}

class InMemoryMacroTargetDataStore implements MacroTargetDataStore {
  String? _activePlanId;
  final Map<String, MacroTargetPlan> _plans = {};
  final _activeWatchers = <StreamController<MacroTargetPlan?>>{};
  final _allWatchers = <StreamController<List<MacroTargetPlan>>>{};
  int updateCount = 0;
  int createAndSetCount = 0;

  MacroTargetPlan? get activePlan =>
      _activePlanId == null ? null : _plans[_activePlanId];
  int get writeCount => updateCount + createAndSetCount;

  @override
  Stream<MacroTargetPlan?> watchActivePlan(String uid) {
    late final StreamController<MacroTargetPlan?> watcher;
    watcher = StreamController<MacroTargetPlan?>(
      sync: true,
      onListen: () {
        _activeWatchers.add(watcher);
        watcher.add(activePlan);
      },
      onCancel: () => _activeWatchers.remove(watcher),
    );
    return watcher.stream;
  }

  @override
  Stream<List<MacroTargetPlan>> watchAllPlans(String uid) {
    late final StreamController<List<MacroTargetPlan>> watcher;
    watcher = StreamController<List<MacroTargetPlan>>(
      sync: true,
      onListen: () {
        _allWatchers.add(watcher);
        watcher.add(_plans.values.toList(growable: false));
      },
      onCancel: () => _allWatchers.remove(watcher),
    );
    return watcher.stream;
  }

  @override
  Future<void> updatePlan(
      String uid, String planId, Map<String, dynamic> fields) async {
    final existing = _plans[planId];
    if (existing == null) return;
    updateCount++;
    _plans[planId] = MacroTargetPlan(
      id: existing.id,
      planName: fields['planName'] as String? ?? existing.planName,
      goal: BodyGoal.values.firstWhere(
        (g) => g.name == (fields['goal'] as String? ?? existing.goal.name),
        orElse: () => existing.goal,
      ),
      startDate: existing.startDate,
      endDate: existing.endDate,
      kcal: (fields['kcal'] as num?)?.toInt() ?? existing.kcal,
      protein: (fields['protein'] as num?)?.toInt() ?? existing.protein,
      carbs: (fields['carbs'] as num?)?.toInt() ?? existing.carbs,
      fat: (fields['fat'] as num?)?.toInt() ?? existing.fat,
      isActive: fields['isActive'] as bool? ?? existing.isActive,
    );
    _notify();
  }

  @override
  Future<String> createPlan(String uid, MacroTargetPlan plan) async {
    final id = const Uuid().v4();
    _plans[id] = plan.copyWith(id: id);
    _notify();
    return id;
  }

  @override
  Future<void> setActivePlan(String uid, String planId) async {
    for (final p in _plans.values.toList()) {
      _plans[p.id] = p.copyWith(isActive: p.id == planId);
    }
    _activePlanId = planId;
    _notify();
  }

  @override
  Future<String> createAndSetActivePlan(
      String uid, MacroTargetPlan plan) async {
    createAndSetCount++;
    final id = await createPlan(uid, plan);
    await setActivePlan(uid, id);
    return id;
  }

  void seedActive(MacroTargetPlan plan) {
    _plans[plan.id] = plan.copyWith(isActive: true);
    _activePlanId = plan.id;
    _notify();
  }

  void _notify() {
    for (final watcher in _activeWatchers.toList(growable: false)) {
      watcher.add(activePlan);
    }
    final plans = _plans.values.toList(growable: false);
    for (final watcher in _allWatchers.toList(growable: false)) {
      watcher.add(plans);
    }
  }
}

class InMemoryWeightLogDataStore implements WeightLogDataStore {
  final Map<String, WeightLog> _logs = {};
  final _changes = StreamController<void>.broadcast();

  List<WeightLog> _recent(String uid, int limit) {
    final sorted = _logs.entries
        .where((e) => e.key.startsWith('$uid/'))
        .map((e) => e.value)
        .toList()
      ..sort((a, b) => a.date.compareTo(b.date));
    return sorted.length > limit
        ? sorted.sublist(sorted.length - limit)
        : sorted;
  }

  @override
  Stream<List<WeightLog>> watchRecent(String uid, int limit) async* {
    yield _recent(uid, limit);
    yield* _changes.stream.map((_) => _recent(uid, limit));
  }

  @override
  Future<void> set(String uid, WeightLog log) async {
    _logs['$uid/${log.date}'] = log;
    _changes.add(null);
  }
}

// ---------------------------------------------------------------------------
// Fake services
// ---------------------------------------------------------------------------

class FakeE2ECameraService implements CameraService {
  bool granted = true;
  bool holdCapture = false;
  int captureCount = 0;
  int libraryCount = 0;

  final List<Completer<XFile?>> _pendingCaptures = [];

  @override
  Future<bool> hasPermission() async => granted;

  @override
  Future<CameraPermissionRequestResult> requestPermission() async => granted
      ? CameraPermissionRequestResult.granted
      : CameraPermissionRequestResult.denied;

  @override
  Future<XFile?> captureStill() async {
    captureCount++;
    if (holdCapture) {
      final completer = Completer<XFile?>();
      _pendingCaptures.add(completer);
      return completer.future;
    }
    return XFile('fake_capture_$captureCount.jpg');
  }

  void completeCapture() {
    for (final completer in _pendingCaptures) {
      if (!completer.isCompleted) {
        completer.complete(XFile('fake_capture_$captureCount.jpg'));
      }
    }
    _pendingCaptures.clear();
  }

  @override
  Future<XFile?> pickFromLibrary() async {
    libraryCount++;
    return XFile('fake_library_$libraryCount.jpg');
  }
}

class FakeE2ECameraSettingsService implements CameraSettingsService {
  @override
  Future<bool> requiresSettings() async => false;

  @override
  Future<bool> openSettings() async => true;
}

class FakeE2EScanUploadGateway implements ScanUploadGateway {
  FakeE2EScanUploadGateway(this._store, this._clock);

  final InMemoryFoodEntryDataStore _store;
  final Clock _clock;
  int callCount = 0;
  bool throwOnUpload = false;
  int scheduleDrainCallCount = 0;

  @override
  Future<String> enqueue({
    required String localPath,
    required String uid,
    required String scanMode,
  }) async {
    callCount++;
    if (throwOnUpload) throw Exception('fake upload failure');
    final id = 'fake-entry-$callCount';
    final needsReview = scanMode == 'label';
    _store.seed(
      FoodEntry(
        id: id,
        uid: uid,
        timestamp: _clock.now(),
        date: _dateKey(_clock.nowTZ()),
        scanMode: scanMode,
        status: needsReview
            ? FoodEntryStatus.needsReview
            : FoodEntryStatus.complete,
        foodName: switch (scanMode) {
          'barcode' => 'Known Barcode Product',
          'label' => 'Possible Cereal',
          _ => 'Chicken Rice Bowl',
        },
        baseKcal: scanMode == 'barcode' ? 240 : 620,
        baseProtein: 42,
        baseCarbs: 68,
        baseFat: 18,
        confidence: needsReview ? 0.62 : 0.94,
        candidates: needsReview
            ? const [
                ReviewCandidate(
                  name: 'Whole Grain Cereal',
                  confidence: 0.91,
                  kcal: 210,
                  proteinG: 8,
                  carbsG: 38,
                  fatG: 4,
                ),
              ]
            : const [],
      ),
    );
    return id;
  }

  @override
  void scheduleDrain() {
    scheduleDrainCallCount++;
  }
}

class FakeE2EConnectivityMonitor implements ConnectivityMonitor {
  @override
  Future<ConnectivityState> current() async => ConnectivityState.online;

  @override
  Stream<ConnectivityState> get changes =>
      Stream.value(ConnectivityState.online);
}

class FakeE2ENotificationService implements NotificationService {
  @override
  void Function(String docId)? onNotificationTap;
  String? lastTappedDocId;

  @override
  Future<bool> requestPermission() async => true;

  @override
  Future<void> initLocalNotifications() async {}

  @override
  Future<String?> getToken() async => 'fake-fcm-token';

  @override
  Stream<String> get onTokenRefresh => const Stream.empty();

  @override
  Stream<RemoteMessage> get onMessage => const Stream.empty();

  @override
  Stream<RemoteMessage> get onMessageOpenedApp => const Stream.empty();

  @override
  Future<RemoteMessage?> getInitialMessage() async => null;

  @override
  String? docIdOf(RemoteMessage message) => message.data['entryId'] as String?;

  @override
  Future<void> showForeground(RemoteMessage message) async {}

  void simulateTap(String entryId) {
    lastTappedDocId = entryId;
    onNotificationTap?.call(entryId);
  }
}

class FakeE2ERetryAnalysisService implements RetryAnalysisService {
  int retryCount = 0;

  @override
  Future<void> retryEntryAnalysis(String entryId) async {
    retryCount++;
  }
}

class FakeE2EViewedEntryStore implements ViewedEntryStore {
  final Set<String> _viewed = {};

  void markViewedSync(String entryId) => _viewed.add(entryId);

  @override
  Future<bool> isViewed(String entryId) async => _viewed.contains(entryId);

  @override
  Future<void> markViewed(String entryId) async => _viewed.add(entryId);

  @override
  Future<List<String>> recentIds() async => _viewed.toList();
}

class FakeE2EEntryExistenceChecker implements EntryExistenceChecker {
  final Set<String> _existing = {};

  void addEntry(String id) => _existing.add(id);
  void removeEntry(String id) => _existing.remove(id);

  @override
  Future<bool> exists(String entryId) async => _existing.contains(entryId);
}

class _FakeAiThreadDataStore implements AiThreadDataStore {
  @override
  Stream<List<AiChatThread>> watchThreads(String uid) => Stream.value(const []);

  @override
  Future<AiMessagePage> loadMessages(
    String uid,
    String threadId, {
    required int limit,
    AiMessageCursor? after,
  }) async =>
      const AiMessagePage(
        messages: [],
        nextCursor: null,
        hasMore: false,
      );

  @override
  Future<List<String>> listMessageIds(
    String uid,
    String threadId,
    String collection, {
    required int limit,
  }) async =>
      const [];

  @override
  Future<void> deleteMessageBatch(
    String uid,
    String threadId,
    String collection,
    List<String> ids,
  ) async {}

  @override
  Future<void> deleteThreadDocument(String uid, String threadId) async {}
}

class FakeE2EAppSettingsStore implements AppSettingsStore {
  AppSettings _settings = const AppSettings();

  @override
  Future<AppSettings> load() async => _settings;

  @override
  Future<void> save(AppSettings settings) async => _settings = settings;
}

class FakeE2EAiChatService implements AiChatService {
  FakeE2EAiChatService({this.actionResponder});

  final AiChatServiceResponse Function(String message)? actionResponder;

  @override
  Future<AiChatServiceResponse> sendMessage({
    required String message,
    required String clientMessageId,
    String? threadId,
    String? linkedMealId,
  }) async {
    if (actionResponder != null) {
      return actionResponder!(message);
    }
    return AiChatServiceResponse(
      threadId: threadId ?? 'fake-thread-1',
      reply: 'Fake AI response to: $message',
    );
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const e2eTestUid = 'e2e-test-uid';

FakeClock makeE2EClock([DateTime? initial]) {
  final dt = initial ?? DateTime(2026, 7, 28, 10, 0);
  return FakeClock(
    tz.TZDateTime.utc(dt.year, dt.month, dt.day, dt.hour, dt.minute),
  );
}

class E2EHarness {
  E2EHarness._({
    required this.clock,
    required this.uid,
    required this.foodStore,
    required this.macroStore,
    required this.weightStore,
    required this.settingsStore,
    required this.camera,
    required this.uploadGateway,
    required this.notification,
    required this.viewedEntries,
    required this.existenceChecker,
    required this.overrides,
  });

  final FakeClock clock;
  final String uid;
  final InMemoryFoodEntryDataStore foodStore;
  final InMemoryMacroTargetDataStore macroStore;
  final InMemoryWeightLogDataStore weightStore;
  final FakeE2EAppSettingsStore settingsStore;
  final FakeE2ECameraService camera;
  final FakeE2EScanUploadGateway uploadGateway;
  final FakeE2ENotificationService notification;
  final FakeE2EViewedEntryStore viewedEntries;
  final FakeE2EEntryExistenceChecker existenceChecker;
  final List<Override> overrides;

  static Future<E2EHarness> create({
    FakeClock? clock,
    String uid = e2eTestUid,
    DateTime? accountCreated,
    AiChatServiceResponse Function(String message)? aiActionResponder,
    void Function(String entryId)? onNotificationTap,
    InMemoryFoodEntryDataStore? sharedFoodStore,
    InMemoryMacroTargetDataStore? sharedMacroStore,
    InMemoryWeightLogDataStore? sharedWeightStore,
    FakeE2EAppSettingsStore? sharedSettingsStore,
    List<DailyLog>? sharedHistoryLogs,
  }) async {
    SharedPreferences.setMockInitialValues({});
    final fakeClock = clock ?? makeE2EClock();
    final foodStore = sharedFoodStore ?? InMemoryFoodEntryDataStore();
    final macroStore = sharedMacroStore ?? InMemoryMacroTargetDataStore();
    if (sharedMacroStore == null) {
      macroStore.seedActive(
        MacroTargetPlan.defaultPlan(startDate: fakeClock.nowTZ()),
      );
    }
    final weightStore = sharedWeightStore ?? InMemoryWeightLogDataStore();
    final settingsStore = sharedSettingsStore ?? FakeE2EAppSettingsStore();
    final camera = FakeE2ECameraService();
    final uploadGateway = FakeE2EScanUploadGateway(foodStore, fakeClock);
    final notification = FakeE2ENotificationService();
    notification.onNotificationTap = onNotificationTap;
    final viewedEntries = FakeE2EViewedEntryStore();
    final existenceChecker = FakeE2EEntryExistenceChecker();
    final retryAnalysis = FakeE2ERetryAnalysisService();
    final cameraSettings = FakeE2ECameraSettingsService();
    final foodRepo = FoodEntryRepository.withStore(foodStore, fakeClock);
    final macroRepo = MacroTargetRepository.withStore(macroStore);
    final weightRepo = WeightLogRepository.withStore(weightStore, fakeClock);

    final overrides = <Override>[
      clockProvider.overrideWithValue(fakeClock),
      firebaseAuthProvider.overrideWithValue(_FakeE2EFirebaseAuth(uid)),
      currentUidProvider.overrideWithValue(uid),
      foodEntryRepositoryProvider.overrideWithValue(foodRepo),
      macroTargetRepositoryProvider.overrideWithValue(macroRepo),
      weightLogRepositoryProvider.overrideWithValue(weightRepo),
      accountCreationProvider.overrideWithValue(
        accountCreated ?? fakeClock.now(),
      ),
      historyProvider.overrideWith((ref) {
        if (sharedHistoryLogs == null) return Stream.value(<DailyLog>[]);
        final sorted = List<DailyLog>.of(sharedHistoryLogs)
          ..sort((a, b) => b.date.compareTo(a.date));
        return Stream.value(sorted.take(30).toList());
      }),
      historyRangeProvider.overrideWith(
        (ref, HistoryRange range) {
          if (sharedHistoryLogs == null) {
            return Stream.value(<DailyLog>[]);
          }
          final filtered = sharedHistoryLogs.where((log) {
            final key =
                '${log.date.year.toString().padLeft(4, '0')}-${log.date.month.toString().padLeft(2, '0')}-${log.date.day.toString().padLeft(2, '0')}';
            return range.startKey.compareTo(key) <= 0 &&
                key.compareTo(range.endExclusiveKey) < 0;
          }).toList()
            ..sort((a, b) => b.date.compareTo(a.date));
          return Stream.value(filtered);
        },
      ),
      cameraServiceProvider.overrideWithValue(camera),
      cameraSettingsServiceProvider.overrideWithValue(cameraSettings),
      cameraLifecycleServiceProvider
          .overrideWithValue(const _FakeE2ECameraLifecycle()),
      scanUploadGatewayProvider.overrideWithValue(uploadGateway),
      notificationServiceProvider.overrideWithValue(notification),
      viewedEntryStoreProvider.overrideWith((ref) async => viewedEntries),
      entryExistenceCheckerProvider.overrideWithValue(existenceChecker),
      retryAnalysisServiceProvider.overrideWithValue(retryAnalysis),
      appSettingsStoreProvider.overrideWithValue(settingsStore),
      aiChatServiceProvider.overrideWithValue(
        FakeE2EAiChatService(actionResponder: aiActionResponder),
      ),
      aiThreadRepositoryProvider.overrideWithValue(
        AiThreadRepository.withStore(_FakeAiThreadDataStore()),
      ),
      connectivityMonitorProvider
          .overrideWithValue(FakeE2EConnectivityMonitor()),
      uploadQueueServiceProvider.overrideWith(
        (ref) async => UploadQueueService(
          fakeClock,
          _MemoryKvStore(),
          _MemoryPendingDir(),
          _MemorySourceReader(),
        ),
      ),
    ];

    return E2EHarness._(
      clock: fakeClock,
      uid: uid,
      foodStore: foodStore,
      macroStore: macroStore,
      weightStore: weightStore,
      settingsStore: settingsStore,
      camera: camera,
      uploadGateway: uploadGateway,
      notification: notification,
      viewedEntries: viewedEntries,
      existenceChecker: existenceChecker,
      overrides: overrides,
    );
  }

  Future<void> pump(
    WidgetTester tester, {
    String initialLocation = '/scan',
  }) =>
      pumpAppE2E(
        tester,
        overrides: overrides,
        initialLocation: initialLocation,
      );

  void seed(FoodEntry entry) {
    foodStore.seed(entry);
    existenceChecker.addEntry(entry.id);
  }

  void markViewed(String entryId) => viewedEntries.markViewedSync(entryId);

  void wireNotificationDeepLink(WidgetTester tester) {
    notification.onNotificationTap = (docId) async {
      final context = tester.element(find.byType(MaterialApp));
      final container = ProviderScope.containerOf(context);
      final router = container.read(routerProvider);
      if (docId.isEmpty) {
        router.go('/today');
        return;
      }
      final handler = NotificationTapHandler(
        viewedEntries: viewedEntries,
        entryExists: existenceChecker,
      );
      final resolvedRoute = await handler.resolve({'entryId': docId});
      router.go(resolvedRoute);
    };
  }

  Future<void> go(WidgetTester tester, String location) async {
    final context = tester.element(find.byType(MaterialApp));
    ProviderScope.containerOf(context).read(routerProvider).go(location);
    await tester.pump();
  }

  Future<void> push(WidgetTester tester, String location) async {
    final context = tester.element(find.byType(MaterialApp));
    final router = ProviderScope.containerOf(context).read(routerProvider);
    unawaited(router.push(location));
    await tester.pump();
  }
}

Future<List<Override>> buildE2EOverrides({
  FakeClock? clock,
  String? uid,
}) async =>
    (await E2EHarness.create(clock: clock, uid: uid ?? e2eTestUid)).overrides;

/// Boots the full production app (router + screens) against in-memory fakes.
/// [initialLocation] controls which route the app opens on.
/// [overrides] should be the list from [buildE2EOverrides].
Future<void> pumpAppE2E(
  WidgetTester tester, {
  List<Override> overrides = const [],
  String initialLocation = '/scan',
}) async {
  final routerOverride = routerProvider.overrideWith((ref) {
    final auth = ref.watch(firebaseAuthProvider);
    final refresh = _E2EAuthRefresh(auth.authStateChanges());
    ref.onDispose(refresh.dispose);

    return GoRouter(
      navigatorKey: rootNavigatorKey,
      initialLocation: initialLocation,
      refreshListenable: refresh,
      redirect: (context, state) {
        final loc = state.uri.toString();
        if (loc.startsWith('/debug/reseed')) return null;
        final signedIn = auth.currentUser != null;
        final onOnboarding =
            loc.startsWith('/loading') || loc.startsWith('/login');
        if (!signedIn && !onOnboarding) return '/login';
        if (signedIn && loc.startsWith('/login')) return '/scan';
        return null;
      },
      routes: [
        GoRoute(
          path: '/loading',
          name: 'loading',
          builder: (context, state) => const LoadingScreen(),
        ),
        GoRoute(
          path: '/login',
          name: 'login',
          builder: (context, state) => const LoginScreen(),
        ),
        StatefulShellRoute(
          builder: (context, state, navigationShell) =>
              AppShell(navigationShell: navigationShell),
          navigatorContainerBuilder: (context, navigationShell, children) =>
              TabSwipeShell(shell: navigationShell, children: children),
          branches: [
            StatefulShellBranch(routes: [
              GoRoute(
                path: '/today',
                name: 'today',
                builder: (context, state) => const TodayScreen(),
                routes: [
                  GoRoute(
                    path: 'food/:id',
                    name: 'foodDetail',
                    builder: (context, state) =>
                        FoodDetailSheet(entryId: state.pathParameters['id']!),
                  ),
                ],
              ),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: '/history',
                name: 'history',
                builder: (context, state) => const HistoryScreen(),
              ),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: '/scan',
                name: 'scan',
                builder: (context, state) => const ScanScreen(),
              ),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: '/goals',
                name: 'goals',
                builder: (context, state) => const GoalsScreen(),
              ),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: '/ai',
                name: 'aiChat',
                builder: (context, state) => const AiChatScreen(),
              ),
            ]),
          ],
        ),
        GoRoute(
          path: '/processing/:id',
          name: 'processing',
          parentNavigatorKey: rootNavigatorKey,
          builder: (context, state) =>
              ProcessingScreen(entryId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/review/:id',
          name: 'review',
          parentNavigatorKey: rootNavigatorKey,
          builder: (context, state) =>
              ReviewScreen(entryId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/manual',
          name: 'manual',
          parentNavigatorKey: rootNavigatorKey,
          builder: (context, state) => const ManualEntryScreen(),
        ),
        GoRoute(
          path: '/profile',
          name: 'profile',
          parentNavigatorKey: rootNavigatorKey,
          builder: (context, state) => const ProfileSheet(),
        ),
        GoRoute(
          path: '/assistant',
          name: 'aiChatOverlay',
          parentNavigatorKey: rootNavigatorKey,
          builder: (context, state) => AiChatScreen(
            preloadedMealId: state.uri.queryParameters['mealId'],
          ),
        ),
        GoRoute(
          path: '/permission',
          name: 'permission',
          parentNavigatorKey: rootNavigatorKey,
          builder: (context, state) => const ScanScreen(),
        ),
      ],
    );
  });

  await tester.pumpWidget(
    ProviderScope(
      overrides: [...overrides, routerOverride],
      child: const _E2EApp(),
    ),
  );

  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

/// Simulates a notification tap through the harness.
void simulateNotificationTap(WidgetTester tester, String entryId) {
  final ctx = tester.element(find.byType(MaterialApp));
  final container = ProviderScope.containerOf(ctx);
  final notification = container.read(notificationServiceProvider);
  if (notification is FakeE2ENotificationService) {
    notification.simulateTap(entryId);
  }
}

// ---------------------------------------------------------------------------
// Fakes that satisfy the production provider contracts
// ---------------------------------------------------------------------------

class _FakeE2EFirebaseAuth extends Fake implements FirebaseAuth {
  _FakeE2EFirebaseAuth(this._uid);
  final String _uid;

  @override
  User? get currentUser => _FakeE2EUser(_uid);

  @override
  Stream<User?> authStateChanges() => Stream.value(_FakeE2EUser(_uid));

  @override
  noSuchMethod(Invocation invocation) => throw UnimplementedError(
      'FakeE2EFirebaseAuth: ${invocation.memberName} not implemented');
}

class _FakeE2EUser extends Fake implements User {
  _FakeE2EUser(this._uid);
  final String _uid;

  @override
  String get uid => _uid;

  @override
  bool get isAnonymous => false;

  @override
  String? get displayName => 'E2E User';

  @override
  String? get email => 'e2e@example.test';
}

class _FakeE2ECameraLifecycle implements CameraLifecycleService {
  const _FakeE2ECameraLifecycle();

  @override
  Future<void> pause() async {}

  @override
  Future<void> resume() async {}

  @override
  Future<void> dispose() async {}
}

class _MemoryKvStore implements KvStore {
  final _values = <String, String>{};

  @override
  String? read(String key) => _values[key];

  @override
  Future<void> remove(String key) async => _values.remove(key);

  @override
  Future<void> write(String key, String value) async => _values[key] = value;
}

class _MemoryPendingDir implements PendingDir {
  final _files = <String, List<int>>{};

  @override
  Future<void> delete(String queueId) async => _files.remove(queueId);

  @override
  bool fileExists(String queueId) => _files.containsKey(queueId);

  @override
  String pathFor(String queueId) => 'memory://$queueId.jpg';

  @override
  Future<void> writeBytes(String queueId, List<int> bytes) async {
    _files[queueId] = List.of(bytes);
  }
}

class _MemorySourceReader implements SourceReader {
  @override
  Future<List<int>> readAsBytes(String path) async => const [1, 2, 3];
}

// ---------------------------------------------------------------------------
// Auth refresh helper (mirrors production _AuthRefresh)
// ---------------------------------------------------------------------------

class _E2EAuthRefresh extends ChangeNotifier {
  late final StreamSubscription<dynamic> _sub;
  _E2EAuthRefresh(Stream<dynamic> stream) {
    _sub = stream.listen((_) => notifyListeners());
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

class _E2EApp extends ConsumerWidget {
  const _E2EApp();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      routerConfig: ref.watch(routerProvider),
    );
  }
}

// ---------------------------------------------------------------------------
// Router navigator key (mirrors production)
// ---------------------------------------------------------------------------

final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'e2e-root');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

FoodEntry makeFixtureEntry({
  String id = 'fixture-entry-1',
  String? foodName,
  double? baseKcal,
  double? baseProtein,
  double? baseCarbs,
  double? baseFat,
  FoodEntryStatus status = FoodEntryStatus.complete,
  double confidence = 0.92,
  MealType mealType = MealType.lunch,
  String scanMode = 'meal',
  List<ReviewCandidate> candidates = const [],
  DateTime? timestamp,
  tz.TZDateTime? nowTZ,
}) {
  final ts = timestamp ?? DateTime(2026, 7, 28, 12, 0);
  final tzNow = nowTZ ?? tz.TZDateTime.utc(2026, 7, 28, 12, 0);
  return FoodEntry(
    id: id,
    uid: e2eTestUid,
    timestamp: ts,
    date: _dateKey(tzNow),
    scanMode: scanMode,
    status: status,
    foodName: foodName ?? 'Test Food',
    baseKcal: baseKcal ?? 620,
    baseProtein: baseProtein ?? 42,
    baseCarbs: baseCarbs ?? 68,
    baseFat: baseFat ?? 18,
    confidence: confidence,
    candidates: candidates,
    mealType: mealType,
  );
}

String dateKey(tz.TZDateTime dt) =>
    '${dt.year.toString().padLeft(4, '0')}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';

String _dateKey(tz.TZDateTime dt) => dateKey(dt);
