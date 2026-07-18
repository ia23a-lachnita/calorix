import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/scan/permission_screen.dart';

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

  testWidgets('regrant transitions to scan_idle', (tester) async {
    final fake = FakeCameraService()..granted = false;
    await pumpScan(tester, camera: fake);

    expect(find.byType(PermissionScreen), findsOneWidget);

    fake.granted = true;
    await tester.tap(find.byKey(const ValueKey('permission-regrant-button')));
    await tester.pumpAndSettle();

    expect(find.byType(PermissionScreen), findsNothing);
    expect(find.byKey(const ValueKey('capture-button')), findsOneWidget);
  });

  testWidgets(
    'add manually invokes the manual-entry navigation intent',
    (tester) async {
      var manualRequested = false;

      await tester.pumpWidget(
        MaterialApp(
          home: PermissionScreen(
            onRegrant: () async {},
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
}
