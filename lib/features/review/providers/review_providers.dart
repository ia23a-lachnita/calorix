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
  if (!amount.isFinite || amount <= 0 || amount > 1e9) {
    throw ArgumentError.value(value, 'amount', 'must be finite and positive');
  }
}

String _normalizedUnit(String value) => value.trim().toLowerCase();

bool _validAmount(double? value) =>
    value != null && value.isFinite && value > 0 && value <= 1e9;

String _displayAmount(double amount) {
  final text = amount.toString();
  return text.endsWith('.0') ? text.substring(0, text.length - 2) : text;
}

List<AmountSuggestion> deriveAmountSuggestions(FoodEntry entry) {
  final basis = entry.nutritionBasis?.trim().toLowerCase();
  final canonicalAmount = entry.nutritionAmount;
  final canonicalUnit = entry.nutritionUnit == null
      ? null
      : _normalizedUnit(entry.nutritionUnit!);
  final compatibleUnit = canonicalUnit == 'g' || canonicalUnit == 'ml';
  final suggestions = <AmountSuggestion>[];

  final reasons = entry.reviewReasons ?? const <String>[];
  final packageBlocked = reasons.contains('package_quantity_missing') ||
      reasons.contains('package_unit_unsupported');
  if (basis == 'package' &&
      !packageBlocked &&
      compatibleUnit &&
      _validAmount(canonicalAmount)) {
    suggestions.add(AmountSuggestion(
      amount: canonicalAmount!,
      unit: canonicalUnit!,
      label: 'Whole package · ${_displayAmount(canonicalAmount)} $canonicalUnit',
      source: AmountSource.packageLabel,
    ));
  }

  final serving = entry.servingReference;
  final servingUnit = serving == null ? null : _normalizedUnit(serving.unit);
  if (serving != null &&
      compatibleUnit &&
      servingUnit == canonicalUnit &&
      _validAmount(serving.amount)) {
    suggestions.add(AmountSuggestion(
      amount: serving.amount,
      unit: servingUnit!,
      label: '1 serving · ${_displayAmount(serving.amount)} $servingUnit',
      source: AmountSource.servingMetadata,
    ));
  }

  final count = entry.packageUnitCount;
  final unitAmount = entry.unitAmount;
  final product = count == null || unitAmount == null
      ? null
      : count.toDouble() * unitAmount;
  if (basis == 'package' &&
      compatibleUnit &&
      count != null &&
      count > 0 &&
      count <= 1000000000 &&
      _validAmount(unitAmount) &&
      product != null &&
      product.isFinite &&
      product <= 1e9 &&
      canonicalAmount != null &&
      (product - canonicalAmount).abs() <= 0.01) {
    final amountLabel = count == 1
        ? '1 $canonicalUnit'
        : '1 of $count · ${_displayAmount(unitAmount!)} $canonicalUnit';
    suggestions.add(AmountSuggestion(
      amount: unitAmount!,
      unit: canonicalUnit!,
      label: amountLabel,
      source: AmountSource.packMetadata,
    ));
  }

  final deduplicated = <AmountSuggestion>[];
  for (final suggestion in suggestions) {
    final duplicate = deduplicated.any((existing) =>
        existing.unit == suggestion.unit &&
        (existing.amount - suggestion.amount).abs() < 1e-4);
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
