import 'package:calorix/core/router/route_names.dart';
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

    test('covers every category: meals, goals, scans, general', () {
      final cats = _populatedFixture.map((t) => t.category).toSet();
      expect(
          cats,
          containsAll([
            AiChatThreadCategory.meals,
            AiChatThreadCategory.goals,
            AiChatThreadCategory.scans,
            AiChatThreadCategory.general,
          ]));
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
        'renders category filter chips: All, Plan, Meal edits, Nutrition, Chat',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      expect(find.text('All'), findsOneWidget);
      expect(find.text('Plan'), findsOneWidget);
      expect(find.text('Meal edits'), findsOneWidget);
      expect(find.text('Nutrition'), findsOneWidget);
      expect(find.text('Chat'), findsOneWidget);
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

      expect(find.text('Yesterday'), findsOneWidget);
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

      expect(find.text('PLAN'), findsWidgets);
      expect(find.text('MEAL'), findsWidgets);
      expect(find.text('SCAN'), findsWidgets);
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

      expect(
        find.textContaining('STORED LOCALLY'),
        findsOneWidget,
      );
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

    testWidgets('tapping Chat filter shows only general-category threads',
        (tester) async {
      await tester.pumpWidget(_app(_populatedFixture));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('ai-filter-Chat')));
      await tester.pumpAndSettle();

      expect(find.text('Travel day prep'), findsOneWidget);
      expect(find.text('Chicken Rice Bowl — wrong scan'), findsNothing);
      expect(find.text('Macro plan for 5×/week training'), findsNothing);
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
      expect(find.text('Yesterday'), findsOneWidget);
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
      expect(find.text('Local before midnight'), findsOneWidget);
      expect(find.text('Yesterday'), findsOneWidget);
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
}
