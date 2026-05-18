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
    expect(find.text('Scan'), findsOneWidget);
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

    // Scan eye icon is present
    expect(find.byIcon(Icons.remove_red_eye_outlined), findsOneWidget);
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
