import 'dart:async';

import 'package:camera/camera.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timezone/timezone.dart' as tz;

import '../core/time/clock.dart';
import '../core/time/clock_provider.dart';
import '../features/ai_chat/ai_chat_screen.dart';
import '../features/ai_chat/ai_history_screen.dart';
import '../features/ai_chat/providers/ai_chat_providers.dart';
import '../features/food_detail/food_detail_sheet.dart';
import '../features/food_detail/providers/food_detail_providers.dart';
import '../features/goals/goals_screen.dart';
import '../features/goals/providers/goals_providers.dart';
import '../features/history/history_screen.dart';
import '../features/history/providers/history_providers.dart';
import '../features/manual/manual_entry_screen.dart';
import '../features/onboarding/loading_screen.dart';
import '../features/onboarding/login_screen.dart';
import '../features/processing/processing_screen.dart';
import '../features/processing/providers/processing_providers.dart';
import '../features/profile/profile_sheet.dart';
import '../features/review/providers/review_providers.dart';
import '../features/review/review_screen.dart';
import '../features/scan/permission_screen.dart';
import '../features/scan/providers/scan_providers.dart';
import '../features/scan/scan_screen.dart';
import '../features/today/today_screen.dart';
import '../features/today/providers/today_providers.dart';
import '../shell/app_shell.dart';
import '../shared/models/ai_chat_thread.dart';
import '../shared/models/app_settings.dart';
import '../shared/models/daily_log.dart';
import '../shared/models/food_entry.dart';
import '../shared/models/macro_target_plan.dart';
import '../shared/models/processing_state.dart';
import '../shared/providers/auth_provider.dart';
import '../shared/providers/notification_provider.dart';
import '../shared/providers/settings_provider.dart';
import '../shared/providers/ui_diff_provider.dart';
import '../shared/providers/viewed_entry_store.dart';
import '../shared/services/camera_service.dart';
import '../shared/services/camera_settings_service.dart';
import 'debug_deep_links.dart';
import 'ui_diff/ui_diff_anchor.dart';
import 'ui_diff_fixture.dart';

/// Debug-only adapter that renders production widgets from an in-memory
/// fixture manifest. It never initializes hardware or consults repositories.
class DebugCaptureScreen extends ConsumerStatefulWidget {
  const DebugCaptureScreen({
    super.key,
    required this.targetId,
    this.readinessTimeout = const Duration(seconds: 5),
  });

  final String targetId;
  final Duration readinessTimeout;

  @override
  ConsumerState<DebugCaptureScreen> createState() => _DebugCaptureScreenState();
}

class _DebugCaptureScreenState extends ConsumerState<DebugCaptureScreen> {
  String? _blockedReason;
  bool _signalEmitted = false;
  bool _validated = false;
  ProviderContainer? _fixtureContainer;
  String? _fixtureContainerHash;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _verifyTarget());
  }

  @override
  void didUpdateWidget(covariant DebugCaptureScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.targetId == widget.targetId) return;
    _fixtureContainer?.dispose();
    _fixtureContainer = null;
    _fixtureContainerHash = null;
    _blockedReason = null;
    _signalEmitted = false;
    _validated = false;
    WidgetsBinding.instance.addPostFrameCallback((_) => _verifyTarget());
  }

  void _verifyTarget() {
    final target = kDebugScreenTargets[widget.targetId];
    final manifest = ref.read(uiDiffFixtureManifestProvider);
    if (target == null) {
      _block('unknown_target');
      return;
    }
    if (manifest == null) {
      _block('fixture_missing');
      return;
    }
    if (manifest.profile != target.fixtureProfile) {
      _block('fixture_profile_mismatch');
      return;
    }

    if (mounted) setState(() => _validated = true);
  }

  void _signalReady() {
    if (!mounted || _signalEmitted) return;
    final pendingSignal = ref.read(uiDiffPendingCaptureSignalProvider);
    if (pendingSignal == null || pendingSignal.screenId != widget.targetId) {
      return;
    }
    _signalEmitted = true;
    debugPrint(pendingSignal.line);
    ref.read(uiDiffPendingCaptureSignalProvider.notifier).state = null;
  }

  void _block(String reason) {
    if (!mounted || _signalEmitted) return;
    final pendingSignal = ref.read(uiDiffPendingCaptureSignalProvider);
    final nonce = pendingSignal?.nonce ?? 'capture';
    _signalEmitted = true;
    setState(() => _blockedReason = reason);
    debugPrint(
      UiDiffCaptureSignal.blocked(
        nonce: nonce,
        screenId: widget.targetId,
        reason: reason,
      ).line,
    );
    if (pendingSignal != null) {
      ref.read(uiDiffPendingCaptureSignalProvider.notifier).state = null;
    }
  }

  ProviderContainer _containerFor(UiDiffFixtureManifest manifest) {
    final containerHash = '${manifest.fixtureHash}:${widget.targetId}';
    if (_fixtureContainerHash == containerHash) {
      return _fixtureContainer!;
    }
    _fixtureContainer?.dispose();
    _fixtureContainerHash = containerHash;
    return _fixtureContainer = ProviderContainer(
      overrides: _fixtureOverrides(manifest),
    );
  }

  @override
  void dispose() {
    _fixtureContainer?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reason = _blockedReason;
    if (reason != null) return _BlockedCapture(reason: reason);

    final target = kDebugScreenTargets[widget.targetId];
    final manifest = ref.watch(uiDiffFixtureManifestProvider);
    if (target == null || manifest == null || !_validated) {
      return const SizedBox.shrink();
    }

    return UncontrolledProviderScope(
      container: _containerFor(manifest),
      child: MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: true),
        child: _CaptureReadinessGate(
          targetId: widget.targetId,
          onReady: _signalReady,
          onBlocked: _block,
          timeout: widget.readinessTimeout,
          child: _buildTarget(manifest),
        ),
      ),
    );
  }

  Widget _buildTarget(UiDiffFixtureManifest manifest) {
    switch (widget.targetId) {
      case 'loading':
        return const LoadingScreen(
          navigateWhenReady: false,
          freezeForCapture: true,
        );
      case 'login':
        return const LoginScreen(
          initialEmail: 'elias@example.com',
          initialPassword: 'fixture-pass',
          initialStaySignedIn: true,
        );
      case 'permission':
        return PermissionScreen(
          onOpenSettings: () async {},
          onAddManually: () {},
          showFixtureSystemPrompt: true,
          fixtureBackgroundAsset:
              'assets/images/chicken_rice_bowl_highformat.jpg',
        );
      case 'scan_idle':
        return _withMainShell(
          index: 2,
          child: const ScanScreen(
            initializeCamera: false,
            initialCaptureState: CaptureState.idle,
            fixturePreviewAsset:
                'assets/images/chicken_rice_bowl_highformat.jpg',
          ),
        );
      case 'scan_capturing':
        return _withMainShell(
          index: 2,
          child: const ScanScreen(
            initializeCamera: false,
            initialCaptureState: CaptureState.capturing,
            fixturePreviewAsset:
                'assets/images/chicken_rice_bowl_highformat.jpg',
          ),
        );
      case 'processing':
        final entry = _entryById(manifest, 'ui_diff_fixture_processing_entry');
        return entry == null
            ? const _BlockedCapture(reason: 'no_processing_entry')
            : _withMainShell(
                index: 2,
                child: ProcessingScreen(
                  entryId: entry.id,
                  fixtureBackgroundAsset:
                      'assets/images/chicken_rice_bowl_highformat.jpg',
                ),
              );
      case 'review':
        final entry = _entryById(manifest, 'ui_diff_fixture_review_food');
        return entry == null
            ? const _BlockedCapture(reason: 'no_review_entry')
            : ReviewScreen(
                entryId: entry.id,
                fixtureImageAsset:
                    'assets/images/chicken_rice_bowl_highformat.jpg',
              );
      case 'manual':
        return _withMainShell(index: 0, child: const ManualEntryScreen());
      case 'today':
      case 'today_empty':
        return _withMainShell(index: 0, child: const TodayScreen());
      case 'food':
      case 'food_edit':
        final entry = _entryById(manifest, 'ui_diff_fixture_today_chicken');
        if (entry == null) {
          return const _BlockedCapture(reason: 'no_food_entry');
        }
        return _withMainShell(
          index: 0,
          child: ProviderScope(
            overrides: [
              foodEntryProvider(entry.id)
                  .overrideWith((_) => Stream.value(entry)),
              foodEditModeProvider(entry.id)
                  .overrideWith((_) => widget.targetId == 'food_edit'),
            ],
            child: FoodDetailSheet(entryId: entry.id),
          ),
        );
      case 'history_week':
        return _withMainShell(index: 1, child: const HistoryScreen());
      case 'history_month':
        return _withMainShell(
          index: 1,
          child: const HistoryScreen(initialMonthView: true),
        );
      case 'goals':
        return _withMainShell(index: 3, child: const GoalsScreen());
      case 'goals_select':
        return _withMainShell(
          index: 3,
          child: const GoalsScreen(initialPeriodOpen: true),
        );
      case 'ai':
        return _withMainShell(
          index: 4,
          child: const AiChatScreen(
            canPopOverride: false,
            preserveInitialMessages: true,
          ),
        );
      case 'ai_history':
        return _withMainShell(index: 4, child: const AiHistoryScreen());
      case 'profile':
        return _withMainShell(
          index: 0,
          child: const ProfileSheet(
            displayIdentity: ProfileDisplayIdentity(
              displayName: 'Elias Karlsson',
              email: 'elias@example.com',
            ),
          ),
        );
    }
    return const _BlockedCapture(reason: 'unrenderable');
  }

  Widget _withMainShell({required int index, required Widget child}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      extendBody: true,
      body: child,
      bottomNavigationBar: UiDiffAnchor(
        id: 'today.bottomNav',
        label: 'Bottom navigation bar',
        child: CalorixBottomNav(
          currentIndex: index,
          onTap: (_) {},
          isDark: isDark,
          floating: index == 2,
        ),
      ),
    );
  }
}

List<Override> _fixtureOverrides(UiDiffFixtureManifest manifest) {
  final plan = _activePlan(manifest);
  final history = _historyLogs(manifest);
  final weights = _weightLogs(manifest);
  final threads = _chatThreads(manifest);
  final clock = FakeClock(_fixtureNow(manifest));
  final messages = _chatMessages(manifest);
  final fixturePlan =
      plan ?? MacroTargetPlan.defaultPlan(startDate: clock.nowTZ());
  final processingEntry =
      _entryById(manifest, 'ui_diff_fixture_processing_entry');
  final reviewEntry = _entryById(manifest, 'ui_diff_fixture_review_food');
  final foodEntry = _entryById(manifest, 'ui_diff_fixture_today_chicken');

  return [
    uiDiffModeProvider.overrideWith((_) => true),
    uiDiffFixtureEnabledProvider.overrideWith((_) => true),
    uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
    clockProvider.overrideWithValue(clock),
    authStateProvider.overrideWith((_) => Stream<User?>.value(null)),
    activePlanProvider.overrideWith((_) => Stream.value(plan)),
    goalsDraftProvider.overrideWith((_) => GoalsDraftNotifier(fixturePlan)),
    historyProvider.overrideWith((_) => Stream.value(history)),
    historyRangeProvider.overrideWith(
      (_, range) => Stream.value(
        history
            .where(
              (log) =>
                  !log.date.isBefore(range.start) &&
                  log.date.isBefore(range.endExclusive),
            )
            .toList(growable: false),
      ),
    ),
    accountCreationProvider.overrideWithValue(
      history.isEmpty ? null : history.last.date,
    ),
    weightLogsProvider.overrideWith((_) => Stream.value(weights)),
    aiThreadsProvider.overrideWith((_) => Stream.value(threads)),
    chatMessagesProvider.overrideWith((_) {
      final notifier = ChatMessagesNotifier(clock);
      notifier.loadInitial(messages);
      return notifier;
    }),
    appSettingsStoreProvider.overrideWithValue(
      const _FixtureSettingsStore(),
    ),
    viewedEntryStoreProvider.overrideWith(
      (_) async => _MemoryViewedEntryStore(),
    ),
    cameraServiceProvider.overrideWithValue(_FakeCameraService()),
    cameraSettingsServiceProvider.overrideWithValue(
      const _FakeCameraSettingsService(),
    ),
    cameraLifecycleServiceProvider.overrideWithValue(
      _FakeCameraLifecycleService(),
    ),
    if (processingEntry != null) ...[
      processingEntryProvider(processingEntry.id)
          .overrideWith((_) => Stream.value(processingEntry)),
      processingStateProvider(processingEntry.id).overrideWithValue(
        const AsyncData(
          ProcessingState(phase: ProcessingPhase.firestorePending),
        ),
      ),
    ],
    if (reviewEntry != null)
      reviewEntryProvider(reviewEntry.id)
          .overrideWith((_) => Stream.value(reviewEntry)),
    if (foodEntry != null)
      foodEntryProvider(foodEntry.id)
          .overrideWith((_) => Stream.value(foodEntry)),
  ];
}

class _CaptureReadinessGate extends ConsumerStatefulWidget {
  const _CaptureReadinessGate({
    required this.targetId,
    required this.onReady,
    required this.onBlocked,
    required this.timeout,
    required this.child,
  });

  final String targetId;
  final VoidCallback onReady;
  final ValueChanged<String> onBlocked;
  final Duration timeout;
  final Widget child;

  @override
  ConsumerState<_CaptureReadinessGate> createState() =>
      _CaptureReadinessGateState();
}

class _CaptureReadinessGateState extends ConsumerState<_CaptureReadinessGate> {
  bool _scheduled = false;
  bool _profileHydrated = false;
  Future<void>? _profileHydration;
  Timer? _watchdog;
  String _missingSemantic = 'semantic_not_rendered';

  @override
  void initState() {
    super.initState();
    _watchdog = Timer(widget.timeout, () {
      if (!mounted || _scheduled) return;
      widget.onBlocked(
        'semantic_timeout_${widget.targetId}_$_missingSemantic',
      );
    });
  }

  @override
  void dispose() {
    _watchdog?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.targetId == 'profile' && _profileHydration == null) {
      _profileHydration =
          ref.read(settingsProvider.notifier).hydrated.then((_) {
        if (mounted) setState(() => _profileHydrated = true);
      });
    }
    final missingSemantic = _missingSemanticReason();
    _missingSemantic = missingSemantic ?? '';
    final ready = missingSemantic == null;
    if (ready && !_scheduled) {
      _scheduled = true;
      _watchdog?.cancel();
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        for (var frame = 0; frame < 2; frame++) {
          WidgetsBinding.instance.scheduleFrame();
          await WidgetsBinding.instance.endOfFrame;
        }
        if (mounted) widget.onReady();
      });
    }
    return widget.child;
  }

  String? _missingSemanticReason() {
    switch (widget.targetId) {
      case 'processing':
        const id = 'ui_diff_fixture_processing_entry';
        if (!ref.watch(processingEntryProvider(id)).hasValue) {
          return 'processing_entry';
        }
        if (!ref.watch(processingStateProvider(id)).hasValue) {
          return 'processing_state';
        }
        return null;
      case 'review':
        const id = 'ui_diff_fixture_review_food';
        final entry = ref.watch(reviewEntryProvider(id)).valueOrNull;
        return entry != null && entry.candidates.isNotEmpty
            ? null
            : 'review_candidates';
      case 'today':
      case 'today_empty':
        if (!ref.watch(todayEntriesProvider).hasValue) {
          return 'today_entries';
        }
        if (!ref.watch(activePlanProvider).hasValue) {
          return 'today_plan';
        }
        return null;
      case 'food':
      case 'food_edit':
        return ref
                .watch(foodEntryProvider('ui_diff_fixture_today_chicken'))
                .hasValue
            ? null
            : 'food_entry';
      case 'history_week':
      case 'history_month':
        return ref.watch(historyProvider).hasValue ? null : 'history_rows';
      case 'goals':
      case 'goals_select':
        final plan = ref.watch(activePlanProvider).valueOrNull;
        final draft = ref.watch(goalsDraftProvider);
        if (plan == null) return 'plan';
        if (!ref.watch(weightLogsProvider).hasValue) {
          return 'weights';
        }
        if (draft.kcal != plan.kcal || draft.protein != plan.protein) {
          return 'draft';
        }
        return null;
      case 'ai':
        return ref.watch(chatMessagesProvider).length >= 4
            ? null
            : 'ai_messages';
      case 'ai_history':
        return ref.watch(aiThreadsProvider).hasValue ? null : 'ai_threads';
      case 'profile':
        return _profileHydrated ? null : 'profile_settings';
      case 'loading':
      case 'login':
      case 'permission':
      case 'scan_idle':
      case 'scan_capturing':
      case 'manual':
        return null;
    }
    return 'unknown_target';
  }
}

FoodEntry? _entryById(UiDiffFixtureManifest manifest, String id) {
  for (final entry in manifest.documents.entries) {
    if (entry.key.endsWith('/entries/$id')) {
      return FoodEntry.fromData(
        id: id,
        data: Map<String, dynamic>.from(entry.value),
      );
    }
  }
  return null;
}

MacroTargetPlan? _activePlan(UiDiffFixtureManifest manifest) {
  for (final entry in manifest.documents.entries) {
    if (!entry.key.contains('/targets/')) continue;
    final data = entry.value;
    final startDate = data['startDate'];
    return MacroTargetPlan(
      id: entry.key.split('/').last,
      planName: data['planName'] as String? ?? 'Cut Phase',
      goal: BodyGoal.values.firstWhere(
        (goal) => goal.name == data['goal'],
        orElse: () => BodyGoal.loseFat,
      ),
      startDate: startDate is DateTime ? startDate : _fixtureNow(manifest),
      endDate: data['endDate'] as DateTime?,
      kcal: (data['kcal'] as num?)?.round() ?? 2400,
      protein: (data['protein'] as num?)?.round() ?? 170,
      carbs: (data['carbs'] as num?)?.round() ?? 250,
      fat: (data['fat'] as num?)?.round() ?? 70,
      isActive: data['isActive'] as bool? ?? true,
    );
  }
  return null;
}

List<DailyLog> _historyLogs(UiDiffFixtureManifest manifest) {
  final logs = <DailyLog>[];
  for (final entry in manifest.documents.entries) {
    if (!entry.key.contains('/entries/ui_diff_fixture_history_')) continue;
    final data = entry.value;
    final date = DateTime.parse(data['date'] as String);
    logs.add(
      DailyLog(
        id: data['date'] as String,
        kcal: (data['baseKcal'] as num?)?.toDouble() ?? 0,
        protein: (data['baseProtein'] as num?)?.toDouble() ?? 0,
        carbs: (data['baseCarbs'] as num?)?.toDouble() ?? 0,
        fat: (data['baseFat'] as num?)?.toDouble() ?? 0,
        entryCount: (data['entryCount'] as num?)?.round() ?? 1,
        date: date,
      ),
    );
  }
  logs.sort((a, b) => b.date.compareTo(a.date));
  return logs;
}

List<WeightLog> _weightLogs(UiDiffFixtureManifest manifest) {
  final logs = <WeightLog>[];
  for (final entry in manifest.documents.entries) {
    if (!entry.key.contains('/weightLogs/')) continue;
    final data = entry.value;
    logs.add(
      WeightLog(
        date: data['date'] as String,
        weight: (data['weight'] as num).toDouble(),
      ),
    );
  }
  logs.sort((a, b) => a.date.compareTo(b.date));
  return logs;
}

List<AiChatThread> _chatThreads(UiDiffFixtureManifest manifest) {
  final threads = <AiChatThread>[];
  for (final entry in manifest.documents.entries) {
    final parts = entry.key.split('/');
    if (parts.length != 4 || parts[2] != 'aiThreads') continue;
    threads.add(
      AiChatThread.fromMap(
        entry.value['uid'] as String? ?? 'ui-diff-local',
        parts.last,
        Map<String, dynamic>.from(entry.value),
      ),
    );
  }
  threads.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  return threads;
}

List<AiChatMessage> _chatMessages(UiDiffFixtureManifest manifest) {
  final messages = <AiChatMessage>[];
  for (final entry in manifest.documents.entries) {
    if (!entry.key.contains('/aiThreads/') ||
        !entry.key.contains('/messages/')) {
      continue;
    }
    messages.add(
      AiChatMessage.fromMap(
        entry.key.split('/').last,
        Map<String, dynamic>.from(entry.value),
      ),
    );
  }
  messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
  return messages;
}

tz.TZDateTime _fixtureNow(UiDiffFixtureManifest manifest) {
  DateTime? latest;
  for (final document in manifest.documents.values) {
    for (final key in const ['timestamp', 'updatedAt', 'createdAt']) {
      final value = document[key];
      if (value is DateTime && (latest == null || value.isAfter(latest))) {
        latest = value;
      }
    }
  }
  return tz.TZDateTime.from(
    latest ?? DateTime.utc(2026, 7, 18, 10, 30),
    tz.UTC,
  );
}

class _BlockedCapture extends StatelessWidget {
  const _BlockedCapture({required this.reason});

  final String reason;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: const Color(0xFF0E1117),
        body: Center(
          child: Text(
            'Capture target blocked: $reason',
            style: const TextStyle(color: Colors.white),
          ),
        ),
      );
}

class _FixtureSettingsStore implements AppSettingsStore {
  const _FixtureSettingsStore();

  @override
  Future<AppSettings> load() async => const AppSettings();

  @override
  Future<void> save(AppSettings settings) async {}
}

class _MemoryViewedEntryStore implements ViewedEntryStore {
  final Set<String> _viewed = {};

  @override
  Future<bool> isViewed(String entryId) async => _viewed.contains(entryId);

  @override
  Future<void> markViewed(String entryId) async {
    _viewed.add(entryId);
  }

  @override
  Future<List<String>> recentIds() async => _viewed.toList(growable: false);
}

class _FakeCameraService implements CameraService {
  @override
  Future<bool> hasPermission() async => true;

  @override
  Future<CameraPermissionRequestResult> requestPermission() async =>
      CameraPermissionRequestResult.granted;

  @override
  Future<XFile?> captureStill() async => null;

  @override
  Future<XFile?> pickFromLibrary() async => null;
}

class _FakeCameraSettingsService implements CameraSettingsService {
  const _FakeCameraSettingsService();

  @override
  Future<bool> requiresSettings() async => false;

  @override
  Future<bool> openSettings() async => false;
}

class _FakeCameraLifecycleService implements CameraLifecycleService {
  @override
  Future<void> pause() async {}

  @override
  Future<void> resume() async {}

  @override
  Future<void> dispose() async {}
}
