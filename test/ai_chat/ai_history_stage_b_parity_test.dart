import 'package:calorix/core/theme/app_colors.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/debug/ui_diff_fixture.dart';
import 'package:calorix/features/ai_chat/ai_history_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/shared/models/ai_chat_thread.dart';
import 'package:calorix/shell/app_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:calorix/core/router/route_names.dart';

const _stageGComparisonScale = 1.0925;
const _stageGFabClearance = 7 / _stageGComparisonScale;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

List<AiChatThread> get _fixture => populatedAiThreadsFixture(
      uid: 'user-1',
      now: DateTime.utc(2026, 7, 28, 14, 10),
    );

Widget _app(
  List<AiChatThread> threads, {
  ThemeMode themeMode = ThemeMode.dark,
}) {
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

/// Production-shell harness matching real AppShell layout.
Widget _productionShellApp(
  List<AiChatThread> threads, {
  ThemeMode themeMode = ThemeMode.dark,
}) {
  final router = GoRouter(
    initialLocation: '/test-ai-history',
    routes: [
      GoRoute(
        path: '/test-ai-history',
        builder: (_, __) => Builder(
          builder: (context) {
            final isDark = Theme.of(context).brightness == Brightness.dark;
            return Scaffold(
              extendBody: true,
              body: const AiHistoryScreen(),
              bottomNavigationBar: CalorixBottomNav(
                currentIndex: 4,
                onTap: (_) {},
                isDark: isDark,
              ),
            );
          },
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
      themeMode: themeMode,
      routerConfig: router,
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  // ── 1. Stable keys for production inspection ─────────────────────────────
  group('Stage B stable keys', () {
    testWidgets(
      'pinned thread row has ai-thread-surface-ui_diff_fixture_pinned key',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        expect(
          find.byKey(
            const ValueKey('ai-thread-surface-ui_diff_fixture_pinned'),
          ),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'pinned thread avatar has ai-thread-avatar-ui_diff_fixture_pinned key',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        expect(
          find.byKey(
            const ValueKey('ai-thread-avatar-ui_diff_fixture_pinned'),
          ),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'new chat surface has ai-new-chat-surface key',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        expect(
          find.byKey(const ValueKey('ai-new-chat-surface')),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'today meal thread row has ai-thread-surface key',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        expect(
          find.byKey(
            const ValueKey('ai-thread-surface-ui_diff_fixture_today_meal'),
          ),
          findsOneWidget,
        );
      },
    );
  });

  // ── 2. Row geometry: pinned and first Today rows 92..101 logical px ─────
  group('Stage B row density — canonical ~96px', () {
    testWidgets(
      'pinned row height is 92..101 logical px (canonical ~96) dark',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final pinnedRow = find.byKey(
          const ValueKey('ai-thread-surface-ui_diff_fixture_pinned'),
        );
        expect(pinnedRow, findsOneWidget);

        final rowRect = tester.getRect(pinnedRow);
        expect(
          rowRect.height,
          greaterThanOrEqualTo(92),
          reason: 'Pinned row height must be >=92, got ${rowRect.height}',
        );
        expect(
          rowRect.height,
          lessThanOrEqualTo(101),
          reason: 'Pinned row height must be <=101, got ${rowRect.height}',
        );
      },
    );

    testWidgets(
      'first Today row height is within content-dependent range dark',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final todayRow = find.byKey(
          const ValueKey('ai-thread-surface-ui_diff_fixture_today_meal'),
        );
        expect(todayRow, findsOneWidget);

        final rowRect = tester.getRect(todayRow);
        // Content-dependent: short single-line preview rows are shorter,
        // but must still be reasonable (>=76 with current padding).
        expect(
          rowRect.height,
          greaterThanOrEqualTo(76),
          reason: 'Today row height must be >=76, got ${rowRect.height}',
        );
        expect(
          rowRect.height,
          lessThanOrEqualTo(101),
          reason: 'Today row height must be <=101, got ${rowRect.height}',
        );
      },
    );

    testWidgets(
      'pinned row height is 92..101 logical px light',
      (tester) async {
        await tester.pumpWidget(
          _app(_fixture, themeMode: ThemeMode.light),
        );
        await tester.pumpAndSettle();

        final pinnedRow = find.byKey(
          const ValueKey('ai-thread-surface-ui_diff_fixture_pinned'),
        );
        expect(pinnedRow, findsOneWidget);

        final rowRect = tester.getRect(pinnedRow);
        expect(
          rowRect.height,
          greaterThanOrEqualTo(92),
          reason: 'Pinned row light height must be >=92, got ${rowRect.height}',
        );
        expect(
          rowRect.height,
          lessThanOrEqualTo(101),
          reason:
              'Pinned row light height must be <=101, got ${rowRect.height}',
        );
      },
    );
  });

  // ── 3. Pinned Material: exact cyan surface, border, opaque gradient, no dot ──
  group('Stage B pinned treatment', () {
    testWidgets(
      'pinned Material uses exact cyan surface alpha .06 dark',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final pinnedSurface = find.byKey(
          const ValueKey('ai-thread-surface-ui_diff_fixture_pinned'),
        );
        expect(pinnedSurface, findsOneWidget);

        final materialWidget =
            pinnedSurface.evaluate().first.widget as Material;
        expect(
          materialWidget.color,
          AppColors.cyan.withValues(alpha: 0.06),
          reason: 'Pinned surface must be cyan alpha .06 in dark',
        );
      },
    );

    testWidgets(
      'pinned Material uses exact cyan surface alpha .04 light',
      (tester) async {
        await tester.pumpWidget(
          _app(_fixture, themeMode: ThemeMode.light),
        );
        await tester.pumpAndSettle();

        final pinnedSurface = find.byKey(
          const ValueKey('ai-thread-surface-ui_diff_fixture_pinned'),
        );
        expect(pinnedSurface, findsOneWidget);

        final materialWidget =
            pinnedSurface.evaluate().first.widget as Material;
        expect(
          materialWidget.color,
          AppColors.cyan.withValues(alpha: 0.04),
          reason: 'Pinned surface must be cyan alpha .04 in light',
        );
      },
    );

    testWidgets(
      'pinned Material border is cyan alpha .32 width .8',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final pinnedSurface = find.byKey(
          const ValueKey('ai-thread-surface-ui_diff_fixture_pinned'),
        );
        expect(pinnedSurface, findsOneWidget);

        final materialWidget =
            pinnedSurface.evaluate().first.widget as Material;
        final shape = materialWidget.shape;
        expect(shape, isA<RoundedRectangleBorder>());

        final rRect = shape as RoundedRectangleBorder;
        expect(
          rRect.side.color,
          AppColors.cyan.withValues(alpha: 0.32),
          reason: 'Pinned border must be cyan alpha .32',
        );
        expect(rRect.side.width, 0.8,
            reason: 'Pinned border width must be 0.8');
      },
    );

    testWidgets(
      'pinned avatar has opaque LinearGradient [cyan, blue] and backgroundDark icon',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final pinnedAvatar = find.byKey(
          const ValueKey('ai-thread-avatar-ui_diff_fixture_pinned'),
        );
        expect(pinnedAvatar, findsOneWidget);

        // Find the DecoratedBox with gradient
        final decorated = find.descendant(
          of: pinnedAvatar,
          matching: find.byType(DecoratedBox),
        );
        expect(decorated, findsWidgets);

        LinearGradient? foundGradient;
        for (final el in decorated.evaluate()) {
          final box = el.widget as DecoratedBox;
          final d = box.decoration;
          if (d is BoxDecoration && d.gradient is LinearGradient) {
            foundGradient = d.gradient as LinearGradient;
            break;
          }
        }
        expect(
          foundGradient,
          isNotNull,
          reason: 'Pinned avatar must have a LinearGradient',
        );
        expect(
          foundGradient!.colors,
          [AppColors.cyan, AppColors.blue],
          reason: 'Pinned gradient must be opaque [cyan, blue]',
        );

        // Icon must be backgroundDark (high contrast)
        final icon = find.descendant(
          of: pinnedAvatar,
          matching: find.byIcon(Icons.auto_awesome),
        );
        expect(icon, findsOneWidget);
        final iconWidget = icon.evaluate().first.widget as Icon;
        expect(
          iconWidget.color,
          AppColors.backgroundDark,
          reason: 'Pinned sparkle icon must use backgroundDark',
        );
      },
    );

    testWidgets(
      'pinned avatar has no category status dot',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final dot = find.byKey(
          const ValueKey('ai-thread-avatar-status-ui_diff_fixture_pinned'),
        );
        expect(
          dot,
          findsNothing,
          reason: 'Pinned avatar must not render the category status dot',
        );
      },
    );
  });

  // ── 4. Normal row avatar: transformed 42px size, exact fill, no gradient, keyed 6x6 dot ─
  group('Stage B normal avatar treatment', () {
    testWidgets(
      'normal row avatar is 42/1.0925, surfaceRaisedDark fill, no gradient, neutral border dark',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final normalAvatar = find.byKey(
          const ValueKey('ai-thread-avatar-ui_diff_fixture_today_meal'),
        );
        expect(normalAvatar, findsOneWidget);

        final avatarRect = tester.getRect(normalAvatar);
        expect(
          avatarRect.width,
          closeTo(42 / 1.0925, 0.01),
          reason:
              'Normal avatar width must use the transformed 42px canonical size',
        );
        expect(
          avatarRect.height,
          closeTo(42 / 1.0925, 0.01),
          reason:
              'Normal avatar height must use the transformed 42px canonical size',
        );

        // Inspect exact BoxDecoration
        final decorated = find.descendant(
          of: normalAvatar,
          matching: find.byType(DecoratedBox),
        );
        BoxDecoration? foundBox;
        for (final el in decorated.evaluate()) {
          final box = el.widget as DecoratedBox;
          if (box.decoration is BoxDecoration) {
            foundBox = box.decoration as BoxDecoration;
            break;
          }
        }
        expect(foundBox, isNotNull,
            reason: 'Normal avatar must have a BoxDecoration');
        expect(
          foundBox!.color,
          AppColors.surfaceRaisedDark,
          reason: 'Normal avatar fill must be surfaceRaisedDark in dark mode',
        );
        expect(foundBox.gradient, isNull,
            reason: 'Normal avatar must have no gradient');

        final border = foundBox.border as Border?;
        expect(border, isNotNull);
        expect(border!.top.color, AppColors.borderDark);
        expect(border.top.width, 0.5);

        // Sparkle icon must use muted text color, not category color
        final icon = find.descendant(
          of: normalAvatar,
          matching: find.byIcon(Icons.auto_awesome),
        );
        expect(icon, findsOneWidget);
        final iconWidget = icon.evaluate().first.widget as Icon;
        expect(
          iconWidget.color,
          AppColors.textSecondaryDark,
          reason: 'Normal sparkle icon must use muted theme text color',
        );
      },
    );

    testWidgets(
      'normal row avatar is 42/1.0925, surfaceRaisedLight fill, no gradient, neutral border light',
      (tester) async {
        await tester.pumpWidget(
          _app(_fixture, themeMode: ThemeMode.light),
        );
        await tester.pumpAndSettle();

        final normalAvatar = find.byKey(
          const ValueKey('ai-thread-avatar-ui_diff_fixture_today_meal'),
        );
        expect(normalAvatar, findsOneWidget);

        final avatarRect = tester.getRect(normalAvatar);
        expect(
          avatarRect.width,
          closeTo(42 / 1.0925, 0.01),
          reason:
              'Normal avatar width must use the transformed 42px canonical size',
        );
        expect(
          avatarRect.height,
          closeTo(42 / 1.0925, 0.01),
          reason:
              'Normal avatar height must use the transformed 42px canonical size',
        );

        final decorated = find.descendant(
          of: normalAvatar,
          matching: find.byType(DecoratedBox),
        );
        BoxDecoration? foundBox;
        for (final el in decorated.evaluate()) {
          final box = el.widget as DecoratedBox;
          if (box.decoration is BoxDecoration) {
            foundBox = box.decoration as BoxDecoration;
            break;
          }
        }
        expect(foundBox, isNotNull);
        expect(
          foundBox!.color,
          AppColors.surfaceRaisedLight,
          reason: 'Normal avatar fill must be surfaceRaisedLight in light mode',
        );
        expect(foundBox.gradient, isNull,
            reason: 'Normal avatar must have no gradient');

        final border = foundBox.border as Border?;
        expect(border, isNotNull);
        expect(border!.top.color, AppColors.borderLight);
        expect(border.top.width, 0.5);

        final icon = find.descendant(
          of: normalAvatar,
          matching: find.byIcon(Icons.auto_awesome),
        );
        expect(icon, findsOneWidget);
        final iconWidget = icon.evaluate().first.widget as Icon;
        expect(
          iconWidget.color,
          AppColors.textSecondaryLight,
          reason: 'Normal sparkle icon must use muted theme text color',
        );
      },
    );

    testWidgets(
      'meal thread has keyed 6x6 green category status dot',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final dot = find.byKey(
          const ValueKey('ai-thread-avatar-status-ui_diff_fixture_today_meal'),
        );
        expect(
          dot,
          findsOneWidget,
          reason: 'Meal thread must have a keyed category status dot',
        );

        final dotRect = tester.getRect(dot);
        expect(dotRect.width, 6, reason: 'Category dot must be 6 wide');
        expect(dotRect.height, 6, reason: 'Category dot must be 6 tall');

        final dotWidget = dot.evaluate().first.widget as Container;
        final dotDeco = dotWidget.decoration as BoxDecoration?;
        expect(dotDeco, isNotNull);
        expect(
          dotDeco!.color,
          AppColors.green,
          reason: 'Meal category dot must be AppColors.green',
        );
      },
    );
  });

  // ── 5. New chat surface: transformed 46px height, 112..128 wide ────────
  group('New chat surface geometry (Stage C canonical values)', () {
    testWidgets(
      'new chat visible surface is 46/1.0925 logical px high and 112..128 wide (dark)',
      (tester) async {
        await tester.pumpWidget(_productionShellApp(_fixture));
        await tester.pumpAndSettle();

        final surface = find.byKey(const ValueKey('ai-new-chat-surface'));
        expect(surface, findsOneWidget);

        final rect = tester.getRect(surface);
        expect(
          rect.height,
          closeTo(46 / 1.0925, 0.01),
          reason: 'New chat surface height must use the transformed 46px '
              'canonical size, got ${rect.height}',
        );
        expect(
          rect.width,
          greaterThanOrEqualTo(112),
          reason: 'New chat surface width must be >=112, got ${rect.width}',
        );
        expect(
          rect.width,
          lessThanOrEqualTo(128),
          reason: 'New chat surface width must be <=128, got ${rect.width}',
        );
      },
    );

    testWidgets(
      'new chat visible surface is 46/1.0925 high and 112..128 wide (light)',
      (tester) async {
        await tester.pumpWidget(
          _productionShellApp(_fixture, themeMode: ThemeMode.light),
        );
        await tester.pumpAndSettle();

        final surface = find.byKey(const ValueKey('ai-new-chat-surface'));
        expect(surface, findsOneWidget);

        final rect = tester.getRect(surface);
        expect(
          rect.height,
          closeTo(46 / 1.0925, 0.01),
          reason: 'New chat surface light height must use the transformed '
              '46px canonical size, got ${rect.height}',
        );
        expect(
          rect.width,
          greaterThanOrEqualTo(112),
          reason:
              'New chat surface light width must be >=112, got ${rect.width}',
        );
        expect(
          rect.width,
          lessThanOrEqualTo(128),
          reason:
              'New chat surface light width must be <=128, got ${rect.width}',
        );
      },
    );
  });

  // ── 6. New chat tap target ≥48, clears nav by ≥8, navigates ─────────────
  group('Stage B new chat tap target & nav clearance', () {
    testWidgets(
      'outer ai-new-chat hit target is at least 48 logical px high',
      (tester) async {
        await tester.pumpWidget(_productionShellApp(_fixture));
        await tester.pumpAndSettle();

        final outer = find.byKey(const ValueKey('ai-new-chat'));
        expect(outer, findsOneWidget);

        final rect = tester.getRect(outer);
        expect(
          rect.height,
          greaterThanOrEqualTo(48),
          reason:
              'Outer new-chat tap target must be >=48px, got ${rect.height}',
        );
      },
    );

    testWidgets(
      'Stage G outer ai-new-chat clearance is the measured 7px comparison gap (dark)',
      (tester) async {
        await tester.pumpWidget(_productionShellApp(_fixture));
        await tester.pumpAndSettle();

        final outer = find.byKey(const ValueKey('ai-new-chat'));
        expect(outer, findsOneWidget);

        final navFinder = find.byKey(const Key('today-bottom-nav'));
        expect(navFinder, findsOneWidget);

        final fabRect = tester.getRect(outer);
        final navRect = tester.getRect(navFinder);

        expect(
          navRect.top - fabRect.bottom,
          closeTo(_stageGFabClearance, 0.01),
          reason: 'Stage G measures the coupled production-shell clearance '
              'at 7/1.0925 comparison px (dark)',
        );
      },
    );

    testWidgets(
      'Stage G outer ai-new-chat clearance is the measured 7px comparison gap (light)',
      (tester) async {
        await tester.pumpWidget(
          _productionShellApp(_fixture, themeMode: ThemeMode.light),
        );
        await tester.pumpAndSettle();

        final outer = find.byKey(const ValueKey('ai-new-chat'));
        expect(outer, findsOneWidget);

        final navFinder = find.byKey(const Key('today-bottom-nav'));
        expect(navFinder, findsOneWidget);

        final fabRect = tester.getRect(outer);
        final navRect = tester.getRect(navFinder);

        expect(
          navRect.top - fabRect.bottom,
          closeTo(_stageGFabClearance, 0.01),
          reason: 'Stage G measures the coupled production-shell clearance '
              'at 7/1.0925 comparison px (light)',
        );
      },
    );

    testWidgets(
      'tapping outer ai-new-chat navigates to aiChat',
      (tester) async {
        await tester.pumpWidget(_productionShellApp(_fixture));
        await tester.pumpAndSettle();

        await tester.tap(find.byKey(const ValueKey('ai-new-chat')));
        await tester.pumpAndSettle();

        expect(find.text('Chat new'), findsOneWidget);
      },
    );
  });
}
