import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:calorix/features/food_detail/food_detail_sheet.dart';

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
    final proteinEditor = find.byKey(const Key('macro-editor-Protein'));
    expect(proteinEditor, findsOneWidget);
    await Scrollable.ensureVisible(
      tester.element(proteinEditor),
      alignment: 0.5,
    );
    await tester.pump();
    expect(proteinEditor.hitTestable(), findsOneWidget);
    await tester.tap(proteinEditor.hitTestable());
    await pumpUntilVisible(
      tester,
      find.text('Edit Protein (g)'),
      description: 'Protein editor sheet',
    );
    expect(find.byType(TextFormField), findsWidgets);
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
    final saveFinder = find.widgetWithText(ElevatedButton, 'Save to Today');
    await pumpUntilVisible(
      tester,
      saveFinder.hitTestable(),
      description: 'hit-testable Save to Today control',
    );
    await tester.tap(saveFinder.hitTestable());
    await pumpUntil(
      tester,
      () => harness.foodStore.entry('crud-entry')?.baseProtein == 55,
      description: 'persisted Protein correction',
    );

    expect(harness.foodStore.entry('crud-entry')?.baseProtein, 55);
    await pumpUntil(
      tester,
      () => !tester.any(find.byType(FoodDetailSheet)),
      description: 'save route pop completion',
    );

    await harness.go(tester, '/today/food/crud-entry');
    final copyFinder = find.byIcon(Icons.copy_outlined).hitTestable();
    await pumpUntilVisible(
      tester,
      copyFinder,
      description: 'hit-testable duplicate entry control',
    );
    await tester.tap(copyFinder);
    await pumpUntil(
      tester,
      () => harness.foodStore.allEntries.length == 2,
      description: 'persisted duplicate entry',
    );
    expect(harness.foodStore.allEntries, hasLength(2));
    await pumpUntil(
      tester,
      () => !tester.any(find.byType(FoodDetailSheet)),
      description: 'duplicate route pop completion',
    );

    await harness.go(tester, '/today/food/crud-entry');
    final deleteFinder = find.byIcon(Icons.delete_outline).hitTestable();
    await pumpUntilVisible(
      tester,
      deleteFinder,
      description: 'hit-testable delete entry control',
    );
    await tester.tap(deleteFinder);
    await tester.pump();
    expect(find.text('Delete entry?'), findsOneWidget);
    await tester.tap(find.text('Delete'));
    await pumpUntil(
      tester,
      () => harness.foodStore.entry('crud-entry') == null,
      description: 'entry deletion',
    );

    expect(harness.foodStore.entry('crud-entry'), isNull);
    expect(harness.foodStore.allEntries, hasLength(1));
  });
}
