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

const _comparisonToLogical = 1.0925;
const _comparisonXOffset = 4.35;
const _comparisonTolerance = 1.5 / _comparisonToLogical;

double _logicalX(double comparisonX) =>
    (comparisonX - _comparisonXOffset) / _comparisonToLogical;

double _logicalSize(double comparisonSize) =>
    comparisonSize / _comparisonToLogical;

List<AiChatThread> get _fixture => populatedAiThreadsFixture(
      uid: 'user-1',
      now: DateTime.utc(2026, 7, 28, 14, 10),
    );

Widget _app(
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
          bottomNavigationBar: SizedBox(
            key: ValueKey('stage-h-nav-boundary'),
            height: 80,
          ),
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
  WidgetTester tester, {
  ThemeMode themeMode = ThemeMode.dark,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(_app(_fixture, themeMode: themeMode));
  await tester.pumpAndSettle();
}

void _expectClose(
  double actual,
  double expected,
  String label,
) {
  expect(
    actual,
    closeTo(expected, _comparisonTolerance),
    reason: '$label: expected $expected, got $actual',
  );
}

void _expectRect(
  WidgetTester tester,
  Finder finder, {
  required double left,
  required double right,
  required double top,
  required double bottom,
  required String label,
}) {
  final rect = tester.getRect(finder);
  _expectClose(rect.left, left, '$label left');
  _expectClose(rect.right, right, '$label right');
  _expectClose(rect.top, top, '$label top');
  _expectClose(rect.bottom, bottom, '$label bottom');
}

void main() {
  group('Stage H top-stack comparison contracts', () {
    for (final themeMode in [ThemeMode.dark, ThemeMode.light]) {
      testWidgets(
        'matches transformed header/search/filter contracts in $themeMode',
        (tester) async {
          await _pumpAtPhysicalViewport(tester, themeMode: themeMode);

          final title = tester.widget<Text>(
            find.byKey(const ValueKey('ai-history-title')),
          );
          expect(
              find.byKey(const ValueKey('ai-history-title')), findsOneWidget);
          expect(
              title.style?.fontSize, closeTo(30 / _comparisonToLogical, 0.01));
          expect(title.style?.fontWeight, FontWeight.w600);
          expect(
            title.style?.letterSpacing,
            closeTo((-0.04 * 30) / _comparisonToLogical, 0.01),
          );
          expect(title.style?.height, closeTo(1, 0.001));

          final brand = tester.widget<Text>(
            find.byKey(const ValueKey('ai-history-brand')),
          );
          expect(
              find.byKey(const ValueKey('ai-history-brand')), findsOneWidget);
          expect(
              brand.style?.fontSize, closeTo(10 / _comparisonToLogical, 0.01));
          expect(
            brand.style?.letterSpacing,
            closeTo((0.16 * 10) / _comparisonToLogical, 0.01),
          );

          final subtitle = tester.widget<Text>(
            find.byKey(const ValueKey('ai-history-subtitle')),
          );
          expect(
            find.byKey(const ValueKey('ai-history-subtitle')),
            findsOneWidget,
          );
          expect(
            subtitle.style?.fontSize,
            closeTo(13 / _comparisonToLogical, 0.01),
          );
          expect(subtitle.style?.height, closeTo(1.4, 0.001));

          final titleTransform = tester.widget<Transform>(
            find
                .ancestor(
                  of: find.byKey(const ValueKey('ai-history-title')),
                  matching: find.byType(Transform),
                )
                .first,
          );
          expect(
            titleTransform.transform.storage[13],
            closeTo(-_logicalSize(4), 0.01),
          );
          final subtitleTransform = tester.widget<Transform>(
            find
                .ancestor(
                  of: find.byKey(const ValueKey('ai-history-subtitle')),
                  matching: find.byType(Transform),
                )
                .first,
          );
          expect(
            subtitleTransform.transform.storage[13],
            closeTo(-_logicalSize(6), 0.01),
          );

          final search = find.byKey(const ValueKey('ai-history-search'));
          final searchRect = tester.getRect(search);
          _expectClose(searchRect.left, _logicalX(17), 'search surface left');
          _expectClose(
              searchRect.right, _logicalX(384), 'search surface right');
          _expectClose(
            searchRect.height,
            _logicalSize(37),
            'search height',
          );
          final searchTransform = tester.widget<Transform>(
            find
                .ancestor(
                  of: find.byKey(const ValueKey('ai-history-search')),
                  matching: find.byType(Transform),
                )
                .first,
          );
          expect(
            searchTransform.transform.storage[13],
            closeTo(_logicalSize(5), 0.01),
            reason: 'search visual must use the measured positive correction',
          );
          final searchBlockRect = tester.getRect(
            find.byKey(const ValueKey('ai-history-search-block')),
          );
          _expectClose(
            searchRect.top,
            searchBlockRect.top + _logicalSize(5),
            'search visual top after positive translation',
          );
          _expectClose(
            searchRect.bottom,
            searchBlockRect.bottom,
            'search visual bottom matches reserved block bottom',
          );
          _expectClose(
            tester
                    .getRect(find.byKey(const ValueKey('ai-history-filters')))
                    .top -
                searchRect.bottom,
            _logicalSize(12),
            'filter row gap after translated search',
          );

          final filterRow = find.byKey(const ValueKey('ai-history-filters'));
          final filterRect = tester.getRect(filterRow);
          _expectClose(
            filterRect.height,
            _logicalSize(30),
            'filter row height',
          );
          expect(
              filterRect.bottom,
              lessThanOrEqualTo(
                tester
                    .getRect(find.byKey(const ValueKey('stage-h-nav-boundary')))
                    .top,
              ));

          _expectRect(
            tester,
            find.byKey(const ValueKey('ai-filter-Plan')),
            left: _logicalX(82),
            right: _logicalX(142),
            top: filterRect.top,
            bottom: filterRect.bottom,
            label: 'Plan filter',
          );
          _expectRect(
            tester,
            find.byKey(const ValueKey('ai-filter-Meal edits')),
            left: _logicalX(151),
            right: _logicalX(244),
            top: filterRect.top,
            bottom: filterRect.bottom,
            label: 'Meal edits filter',
          );
          _expectRect(
            tester,
            find.byKey(const ValueKey('ai-filter-Nutrition')),
            left: _logicalX(253),
            right: _logicalX(337),
            top: filterRect.top,
            bottom: filterRect.bottom,
            label: 'Nutrition filter',
          );

          final planRect = tester.getRect(
            find.byKey(const ValueKey('ai-filter-Plan')),
          );
          final mealEditsRect = tester.getRect(
            find.byKey(const ValueKey('ai-filter-Meal edits')),
          );
          final nutritionRect = tester.getRect(
            find.byKey(const ValueKey('ai-filter-Nutrition')),
          );
          expect(
              planRect.top, closeTo(mealEditsRect.top, _comparisonTolerance));
          expect(
              planRect.top, closeTo(nutritionRect.top, _comparisonTolerance));
          expect(planRect.bottom,
              closeTo(filterRect.bottom, _comparisonTolerance));
          final allRect = tester.getRect(
            find.byKey(const ValueKey('ai-filter-All')),
          );
          _expectClose(allRect.top, filterRect.top, 'All filter top');
          _expectClose(allRect.bottom, filterRect.bottom, 'All filter bottom');

          final listRect = tester.getRect(
            find.byKey(const ValueKey('ai-history-list')),
          );
          final firstCard = tester.getRect(
            find.byKey(const ValueKey(
              'ai-thread-surface-ui_diff_fixture_pinned',
            )),
          );
          expect(firstCard.top, greaterThanOrEqualTo(filterRect.bottom));
          expect(firstCard.bottom, lessThanOrEqualTo(listRect.bottom));
          final groupHeaderRect = tester.getRect(
            find.byKey(const ValueKey('ai-history-group-Pinned')),
          );
          _expectClose(
            firstCard.top - listRect.top - groupHeaderRect.height,
            4,
            'first-card top padding after pinned group header',
          );
          final navRect = tester.getRect(
            find.byKey(const ValueKey('stage-h-nav-boundary')),
          );
          _expectClose(navRect.top, 720, 'harness nav boundary top');
          _expectClose(navRect.height, 80, 'harness nav boundary height');
          expect(
            listRect.bottom,
            lessThanOrEqualTo(navRect.top),
          );
        },
      );
    }
  });
}
