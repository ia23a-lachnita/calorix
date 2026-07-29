import 'package:calorix/core/theme/app_colors.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/core/time/clock.dart';
import 'package:calorix/core/time/clock_provider.dart';
import 'package:calorix/debug/ui_diff_fixture.dart';
import 'package:calorix/features/ai_chat/ai_history_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/shared/models/ai_chat_thread.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:timezone/timezone.dart' as tz;

const _scale = 1.0925;
const _tolerance = 0.01;

List<AiChatThread> get _fixture => populatedAiThreadsFixture(
      uid: 'user-1',
      now: DateTime.utc(2026, 7, 28, 14, 10),
    );

String _id(String suffix) => 'ui_diff_fixture_$suffix';

Finder _surface(String suffix) =>
    find.byKey(ValueKey('ai-thread-surface-${_id(suffix)}'));

Finder _tagLabel(String suffix) =>
    find.byKey(ValueKey('ai-thread-tag-label-${_id(suffix)}'));

Finder _tagDot(String suffix) =>
    find.byKey(ValueKey('ai-thread-tag-dot-${_id(suffix)}'));

Finder _statusDot(String suffix) =>
    find.byKey(ValueKey('ai-thread-avatar-status-${_id(suffix)}'));

Finder _title(String suffix) =>
    find.byKey(ValueKey('ai-thread-title-${_id(suffix)}'));

Finder _timestamp(String suffix) =>
    find.byKey(ValueKey('ai-thread-timestamp-${_id(suffix)}'));

Finder _preview(String suffix) =>
    find.byKey(ValueKey('ai-thread-preview-${_id(suffix)}'));

Finder _titleRow(String suffix) =>
    find.byKey(ValueKey('ai-thread-title-row-${_id(suffix)}'));

Finder _applied(String suffix) =>
    find.byKey(ValueKey('ai-thread-applied-${_id(suffix)}'));

Finder _chevron(String suffix) =>
    find.byKey(ValueKey('ai-thread-chevron-${_id(suffix)}'));

Widget _app({ThemeMode themeMode = ThemeMode.dark}) {
  final router = GoRouter(
    initialLocation: '/test-ai-history-stage-i',
    routes: [
      GoRoute(
        path: '/test-ai-history-stage-i',
        builder: (_, __) => const Scaffold(body: AiHistoryScreen()),
      ),
    ],
  );
  return ProviderScope(
    overrides: [
      aiThreadsProvider.overrideWith((ref) => Stream.value(_fixture)),
      clockProvider.overrideWithValue(
        FakeClock(tz.TZDateTime.utc(2026, 7, 28, 14, 10)),
      ),
    ],
    child: MaterialApp.router(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
    ),
  );
}

Future<void> _pump(
  WidgetTester tester, {
  required ThemeMode themeMode,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(_app(themeMode: themeMode));
  await tester.pumpAndSettle();
}

Future<void> _scrollTo(WidgetTester tester, Finder target) async {
  final list = find.byKey(const ValueKey('ai-history-list'));
  const viewport = Rect.fromLTWH(0, 0, 360, 800);
  for (var attempt = 0; attempt < 12; attempt++) {
    if (target.evaluate().isNotEmpty &&
        tester.getRect(target).overlaps(viewport)) {
      return;
    }
    await tester.drag(list, const Offset(0, -280));
    await tester.pumpAndSettle();
  }
  fail('Could not reveal $target in the thread list');
}

void _expectSize(Size actual, double width, double height, String label) {
  expect(actual.width, closeTo(width, _tolerance), reason: '$label width');
  expect(actual.height, closeTo(height, _tolerance), reason: '$label height');
}

void main() {
  for (final themeMode in [ThemeMode.dark, ThemeMode.light]) {
    testWidgets(
      'Stage I card/content contracts in $themeMode',
      (tester) async {
        await _pump(tester, themeMode: themeMode);

        // Pinned same-day rows say Today; normal same-day rows retain HH:mm.
        expect(tester.widget<Text>(_timestamp('pinned')).data, 'Today');
        expect(tester.widget<Text>(_timestamp('today_meal')).data, '13:04');

        // Canonical tag labels and semantic colors.
        for (final entry in {
          'today_plan': ('PLAN', AppColors.blue),
          'today_meal': ('MEAL EDIT', AppColors.cyan),
        }.entries) {
          await _scrollTo(tester, _tagLabel(entry.key));
          final label = tester.widget<Text>(_tagLabel(entry.key));
          expect(label.data, entry.value.$1);
          expect(label.style?.color, entry.value.$2);
          expect(label.style?.fontSize, closeTo(9.5 / _scale, _tolerance));
          _expectSize(
            tester.getSize(_tagDot(entry.key)),
            5 / _scale,
            5 / _scale,
            '${entry.key} tag dot',
          );
          expect(
            (tester.widget<Container>(_tagDot(entry.key)).decoration
                    as BoxDecoration?)
                ?.color,
            entry.value.$2,
          );
        }
        // Unread status belongs only at the avatar corner and matches the row.
        expect(_statusDot('today_plan'), findsNothing);
        await _scrollTo(tester, _statusDot('today_meal'));
        final status = tester.widget<Container>(_statusDot('today_meal'));
        _expectSize(
          tester.getSize(_statusDot('today_meal')),
          10 / _scale,
          10 / _scale,
          'unread status dot',
        );
        final statusDecoration = status.decoration as BoxDecoration;
        expect(statusDecoration.color, AppColors.green);
        expect(statusDecoration.border?.top.width,
            closeTo(2 / _scale, _tolerance));
        expect(
          statusDecoration.border?.top.color,
          themeMode == ThemeMode.dark
              ? AppColors.surfaceDark
              : AppColors.surfaceLight,
        );
        expect(
          find.descendant(
            of: _titleRow('today_meal'),
            matching: _statusDot('today_meal'),
          ),
          findsNothing,
        );

        // Applied status is inline and no longer an amber multiplication chip.
        expect(_applied('pinned'), findsOneWidget);
        final appliedCheck = find.byKey(const ValueKey(
          'ai-thread-applied-check-ui_diff_fixture_pinned',
        ));
        expect(appliedCheck, findsOneWidget);
        expect(tester.widget<Icon>(appliedCheck).size,
            closeTo(11 / _scale, _tolerance));
        expect(tester.widget<Icon>(appliedCheck).color, AppColors.green);
        expect(tester.widget<Text>(_applied('pinned')).data, '1 APPLIED');
        expect(tester.widget<Text>(_applied('pinned')).style?.color,
            AppColors.green);
        expect(tester.widget<Text>(_applied('pinned')).style?.fontSize,
            closeTo(10 / _scale, _tolerance));
        expect(find.text('1× APPLIED'), findsNothing);

        // Typography, two-line preview, and centered trailing chevron.
        final titleStyle = tester.widget<Text>(_title('pinned')).style!;
        expect(titleStyle.fontSize, closeTo(14 / _scale, _tolerance));
        expect(titleStyle.fontWeight, FontWeight.w600);
        expect(titleStyle.letterSpacing,
            closeTo((-0.01 * 14) / _scale, _tolerance));
        final timestampStyle = tester.widget<Text>(_timestamp('pinned')).style!;
        expect(timestampStyle.fontSize, closeTo(10.5 / _scale, _tolerance));
        final previewWidget = tester.widget<Text>(_preview('pinned'));
        expect(
            previewWidget.style?.fontSize, closeTo(12.5 / _scale, _tolerance));
        expect(previewWidget.style?.height, closeTo(1.4, _tolerance));
        expect(previewWidget.maxLines, 2);
        final surfaceRect = tester.getRect(_surface('pinned'));
        final chevronRect = tester.getRect(_chevron('pinned'));
        expect(chevronRect.center.dy, closeTo(surfaceRect.center.dy, 1));
        expect(tester.widget<Icon>(_chevron('pinned')).size,
            closeTo(14 / _scale, _tolerance));
        final tagRow = find.byKey(const ValueKey(
          'ai-thread-tag-row-ui_diff_fixture_pinned',
        ));
        expect(tagRow, findsOneWidget);
        expect(
          find.descendant(of: tagRow, matching: _chevron('pinned')),
          findsNothing,
        );

        // Featured surface/avatar treatment is exact in both themes.
        final pinnedMaterial = tester.widget<Material>(_surface('pinned'));
        final expectedSurface = themeMode == ThemeMode.dark
            ? AppColors.cyan.withValues(alpha: 0.06)
            : AppColors.cyan.withValues(alpha: 0.07);
        final expectedBorder = themeMode == ThemeMode.dark
            ? AppColors.cyan.withValues(alpha: 0.22)
            : AppColors.cyan.withValues(alpha: 0.28);
        expect(pinnedMaterial.color, expectedSurface);
        final shape = pinnedMaterial.shape as RoundedRectangleBorder;
        expect(shape.side.color, expectedBorder);
        expect(shape.side.width, closeTo(0.5, _tolerance));
        final avatarSurface = tester.widget<Container>(
          find.byKey(const ValueKey(
              'ai-thread-avatar-surface-ui_diff_fixture_pinned')),
        );
        final avatarDecoration = avatarSurface.decoration as BoxDecoration;
        expect(avatarDecoration.border, isNull);
        expect(avatarDecoration.boxShadow, hasLength(1));
        expect(avatarDecoration.boxShadow!.single.offset.dy,
            closeTo(6 / _scale, _tolerance));
        expect(avatarDecoration.boxShadow!.single.blurRadius,
            closeTo(14 / _scale, _tolerance));
        expect(
          avatarDecoration.boxShadow!.single.color,
          AppColors.cyan.withValues(alpha: 0.20),
        );
        final avatarIcon = tester.widget<Icon>(
          find.byKey(
              const ValueKey('ai-thread-avatar-icon-ui_diff_fixture_pinned')),
        );
        expect(avatarIcon.size, closeTo(20 / _scale, _tolerance));
        expect(avatarIcon.color, AppColors.backgroundDark);

        // Deep rows retain date semantics and linked-meal compatibility.
        await _scrollTo(tester, _tagLabel('yesterday_nutrition'));
        final nutritionLabel =
            tester.widget<Text>(_tagLabel('yesterday_nutrition'));
        expect(nutritionLabel.data, 'NUTRITION');
        expect(nutritionLabel.style?.color, AppColors.green);
        await _scrollTo(tester, _timestamp('yesterday_meal'));
        expect(tester.widget<Text>(_timestamp('yesterday_meal')).data,
            'Yesterday');
        await _scrollTo(tester, find.text('LINKED MEAL'));
        expect(find.text('LINKED MEAL'), findsOneWidget);
        await _scrollTo(tester, _timestamp('earlier_plan'));
        expect(tester.widget<Text>(_timestamp('earlier_plan')).data, 'Jul 25');
      },
    );
  }
}
