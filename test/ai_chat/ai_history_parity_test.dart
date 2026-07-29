import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/core/theme/app_colors.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/debug/ui_diff_fixture.dart';
import 'package:calorix/features/ai_chat/ai_history_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/shared/models/ai_chat_thread.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// The canonical 12-thread populated fixture matching the handoff IA. This
/// is the single production source of truth (`populatedAiThreadsFixture`
/// backs both the physical ui-diff capture and this test) — do not
/// re-declare a private duplicate list here.
List<AiChatThread> get _populatedFixture => populatedAiThreadsFixture(
      uid: 'user-1',
      now: DateTime.utc(2026, 7, 28, 14, 10),
    );

/// Scrolls the thread list until [finder] is visible; the 12-thread fixture
/// does not fit in the default widget-test viewport. Targets the thread
/// list's own scrollable explicitly — the horizontal category-filter row
/// above it is also a `Scrollable` and would otherwise be matched first.
Future<void> _scrollToVisible(WidgetTester tester, Finder finder) =>
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
  // ---- Model backward compatibility ----
  group('AiChatThread legacy compatibility', () {
    test('old document without new fields parses with defaults', () {
      final thread = AiChatThread.fromMap('uid-1', 't1', {
        'uid': 'uid-1',
        'title': 'Old thread',
        'preview': 'Old preview',
        'createdAt': DateTime.utc(2026, 7, 20),
        'updatedAt': DateTime.utc(2026, 7, 21),
      });
      expect(thread.id, 't1');
      expect(thread.pinned, false);
      expect(thread.category, AiChatThreadCategory.general);
      expect(thread.unread, false);
      expect(thread.appliedActionCount, 0);
    });

    test('round-trip preserves all new fields', () {
      final original = AiChatThread(
        id: 'rt1',
        uid: 'user-1',
        createdAt: DateTime.utc(2026, 7, 28, 10),
        updatedAt: DateTime.utc(2026, 7, 28, 12),
        title: 'Round trip',
        preview: 'Full fields',
        pinned: true,
        category: AiChatThreadCategory.meals,
        unread: true,
        appliedActionCount: 3,
        linkedMealId: 'meal-1',
      );
      final map = original.toMap();
      final restored = AiChatThread.fromMap(original.uid, original.id, map);
      expect(restored.pinned, true);
      expect(restored.category, AiChatThreadCategory.meals);
      expect(restored.unread, true);
      expect(restored.appliedActionCount, 3);
      expect(restored.linkedMealId, 'meal-1');
      expect(restored.title, 'Round trip');
    });

    test('unknown category wire value falls back to general', () {
      final thread = AiChatThread.fromMap('u', 't', {
        'category': 'unknown_wire',
        'createdAt': DateTime.utc(2026),
        'updatedAt': DateTime.utc(2026),
      });
      expect(thread.category, AiChatThreadCategory.general);
    });
  });

  // ---- Fixture count and content ----
  group('populated fixture', () {
    test('contains exactly 12 threads', () {
      expect(_populatedFixture, hasLength(12));
    });

    test('covers pinned, today, yesterday, earlier groups', () {
      final ids = _populatedFixture.map((t) => t.id).toSet();
      expect(ids, contains('ui_diff_fixture_pinned'));
      expect(ids, contains('ui_diff_fixture_today_meal'));
      expect(ids, contains('ui_diff_fixture_yesterday_meal'));
      expect(ids, contains('ui_diff_fixture_earlier_plan'));
    });

    test(
        'covers every captured category: meals, goals, scans (general excluded from fixture)',
        () {
      final cats = _populatedFixture.map((t) => t.category).toSet();
      expect(
          cats,
          containsAll([
            AiChatThreadCategory.meals,
            AiChatThreadCategory.goals,
            AiChatThreadCategory.scans,
          ]));
      // General is preserved in the product but not in the fixture
      expect(cats, isNot(contains(AiChatThreadCategory.general)));
    });

    test('includes unread and read threads', () {
      expect(
        _populatedFixture.where((t) => t.unread).length,
        greaterThanOrEqualTo(1),
      );
      expect(
        _populatedFixture.where((t) => !t.unread).length,
        greaterThanOrEqualTo(1),
      );
    });

    test('includes threads with appliedActionCount > 0', () {
      expect(
        _populatedFixture.where((t) => t.appliedActionCount > 0).length,
        greaterThanOrEqualTo(2),
      );
    });

    test('includes a linked-meal thread', () {
      expect(
        _populatedFixture.any((t) => t.linkedMealId != null),
        isTrue,
      );
    });
  });

  // ---- Rendering: populated state ----
  group('AiHistoryScreen populated rendering', () {
    testWidgets('shows compact header with thread count chip', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      expect(find.text('Chats'), findsOneWidget);
      expect(find.textContaining('THREAD'), findsOneWidget);
    });

    testWidgets('renders search bar', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('Search'),
        findsOneWidget,
      );
    });

    testWidgets(
        'renders category filter chips: All, Plan, Meal edits, Nutrition',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      expect(find.text('All'), findsOneWidget);
      expect(find.text('Plan'), findsOneWidget);
      expect(find.text('Meal edits'), findsOneWidget);
      expect(find.text('Nutrition'), findsOneWidget);
      // No standalone "Chat" filter chip — general threads show under "All"
      expect(find.byKey(const ValueKey('ai-filter-Chat')), findsNothing);
    });

    testWidgets('shows Pinned section with pinned thread', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      expect(find.text('Pinned'), findsOneWidget);
      expect(
        find.text('Macro plan for 5×/week training'),
        findsOneWidget,
      );
    });

    testWidgets('shows Today date group', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      expect(find.text('Today'), findsWidgets);
    });

    testWidgets('shows Yesterday date group', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      // "Yesterday" appears as both the date group header and as relative
      // timestamps on yesterday's threads (relative to DateTime.now).
      expect(find.text('Yesterday'), findsWidgets);
    });

    testWidgets('shows Earlier date group', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await _scrollToVisible(tester, find.text('Earlier this week'));
      expect(find.text('Earlier this week'), findsOneWidget);
    });

    testWidgets('renders category tag chips on thread rows', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      // PLAN and MEAL EDIT tags are visible in the first two groups.
      expect(find.text('PLAN'), findsWidgets);
      expect(find.text('MEAL EDIT'), findsWidgets);
      // NUTRITION tags may be below the fold — scroll down to reveal them.
      final scrollable = find.descendant(
        of: find.byKey(const ValueKey('ai-history-list')),
        matching: find.byType(Scrollable),
      );
      await tester.drag(scrollable, const Offset(0, -2000));
      await tester.pumpAndSettle();
      expect(find.text('NUTRITION'), findsWidgets);
    });

    testWidgets('renders APPLIED action count for threads with actions',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      expect(find.textContaining('APPLIED'), findsWidgets);
    });

    testWidgets('renders privacy footer', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      // Footer is now inside the scrollable list — scroll to find it
      final footer = find.textContaining('STORED LOCALLY');
      await _scrollToVisible(tester, footer);
      expect(footer, findsOneWidget);
    });

    testWidgets('renders New chat FAB', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      expect(find.text('New chat'), findsOneWidget);
    });

    testWidgets('tapping thread navigates to chat', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.tap(
        find.text('Chicken Rice Bowl — wrong scan'),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Chat ui_diff_fixture_today_meal'),
        findsOneWidget,
      );
    });
  });

  // ---- Category filter ----
  group('category filter', () {
    testWidgets('tapping Meal edits filter shows only meals-category threads',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('ai-filter-Meal edits')));
      await tester.pumpAndSettle();

      expect(find.text('Chicken Rice Bowl — wrong scan'), findsOneWidget);
      expect(find.text('What can I still eat tonight?'), findsNothing);
      expect(find.text('Macro plan for 5×/week training'), findsNothing);
    });

    testWidgets('tapping Plan filter shows only goals-category threads',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('ai-filter-Plan')));
      await tester.pumpAndSettle();

      expect(find.text('Macro plan for 5×/week training'), findsOneWidget);
      expect(find.text('What can I still eat tonight?'), findsOneWidget);
      expect(find.text('Chicken Rice Bowl — wrong scan'), findsNothing);
    });

    testWidgets('tapping Nutrition filter shows only scans-category threads',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('ai-filter-Nutrition')));
      await tester.pumpAndSettle();

      expect(find.text('Espresso scan check'), findsOneWidget);
      expect(find.text('Chicken Rice Bowl — wrong scan'), findsNothing);
      expect(find.text('Macro plan for 5×/week training'), findsNothing);
    });

    testWidgets(
        'general-category threads are visible under All filter (no Chat chip)',
        (tester) async {
      // Inject a custom general thread to prove the category is still
      // supported in product filtering/tagging, without fixture dependency.
      final customGeneral = AiChatThread(
        id: 'custom-general-1',
        uid: 'user-1',
        title: 'Custom general question',
        preview: 'Injected general thread for testing.',
        category: AiChatThreadCategory.general,
        createdAt: DateTime.utc(2026, 7, 29, 10),
        updatedAt: DateTime.utc(2026, 7, 29, 10),
      );
      await tester.pumpWidget(
        _app([..._populatedFixture, customGeneral]),
      );
      await tester.pumpAndSettle();

      // The custom general thread should appear under "All".
      final generalThread = find.text('Custom general question');
      await _scrollToVisible(tester, generalThread);
      expect(generalThread, findsOneWidget);
      // No standalone Chat filter chip
      expect(find.byKey(const ValueKey('ai-filter-Chat')), findsNothing);
    });

    testWidgets('tapping All after a filter restores every thread',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('ai-filter-Meal edits')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('ai-filter-All')));
      await tester.pumpAndSettle();

      expect(find.text('Macro plan for 5×/week training'), findsOneWidget);
      expect(find.text('Chicken Rice Bowl — wrong scan'), findsOneWidget);
    });

    testWidgets('filter with no matches is distinct from root empty state',
        (tester) async {
      final onlyMeal = AiChatThread(
        id: 'meal-only',
        uid: 'user-1',
        title: 'Solo meal thread',
        preview: 'Only meal-category thread present.',
        category: AiChatThreadCategory.meals,
        createdAt: DateTime.utc(2026, 7, 28, 10),
        updatedAt: DateTime.utc(2026, 7, 28, 10),
      );
      await tester.pumpWidget(_app([onlyMeal]));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('ai-filter-Nutrition')));
      await tester.pumpAndSettle();

      expect(find.text('No chats in Nutrition'), findsOneWidget);
      expect(find.text('No conversations yet'), findsNothing);
    });
  });

  // ---- Date-anchor bug regression ----
  group('date anchor from full snapshot', () {
    testWidgets(
        'filtering to only an old thread keeps it in Earlier, not Today',
        (tester) async {
      // "now" is 2026-07-28 14:10 UTC (matches the fixture base time).
      // The today thread is at 2026-07-28, the earlier thread is at
      // 2026-07-25 — three full days before the anchor.
      final todayThread = AiChatThread(
        id: 'anchor-today',
        uid: 'user-1',
        title: 'Today meal thread',
        preview: 'Recent.',
        category: AiChatThreadCategory.meals,
        createdAt: DateTime.utc(2026, 7, 28, 10),
        updatedAt: DateTime.utc(2026, 7, 28, 12),
      );
      final earlierThread = AiChatThread(
        id: 'anchor-earlier',
        uid: 'user-1',
        title: 'Old goals thread',
        preview: 'Way back.',
        category: AiChatThreadCategory.goals,
        createdAt: DateTime.utc(2026, 7, 25, 9),
        updatedAt: DateTime.utc(2026, 7, 25, 9),
      );
      await tester.pumpWidget(_app([todayThread, earlierThread]));
      await tester.pumpAndSettle();

      // Select the Plan (goals) filter — only the old thread remains.
      await tester.tap(find.byKey(const ValueKey('ai-filter-Plan')));
      await tester.pumpAndSettle();

      // The old thread must NOT appear under a "Today" header.
      expect(find.text('Old goals thread'), findsOneWidget);
      expect(find.text('Today'), findsNothing);
      // It should appear under an Earlier-style header instead.
      expect(find.text('Earlier this week'), findsOneWidget);
    });
  });

  // ---- UTC timezone parity ----
  group('UTC-anchored grouping around calendar-day boundary', () {
    testWidgets(
        'threads straddling UTC midnight are grouped against UTC midnight, '
        'not local-offset midnight', (tester) async {
      // Anchor: 2026-07-29 00:05 UTC (5 minutes after UTC midnight).
      //
      // Without the fix the midnight boundary is constructed via the local
      // DateTime constructor, so on any machine whose local offset is ≠ 0
      // the boundary shifts away from UTC 00:00 and the pre-midnight thread
      // (23:59 UTC Jul 28) is misclassified as "Today".
      //
      // A third "sentinel" thread far in the future ensures the dateAnchor
      // (derived from the full snapshot) lands on Jul 29 UTC, not Jul 28.
      final anchor = DateTime.utc(2026, 7, 29, 0, 5);

      final beforeMidnight = AiChatThread(
        id: 'utc-before',
        uid: 'user-1',
        title: 'Thread before UTC midnight',
        preview: '23:59 UTC on Jul 28',
        category: AiChatThreadCategory.meals,
        createdAt: DateTime.utc(2026, 7, 28, 23, 59),
        updatedAt: DateTime.utc(2026, 7, 28, 23, 59),
      );
      final afterMidnight = AiChatThread(
        id: 'utc-after',
        uid: 'user-1',
        title: 'Thread after UTC midnight',
        preview: '00:01 UTC on Jul 29',
        category: AiChatThreadCategory.general,
        createdAt: DateTime.utc(2026, 7, 29, 0, 1),
        updatedAt: DateTime.utc(2026, 7, 29, 0, 1),
      );
      // Sentinel: forces the full-snapshot dateAnchor to Jul 29.
      final sentinel = AiChatThread(
        id: 'utc-sentinel',
        uid: 'user-1',
        title: 'Sentinel thread',
        preview: 'Anchor anchor',
        category: AiChatThreadCategory.scans,
        createdAt: anchor,
        updatedAt: anchor,
      );

      await tester.pumpWidget(
        _app([beforeMidnight, afterMidnight, sentinel]),
      );
      await tester.pumpAndSettle();

      // afterMidnight (00:01 UTC Jul 29) must appear under "Today".
      expect(find.text('Thread after UTC midnight'), findsOneWidget);
      expect(find.text('Today'), findsWidgets);

      // beforeMidnight (23:59 UTC Jul 28) must appear under "Yesterday".
      expect(find.text('Thread before UTC midnight'), findsOneWidget);
      expect(find.text('Yesterday'), findsWidgets);
    });

    testWidgets('local-anchored threads still group against local midnight',
        (tester) async {
      // Same thread timestamps, but now the anchor is local.
      // On any machine the local midnight boundary must match the local anchor.
      final anchor = DateTime(2026, 7, 29, 0, 5);

      final beforeMidnight = AiChatThread(
        id: 'local-before',
        uid: 'user-1',
        title: 'Local before midnight',
        preview: 'Local 23:59',
        category: AiChatThreadCategory.meals,
        createdAt: DateTime(2026, 7, 28, 23, 59),
        updatedAt: DateTime(2026, 7, 28, 23, 59),
      );
      final afterMidnight = AiChatThread(
        id: 'local-after',
        uid: 'user-1',
        title: 'Local after midnight',
        preview: 'Local 00:01',
        category: AiChatThreadCategory.general,
        createdAt: DateTime(2026, 7, 29, 0, 1),
        updatedAt: DateTime(2026, 7, 29, 0, 1),
      );
      final sentinel = AiChatThread(
        id: 'local-sentinel',
        uid: 'user-1',
        title: 'Local sentinel',
        preview: 'Anchor',
        category: AiChatThreadCategory.scans,
        createdAt: anchor,
        updatedAt: anchor,
      );

      await tester.pumpWidget(
        _app([beforeMidnight, afterMidnight, sentinel]),
      );
      await tester.pumpAndSettle();

      // After-midnight thread must be "Today" relative to the local anchor.
      expect(find.text('Local after midnight'), findsOneWidget);
      expect(find.text('Today'), findsWidgets);

      // Before-midnight thread must be "Yesterday" relative to the local anchor.
      // "Yesterday" appears as both the group header and relative timestamp.
      expect(find.text('Local before midnight'), findsOneWidget);
      expect(find.text('Yesterday'), findsWidgets);
    });
  });

  // ---- Search ----
  group('search', () {
    testWidgets('search filters by title and preview text', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const ValueKey('ai-history-search')),
        'espresso',
      );
      await tester.pumpAndSettle();

      expect(find.text('Espresso scan check'), findsOneWidget);
      expect(find.text('Macro plan for 5×/week training'), findsNothing);
    });

    testWidgets('search with no matches is distinct from root empty state',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const ValueKey('ai-history-search')),
        'zzz-no-match-zzz',
      );
      await tester.pumpAndSettle();

      expect(find.text('No matching chats'), findsOneWidget);
      expect(find.text('No conversations yet'), findsNothing);
    });

    testWidgets('combined filter and search narrows further', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('ai-filter-Plan')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('ai-history-search')),
        'protein target',
      );
      await tester.pumpAndSettle();

      expect(find.text('Protein target review'), findsOneWidget);
      expect(find.text('What can I still eat tonight?'), findsNothing);
    });
  });

  // ---- Rendering: root empty state ----
  group('AiHistoryScreen root empty state', () {
    testWidgets('shows root empty state when no threads exist', (tester) async {
      await tester.pumpWidget(_app(const []));
      await tester.pumpAndSettle();

      expect(find.text('No conversations yet'), findsOneWidget);
      expect(find.text('Start a chat'), findsOneWidget);
    });

    testWidgets('root empty state in light theme', (tester) async {
      await tester.pumpWidget(_app(const [], themeMode: ThemeMode.light));
      await tester.pumpAndSettle();

      expect(find.text('No conversations yet'), findsOneWidget);
    });
  });

  // ---- Delete interaction ----
  group('delete interaction', () {
    testWidgets('swipe delete asks for confirmation', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.drag(
        find.byKey(const ValueKey('ai-thread-ui_diff_fixture_today_meal')),
        const Offset(-400, 0),
      );
      await tester.pumpAndSettle();

      expect(find.text('Delete conversation?'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Delete'), findsOneWidget);
    });
  });

  // ---- New chat FAB interaction ----
  group('new chat FAB', () {
    testWidgets('tapping New chat navigates to chat screen', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.tap(find.text('New chat'));
      await tester.pumpAndSettle();

      expect(find.text('Chat new'), findsOneWidget);
    });
  });

  // ---- Dark and light theme anchors ----
  group('theme anchors', () {
    testWidgets('renders without error in dark theme', (tester) async {
      await tester
          .pumpWidget(_app(_populatedFixture, themeMode: ThemeMode.dark));
      await tester.pumpAndSettle();

      expect(find.text('Chats'), findsOneWidget);
      expect(find.byType(AiHistoryScreen), findsOneWidget);
    });

    testWidgets('renders without error in light theme', (tester) async {
      await tester.pumpWidget(
        _app(_populatedFixture, themeMode: ThemeMode.light),
      );
      await tester.pumpAndSettle();

      expect(find.text('Chats'), findsOneWidget);
      expect(find.byType(AiHistoryScreen), findsOneWidget);
    });
  });

  // ---- Stage A: Visual parity contracts ----
  group('Stage A visual parity', () {
    test(
        'fixture has exact category counts: All 12, Plan 4, Meals 5, Scans 3, General 0',
        () {
      final goalsCount = _populatedFixture
          .where((t) => t.category == AiChatThreadCategory.goals)
          .length;
      final mealsCount = _populatedFixture
          .where((t) => t.category == AiChatThreadCategory.meals)
          .length;
      final scansCount = _populatedFixture
          .where((t) => t.category == AiChatThreadCategory.scans)
          .length;
      final generalCount = _populatedFixture
          .where((t) => t.category == AiChatThreadCategory.general)
          .length;
      expect(_populatedFixture, hasLength(12));
      expect(goalsCount, 4);
      expect(mealsCount, 5);
      expect(scansCount, 3);
      expect(generalCount, 0);
    });

    test('fixture date groups: Pinned 1, Today 2, Yesterday 2, Earlier 7', () {
      final now = DateTime.utc(2026, 7, 28, 14, 10);
      final todayStart = DateTime.utc(now.year, now.month, now.day);
      final yesterdayStart = todayStart.subtract(const Duration(days: 1));

      final pinned = _populatedFixture.where((t) => t.pinned).length;
      final today = _populatedFixture
          .where((t) => !t.pinned && !t.updatedAt.isBefore(todayStart))
          .length;
      final yesterday = _populatedFixture
          .where((t) =>
              !t.pinned &&
              t.updatedAt.isBefore(todayStart) &&
              !t.updatedAt.isBefore(yesterdayStart))
          .length;
      final earlier = _populatedFixture
          .where((t) => t.updatedAt.isBefore(yesterdayStart))
          .length;

      expect(pinned, 1);
      expect(today, 2);
      expect(yesterday, 2);
      expect(earlier, 7);
    });

    testWidgets('count chip shows exact text "+ 12 THREADS"', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      expect(find.text('+ 12 THREADS'), findsOneWidget);
    });

    testWidgets('count chip singular: "+ 1 THREAD" for single thread',
        (tester) async {
      final single = [_populatedFixture.first];
      await tester.pumpWidget(_app(single));
      await tester.pumpAndSettle();

      expect(find.text('+ 1 THREAD'), findsOneWidget);
      expect(find.text('+ 1 THREADS'), findsNothing);
    });

    testWidgets('DateGroupHeader shows right-aligned count for every group',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      // Verify each group header exists via stable key and asserts
      // its exact label + rendered count.
      final pinnedHeader = find.byKey(
        const ValueKey('ai-history-group-Pinned'),
      );
      expect(pinnedHeader, findsOneWidget);
      expect(
        find.descendant(
          of: pinnedHeader,
          matching: find.text('Pinned'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: pinnedHeader,
          matching: find.text('1'),
        ),
        findsOneWidget,
      );

      final todayHeader = find.byKey(
        const ValueKey('ai-history-group-Today'),
      );
      expect(todayHeader, findsOneWidget);
      expect(
        find.descendant(
          of: todayHeader,
          matching: find.text('Today'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: todayHeader,
          matching: find.text('2'),
        ),
        findsOneWidget,
      );

      // Scroll Yesterday header into view via bounded drags on the
      // keyed list itself (not a Scrollable descendant).
      final yesterdayHeader = find.byKey(
        const ValueKey('ai-history-group-Yesterday'),
      );
      final listKey = find.byKey(const ValueKey('ai-history-list'));
      for (var i = 0; i < 20 && !yesterdayHeader.evaluate().isNotEmpty; i++) {
        await tester.drag(listKey, const Offset(0, -200));
        await tester.pumpAndSettle();
      }
      expect(yesterdayHeader, findsOneWidget);
      expect(
        find.descendant(
          of: yesterdayHeader,
          matching: find.text('Yesterday'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: yesterdayHeader,
          matching: find.text('2'),
        ),
        findsOneWidget,
      );

      // Scroll Earlier header into view via bounded drags on the keyed list.
      final earlierHeader = find.byKey(
        const ValueKey('ai-history-group-Earlier this week'),
      );
      for (var i = 0; i < 20 && !earlierHeader.evaluate().isNotEmpty; i++) {
        await tester.drag(listKey, const Offset(0, -200));
        await tester.pumpAndSettle();
      }
      expect(earlierHeader, findsOneWidget);
      expect(
        find.descendant(
          of: earlierHeader,
          matching: find.text('Earlier this week'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: earlierHeader,
          matching: find.text('7'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('Pinned group header has push-pin icon', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      // Find the pin icon near the "Pinned" label
      final pinnedHeader = find.ancestor(
        of: find.text('Pinned'),
        matching: find.byType(Row),
      );
      expect(pinnedHeader, findsWidgets);

      // The push_pin icon should be present in the pinned header area
      final pinIcon = find.descendant(
        of: pinnedHeader.first,
        matching: find.byIcon(Icons.push_pin),
      );
      expect(pinIcon, findsOneWidget);
    });

    testWidgets('first header row is 36 logical px tall', (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      final headerRow = find.byKey(
        const ValueKey('ai-history-header-row'),
      );
      expect(headerRow, findsOneWidget);
      expect(tester.getSize(headerRow).height, 36);
    });

    testWidgets('search bar rendered bounds use transformed canonical insets',
        (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      final searchField = find.byKey(const ValueKey('ai-history-search'));
      expect(searchField, findsOneWidget);

      final searchRect = tester.getRect(searchField);
      expect(
        searchRect.left,
        closeTo((17 - 4.35) / 1.0925, 0.01),
        reason: 'Search left edge must map to canonical comparison x17',
      );
      expect(
        searchRect.right,
        closeTo((387 - 4.35) / 1.0925, 0.01),
        reason: 'Search right edge must map to canonical comparison x387',
      );
    });

    testWidgets('filter ListView has transformed 17px horizontal padding',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      final filterList = find.byKey(const ValueKey('ai-history-filters'));
      expect(filterList, findsOneWidget);

      final listView = filterList.evaluate().first.widget as ListView;
      expect(
        listView.padding,
        const EdgeInsets.symmetric(horizontal: (17 - 4.35) / 1.0925),
      );
    });

    testWidgets('thread ListView has 11 logical px horizontal padding',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      final threadList = find.byKey(const ValueKey('ai-history-list'));
      expect(threadList, findsOneWidget);

      // The thread ListView has padding as a direct property, not a Padding ancestor.
      final listView = threadList.evaluate().first.widget as ListView;
      expect(
        listView.padding,
        const EdgeInsets.fromLTRB(11, 4, 11, 96),
      );
    });

    testWidgets(
        'light theme: unselected filter count text uses theme-aware muted color',
        (tester) async {
      await tester.pumpWidget(
        _app(_populatedFixture, themeMode: ThemeMode.light),
      );
      await tester.pumpAndSettle();

      // The "Plan" chip is unselected by default
      final planChip = find.byKey(const ValueKey('ai-filter-Plan'));
      expect(planChip, findsOneWidget);

      final countText = find.descendant(
        of: planChip,
        matching: find.byWidgetPredicate(
          (w) => w is Text && w.data == '4',
        ),
      );
      expect(countText, findsOneWidget);

      final textWidget = countText.evaluate().first.widget as Text;
      expect(
        textWidget.style?.fontSize,
        closeTo(10 / 1.0925, 0.01),
        reason: 'Filter count uses the transformed canonical 10px size',
      );
      expect(
        textWidget.style?.color,
        AppColors.textSecondaryLight,
        reason: 'Unselected filter count must use theme-aware muted color, '
            'not hardcoded textSecondaryDark',
      );
    });

    testWidgets(
        'general category still supported: injected thread visible under All',
        (tester) async {
      final general = AiChatThread(
        id: 'test-general',
        uid: 'user-1',
        title: 'Injected general question',
        preview: 'Testing general category support.',
        category: AiChatThreadCategory.general,
        createdAt: DateTime.utc(2026, 7, 29, 10),
        updatedAt: DateTime.utc(2026, 7, 29, 10),
      );
      await tester.pumpWidget(_app([..._populatedFixture, general]));
      await tester.pumpAndSettle();

      final generalThread = find.text('Injected general question');
      await _scrollToVisible(tester, generalThread);
      expect(generalThread, findsOneWidget);

      // No Chat filter chip — general shows only under All
      expect(find.byKey(const ValueKey('ai-filter-Chat')), findsNothing);
    });

    testWidgets('groups sort threads descending by updatedAt within each group',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      // Yesterday group: Greek yogurt (updatedAt 21:42) should appear before
      // Espresso scan check (updatedAt 8:15) — both in Yesterday group.
      final greekYogurt = find.byKey(
        const ValueKey('ai-thread-ui_diff_fixture_yesterday_meal'),
      );
      final espressoScan = find.byKey(
        const ValueKey('ai-thread-ui_diff_fixture_today_scan'),
      );

      // Scroll both into view by dragging the keyed list directly
      final listKey = find.byKey(const ValueKey('ai-history-list'));
      for (var i = 0; i < 20; i++) {
        if (greekYogurt.evaluate().isNotEmpty &&
            espressoScan.evaluate().isNotEmpty) {
          break;
        }
        await tester.drag(listKey, const Offset(0, -200));
        await tester.pumpAndSettle();
      }

      // Both should be visible now
      expect(greekYogurt, findsOneWidget);
      expect(espressoScan, findsOneWidget);

      // Greek yogurt (updatedAt 21:42) should render above Espresso scan
      // (updatedAt 8:15) — confirmed via actual rendered top positions.
      final greekYogurtTop = tester.getRect(greekYogurt).top;
      final espressoScanTop = tester.getRect(espressoScan).top;

      expect(
        greekYogurtTop,
        lessThan(espressoScanTop),
        reason: 'Greek yogurt (updatedAt 21:42) must render above '
            'Espresso scan (updatedAt 8:15) within Yesterday group; '
            'got greekYogurtTop=$greekYogurtTop, espressoScanTop=$espressoScanTop',
      );
    });
  });
}
