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

class ReviewCandidate {
  const ReviewCandidate({
    required this.name,
    required this.confidence,
    required this.kcal,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
  });

  final String name;
  final double confidence;
  final int kcal;
  final double proteinG;
  final double carbsG;
  final double fatG;

  factory ReviewCandidate.fromMap(Map<String, dynamic> map) => ReviewCandidate(
        name: map['name'] as String,
        confidence: (map['confidence'] as num).toDouble(),
        kcal: (map['kcal'] as num).round(),
        proteinG: (map['proteinG'] ?? map['protein'] as num?)?.toDouble() ?? 0,
        carbsG: (map['carbsG'] ?? map['carbs'] as num?)?.toDouble() ?? 0,
        fatG: (map['fatG'] ?? map['fat'] as num?)?.toDouble() ?? 0,
      );

  Map<String, dynamic> toMap() => {
        'name': name,
        'confidence': confidence,
        'kcal': kcal,
        'proteinG': proteinG,
        'carbsG': carbsG,
        'fatG': fatG,
      };
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
  final double? kcal;
  final double? protein;
  final double? carbs;
  final double? fat;
  final double servingMultiplier;
  final MealType mealType;
  final List<DetectedItem> detectedItems;
  final double? confidence;
  final bool corrected;
  final BoundingBox? boundingBox;
  final List<ReviewCandidate> candidates;

  const FoodEntry({
    required this.id,
    required this.uid,
    required this.timestamp,
    required this.date,
    this.imageUrl,
    this.storagePath,
    required this.scanMode,
    required this.status,
    this.foodName,
    this.kcal,
    this.protein,
    this.carbs,
    this.fat,
    this.servingMultiplier = 1.0,
    this.mealType = MealType.lunch,
    this.detectedItems = const [],
    this.confidence,
    this.corrected = false,
    this.boundingBox,
    this.candidates = const [],
  });

  double get scaledKcal => (kcal ?? 0) * servingMultiplier;
  double get scaledProtein => (protein ?? 0) * servingMultiplier;
  double get scaledCarbs => (carbs ?? 0) * servingMultiplier;
  double get scaledFat => (fat ?? 0) * servingMultiplier;

  bool get isConfirmed => (confidence ?? 0) >= 0.80;

  /// Server-gated low-confidence scans awaiting user confirmation. They are
  /// listed with the amber review badge but excluded from daily totals.
  bool get needsReview => status == FoodEntryStatus.needsReview;

  factory FoodEntry.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    final timestamp = (data['timestamp'] as Timestamp).toDate();
    return FoodEntry(
      id: doc.id,
      uid: data['uid'] as String,
      timestamp: timestamp,
      date: data['date'] as String? ?? _fallbackDateKey(timestamp),
      imageUrl: data['imageUrl'] as String?,
      storagePath: data['storagePath'] as String?,
      scanMode: data['scanMode'] as String? ?? 'meal',
      status: FoodEntryStatusWire.fromWire(data['status'] as String?),
      foodName: data['foodName'] as String?,
      kcal: (data['kcal'] as num?)?.toDouble(),
      protein: (data['protein'] as num?)?.toDouble(),
      carbs: (data['carbs'] as num?)?.toDouble(),
      fat: (data['fat'] as num?)?.toDouble(),
      servingMultiplier: (data['servingMultiplier'] as num?)?.toDouble() ?? 1.0,
      mealType: MealType.values.firstWhere(
        (m) => m.name == (data['mealType'] as String? ?? 'lunch'),
        orElse: () => MealType.lunch,
      ),
      detectedItems: ((data['detectedItems'] as List<dynamic>?) ?? [])
          .map((e) => DetectedItem.fromMap(e as Map<String, dynamic>))
          .toList(),
      confidence: (data['confidence'] as num?)?.toDouble(),
      corrected: data['corrected'] as bool? ?? false,
      boundingBox: data['boundingBox'] != null
          ? BoundingBox.fromMap(data['boundingBox'] as Map<String, dynamic>)
          : null,
      candidates: ((data['candidates'] as List<dynamic>?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ReviewCandidate.fromMap)
          .toList(),
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
        'kcal': kcal,
        'protein': protein,
        'carbs': carbs,
        'fat': fat,
        'servingMultiplier': servingMultiplier,
        'mealType': mealType.name,
        'detectedItems': detectedItems.map((e) => e.toMap()).toList(),
        'confidence': confidence,
        'corrected': corrected,
        'candidates': candidates.map((candidate) => candidate.toMap()).toList(),
      };

  FoodEntry copyWith({
    String? foodName,
    double? kcal,
    double? protein,
    double? carbs,
    double? fat,
    double? servingMultiplier,
    MealType? mealType,
    List<DetectedItem>? detectedItems,
    bool? corrected,
    FoodEntryStatus? status,
    List<ReviewCandidate>? candidates,
  }) =>
      FoodEntry(
        id: id,
        uid: uid,
        timestamp: timestamp,
        date: date,
        imageUrl: imageUrl,
        storagePath: storagePath,
        scanMode: scanMode,
        status: status ?? this.status,
        foodName: foodName ?? this.foodName,
        kcal: kcal ?? this.kcal,
        protein: protein ?? this.protein,
        carbs: carbs ?? this.carbs,
        fat: fat ?? this.fat,
        servingMultiplier: servingMultiplier ?? this.servingMultiplier,
        mealType: mealType ?? this.mealType,
        detectedItems: detectedItems ?? this.detectedItems,
        confidence: confidence,
        corrected: corrected ?? this.corrected,
        boundingBox: boundingBox,
        candidates: candidates ?? this.candidates,
      );
}
