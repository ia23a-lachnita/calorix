import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_camera_service.dart';
import 'support/pump_scan.dart';

void main() {
  testWidgets('rapid triple tap performs exactly one capture', (tester) async {
    final fake = FakeCameraService();
    await pumpScan(tester, camera: fake);

    final button = find.byKey(const ValueKey('capture-button'));
    await tester.tap(button);
    await tester.tap(button);
    await tester.tap(button);
    await tester.pump(const Duration(milliseconds: 50));

    expect(fake.captureCount, 1);
  });

  testWidgets(
    'capturing state shows conic spinner, shimmer, and ANALYZING hint — '
    'and no stop/cancel control',
    (tester) async {
      final fake = FakeCameraService()..holdCapture = true;
      await pumpScan(tester, camera: fake);

      await tester.tap(find.byKey(const ValueKey('capture-button')));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.byKey(const ValueKey('capture-spinner')), findsOneWidget);
      expect(find.byKey(const ValueKey('capture-shimmer')), findsOneWidget);
      expect(find.text('ANALYZING…'), findsOneWidget);
      expect(find.byKey(const ValueKey('stop-button')), findsNothing);

      fake.completeCapture();
      await tester.pump(const Duration(milliseconds: 50));
    },
  );
}
