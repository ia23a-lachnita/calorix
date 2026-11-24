import 'local_meal.dart';

/// A drink's label values per 100 mL and the volume actually consumed.
class PackagedDrink {
  PackagedDrink({required this.volumeMl, required this.per100Ml}) {
    if (!volumeMl.isFinite || volumeMl <= 0 || volumeMl > 1000000) {
      throw ArgumentError.value(volumeMl, 'volumeMl');
    }
    // Tier1Nutrients enforces finite, nonnegative totals within its bounds.
    total;
  }
  final double volumeMl;
  final Tier1Nutrients per100Ml;
  Tier1Nutrients get total => per100Ml.scaled(volumeMl / 100);
  Map<String, dynamic> toJson() => {
        'schemaVersion': 1,
        'volumeMl': volumeMl,
        'per100Ml': per100Ml.toJson(),
      };
  factory PackagedDrink.fromJson(Object? value) {
    try {
      if (value is! Map ||
          value['schemaVersion'] != 1 ||
          value['volumeMl'] is! num ||
          value['per100Ml'] is! Map) {
        throw const FormatException('Invalid packaged drink');
      }
      return PackagedDrink(
          volumeMl: (value['volumeMl'] as num).toDouble(),
          per100Ml: Tier1Nutrients.fromJson(
              Map<String, dynamic>.from(value['per100Ml'] as Map)));
    } catch (_) {
      throw const FormatException('Invalid packaged drink; data retained');
    }
  }
}
