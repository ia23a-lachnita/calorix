import 'package:cloud_firestore/cloud_firestore.dart';

class DailyLog {
  final String id; // {date} (users/{uid}/dailyLogs/{date})
  final double kcal;
  final double protein;
  final double carbs;
  final double fat;
  final int entryCount;
  final DateTime date;

  const DailyLog({
    required this.id,
    required this.kcal,
    required this.protein,
    required this.carbs,
    required this.fat,
    required this.entryCount,
    required this.date,
  });

  factory DailyLog.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    final dateStr = data['date'] as String? ?? doc.id;
    return DailyLog(
      id: doc.id,
      kcal: (data['kcal'] as num?)?.toDouble() ?? 0,
      protein: (data['protein'] as num?)?.toDouble() ?? 0,
      carbs: (data['carbs'] as num?)?.toDouble() ?? 0,
      fat: (data['fat'] as num?)?.toDouble() ?? 0,
      entryCount: (data['entryCount'] as num?)?.toInt() ?? 0,
      date: DateTime.tryParse(dateStr) ?? DateTime.now(),
    );
  }

  bool get hasData => entryCount > 0;
}

class WeightLog {
  final String date; // YYYY-MM-DD
  final double weight;

  const WeightLog({required this.date, required this.weight});

  factory WeightLog.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return WeightLog(
      date: doc.id,
      weight: (data['weight'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toMap() => {'date': date, 'weight': weight};
}
