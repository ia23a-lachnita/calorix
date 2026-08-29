import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/core/motion/app_motion.dart';
import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/features/scan/scan_screen.dart';
import 'package:calorix/features/processing/processing_screen.dart';
import 'package:calorix/features/processing/providers/processing_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/processing_state.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/services/camera_service.dart';

/// Pumps [ScanScreen] with [camera] injected via [cameraServiceProvider],
/// wrapped in a real [GoRouter] hosting both the scan and processing routes.
/// This allows tests to assert navigation to the Processing destination.
///
/// When [disableAnimations] is true the actual routed [ScanScreen] is wrapped
/// in a [MediaQuery] with `disableAnimations: true`, so
/// [AppMotion.reducedOf] returns true inside the screen and its children.
Future<void> pumpScan(
  WidgetTester tester, {
  required CameraService camera,
  bool disableAnimations = false,
  List<Override> extraOverrides = const [],
}) async {
  Widget scanBuilder(BuildContext context, GoRouterState _) {
    Widget child = const ScanScreen();
    if (disableAnimations) {
      child = MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: true),
        child: child,
      );
    }
    return child;
  }

  final router = GoRouter(
    initialLocation: '/scan',
    routes: [
      GoRoute(
        path: '/scan',
        name: RouteNames.scan,
        builder: scanBuilder,
      ),
      GoRoute(
        path: '/processing/:id',
        name: RouteNames.processing,
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
          return MaterialPage(
            key: state.pageKey,
            child: ProcessingScreen(entryId: id),
          );
        },
      ),
    ],
  );
  // Safe defaults for the processing route so reaching Processing never
  // initializes real Firebase/network.  Placed BEFORE extraOverrides so
  // caller-supplied overrides win when present.
  final processingDefaults = <Override>[
    processingEntryProvider.overrideWith(
      (ref, entryId) => const Stream<FoodEntry?>.empty(),
    ),
    processingStateProvider.overrideWith(
      (ref, entryId) => const AsyncData(
        ProcessingState(phase: ProcessingPhase.localUploading),
      ),
    ),
  ];

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
        cameraServiceProvider.overrideWithValue(camera),
        ...processingDefaults,
        ...extraOverrides,
      ],
      child: MaterialApp.router(
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: ThemeMode.dark,
        routerConfig: router,
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}
