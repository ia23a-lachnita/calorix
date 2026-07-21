import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/policy/draft_policy.dart';
import '../../core/router/route_names.dart';
import '../../shared/models/food_entry.dart';
import 'providers/manual_providers.dart';

class ManualEntryScreen extends ConsumerStatefulWidget {
  const ManualEntryScreen({super.key});

  @override
  ConsumerState<ManualEntryScreen> createState() => _ManualEntryScreenState();
}

class _ManualEntryScreenState extends ConsumerState<ManualEntryScreen> {
  static const _foods = [
    ('Chicken Rice Bowl', 620.0, 'Recent · 1 bowl · 420 g'),
    ('Protein Yogurt', 180.0, 'Recent · 1 cup · 200 g'),
    ('Oatmeal w/ Berries', 320.0, 'Favorite · 1 serving'),
    ('Espresso · Oat Milk', 45.0, 'Favorite · double shot'),
    ('Greek Salad', 260.0, 'Custom food'),
  ];

  final _search = TextEditingController();
  final _name = TextEditingController();
  final _kcal = TextEditingController();
  final _protein = TextEditingController();
  final _carbs = TextEditingController();
  final _fat = TextEditingController();
  bool _custom = false;
  bool _saving = false;
  bool _allowPop = false;
  Map<String, String> _errors = const {};

  bool get _dirty =>
      _search.text.isNotEmpty ||
      _custom &&
          [_name, _kcal, _protein, _carbs, _fat]
              .any((controller) => controller.text.isNotEmpty);

  @override
  void dispose() {
    for (final controller in [_search, _name, _kcal, _protein, _carbs, _fat]) {
      controller.dispose();
    }
    super.dispose();
  }

  double _number(TextEditingController controller) =>
      double.tryParse(controller.text.trim()) ?? 0;

  ManualFoodDraft _draft({String? suggestedName, double? suggestedKcal}) =>
      ManualFoodDraft(
        name: suggestedName ?? _name.text,
        kcal: suggestedKcal ?? _number(_kcal),
        proteinG: _number(_protein),
        carbsG: _number(_carbs),
        fatG: _number(_fat),
        servingSize: '1 serving',
        quantity: 1,
        mealType: MealType.lunch,
      );

  Future<void> _save(ManualFoodDraft draft) async {
    final errors = draft.validate();
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;
    setState(() => _saving = true);
    try {
      await ref.read(manualEntrySaverProvider).save(draft);
      if (mounted) context.goNamed(RouteNames.today);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<bool> _confirmExit() async {
    if (!_dirty ||
        draftPolicyFor(DraftType.manualEntry) !=
            DraftPolicy.confirmDestructiveExit) {
      return true;
    }
    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Discard this entry?'),
            content: const Text('Your unsaved changes will be lost.'),
            actions: [
              TextButton(
                  onPressed: () => context.pop(false),
                  child: const Text('Keep editing')),
              FilledButton(
                  onPressed: () => context.pop(true),
                  child: const Text('Discard')),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _requestExit() async {
    if (!await _confirmExit() || !mounted) return;
    setState(() => _allowPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.pop();
    });
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _allowPop || !_dirty,
      onPopInvokedWithResult: (didPop, result) async {
        if (!didPop) await _requestExit();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('CAMERA-FREE LOGGING', style: TextStyle(fontSize: 10)),
              Text('Add food'),
            ],
          ),
          actions: [
            IconButton(
              tooltip: 'Close',
              onPressed: _requestExit,
              icon: const Icon(Icons.close),
            ),
          ],
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              TextField(
                key: const ValueKey('manual-search'),
                controller: _search,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  hintText: 'Search foods, brands, meals…',
                  prefixIcon: Icon(Icons.search),
                  suffixIcon: Icon(Icons.mic_none),
                ),
              ),
              const SizedBox(height: 12),
              const Wrap(
                spacing: 8,
                children: [
                  ChoiceChip(label: Text('Recent'), selected: true),
                  ChoiceChip(label: Text('Favorites'), selected: false),
                  ChoiceChip(label: Text('My foods'), selected: false),
                  ChoiceChip(label: Text('Meals'), selected: false),
                ],
              ),
              const SizedBox(height: 12),
              if (!_custom) ...[
                for (final food in _foods)
                  Card(
                    child: ListTile(
                      title: Text(food.$1),
                      subtitle: Text(food.$3),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('${food.$2.round()}'),
                          IconButton(
                            tooltip: 'Add ${food.$1}',
                            onPressed: _saving
                                ? null
                                : () => _save(_draft(
                                      suggestedName: food.$1,
                                      suggestedKcal: food.$2,
                                    )),
                            icon: const Icon(Icons.add),
                          ),
                        ],
                      ),
                    ),
                  ),
                OutlinedButton.icon(
                  key: const ValueKey('manual-create-custom'),
                  onPressed: () => setState(() => _custom = true),
                  icon: const Icon(Icons.add),
                  label: const Text('Create custom food'),
                ),
              ] else ...[
                _field('Food name', _name, 'name', key: 'manual-name'),
                _field('Calories', _kcal, 'kcal', key: 'manual-kcal'),
                _field('Protein (g)', _protein, 'protein',
                    key: 'manual-protein'),
                _field('Carbs (g)', _carbs, 'carbs', key: 'manual-carbs'),
                _field('Fat (g)', _fat, 'fat', key: 'manual-fat'),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: _saving ? null : () => _save(_draft()),
                  child: const Text('Save food'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(
    String label,
    TextEditingController controller,
    String errorKey, {
    required String key,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          key: ValueKey(key),
          controller: controller,
          keyboardType: errorKey == 'name'
              ? TextInputType.text
              : const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: label,
            errorText: _errors[errorKey],
          ),
        ),
      );
}
