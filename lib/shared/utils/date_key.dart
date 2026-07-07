/// Canonical calendar-day key for diary data.
///
/// The client owns day bucketing: `date` fields and `dailyLogs` document IDs
/// are always the device-local calendar day in `YYYY-MM-DD`. The backend
/// never re-derives the user's day from a timestamp (which would reintroduce
/// the UTC-vs-local misfiling bug this replaced).
String localDateKey(DateTime dateTime) {
  final local = dateTime.toLocal();
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  return '${local.year}-$month-$day';
}
