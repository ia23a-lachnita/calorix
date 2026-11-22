import 'package:calorix/features/tier1/portion_input.dart';
import 'package:calorix/features/tier1/portion_input_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final sample in [
    (
      id: 'usda:173424',
      label: 'Total pieces',
      amount: '4',
      share: '1/3',
      grams: 200 / 3
    ),
    (
      id: 'usda:171265',
      label: 'Total ml',
      amount: '150',
      share: '1',
      grams: 150 * 30.5 / 29.5735295625
    ),
  ]) {
    testWidgets(
        'confirms ${sample.amount} in ${sample.label} using the matching food record',
        (tester) async {
      PortionInput? result;
      await tester.pumpWidget(MaterialApp(
          home: Builder(
              builder: (context) => Scaffold(
                  body: TextButton(
                      onPressed: () async {
                        result = await showDialog<PortionInput>(
                            context: context,
                            builder: (_) => PortionInputDialog(
                                originalGrams: 100, recordId: sample.id));
                      },
                      child: const Text('Edit amount'))))));
      await tester.tap(find.text('Edit amount'));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.widgetWithText(TextFormField, sample.label), sample.amount);
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Share to log (e.g. 1/3)'),
          sample.share);
      await tester.tap(find.text('Use quantity'));
      await tester.pumpAndSettle();
      expect(result?.referenceSource, sample.id);
      expect(result?.grams, closeTo(sample.grams, 1e-8));
    });
  }
}
