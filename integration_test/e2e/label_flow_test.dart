import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('low-confidence label capture lands on review', (tester) async {
    final harness = await E2EHarness.create();
    await harness.pump(tester);

    await tester.tap(find.text('Label'));
    await tester.pump(const Duration(milliseconds: 250));
    await tester.tap(find.byKey(const ValueKey('capture-button')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump();

    expect(harness.foodStore.entry('fake-entry-1')?.needsReview, isTrue);
    expect(find.text('Which one is it?'), findsOneWidget);
    expect(find.text('Whole Grain Cereal'), findsOneWidget);
  });
}
