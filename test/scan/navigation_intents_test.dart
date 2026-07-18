import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/features/scan/scan_screen.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/services/camera_service.dart';

import 'support/fake_camera_service.dart';

Widget _buildScan(
  CameraService camera, {
  VoidCallback? onManualEntryRequested,
  VoidCallback? onRecentRequested,
}) {
  return ProviderScope(
    overrides: [
      authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
      cameraServiceProvider.overrideWithValue(camera),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      home: ScanScreen(
        onManualEntryRequested: onManualEntryRequested,
        onRecentRequested: onRecentRequested,
      ),
    ),
  );
}

void main() {
  testWidgets(
    'add-manually from the denied permission state emits a real '
    'navigation intent instead of a silent no-op — without inventing '
    'the Task 8 manual-entry screen',
    (tester) async {
      var manualRequested = false;
      final fake = FakeCameraService()..granted = false;

      await tester.pumpWidget(_buildScan(
        fake,
        onManualEntryRequested: () => manualRequested = true,
      ));
      await tester.pump(const Duration(milliseconds: 300));

      await tester.tap(
        find.byKey(const ValueKey('permission-add-manually-card')),
      );
      await tester.pump();

      expect(manualRequested, isTrue);
    },
  );

  testWidgets(
    'RECENT emits a real, observable navigation intent',
    (tester) async {
      var recentRequested = false;
      final fake = FakeCameraService();

      await tester.pumpWidget(_buildScan(
        fake,
        onRecentRequested: () => recentRequested = true,
      ));
      await tester.pump(const Duration(milliseconds: 300));

      await tester.tap(find.text('RECENT'));
      await tester.pump();

      expect(recentRequested, isTrue);
    },
  );
}
