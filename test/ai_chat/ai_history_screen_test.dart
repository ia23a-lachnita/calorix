import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/core/time/clock.dart';
import 'package:calorix/core/time/clock_provider.dart';
import 'package:calorix/features/ai_chat/ai_history_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/shared/models/ai_chat_thread.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

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

  // ---- FakeClock injection: proves clockProvider controls row timestamps ----
  group('FakeClock injection', () {
    late tz.Location location;

    setUpAll(() {
      tz_data.initializeTimeZones();
      location = tz.getLocation('America/New_York');
    });

    testWidgets(
      'overridden FakeClock controls displayed row timestamps',
      (tester) async {
        // Anchor: 2026-07-29 10:00 local (New York)
        final fakeNow = tz.TZDateTime(location, 2026, 7, 29, 10, 0);

        // Thread updated "today" (same day as anchor, earlier hour)
        final todayThread = AiChatThread(
          id: 'fc-today',
          uid: 'user-1',
          title: 'Today via FakeClock',
          preview: 'Updated at 09:30',
          category: AiChatThreadCategory.meals,
          createdAt: DateTime(2026, 7, 29, 8),
          updatedAt: DateTime(2026, 7, 29, 9, 30),
        );
        // Thread updated "yesterday"
        final yesterdayThread = AiChatThread(
          id: 'fc-yesterday',
          uid: 'user-1',
          title: 'Yesterday via FakeClock',
          preview: 'Updated yesterday',
          category: AiChatThreadCategory.goals,
          createdAt: DateTime(2026, 7, 28, 14),
          updatedAt: DateTime(2026, 7, 28, 14),
        );

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

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              clockProvider.overrideWithValue(FakeClock(fakeNow)),
              aiThreadsProvider.overrideWith(
                  (ref) => Stream.value([todayThread, yesterdayThread])),
            ],
            child: MaterialApp.router(
              theme: AppTheme.dark(),
              routerConfig: router,
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Today thread should show HH:mm timestamp (e.g. "09:30"), not "Yesterday"
        expect(find.text('Today via FakeClock'), findsOneWidget);
        expect(find.text('09:30'), findsOneWidget);

        // Yesterday thread should show "Yesterday" as its relative timestamp
        expect(find.text('Yesterday via FakeClock'), findsOneWidget);
        // "Yesterday" appears as the group header
        expect(find.text('Yesterday'), findsWidgets);
      },
    );
  });
}
