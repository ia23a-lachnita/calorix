import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';

const double firestorePositiveAmountMax = 1000000000;

double clampServing(double raw) =>
    (raw * 4).roundToDouble().clamp(1, 20).toDouble() / 4;

double baseFromDisplayed(double displayed, double multiplier) {
  if (!displayed.isFinite || !multiplier.isFinite || multiplier <= 0) {
    throw ArgumentError('Displayed nutrition and multiplier must be finite.');
  }
  return displayed / multiplier;
}

bool isValidConsumedAmount(double value) =>
    value.isFinite && value > 0 && value <= firestorePositiveAmountMax;

double? tryParseConsumedAmount(String text) {
  final value = double.tryParse(text.trim());
  if (value == null || !isValidConsumedAmount(value)) return null;
  return value;
}

/// Returns [consumedAmount] if it passes [isValidConsumedAmount], otherwise
/// null. Used wherever a consumed value feeds ratio calculations, the
/// canonical amount control, or the amount-editor initial value — so that
/// malformed persisted NaN / infinities / out-of-range values degrade to
/// "Set amount" + an empty editor rather than throwing.
double? effectiveConsumedAmount(double? consumedAmount) =>
    consumedAmount != null && isValidConsumedAmount(consumedAmount)
        ? consumedAmount
        : null;

FoodEntry scaledBy(FoodEntry base, double multiplier) =>
    base.copyWith(servingMultiplier: clampServing(multiplier));

/// Fail-closed canonical amount labels. Invalid or partial tuples never fall
/// back to a serving multiplier or an invented consumed amount.
class AmountPresentation {
  const AmountPresentation({
    required this.label,
    required this.consumedLabel,
  });

  static const unavailable = AmountPresentation(
    label: 'Amount unavailable',
    consumedLabel: 'Amount unavailable',
  );

  final String label;
  final String consumedLabel;

  static String formatAmount(double value) {
    if (!value.isFinite) return 'Amount unavailable';
    if (value == value.roundToDouble()) return '${value.round()}';
    return '$value';
  }

  factory AmountPresentation.fromEntry(
    FoodEntry entry, {
    double? consumedAmount,
  }) {
    if (!entry.hasCanonicalNutrition) return unavailable;

    final nutritionAmount = entry.nutritionAmount!;
    final unit = entry.nutritionUnit!;
    final basis = entry.nutritionBasis!;
    final consumed = consumedAmount ?? entry.consumedAmount;
    final resolved = consumed != null &&
        isValidConsumedAmount(consumed) &&
        nutritionAmount.isFinite &&
        nutritionAmount > 0 &&
        (consumed / nutritionAmount).isFinite;

    final formattedNutrition = formatAmount(nutritionAmount);
    final label = switch (basis) {
      'portion' => 'full visible portion',
      'per100g' =>
        '$formattedNutrition $unit reference${resolved ? '' : ' · amount required'}',
      'package' => _packageLabel(entry, formattedNutrition, unit),
      _ => unavailable.label,
    };
    if (label == unavailable.label) return unavailable;

    return AmountPresentation(
      label: label,
      consumedLabel:
          resolved ? '${formatAmount(consumed)} $unit' : 'Amount required',
    );
  }

  static String _packageLabel(
    FoodEntry entry,
    String formattedNutrition,
    String unit,
  ) {
    final count = entry.packageUnitCount;
    final unitAmount = entry.unitAmount;
    final nutritionAmount = entry.nutritionAmount;
    if (count != null &&
        unitAmount != null &&
        nutritionAmount != null &&
        count > 0 &&
        unitAmount.isFinite &&
        unitAmount > 0 &&
        ((count * unitAmount) - nutritionAmount).abs() <= 0.01) {
      return '$count × ${formatAmount(unitAmount)} $unit · whole pack';
    }
    return switch (unit) {
      'ml' => '$formattedNutrition ml bottle',
      'g' => '$formattedNutrition g pack',
      _ => unavailable.label,
    };
  }
}

/// Resolves a Cloud Storage path (the field real scans carry) to a fetchable
/// URL, so the detail hero shows the user's actual photo.
final storageImageUrlProvider =
    FutureProvider.autoDispose.family<String, String>((ref, path) {
  return FirebaseStorage.instance.ref(path).getDownloadURL();
});

final foodEntryProvider =
    StreamProvider.autoDispose.family<FoodEntry?, String>((ref, id) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const Stream.empty();
  return ref.watch(foodEntryRepositoryProvider).watchEntry(uid, id);
});

final foodEditModeProvider =
    StateProvider.autoDispose.family<bool, String>((ref, id) => false);

class PendingEdits {
  final String? foodName;
  final double? kcal;
  final double? protein;
  final double? carbs;
  final double? fat;
  final double? servingMultiplier;
  final double? consumedAmount;
  final MealType? mealType;
  final List<DetectedItem>? detectedItems;

  PendingEdits({
    this.foodName,
    this.kcal,
    this.protein,
    this.carbs,
    this.fat,
    this.servingMultiplier,
    this.consumedAmount,
    this.mealType,
    this.detectedItems,
  }) {
    final amount = consumedAmount;
    if (amount != null && !isValidConsumedAmount(amount)) {
      throw ArgumentError.value(
        amount,
        'consumedAmount',
        'must be finite and positive',
      );
    }
  }

  bool get isEmpty =>
      foodName == null &&
      kcal == null &&
      protein == null &&
      carbs == null &&
      fat == null &&
      servingMultiplier == null &&
      consumedAmount == null &&
      mealType == null &&
      detectedItems == null;

  PendingEdits copyWith({
    String? foodName,
    double? kcal,
    double? protein,
    double? carbs,
    double? fat,
    double? servingMultiplier,
    double? consumedAmount,
    MealType? mealType,
    List<DetectedItem>? detectedItems,
  }) =>
      PendingEdits(
        foodName: foodName ?? this.foodName,
        kcal: kcal ?? this.kcal,
        protein: protein ?? this.protein,
        carbs: carbs ?? this.carbs,
        fat: fat ?? this.fat,
        servingMultiplier: servingMultiplier ?? this.servingMultiplier,
        consumedAmount: consumedAmount ?? this.consumedAmount,
        mealType: mealType ?? this.mealType,
        detectedItems: detectedItems ?? this.detectedItems,
      );

  Map<String, dynamic> toUpdateMap(FoodEntry entry) => {
        if (foodName != null) 'foodName': foodName,
        if (kcal != null) 'baseKcal': kcal,
        if (protein != null) 'baseProtein': protein,
        if (carbs != null) 'baseCarbs': carbs,
        if (fat != null) 'baseFat': fat,
        if (entry.hasCanonicalNutrition) ...{
          if (consumedAmount != null) 'consumedAmount': consumedAmount,
        } else if (entry.usesLegacyServingMultiplier) ...{
          if (servingMultiplier != null) 'servingMultiplier': servingMultiplier,
        },
        if (mealType != null) 'mealType': mealType!.name,
        if (detectedItems != null)
          'detectedItems': detectedItems!.map((e) => e.toMap()).toList(),
      };
}

final pendingEditsProvider = StateProvider.autoDispose
    .family<PendingEdits, String>((ref, id) => PendingEdits());
