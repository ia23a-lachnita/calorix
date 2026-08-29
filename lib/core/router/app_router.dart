import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'route_names.dart';
import 'route_fallback.dart';
import '../../debug/debug_capture_screen.dart';
import '../../debug/debug_deep_links.dart';
import '../../debug/debug_reseed_screen.dart';
import '../../shell/app_shell.dart';
import '../../shell/tab_swipe_shell.dart';
import '../../features/onboarding/loading_screen.dart';
import '../../features/onboarding/login_screen.dart';
import '../../features/scan/scan_screen.dart';
import '../../features/processing/processing_screen.dart';
import '../../features/today/today_screen.dart';
import '../../features/food_detail/food_detail_sheet.dart';
import '../../features/history/history_screen.dart';
import '../../features/history/history_day_screen.dart';
import '../../features/goals/goals_screen.dart';
import '../../features/ai_chat/ai_chat_screen.dart';
import '../../features/ai_chat/ai_history_screen.dart';
import '../../features/profile/profile_sheet.dart';
import '../../features/review/review_screen.dart';
import '../../features/manual/manual_entry_screen.dart';
import '../../shared/providers/auth_provider.dart';
import '../../shared/providers/ui_diff_provider.dart';
import '../motion/app_motion.dart';

const String appInitialLocation = RoutePaths.scan;

/// Re-runs router redirects whenever the Firebase auth state changes.
class _AuthRefresh extends ChangeNotifier {
  late final StreamSubscription<dynamic> _sub;
  _AuthRefresh(Stream<dynamic> stream) {
    _sub = stream.listen((_) => notifyListeners());
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

final _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _scanNavKey = GlobalKey<NavigatorState>(debugLabel: 'scan');
final _todayNavKey = GlobalKey<NavigatorState>(debugLabel: 'today');
final _historyNavKey = GlobalKey<NavigatorState>(debugLabel: 'history');
final _goalsNavKey = GlobalKey<NavigatorState>(debugLabel: 'goals');
final _aiNavKey = GlobalKey<NavigatorState>(debugLabel: 'ai');

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(firebaseAuthProvider);
  final refresh = _AuthRefresh(auth.authStateChanges());
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: appInitialLocation,
    refreshListenable: refresh,
    redirect: (context, state) {
      // GoRouter receives the full custom-scheme URI as the location string.
      // Normalise calorix:// deep links to plain paths so routes can match.
      final loc = state.uri.toString();
      if (loc.startsWith('calorix://debug/reseed')) {
        return kDebugMode
            ? loc.replaceFirst('calorix://debug/reseed', '/debug/reseed')
            : RoutePaths.today;
      }

      final signedIn = auth.currentUser != null;
      final onOnboarding = loc.startsWith(RoutePaths.loading) ||
          loc.startsWith(RoutePaths.login);

      // The debug reseed route manages its own auth for automation.
      if (loc.startsWith('/debug/reseed')) return null;
      if (ref.read(uiDiffModeProvider)) return null;

      if (!signedIn && !onOnboarding) return RoutePaths.login;
      if (signedIn && loc.startsWith(RoutePaths.login)) return RoutePaths.scan;
      return null;
    },
    routes: [
      GoRoute(
        path: RoutePaths.loading,
        name: RouteNames.loading,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const LoadingScreen(),
      ),
      GoRoute(
        path: RoutePaths.login,
        name: RouteNames.login,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const LoginScreen(),
      ),
      StatefulShellRoute(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        navigatorContainerBuilder: (context, navigationShell, children) =>
            TabSwipeShell(shell: navigationShell, children: children),
        branches: [
          StatefulShellBranch(
            navigatorKey: _todayNavKey,
            routes: [
              GoRoute(
                path: RoutePaths.today,
                name: RouteNames.today,
                builder: (context, state) => const TodayScreen(),
                routes: [
                  GoRoute(
                    path: 'food/:id',
                    name: RouteNames.foodDetail,
                    pageBuilder: (context, state) {
                      final id = state.pathParameters['id']!;
                      return CustomTransitionPage(
                        key: state.pageKey,
                        child: FoodDetailSheet(entryId: id),
                        transitionsBuilder:
                            (context, animation, secondaryAnimation, child) {
                          return SlideTransition(
                            position: Tween<Offset>(
                              begin: const Offset(0, 1),
                              end: Offset.zero,
                            ).animate(CurvedAnimation(
                              parent: animation,
                              curve: Curves.easeOut,
                            )),
                            child: child,
                          );
                        },
                        transitionDuration: MotionDurations.cardExpansion,
                      );
                    },
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _historyNavKey,
            routes: [
              GoRoute(
                path: RoutePaths.history,
                name: RouteNames.history,
                builder: (context, state) => const HistoryScreen(),
                routes: [
                  GoRoute(
                    path: ':date',
                    name: RouteNames.historyDay,
                    builder: (context, state) {
                      final date = state.pathParameters['date']!;
                      return HistoryDayScreen(date: date);
                    },
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _scanNavKey,
            routes: [
              GoRoute(
                path: RoutePaths.scan,
                name: RouteNames.scan,
                builder: (context, state) => const ScanScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _goalsNavKey,
            routes: [
              GoRoute(
                path: RoutePaths.goals,
                name: RouteNames.goals,
                builder: (context, state) => const GoalsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _aiNavKey,
            routes: [
              GoRoute(
                path: RoutePaths.aiChat,
                name: RouteNames.aiChat,
                builder: (context, state) {
                  final mealContext = state.uri.queryParameters['mealId'];
                  final threadId = state.uri.queryParameters['threadId'];
                  return AiChatScreen(
                    preloadedMealId: mealContext,
                    threadId: threadId,
                  );
                },
                routes: [
                  GoRoute(
                    path: 'history',
                    name: RouteNames.aiHistory,
                    builder: (context, state) => const AiHistoryScreen(),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      // Full-screen routes outside shell
      GoRoute(
        path: RoutePaths.aiChatOverlay,
        name: RouteNames.aiChatOverlay,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final mealId = state.uri.queryParameters['mealId'];
          final threadId = state.uri.queryParameters['threadId'];
          return AiChatScreen(
            preloadedMealId: mealId,
            threadId: threadId,
          );
        },
      ),
      GoRoute(
        path: '/processing/:id',
        name: RouteNames.processing,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) {
          final id = state.pathParameters['id']!;
          final extra = state.extra;
          if (extra is ProcessingCaptureTransition) {
            return CustomTransitionPage(
              key: state.pageKey,
              child: ProcessingScreen(entryId: id, captureTransition: extra),
              transitionDuration:
                  extra.animate ? MotionDurations.cardExpansion : Duration.zero,
              transitionsBuilder:
                  (context, animation, secondaryAnimation, child) =>
                      FadeTransition(opacity: animation, child: child),
            );
          }
          // Absent/wrong extra preserves the direct/deep-link skeleton
          // behavior: plain construction, default platform page transition.
          return MaterialPage(
            key: state.pageKey,
            child: ProcessingScreen(entryId: id),
          );
        },
      ),
      GoRoute(
        path: RoutePaths.review,
        name: RouteNames.review,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: ReviewScreen(entryId: state.pathParameters['id']!),
          transitionDuration: MotionDurations.sheetSlideUp,
          transitionsBuilder: (_, animation, __, child) => SlideTransition(
            position: Tween(begin: const Offset(0, 1), end: Offset.zero)
                .animate(CurvedAnimation(
              parent: animation,
              curve: Curves.easeOutCubic,
            )),
            child: child,
          ),
        ),
      ),
      GoRoute(
        path: RoutePaths.manual,
        name: RouteNames.manual,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const ManualEntryScreen(),
      ),
      GoRoute(
        path: RoutePaths.profile,
        name: RouteNames.profile,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const ProfileSheet(),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, 1),
                end: Offset.zero,
              ).animate(CurvedAnimation(
                parent: animation,
                curve: Curves.easeOut,
              )),
              child: child,
            );
          },
          transitionDuration: const Duration(milliseconds: 320),
        ),
      ),
      GoRoute(
        path: RoutePaths.permission,
        name: RouteNames.permission,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => ScanScreen(
          onPermissionGranted: () {
            if (context.mounted) popOrGo(context, RoutePaths.scan);
          },
          onManualEntryRequested: () {
            context.goNamed(RouteNames.manual);
          },
        ),
      ),
      if (kDebugMode) ...[
        GoRoute(
          path: '/debug/reseed',
          parentNavigatorKey: _rootNavigatorKey,
          builder: (context, state) {
            final params = state.uri.queryParameters;
            final theme = UiDiffCaptureTheme.values.firstWhere(
              (value) => value.name == params['theme'],
              orElse: () => UiDiffCaptureTheme.dark,
            );
            return DebugReseedScreen(
              screenId: params['screen'] ?? 'today',
              theme: theme,
              nonce: params['nonce'] ?? 'manual',
              fixtureEpochMs:
                  int.tryParse(params['fixtureEpochMs'] ?? '') ?? 1778846400000,
            );
          },
        ),
        GoRoute(
          path: '/debug/capture/:id',
          parentNavigatorKey: _rootNavigatorKey,
          builder: (context, state) => DebugCaptureScreen(
            targetId: state.pathParameters['id']!,
          ),
        ),
      ],
    ],
  );
});
