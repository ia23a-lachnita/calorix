import 'package:cloud_firestore/cloud_firestore.dart';

enum BodyGoal { loseFat, maintain, leanPlus, custom }

class MacroTargetPlan {
  final String id;
  final String planName;
  final BodyGoal goal;
  final DateTime startDate;
  final DateTime? endDate;
  final int kcal;
  final int protein;
  final int carbs;
  final int fat;
  final bool isActive;

  const MacroTargetPlan({
    required this.id,
    required this.planName,
    required this.goal,
    required this.startDate,
    this.endDate,
    required this.kcal,
    required this.protein,
    required this.carbs,
    required this.fat,
    this.isActive = false,
  });

  factory MacroTargetPlan.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return MacroTargetPlan(
      id: doc.id,
      planName: data['planName'] as String? ?? 'My Plan',
      goal: BodyGoal.values.firstWhere(
        (g) => g.name == (data['goal'] as String? ?? 'maintain'),
        orElse: () => BodyGoal.maintain,
      ),
      startDate: (data['startDate'] as Timestamp).toDate(),
      endDate: data['endDate'] != null
          ? (data['endDate'] as Timestamp).toDate()
          : null,
      kcal: (data['kcal'] as num?)?.toInt() ?? 2400,
      protein: (data['protein'] as num?)?.toInt() ?? 170,
      carbs: (data['carbs'] as num?)?.toInt() ?? 250,
      fat: (data['fat'] as num?)?.toInt() ?? 70,
      isActive: data['isActive'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toMap() => {
        'planName': planName,
        'goal': goal.name,
        'startDate': Timestamp.fromDate(startDate),
        'endDate': endDate != null ? Timestamp.fromDate(endDate!) : null,
        'kcal': kcal,
        'protein': protein,
        'carbs': carbs,
        'fat': fat,
        'isActive': isActive,
      };

  MacroTargetPlan copyWith({
    String? planName,
    BodyGoal? goal,
    int? kcal,
    int? protein,
    int? carbs,
    int? fat,
    bool? isActive,
  }) =>
      MacroTargetPlan(
        id: id,
        planName: planName ?? this.planName,
        goal: goal ?? this.goal,
        startDate: startDate,
        endDate: endDate,
        kcal: kcal ?? this.kcal,
        protein: protein ?? this.protein,
        carbs: carbs ?? this.carbs,
        fat: fat ?? this.fat,
        isActive: isActive ?? this.isActive,
      );

  static MacroTargetPlan defaultPlan() => MacroTargetPlan(
        id: 'default',
        planName: 'Cut Phase',
        goal: BodyGoal.loseFat,
        startDate: DateTime.now(),
        kcal: 2400,
        protein: 170,
        carbs: 250,
        fat: 70,
        isActive: true,
      );
}
