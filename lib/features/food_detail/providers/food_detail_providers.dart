import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';

double clampServing(double raw) =>
    (raw * 4).roundToDouble().clamp(1, 20).toDouble() / 4;

double baseFromDisplayed(double displayed, double multiplier) {
  if (!displayed.isFinite || !multiplier.isFinite || multiplier <= 0) {
    throw ArgumentError('Displayed nutrition and multiplier must be finite.');
  }
  return displayed / multiplier;
}

FoodEntry scaledBy(FoodEntry base, double multiplier) =>
    base.copyWith(servingMultiplier: clampServing(multiplier));

/// Resolves a Cloud Storage path (the field real scans carry) to a fetchable
/// URL, so the detail hero shows the user's actual photo.
final storageImageUrlProvider =
    FutureProvider.autoDispose.family<String, String>((ref, path) {
  return FirebaseStorage.instance.ref(path).getDownloadURL();
});

final foodEntryProvider =
    StreamProvider.autoDispose.family<FoodEntry, String>((ref, id) {
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
        if (kcal != null) 'baseKcal': kcal,
        if (protein != null) 'baseProtein': protein,
        if (carbs != null) 'baseCarbs': carbs,
        if (fat != null) 'baseFat': fat,
        if (servingMultiplier != null) 'servingMultiplier': servingMultiplier,
        if (mealType != null) 'mealType': mealType!.name,
        if (detectedItems != null)
          'detectedItems': detectedItems!.map((e) => e.toMap()).toList(),
      };
}

final pendingEditsProvider = StateProvider.autoDispose
    .family<PendingEdits, String>((ref, id) => const PendingEdits());
