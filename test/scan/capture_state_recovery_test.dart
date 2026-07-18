import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

import 'support/fake_camera_service.dart';
import 'support/pump_scan.dart';

void main() {
  testWidgets(
    'capture with no signed-in uid returns to idle instead of staying '
    'stuck in the capturing state forever',
    (tester) async {
      final fake = FakeCameraService();
      await pumpScan(
        tester,
        camera: fake,
        extraOverrides: [currentUidProvider.overrideWithValue(null)],
      );

      await tester.tap(find.byKey(const ValueKey('capture-button')));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.byKey(const Key('capture-core-idle')), findsOneWidget);
      expect(find.byKey(const ValueKey('capture-spinner')), findsNothing);
    },
  );
}
