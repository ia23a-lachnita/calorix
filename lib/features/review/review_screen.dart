import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/router/route_names.dart';
import '../../core/theme/app_colors.dart';
import '../../shared/models/food_entry.dart';
import 'providers/review_providers.dart';

class ReviewScreen extends ConsumerStatefulWidget {
  const ReviewScreen({
    super.key,
    required this.entryId,
    this.fixtureImageAsset,
  });
  final String entryId;
  final String? fixtureImageAsset;

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends ConsumerState<ReviewScreen> {
  int _selected = 0;
  AmountSource? _selectedAmountSource;
  CustomAmountState _customAmountState =
      const CustomAmountState(selected: false);
  late final TextEditingController _customAmountController;
  String? _entrySignature;
  bool _saving = false;
  String? _confirmationError;

  @override
  void initState() {
    super.initState();
    _customAmountController = TextEditingController();
  }

  @override
  void dispose() {
    _customAmountController.dispose();
    super.dispose();
  }

  String _signature(FoodEntry entry) {
    final candidates = entry.candidates
        .map((candidate) =>
            '${candidate.name}|${candidate.confidence}|${candidate.kcal}|'
            '${candidate.proteinG}|${candidate.carbsG}|${candidate.fatG}')
        .join(';;');
    final serving = entry.servingReference;
    return [
      entry.id,
      entry.nutritionBasis,
      entry.nutritionAmount,
      entry.nutritionUnit,
      entry.packageUnitCount,
      entry.unitAmount,
      serving?.amount,
      serving?.unit,
      candidates,
      ...(entry.reviewReasons ?? const <String>[]),
    ].join('|');
  }

  void _syncEntry(FoodEntry entry) {
    final signature = _signature(entry);
    if (_entrySignature == signature) return;
    final firstEntry = _entrySignature == null;
    _entrySignature = signature;
    _selected = 0;
    _selectedAmountSource = firstEntry ? _defaultSource(entry) : null;
    _customAmountState = const CustomAmountState(selected: false);
    _customAmountController.clear();
    _confirmationError = null;
    if (mounted) setState(() {});
  }

  AmountSource? _defaultSource(FoodEntry entry) {
    final reasons = entry.reviewReasons ?? const <String>[];
    final package = deriveAmountSuggestions(entry).where(
      (choice) => choice.source == AmountSource.packageLabel,
    );
    final allowed = reasons.isEmpty ||
        (reasons.length == 1 && reasons.single == 'barcode_unconfirmed');
    return allowed && package.isNotEmpty ? AmountSource.packageLabel : null;
  }

  Future<void> _confirm(ReviewConfirmation confirmation) async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _confirmationError = null;
    });
    try {
      await ref
          .read(reviewEntryGatewayProvider)
          .confirm(widget.entryId, confirmation);
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _confirmationError = 'Could not confirm. Please try again.';
        });
      }
      return;
    }
    if (!mounted) return;
    context.goNamed(
      RouteNames.foodDetail,
      pathParameters: {'id': widget.entryId},
    );
  }

  void _selectAmount(AmountSource source) {
    setState(() {
      _selectedAmountSource = source;
      _customAmountState = const CustomAmountState(selected: false);
      _customAmountController.clear();
    });
  }

  void _selectCustom() {
    setState(() {
      _selectedAmountSource = null;
      _customAmountState = CustomAmountState(
        selected: true,
        amount: _customAmountState.amount,
      );
    });
  }

  void _setCustomAmount(String text) {
    final parsed = double.tryParse(text.trim());
    double? validAmount;
    if (parsed != null) {
      try {
        validateCustomAmount(parsed);
        validAmount = parsed;
      } on ArgumentError {
        validAmount = null;
      }
    }
    setState(() {
      _customAmountState = CustomAmountState(
        selected: true,
        amount: validAmount,
      );
    });
  }

  AmountSuggestion? _selectedSuggestion(
    List<AmountSuggestion> suggestions,
    FoodEntry entry,
  ) {
    final source = _selectedAmountSource ??
        (_entrySignature == null ? _defaultSource(entry) : null);
    for (final suggestion in suggestions) {
      if (suggestion.source == source) return suggestion;
    }
    return null;
  }

  double? _effectiveAmount(
    List<AmountSuggestion> suggestions,
    FoodEntry entry,
  ) {
    if (_customAmountState.selected) return _customAmountState.amount;
    return _selectedSuggestion(suggestions, entry)?.amount;
  }

  String? _scaledText(double? value, double? ratio, String suffix) {
    if (value == null || ratio == null) return null;
    final scaled = value * ratio;
    if (!scaled.isFinite) return null;
    return '${scaled.round()} $suffix';
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<FoodEntry?>>(
      reviewEntryProvider(widget.entryId),
      (_, next) {
        final entry = next.valueOrNull;
        if (entry != null) _syncEntry(entry);
      },
    );
    final entry = ref.watch(reviewEntryProvider(widget.entryId));
    return Scaffold(
      body: entry.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const Center(child: Text('Could not load review')),
        data: (value) {
          if (value == null) {
            return const Center(child: Text('Food entry no longer exists'));
          }
          final suggestions = deriveAmountSuggestions(value);
          final selectedSuggestion = _selectedSuggestion(suggestions, value);
          final selectedAmount = _effectiveAmount(suggestions, value);
          final confidence = ((value.confidence ?? 0) * 100).round();
          final candidates = value.candidates;
          final selectedIndex = candidates.isEmpty
              ? 0
              : _selected.clamp(0, candidates.length - 1).toInt();
          final canConfirm = selectedAmount != null &&
              selectedAmount.isFinite &&
              selectedAmount > 0 &&
              !_saving;
          final selectedCandidate = candidates.isEmpty
              ? null
              : candidates[selectedIndex];
          final nutritionAmount = value.nutritionAmount;
          final ratio = selectedAmount != null &&
                  nutritionAmount != null &&
                  nutritionAmount.isFinite &&
                  nutritionAmount > 0
              ? selectedAmount / nutritionAmount
              : null;
          final previewKcal = _scaledText(
            selectedCandidate?.kcal ?? value.baseKcal,
            ratio,
            'kcal',
          );
          final previewProtein = _scaledText(
            selectedCandidate?.proteinG ?? value.baseProtein,
            ratio,
            'g protein',
          );
          final previewCarbs = _scaledText(
            selectedCandidate?.carbsG ?? value.baseCarbs,
            ratio,
            'g carbs',
          );
          final previewFat = _scaledText(
            selectedCandidate?.fatG ?? value.baseFat,
            ratio,
            'g fat',
          );
          return Stack(
            children: [
              Positioned.fill(
                child: widget.fixtureImageAsset != null
                    ? Image.asset(
                        widget.fixtureImageAsset!,
                        key: const ValueKey('capture-review-meal'),
                        fit: BoxFit.cover,
                      )
                    : value.imageUrl == null
                        ? const ColoredBox(color: AppColors.backgroundDark)
                        : Image.network(value.imageUrl!, fit: BoxFit.cover),
              ),
              Positioned(
                top: 48,
                left: 18,
                child: IconButton.filledTonal(
                  tooltip: 'Close',
                  onPressed: () => context.goNamed(RouteNames.today),
                  icon: const Icon(Icons.close),
                ),
              ),
              Positioned(
                top: 48,
                right: 18,
                child: TextButton.icon(
                  onPressed: () => context.goNamed(RouteNames.scan),
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: const Text('Retake'),
                ),
              ),
              Align(
                alignment: Alignment.bottomCenter,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(18, 16, 18, 32),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(28)),
                  ),
                  child: SafeArea(
                    top: false,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        maxHeight: MediaQuery.sizeOf(context).height * 0.72,
                      ),
                      child: SingleChildScrollView(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Center(
                              child: Container(
                                width: 40,
                                height: 4,
                                decoration: BoxDecoration(
                                  color: Theme.of(context).dividerColor,
                                  borderRadius: BorderRadius.circular(99),
                                ),
                              ),
                            ),
                            const SizedBox(height: 14),
                            Chip(
                              avatar: const CircleAvatar(
                                radius: 3,
                                backgroundColor: AppColors.needsReview,
                              ),
                              label: Text('$confidence% CONFIDENCE'),
                            ),
                            const SizedBox(height: 10),
                            Text('Which one is it?',
                                style:
                                    Theme.of(context).textTheme.headlineSmall),
                            const SizedBox(height: 4),
                            const Text(
                              'Pick the closest match. You can fine-tune it after.',
                            ),
                            const SizedBox(height: 14),
                            if (candidates.isEmpty)
                              const Text('No confident matches were found.')
                            else
                              RadioGroup<int>(
                                groupValue: selectedIndex,
                                onChanged: (next) {
                                  if (next != null) {
                                    setState(() => _selected = next);
                                  }
                                },
                                child: Column(
                                  children: [
                                    for (var index = 0;
                                        index < candidates.length;
                                        index++)
                                      Padding(
                                        padding:
                                            const EdgeInsets.only(bottom: 8),
                                        child: RadioListTile<int>(
                                          value: index,
                                          title: Text(candidates[index].name),
                                          secondary: Text(
                                              '${candidates[index].kcal} kcal'),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            if (suggestions.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              const Text('AMOUNT'),
                              const SizedBox(height: 4),
                              for (final suggestion in suggestions)
                                _AmountControl(
                                  key: ValueKey(
                                      'review-amount-${_sourceKey(suggestion.source)}'),
                                  label: suggestion.label,
                                  sourceLabel: _sourceLabel(suggestion.source),
                                  selected: selectedSuggestion?.source ==
                                      suggestion.source,
                                  onTap: () =>
                                      _selectAmount(suggestion.source),
                                ),
                            ],
                            _AmountControl(
                              key: const ValueKey('review-amount-custom'),
                              label: 'Custom amount',
                              sourceLabel: 'custom',
                              selected: _customAmountState.selected,
                              onTap: _selectCustom,
                            ),
                            if (_customAmountState.selected) ...[
                              const SizedBox(height: 4),
                              TextField(
                                key: const ValueKey(
                                    'review-custom-amount-input'),
                                controller: _customAmountController,
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                  decimal: true,
                                ),
                                onChanged: _setCustomAmount,
                                decoration: const InputDecoration(
                                  labelText: 'Amount',
                                  suffixText: 'canonical unit',
                                ),
                              ),
                            ],
                            if (previewKcal != null ||
                                previewProtein != null ||
                                previewCarbs != null ||
                                previewFat != null) ...[
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 12,
                                runSpacing: 4,
                                children: [
                                  if (previewKcal != null) Text(previewKcal),
                                  if (previewProtein != null)
                                    Text(previewProtein),
                                  if (previewCarbs != null) Text(previewCarbs),
                                  if (previewFat != null) Text(previewFat),
                                ],
                              ),
                            ],
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: () =>
                                        context.pushNamed(RouteNames.manual),
                                    child: const Text('None of these'),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  flex: 2,
                                  child: FilledButton(
                                    key: const ValueKey<String>(
                                      'review-confirm-button',
                                    ),
                                    onPressed: !canConfirm
                                        ? null
                                        : () => _confirm(
                                              ReviewConfirmation(
                                                consumedAmount:
                                                    selectedAmount!,
                                                selectedCandidate:
                                                    selectedCandidate,
                                              ),
                                            ),
                                    child: Text(previewKcal == null
                                        ? 'Confirm'
                                        : 'Confirm · $previewKcal'),
                                  ),
                                ),
                              ],
                            ),
                            if (_confirmationError != null) ...[
                              const SizedBox(height: 8),
                              Text(
                                _confirmationError!,
                                key: const ValueKey<String>(
                                  'review-confirm-error',
                                ),
                                style: TextStyle(
                                  color: Theme.of(context).colorScheme.error,
                                ),
                              ),
                            ],
                            Center(
                              child: TextButton(
                                onPressed: () => context.pushNamed(
                                  RouteNames.aiChatOverlay,
                                  queryParameters: {'mealId': widget.entryId},
                                ),
                                child:
                                    const Text('Ask Placeholder AI instead →'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

String _sourceKey(AmountSource source) => switch (source) {
      AmountSource.packageLabel => 'package',
      AmountSource.servingMetadata => 'serving',
      AmountSource.packMetadata => 'pack',
    };

String _sourceLabel(AmountSource source) => switch (source) {
      AmountSource.packageLabel => 'package label',
      AmountSource.servingMetadata => 'serving metadata',
      AmountSource.packMetadata => 'pack metadata',
    };

class _AmountControl extends StatelessWidget {
  const _AmountControl({
    super.key,
    required this.label,
    required this.sourceLabel,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String sourceLabel;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        container: true,
        button: true,
        selected: selected,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 52, minWidth: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  Icon(
                    selected
                        ? Icons.radio_button_checked
                        : Icons.radio_button_off,
                    size: 22,
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(label)),
                  Text(
                    sourceLabel,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}
