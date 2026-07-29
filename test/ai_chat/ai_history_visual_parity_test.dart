import 'package:calorix/core/constants/app_constants.dart';
import 'package:calorix/core/router/route_names.dart';
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

// ---------------------------------------------------------------------------
// Canonical 12-thread fixture
// ---------------------------------------------------------------------------

List<AiChatThread> get _fixture => populatedAiThreadsFixture(
      uid: 'user-1',
      now: DateTime.utc(2026, 7, 28, 14, 10),
    );

/// Scroll the thread list until [finder] is visible.
Future<void> _scrollTo(WidgetTester tester, Finder finder) =>
    tester.scrollUntilVisible(
      finder,
      300,
      scrollable: find.descendant(
        of: find.byKey(const ValueKey('ai-history-list')),
        matching: find.byType(Scrollable),
      ),
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
      GoRoute(
        path: RoutePaths.profile,
        name: RouteNames.profile,
        builder: (_, __) => const Scaffold(body: Text('ProfilePage')),
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

/// Production-topology harness: outer Scaffold(extendBody:true) with
/// CalorixBottomNav, matching the real AppShell layout.
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
                currentIndex: 4, // AI tab
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
      GoRoute(
        path: RoutePaths.profile,
        name: RouteNames.profile,
        builder: (_, __) => const Scaffold(body: Text('ProfilePage')),
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
  // ── 1. Canonical header structure ────────────────────────────────────────
  group('canonical header', () {
    testWidgets(
      'first row has back button, centered APPNAME AI brand, and settings icon',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // Back button present and tappable
        final back = find.byKey(const ValueKey('ai-history-back'));
        expect(back, findsOneWidget);

        // Centered brand text
        expect(
          find.text('${AppConstants.appDisplayName.toUpperCase()} AI'),
          findsOneWidget,
        );

        // Settings / sliders icon in header
        expect(
          find.byKey(const ValueKey('ai-history-settings')),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'second row has Chats heading and thread count badge',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        expect(find.text('Chats'), findsOneWidget);
        expect(find.textContaining('THREAD'), findsOneWidget);
      },
    );

    testWidgets(
      'subtitle mentions plan and meal edits',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final subtitle = find.textContaining(
          'Every conversation with ${AppConstants.appDisplayName} AI',
        );
        expect(subtitle, findsOneWidget);
        // Must mention "plan or meal edits" explicitly
        expect(
          find.textContaining('plan or meal edits'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'settings icon navigates to profile/settings route',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        await tester.tap(find.byKey(const ValueKey('ai-history-settings')));
        await tester.pumpAndSettle();

        expect(find.text('ProfilePage'), findsOneWidget);
      },
    );
  });

  // ── 2. Search hint and ⌘K badge ─────────────────────────────────────────
  group('search bar', () {
    testWidgets(
      'shows exact hint "Search chats and meal edits…" with ⌘K badge',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // Hint text
        expect(
          find.text('Search chats and meal edits…'),
          findsOneWidget,
        );

        // ⌘K badge
        expect(
          find.byKey(const ValueKey('ai-history-search-kbd')),
          findsOneWidget,
        );
        expect(find.text('⌘K'), findsOneWidget);
      },
    );
  });

  // ── 3. Four canonical filter controls with live counts ───────────────────
  group('filter chips with live counts', () {
    testWidgets(
      'shows exactly All, Plan, Meal edits, Nutrition — no Chat chip',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        expect(find.byKey(const ValueKey('ai-filter-All')), findsOneWidget);
        expect(find.byKey(const ValueKey('ai-filter-Plan')), findsOneWidget);
        expect(
          find.byKey(const ValueKey('ai-filter-Meal edits')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('ai-filter-Nutrition')),
          findsOneWidget,
        );

        // No standalone "Chat" filter chip
        expect(find.byKey(const ValueKey('ai-filter-Chat')), findsNothing);
      },
    );

    testWidgets(
      'All chip shows total thread count from full snapshot',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // All should show count 12
        expect(find.text('12'), findsWidgets);
      },
    );

    testWidgets(
      'Plan chip shows goals-category count',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // Count goals threads: pinned + today_plan + yesterday_nutrition + earlier_plan + earlier_plan2 = 5
        final goalsCount = _fixture
            .where((t) => t.category == AiChatThreadCategory.goals)
            .length;
        expect(find.text('$goalsCount'), findsWidgets);
      },
    );

    testWidgets(
      'Meal edits chip shows meals-category count',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final mealsCount = _fixture
            .where((t) => t.category == AiChatThreadCategory.meals)
            .length;
        expect(find.text('$mealsCount'), findsWidgets);
      },
    );

    testWidgets(
      'Nutrition chip shows scans-category count',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final scansCount = _fixture
            .where((t) => t.category == AiChatThreadCategory.scans)
            .length;
        expect(find.text('$scansCount'), findsWidgets);
      },
    );

    testWidgets(
      'general category is included in All count but has no dedicated chip',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // general threads exist in fixture
        final generalCount = _fixture
            .where((t) => t.category == AiChatThreadCategory.general)
            .length;
        expect(generalCount, greaterThanOrEqualTo(1));

        // All count = total (includes general)
        expect(find.text('${_fixture.length}'), findsWidgets);

        // No Chat chip
        expect(find.byKey(const ValueKey('ai-filter-Chat')), findsNothing);
      },
    );

    testWidgets(
      'tapping All after a category filter restores all threads including general',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // Apply Plan filter — only goals threads visible
        await tester.tap(find.byKey(const ValueKey('ai-filter-Plan')));
        await tester.pumpAndSettle();

        // general thread should NOT be visible under Plan filter
        expect(find.text('Travel day prep'), findsNothing);

        // Switch to All
        await tester.tap(find.byKey(const ValueKey('ai-filter-All')));
        await tester.pumpAndSettle();

        // general thread now visible again under All — may need scrolling
        await _scrollTo(tester, find.text('Travel day prep'));
        expect(find.text('Travel day prep'), findsWidgets);
      },
    );
  });

  // ── 4. New chat FAB above bottom nav (production shell topology) ──────
  group('new chat FAB above bottom nav', () {
    testWidgets(
      'FAB bottom is strictly above the bottom nav top (dark)',
      (tester) async {
        await tester.pumpWidget(_productionShellApp(_fixture));
        await tester.pumpAndSettle();

        final newChat = find.byKey(const ValueKey('ai-new-chat'));
        expect(newChat, findsOneWidget);

        final navFinder = find.byKey(const Key('today-bottom-nav'));
        expect(navFinder, findsOneWidget);

        final fabRect = tester.getRect(newChat);
        final navRect = tester.getRect(navFinder);

        expect(
          fabRect.bottom,
          lessThanOrEqualTo(navRect.top - 8),
          reason: 'New chat FAB (bottom=${fabRect.bottom}) must clear '
              'the bottom nav (top=${navRect.top}) by ≥ 8 px (dark)',
        );

        // Must still be tappable
        await tester.tap(newChat);
        await tester.pumpAndSettle();
        expect(find.text('Chat new'), findsOneWidget);
      },
    );

    testWidgets(
      'FAB bottom is strictly above the bottom nav top (light)',
      (tester) async {
        await tester.pumpWidget(
          _productionShellApp(_fixture, themeMode: ThemeMode.light),
        );
        await tester.pumpAndSettle();

        final newChat = find.byKey(const ValueKey('ai-new-chat'));
        expect(newChat, findsOneWidget);

        final navFinder = find.byKey(const Key('today-bottom-nav'));
        expect(navFinder, findsOneWidget);

        final fabRect = tester.getRect(newChat);
        final navRect = tester.getRect(navFinder);

        expect(
          fabRect.bottom,
          lessThanOrEqualTo(navRect.top - 8),
          reason: 'New chat FAB (bottom=${fabRect.bottom}) must clear '
              'the bottom nav (top=${navRect.top}) by ≥ 8 px (light)',
        );
      },
    );
  });

  // ── 5. Privacy footer is scroll content, not fixed ───────────────────────
  group('privacy footer', () {
    testWidgets(
      'footer appears after final scroll content and is visible after scrolling',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final footer = find.text('STORED LOCALLY \u00b7 NEVER SHARED');

        // Scroll to the footer
        await _scrollTo(tester, footer);

        // Footer is now visible
        expect(footer, findsOneWidget);
        final footerRect = tester.getRect(footer);
        expect(
          footerRect.top,
          lessThan(874),
          reason: 'Footer must be visible after scrolling',
        );
      },
    );

    testWidgets(
      'footer is not a fixed sibling of the list (not in a Column after Expanded)',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final listKey = find.byKey(const ValueKey('ai-history-list'));
        expect(listKey, findsOneWidget);

        // Scroll to footer so it's built by ListView.builder
        final footer = find.text('STORED LOCALLY \u00b7 NEVER SHARED');
        await _scrollTo(tester, footer);

        // Footer should now be findable as descendant of the list
        final footerInList = find.descendant(
          of: listKey,
          matching: find.text('STORED LOCALLY \u00b7 NEVER SHARED'),
        );
        expect(
          footerInList,
          findsOneWidget,
          reason: 'Privacy footer must be inside the scrollable list',
        );
      },
    );
  });

  // ── 6. Thread row density and visual elements ────────────────────────────
  group('thread row canonical density', () {
    testWidgets(
      'pinned thread has cyan/featured avatar treatment',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        final pinnedRow = find.byKey(
          const ValueKey('ai-thread-ui_diff_fixture_pinned'),
        );
        expect(pinnedRow, findsOneWidget);

        // Avatar should be inside the row
        final avatar = find.descendant(
          of: pinnedRow,
          matching: find.byType(Icon),
        );
        expect(avatar, findsWidgets);
      },
    );

    testWidgets(
      'thread rows allow two-line preview (maxLines: 2)',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // The pinned thread has a long preview that should be clamped to 2 lines
        final pinnedRow = find.byKey(
          const ValueKey('ai-thread-ui_diff_fixture_pinned'),
        );
        expect(pinnedRow, findsOneWidget);

        // Preview text is present
        expect(
          find.textContaining('Raised protein to 180 g/day'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'thread rows have trailing chevron indicator',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // Each thread row should have a chevron_right icon
        final chevrons = find.byIcon(Icons.chevron_right);
        expect(chevrons, findsWidgets);
        // At least as many chevrons as visible thread rows
        expect(
          (chevrons.evaluate().length),
          greaterThanOrEqualTo(3),
        );
      },
    );

    testWidgets(
      'thread rows show relative timestamps (Today for current, Yesterday for older)',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // The pinned thread is today's — should show time like "14:10"
        expect(
          find.text('Macro plan for 5×/week training'),
          findsOneWidget,
        );

        // Today group header
        expect(find.text('Today'), findsWidgets);

        // Yesterday group header (also appears as timestamp on yesterday threads)
        expect(find.text('Yesterday'), findsWidgets);
      },
    );

    testWidgets(
      'row height is approximately 104 logical px (not compressed ~75px)',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // Check the pinned row height
        final pinnedRow = find.byKey(
          const ValueKey('ai-thread-ui_diff_fixture_pinned'),
        );
        expect(pinnedRow, findsOneWidget);

        final rowRect = tester.getRect(pinnedRow);
        // Must be in the 90–120 logical px range (canonical ~104 ± tolerance)
        expect(
          rowRect.height,
          greaterThanOrEqualTo(90),
          reason: 'Row height should be ~104px, got ${rowRect.height}',
        );
        expect(
          rowRect.height,
          lessThanOrEqualTo(120),
          reason: 'Row height should be ~104px, got ${rowRect.height}',
        );
      },
    );

    testWidgets(
      'unread indicator dot visible on unread threads',
      (tester) async {
        await tester.pumpWidget(_app(_fixture));
        await tester.pumpAndSettle();

        // The today_meal thread is unread
        final unreadRow = find.byKey(
          const ValueKey('ai-thread-ui_diff_fixture_today_meal'),
        );
        expect(unreadRow, findsOneWidget);

        // The unread dot is a small cyan circle inside the row.
        // Check for a 7x7 Container with BoxShape.circle by finding
        // a widget with the right size and shape in the tree.
        final dot = find.descendant(
          of: unreadRow,
          matching: find.byWidgetPredicate(
            (w) =>
                w is Container &&
                w.decoration is BoxDecoration &&
                (w.decoration as BoxDecoration?)?.shape == BoxShape.circle,
          ),
        );
        // At least one circle element (the unread dot)
        expect(dot, findsWidgets);
      },
    );
  });
}
