/// Returns a date key (yyyy-MM-dd) from the supplied DateTime's calendar fields.
/// Does NOT call .toLocal(); callers needing instant→device-zone conversion must
/// first use tz.TZDateTime.from(instant, tz.local).
String localDateKey(DateTime dateTime) {
  final month = dateTime.month.toString().padLeft(2, '0');
  final day = dateTime.day.toString().padLeft(2, '0');
  return '${dateTime.year}-$month-$day';
}
