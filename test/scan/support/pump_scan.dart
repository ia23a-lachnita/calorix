import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/features/scan/scan_screen.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/services/camera_service.dart';

/// Pumps [ScanScreen] with [camera] injected via [cameraServiceProvider],
/// wrapped in the app themes, matching how the production shell hosts it.
Future<void> pumpScan(
  WidgetTester tester, {
  required CameraService camera,
  List<Override> extraOverrides = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
        cameraServiceProvider.overrideWithValue(camera),
        ...extraOverrides,
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: ThemeMode.dark,
        home: const ScanScreen(),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}
