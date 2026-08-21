import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/features/processing/processing_screen.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

import 'support/fake_camera_service.dart';
import 'support/fake_scan_upload_gateway.dart';
import 'support/pump_scan.dart';

/// Planned ValueKey for the captured-photo morph overlay that bridges the
/// scan-to-processing transition. Production will add this key; the test
/// suite verifies it appears, persists for at most 240ms (the cardEntrance
/// boundary), and then navigation to Processing completes.
const ValueKey<String> _morphKey = ValueKey('capture-morph-overlay');

void main() {
  group('Capture morph overlay', () {
    testWidgets(
      'after capture/enqueue the morph overlay appears, Processing is absent '
      'before cardEntrance, and Processing replaces morph at cardEntrance '
      'with scheduleDrain called and holdDrain unresolved',
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

        // Trigger capture — enqueue completes immediately, drain is held.
        await tester.tap(find.byKey(const ValueKey('capture-button')));
        // Microtask pump: enqueue future resolves, overlay scheduled.
        await tester.pump();

        // After enqueue settles the morph overlay is visible.
        expect(find.byKey(_morphKey), findsOneWidget);

        // Before 240ms Processing must NOT be visible and scheduleDrain
        // must not have been called yet.
        expect(find.byType(ProcessingScreen), findsNothing);
        expect(gateway.scheduleDrainCallCount, 0);

        // Advance 239ms — one tick before cardEntrance boundary.
        await tester.pump(const Duration(milliseconds: 239));
        expect(find.byKey(_morphKey), findsOneWidget);
        expect(find.byType(ProcessingScreen), findsNothing);
        expect(gateway.scheduleDrainCallCount, 0);

        // Advance final 1ms to reach cardEntrance (240ms total).
        // GoRouter requires a following zero-time render frame to commit
        // the route transition.
        await tester.pump(const Duration(milliseconds: 1));
        await tester.pump();
        expect(find.byType(ProcessingScreen), findsOneWidget);
        expect(find.byKey(_morphKey), findsNothing);
        expect(gateway.scheduleDrainCallCount, 1);

        // holdDrain is still unresolved — the route is NOT blocked by drain.
        expect(gateway.isDrainPending, isTrue);

        // Processing screen stays visible without pumpAndSettle
        // (shimmer animates indefinitely).
        await tester.pump();
        expect(find.byType(ProcessingScreen), findsOneWidget);
      },
    );

    testWidgets(
      'reduced motion navigates to Processing immediately after enqueue '
      'without the 240ms morph overlay delay',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway()..holdDrain = true;

        // pumpScan with disableAnimations wraps the actual routed ScanScreen
        // in MediaQuery(disableAnimations: true).
        await pumpScan(
          tester,
          camera: camera,
          disableAnimations: true,
          extraOverrides: [
            currentUidProvider.overrideWithValue('uid-test'),
            scanUploadGatewayProvider.overrideWithValue(gateway),
          ],
        );

        await tester.tap(find.byKey(const ValueKey('capture-button')));
        // Microtask pump: enqueue future resolves.
        await tester.pump();
        // GoRouter requires a following zero-time render frame to commit
        // the route transition.
        await tester.pump();

        // Under reduced motion Processing appears immediately — no 240ms wait.
        expect(find.byType(ProcessingScreen), findsOneWidget);

        // Morph overlay must not appear.
        expect(find.byKey(_morphKey), findsNothing);

        // scheduleDrain was called (fire-and-forget, drain unresolved).
        expect(gateway.scheduleDrainCallCount, 1);
        expect(gateway.isDrainPending, isTrue);

        // No 240ms delay — verify by checking we haven't pumped that far.
        // Processing stays visible.
        await tester.pump();
        expect(find.byType(ProcessingScreen), findsOneWidget);
      },
    );

    testWidgets(
      'morph overlay does not wait for drain — drain remaining unresolved '
      'does not block the Processing route',
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
        // Reach cardEntrance boundary so Processing is visible.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 240));
        // GoRouter requires a following zero-time render frame to commit
        // the route transition.
        await tester.pump();

        expect(find.byType(ProcessingScreen), findsOneWidget);
        expect(gateway.isDrainPending, isTrue);

        // Drain remains unresolved for many more frames — Processing stays.
        for (var i = 0; i < 10; i++) {
          await tester.pump(const Duration(milliseconds: 100));
          expect(find.byType(ProcessingScreen), findsOneWidget);
        }

        // Complete drain after the fact — no crash, no navigation change.
        gateway.completeDrain();
        await tester.pump();
        expect(find.byType(ProcessingScreen), findsOneWidget);
      },
    );
  });
}
