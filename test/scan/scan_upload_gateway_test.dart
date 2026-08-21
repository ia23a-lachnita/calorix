import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

import 'support/fake_camera_service.dart';
import 'support/fake_scan_upload_gateway.dart';
import 'support/pump_scan.dart';

void main() {
  group('ScanUploadGateway planned split API', () {
    testWidgets(
      'successful capture calls enqueue with uid and scanMode, '
      'then scheduleDrain exactly once',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway();
        await pumpScan(
          tester,
          camera: camera,
          extraOverrides: [
            currentUidProvider.overrideWithValue('uid-split'),
            scanUploadGatewayProvider.overrideWithValue(gateway),
          ],
        );

        await tester.tap(find.byKey(const ValueKey('capture-button')));
        // Microtask pump resolves enqueue; 240ms reaches Processing.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 240));

        expect(gateway.enqueueCallCount, 1);
        expect(gateway.lastEnqueueUid, 'uid-split');
        expect(gateway.lastEnqueueScanMode, isNotEmpty);
        expect(gateway.scheduleDrainCallCount, 1);
      },
    );

    testWidgets(
      'drain error is consumed internally — no unhandled exception escapes',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway()
          ..drainError = Exception('transport timeout');
        await pumpScan(
          tester,
          camera: camera,
          extraOverrides: [
            currentUidProvider.overrideWithValue('uid-split'),
            scanUploadGatewayProvider.overrideWithValue(gateway),
          ],
        );

        await tester.tap(find.byKey(const ValueKey('capture-button')));
        // Microtask pump resolves enqueue; 240ms reaches Processing.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 240));

        // Drain error is consumed — no zone error.
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'a null capture file never reaches the gateway',
      (tester) async {
        final camera = FakeCameraService()..returnNullFile = true;
        final gateway = FakeScanUploadGateway();
        await pumpScan(
          tester,
          camera: camera,
          extraOverrides: [
            currentUidProvider.overrideWithValue('uid-split'),
            scanUploadGatewayProvider.overrideWithValue(gateway),
          ],
        );

        await tester.tap(find.byKey(const ValueKey('capture-button')));
        await tester.pumpAndSettle();

        expect(gateway.enqueueCallCount, 0);
        expect(find.byKey(const Key('capture-core-idle')), findsOneWidget);
      },
    );

    testWidgets(
      'unmounting mid-enqueue does not throw when enqueue later completes',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway()..holdEnqueue = true;
        await pumpScan(
          tester,
          camera: camera,
          extraOverrides: [
            currentUidProvider.overrideWithValue('uid-split'),
            scanUploadGatewayProvider.overrideWithValue(gateway),
          ],
        );

        await tester.tap(find.byKey(const ValueKey('capture-button')));
        await tester.pump(const Duration(milliseconds: 50));

        await tester.pumpWidget(const SizedBox());
        gateway.completeEnqueue('entry-after-unmount');
        await tester.pump(const Duration(milliseconds: 50));

        expect(tester.takeException(), isNull);
      },
    );
  });
}
