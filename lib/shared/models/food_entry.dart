import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:timezone/timezone.dart' as tz;

import '../utils/date_key.dart';

enum FoodEntryStatus { pending, processing, complete, needsReview, error }

extension FoodEntryStatusWire on FoodEntryStatus {
  /// Firestore wire value (snake_case where the enum is camelCase).
  String get wireName =>
      this == FoodEntryStatus.needsReview ? 'needs_review' : name;

  static FoodEntryStatus fromWire(String? value) {
    if (value == 'needs_review') return FoodEntryStatus.needsReview;
    return FoodEntryStatus.values.firstWhere(
      (s) => s.name == (value ?? 'pending'),
      orElse: () => FoodEntryStatus.pending,
    );
  }
}

enum MealType { breakfast, lunch, dinner, snack, drink }

const _nutritionUnits = {'portion', 'g', 'ml'};
const _reviewReasonOrder = [
  'package_quantity_missing',
  'package_unit_unsupported',
  'barcode_unconfirmed',
  'nutrition_basis_ambiguous',
  'nutrition_arithmetic_mismatch',
  'atwater_mismatch',
  'model_schema_invalid',
];

double? _asDouble(Object? value) => value is num ? value.toDouble() : null;

bool _isFiniteNonnegative(double value) => value.isFinite && value >= 0;

bool _isFinitePositive(double value) => value.isFinite && value > 0;

bool _isFiniteInRange(double value, double minimum, double maximum) =>
    value.isFinite && value >= minimum && value <= maximum;

int? _asIntegral(Object? value) {
  final parsed = _asDouble(value);
  if (parsed == null ||
      !parsed.isFinite ||
      parsed != parsed.truncateToDouble()) {
    return null;
  }
  return parsed.toInt();
}

List<String>? _sanitizeReviewReasons(Object? value) {
  if (value is! List || !value.every((reason) => reason is String)) {
    return null;
  }
  final supplied = value.cast<String>().toSet();
  return List<String>.unmodifiable(
    _reviewReasonOrder.where(supplied.contains),
  );
}

class DetectedItem {
  final String name;
  final double weight;

  const DetectedItem({required this.name, required this.weight});

  factory DetectedItem.fromMap(Map<String, dynamic> map) => DetectedItem(
        name: map['name'] as String,
        weight: (map['weight'] as num).toDouble(),
      );

  Map<String, dynamic> toMap() => {'name': name, 'weight': weight};

  DetectedItem copyWith({String? name, double? weight}) =>
      DetectedItem(name: name ?? this.name, weight: weight ?? this.weight);
}

class BoundingBox {
  final double x, y, width, height;
  const BoundingBox({
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });
  factory BoundingBox.fromMap(Map<String, dynamic> m) => BoundingBox(
        x: (m['x'] as num).toDouble(),
        y: (m['y'] as num).toDouble(),
        width: (m['width'] as num).toDouble(),
        height: (m['height'] as num).toDouble(),
      );
}

class NutritionReference {
  const NutritionReference({
    required this.kcal,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.amount,
    required this.unit,
  });

  final double kcal;
  final double proteinG;
  final double carbsG;
  final double fatG;
  final double amount;
  final String unit;

  static NutritionReference? tryParse(Object? value) {
    if (value is! Map || value.length != 6) return null;
    const requiredKeys = {
      'kcal',
      'proteinG',
      'carbsG',
      'fatG',
      'amount',
      'unit',
    };
    if (!requiredKeys.every(value.containsKey)) return null;

    final kcal = _asDouble(value['kcal']);
    final proteinG = _asDouble(value['proteinG']);
    final carbsG = _asDouble(value['carbsG']);
    final fatG = _asDouble(value['fatG']);
    final amount = _asDouble(value['amount']);
    final unit = value['unit'];
    if (kcal == null ||
        proteinG == null ||
        carbsG == null ||
        fatG == null ||
        amount == null ||
        unit is! String ||
        !_isFiniteInRange(kcal, 0, 10000) ||
        !_isFiniteInRange(proteinG, 0, 1e9) ||
        !_isFiniteInRange(carbsG, 0, 1e9) ||
        !_isFiniteInRange(fatG, 0, 1e9) ||
        !_isFiniteInRange(amount, double.minPositive, 1e9) ||
        !_nutritionUnits.contains(unit)) {
      return null;
    }
    return NutritionReference(
      kcal: kcal,
      proteinG: proteinG,
      carbsG: carbsG,
      fatG: fatG,
      amount: amount,
      unit: unit,
    );
  }

  Map<String, dynamic> toMap() => {
        'kcal': kcal,
        'proteinG': proteinG,
        'carbsG': carbsG,
        'fatG': fatG,
        'amount': amount,
        'unit': unit,
      };
}

class ReviewCandidate {
  const ReviewCandidate({
    required this.name,
    required this.confidence,
    required this.kcal,
    this.proteinG,
    this.carbsG,
    this.fatG,
  });

  final String name;
  final double confidence;
  final double kcal;
  final double? proteinG;
  final double? carbsG;
  final double? fatG;

  factory ReviewCandidate.fromMap(Map<String, dynamic> map) => ReviewCandidate(
        name: map['name'] as String,
        confidence: (map['confidence'] as num).toDouble(),
        kcal: (map['kcal'] as num).toDouble(),
        proteinG: map.containsKey('proteinG')
            ? _asDouble(map['proteinG'])
            : _asDouble(map['protein']),
        carbsG: map.containsKey('carbsG')
            ? _asDouble(map['carbsG'])
            : _asDouble(map['carbs']),
        fatG: map.containsKey('fatG')
            ? _asDouble(map['fatG'])
            : _asDouble(map['fat']),
      );

  Map<String, dynamic> toMap() => {
        'name': name,
        'confidence': confidence,
        'kcal': kcal,
        if (proteinG != null) 'proteinG': proteinG,
        if (carbsG != null) 'carbsG': carbsG,
        if (fatG != null) 'fatG': fatG,
      };
}

class ReviewConfirmation {
  ReviewConfirmation({
    required this.consumedAmount,
    this.selectedCandidate,
  }) {
    if (!consumedAmount.isFinite || consumedAmount <= 0) {
      throw ArgumentError.value(
        consumedAmount,
        'consumedAmount',
        'must be finite and positive',
      );
    }
  }

  final double consumedAmount;
  final ReviewCandidate? selectedCandidate;
}

class FoodEntry {
  final String id;
  final String uid;
  final DateTime timestamp;

  /// Device-local calendar day (`YYYY-MM-DD`) that owns this entry.
  final String date;
  final String? imageUrl;
  final String? storagePath;
  final String scanMode;
  final FoodEntryStatus status;
  final String? foodName;
  final double? baseKcal;
  final double? baseProtein;
  final double? baseCarbs;
  final double? baseFat;
  final double servingMultiplier;
  final MealType mealType;
  final List<DetectedItem> detectedItems;
  final double? confidence;
  final double? atwaterKcal;
  final bool corrected;
  final DateTime? correctedAt;
  final BoundingBox? boundingBox;
  final List<ReviewCandidate> candidates;
  final String? nutritionBasis;
  final double? nutritionAmount;
  final String? nutritionUnit;
  final double? consumedAmount;
  final int? packageUnitCount;
  final double? unitAmount;
  final NutritionReference? per100Reference;
  final NutritionReference? servingReference;
  final List<String>? reviewReasons;
  final String? rawBarcode;
  final String? modelBarcode;
  final String? confirmedBarcode;
  final bool _hasCanonicalTrigger;
  final bool _legacyServingMultiplierValid;

  factory FoodEntry({
    required String id,
    required String uid,
    required DateTime timestamp,
    required String date,
    String? imageUrl,
    String? storagePath,
    required String scanMode,
    required FoodEntryStatus status,
    String? foodName,
    double? baseKcal,
    double? baseProtein,
    double? baseCarbs,
    double? baseFat,
    double? kcal,
    double? protein,
    double? carbs,
    double? fat,
    double servingMultiplier = 1.0,
    MealType mealType = MealType.lunch,
    List<DetectedItem> detectedItems = const [],
    double? confidence,
    double? atwaterKcal,
    bool corrected = false,
    DateTime? correctedAt,
    BoundingBox? boundingBox,
    List<ReviewCandidate> candidates = const [],
    String? nutritionBasis,
    double? nutritionAmount,
    String? nutritionUnit,
    double? consumedAmount,
    int? packageUnitCount,
    double? unitAmount,
    NutritionReference? per100Reference,
    NutritionReference? servingReference,
    List<String>? reviewReasons,
    String? rawBarcode,
    String? modelBarcode,
    String? confirmedBarcode,
  }) {
    final hasCanonicalTrigger = nutritionBasis != null ||
        nutritionAmount != null ||
        nutritionUnit != null ||
        consumedAmount != null ||
        packageUnitCount != null ||
        unitAmount != null ||
        per100Reference != null ||
        servingReference != null ||
        reviewReasons != null;
    return FoodEntry._internal(
      hasCanonicalTrigger,
      true,
      id: id,
      uid: uid,
      timestamp: timestamp,
      date: date,
      imageUrl: imageUrl,
      storagePath: storagePath,
      scanMode: scanMode,
      status: status,
      foodName: foodName,
      baseKcal: baseKcal ?? kcal,
      baseProtein: baseProtein ?? protein,
      baseCarbs: baseCarbs ?? carbs,
      baseFat: baseFat ?? fat,
      servingMultiplier: servingMultiplier,
      mealType: mealType,
      detectedItems: detectedItems,
      confidence: confidence,
      atwaterKcal: atwaterKcal,
      corrected: corrected,
      correctedAt: correctedAt,
      boundingBox: boundingBox,
      candidates: candidates,
      nutritionBasis: nutritionBasis,
      nutritionAmount: nutritionAmount,
      nutritionUnit: nutritionUnit,
      consumedAmount: consumedAmount,
      packageUnitCount: packageUnitCount,
      unitAmount: unitAmount,
      per100Reference: per100Reference,
      servingReference: servingReference,
      reviewReasons: reviewReasons,
      rawBarcode: rawBarcode,
      modelBarcode: modelBarcode,
      confirmedBarcode: confirmedBarcode,
    );
  }

  const FoodEntry._internal(
    this._hasCanonicalTrigger,
    this._legacyServingMultiplierValid, {
    required this.id,
    required this.uid,
    required this.timestamp,
    required this.date,
    this.imageUrl,
    this.storagePath,
    required this.scanMode,
    required this.status,
    this.foodName,
    this.baseKcal,
    this.baseProtein,
    this.baseCarbs,
    this.baseFat,
    required this.servingMultiplier,
    required this.mealType,
    required this.detectedItems,
    this.confidence,
    this.atwaterKcal,
    required this.corrected,
    this.correctedAt,
    this.boundingBox,
    required this.candidates,
    this.nutritionBasis,
    this.nutritionAmount,
    this.nutritionUnit,
    this.consumedAmount,
    this.packageUnitCount,
    this.unitAmount,
    this.per100Reference,
    this.servingReference,
    this.reviewReasons,
    this.rawBarcode,
    this.modelBarcode,
    this.confirmedBarcode,
  });

  /// Temporary source-compatible aliases. Persistence uses only `base*`.
  double? get kcal => baseKcal;
  double? get protein => baseProtein;
  double? get carbs => baseCarbs;
  double? get fat => baseFat;

  bool get usesLegacyServingMultiplier => !_hasCanonicalTrigger;

  bool get hasCanonicalNutrition {
    final basis = nutritionBasis;
    final amount = nutritionAmount;
    final unit = nutritionUnit;
    if (basis == null ||
        amount == null ||
        unit == null ||
        !_isFinitePositive(amount)) {
      return false;
    }
    return switch (basis) {
      'package' => unit == 'g' || unit == 'ml',
      'portion' => amount == 1 && unit == 'portion',
      'per100g' => amount == 100 && (unit == 'g' || unit == 'ml'),
      _ => false,
    };
  }

  double? get _canonicalRatio {
    final consumed = consumedAmount;
    final amount = nutritionAmount;
    if (consumed == null ||
        amount == null ||
        !_isFinitePositive(consumed) ||
        !_isFinitePositive(amount)) {
      return null;
    }
    final ratio = consumed / amount;
    return ratio.isFinite && ratio >= 0 ? ratio : null;
  }

  bool get hasResolvedConsumption => usesLegacyServingMultiplier
      ? _legacyServingMultiplierValid && _isFiniteNonnegative(servingMultiplier)
      : hasCanonicalNutrition && _canonicalRatio != null;

  double _scaled(double? base) {
    if (!hasResolvedConsumption ||
        base == null ||
        !_isFiniteNonnegative(base)) {
      return 0;
    }
    final factor =
        usesLegacyServingMultiplier ? servingMultiplier : _canonicalRatio!;
    final scaled = base * factor;
    return _isFiniteNonnegative(scaled) ? scaled : 0;
  }

  double get scaledKcal => _scaled(baseKcal);
  double get scaledProtein => _scaled(baseProtein);
  double get scaledCarbs => _scaled(baseCarbs);
  double get scaledFat => _scaled(baseFat);

  bool get isConfirmed => (confidence ?? 0) >= 0.80;

  /// Server-gated low-confidence scans awaiting user confirmation. They are
  /// listed with the amber review badge but excluded from daily totals.
  bool get needsReview => status == FoodEntryStatus.needsReview;

  factory FoodEntry.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return FoodEntry.fromData(id: doc.id, data: data);
  }

  factory FoodEntry.fromData({
    required String id,
    required Map<String, dynamic> data,
  }) {
    final rawTimestamp = data['timestamp'];
    final timestamp = switch (rawTimestamp) {
      Timestamp value => value.toDate(),
      DateTime value => value,
      _ => throw const FormatException('FoodEntry timestamp is required.'),
    };
    double? nutritionValue(String canonical, String legacy) =>
        _asDouble(data[canonical] ?? data[legacy]);
    const canonicalTriggerKeys = {
      'nutritionBasis',
      'nutritionAmount',
      'nutritionUnit',
      'consumedAmount',
      'packageUnitCount',
      'unitAmount',
      'per100Reference',
      'servingReference',
      'reviewReasons',
    };
    final nutritionBasis = data['nutritionBasis'] is String
        ? data['nutritionBasis'] as String
        : null;
    final nutritionAmount = _asDouble(data['nutritionAmount']);
    final nutritionUnit = data['nutritionUnit'] is String
        ? data['nutritionUnit'] as String
        : null;
    final parsedPer100Reference =
        NutritionReference.tryParse(data['per100Reference']);
    final per100Reference = parsedPer100Reference != null &&
            parsedPer100Reference.amount == 100 &&
            (parsedPer100Reference.unit == 'g' ||
                parsedPer100Reference.unit == 'ml') &&
            (nutritionBasis == 'portion' ||
                parsedPer100Reference.unit == nutritionUnit)
        ? parsedPer100Reference
        : null;
    final parsedServingReference =
        NutritionReference.tryParse(data['servingReference']);
    final servingReference = parsedServingReference != null &&
            (nutritionBasis == 'portion' ||
                parsedServingReference.unit == nutritionUnit)
        ? parsedServingReference
        : null;
    final hasPackageUnitCount = data.containsKey('packageUnitCount');
    final hasUnitAmount = data.containsKey('unitAmount');
    final parsedPackageUnitCount = _asIntegral(data['packageUnitCount']);
    final parsedUnitAmount = _asDouble(data['unitAmount']);
    final multipackValid = hasPackageUnitCount &&
        hasUnitAmount &&
        nutritionBasis == 'package' &&
        nutritionAmount != null &&
        nutritionAmount.isFinite &&
        parsedPackageUnitCount != null &&
        parsedPackageUnitCount > 0 &&
        parsedPackageUnitCount <= 1000000000 &&
        parsedUnitAmount != null &&
        _isFiniteInRange(parsedUnitAmount, double.minPositive, 1e9) &&
        (parsedPackageUnitCount * parsedUnitAmount).isFinite &&
        ((parsedPackageUnitCount * parsedUnitAmount) - nutritionAmount).abs() <=
            0.01;
    final hasServingMultiplier = data.containsKey('servingMultiplier');
    final parsedServingMultiplier = _asDouble(data['servingMultiplier']);
    final legacyServingMultiplierValid =
        !hasServingMultiplier || data['servingMultiplier'] is num;

    return FoodEntry._internal(
      canonicalTriggerKeys.any(data.containsKey),
      legacyServingMultiplierValid,
      id: id,
      uid: data['uid'] as String,
      timestamp: timestamp,
      date: data['date'] as String? ?? _fallbackDateKey(timestamp),
      imageUrl: data['imageUrl'] as String?,
      storagePath: data['storagePath'] as String?,
      scanMode: data['scanMode'] as String? ?? 'meal',
      status: FoodEntryStatusWire.fromWire(data['status'] as String?),
      foodName: data['foodName'] as String?,
      baseKcal: nutritionValue('baseKcal', 'kcal'),
      baseProtein: nutritionValue('baseProtein', 'protein'),
      baseCarbs: nutritionValue('baseCarbs', 'carbs'),
      baseFat: nutritionValue('baseFat', 'fat'),
      servingMultiplier: parsedServingMultiplier ?? 1.0,
      mealType: MealType.values.firstWhere(
        (m) => m.name == (data['mealType'] as String? ?? 'lunch'),
        orElse: () => MealType.lunch,
      ),
      detectedItems: ((data['detectedItems'] as List<dynamic>?) ?? [])
          .map((e) => DetectedItem.fromMap(e as Map<String, dynamic>))
          .toList(),
      confidence: _asDouble(data['confidence']),
      atwaterKcal: _asDouble(data['atwaterKcal']),
      corrected: data['corrected'] as bool? ?? false,
      correctedAt: (data['correctedAt'] as Timestamp?)?.toDate(),
      boundingBox: data['boundingBox'] != null
          ? BoundingBox.fromMap(data['boundingBox'] as Map<String, dynamic>)
          : null,
      candidates: ((data['candidates'] as List<dynamic>?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ReviewCandidate.fromMap)
          .toList(),
      nutritionBasis: nutritionBasis,
      nutritionAmount: nutritionAmount,
      nutritionUnit: nutritionUnit,
      consumedAmount: _asDouble(data['consumedAmount']),
      packageUnitCount: multipackValid ? parsedPackageUnitCount : null,
      unitAmount: multipackValid ? parsedUnitAmount : null,
      per100Reference: per100Reference,
      servingReference: servingReference,
      reviewReasons: _sanitizeReviewReasons(data['reviewReasons']),
      rawBarcode:
          data['rawBarcode'] is String ? data['rawBarcode'] as String : null,
      modelBarcode: data['modelBarcode'] is String
          ? data['modelBarcode'] as String
          : null,
      confirmedBarcode: data['confirmedBarcode'] is String
          ? data['confirmedBarcode'] as String
          : null,
    );
  }

  static String _fallbackDateKey(DateTime timestamp) =>
      localDateKey(tz.TZDateTime.from(timestamp, tz.local));

  Map<String, dynamic> toMap() => {
        'uid': uid,
        'timestamp': Timestamp.fromDate(timestamp),
        'date': date,
        'imageUrl': imageUrl,
        if (storagePath != null) 'storagePath': storagePath,
        'scanMode': scanMode,
        'status': status.wireName,
        'foodName': foodName,
        'baseKcal': baseKcal,
        'baseProtein': baseProtein,
        'baseCarbs': baseCarbs,
        'baseFat': baseFat,
        'servingMultiplier':
            _legacyServingMultiplierValid ? servingMultiplier : null,
        'mealType': mealType.name,
        'detectedItems': detectedItems.map((e) => e.toMap()).toList(),
        'confidence': confidence,
        if (atwaterKcal != null) 'atwaterKcal': atwaterKcal,
        'corrected': corrected,
        if (correctedAt != null)
          'correctedAt': Timestamp.fromDate(correctedAt!),
        'candidates': candidates.map((candidate) => candidate.toMap()).toList(),
        if (!usesLegacyServingMultiplier) ...{
          if (nutritionBasis != null) 'nutritionBasis': nutritionBasis,
          if (nutritionAmount != null) 'nutritionAmount': nutritionAmount,
          if (nutritionUnit != null) 'nutritionUnit': nutritionUnit,
          if (consumedAmount != null) 'consumedAmount': consumedAmount,
          if (packageUnitCount != null) 'packageUnitCount': packageUnitCount,
          if (unitAmount != null) 'unitAmount': unitAmount,
          if (per100Reference != null)
            'per100Reference': per100Reference!.toMap(),
          if (servingReference != null)
            'servingReference': servingReference!.toMap(),
          'reviewReasons': reviewReasons ?? const <String>[],
        },
        if (rawBarcode != null) 'rawBarcode': rawBarcode,
        if (modelBarcode != null) 'modelBarcode': modelBarcode,
        if (confirmedBarcode != null) 'confirmedBarcode': confirmedBarcode,
      };

  FoodEntry copyWith({
    String? foodName,
    double? kcal,
    double? protein,
    double? carbs,
    double? fat,
    double? baseKcal,
    double? baseProtein,
    double? baseCarbs,
    double? baseFat,
    double? servingMultiplier,
    MealType? mealType,
    List<DetectedItem>? detectedItems,
    bool? corrected,
    DateTime? correctedAt,
    FoodEntryStatus? status,
    List<ReviewCandidate>? candidates,
    double? atwaterKcal,
    double? confidence,
    String? nutritionBasis,
    double? nutritionAmount,
    String? nutritionUnit,
    double? consumedAmount,
    int? packageUnitCount,
    double? unitAmount,
    NutritionReference? per100Reference,
    NutritionReference? servingReference,
    List<String>? reviewReasons,
    String? rawBarcode,
    String? modelBarcode,
    String? confirmedBarcode,
    bool clearNutritionBasis = false,
    bool clearNutritionAmount = false,
    bool clearNutritionUnit = false,
    bool clearConsumedAmount = false,
    bool clearPackageUnitCount = false,
    bool clearUnitAmount = false,
    bool clearPer100Reference = false,
    bool clearServingReference = false,
    bool clearReviewReasons = false,
    bool clearRawBarcode = false,
    bool clearModelBarcode = false,
    bool clearConfirmedBarcode = false,
  }) {
    final canonicalFieldsChanged = nutritionBasis != null ||
        nutritionAmount != null ||
        nutritionUnit != null ||
        consumedAmount != null ||
        packageUnitCount != null ||
        unitAmount != null ||
        per100Reference != null ||
        servingReference != null ||
        reviewReasons != null ||
        clearNutritionBasis ||
        clearNutritionAmount ||
        clearNutritionUnit ||
        clearConsumedAmount ||
        clearPackageUnitCount ||
        clearUnitAmount ||
        clearPer100Reference ||
        clearServingReference ||
        clearReviewReasons;

    return FoodEntry._internal(
      _hasCanonicalTrigger || canonicalFieldsChanged,
      servingMultiplier != null ? true : _legacyServingMultiplierValid,
      id: id,
      uid: uid,
      timestamp: timestamp,
      date: date,
      imageUrl: imageUrl,
      storagePath: storagePath,
      scanMode: scanMode,
      status: status ?? this.status,
      foodName: foodName ?? this.foodName,
      baseKcal: baseKcal ?? kcal ?? this.baseKcal,
      baseProtein: baseProtein ?? protein ?? this.baseProtein,
      baseCarbs: baseCarbs ?? carbs ?? this.baseCarbs,
      baseFat: baseFat ?? fat ?? this.baseFat,
      servingMultiplier: servingMultiplier ?? this.servingMultiplier,
      mealType: mealType ?? this.mealType,
      detectedItems: detectedItems ?? this.detectedItems,
      confidence: confidence ?? this.confidence,
      atwaterKcal: atwaterKcal ?? this.atwaterKcal,
      corrected: corrected ?? this.corrected,
      correctedAt: correctedAt ?? this.correctedAt,
      boundingBox: boundingBox,
      candidates: candidates ?? this.candidates,
      nutritionBasis:
          clearNutritionBasis ? null : nutritionBasis ?? this.nutritionBasis,
      nutritionAmount:
          clearNutritionAmount ? null : nutritionAmount ?? this.nutritionAmount,
      nutritionUnit:
          clearNutritionUnit ? null : nutritionUnit ?? this.nutritionUnit,
      consumedAmount:
          clearConsumedAmount ? null : consumedAmount ?? this.consumedAmount,
      packageUnitCount: clearPackageUnitCount
          ? null
          : packageUnitCount ?? this.packageUnitCount,
      unitAmount: clearUnitAmount ? null : unitAmount ?? this.unitAmount,
      per100Reference:
          clearPer100Reference ? null : per100Reference ?? this.per100Reference,
      servingReference: clearServingReference
          ? null
          : servingReference ?? this.servingReference,
      reviewReasons: clearReviewReasons
          ? null
          : reviewReasons != null
              ? _sanitizeReviewReasons(reviewReasons)
              : this.reviewReasons,
      rawBarcode: clearRawBarcode ? null : rawBarcode ?? this.rawBarcode,
      modelBarcode:
          clearModelBarcode ? null : modelBarcode ?? this.modelBarcode,
      confirmedBarcode: clearConfirmedBarcode
          ? null
          : confirmedBarcode ?? this.confirmedBarcode,
    );
  }
}
