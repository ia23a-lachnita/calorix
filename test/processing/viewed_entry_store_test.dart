import 'package:calorix/shared/providers/viewed_entry_store.dart';
import 'package:flutter_test/flutter_test.dart';

class _MemoryPreferences implements ViewedEntryPreferences {
  final values = <String, List<String>>{};

  @override
  List<String>? getStringList(String key) => values[key];

  @override
  Future<bool> setStringList(String key, List<String> value) async {
    values[key] = List.of(value);
    return true;
  }
}

void main() {
  test('persists most-recent-first IDs and moves duplicates to the front',
      () async {
    final preferences = _MemoryPreferences();
    final store = SharedPreferencesViewedEntryStore(preferences);
    await store.markViewed('e1');
    await store.markViewed('e2');
    await store.markViewed('e1');

    expect(await store.recentIds(), ['e1', 'e2']);
    expect(await SharedPreferencesViewedEntryStore(preferences).isViewed('e2'),
        isTrue);
  });

  test('retains only the 500 most recently viewed IDs', () async {
    final store = SharedPreferencesViewedEntryStore(_MemoryPreferences());
    for (var index = 0; index < 501; index++) {
      await store.markViewed('e$index');
    }
    final ids = await store.recentIds();
    expect(ids, hasLength(500));
    expect(ids.first, 'e500');
    expect(ids, isNot(contains('e0')));
  });
}
