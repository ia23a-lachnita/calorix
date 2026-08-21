import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/features/processing/processing_screen.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'support/fake_camera_service.dart';
import 'support/fake_scan_upload_gateway.dart';
import 'support/pump_scan.dart';

void main() {
  group('Durable enqueue before navigation', () {
    testWidgets(
      'enqueue completes and returns entryId before navigation is triggered',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway();

        await pumpScan(
          tester,
          camera: camera,
          extraOverrides: [
            currentUidProvider.overrideWithValue('uid-test'),
            scanUploadGatewayProvider.overrideWithValue(gateway),
          ],
        );

        await tester.tap(find.byKey(const ValueKey('capture-button')));
        // Microtask pump resolves the synchronous enqueue; 240ms reaches
        // Processing where scheduleDrain is called.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 240));
        // GoRouter requires a following zero-time render frame to commit
        // the route transition.
        await tester.pump();

        expect(gateway.enqueueCallCount, 1);
        expect(gateway.lastEnqueueUid, 'uid-test');
        expect(gateway.lastEnqueueScanMode, isNotEmpty);
        expect(gateway.scheduleDrainCallCount, 1);
      },
    );

    testWidgets(
      'enqueue failure prevents navigation and returns capture to idle',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway()
          ..throwOnEnqueue = Exception('enqueue failure');

        await pumpScan(
          tester,
          camera: camera,
          extraOverrides: [
            currentUidProvider.overrideWithValue('uid-test'),
            scanUploadGatewayProvider.overrideWithValue(gateway),
          ],
        );

        await tester.tap(find.byKey(const ValueKey('capture-button')));
        await tester.pumpAndSettle();

        expect(gateway.enqueueCallCount, 1);
        expect(gateway.scheduleDrainCallCount, 0);
        expect(find.byKey(const Key('capture-core-idle')), findsOneWidget);
      },
    );

    testWidgets(
      'Processing screen is visible while drain Completer remains unresolved',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway()..holdDrain = true;

        await pumpScan(
          tester,
          camera: camera,
          extraOverrides: [
            currentUidProvider.overrideWithValue('uid-test'),
            scanUploadGatewayProvider.overrideWithValue(gateway),
          ],
        );

        await tester.tap(find.byKey(const ValueKey('capture-button')));
        // Microtask pump + 240ms cardEntrance to reach Processing.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 240));
        // GoRouter requires a following zero-time render frame to commit
        // the route transition.
        await tester.pump();

        // Enqueue has completed, drain is unresolved — Processing is visible.
        expect(gateway.enqueueCallCount, 1);
        expect(gateway.scheduleDrainCallCount, 1);
        expect(find.byType(ProcessingScreen), findsOneWidget);
        expect(gateway.isDrainPending, isTrue);
      },
    );

    testWidgets(
      'scheduleDrain is invoked exactly once and strictly after enqueue completes',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway()..holdDrain = true;

        await pumpScan(
          tester,
          camera: camera,
          extraOverrides: [
            currentUidProvider.overrideWithValue('uid-test'),
            scanUploadGatewayProvider.overrideWithValue(gateway),
          ],
        );

        await tester.tap(find.byKey(const ValueKey('capture-button')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 240));

        expect(gateway.enqueueCallCount, 1);
        expect(gateway.scheduleDrainCallCount, 1);

        // Verify ordering: enqueueComplete before scheduleDrainCalled.
        final enqueueIdx = gateway.events.indexOf(
          FakeGatewayEvent.enqueueComplete,
        );
        final drainIdx = gateway.events.indexOf(
          FakeGatewayEvent.scheduleDrainCalled,
        );
        expect(enqueueIdx, lessThan(drainIdx));
      },
    );
  });
}
