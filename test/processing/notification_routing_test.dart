import 'package:calorix/shared/providers/viewed_entry_store.dart';
import 'package:calorix/shared/services/entry_existence_checker.dart';
import 'package:calorix/shared/services/notification_routing.dart';
import 'package:flutter_test/flutter_test.dart';

class _ViewedEntries implements ViewedEntryStore {
  final ids = <String>{};

  @override
  Future<bool> isViewed(String entryId) async => ids.contains(entryId);

  @override
  Future<void> markViewed(String entryId) async => ids.add(entryId);

  @override
  Future<List<String>> recentIds() async => ids.toList();
}

class _EntryChecker implements EntryExistenceChecker {
  _EntryChecker(this.result);
  final bool result;
  int calls = 0;

  @override
  Future<bool> exists(String entryId) async {
    calls++;
    return result;
  }
}

void main() {
  test('pure route supports entryId, legacy docId, and missing payload', () {
    expect(routeForNotification({'entryId': 'e1'}, alreadyViewed: false),
        '/today/food/e1');
    expect(routeForNotification({'docId': 'old'}, alreadyViewed: false),
        '/today/food/old');
    expect(routeForNotification({}, alreadyViewed: false), '/today');
  });

  test('fresh existing target is checked, marked viewed, and routed', () async {
    final viewed = _ViewedEntries();
    final checker = _EntryChecker(true);
    final handler = NotificationTapHandler(
      viewedEntries: viewed,
      entryExists: checker,
    );

    expect(await handler.resolve({'entryId': 'e1'}), '/today/food/e1');
    expect(checker.calls, 1);
    expect(await viewed.isViewed('e1'), isTrue);
  });

  test('missing target routes to Today and is not marked viewed', () async {
    final viewed = _ViewedEntries();
    final checker = _EntryChecker(false);
    final handler = NotificationTapHandler(
      viewedEntries: viewed,
      entryExists: checker,
    );

    expect(await handler.resolve({'entryId': 'deleted'}), '/today');
    expect(await viewed.isViewed('deleted'), isFalse);
  });

  test('already viewed target bypasses remote lookup on warm tap', () async {
    final viewed = _ViewedEntries()..ids.add('e1');
    final checker = _EntryChecker(false);
    final handler = NotificationTapHandler(
      viewedEntries: viewed,
      entryExists: checker,
    );

    expect(await handler.resolve({'entryId': 'e1'}), '/today/food/e1');
    expect(checker.calls, 0);
  });
}
