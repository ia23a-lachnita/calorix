import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:calorix/features/food_detail/food_detail_sheet.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/shared/providers/viewed_entry_store.dart';
import 'package:calorix/shared/services/entry_existence_checker.dart';
import 'package:calorix/shared/services/notification_routing.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('notification_return_test — fresh and stale notification taps', () {
    group('routeForNotification (pure routing)', () {
      test('returns food detail route for entry with ID', () {
        final route = routeForNotification(
          {'entryId': 'entry-abc'},
          alreadyViewed: false,
        );
        expect(route, '/today/food/entry-abc');
      });

      test('returns food detail route for legacy docId payload', () {
        final route = routeForNotification(
          {'docId': 'legacy-id-1'},
          alreadyViewed: false,
        );
        expect(route, '/today/food/legacy-id-1');
      });

      test('returns /today when payload has no entry ID', () {
        final route = routeForNotification(
          {},
          alreadyViewed: false,
        );
        expect(route, '/today');
      });

      test('returns food detail route when already viewed (stale is safe)',
          () {
        final route = routeForNotification(
          {'entryId': 'entry-abc'},
          alreadyViewed: true,
        );
        expect(route, '/today/food/entry-abc');
      });
    });

    group('NotificationTapHandler.resolve', () {
      test('fresh entry: exists, not viewed → returns food detail route',
          () async {
        final viewed = _InMemoryViewedEntryStore();
        final existence = _InMemoryEntryExistenceChecker()..addEntry('entry-1');

        final handler = NotificationTapHandler(
          viewedEntries: viewed,
          entryExists: existence,
        );

        final route = await handler.resolve({'entryId': 'entry-1'});
        expect(route, '/today/food/entry-1');
        expect(await viewed.isViewed('entry-1'), isTrue);
      });

      test(
          'stale entry (already viewed): viewed + exists → returns food detail '
          'route, no error', () async {
        final viewed = _InMemoryViewedEntryStore()..markViewedSync('entry-2');
        final existence = _InMemoryEntryExistenceChecker()..addEntry('entry-2');

        final handler = NotificationTapHandler(
          viewedEntries: viewed,
          entryExists: existence,
        );

        final route = await handler.resolve({'entryId': 'entry-2'});
        expect(route, '/today/food/entry-2');
      });

      test(
          'stale entry (missing from store): not viewed + not exists → falls '
          'back to /today, no error', () async {
        final viewed = _InMemoryViewedEntryStore();
        final existence = _InMemoryEntryExistenceChecker();

        final handler = NotificationTapHandler(
          viewedEntries: viewed,
          entryExists: existence,
        );

        final route = await handler.resolve({'entryId': 'missing-entry'});
        expect(route, '/today');
        expect(await viewed.isViewed('missing-entry'), isFalse);
      });

      test('no entry ID in payload → returns /today', () async {
        final viewed = _InMemoryViewedEntryStore();
        final existence = _InMemoryEntryExistenceChecker();

        final handler = NotificationTapHandler(
          viewedEntries: viewed,
          entryExists: existence,
        );

        final route = await handler.resolve({});
        expect(route, '/today');
      });
    });

    group('E2E: notification tap navigates through the app', () {
      testWidgets(
          'fresh notification tap on existing entry navigates to food detail',
          (tester) async {
        final h = await E2EHarness.create();
        final entry = makeFixtureEntry(id: 'notif-fresh-1');
        h.seed(entry);
        await h.pump(tester);
        h.wireNotificationDeepLink(tester);

        h.notification.simulateTap('notif-fresh-1');
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pump();

        expect(find.byType(FoodDetailSheet), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets(
          'stale notification tap (already viewed) navigates to food detail',
          (tester) async {
        final h = await E2EHarness.create();
        final entry = makeFixtureEntry(id: 'notif-stale-1');
        h.seed(entry);
        h.markViewed('notif-stale-1');
        await h.pump(tester);
        h.wireNotificationDeepLink(tester);

        h.notification.simulateTap('notif-stale-1');
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pump();

        expect(find.byType(FoodDetailSheet), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets(
          'missing entry (not viewed, not exists) falls back to TodayScreen',
          (tester) async {
        final h = await E2EHarness.create();
        await h.pump(tester);
        h.wireNotificationDeepLink(tester);

        h.notification.simulateTap('nonexistent-entry');
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pump();

        expect(find.byType(TodayScreen), findsOneWidget);
        expect(find.byType(FoodDetailSheet), findsNothing);
        expect(tester.takeException(), isNull);
      });

      testWidgets('empty entry ID falls back to TodayScreen', (tester) async {
        final h = await E2EHarness.create();
        await h.pump(tester);
        h.wireNotificationDeepLink(tester);

        h.notification.simulateTap('');
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pump();

        expect(find.byType(TodayScreen), findsOneWidget);
        expect(find.byType(FoodDetailSheet), findsNothing);
        expect(tester.takeException(), isNull);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Minimal in-memory fakes for unit-level handler testing
// ---------------------------------------------------------------------------

class _InMemoryViewedEntryStore implements ViewedEntryStore {
  final Set<String> _viewed = {};

  void markViewedSync(String entryId) => _viewed.add(entryId);

  @override
  Future<bool> isViewed(String entryId) async => _viewed.contains(entryId);

  @override
  Future<void> markViewed(String entryId) async => _viewed.add(entryId);

  @override
  Future<List<String>> recentIds() async => _viewed.toList();
}

class _InMemoryEntryExistenceChecker implements EntryExistenceChecker {
  final Set<String> _existing = {};

  void addEntry(String id) => _existing.add(id);

  @override
  Future<bool> exists(String entryId) async => _existing.contains(entryId);
}
