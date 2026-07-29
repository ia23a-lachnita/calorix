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
// Stage D: row rhythm and New-chat-plus alignment, corrected against the
// canonical dark reference (docs/design-handoff/placeholder-app/
// reference-images/ai_history--dark.png, 402x874) using the physical-device
// comparison-space transform recorded for deterministic run
// run-1785345181210-6a2d9f: uniform-contain scale 0.3641666667
// physical->comparison, x offset 4.35, y offset 0.
//
// The harness below renders at the exact physical-device logical viewport
// (1080x2400 physical @ DPR 3 = 360x800 logical) so comparison-space deltas
// convert to logical deltas via logicalDelta = comparisonDelta /
// (3 * 0.3641666667).
//
// Row-top/chip assertions below compare *relative* positions (row-to-row
// deltas, and chip-offset-within-its-row) rather than absolute page-top
// positions. A diagnostic run (test/ai_chat/_scratch_diag_test.dart,
// deleted before commit) found that this widget-test sandbox renders the
// AiHistoryScreen header/subtitle/search/filter stack roughly 12 logical px
// shorter overall than the physical-device capture behind the canonical
// comparison-space measurements, even though the source is byte-identical
// (verified via `git diff 3a12df5..HEAD -- lib/features/ai_chat/
// ai_history_screen.dart`, no changes). That header-stack discrepancy is a
// widget-test-vs-device rendering variance in code Stage D does not touch
// (header/subtitle/search/filters were fixed in prior stages), so absolute
// canonical positions are not reliable in this harness. Relative deltas
// within the thread list are immune to that variance and isolate exactly
// what Stage D's two production changes affect: ListView top content
// padding and per-row vertical padding.
// ---------------------------------------------------------------------------

const double _kCompToLogicalFactor = 1.0925; // 3 * 0.3641666667

double _logicalY(double comparisonY) => comparisonY / _kCompToLogicalFactor;

List<AiChatThread> get _fixture => populatedAiThreadsFixture(
      uid: 'user-1',
      now: DateTime.utc(2026, 7, 28, 14, 10),
    );

/// Production-shell harness matching real AppShell layout (same pattern as
/// Stage B's `_productionShellApp`), used at the physical-device logical
/// viewport set up by [_pumpAtPhysicalViewport].
Widget _physicalShellApp(
  List<AiChatThread> threads, {
  ThemeMode themeMode = ThemeMode.dark,
}) {
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
      themeMode: themeMode,
      routerConfig: router,
    ),
  );
}

Future<void> _pumpAtPhysicalViewport(
  WidgetTester tester,
  Widget widget,
) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(widget);
  await tester.pumpAndSettle();
}

const _pinnedSurfaceKey =
    ValueKey('ai-thread-surface-ui_diff_fixture_pinned');
const _todayMealSurfaceKey =
    ValueKey('ai-thread-surface-ui_diff_fixture_today_meal');
const _todayPlanSurfaceKey =
    ValueKey('ai-thread-surface-ui_diff_fixture_today_plan');

void main() {
  group('Stage D row rhythm at the physical-device viewport', () {
    testWidgets(
      'ListView applies the intended 4 logical px top content padding '
      'above the Pinned group (closing the canonical ~4-comparison-px '
      'upward offset)',
      (tester) async {
        await _pumpAtPhysicalViewport(tester, _physicalShellApp(_fixture));

        final listRect =
            tester.getRect(find.byKey(const ValueKey('ai-history-list')));
        final groupHeaderRect = tester.getRect(
          find.byKey(const ValueKey('ai-history-group-Pinned')),
        );
        final pinnedRect = tester.getRect(find.byKey(_pinnedSurfaceKey));

        final topPadding =
            pinnedRect.top - listRect.top - groupHeaderRect.height;
        expect(
          topPadding,
          closeTo(4, 1),
          reason: 'ListView content top padding should be 4 logical px, '
              'got $topPadding',
        );
      },
    );

    testWidgets(
      'pinned/today_meal/today_plan rows are each about 97 logical px tall',
      (tester) async {
        await _pumpAtPhysicalViewport(tester, _physicalShellApp(_fixture));

        final rects = [
          tester.getRect(find.byKey(_pinnedSurfaceKey)),
          tester.getRect(find.byKey(_todayMealSurfaceKey)),
          tester.getRect(find.byKey(_todayPlanSurfaceKey)),
        ];

        for (final rect in rects) {
          expect(
            rect.height,
            closeTo(97, 2),
            reason: 'row height drifted from the canonical ~97px rhythm, '
                'got ${rect.height}',
          );
        }
      },
    );

    testWidgets(
      'row-to-row top deltas track canonical comparison-space progression '
      '(y309 -> y460 -> y575), protecting cumulative lower-row alignment',
      (tester) async {
        await _pumpAtPhysicalViewport(tester, _physicalShellApp(_fixture));

        final pinnedTop = tester.getRect(find.byKey(_pinnedSurfaceKey)).top;
        final todayMealTop =
            tester.getRect(find.byKey(_todayMealSurfaceKey)).top;
        final todayPlanTop =
            tester.getRect(find.byKey(_todayPlanSurfaceKey)).top;

        expect(
          todayMealTop - pinnedTop,
          closeTo(_logicalY(460) - _logicalY(309), 2),
          reason: 'pinned -> today_meal top delta drifted from canonical, '
              'got ${todayMealTop - pinnedTop}',
        );
        expect(
          todayPlanTop - todayMealTop,
          closeTo(_logicalY(575) - _logicalY(460), 2),
          reason: 'today_meal -> today_plan top delta drifted from '
              'canonical, got ${todayPlanTop - todayMealTop}',
        );
      },
    );
  });

  group('Stage D today_plan PLAN chip position (G1)', () {
    testWidgets(
      'primary PLAN chip is keyed, aligns to the canonical band offset '
      'within its row (comparison y656..665 within y575..681), and stays '
      'inside its row',
      (tester) async {
        await _pumpAtPhysicalViewport(tester, _physicalShellApp(_fixture));

        const chipKey =
            ValueKey('ai-thread-tag-ui_diff_fixture_today_plan');
        expect(find.byKey(chipKey), findsOneWidget);

        final chipRect = tester.getRect(find.byKey(chipKey));
        final rowRect = tester.getRect(find.byKey(_todayPlanSurfaceKey));

        final expectedOffset =
            _logicalY((656 + 665) / 2) - _logicalY(575);
        expect(
          chipRect.center.dy - rowRect.top,
          closeTo(expectedOffset, 3),
          reason: 'PLAN chip vertical offset within its row drifted from '
              'the canonical band, got '
              '${chipRect.center.dy - rowRect.top} vs expected '
              '$expectedOffset',
        );
        expect(
          rowRect.contains(chipRect.topLeft),
          isTrue,
          reason: 'PLAN chip top-left must stay inside its own row',
        );
        expect(
          rowRect.contains(chipRect.bottomRight),
          isTrue,
          reason: 'PLAN chip bottom-right must stay inside its own row',
        );
      },
    );
  });

  group('Stage D New-chat plus alignment (G2)', () {
    testWidgets(
      'gradient disc center sits 23 logical px from the surface left edge, '
      'not the current 27',
      (tester) async {
        await _pumpAtPhysicalViewport(tester, _physicalShellApp(_fixture));

        final surfaceRect = tester
            .getRect(find.byKey(const ValueKey('ai-new-chat-surface')));
        final discRect = tester
            .getRect(find.byKey(const ValueKey('ai-new-chat-gradient')));

        expect(
          discRect.center.dx - surfaceRect.left,
          closeTo(23, 2),
          reason: 'Disc center should sit at the canonical 6px padding + '
              '17px radius = 23px from the surface left edge, got '
              '${discRect.center.dx - surfaceRect.left}',
        );
      },
    );

    testWidgets(
      'surface and label remain fully contained and non-overlapping',
      (tester) async {
        await _pumpAtPhysicalViewport(tester, _physicalShellApp(_fixture));

        final surfaceRect = tester
            .getRect(find.byKey(const ValueKey('ai-new-chat-surface')));
        final discRect = tester
            .getRect(find.byKey(const ValueKey('ai-new-chat-gradient')));
        final labelRect = tester.getRect(find.text('New chat'));

        expect(surfaceRect.contains(discRect.topLeft), isTrue);
        expect(surfaceRect.contains(discRect.bottomRight), isTrue);
        expect(surfaceRect.contains(labelRect.topLeft), isTrue);
        expect(surfaceRect.contains(labelRect.bottomRight), isTrue);
        expect(
          discRect.right,
          lessThanOrEqualTo(labelRect.left),
          reason: 'disc and label must not overlap',
        );
      },
    );
  });
}
