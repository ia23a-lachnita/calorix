import 'package:calorix/core/constants/app_constants.dart';
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
// Stage C: header inset, search-bar surface, filter-chip geometry/colors,
// and New chat surface — corrected against the canonical handoff JSX
// (cx-screen-ai-history.jsx / cx-theme.jsx) and the raw 402x874 reference
// images. Stage B row/avatar treatment is untouched by this stage.
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

void main() {
  // ── 1. Header: keyed 12px spacer + 8px outer inset, brand stays centered ──
  group('Stage C header spacer and inset', () {
    testWidgets('keyed spacer above the header row is exactly 12px tall',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final spacer = find.byKey(const ValueKey('ai-history-header-spacer'));
      expect(spacer, findsOneWidget);
      expect(tester.getSize(spacer).height, 12);
    });

    testWidgets(
        'back and settings targets are inset exactly 8px from each edge (dark)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final screenWidth = tester.getRect(find.byType(Scaffold).first).width;
      final backRect =
          tester.getRect(find.byKey(const ValueKey('ai-history-back')));
      final settingsRect =
          tester.getRect(find.byKey(const ValueKey('ai-history-settings')));

      expect(
        backRect.left,
        8,
        reason: 'Back target must sit 8px from the left edge, '
            'got ${backRect.left}',
      );
      expect(
        screenWidth - settingsRect.right,
        8,
        reason: 'Settings target must sit 8px from the right edge, '
            'got ${screenWidth - settingsRect.right}',
      );
    });

    testWidgets(
        'back and settings targets are inset exactly 8px from each edge (light)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture, themeMode: ThemeMode.light));
      await tester.pumpAndSettle();

      final screenWidth = tester.getRect(find.byType(Scaffold).first).width;
      final backRect =
          tester.getRect(find.byKey(const ValueKey('ai-history-back')));
      final settingsRect =
          tester.getRect(find.byKey(const ValueKey('ai-history-settings')));

      expect(backRect.left, 8);
      expect(screenWidth - settingsRect.right, 8);
    });

    testWidgets('APPNAME AI brand stays centered within the header row',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final brandRect = tester.getRect(
        find.text('${AppConstants.appDisplayName.toUpperCase()} AI'),
      );
      final rowRect =
          tester.getRect(find.byKey(const ValueKey('ai-history-header-row')));

      expect(
        (brandRect.center.dx - rowRect.center.dx).abs(),
        lessThanOrEqualTo(1.0),
        reason: 'Brand label must stay centered in the header row',
      );
    });
  });

  // ── 2. Search: card fill, radius 12, hairline border, dense field ────────
  group('Stage C search bar surface', () {
    testWidgets('visible surface height is 37..43 logical px (dark)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final rect =
          tester.getRect(find.byKey(const ValueKey('ai-history-search')));
      expect(
        rect.height,
        inInclusiveRange(37, 43),
        reason: 'Search surface should be ~40 tall, got ${rect.height}',
      );
    });

    testWidgets('visible surface height is 37..43 logical px (light)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture, themeMode: ThemeMode.light));
      await tester.pumpAndSettle();

      final rect =
          tester.getRect(find.byKey(const ValueKey('ai-history-search')));
      expect(rect.height, inInclusiveRange(37, 43));
    });

    testWidgets(
        'decoration is filled with card color, radius 12, 0.5 hairline border (dark)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final field = tester.widget<TextField>(
        find.byKey(const ValueKey('ai-history-search')),
      );
      final decoration = field.decoration!;
      expect(decoration.filled, isTrue);
      expect(decoration.fillColor, AppColors.surfaceDark);

      final border = decoration.enabledBorder as OutlineInputBorder?;
      expect(border, isNotNull, reason: 'Search must set an enabledBorder');
      expect(
        border!.borderRadius,
        BorderRadius.circular(12),
        reason: 'Search radius must be 12',
      );
      expect(border.borderSide.color, AppColors.borderDark);
      expect(border.borderSide.width, 0.5);
    });

    testWidgets(
        'decoration is filled with card color, radius 12, 0.5 hairline border (light)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture, themeMode: ThemeMode.light));
      await tester.pumpAndSettle();

      final field = tester.widget<TextField>(
        find.byKey(const ValueKey('ai-history-search')),
      );
      final decoration = field.decoration!;
      expect(decoration.fillColor, AppColors.surfaceRaisedLight);

      final border = decoration.enabledBorder as OutlineInputBorder?;
      expect(border, isNotNull);
      expect(border!.borderRadius, BorderRadius.circular(12));
      expect(border.borderSide.color, AppColors.borderLight);
      expect(border.borderSide.width, 0.5);
    });

    testWidgets('search icon is exactly 16px', (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final field = tester.widget<TextField>(
        find.byKey(const ValueKey('ai-history-search')),
      );
      final prefix = field.decoration!.prefixIcon as Icon?;
      expect(prefix, isNotNull);
      expect(prefix!.size, 16);
    });

    testWidgets(
        'keyboard badge is a compact ~22px tall control, not stretched (dark)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final kbd = find.byKey(const ValueKey('ai-history-search-kbd'));
      expect(kbd, findsOneWidget);

      final rect = tester.getRect(kbd);
      expect(
        rect.height,
        inInclusiveRange(18, 26),
        reason: 'Keyboard badge should be ~22 tall, got ${rect.height}. '
            'A stretched badge would report a height close to the full '
            'search field height.',
      );
    });

    testWidgets('typing still filters and clearing still restores full list',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const ValueKey('ai-history-search')),
        'espresso',
      );
      await tester.pumpAndSettle();
      expect(find.text('Espresso scan check'), findsOneWidget);
      expect(find.byKey(const ValueKey('ai-history-search-kbd')), findsNothing);

      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('ai-history-search-kbd')),
        findsOneWidget,
      );
      expect(
        find.text('Macro plan for 5×/week training'),
        findsOneWidget,
      );
    });
  });

  // ── 3. Filters: 16 padding / 6 gap / ~30 tall / ink-selected ─────────────
  group('Stage C filter chip geometry and colors', () {
    testWidgets('filter ListView has 16 logical px horizontal padding',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final filterList = find.byKey(const ValueKey('ai-history-filters'));
      final listView = filterList.evaluate().first.widget as ListView;
      expect(listView.padding, const EdgeInsets.symmetric(horizontal: 16));
    });

    testWidgets('gap between adjacent filter chips is exactly 6 logical px',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final allRect =
          tester.getRect(find.byKey(const ValueKey('ai-filter-All')));
      final planRect =
          tester.getRect(find.byKey(const ValueKey('ai-filter-Plan')));

      expect(
        planRect.left - allRect.right,
        6,
        reason: 'Gap between All and Plan chips must be 6px, '
            'got ${planRect.left - allRect.right}',
      );
    });

    testWidgets('unselected chip visible height is 27..33 logical px (dark)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final rect = tester.getRect(find.byKey(const ValueKey('ai-filter-Plan')));
      expect(
        rect.height,
        inInclusiveRange(27, 33),
        reason: 'Filter chip should be ~30 tall, got ${rect.height}',
      );
    });

    testWidgets(
        'selected chip fills with theme ink and labels with theme background (dark)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final chip = find.byKey(const ValueKey('ai-filter-All'));
      final container = tester.widget<AnimatedContainer>(
        find.descendant(
          of: chip,
          matching: find.byType(AnimatedContainer),
        ),
      );
      final decoration = container.decoration as BoxDecoration;
      expect(
        decoration.color,
        AppColors.textPrimaryDark,
        reason: 'Selected chip background must be theme ink (dark)',
      );
      expect(decoration.border, isNotNull);
      final side = (decoration.border as Border).top;
      expect(side.color, Colors.transparent);
      expect(side.width, 0.5);

      final labelText = tester.widget<Text>(
        find.descendant(of: chip, matching: find.text('All')),
      );
      expect(labelText.style!.color, AppColors.backgroundDark);

      final countText = tester.widget<Text>(
        find.descendant(of: chip, matching: find.text('12')),
      );
      expect(countText.style!.color, AppColors.backgroundDark);
    });

    testWidgets(
        'selected chip fills with theme ink and labels with theme background (light)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture, themeMode: ThemeMode.light));
      await tester.pumpAndSettle();

      final chip = find.byKey(const ValueKey('ai-filter-All'));
      final container = tester.widget<AnimatedContainer>(
        find.descendant(
          of: chip,
          matching: find.byType(AnimatedContainer),
        ),
      );
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, AppColors.textPrimaryLight);

      final labelText = tester.widget<Text>(
        find.descendant(of: chip, matching: find.text('All')),
      );
      expect(labelText.style!.color, AppColors.backgroundLight);
    });

    testWidgets(
        'unselected chip uses card fill and hairline-strong border (dark)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final chip = find.byKey(const ValueKey('ai-filter-Plan'));
      final container = tester.widget<AnimatedContainer>(
        find.descendant(
          of: chip,
          matching: find.byType(AnimatedContainer),
        ),
      );
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, AppColors.surfaceDark);
      final side = (decoration.border as Border).top;
      expect(side.color, AppColors.borderDarkStrong);
      expect(side.width, 0.5);
    });

    testWidgets(
        'unselected chip uses card fill and hairline-strong border (light)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture, themeMode: ThemeMode.light));
      await tester.pumpAndSettle();

      final chip = find.byKey(const ValueKey('ai-filter-Plan'));
      final container = tester.widget<AnimatedContainer>(
        find.descendant(
          of: chip,
          matching: find.byType(AnimatedContainer),
        ),
      );
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, AppColors.surfaceRaisedLight);
      final side = (decoration.border as Border).top;
      expect(side.color, AppColors.borderLightStrong);
    });

    testWidgets('selection remains animated and tap-driven', (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final chip = find.byKey(const ValueKey('ai-filter-Plan'));
      final before = tester.widget<AnimatedContainer>(
        find.descendant(of: chip, matching: find.byType(AnimatedContainer)),
      );
      expect(before.duration, const Duration(milliseconds: 180));

      await tester.tap(chip);
      await tester.pump();
      // Mid-animation frame: still an AnimatedContainer driving the change.
      await tester.pump(const Duration(milliseconds: 90));
      await tester.pumpAndSettle();

      final after = tester.widget<AnimatedContainer>(
        find.descendant(of: chip, matching: find.byType(AnimatedContainer)),
      );
      final decoration = after.decoration as BoxDecoration;
      expect(decoration.color, AppColors.textPrimaryDark);
    });
  });

  // ── 4. New chat: 46 high / ~120 wide / pill / gradient disc ──────────────
  group('Stage C New chat surface', () {
    testWidgets('visible surface is exactly 46 logical px tall (dark)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final rect =
          tester.getRect(find.byKey(const ValueKey('ai-new-chat-surface')));
      expect(rect.height, 46);
    });

    testWidgets('visible surface is exactly 46 logical px tall (light)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture, themeMode: ThemeMode.light));
      await tester.pumpAndSettle();

      final rect =
          tester.getRect(find.byKey(const ValueKey('ai-new-chat-surface')));
      expect(rect.height, 46);
    });

    testWidgets('visible surface is 112..128 logical px wide', (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final rect =
          tester.getRect(find.byKey(const ValueKey('ai-new-chat-surface')));
      expect(
        rect.width,
        inInclusiveRange(112, 128),
        reason: 'New chat surface should be ~120 wide, got ${rect.width}',
      );
    });

    testWidgets(
        'visible surface bottom is flush with the outer tap target bottom',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final surfaceRect =
          tester.getRect(find.byKey(const ValueKey('ai-new-chat-surface')));
      final outerRect =
          tester.getRect(find.byKey(const ValueKey('ai-new-chat')));

      expect(
        surfaceRect.bottom,
        closeTo(outerRect.bottom, 0.5),
        reason: 'Surface must be bottom-aligned within the outer tap target '
            'so the 8px nav gap applies to the visible pill too',
      );
    });

    testWidgets(
        'surface uses card fill, ink text, pill radius, hairline-strong border (dark)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final surface = find.byKey(const ValueKey('ai-new-chat-surface'));
      final container = tester.widget<Container>(
        find.descendant(of: surface, matching: find.byType(Container)).first,
      );
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, AppColors.surfaceDark);
      expect(decoration.borderRadius, BorderRadius.circular(999));
      final side = (decoration.border as Border).top;
      expect(side.color, AppColors.borderDarkStrong);
      expect(side.width, 0.5);

      final text = tester.widget<Text>(
        find.descendant(of: surface, matching: find.text('New chat')),
      );
      expect(text.style!.color, AppColors.textPrimaryDark);
    });

    testWidgets(
        'surface uses card fill, ink text, pill radius, hairline-strong border (light)',
        (tester) async {
      await tester.pumpWidget(_app(_fixture, themeMode: ThemeMode.light));
      await tester.pumpAndSettle();

      final surface = find.byKey(const ValueKey('ai-new-chat-surface'));
      final container = tester.widget<Container>(
        find.descendant(of: surface, matching: find.byType(Container)).first,
      );
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, AppColors.surfaceRaisedLight);
      final side = (decoration.border as Border).top;
      expect(side.color, AppColors.borderLightStrong);

      final text = tester.widget<Text>(
        find.descendant(of: surface, matching: find.text('New chat')),
      );
      expect(text.style!.color, AppColors.textPrimaryLight);
    });

    testWidgets('gradient disc is 34x34 with a cyan-to-blue LinearGradient',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final disc = find.byKey(const ValueKey('ai-new-chat-gradient'));
      expect(disc, findsOneWidget);

      final rect = tester.getRect(disc);
      expect(rect.width, 34);
      expect(rect.height, 34);

      final container = tester.widget<Container>(disc);
      final decoration = container.decoration as BoxDecoration;
      final gradient = decoration.gradient as LinearGradient?;
      expect(gradient, isNotNull);
      expect(gradient!.colors, [AppColors.cyan, AppColors.blue]);
    });

    testWidgets('plus icon inside the gradient disc is 16px and high-contrast',
        (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      final disc = find.byKey(const ValueKey('ai-new-chat-gradient'));
      final icon = tester.widget<Icon>(
        find.descendant(of: disc, matching: find.byIcon(Icons.add)),
      );
      expect(icon.size, 16);
      expect(icon.color, AppColors.backgroundDark);
    });

    testWidgets('outer target still navigates to a new chat', (tester) async {
      await tester.pumpWidget(_app(_fixture));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('ai-new-chat')));
      await tester.pumpAndSettle();

      expect(find.text('Chat new'), findsOneWidget);
    });
  });
}
