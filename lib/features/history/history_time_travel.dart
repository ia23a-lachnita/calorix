import 'package:timezone/timezone.dart' as tz;

import '../../core/time/timezone_utils.dart' as timezone_utils;
import '../../shared/models/daily_log.dart';
import '../../shared/utils/date_key.dart';

class HistoryRange {
  HistoryRange(
      {required tz.TZDateTime start, required tz.TZDateTime endExclusive})
      : start = timezone_utils.startOfDay(start),
        endExclusive = timezone_utils.startOfDay(endExclusive) {
    if (!this.endExclusive.isAfter(this.start)) {
      throw ArgumentError.value(
        endExclusive,
        'endExclusive',
        'must be after start',
      );
    }
  }

  final tz.TZDateTime start;
  final tz.TZDateTime endExclusive;

  String get startKey => timezone_utils.dateKeyFor(start);
  String get endExclusiveKey => timezone_utils.dateKeyFor(endExclusive);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is HistoryRange &&
          startKey == other.startKey &&
          endExclusiveKey == other.endExclusiveKey;

  @override
  int get hashCode => Object.hash(startKey, endExclusiveKey);
}

class HistoryDayRow {
  const HistoryDayRow(this.log);

  final DailyLog log;

  String get dateKey => log.id;
  bool get hasData => log.hasData;
}

tz.TZDateTime calendarDay(tz.TZDateTime anchor, int dayOffset) => tz.TZDateTime(
      anchor.location,
      anchor.year,
      anchor.month,
      anchor.day + dayOffset,
    );

HistoryRange historyWeekRange(tz.TZDateTime selected) {
  final start = timezone_utils.startOfWeek(selected);
  return HistoryRange(start: start, endExclusive: calendarDay(start, 7));
}

HistoryRange historyMonthRange(tz.TZDateTime selected) {
  final start = timezone_utils.startOfMonth(selected);
  return HistoryRange(
    start: start,
    endExclusive: tz.TZDateTime(start.location, start.year, start.month + 1),
  );
}

List<HistoryDayRow> buildHistoryWeekRows({
  required tz.TZDateTime weekStart,
  required List<DailyLog> logs,
  required tz.TZDateTime now,
  DateTime? accountCreated,
}) {
  final normalizedWeekStart = timezone_utils.startOfWeek(weekStart);
  final weekEnd = calendarDay(normalizedWeekStart, 6);
  final today = timezone_utils.startOfDay(now);
  final lastDay = today.isBefore(weekEnd) ? today : weekEnd;
  if (lastDay.isBefore(normalizedWeekStart)) return const [];

  var firstDay = normalizedWeekStart;
  if (accountCreated != null) {
    final created = timezone_utils.startOfDay(
      tz.TZDateTime.from(accountCreated, now.location),
    );
    if (created.isAfter(firstDay)) firstDay = created;
  }
  if (firstDay.isAfter(lastDay)) return const [];

  final byKey = {for (final log in logs) localDateKey(log.date): log};
  final rows = <HistoryDayRow>[];
  for (var offset = 0;; offset++) {
    final date = calendarDay(firstDay, offset);
    if (date.isAfter(lastDay)) break;
    final key = timezone_utils.dateKeyFor(date);
    rows.add(
      HistoryDayRow(
        byKey[key] ??
            DailyLog(
              id: key,
              kcal: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
              entryCount: 0,
              date: DateTime(date.year, date.month, date.day),
            ),
      ),
    );
  }
  return rows;
}

int computeActiveStreak({
  required List<DailyLog> logs,
  required DateTime today,
}) {
  final byKey = {for (final log in logs) localDateKey(log.date): log};
  final todayOnly = DateTime(today.year, today.month, today.day);
  var cursor = todayOnly;
  if (!(byKey[localDateKey(cursor)]?.hasData ?? false)) {
    cursor = DateTime(cursor.year, cursor.month, cursor.day - 1);
  }

  var streak = 0;
  while (byKey[localDateKey(cursor)]?.hasData ?? false) {
    streak++;
    cursor = DateTime(cursor.year, cursor.month, cursor.day - 1);
  }
  return streak;
}

bool canGoToPreviousWeek({
  required tz.TZDateTime selectedWeek,
  DateTime? accountCreated,
}) {
  if (accountCreated == null) return true;
  final created = tz.TZDateTime.from(accountCreated, selectedWeek.location);
  final createdWeek = timezone_utils.startOfWeek(created);
  return timezone_utils.startOfWeek(selectedWeek).isAfter(createdWeek);
}

bool canGoToPreviousMonth({
  required tz.TZDateTime selectedMonth,
  DateTime? accountCreated,
}) {
  if (accountCreated == null) return true;
  final created = tz.TZDateTime.from(accountCreated, selectedMonth.location);
  final createdMonth = timezone_utils.startOfMonth(created);
  return timezone_utils.startOfMonth(selectedMonth).isAfter(createdMonth);
}
