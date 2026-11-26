import 'dart:async';

import 'local_meal_store.dart';

enum MealAnalysisOutcomeKind { saved, discarded, failed }

class MealAnalysisOutcome {
  const MealAnalysisOutcome(this.kind, {this.message});

  final MealAnalysisOutcomeKind kind;
  final String? message;
}

/// A process-local handle shared by editors for one store and meal.
class MealAnalysisOperation {
  final _completion = Completer<MealAnalysisOutcome>();
  MealAnalysisOutcome? outcome;
  int? retainedRevision;

  Future<MealAnalysisOutcome> get result => _completion.future;
  bool get isCompleted => _completion.isCompleted;

  void complete(MealAnalysisOutcome value, {int? retainAtRevision}) {
    if (_completion.isCompleted) return;
    outcome = value;
    retainedRevision = retainAtRevision;
    _completion.complete(value);
  }
}

class MealAnalysisClaim {
  const MealAnalysisClaim(this.operation, this.isOwner);

  final MealAnalysisOperation operation;
  final bool isOwner;
}

/// Coordinates one estimate per saved meal while the Flutter process is alive.
class MealAnalysisOperations {
  static final _byStore = Expando<Map<String, MealAnalysisOperation>>();

  static Map<String, MealAnalysisOperation> _forStore(Tier1MealStore store) {
    return _byStore[store] ??= <String, MealAnalysisOperation>{};
  }

  static MealAnalysisOperation? active(Tier1MealStore store, String mealId) {
    final operation = _byStore[store]?[mealId];
    if (operation == null || operation.isCompleted) return null;
    return operation;
  }

  static MealAnalysisOutcome? recentOutcome(
      Tier1MealStore store, String mealId, int revision) {
    final operations = _byStore[store];
    final operation = operations?[mealId];
    if (operation == null || !operation.isCompleted) return null;
    if (operation.retainedRevision == revision) return operation.outcome;
    operations!.remove(mealId);
    return null;
  }

  static MealAnalysisClaim claim(Tier1MealStore store, String mealId) {
    final operations = _forStore(store);
    final existing = operations[mealId];
    if (existing != null && !existing.isCompleted) {
      return MealAnalysisClaim(existing, false);
    }
    final operation = MealAnalysisOperation();
    operations[mealId] = operation;
    return MealAnalysisClaim(operation, true);
  }

  static void finish(Tier1MealStore store, String mealId,
      MealAnalysisOperation operation, MealAnalysisOutcome outcome,
      {int? retainAtRevision}) {
    operation.complete(outcome, retainAtRevision: retainAtRevision);
    final operations = _byStore[store];
    if (identical(operations?[mealId], operation)) {
      if (retainAtRevision == null) operations!.remove(mealId);
      while (operations!.values.where((entry) => entry.isCompleted).length > 16) {
        final old = operations.entries
            .where((entry) => entry.value.isCompleted)
            .first;
        operations.remove(old.key);
      }
    }
  }

  static void clear(Tier1MealStore store, String mealId) =>
      _byStore[store]?.remove(mealId);
}
