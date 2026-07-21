import 'package:calorix/features/processing/processing_screen.dart';
import 'package:calorix/features/processing/providers/processing_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/processing_state.dart';
import 'package:calorix/shared/services/retry_analysis_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

class _RetryService implements RetryAnalysisService {
  int calls = 0;
  String? entryId;

  @override
  Future<void> retryEntryAnalysis(String entryId) async {
    calls++;
    this.entryId = entryId;
  }
}

FoodEntry _entry({FoodEntryStatus status = FoodEntryStatus.complete}) =>
    FoodEntry(
      id: 'e1',
      uid: 'u1',
      timestamp: DateTime(2026, 7, 22),
      date: '2026-07-22',
      scanMode: 'meal',
      status: status,
      foodName: 'Pasta bowl',
      kcal: 540,
      protein: 28,
      carbs: 65,
      fat: 18,
    );

Future<GoRouter> _pumpScreen(
  WidgetTester tester, {
  required ProcessingState state,
  FoodEntry? entry,
  RetryAnalysisService? retryService,
  bool reducedMotion = false,
}) async {
  final router = GoRouter(
    initialLocation: '/processing/e1',
    routes: [
      GoRoute(
        path: '/processing/:id',
        builder: (_, route) => ProcessingScreen(
          entryId: route.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/today',
        name: 'today',
        builder: (_, __) => const Scaffold(body: Text('Today destination')),
      ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        processingStateProvider('e1').overrideWithValue(AsyncData(state)),
        processingEntryProvider('e1').overrideWith(
          (ref) => entry == null ? const Stream.empty() : Stream.value(entry),
        ),
        if (retryService != null)
          retryAnalysisServiceProvider.overrideWithValue(retryService),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            disableAnimations: reducedMotion,
          ),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pump();
  return router;
}

void main() {
  testWidgets('processing renders close-app banner and skeleton',
      (tester) async {
    await _pumpScreen(
      tester,
      state: const ProcessingState(
        phase: ProcessingPhase.firestoreProcessing,
      ),
    );

    expect(find.text('You can close the app'), findsOneWidget);
    expect(find.byKey(const ValueKey('processing-skeleton')), findsOneWidget);
  });

  testWidgets('banner navigates back to Today', (tester) async {
    final router = await _pumpScreen(
      tester,
      state: const ProcessingState(
        phase: ProcessingPhase.firestorePending,
      ),
    );

    await tester.tap(find.text('You can close the app'));
    await tester.pumpAndSettle();

    expect(router.state.uri.path, '/today');
    expect(find.text('Today destination'), findsOneWidget);
  });

  testWidgets('complete state renders result details and macro bars',
      (tester) async {
    await _pumpScreen(
      tester,
      state: const ProcessingState(
        phase: ProcessingPhase.firestoreComplete,
      ),
      entry: _entry(),
    );
    await tester.pump();

    expect(
        find.byKey(const ValueKey('processing-complete-card')), findsOneWidget);
    expect(find.text('Pasta bowl'), findsOneWidget);
    expect(find.text('540 kcal'), findsOneWidget);
    expect(find.text('Protein'), findsOneWidget);
    expect(find.text('Carbs'), findsOneWidget);
    expect(find.text('Fat'), findsOneWidget);
    expect(find.text('View in Today'), findsOneWidget);
  });

  testWidgets('remote error retry calls the retry service with the same entry',
      (tester) async {
    final retry = _RetryService();
    await _pumpScreen(
      tester,
      state: const ProcessingState(
        phase: ProcessingPhase.firestoreError,
        errorMessage: 'Remote analysis failed',
      ),
      entry: _entry(status: FoodEntryStatus.error),
      retryService: retry,
    );

    expect(find.text('Remote analysis failed'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('processing-retry-button')));
    await tester.pump();

    expect(retry.calls, 1);
    expect(retry.entryId, 'e1');
  });

  testWidgets('reduced motion makes result transition instantaneous',
      (tester) async {
    await _pumpScreen(
      tester,
      state: const ProcessingState(
        phase: ProcessingPhase.firestoreComplete,
      ),
      entry: _entry(),
      reducedMotion: true,
    );

    final switcher = tester.widget<AnimatedSwitcher>(
      find.byType(AnimatedSwitcher).first,
    );
    expect(switcher.duration, Duration.zero);
  });
}
