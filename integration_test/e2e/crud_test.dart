import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('create read update duplicate and delete round trip',
      (tester) async {
    final harness = await E2EHarness.create();
    harness.seed(makeFixtureEntry(
      id: 'crud-entry',
      foodName: 'Original meal',
    ));
    await harness.pump(tester, initialLocation: '/today/food/crud-entry');

    expect(find.text('Original meal'), findsOneWidget);

    await tester.tap(find.text('Edit'));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('macro-editor-Protein')));
    await tester.tap(find.byKey(const Key('macro-editor-Protein')));
    await tester.pump();
    await tester.enterText(find.byType(TextFormField).last, '55');
    await SystemChannels.textInput.invokeMethod<void>(
      'TextInput.hide',
    );
    await tester.pump(const Duration(milliseconds: 100));

    final doneFinder = find.widgetWithText(FilledButton, 'Done');
    expect(doneFinder, findsOneWidget);
    await tester.ensureVisible(doneFinder);
    await tester.pump();
    expect(doneFinder.hitTestable(), findsOneWidget);
    await tester.tap(doneFinder.hitTestable());
    await tester.pump(const Duration(milliseconds: 300));

    final saveFinder = find.widgetWithText(ElevatedButton, 'Save to Today');
    expect(saveFinder, findsOneWidget);
    await tester.ensureVisible(saveFinder);
    await tester.pump();
    expect(saveFinder.hitTestable(), findsOneWidget);
    await tester.tap(saveFinder.hitTestable());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(harness.foodStore.entry('crud-entry')?.baseProtein, 55);

    await harness.go(tester, '/today/food/crud-entry');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.byIcon(Icons.copy_outlined));
    await tester.pump();
    expect(harness.foodStore.allEntries, hasLength(2));

    await harness.go(tester, '/today/food/crud-entry');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pump();
    expect(find.text('Delete entry?'), findsOneWidget);
    await tester.tap(find.text('Delete'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(harness.foodStore.entry('crud-entry'), isNull);
    expect(harness.foodStore.allEntries, hasLength(1));
  });
}
