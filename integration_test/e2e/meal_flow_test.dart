import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('meal capture reaches completed processing and Today',
      (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester);

    await tester.tap(find.byKey(const ValueKey('capture-button')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(harness.camera.captureCount, 1);
    expect(harness.uploadGateway.callCount, 1);
    expect(
        harness.foodStore.entry('fake-entry-1')?.foodName, 'Chicken Rice Bowl');
    expect(
      find.byKey(const ValueKey('processing-complete-card')),
      findsOneWidget,
    );

    await harness.go(tester, '/today');
    await tester.pump();
    expect(find.text('Chicken Rice Bowl'), findsWidgets);
  });
}
