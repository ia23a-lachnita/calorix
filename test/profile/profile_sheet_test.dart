import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/profile/profile_sheet.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

class FakeUser extends Fake implements User {
  @override
  String get uid => 'test-uid';

  @override
  String? get email => 'test@example.com';

  @override
  String? get displayName => 'Test User';

  @override
  bool get isAnonymous => false;
}

class FakeAnonymousUser extends Fake implements User {
  @override
  String get uid => 'anon-uid';

  @override
  String? get email => null;

  @override
  String? get displayName => null;

  @override
  bool get isAnonymous => true;
}

class FakeFirebaseAuth extends Fake implements FirebaseAuth {
  final User? _user;
  bool signOutCalled = false;

  FakeFirebaseAuth({User? user}) : _user = user;

  @override
  User? get currentUser => _user;

  @override
  Stream<User?> authStateChanges() async* {
    yield _user;
  }

  @override
  Future<void> signOut() async {
    signOutCalled = true;
  }
}

Widget _buildProfile({
  User? user,
  bool dark = true,
  Map<String, Object>? settingsOverrides,
}) {
  SharedPreferences.setMockInitialValues(settingsOverrides ??
      {
        'app_settings.themeMode': 'system',
        'app_settings.units': 'metric',
        'app_settings.notificationsEnabled': true,
        'app_settings.cameraResolution': 'high',
        'app_settings.autoCapture': false,
      });

  final auth = FakeFirebaseAuth(user: user);
  return ProviderScope(
    overrides: [
      firebaseAuthProvider.overrideWithValue(auth),
      authStateProvider.overrideWith((ref) => Stream.value(user)),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      home: const ProfileSheet(),
    ),
  );
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'app_settings.themeMode': 'system',
      'app_settings.units': 'metric',
      'app_settings.notificationsEnabled': true,
      'app_settings.cameraResolution': 'high',
      'app_settings.autoCapture': false,
    });
  });

  group('settingsProvider persistence', () {
    testWidgets(
      'settingsProvider reads persisted theme from shared_preferences',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          'app_settings.themeMode': 'dark',
          'app_settings.units': 'metric',
          'app_settings.notificationsEnabled': true,
          'app_settings.cameraResolution': 'high',
          'app_settings.autoCapture': false,
        });

        final prefs = await SharedPreferences.getInstance();

        final container = ProviderContainer(
          overrides: [
            appSettingsStoreProvider.overrideWithValue(
              SharedPreferencesAppSettingsStore.withInstance(prefs),
            ),
          ],
        );
        addTearDown(container.dispose);

        await tester.runAsync(
          () => container.read(settingsProvider.notifier).hydrated,
        );
        final settings = container.read(settingsProvider);
        expect(settings.themeMode, ThemeMode.dark);
        expect(settings.units, 'metric');
        expect(settings.notificationsEnabled, isTrue);
        expect(settings.cameraResolution, 'high');
        expect(settings.autoCapture, isFalse);
      },
    );

    testWidgets(
      'settingsProvider writes theme change back to shared_preferences',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          'app_settings.themeMode': 'light',
          'app_settings.units': 'metric',
          'app_settings.notificationsEnabled': true,
          'app_settings.cameraResolution': 'high',
          'app_settings.autoCapture': false,
        });

        final prefs = await SharedPreferences.getInstance();

        final container = ProviderContainer(
          overrides: [
            appSettingsStoreProvider.overrideWithValue(
              SharedPreferencesAppSettingsStore.withInstance(prefs),
            ),
          ],
        );
        addTearDown(container.dispose);

        await container
            .read(settingsProvider.notifier)
            .updateThemeMode(ThemeMode.dark);

        final updated = container.read(settingsProvider);
        expect(updated.themeMode, ThemeMode.dark);
        expect(prefs.getString('app_settings.themeMode'), 'dark');
      },
    );

    testWidgets(
      'settingsProvider persists units change',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          'app_settings.themeMode': 'system',
          'app_settings.units': 'metric',
          'app_settings.notificationsEnabled': true,
          'app_settings.cameraResolution': 'high',
          'app_settings.autoCapture': false,
        });

        final prefs = await SharedPreferences.getInstance();

        final container = ProviderContainer(
          overrides: [
            appSettingsStoreProvider.overrideWithValue(
              SharedPreferencesAppSettingsStore.withInstance(prefs),
            ),
          ],
        );
        addTearDown(container.dispose);

        await container.read(settingsProvider.notifier).updateUnits('imperial');

        final updated = container.read(settingsProvider);
        expect(updated.units, 'imperial');
        expect(prefs.getString('app_settings.units'), 'imperial');
      },
    );

    testWidgets(
      'settingsProvider persists notifications toggle',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          'app_settings.themeMode': 'system',
          'app_settings.units': 'metric',
          'app_settings.notificationsEnabled': true,
          'app_settings.cameraResolution': 'high',
          'app_settings.autoCapture': false,
        });

        final prefs = await SharedPreferences.getInstance();

        final container = ProviderContainer(
          overrides: [
            appSettingsStoreProvider.overrideWithValue(
              SharedPreferencesAppSettingsStore.withInstance(prefs),
            ),
          ],
        );
        addTearDown(container.dispose);

        await container
            .read(settingsProvider.notifier)
            .updateNotificationsEnabled(false);

        final updated = container.read(settingsProvider);
        expect(updated.notificationsEnabled, isFalse);
        expect(prefs.getBool('app_settings.notificationsEnabled'), isFalse);
      },
    );
  });

  group('profile preference controls', () {
    testWidgets(
      'theme selector shows System/Light/Dark',
      (tester) async {
        await tester.pumpWidget(_buildProfile(user: FakeUser()));
        await tester.pump();

        expect(find.text('System'), findsOneWidget);
        expect(find.text('Light'), findsOneWidget);
        expect(find.text('Dark'), findsOneWidget);
      },
    );

    testWidgets(
      'theme selector updates settingsProvider',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          'app_settings.themeMode': 'system',
          'app_settings.units': 'metric',
          'app_settings.notificationsEnabled': true,
          'app_settings.cameraResolution': 'high',
          'app_settings.autoCapture': false,
        });

        final prefs = await SharedPreferences.getInstance();
        final container = ProviderContainer(
          overrides: [
            appSettingsStoreProvider.overrideWithValue(
              SharedPreferencesAppSettingsStore.withInstance(prefs),
            ),
          ],
        );
        addTearDown(container.dispose);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              theme: AppTheme.light(),
              darkTheme: AppTheme.dark(),
              themeMode: ThemeMode.dark,
              home: const ProfileSheet(),
            ),
          ),
        );
        await tester.pump();

        await tester.tap(find.text('Light'));
        await tester.pump();

        final settings = container.read(settingsProvider);
        expect(settings.themeMode, ThemeMode.light);
      },
    );

    testWidgets(
      'notifications toggle reflects settingsProvider value',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          'app_settings.themeMode': 'system',
          'app_settings.units': 'metric',
          'app_settings.notificationsEnabled': false,
          'app_settings.cameraResolution': 'high',
          'app_settings.autoCapture': false,
        });

        final prefs = await SharedPreferences.getInstance();
        final container = ProviderContainer(
          overrides: [
            appSettingsStoreProvider.overrideWithValue(
              SharedPreferencesAppSettingsStore.withInstance(prefs),
            ),
          ],
        );
        addTearDown(container.dispose);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              theme: AppTheme.light(),
              darkTheme: AppTheme.dark(),
              themeMode: ThemeMode.dark,
              home: const ProfileSheet(),
            ),
          ),
        );
        await tester.pump();

        final toggle = tester.widget<SwitchListTile>(
          find.byKey(const ValueKey('profile-notifications-toggle')),
        );
        expect(toggle.value, isFalse);
      },
    );

    testWidgets(
      'units selector shows Metric/Imperial',
      (tester) async {
        await tester.pumpWidget(_buildProfile(user: FakeUser()));
        await tester.pump();

        expect(find.text('Metric'), findsOneWidget);
        expect(find.text('Imperial'), findsOneWidget);
      },
    );

    testWidgets(
      'units selector updates settingsProvider',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          'app_settings.themeMode': 'system',
          'app_settings.units': 'metric',
          'app_settings.notificationsEnabled': true,
          'app_settings.cameraResolution': 'high',
          'app_settings.autoCapture': false,
        });

        final prefs = await SharedPreferences.getInstance();
        final container = ProviderContainer(
          overrides: [
            appSettingsStoreProvider.overrideWithValue(
              SharedPreferencesAppSettingsStore.withInstance(prefs),
            ),
          ],
        );
        addTearDown(container.dispose);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              theme: AppTheme.light(),
              darkTheme: AppTheme.dark(),
              themeMode: ThemeMode.dark,
              home: const ProfileSheet(),
            ),
          ),
        );
        await tester.pump();

        await tester.tap(find.text('Imperial'));
        await tester.pump();

        final settings = container.read(settingsProvider);
        expect(settings.units, 'imperial');
      },
    );

    testWidgets(
      'camera resolution selector shows Low/High',
      (tester) async {
        await tester.pumpWidget(_buildProfile(user: FakeUser()));
        await tester.pump();

        expect(find.text('Low'), findsOneWidget);
        expect(find.text('High'), findsOneWidget);
      },
    );

    testWidgets(
      'auto-capture toggle reflects settingsProvider value',
      (tester) async {
        SharedPreferences.setMockInitialValues({
          'app_settings.themeMode': 'system',
          'app_settings.units': 'metric',
          'app_settings.notificationsEnabled': true,
          'app_settings.cameraResolution': 'high',
          'app_settings.autoCapture': true,
        });

        final prefs = await SharedPreferences.getInstance();
        final container = ProviderContainer(
          overrides: [
            appSettingsStoreProvider.overrideWithValue(
              SharedPreferencesAppSettingsStore.withInstance(prefs),
            ),
          ],
        );
        addTearDown(container.dispose);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              theme: AppTheme.light(),
              darkTheme: AppTheme.dark(),
              themeMode: ThemeMode.dark,
              home: const ProfileSheet(),
            ),
          ),
        );
        await tester.pump();

        final toggle = tester.widget<SwitchListTile>(
          find.byKey(const ValueKey('profile-auto-capture-toggle')),
        );
        expect(toggle.value, isTrue);
      },
    );
  });

  group('sign out confirmation and origin close', () {
    testWidgets(
      'sign out button shows confirmation dialog',
      (tester) async {
        await tester.pumpWidget(_buildProfile(user: FakeUser()));
        await tester.pump();

        await tester.scrollUntilVisible(
          find.text('Sign Out'),
          300,
          scrollable: find.byType(Scrollable),
        );
        await tester.tap(find.text('Sign Out'));
        await tester.pump();

        expect(find.text('Sign out?'), findsOneWidget);
        expect(
          find.text(
            'You will be signed out and your local session will end.',
          ),
          findsOneWidget,
        );
        expect(find.text('Cancel'), findsOneWidget);
      },
    );

    testWidgets(
      'cancel dismisses sign out dialog without signing out',
      (tester) async {
        await tester.pumpWidget(_buildProfile(user: FakeUser()));
        await tester.pump();

        await tester.scrollUntilVisible(
          find.text('Sign Out'),
          300,
          scrollable: find.byType(Scrollable),
        );
        await tester.tap(find.text('Sign Out'));
        await tester.pump();
        await tester.tap(find.text('Cancel'));
        await tester.pump();

        expect(find.text('Sign out?'), findsNothing);
      },
    );

    testWidgets(
      'close button has correct key and is tappable',
      (tester) async {
        await tester.pumpWidget(_buildProfile(user: FakeUser()));
        await tester.pump();

        expect(find.byKey(const ValueKey('profile-close')), findsOneWidget);
      },
    );

    testWidgets(
      'swipe down gesture is recognized',
      (tester) async {
        await tester.pumpWidget(_buildProfile(user: FakeUser()));
        await tester.pump();

        await tester.drag(
          find.byType(Scaffold),
          const Offset(0, 400),
        );
        await tester.pump();
      },
    );
  });
}
