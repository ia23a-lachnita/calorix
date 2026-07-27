import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/constants/app_constants.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/features/scan/permission_screen.dart';
import 'package:calorix/shared/services/camera_settings_service.dart';
import 'package:calorix/shared/services/camera_service.dart';

import 'support/fake_camera_service.dart';
import 'support/pump_scan.dart';

void main() {
  testWidgets(
    'denied permission routes to permission screen with blurred viewfinder '
    'and add-manually card',
    (tester) async {
      final fake = FakeCameraService()..granted = false;
      await pumpScan(tester, camera: fake);

      expect(find.byType(PermissionScreen), findsOneWidget);
      expect(
        find.byKey(const ValueKey('permission-blurred-viewfinder')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('permission-add-manually-card')),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('capture-button')), findsNothing);
    },
  );

  testWidgets('regrant opens app settings and resume transitions to scan_idle',
      (tester) async {
    final fake = FakeCameraService()..granted = false;
    final settings = _FakeCameraSettingsService()..settingsRequired = true;
    await pumpScan(
      tester,
      camera: fake,
      extraOverrides: [
        cameraSettingsServiceProvider.overrideWithValue(settings),
      ],
    );

    expect(find.byType(PermissionScreen), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('permission-regrant-button')));
    await tester.pump();

    expect(settings.openCount, 1);
    expect(find.byType(PermissionScreen), findsOneWidget);

    fake.granted = true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.byType(PermissionScreen), findsNothing);
    expect(find.byKey(const ValueKey('capture-button')), findsOneWidget);
  });

  testWidgets('first-time permission request grants access without settings',
      (tester) async {
    final fake = FakeCameraService()
      ..granted = false
      ..grantOnRequest = true;
    final settings = _FakeCameraSettingsService();
    await pumpScan(
      tester,
      camera: fake,
      extraOverrides: [
        cameraSettingsServiceProvider.overrideWithValue(settings),
      ],
    );

    await tester.tap(find.byKey(const ValueKey('permission-regrant-button')));
    await tester.pumpAndSettle();

    expect(fake.requestPermissionCount, 1);
    expect(settings.openCount, 0);
    expect(find.byType(PermissionScreen), findsNothing);
    expect(find.byKey(const ValueKey('capture-button')), findsOneWidget);
  });

  testWidgets('permanent denial request result opens app settings',
      (tester) async {
    final fake = FakeCameraService()
      ..granted = false
      ..permissionRequestResult =
          CameraPermissionRequestResult.settingsRequired;
    final settings = _FakeCameraSettingsService();
    await pumpScan(
      tester,
      camera: fake,
      extraOverrides: [
        cameraSettingsServiceProvider.overrideWithValue(settings),
      ],
    );

    await tester.tap(find.byKey(const ValueKey('permission-regrant-button')));
    await tester.pump();

    expect(fake.requestPermissionCount, 1);
    expect(settings.openCount, 1);
    expect(find.byType(PermissionScreen), findsOneWidget);
  });

  testWidgets(
    'add manually invokes the manual-entry navigation intent',
    (tester) async {
      var manualRequested = false;

      await tester.pumpWidget(
        MaterialApp(
          home: PermissionScreen(
            onOpenSettings: () async {},
            onAddManually: () => manualRequested = true,
          ),
        ),
      );

      await tester.tap(
        find.byKey(const ValueKey('permission-add-manually-card')),
      );
      await tester.pump();

      expect(manualRequested, isTrue);
    },
  );

  testWidgets(
    'copy uses the swappable app display name and never hard-codes '
    'Calorix',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: PermissionScreen(
            onOpenSettings: () async {},
            onAddManually: () {},
          ),
        ),
      );

      expect(
        find.textContaining(AppConstants.appDisplayName),
        findsWidgets,
      );

      final allText = tester
          .widgetList<Text>(find.byType(Text))
          .map((widget) => widget.data ?? '')
          .join('\n');
      expect(allText.contains('Calorix'), isFalse);
    },
  );

  for (final brightness in [Brightness.dark, Brightness.light]) {
    testWidgets(
      'fixture mode renders the iOS-style prompt and manual fallback in '
      '${brightness.name}',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData(brightness: brightness),
            home: PermissionScreen(
              showFixtureSystemPrompt: true,
              onOpenSettings: () async {},
              onAddManually: () {},
            ),
          ),
        );

        expect(
          find.byKey(const ValueKey('permission-fixture-system-prompt')),
          findsOneWidget,
        );
        expect(
          find.textContaining('Would Like to Access the Camera'),
          findsOneWidget,
        );
        expect(find.text("Don't Allow"), findsOneWidget);
        expect(find.text('Allow'), findsOneWidget);
        expect(find.text('No camera? No problem.'), findsOneWidget);
        expect(find.text('Add manually'), findsOneWidget);
      },
    );
  }
}

class _FakeCameraSettingsService implements CameraSettingsService {
  int openCount = 0;
  bool settingsRequired = false;

  @override
  Future<bool> requiresSettings() async => settingsRequired;

  @override
  Future<bool> openSettings() async {
    openCount++;
    return true;
  }
}
