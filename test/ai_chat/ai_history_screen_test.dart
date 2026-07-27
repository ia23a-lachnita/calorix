import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/ai_chat/ai_history_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/shared/models/ai_chat_thread.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

AiChatThread _thread(String id, {String? linkedMealId}) => AiChatThread(
      id: id,
      uid: 'user-1',
      createdAt: DateTime.utc(2026, 7, 27, 11),
      updatedAt: DateTime.utc(2026, 7, 27, 12),
      title: 'Protein plan',
      preview: 'Raised protein while keeping calories stable.',
      linkedMealId: linkedMealId,
    );

Widget _app(List<AiChatThread> threads,
    {ThemeMode themeMode = ThemeMode.dark}) {
  final router = GoRouter(
    initialLocation: RoutePaths.aiHistory,
    routes: [
      GoRoute(
        path: RoutePaths.aiChat,
        name: RouteNames.aiChat,
        builder: (_, state) => Scaffold(
          body: Text(
            'Chat ${state.uri.queryParameters['threadId'] ?? 'new'}',
          ),
        ),
        routes: [
          GoRoute(
            path: 'history',
            name: RouteNames.aiHistory,
            builder: (_, __) => const AiHistoryScreen(),
          ),
        ],
      ),
    ],
  );
  return ProviderScope(
    overrides: [
      aiThreadsProvider.overrideWith((ref) => Stream.value(threads)),
    ],
    child: MaterialApp.router(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
    ),
  );
}

void main() {
  testWidgets(
    'thread list shows title, preview, timestamp, linked meal and opens thread',
    (tester) async {
      await tester.pumpWidget(_app([_thread('thread-1', linkedMealId: 'm1')]));
      await tester.pumpAndSettle();

      expect(find.text('Protein plan'), findsOneWidget);
      expect(
        find.text('Raised protein while keeping calories stable.'),
        findsOneWidget,
      );
      expect(find.text('LINKED MEAL'), findsOneWidget);
      expect(find.textContaining('Jul 27'), findsOneWidget);

      await tester.tap(find.text('Protein plan'));
      await tester.pumpAndSettle();
      expect(find.text('Chat thread-1'), findsOneWidget);
    },
  );

  testWidgets('empty state offers a new-chat CTA in light and dark themes',
      (tester) async {
    for (final mode in [ThemeMode.light, ThemeMode.dark]) {
      await tester.pumpWidget(_app(const [], themeMode: mode));
      await tester.pumpAndSettle();

      expect(find.text('No conversations yet'), findsOneWidget);
      expect(find.text('Start a chat'), findsOneWidget);
    }
  });

  testWidgets('swipe delete asks for confirmation', (tester) async {
    await tester.pumpWidget(_app([_thread('thread-1')]));
    await tester.pumpAndSettle();

    await tester.drag(
      find.byKey(const ValueKey('ai-thread-thread-1')),
      const Offset(-400, 0),
    );
    await tester.pumpAndSettle();

    expect(find.text('Delete conversation?'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
  });
}
