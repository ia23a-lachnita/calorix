import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';

export '../../../shared/models/food_entry.dart'
    show ReviewCandidate, ReviewConfirmation;

enum AmountSource { packageLabel, servingMetadata, packMetadata }

@immutable
class AmountSuggestion {
  const AmountSuggestion({
    required this.amount,
    required this.unit,
    required this.label,
    required this.source,
  }) : kind = 'derived';

  final String kind;
  final double amount;
  final String unit;
  final String label;
  final AmountSource source;
}

@immutable
class CustomAmountState {
  const CustomAmountState({required this.selected, this.amount});

  final bool selected;
  final double? amount;
}

void validateCustomAmount(Object? value) {
  if (value is! num) {
    throw ArgumentError.value(value, 'amount', 'must be finite and positive');
  }
  final amount = value.toDouble();
  if (!_validAmount(amount)) {
    throw ArgumentError.value(value, 'amount', 'must be finite and positive');
  }
}

String formatReviewAmount(double amount) {
  if (amount.isFinite && amount == amount.roundToDouble()) {
    return amount.round().toString();
  }
  final text = amount.toString();
  return text.endsWith('.0') ? text.substring(0, text.length - 2) : text;
}

String? validatedCanonicalUnit(String? unit) {
  if (unit == null) return null;
  final normalized = _normalizedUnit(unit);
  return normalized == 'g' || normalized == 'ml' ? normalized : null;
}

String _normalizedUnit(String value) => value.trim().toLowerCase();

bool _validAmount(double? value) =>
    value != null && value.isFinite && value > 0 && value <= 1e9;

bool _validServingMacro(double value) =>
    value.isFinite && value >= 0 && value <= 1e9;

bool _completeServingReference(
  NutritionReference serving,
  String canonicalUnit,
) {
  final servingUnit = _normalizedUnit(serving.unit);
  return servingUnit == canonicalUnit &&
      _validAmount(serving.amount) &&
      serving.kcal.isFinite &&
      serving.kcal >= 0 &&
      serving.kcal <= 10000 &&
      _validServingMacro(serving.proteinG) &&
      _validServingMacro(serving.carbsG) &&
      _validServingMacro(serving.fatG);
}

List<AmountSuggestion> deriveAmountSuggestions(FoodEntry entry) {
  final basis = entry.nutritionBasis?.trim().toLowerCase();
  final canonicalAmount = entry.nutritionAmount;
  final canonicalUnit = validatedCanonicalUnit(entry.nutritionUnit);
  final suggestions = <AmountSuggestion>[];

  final reasons = entry.reviewReasons ?? const <String>[];
  final packageBlocked = reasons.contains('package_quantity_missing') ||
      reasons.contains('package_unit_unsupported');
  if (basis == 'package' &&
      !packageBlocked &&
      canonicalUnit != null &&
      _validAmount(canonicalAmount)) {
    suggestions.add(AmountSuggestion(
      amount: canonicalAmount!,
      unit: canonicalUnit,
      label:
          'Whole package · ${formatReviewAmount(canonicalAmount)} $canonicalUnit',
      source: AmountSource.packageLabel,
    ));
  }

  final serving = entry.servingReference;
  if (serving != null &&
      canonicalUnit != null &&
      _completeServingReference(serving, canonicalUnit)) {
    suggestions.add(AmountSuggestion(
      amount: serving.amount,
      unit: canonicalUnit,
      label:
          '1 serving · ${formatReviewAmount(serving.amount)} $canonicalUnit',
      source: AmountSource.servingMetadata,
    ));
  }

  final count = entry.packageUnitCount;
  final unitAmount = entry.unitAmount;
  final product = count == null || unitAmount == null
      ? null
      : count.toDouble() * unitAmount;
  if (basis == 'package' &&
      canonicalUnit != null &&
      _validAmount(canonicalAmount) &&
      count != null &&
      count > 0 &&
      count <= 1000000000 &&
      _validAmount(unitAmount) &&
      product != null &&
      product.isFinite &&
      product <= 1e9 &&
      (product - canonicalAmount!).abs() <= 0.01) {
    suggestions.add(AmountSuggestion(
      amount: unitAmount!,
      unit: canonicalUnit,
      label: count == 1
          ? '1 unit · ${formatReviewAmount(unitAmount)} $canonicalUnit'
          : '1 of $count · ${formatReviewAmount(unitAmount)} $canonicalUnit',
      source: AmountSource.packMetadata,
    ));
  }

  final deduplicated = <AmountSuggestion>[];
  for (final suggestion in suggestions) {
    final duplicate = deduplicated.any((existing) =>
        existing.unit == suggestion.unit &&
        (existing.amount - suggestion.amount).abs() <= 1e-4);
    if (!duplicate) deduplicated.add(suggestion);
  }
  return List<AmountSuggestion>.unmodifiable(deduplicated);
}

final reviewEntryProvider =
    StreamProvider.autoDispose.family<FoodEntry?, String>((ref, entryId) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(foodEntryRepositoryProvider).watchEntry(uid, entryId);
});

abstract class ReviewEntryGateway {
  Future<void> confirm(String entryId, ReviewConfirmation confirmation);
}

class _RepositoryReviewEntryGateway implements ReviewEntryGateway {
  const _RepositoryReviewEntryGateway(this._ref);
  final Ref _ref;

  @override
  Future<void> confirm(
    String entryId,
    ReviewConfirmation confirmation,
  ) async {
    final uid = _ref.read(currentUidProvider);
    if (uid == null) throw StateError('Authentication required.');
    await _ref.read(foodEntryRepositoryProvider).confirmReview(
          uid,
          entryId,
          confirmation,
        );
  }
}

final reviewEntryGatewayProvider = Provider<ReviewEntryGateway>(
  (ref) => _RepositoryReviewEntryGateway(ref),
);
