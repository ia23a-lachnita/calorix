import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('barcode capture preserves the selected scan mode',
      (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester);

    await tester.tap(find.text('Barcode'));
    await tester.pump(const Duration(milliseconds: 250));
    await tester.tap(find.byKey(const ValueKey('capture-button')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    final entry = harness.foodStore.entry('fake-entry-1');
    expect(entry?.scanMode, 'barcode');
    expect(entry?.foodName, 'Known Barcode Product');
    expect(
      find.byKey(const ValueKey('processing-complete-card')),
      findsOneWidget,
    );
  });
}
