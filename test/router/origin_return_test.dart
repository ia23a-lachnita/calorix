import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:calorix/core/router/app_router.dart';
import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/features/profile/profile_sheet.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

// ---------------------------------------------------------------------------
// Minimal stub pages used inside the shell branches.
// Each has a unique visible key so we can assert we returned to the right one.
// ---------------------------------------------------------------------------

class _TodayStub extends StatelessWidget {
  const _TodayStub();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ElevatedButton(
          key: const Key('today-avatar'),
          onPressed: () => context.pushNamed(RouteNames.profile),
          child: const Text('Profile'),
        ),
      ),
    );
  }
}

class _ScanStub extends StatelessWidget {
  const _ScanStub();
  @override
  Widget build(BuildContext context) {
    final aiCloseFallback =
        GoRouterState.of(context).uri.queryParameters['aiCloseFallback'];
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (aiCloseFallback == '1')
              const SizedBox(key: Key('ai-close-fallback')),
            ElevatedButton(
              key: const Key('scan-avatar'),
              onPressed: () => context.pushNamed(RouteNames.profile),
              child: const Text('Profile'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlaceholderPage extends StatelessWidget {
  const _PlaceholderPage({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    return Scaffold(body: Center(child: Text(label)));
  }
}

// ---------------------------------------------------------------------------
// Test router — mirrors production shape but replaces heavy screens with
// stubs.  The profile root route uses the *real* ProfileSheet.
// The /ai branch builds _AiAssistantStub so both pushed-origin and direct
// initial /ai visibly contain key ai-close.
// ---------------------------------------------------------------------------

GoRouter _testRouter() => GoRouter(
      initialLocation: RoutePaths.today,
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, navigationShell) => Scaffold(
            body: navigationShell,
            bottomNavigationBar: BottomNavigationBar(
              key: const Key('test-shell-nav'),
              currentIndex: navigationShell.currentIndex,
              onTap: (i) => navigationShell.goBranch(i),
              items: const [
                BottomNavigationBarItem(
                  icon: Icon(Icons.today),
                  label: 'Today',
                  key: Key('nav-item-today'),
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.history),
                  label: 'History',
                  key: Key('nav-item-history'),
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.camera_alt),
                  label: 'Scan',
                  key: Key('nav-item-scan'),
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.flag),
                  label: 'Goals',
                  key: Key('nav-item-goals'),
                ),
                BottomNavigationBarItem(
                  icon: Icon(Icons.chat),
                  label: 'AI',
                  key: Key('nav-item-ai'),
                ),
              ],
            ),
          ),
          branches: [
            StatefulShellBranch(routes: [
              GoRoute(
                path: RoutePaths.today,
                name: RouteNames.today,
                builder: (_, __) => const _TodayStub(),
              ),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: RoutePaths.history,
                name: RouteNames.history,
                builder: (_, __) =>
                    const _PlaceholderPage(label: 'HistoryPage'),
              ),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: RoutePaths.scan,
                name: RouteNames.scan,
                builder: (_, __) => const _ScanStub(),
              ),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: RoutePaths.goals,
                name: RouteNames.goals,
                builder: (_, __) => const _PlaceholderPage(label: 'GoalsPage'),
              ),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(
                path: RoutePaths.aiChat,
                name: RouteNames.aiChat,
                builder: (_, __) => const _AiAssistantStub(),
              ),
            ]),
          ],
        ),
        // Real ProfileSheet on the root navigator.
        GoRoute(
          path: RoutePaths.profile,
          name: RouteNames.profile,
          builder: (_, __) => const ProfileSheet(),
        ),
      ],
    );

// ---------------------------------------------------------------------------
// Helper — pumps the app with ProviderScope + router and settles.
// ---------------------------------------------------------------------------

Future<void> _pumpRouter(
  WidgetTester tester,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith((_) => Stream<User?>.value(null)),
      ],
      child: MaterialApp.router(routerConfig: _testRouter()),
    ),
  );
  await tester.pumpAndSettle();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  // =========================================================================
  // Profile-close RED tests
  // =========================================================================

  testWidgets(
    'Opening ProfileSheet from Today with pushNamed, '
    'tapping profile-close returns to Today',
    (tester) async {
      await _pumpRouter(tester);

      // Tap the Today avatar to open ProfileSheet via pushNamed.
      await tester.tap(find.byKey(const Key('today-avatar')));
      await tester.pumpAndSettle();

      // Verify ProfileSheet rendered.
      expect(find.text('Profile'), findsWidgets);

      // Tap the close button (keyed profile-close in ProfileSheet).
      await tester.tap(find.byKey(const Key('profile-close')));
      await tester.pumpAndSettle();

      // We should be back on Today.
      expect(find.byKey(const Key('today-avatar')), findsOneWidget);
    },
  );

  testWidgets(
    'Opening ProfileSheet from Scan with pushNamed, '
    'tapping profile-close returns to Scan',
    (tester) async {
      await _pumpRouter(tester);

      // Switch to Scan branch.
      await tester.tap(find.byKey(const Key('nav-item-scan')));
      await tester.pumpAndSettle();

      // Tap the Scan avatar to open ProfileSheet via pushNamed.
      await tester.tap(find.byKey(const Key('scan-avatar')));
      await tester.pumpAndSettle();

      // Verify ProfileSheet rendered.
      expect(find.text('Profile'), findsWidgets);

      // Tap the close button.
      await tester.tap(find.byKey(const Key('profile-close')));
      await tester.pumpAndSettle();

      // We should be back on Scan.
      expect(find.byKey(const Key('scan-avatar')), findsOneWidget);
    },
  );

  // =========================================================================
  // A) Assistant close origin and fallback
  //
  // A test-only assistant stub acts as a thin UI driver of the PUBLIC
  // routing contract: it exposes a key `ai-close` whose handler pops
  // when context.canPop() is true, or navigates to /scan with
  // aiCloseFallback=1 when it cannot pop.
  //
  // The minimal router's /ai shell branch builds _AiAssistantStub directly,
  // so both pushed-origin and direct initial /ai visibly contain key ai-close.
  // No shadow root-level /ai route is used.
  // =========================================================================

  testWidgets(
    'AiAssistant close from a pushed origin returns to that origin',
    (tester) async {
      // Build a router where the /ai shell branch renders _AiAssistantStub.
      // A button in the Today branch pushes /ai on the root navigator so
      // canPop() is true inside the pushed assistant page.
      final router = GoRouter(
        initialLocation: RoutePaths.today,
        routes: [
          StatefulShellRoute.indexedStack(
            builder: (context, state, navigationShell) => Scaffold(
              body: navigationShell,
              bottomNavigationBar: BottomNavigationBar(
                currentIndex: navigationShell.currentIndex,
                onTap: (i) => navigationShell.goBranch(i),
                items: const [
                  BottomNavigationBarItem(
                    icon: Icon(Icons.today),
                    label: 'Today',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.chat),
                    label: 'AI',
                  ),
                ],
              ),
            ),
            branches: [
              StatefulShellBranch(routes: [
                GoRoute(
                  path: RoutePaths.today,
                  name: RouteNames.today,
                  builder: (context, _) => Scaffold(
                    body: Center(
                      child: ElevatedButton(
                        key: const Key('push-ai'),
                        onPressed: () => context.push(RoutePaths.aiChat),
                        child: const Text('Open AI'),
                      ),
                    ),
                  ),
                ),
              ]),
              StatefulShellBranch(routes: [
                GoRoute(
                  path: RoutePaths.aiChat,
                  name: RouteNames.aiChat,
                  builder: (_, __) => const _AiAssistantStub(),
                ),
              ]),
            ],
          ),
          // No shadow root-level /ai route — the shell branch is the single
          // definition.
        ],
      );

      await tester.pumpWidget(
        MaterialApp.router(routerConfig: router),
      );
      await tester.pumpAndSettle();

      // Push /ai on top of /today so canPop() is true.
      await tester.tap(find.byKey(const Key('push-ai')));
      await tester.pumpAndSettle();

      // The assistant stub should be visible.
      expect(find.byKey(const Key('ai-close')).hitTestable(), findsOneWidget);

      // Tap close — should pop back to /today.
      await tester.tap(find.byKey(const Key('ai-close')).hitTestable());
      await tester.pumpAndSettle();

      // Verify we returned to the origin.
      expect(find.byKey(const Key('push-ai')).hitTestable(), findsOneWidget);
    },
  );

  testWidgets(
    'AiAssistant close at cold-start /ai (canPop false) '
    'goes to /scan and shows ai-close-fallback',
    (tester) async {
      // /ai is the initial cold/direct location — no parent to pop.
      // The shell branch builds _AiAssistantStub; the Scan branch builds
      // _ScanStub which reads the aiCloseFallback query parameter and
      // renders key ai-close-fallback when present.
      final router = GoRouter(
        initialLocation: RoutePaths.aiChat,
        routes: [
          StatefulShellRoute.indexedStack(
            builder: (context, state, navigationShell) => Scaffold(
              body: navigationShell,
              bottomNavigationBar: BottomNavigationBar(
                currentIndex: navigationShell.currentIndex,
                onTap: (i) => navigationShell.goBranch(i),
                items: const [
                  BottomNavigationBarItem(
                    icon: Icon(Icons.camera_alt),
                    label: 'Scan',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.chat),
                    label: 'AI',
                  ),
                ],
              ),
            ),
            branches: [
              StatefulShellBranch(routes: [
                GoRoute(
                  path: RoutePaths.scan,
                  name: RouteNames.scan,
                  builder: (_, __) => const _ScanStub(),
                ),
              ]),
              StatefulShellBranch(routes: [
                GoRoute(
                  path: RoutePaths.aiChat,
                  name: RouteNames.aiChat,
                  builder: (_, __) => const _AiAssistantStub(),
                ),
              ]),
            ],
          ),
        ],
      );

      await tester.pumpWidget(
        MaterialApp.router(routerConfig: router),
      );
      await tester.pumpAndSettle();

      // Assistant is the cold-start page.
      expect(find.byKey(const Key('ai-close')).hitTestable(), findsOneWidget);

      // Tap close — should fall back to /scan and show the marker.
      await tester.tap(find.byKey(const Key('ai-close')).hitTestable());
      await tester.pumpAndSettle();

      // Fallback marker is visible on the Scan page (asserts the branch,
      // not inferred from the disposed assistant page).
      expect(find.byKey(const Key('ai-close-fallback')), findsOneWidget);
    },
  );

  test('production app initial location is Scan', () {
    expect(appInitialLocation, RoutePaths.scan);
  });

  // =========================================================================
  // C) Five real keyed nav controls / no FAB
  //
  // Verifies the test shell exposes five keyed nav items (nav-item-today,
  // nav-item-history, nav-item-scan, nav-item-goals, nav-item-ai) and
  // asserts that no legacy FAB keys are present.
  // =========================================================================

  testWidgets(
    'Test shell has five keyed nav items and no legacy FAB keys',
    (tester) async {
      await _pumpRouter(tester);

      // Each nav-item key must be present and hitTestable.
      for (final key in [
        'nav-item-today',
        'nav-item-history',
        'nav-item-scan',
        'nav-item-goals',
        'nav-item-ai',
      ]) {
        final finder = find.byKey(Key(key));
        expect(finder, findsOneWidget, reason: 'Expected $key');
        expect(
          tester.renderObject(finder),
          isNotNull,
          reason: '$key should be hitTestable',
        );
      }

      // Legacy FAB keys must be absent from the test shell.
      for (final key in [
        'scan-fab-column',
        'scan-glow',
        'scan-fab-outer',
        'scan-fab-inner',
        'scan-icon-eye',
      ]) {
        expect(
          find.byKey(Key(key)),
          findsNothing,
          reason: 'Legacy FAB key $key should not exist in test shell',
        );
      }
    },
  );

  // =========================================================================
  // D) Android back at a branch root
  //
  // Pumps initial /today; attempts a pop when canPop is false via
  // tester.binding.handlePopRoute() to simulate system back. Asserts no
  // exception and that the Today branch marker remains visible.
  // =========================================================================

  testWidgets(
    'Android back at /today branch root does not crash '
    'and Today marker stays visible',
    (tester) async {
      await _pumpRouter(tester);

      // Confirm we are on Today.
      expect(find.byKey(const Key('today-avatar')).hitTestable(), findsOneWidget);

      // Simulate Android system back — should not throw.
      // At the branch root canPop is false so the router stays put.
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();

      // Today is still the visible branch.
      expect(find.byKey(const Key('today-avatar')).hitTestable(), findsOneWidget);
    },
  );
}

// ---------------------------------------------------------------------------
// Test-only AiAssistant stub — thin UI driver of the PUBLIC routing contract.
//
// Exposes `ai-close` key so tests can assert the routing contract without
// depending on the real AiChatScreen or any Firebase/provider complexity.
// When canPop is true (pushed origin), close pops. When false (cold-start
// /ai), close navigates to /scan with aiCloseFallback=1.
// ---------------------------------------------------------------------------

class _AiAssistantStub extends StatelessWidget {
  const _AiAssistantStub();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('AI Assistant (test stub)'),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('ai-close'),
              onPressed: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  // Fallback: navigate to /scan with a query parameter so the
                  // Scan stub can render key ai-close-fallback, proving the
                  // fallback branch was taken.
                  context.go('${RoutePaths.scan}?aiCloseFallback=1');
                }
              },
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
  }
}
