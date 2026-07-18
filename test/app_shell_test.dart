import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:calorix/shell/app_shell.dart';

// Build a minimal router with 5 branches so AppShell renders its bottom nav.
GoRouter _buildRouter() => GoRouter(
      initialLocation: '/today',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, navigationShell) =>
              AppShell(navigationShell: navigationShell),
          branches: [
            StatefulShellBranch(routes: [
              GoRoute(
                  path: '/today',
                  builder: (_, __) => const Scaffold(body: Text('TodayPage')))
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                  path: '/history',
                  builder: (_, __) => const Scaffold(body: Text('HistoryPage')))
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                  path: '/scan',
                  builder: (_, __) => const Scaffold(body: Text('ScanPage')))
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                  path: '/goals',
                  builder: (_, __) => const Scaffold(body: Text('GoalsPage')))
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                  path: '/ai',
                  builder: (_, __) => const Scaffold(body: Text('AIPage')))
            ]),
          ],
        ),
      ],
    );

void main() {
  Scaffold shellScaffold(WidgetTester tester) => tester
      .widgetList<Scaffold>(find.byType(Scaffold))
      .firstWhere((scaffold) => scaffold.bottomNavigationBar != null);

  testWidgets('Bottom nav shows all 5 tab labels', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Today'), findsWidgets);
    expect(find.text('History'), findsOneWidget);
    expect(find.text('Scan'), findsOneWidget);
    expect(find.text('Goals'), findsOneWidget);
    expect(find.text('AI'), findsOneWidget);
  });

  testWidgets(
      'Five hit-testable nav controls with equal widths (flat five-tab contract)',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pumpAndSettle();

    final keys = [
      'nav-item-today',
      'nav-item-history',
      'nav-item-scan',
      'nav-item-goals',
      'nav-item-ai',
    ];

    final widths = <double>[];
    for (final key in keys) {
      final finder = find.byKey(Key(key));
      expect(finder, findsOneWidget, reason: 'Missing nav control: $key');
      expect(
        finder.hitTestable(),
        findsOneWidget,
        reason: '$key must be hit-testable',
      );
      widths.add(tester.getSize(finder).width);
    }

    final maxW = widths.reduce((a, b) => a > b ? a : b);
    final minW = widths.reduce((a, b) => a < b ? a : b);
    expect(maxW - minW, lessThanOrEqualTo(1.0),
        reason: 'All five nav tabs must have equal widths (max-min <= 1px)');
  });

  testWidgets('nav-item-scan is present and hit-testable as a normal tab',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pumpAndSettle();

    final scanTab = find.byKey(const Key('nav-item-scan'));
    expect(scanTab, findsOneWidget);
    expect(scanTab.hitTestable(), findsOneWidget);
  });

  testWidgets('Old FAB / glow / ring / protrusion keys are absent',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('scan-fab-column')), findsNothing);
    expect(find.byKey(const Key('scan-glow')), findsNothing);
    expect(find.byKey(const Key('scan-fab-outer')), findsNothing);
    expect(find.byKey(const Key('scan-fab-inner')), findsNothing);
    expect(find.byKey(const Key('scan-label-block')), findsNothing);
  });

  testWidgets('Scaffold extendBody is true across all five branches',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pumpAndSettle();

    for (var i = 0; i < 5; i++) {
      expect(shellScaffold(tester).extendBody, isTrue,
          reason: 'extendBody should be true at branch $i');
      if (i < 4) {
        final tabFinder = find.byKey(Key(
            'nav-item-${['today', 'history', 'scan', 'goals', 'ai'][i + 1]}'));
        await tester.tap(tabFinder);
        await tester.pumpAndSettle();
      }
    }
  });

  testWidgets('Nav bar height is constant across all five branches',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pumpAndSettle();

    final heights = <double>[];
    final tabKeys = [
      'nav-item-today',
      'nav-item-history',
      'nav-item-scan',
      'nav-item-goals',
      'nav-item-ai',
    ];

    for (final key in tabKeys) {
      final navBar = find.byKey(const Key('today-bottom-nav'));
      heights.add(tester.getSize(navBar).height);
      await tester.tap(find.byKey(Key(key)));
      await tester.pumpAndSettle();
    }

    final uniqueHeights = heights.toSet();
    expect(uniqueHeights.length, 1,
        reason: 'Nav bar height must remain constant across all branches');
  });

  testWidgets('Nav bar respects bottom safe inset', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MediaQuery(
          data: const MediaQueryData(
            padding: EdgeInsets.only(bottom: 34),
            viewPadding: EdgeInsets.only(bottom: 34),
          ),
          child: MaterialApp.router(routerConfig: _buildRouter()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final navBar = find.byKey(const Key('today-bottom-nav'));
    final height = tester.getSize(navBar).height;
    // The nav bar must include the safe inset: base 60 + max(36, inset 34 + 26) = 60 + 60 = 120
    expect(height, greaterThanOrEqualTo(120));
  });

  testWidgets('Tapping History, Scan, Goals, AI navigates correctly',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('nav-item-history')));
    await tester.pumpAndSettle();
    expect(find.text('HistoryPage'), findsOneWidget);

    await tester.tap(find.byKey(const Key('nav-item-scan')));
    await tester.pumpAndSettle();
    expect(find.text('ScanPage'), findsOneWidget);

    await tester.tap(find.byKey(const Key('nav-item-goals')));
    await tester.pumpAndSettle();
    expect(find.text('GoalsPage'), findsOneWidget);

    await tester.tap(find.byKey(const Key('nav-item-ai')));
    await tester.pumpAndSettle();
    expect(find.text('AIPage'), findsOneWidget);
  });

  testWidgets('All five custom nav icon keys are present', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('nav-icon-today')), findsOneWidget);
    expect(find.byKey(const Key('nav-icon-history')), findsOneWidget);
    expect(find.byKey(const Key('nav-icon-scan')), findsOneWidget);
    expect(find.byKey(const Key('nav-icon-goals')), findsOneWidget);
    expect(find.byKey(const Key('nav-icon-ai')), findsOneWidget);

    // Ensure no Material icons are used for custom-painted tabs.
    expect(find.byIcon(Icons.today_outlined), findsNothing);
    expect(find.byIcon(Icons.flag_outlined), findsNothing);
  });
}
