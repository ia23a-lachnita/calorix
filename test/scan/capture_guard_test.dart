import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

import 'support/fake_camera_service.dart';
import 'support/fake_scan_upload_gateway.dart';
import 'support/pump_scan.dart';

void main() {
  testWidgets(
    'rapid triple tap against a genuinely in-flight first capture '
    'performs exactly one capture',
    (tester) async {
      // holdCapture models a real in-flight capture (the shutter hasn't
      // resolved yet) rather than relying on an artificial permanently-
      // capturing state — the guard must hold on real async timing.
      final fake = FakeCameraService()..holdCapture = true;
      final gateway = FakeScanUploadGateway();
      await pumpScan(
        tester,
        camera: fake,
        extraOverrides: [
          currentUidProvider.overrideWithValue('uid-guard-test'),
          scanUploadGatewayProvider.overrideWithValue(gateway),
        ],
      );

      final button = find.byKey(const ValueKey('capture-button'));
      await tester.tap(button);
      await tester.tap(button);
      await tester.tap(button);
      await tester.pump(const Duration(milliseconds: 50));

      expect(fake.captureCount, 1);

      fake.completeCapture();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 240));
      await tester.pump();
    },
  );

  testWidgets(
    'capturing state shows conic spinner, shimmer, and ANALYZING hint — '
    'and no stop/cancel control',
    (tester) async {
      final fake = FakeCameraService()..holdCapture = true;
      final gateway = FakeScanUploadGateway();
      await pumpScan(
        tester,
        camera: fake,
        extraOverrides: [
          currentUidProvider.overrideWithValue('uid-guard-test'),
          scanUploadGatewayProvider.overrideWithValue(gateway),
        ],
      );

      await tester.tap(find.byKey(const ValueKey('capture-button')));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.byKey(const ValueKey('capture-spinner')), findsOneWidget);
      expect(find.byKey(const ValueKey('capture-shimmer')), findsOneWidget);
      expect(find.text('ANALYZING…'), findsOneWidget);
      expect(find.byKey(const ValueKey('stop-button')), findsNothing);

      fake.completeCapture();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 240));
      await tester.pump();
    },
  );
}
