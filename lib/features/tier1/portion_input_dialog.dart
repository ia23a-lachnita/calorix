import 'package:flutter/material.dart';
import 'portion_input.dart';

(int, int)? parsePortionShare(String text) {
  final words = text.trim().split('/');
  if (words.isEmpty || words.length > 2) return null;
  final numerator = int.tryParse(words.first.trim());
  final denominator = words.length == 1 ? 1 : int.tryParse(words.last.trim());
  if (numerator == null ||
      denominator == null ||
      numerator < 0 ||
      denominator <= 0 ||
      numerator > denominator ||
      denominator > 100000) {
    return null;
  }
  return (numerator, denominator);
}

class PortionInputDialog extends StatefulWidget {
  const PortionInputDialog(
      {super.key,
      required this.originalGrams,
      required this.recordId,
      this.previous});
  final double originalGrams;
  final String? recordId;
  final PortionInput? previous;
  @override
  State<PortionInputDialog> createState() => _PortionInputDialogState();
}

class _PortionInputDialogState extends State<PortionInputDialog> {
  late String unit = widget.previous?.unit ??
      householdReferences[widget.recordId]?.unit ??
      'batch';
  late String amount = widget.previous?.amount.toString() ?? '1';
  late String share = widget.previous == null
      ? '1/1'
      : '${widget.previous!.numerator}/${widget.previous!.denominator}';
  late String referenceAmount =
      widget.previous?.referenceAmount.toString() ?? '';
  late String referenceGrams = widget.previous?.referenceGrams.toString() ?? '';
  late bool custom = widget.previous?.referenceSource == 'user';
  String? error;
  Widget field(String label, String value, void Function(String) write,
          {bool fraction = false}) =>
      TextFormField(
          key: ValueKey('$unit-$label'),
          initialValue: value,
          onChanged: write,
          keyboardType: fraction
              ? TextInputType.text
              : const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: label));

  @override
  Widget build(BuildContext context) {
    final reference = householdReferences[widget.recordId];
    final known = reference != null && reference.unit == unit;
    final useKnown = known && !custom;
    final unitLabel = unit == 'ml' ? 'ml' : 'pieces';
    return AlertDialog(
        scrollable: true,
        title: const Text('Food quantity'),
        content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<String>(
                  initialValue: unit,
                  decoration: const InputDecoration(labelText: 'Measure'),
                  items: const [
                    DropdownMenuItem(
                        value: 'batch',
                        child: Text('Share of photographed food')),
                    DropdownMenuItem(value: 'pieces', child: Text('Pieces')),
                    DropdownMenuItem(value: 'ml', child: Text('Millilitres'))
                  ],
                  onChanged: (v) {
                    if (v != null && v != unit) {
                      setState(() {
                        unit = v;
                        custom = false;
                        amount = '1';
                        referenceAmount = '';
                        referenceGrams = '';
                        error = null;
                      });
                    }
                  }),
              if (unit == 'batch')
                Text(
                    'The full photographed amount was estimated at ${widget.originalGrams} g.')
              else ...[
                field('Total $unitLabel', amount, (v) => amount = v),
                if (known) ...[
                  Text(reference.description),
                  CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Use my own reference'),
                      value: custom,
                      onChanged: (v) => setState(() => custom = v ?? false))
                ],
                if (!useKnown) ...[
                  const Text('Use the label or a known weight for this food.'),
                  field('Reference amount ($unitLabel)', referenceAmount,
                      (v) => referenceAmount = v),
                  field('Weight of that reference (g)', referenceGrams,
                      (v) => referenceGrams = v)
                ],
              ],
              field('Share to log (e.g. 1/3)', share, (v) => share = v,
                  fraction: true),
              if (error != null)
                Text(error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
            ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () {
                final part = parsePortionShare(share);
                if (part == null) {
                  setState(() =>
                      error = 'Enter a share between 0 and 1, such as 1/3.');
                  return;
                }
                try {
                  final input = PortionInput(
                      unit: unit,
                      amount: unit == 'batch' ? 1 : double.parse(amount),
                      numerator: part.$1,
                      denominator: part.$2,
                      referenceAmount: unit == 'batch'
                          ? 1
                          : useKnown
                              ? reference.amount
                              : double.parse(referenceAmount),
                      referenceGrams: unit == 'batch'
                          ? widget.originalGrams
                          : useKnown
                              ? reference.grams
                              : double.parse(referenceGrams),
                      referenceSource: unit == 'batch'
                          ? 'photo'
                          : useKnown
                              ? widget.recordId!
                              : 'user');
                  Navigator.pop(context, input);
                } on Object {
                  setState(() => error =
                      'Check the quantity and a positive reference weight.');
                }
              },
              child: const Text('Use quantity')),
        ]);
  }
}
