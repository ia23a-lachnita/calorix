import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

import 'support/fake_camera_service.dart';
import 'support/fake_scan_upload_gateway.dart';
import 'support/pump_scan.dart';

void main() {
  testWidgets(
    'successful capture uploads through the injected gateway, not a '
    'real backend call, and passes uid/scanMode through',
    (tester) async {
      final camera = FakeCameraService();
      final gateway = FakeScanUploadGateway();
      await pumpScan(
        tester,
        camera: camera,
        extraOverrides: [
          currentUidProvider.overrideWithValue('uid-remediation'),
          scanUploadGatewayProvider.overrideWithValue(gateway),
        ],
      );

      await tester.tap(find.byKey(const ValueKey('capture-button')));
      await tester.pumpAndSettle();

      expect(gateway.callCount, 1);
      expect(gateway.lastUid, 'uid-remediation');
      expect(gateway.lastScanMode, isNotEmpty);
    },
  );

  testWidgets(
    'upload failure returns capture state to idle instead of staying '
    'stuck',
    (tester) async {
      final camera = FakeCameraService();
      final gateway = FakeScanUploadGateway()..throwOnUpload = true;
      await pumpScan(
        tester,
        camera: camera,
        extraOverrides: [
          currentUidProvider.overrideWithValue('uid-remediation'),
          scanUploadGatewayProvider.overrideWithValue(gateway),
        ],
      );

      await tester.tap(find.byKey(const ValueKey('capture-button')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('capture-core-idle')), findsOneWidget);
    },
  );

  testWidgets(
    'unmounting mid-upload does not throw when the upload later resolves',
    (tester) async {
      final camera = FakeCameraService();
      final gateway = FakeScanUploadGateway()..holdUpload = true;
      await pumpScan(
        tester,
        camera: camera,
        extraOverrides: [
          currentUidProvider.overrideWithValue('uid-remediation'),
          scanUploadGatewayProvider.overrideWithValue(gateway),
        ],
      );

      await tester.tap(find.byKey(const ValueKey('capture-button')));
      await tester.pump(const Duration(milliseconds: 50));

      await tester.pumpWidget(const SizedBox());
      gateway.completeUpload('entry-after-unmount');
      await tester.pump(const Duration(milliseconds: 50));

      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'a null capture file never reaches the upload gateway',
    (tester) async {
      final camera = FakeCameraService()..returnNullFile = true;
      final gateway = FakeScanUploadGateway();
      await pumpScan(
        tester,
        camera: camera,
        extraOverrides: [
          currentUidProvider.overrideWithValue('uid-remediation'),
          scanUploadGatewayProvider.overrideWithValue(gateway),
        ],
      );

      await tester.tap(find.byKey(const ValueKey('capture-button')));
      await tester.pumpAndSettle();

      expect(gateway.callCount, 0);
      expect(find.byKey(const Key('capture-core-idle')), findsOneWidget);
    },
  );
}
