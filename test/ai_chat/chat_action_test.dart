import 'dart:async';

import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/providers/plan_provider.dart';
import 'package:calorix/shared/repositories/macro_target_repository.dart';
import 'package:calorix/shared/services/ai_chat_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

class _ActionService implements AiChatService {
  @override
  Future<AiChatServiceResponse> sendMessage({
    required String message,
    required String clientMessageId,
    String? threadId,
    String? linkedMealId,
  }) async =>
      const AiChatServiceResponse(
        threadId: 'thread-1',
        reply: 'I can raise your protein target.',
        action: AiChatServiceAction(
          field: 'Protein',
          macro: 'protein',
          oldValue: 170,
          newValue: 190,
        ),
      );
}

class _PlanStore implements MacroTargetDataStore {
  int updateCount = 0;
  final updateCompleter = Completer<void>();

  @override
  Future<void> updatePlan(
    String uid,
    String planId,
    Map<String, dynamic> fields,
  ) {
    updateCount++;
    return updateCompleter.future;
  }

  @override
  Stream<MacroTargetPlan?> watchActivePlan(String uid) => const Stream.empty();

  @override
  Stream<List<MacroTargetPlan>> watchAllPlans(String uid) =>
      const Stream.empty();

  @override
  Future<String> createPlan(String uid, MacroTargetPlan plan) =>
      throw UnimplementedError();

  @override
  Future<void> setActivePlan(String uid, String planId) =>
      throw UnimplementedError();

  @override
  Future<String> createAndSetActivePlan(
    String uid,
    MacroTargetPlan plan,
  ) =>
      throw UnimplementedError();
}

MacroTargetPlan _plan() => MacroTargetPlan(
      id: 'plan-1',
      planName: 'Plan',
      goal: BodyGoal.maintain,
      startDate: DateTime.utc(2026, 7, 27),
      kcal: 2400,
      protein: 170,
      carbs: 250,
      fat: 70,
      isActive: true,
    );

Widget _app(_PlanStore store) {
  final router = GoRouter(
    initialLocation: RoutePaths.aiChat,
    routes: [
      GoRoute(
        path: RoutePaths.aiChat,
        name: RouteNames.aiChat,
        builder: (_, __) => const AiChatScreen(),
      ),
      GoRoute(
        path: RoutePaths.scan,
        name: RouteNames.scan,
        builder: (_, __) => const Scaffold(body: Text('Scan')),
      ),
      GoRoute(
        path: RoutePaths.aiHistory,
        name: RouteNames.aiHistory,
        builder: (_, __) => const Scaffold(body: Text('History')),
      ),
    ],
  );
  return ProviderScope(
    overrides: [
      aiChatServiceProvider.overrideWithValue(_ActionService()),
      currentUidProvider.overrideWithValue('user-1'),
      activePlanProvider.overrideWith((_) => Stream.value(_plan())),
      macroTargetRepositoryProvider.overrideWithValue(
        MacroTargetRepository.withStore(store),
      ),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

Future<void> _send(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), 'Raise protein');
  await tester.tap(find.byIcon(Icons.arrow_upward));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets('double Apply performs one atomic plan save', (tester) async {
    final store = _PlanStore();
    await tester.pumpWidget(_app(store));
    await tester.pump();
    await _send(tester);

    final apply = find.byKey(const ValueKey('ai-action-apply'));
    await tester.tap(apply);
    await tester.pump();
    await tester.tap(apply);
    await tester.pump();

    expect(store.updateCount, 1);
    expect(find.text('Applying…'), findsOneWidget);

    store.updateCompleter.complete();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.textContaining('target is now 190g'), findsOneWidget);
  });

  testWidgets('Keep original performs no plan write', (tester) async {
    final store = _PlanStore();
    await tester.pumpWidget(_app(store));
    await tester.pump();
    await _send(tester);

    await tester.tap(find.text('Keep original'));
    await tester.pump();

    expect(store.updateCount, 0);
    expect(find.textContaining('leave your targets unchanged'), findsOneWidget);
  });
}
