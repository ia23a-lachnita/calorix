import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';

final foodEntryProvider =
    StreamProvider.autoDispose.family<FoodEntry, String>((ref, id) {
  return ref.watch(foodEntryRepositoryProvider).watchEntry(id);
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
  final MealType? mealType;
  final List<DetectedItem>? detectedItems;

  const PendingEdits({
    this.foodName,
    this.kcal,
    this.protein,
    this.carbs,
    this.fat,
    this.servingMultiplier,
    this.mealType,
    this.detectedItems,
  });

  PendingEdits copyWith({
    String? foodName,
    double? kcal,
    double? protein,
    double? carbs,
    double? fat,
    double? servingMultiplier,
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
        mealType: mealType ?? this.mealType,
        detectedItems: detectedItems ?? this.detectedItems,
      );

  Map<String, dynamic> toUpdateMap() => {
        if (foodName != null) 'foodName': foodName,
        if (kcal != null) 'kcal': kcal,
        if (protein != null) 'protein': protein,
        if (carbs != null) 'carbs': carbs,
        if (fat != null) 'fat': fat,
        if (servingMultiplier != null) 'servingMultiplier': servingMultiplier,
        if (mealType != null) 'mealType': mealType!.name,
        if (detectedItems != null)
          'detectedItems': detectedItems!.map((e) => e.toMap()).toList(),
      };
}

final pendingEditsProvider =
    StateProvider.autoDispose.family<PendingEdits, String>((ref, id) => const PendingEdits());
