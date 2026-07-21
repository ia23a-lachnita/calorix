import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/food_entry.dart';
import '../../../shared/providers/auth_provider.dart';

class ManualFoodDraft {
  const ManualFoodDraft({
    required this.name,
    required this.kcal,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.servingSize,
    required this.quantity,
    required this.mealType,
  });

  final String name;
  final double kcal;
  final double proteinG;
  final double carbsG;
  final double fatG;
  final String servingSize;
  final double quantity;
  final MealType mealType;

  Map<String, String> validate() {
    final errors = <String, String>{};
    if (name.trim().isEmpty) errors['name'] = 'Name is required';
    if (kcal < 0) errors['kcal'] = 'Must be zero or greater';
    if (proteinG < 0) errors['protein'] = 'Must be zero or greater';
    if (carbsG < 0) errors['carbs'] = 'Must be zero or greater';
    if (fatG < 0) errors['fat'] = 'Must be zero or greater';
    if (servingSize.trim().isEmpty) {
      errors['servingSize'] = 'Serving is required';
    }
    if (quantity <= 0) errors['quantity'] = 'Must be greater than zero';
    return errors;
  }
}

abstract class ManualEntrySaver {
  Future<String> save(ManualFoodDraft draft);
}

class _RepositoryManualEntrySaver implements ManualEntrySaver {
  const _RepositoryManualEntrySaver(this._ref);
  final Ref _ref;

  @override
  Future<String> save(ManualFoodDraft draft) {
    final errors = draft.validate();
    if (errors.isNotEmpty) throw ArgumentError(errors.values.first);
    final uid = _ref.read(currentUidProvider);
    if (uid == null) throw StateError('Authentication required.');
    return _ref.read(foodEntryRepositoryProvider).createManualEntry(
          uid: uid,
          name: draft.name.trim(),
          kcal: draft.kcal,
          protein: draft.proteinG,
          carbs: draft.carbsG,
          fat: draft.fatG,
          servingSize: draft.servingSize,
          quantity: draft.quantity,
          mealType: draft.mealType,
        );
  }
}

final manualEntrySaverProvider = Provider<ManualEntrySaver>(
  (ref) => _RepositoryManualEntrySaver(ref),
);
