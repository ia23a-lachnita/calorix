import 'package:intl/intl.dart';
import 'package:timezone/timezone.dart' as tz;

tz.TZDateTime startOfDay(tz.TZDateTime dt) =>
    tz.TZDateTime(dt.location, dt.year, dt.month, dt.day);

tz.TZDateTime startOfWeek(tz.TZDateTime dt) {
  final weekday = dt.weekday;
  if (weekday == 1) return startOfDay(dt);
  return tz.TZDateTime(dt.location, dt.year, dt.month, dt.day - (weekday - 1));
}

tz.TZDateTime startOfMonth(tz.TZDateTime dt) =>
    tz.TZDateTime(dt.location, dt.year, dt.month);

String dateKeyFor(tz.TZDateTime dt) =>
    DateFormat('yyyy-MM-dd').format(dt);

String weekKeyFor(tz.TZDateTime dt) {
  final start = startOfWeek(dt);
  return DateFormat('yyyy-MM-dd').format(start);
}

String monthKeyFor(tz.TZDateTime dt) => DateFormat('yyyy-MM').format(dt);

String yearKeyFor(tz.TZDateTime dt) => DateFormat('yyyy').format(dt);
