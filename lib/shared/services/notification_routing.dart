import '../providers/viewed_entry_store.dart';
import 'entry_existence_checker.dart';

String? _entryIdOf(Map<String, Object?> payload) {
  final entryId = payload['entryId'];
  if (entryId is String && entryId.isNotEmpty) return entryId;
  final legacyId = payload['docId'];
  return legacyId is String && legacyId.isNotEmpty ? legacyId : null;
}

String routeForNotification(
  Map<String, Object?> payload, {
  required bool alreadyViewed,
}) {
  final entryId = _entryIdOf(payload);
  return entryId == null ? '/today' : '/today/food/$entryId';
}

class NotificationTapHandler {
  NotificationTapHandler({
    required ViewedEntryStore viewedEntries,
    required EntryExistenceChecker entryExists,
  })  : _viewedEntries = viewedEntries,
        _entryExists = entryExists;

  final ViewedEntryStore _viewedEntries;
  final EntryExistenceChecker _entryExists;

  Future<String> resolve(Map<String, Object?> payload) async {
    final entryId = _entryIdOf(payload);
    if (entryId == null) return '/today';
    final alreadyViewed = await _viewedEntries.isViewed(entryId);
    if (!alreadyViewed && !await _entryExists.exists(entryId)) return '/today';
    await _viewedEntries.markViewed(entryId);
    return routeForNotification(payload, alreadyViewed: alreadyViewed);
  }
}
