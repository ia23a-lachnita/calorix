import 'package:shared_preferences/shared_preferences.dart';

const _viewedEntriesKey = 'viewed_entry_ids_v1';
const _maxViewedEntries = 500;

abstract class ViewedEntryStore {
  Future<bool> isViewed(String entryId);
  Future<void> markViewed(String entryId);
  Future<List<String>> recentIds();
}

abstract class ViewedEntryPreferences {
  List<String>? getStringList(String key);
  Future<bool> setStringList(String key, List<String> value);
}

class _SharedPreferencesAdapter implements ViewedEntryPreferences {
  const _SharedPreferencesAdapter(this._preferences);

  final SharedPreferences _preferences;

  @override
  List<String>? getStringList(String key) => _preferences.getStringList(key);

  @override
  Future<bool> setStringList(String key, List<String> value) =>
      _preferences.setStringList(key, value);
}

class SharedPreferencesViewedEntryStore implements ViewedEntryStore {
  SharedPreferencesViewedEntryStore(this._preferences);

  final ViewedEntryPreferences _preferences;

  static Future<SharedPreferencesViewedEntryStore> create() async =>
      SharedPreferencesViewedEntryStore(
        _SharedPreferencesAdapter(await SharedPreferences.getInstance()),
      );

  List<String> _read() => List<String>.of(
      _preferences.getStringList(_viewedEntriesKey) ?? const []);

  @override
  Future<bool> isViewed(String entryId) async => _read().contains(entryId);

  @override
  Future<void> markViewed(String entryId) async {
    if (entryId.isEmpty) return;
    final ids = _read()..remove(entryId);
    ids.insert(0, entryId);
    if (ids.length > _maxViewedEntries) {
      ids.removeRange(_maxViewedEntries, ids.length);
    }
    await _preferences.setStringList(_viewedEntriesKey, ids);
  }

  @override
  Future<List<String>> recentIds() async => _read();
}
