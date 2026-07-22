import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/services/ai_chat_service.dart';

class _StubAiChatService implements AiChatService {
  _StubAiChatService(this.handler);
  final Future<String> Function(String message) handler;

  @override
  Future<String> sendMessage({
    required String message,
    required List<AiChatTurn> history,
    required Map<String, Object?> plan,
    required Map<String, Object?> consumed,
  }) =>
      handler(message);
}

Widget _app(AiChatService service) {
  return ProviderScope(
    overrides: [
      aiChatServiceProvider.overrideWithValue(service),
      authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
      todaySummaryProvider.overrideWithValue(
        (
          kcal: 845,
          proteinG: 52.0,
          carbsG: 90.0,
          fatG: 32.0,
          targetKcal: 2400,
          kcalLeft: 1555,
        ),
      ),
    ],
    child: MaterialApp.router(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      routerConfig: GoRouter(
        initialLocation: '/ai',
        routes: [
          GoRoute(
            path: '/ai',
            name: RouteNames.aiChat,
            builder: (context, state) => const AiChatScreen(),
          ),
        ],
      ),
    ),
  );
}

Future<void> _send(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField), text);
  await tester.tap(find.byIcon(Icons.arrow_upward));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets('backend failures surface friendly copy, never raw errors',
      (tester) async {
    await tester.pumpWidget(_app(
      _StubAiChatService((_) async => throw Exception('boom-internal-detail')),
    ));
    await tester.pump();

    await _send(tester, 'hello');

    expect(
      find.textContaining("I couldn't reach the assistant just now"),
      findsOneWidget,
    );
    expect(find.textContaining('boom-internal-detail'), findsNothing);
    expect(find.textContaining('Exception'), findsNothing);
  });

  testWidgets('assistant markdown renders bold instead of leaking asterisks',
      (tester) async {
    await tester.pumpWidget(_app(
      _StubAiChatService(
          (_) async => 'Raise protein to **190 g** today.\n* keep carbs'),
    ));
    await tester.pump();

    await _send(tester, 'bump my protein');

    expect(find.textContaining('**'), findsNothing);
    expect(find.textContaining('190 g'), findsOneWidget);
    // Bullet markers are normalized to a typographic bullet.
    expect(find.textContaining('• keep carbs'), findsOneWidget);
  });

  testWidgets('no api-key placeholder remains in the chat flow',
      (tester) async {
    await tester.pumpWidget(_app(_StubAiChatService((_) async => 'Done.')));
    await tester.pump();

    await _send(tester, 'hello');

    expect(find.textContaining('GEMINI_API_KEY'), findsNothing);
    expect(find.textContaining('not configured'), findsNothing);
    expect(find.text('Done.'), findsOneWidget);
  });

  group('close button routing', () {
    Widget routerApp({
      required AiChatService service,
      required String initialLocation,
    }) {
      return ProviderScope(
        overrides: [
          aiChatServiceProvider.overrideWithValue(service),
          authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
          todaySummaryProvider.overrideWithValue(
            (
              kcal: 845,
              proteinG: 52.0,
              carbsG: 90.0,
              fatG: 32.0,
              targetKcal: 2400,
              kcalLeft: 1555,
            ),
          ),
        ],
        child: MaterialApp.router(
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: ThemeMode.dark,
          routerConfig: GoRouter(
            initialLocation: initialLocation,
            routes: [
              GoRoute(
                path: RoutePaths.today,
                name: RouteNames.today,
                builder: (context, state) =>
                    const Scaffold(body: Center(child: Text('Today stub'))),
              ),
              GoRoute(
                path: RoutePaths.scan,
                name: RouteNames.scan,
                builder: (context, state) =>
                    const Scaffold(body: Center(child: Text('Scan stub'))),
              ),
              GoRoute(
                path: '/ai',
                name: RouteNames.aiChat,
                builder: (context, state) => const AiChatScreen(),
              ),
            ],
          ),
        ),
      );
    }

    testWidgets('pushed over origin shows ai-close and pops to origin',
        (tester) async {
      await tester.pumpWidget(routerApp(
        service: _StubAiChatService((_) async => 'Done.'),
        initialLocation: RoutePaths.today,
      ));
      await tester.pumpAndSettle();

      // Navigate to AI chat pushed over Today.
      final ctx = tester.element(find.text('Today stub'));
      GoRouter.of(ctx).pushNamed(RouteNames.aiChat);
      await tester.pumpAndSettle();

      // ai-close must be visible when canPop is true.
      expect(find.byKey(const ValueKey('ai-close')), findsOneWidget);
      expect(find.byKey(const ValueKey('ai-close-fallback')), findsNothing);

      // Tap close → pops back to Today.
      await tester.tap(find.byKey(const ValueKey('ai-close')));
      await tester.pumpAndSettle();

      expect(find.text('Today stub'), findsOneWidget);
    });

    testWidgets('root route shows ai-close-fallback and navigates to Scan',
        (tester) async {
      await tester.pumpWidget(routerApp(
        service: _StubAiChatService((_) async => 'Done.'),
        initialLocation: '/ai',
      ));
      await tester.pumpAndSettle();

      // ai-close-fallback must be visible when canPop is false.
      expect(find.byKey(const ValueKey('ai-close-fallback')), findsOneWidget);
      expect(find.byKey(const ValueKey('ai-close')), findsNothing);

      // Tap fallback close → navigates to Scan.
      await tester.tap(find.byKey(const ValueKey('ai-close-fallback')));
      await tester.pumpAndSettle();

      expect(find.text('Scan stub'), findsOneWidget);
    });
  });
}
