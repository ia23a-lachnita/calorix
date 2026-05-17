import 'package:cloud_firestore/cloud_firestore.dart';

enum FoodEntryStatus { pending, processing, complete, error }

enum MealType { breakfast, lunch, dinner, snack }

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

class FoodEntry {
  final String id;
  final String uid;
  final DateTime timestamp;
  final String? imageUrl;
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

  const FoodEntry({
    required this.id,
    required this.uid,
    required this.timestamp,
    this.imageUrl,
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
  });

  double get scaledKcal => (kcal ?? 0) * servingMultiplier;
  double get scaledProtein => (protein ?? 0) * servingMultiplier;
  double get scaledCarbs => (carbs ?? 0) * servingMultiplier;
  double get scaledFat => (fat ?? 0) * servingMultiplier;

  bool get isConfirmed => (confidence ?? 0) >= 0.80;

  factory FoodEntry.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return FoodEntry(
      id: doc.id,
      uid: data['uid'] as String,
      timestamp: (data['timestamp'] as Timestamp).toDate(),
      imageUrl: data['imageUrl'] as String?,
      scanMode: data['scanMode'] as String? ?? 'meal',
      status: FoodEntryStatus.values.firstWhere(
        (s) => s.name == (data['status'] as String? ?? 'pending'),
        orElse: () => FoodEntryStatus.pending,
      ),
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
    );
  }

  Map<String, dynamic> toMap() => {
        'uid': uid,
        'timestamp': Timestamp.fromDate(timestamp),
        'imageUrl': imageUrl,
        'scanMode': scanMode,
        'status': status.name,
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
  }) =>
      FoodEntry(
        id: id,
        uid: uid,
        timestamp: timestamp,
        imageUrl: imageUrl,
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
      );
}
