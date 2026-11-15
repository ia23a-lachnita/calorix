import 'package:flutter/material.dart';
import 'manual_nutrient_catalog.dart';

class ManualFoodSelection {
  const ManualFoodSelection(this.recordId);
  final String? recordId;
}

/// Optional local lookup. A record selection never verifies the pictured food.
class FoodSelectionDialog extends StatefulWidget {
  const FoodSelectionDialog(
      {super.key,
      required this.name,
      required this.grams,
      this.recordId,
      this.manualTotals = false,
      this.extraOil = false});
  final String name, grams;
  final String? recordId;
  final bool manualTotals, extraOil;
  @override
  State<FoodSelectionDialog> createState() => _FoodSelectionDialogState();
}

class _FoodSelectionDialogState extends State<FoodSelectionDialog> {
  final _search = TextEditingController();
  late String? _selected = widget.recordId;
  bool _closed = false;
  void _finish(ManualFoodSelection? value) {
    if (_closed) return;
    _closed = true;
    Navigator.pop(context, value);
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final records = searchManualFoods(_search.text);
    final selected = _selected == null ? null : manualFood(_selected!);
    return AlertDialog(
        scrollable: true,
        title: const Text('Change food'),
        content: SizedBox(
            width: 420,
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                      'Now: ${widget.name}, ${widget.grams} g. The grams stay the same when you change the food.'),
                  if (widget.manualTotals)
                    const Text(
                        'Applying a different food replaces manual totals with a calculation from the listed foods.'),
                  if (widget.extraOil)
                    const Text(
                        'Your separate extra-oil component is retained. If oil is already included in your chosen food, check that component; use 0 g to exclude it.'),
                  const SizedBox(height: 16),
                  TextField(
                      controller: _search,
                      onChanged: (_) => setState(() {}),
                      decoration:
                          const InputDecoration(labelText: 'Search foods')),
                  SizedBox(
                      height: 260,
                      child: records.isEmpty
                          ? const Center(child: Text('No matching records'))
                          : ListView.builder(
                              itemCount: records.length,
                              itemBuilder: (_, index) {
                                final record = records[index];
                                return ListTile(
                                    dense: true,
                                    contentPadding: EdgeInsets.zero,
                                    selected: _selected == record.id,
                                    leading: Icon(_selected == record.id
                                        ? Icons.check_circle
                                        : Icons.circle_outlined),
                                    title: Text(record.description),
                                    subtitle: Text(
                                        '${record.preparation} · ${record.per100['kcal']!.round()} kcal / 100 g'),
                                    onTap: () =>
                                        setState(() => _selected = record.id));
                              })),
                  const SizedBox(height: 8),
                  Text(
                      'A short built-in list. If your food is missing, use Edit totals instead.',
                      style: Theme.of(context).textTheme.bodySmall),
                  TextButton.icon(
                      onPressed: () => _finish(const ManualFoodSelection(null)),
                      icon: const Icon(Icons.restore, size: 18),
                      label: const Text('Use predicted food')),
                  if (selected != null) ...[
                    Text('Selected: ${selected.description}'),
                    Text(
                        'Per 100 g: ${selected.per100['kcal']} kcal · protein ${selected.per100['proteinG']} g · carbs ${selected.per100['carbsG']} g · fat ${selected.per100['fatG']} g'),
                    Text('USDA SR Legacy · ${selected.id}'),
                    SelectableText(selected.sourceUrl),
                    const Text(
                        'Your choice from the food database. The portion is still an estimate.'),
                  ],
                ])),
        actions: [
          TextButton(
              onPressed: () => _finish(null), child: const Text('Cancel')),
          FilledButton(
              onPressed: selected == null
                  ? null
                  : () => _finish(ManualFoodSelection(selected.id)),
              child: const Text('Apply food')),
        ]);
  }
}
