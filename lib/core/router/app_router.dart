import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'route_names.dart';
import '../../shell/app_shell.dart';
import '../../features/scan/scan_screen.dart';
import '../../features/processing/processing_screen.dart';
import '../../features/today/today_screen.dart';
import '../../features/food_detail/food_detail_sheet.dart';
import '../../features/history/history_screen.dart';
import '../../features/history/history_day_screen.dart';
import '../../features/goals/goals_screen.dart';
import '../../features/ai_chat/ai_chat_screen.dart';
import '../../features/profile/profile_sheet.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _scanNavKey = GlobalKey<NavigatorState>(debugLabel: 'scan');
final _todayNavKey = GlobalKey<NavigatorState>(debugLabel: 'today');
final _historyNavKey = GlobalKey<NavigatorState>(debugLabel: 'history');
final _goalsNavKey = GlobalKey<NavigatorState>(debugLabel: 'goals');
final _aiNavKey = GlobalKey<NavigatorState>(debugLabel: 'ai');

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: RoutePaths.scan,
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
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
                  return AiChatScreen(preloadedMealId: mealContext);
                },
              ),
            ],
          ),
        ],
      ),
      // Full-screen routes outside shell
      GoRoute(
        path: '/processing/:id',
        name: RouteNames.processing,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return ProcessingScreen(entryId: id);
        },
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
    ],
  );
});
