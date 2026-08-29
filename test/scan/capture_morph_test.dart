import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/features/processing/processing_screen.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

import 'support/fake_camera_service.dart';
import 'support/fake_scan_upload_gateway.dart';
import 'support/pump_scan.dart';

/// Planned key for the captured photo shown on Scan while enqueue is
/// in flight; it targets the actual local-file Image, not a wrapper.
const ValueKey<String> _sourceKey = ValueKey('capture-photo-source');

/// Planned key for the same captured photo once Processing owns it,
/// morphed via a stable Hero tag into a rounded 220px-tall frame.
const ValueKey<String> _processingPhotoKey =
    ValueKey('processing-captured-photo');

const String _heroTag = 'capture-photo-hero';

void main() {
  group('Capture photo source/target morph', () {
    testWidgets(
      'capture shows the full-viewport source photo immediately while '
      'enqueue is pending, before Processing exists and before '
      'scheduleDrain runs',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway()..holdEnqueue = true;

        await pumpScan(
          tester,
          camera: camera,
          extraOverrides: [
            currentUidProvider.overrideWithValue('uid-test'),
            scanUploadGatewayProvider.overrideWithValue(gateway),
          ],
        );

        await tester.tap(find.byKey(const ValueKey('capture-button')));
        // Microtask pump: captureStill resolves; enqueue starts and
        // suspends on the held completer.
        await tester.pump();

        expect(find.byKey(_sourceKey), findsOneWidget);
        expect(
          gateway.events,
          isNot(contains(FakeGatewayEvent.enqueueComplete)),
        );

        final sourceImage = tester.widget<Image>(find.byKey(_sourceKey));
        final sourceProvider = sourceImage.image;
        expect(sourceProvider, isA<FileImage>());
        expect((sourceProvider as FileImage).file.path, 'fake_capture_1.jpg');
        expect(sourceImage.fit, BoxFit.cover);

        // The keyed Image itself fills the Scan viewport — not a fixed
        // 280 square hidden inside a full-size wrapper.
        final viewportSize = tester.getSize(find.byType(Scaffold));
        final sourceSize = tester.getSize(find.byKey(_sourceKey));
        expect(sourceSize, viewportSize);
        expect(sourceSize, isNot(const Size(280, 280)));

        expect(find.byType(ProcessingScreen), findsNothing);
        expect(gateway.scheduleDrainCallCount, 0);
      },
    );

    testWidgets(
      'after enqueue completes, Processing shows the same source photo in '
      'a Hero-wrapped, rounded 220-height frame and scheduleDrain runs '
      'exactly once without waiting on the held drain',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway()
          ..holdEnqueue = true
          ..holdDrain = true;

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

        gateway.completeEnqueue('fake-entry-completed');
        // Zero-time pump: flushes the enqueue-completion microtask so the
        // route push and Hero animation begin.
        await tester.pump();
        // Bounded pump, at most 1s — well past any entrance timing.
        await tester.pump(const Duration(milliseconds: 1000));
        // GoRouter requires a following zero-time render frame to commit
        // the route transition.
        await tester.pump();

        expect(find.byType(ProcessingScreen), findsOneWidget);
        expect(find.byKey(_sourceKey), findsNothing);
        expect(find.byKey(_processingPhotoKey), findsOneWidget);

        final photoImage =
            tester.widget<Image>(find.byKey(_processingPhotoKey));
        final photoProvider = photoImage.image;
        expect(photoProvider, isA<FileImage>());
        expect((photoProvider as FileImage).file.path, 'fake_capture_1.jpg');
        expect(photoImage.fit, BoxFit.cover);
        expect(tester.getSize(find.byKey(_processingPhotoKey)).height, 220);

        final clipFinder = find.ancestor(
          of: find.byKey(_processingPhotoKey),
          matching: find.byWidgetPredicate(
            (w) =>
                w is ClipRRect && w.borderRadius == BorderRadius.circular(16),
          ),
        );
        expect(clipFinder, findsOneWidget);

        final heroFinder = find.ancestor(
          of: find.byKey(_processingPhotoKey),
          matching:
              find.byWidgetPredicate((w) => w is Hero && w.tag == _heroTag),
        );
        expect(heroFinder, findsOneWidget);

        expect(gateway.scheduleDrainCallCount, 1);
        final enqueueCompleteIndex =
            gateway.events.indexOf(FakeGatewayEvent.enqueueComplete);
        final scheduleDrainIndex =
            gateway.events.indexOf(FakeGatewayEvent.scheduleDrainCalled);
        expect(enqueueCompleteIndex, greaterThanOrEqualTo(0));
        expect(scheduleDrainIndex, greaterThan(enqueueCompleteIndex));

        // Held drain stays pending — it never blocks the Processing route.
        expect(gateway.isDrainPending, isTrue);
      },
    );

    testWidgets(
      'reduced motion shows Processing with the captured photo after '
      'minimal zero-time pumps, without the 240ms decorative wait',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway()..holdDrain = true;

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
        // Microtask pump: enqueue resolves immediately (not held).
        await tester.pump();
        // GoRouter requires a following zero-time render frame to commit
        // the route transition.
        await tester.pump();

        expect(find.byType(ProcessingScreen), findsOneWidget);
        expect(find.byKey(_sourceKey), findsNothing);
        expect(find.byKey(_processingPhotoKey), findsOneWidget);

        final photoImage =
            tester.widget<Image>(find.byKey(_processingPhotoKey));
        final photoProvider = photoImage.image;
        expect(photoProvider, isA<FileImage>());
        expect((photoProvider as FileImage).file.path, 'fake_capture_1.jpg');

        expect(gateway.scheduleDrainCallCount, 1);
        expect(gateway.isDrainPending, isTrue);
      },
    );

    testWidgets(
      'enqueue failure returns to idle without a source photo, Processing, '
      'or a scheduled drain',
      (tester) async {
        final camera = FakeCameraService();
        final gateway = FakeScanUploadGateway()
          ..throwOnEnqueue = Exception('fake enqueue failure');

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
        await tester.pump();

        expect(find.byKey(_sourceKey), findsNothing);
        expect(find.byKey(const ValueKey('capture-core-idle')), findsOneWidget);
        expect(find.byType(ProcessingScreen), findsNothing);
        expect(gateway.scheduleDrainCallCount, 0);
      },
    );
  });
}
