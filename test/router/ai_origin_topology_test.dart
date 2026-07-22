import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:calorix/core/router/app_router.dart';
import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/services/ai_chat_service.dart';
import 'package:calorix/shell/tab_swipe_shell.dart';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

class _TodayDetailStub extends StatelessWidget {
  const _TodayDetailStub();
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ElevatedButton(
          key: const Key('open-ai-overlay'),
          onPressed: () => context.pushNamed(
            RouteNames.aiChatOverlay,
            queryParameters: {'mealId': 'meal-42'},
          ),
          child: const Text('Ask AI about this meal'),
        ),
      ),
    );
  }
}

class _ScanStub extends StatelessWidget {
  const _ScanStub();
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: Text('ScanPage')),
    );
  }
}

// ---------------------------------------------------------------------------
// Minimal stub AiChatService for provider overrides
// ---------------------------------------------------------------------------

class _StubAiChatService implements AiChatService {
  @override
  Future<String> sendMessage({
    required String message,
    required List<AiChatTurn> history,
    required Map<String, Object?> plan,
    required Map<String, Object?> consumed,
  }) async =>
      'Stub reply';
}

// ---------------------------------------------------------------------------
// FakeFirebaseAuth — signed-out, no network
// ---------------------------------------------------------------------------

class _FakeUserCredential extends Fake implements UserCredential {}

class FakeFirebaseAuth extends Fake implements FirebaseAuth {
  @override
  User? get currentUser => null;

  @override
  Stream<User?> authStateChanges() => const Stream.empty();

  @override
  Future<UserCredential> signInAnonymously() async => _FakeUserCredential();
}

// ---------------------------------------------------------------------------
// Test router factory — mirrors production shape: StatefulShellRoute with
// navigatorContainerBuilder returning real TabSwipeShell, a minimal shell
// Scaffold, and a top-level overlay route on root navigator.
// ---------------------------------------------------------------------------

GoRouter _buildTopologyRouter() {
  final rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');
  final todayKey = GlobalKey<NavigatorState>(debugLabel: 'today');
  final aiKey = GlobalKey<NavigatorState>(debugLabel: 'ai');

  return GoRouter(
    navigatorKey: rootKey,
    initialLocation: RoutePaths.today,
    routes: [
      StatefulShellRoute(
        builder: (context, state, navigationShell) => Scaffold(
          body: navigationShell,
          bottomNavigationBar: BottomNavigationBar(
            currentIndex: navigationShell.currentIndex,
            onTap: (i) => navigationShell.goBranch(i),
            items: const [
              BottomNavigationBarItem(
                icon: Icon(Icons.today),
                label: 'Today',
                key: Key('nav-item-today'),
              ),
              BottomNavigationBarItem(
                icon: Icon(Icons.chat),
                label: 'AI',
                key: Key('nav-item-ai'),
              ),
            ],
          ),
        ),
        navigatorContainerBuilder: (context, navigationShell, children) =>
            TabSwipeShell(shell: navigationShell, children: children),
        branches: [
          StatefulShellBranch(
            navigatorKey: todayKey,
            routes: [
              GoRoute(
                path: RoutePaths.today,
                name: RouteNames.today,
                builder: (context, state) => const _TodayDetailStub(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: aiKey,
            routes: [
              GoRoute(
                path: RoutePaths.aiChat,
                name: RouteNames.aiChat,
                builder: (context, state) {
                  final mealId = state.uri.queryParameters['mealId'];
                  return AiChatScreen(preloadedMealId: mealId);
                },
              ),
            ],
          ),
        ],
      ),
      // Top-level overlay route — uses root navigator key
      GoRoute(
        path: RoutePaths.aiChatOverlay,
        name: RouteNames.aiChatOverlay,
        parentNavigatorKey: rootKey,
        builder: (context, state) {
          final mealId = state.uri.queryParameters['mealId'];
          return AiChatScreen(preloadedMealId: mealId);
        },
      ),
      GoRoute(
        path: RoutePaths.scan,
        name: RouteNames.scan,
        parentNavigatorKey: rootKey,
        builder: (context, state) => const _ScanStub(),
      ),
    ],
  );
}

// ---------------------------------------------------------------------------
// Pump helper — ProviderScope with required overrides, real topology router.
// ---------------------------------------------------------------------------

Future<void> _pumpTopology(WidgetTester tester, GoRouter router) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        aiChatServiceProvider.overrideWithValue(_StubAiChatService()),
        authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
        todaySummaryProvider.overrideWithValue(
          (
            kcal: 0,
            proteinG: 0.0,
            carbsG: 0.0,
            fatG: 0.0,
            targetKcal: 2400,
            kcalLeft: 2400,
          ),
        ),
      ],
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  // =========================================================================
  // A) Cross-branch overlay: Today origin -> push overlay -> close -> origin
  // =========================================================================

  testWidgets(
    'From Today origin, push overlay shows AiChatScreen, '
    'close returns to origin; preloaded meal context preserved',
    (tester) async {
      final router = _buildTopologyRouter();
      addTearDown(router.dispose);

      await _pumpTopology(tester, router);

      // Origin is visible.
      expect(
        find.byKey(const Key('open-ai-overlay')).hitTestable(),
        findsOneWidget,
        reason: 'Today origin stub must be visible initially',
      );

      // Push overlay.
      await tester.tap(find.byKey(const Key('open-ai-overlay')).hitTestable());
      await tester.pumpAndSettle();

      // Overlay ai-close is visible.
      expect(
        find.byKey(const ValueKey('ai-close')).hitTestable(),
        findsOneWidget,
        reason: 'AiChatScreen close key must be hitTestable when pushed',
      );

      // Origin is still in tree but NOT hitTestable (obscured by overlay).
      expect(
        find.byKey(const Key('open-ai-overlay')).hitTestable(),
        findsNothing,
        reason: 'Origin must be obscured by the overlay route',
      );

      // Verify preloaded meal context was passed through.
      final overlayFinder = find.byType(AiChatScreen).last;
      final overlayWidget =
          overlayFinder.hitTestable().evaluate().single.widget as AiChatScreen;
      expect(
        overlayWidget.preloadedMealId,
        'meal-42',
        reason: 'Overlay AiChatScreen must receive mealId from push',
      );

      // Tap close -> pop back to origin.
      await tester.tap(find.byKey(const ValueKey('ai-close')).hitTestable());
      await tester.pumpAndSettle();

      expect(
        find.byKey(const Key('open-ai-overlay')).hitTestable(),
        findsOneWidget,
        reason: 'After closing overlay, origin must be visible again',
      );
    },
  );

  // =========================================================================
  // B) AI tab root: ai-close-fallback visible, close navigates to Scan
  // =========================================================================

  testWidgets(
    'Direct AI tab root shows ai-close-fallback, '
    'close navigates to Scan',
    (tester) async {
      final rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');
      final aiKey = GlobalKey<NavigatorState>(debugLabel: 'ai-root');
      final scanKey = GlobalKey<NavigatorState>(debugLabel: 'scan-root');

      final router = GoRouter(
        navigatorKey: rootKey,
        initialLocation: RoutePaths.aiChat,
        routes: [
          StatefulShellRoute(
            builder: (context, state, navigationShell) => Scaffold(
              body: navigationShell,
              bottomNavigationBar: BottomNavigationBar(
                currentIndex: navigationShell.currentIndex,
                onTap: (i) => navigationShell.goBranch(i),
                items: const [
                  BottomNavigationBarItem(
                    icon: Icon(Icons.chat),
                    label: 'AI',
                  ),
                  BottomNavigationBarItem(
                    icon: Icon(Icons.camera_alt),
                    label: 'Scan',
                  ),
                ],
              ),
            ),
            navigatorContainerBuilder: (context, navigationShell, children) =>
                TabSwipeShell(shell: navigationShell, children: children),
            branches: [
              StatefulShellBranch(
                navigatorKey: aiKey,
                routes: [
                  GoRoute(
                    path: RoutePaths.aiChat,
                    name: RouteNames.aiChat,
                    builder: (context, state) => const AiChatScreen(),
                  ),
                ],
              ),
              StatefulShellBranch(
                navigatorKey: scanKey,
                routes: [
                  GoRoute(
                    path: RoutePaths.scan,
                    name: RouteNames.scan,
                    builder: (_, __) => const _ScanStub(),
                  ),
                ],
              ),
            ],
          ),
        ],
      );
      addTearDown(router.dispose);

      await _pumpTopology(tester, router);

      // ai-close-fallback must be hitTestable at root (canPop is false).
      expect(
        find.byKey(const ValueKey('ai-close-fallback')).hitTestable(),
        findsOneWidget,
        reason: 'ai-close-fallback must be visible at cold-start /ai root',
      );
      expect(
        find.byKey(const ValueKey('ai-close')).hitTestable(),
        findsNothing,
        reason: 'ai-close must NOT appear when canPop is false',
      );

      // Tap fallback close -> navigates to Scan.
      await tester
          .tap(find.byKey(const ValueKey('ai-close-fallback')).hitTestable());
      await tester.pumpAndSettle();

      expect(
        find.text('ScanPage').hitTestable(),
        findsOneWidget,
        reason: 'Fallback close must navigate to the Scan branch',
      );
    },
  );

  // =========================================================================
  // C) Structural: real routerProvider configuration
  // =========================================================================

  test(
    'RouteNames.aiChatOverlay is a top-level GoRoute with '
    'non-null parentNavigatorKey; aiChat remains inside a '
    'StatefulShellRoute branch',
    () {
      final container = ProviderContainer(
        overrides: [
          firebaseAuthProvider.overrideWithValue(FakeFirebaseAuth()),
        ],
      );
      addTearDown(container.dispose);

      final router = container.read(routerProvider);

      // --- Find the top-level GoRoute for aiChatOverlay ---
      final overlayRoutes =
          router.configuration.routes.whereType<GoRoute>().where(
                (r) => r.name == RouteNames.aiChatOverlay,
              );
      expect(
        overlayRoutes.length,
        1,
        reason:
            'RouteNames.aiChatOverlay must exist as a single top-level GoRoute',
      );

      final overlayRoute = overlayRoutes.first;
      expect(
        overlayRoute.parentNavigatorKey,
        isNotNull,
        reason: 'aiChatOverlay must have a non-null parentNavigatorKey',
      );

      // --- Verify aiChat is inside a StatefulShellRoute branch ---
      final shellRoutes =
          router.configuration.routes.whereType<StatefulShellRoute>();
      expect(
        shellRoutes.length,
        1,
        reason: 'There must be exactly one StatefulShellRoute',
      );

      final shellRoute = shellRoutes.first;
      final aiBranches = shellRoute.branches.where((branch) {
        return branch.routes
            .whereType<GoRoute>()
            .any((r) => r.name == RouteNames.aiChat);
      });
      expect(
        aiBranches.length,
        1,
        reason: 'RouteNames.aiChat must live inside exactly one '
            'StatefulShellRoute branch',
      );

      // --- Ensure aiChatOverlay is NOT duplicated inside the shell ---
      final shellOverlayMatches = shellRoute.branches
          .expand((b) => b.routes)
          .whereType<GoRoute>()
          .where(
            (r) => r.name == RouteNames.aiChatOverlay,
          );
      expect(
        shellOverlayMatches.isEmpty,
        isTrue,
        reason: 'aiChatOverlay must NOT be duplicated inside '
            'StatefulShellRoute branches',
      );
    },
  );

  test(
    'RouteNames.aiChatOverlay and RoutePaths.aiChatOverlay constants exist',
    () {
      expect(
        RouteNames.aiChatOverlay,
        isA<String>(),
        reason: 'RouteNames.aiChatOverlay must be defined',
      );
      expect(
        RouteNames.aiChatOverlay.isNotEmpty,
        isTrue,
        reason: 'RouteNames.aiChatOverlay must not be empty',
      );
      expect(
        RoutePaths.aiChatOverlay,
        isA<String>(),
        reason: 'RoutePaths.aiChatOverlay must be defined',
      );
      expect(
        RoutePaths.aiChatOverlay.startsWith('/'),
        isTrue,
        reason: 'RoutePaths.aiChatOverlay must be an absolute path',
      );
    },
  );
}
