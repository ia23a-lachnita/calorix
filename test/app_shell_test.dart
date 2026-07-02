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
  testWidgets('Bottom nav shows all 5 tab labels', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Today'), findsWidgets); // tab label + page body
    expect(find.text('History'), findsOneWidget);
    expect(
        find.text('SCAN'), findsOneWidget); // _ScanFAB renders uppercase 'SCAN'
    expect(find.text('Goals'), findsOneWidget);
    expect(find.text('AI'), findsOneWidget);
  });

  testWidgets('Scan FAB is rendered at center position', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    // Scan eye icon is rendered by the Calorix custom painter.
    expect(find.byKey(const Key('scan-icon-eye')), findsOneWidget);
  });

  testWidgets('Bottom nav uses mockup-specific custom tab icons',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byKey(const Key('nav-icon-today')), findsOneWidget);
    expect(find.byKey(const Key('nav-icon-history')), findsOneWidget);
    expect(find.byKey(const Key('nav-icon-goals')), findsOneWidget);
    expect(find.byKey(const Key('nav-icon-ai')), findsOneWidget);

    expect(find.byIcon(Icons.today_outlined), findsNothing);
    expect(find.byIcon(Icons.flag_outlined), findsNothing);
    expect(find.byIcon(Icons.remove_red_eye_outlined), findsNothing);
    expect(find.byIcon(Icons.remove_red_eye), findsNothing);
  });

  testWidgets('Scan FAB matches mockup ring proportions', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(
        tester.getSize(find.byKey(const Key('scan-glow'))), const Size(76, 76));
    expect(tester.getSize(find.byKey(const Key('scan-fab-outer'))),
        const Size(60, 60));
    expect(tester.getSize(find.byKey(const Key('scan-fab-inner'))),
        const Size(48, 48));
    expect(find.byKey(const Key('scan-icon-eye')), findsOneWidget);

    final scanLabel = tester.widget<Text>(find.text('SCAN'));
    expect(scanLabel.style?.fontFamily, 'GeistMono');
    expect(scanLabel.style?.fontSize, 9.5);
    expect(scanLabel.style?.letterSpacing, 1.6);
  });

  testWidgets('Scan FAB is static and does not keep the shell animating',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    final outerFab = find.byKey(const Key('scan-fab-outer'));
    expect(outerFab, findsOneWidget);

    final nonIdentityTransforms = tester
        .widgetList<Transform>(
      find.ancestor(of: outerFab, matching: find.byType(Transform)),
    )
        .where((transform) {
      final values = transform.transform.storage;
      final identity = Matrix4.identity().storage;
      for (var i = 0; i < values.length; i += 1) {
        if ((values[i] - identity[i]).abs() > 0.0001) {
          return true;
        }
      }
      return false;
    });

    expect(nonIdentityTransforms, isEmpty);
    await tester.pumpAndSettle(
      const Duration(milliseconds: 50),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 1),
    );
  });

  testWidgets('Scan FAB layout remains bounded with large text scale',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.4)),
          child: MaterialApp.router(routerConfig: _buildRouter()),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    final navRect = tester.getRect(find.byKey(const Key('today-bottom-nav')));
    final scanRect = tester.getRect(find.byKey(const Key('scan-fab-column')));

    expect(scanRect.left >= navRect.left, isTrue);
    expect(scanRect.right <= navRect.right, isTrue);
    expect(scanRect.top >= navRect.top, isTrue);
    expect(scanRect.bottom <= navRect.bottom, isTrue);
  });

  testWidgets('Tapping History tab navigates', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.text('History'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('HistoryPage'), findsOneWidget);
  });

  testWidgets('Tapping Goals tab navigates', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildRouter()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.text('Goals'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('GoalsPage'), findsOneWidget);
  });
}
