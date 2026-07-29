import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/debug/ui_diff_fixture.dart';
import 'package:calorix/features/ai_chat/ai_history_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/shared/models/ai_chat_thread.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

// Stage E converts canonical comparison-space geometry back into the real
// device's logical Flutter viewport. The physical capture is 1080x2400 at
// DPR 3 and is compared against a 402x874 reference with uniform contain:
// comparison = logical * 1.0925 (+4.35px on x only).
const double _kComparisonToLogical = 1.0925;
const double _kThreadRadius = 18 / _kComparisonToLogical;
const double _kAvatarSize = 42 / _kComparisonToLogical;
const double _kNewChatDiscSize = 34 / _kComparisonToLogical;
const double _kAvatarTopInset = 12 / _kComparisonToLogical;
const double _kNewChatSurfaceHeight = 46 / _kComparisonToLogical;
const double _kNewChatRightInset = (402 - 4.35 - 386) / _kComparisonToLogical;

List<AiChatThread> get _fixture => populatedAiThreadsFixture(
      uid: 'user-1',
      now: DateTime.utc(2026, 7, 28, 14, 10),
    );

Widget _app(List<AiChatThread> threads) {
  final router = GoRouter(
    initialLocation: '/test-ai-history',
    routes: [
      GoRoute(
        path: '/test-ai-history',
        builder: (_, __) => const Scaffold(
          extendBody: true,
          body: AiHistoryScreen(),
          bottomNavigationBar: SizedBox(height: 80),
        ),
      ),
      GoRoute(
        path: RoutePaths.aiChat,
        name: RouteNames.aiChat,
        builder: (_, state) => Scaffold(
          body: Text(
            'Chat ${state.uri.queryParameters['threadId'] ?? 'new'}',
          ),
        ),
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
      themeMode: ThemeMode.dark,
      routerConfig: router,
    ),
  );
}

Future<void> _pumpAtPhysicalViewport(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(_app(_fixture));
  await tester.pumpAndSettle();
}

double _rowRadius(WidgetTester tester, ValueKey<String> key) {
  final material = tester.widget<Material>(find.byKey(key));
  final shape = material.shape! as RoundedRectangleBorder;
  return shape.borderRadius.resolve(TextDirection.ltr).topLeft.x;
}

void main() {
  group('Stage E comparison-space geometry', () {
    testWidgets('thread rows use the scaled 18px canonical radius',
        (tester) async {
      await _pumpAtPhysicalViewport(tester);

      expect(
        _rowRadius(
          tester,
          const ValueKey('ai-thread-surface-ui_diff_fixture_pinned'),
        ),
        closeTo(_kThreadRadius, 0.01),
      );
      expect(
        _rowRadius(
          tester,
          const ValueKey('ai-thread-surface-ui_diff_fixture_today_meal'),
        ),
        closeTo(_kThreadRadius, 0.01),
      );
    });

    testWidgets('thread avatars use the scaled 42px canonical size',
        (tester) async {
      await _pumpAtPhysicalViewport(tester);

      final avatar = find.descendant(
        of: find.byKey(const ValueKey(
          'ai-thread-avatar-ui_diff_fixture_today_meal',
        )),
        matching: find.byType(Container),
      );
      expect(avatar, findsWidgets);
      final avatarTile = avatar.first;
      expect(tester.getSize(avatarTile).width, closeTo(_kAvatarSize, 0.01));
      expect(tester.getSize(avatarTile).height, closeTo(_kAvatarSize, 0.01));
    });

    testWidgets('thread avatars are top-aligned at the canonical card inset',
        (tester) async {
      await _pumpAtPhysicalViewport(tester);

      final row = tester.getRect(find.byKey(const ValueKey(
        'ai-thread-surface-ui_diff_fixture_pinned',
      )));
      final avatar = find
          .descendant(
            of: find.byKey(const ValueKey(
              'ai-thread-avatar-ui_diff_fixture_pinned',
            )),
            matching: find.byType(Container),
          )
          .first;

      expect(
        tester.getRect(avatar).top - row.top,
        closeTo(_kAvatarTopInset, 1.25),
        reason: 'avatar top inset should be the canonical 12px comparison '
            'inset converted to logical space',
      );
    });

    testWidgets(
        'new-chat disc uses the scaled 34px canonical size and remains tappable',
        (tester) async {
      await _pumpAtPhysicalViewport(tester);

      final disc = find.byKey(const ValueKey('ai-new-chat-gradient'));
      final wrapper = find.byKey(const ValueKey('ai-new-chat'));
      final surface = find.byKey(const ValueKey('ai-new-chat-surface'));
      final label = find.text('New chat');

      expect(tester.getSize(disc).width, closeTo(_kNewChatDiscSize, 0.01));
      expect(tester.getSize(disc).height, closeTo(_kNewChatDiscSize, 0.01));
      final surfaceRect = tester.getRect(surface);
      final screenWidth = tester.getSize(find.byType(Scaffold).first).width;
      expect(surfaceRect.height, closeTo(_kNewChatSurfaceHeight, 0.01));
      expect(
        screenWidth - surfaceRect.right,
        closeTo(_kNewChatRightInset, 0.75),
      );
      expect(tester.getSize(wrapper).width, greaterThanOrEqualTo(44));
      expect(tester.getSize(wrapper).height, greaterThanOrEqualTo(44));

      final labelRect = tester.getRect(label);
      expect(surfaceRect.contains(labelRect.topLeft), isTrue);
      expect(surfaceRect.contains(labelRect.bottomRight), isTrue);
      expect(labelRect.width, greaterThan(0));
      expect(labelRect.height, greaterThan(0));
    });
  });
}
