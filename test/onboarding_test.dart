import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:calorix/core/router/app_router.dart';
import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/onboarding/loading_screen.dart';
import 'package:calorix/features/onboarding/login_screen.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

class FakeUserCredential extends Fake implements UserCredential {}

class FakeUser extends Fake implements User {
  @override
  String get uid => 'signed-in-user';

  @override
  bool get isAnonymous => false;

  @override
  String? get displayName => 'Signed In';
}

class FakeFirebaseAuth extends Fake implements FirebaseAuth {
  FakeFirebaseAuth({this.user});

  final _controller = StreamController<User?>.broadcast();
  final User? user;
  int anonymousSignIns = 0;

  @override
  User? get currentUser => user;

  @override
  Stream<User?> authStateChanges() async* {
    yield user;
    yield* _controller.stream;
  }

  @override
  Future<UserCredential> signInAnonymously() async {
    anonymousSignIns += 1;
    return FakeUserCredential();
  }
}

Widget _wrap(Widget child, FakeFirebaseAuth auth, {bool dark = true}) {
  return ProviderScope(
    overrides: [firebaseAuthProvider.overrideWithValue(auth)],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      home: child,
    ),
  );
}

void main() {
  group('LoginScreen', () {
    for (final dark in [true, false]) {
      testWidgets(
          'renders handoff structure in ${dark ? 'dark' : 'light'} mode',
          (tester) async {
        await tester.pumpWidget(
            _wrap(const LoginScreen(), FakeFirebaseAuth(), dark: dark));
        await tester.pump();

        expect(find.text('WELCOME BACK'), findsOneWidget);
        expect(find.text('Snap. Track.\nStay on target.'), findsOneWidget);
        expect(find.text('Continue'), findsOneWidget);
        expect(find.text('OR CONTINUE WITH'), findsOneWidget);
        expect(find.text('Apple'), findsOneWidget);
        expect(find.text('Google'), findsOneWidget);
        expect(find.text('Continue as guest'), findsOneWidget);
        expect(find.text('Stay signed in'), findsOneWidget);
      });
    }

    testWidgets('rejects invalid email before calling Firebase',
        (tester) async {
      await tester.pumpWidget(_wrap(const LoginScreen(), FakeFirebaseAuth()));
      await tester.pump();

      await tester.tap(find.text('Continue'));
      await tester.pump();

      expect(find.text('Enter a valid email address.'), findsOneWidget);
    });

    testWidgets('guest button signs in anonymously', (tester) async {
      final auth = FakeFirebaseAuth();
      await tester.pumpWidget(_wrap(const LoginScreen(), auth));
      await tester.pump();

      await tester.ensureVisible(find.text('Continue as guest'));
      await tester.tap(find.text('Continue as guest'));
      await tester.pump();

      expect(auth.anonymousSignIns, 1);
    });

    testWidgets('create-account link flips the form into sign-up mode',
        (tester) async {
      await tester.pumpWidget(_wrap(const LoginScreen(), FakeFirebaseAuth()));
      await tester.pump();

      await tester.ensureVisible(find.textContaining('New to'));
      await tester.tap(find.textContaining('New to'));
      await tester.pump();

      expect(find.text('GET STARTED'), findsOneWidget);
      expect(find.text('Create account'), findsOneWidget);
    });

    testWidgets(
        'keyboard-open compact viewport remains scrollable without overflow',
        (tester) async {
      tester.view.physicalSize = const Size(390, 520);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_wrap(const LoginScreen(), FakeFirebaseAuth()));
      await tester.pump();
      await tester.showKeyboard(find.byType(EditableText).first);
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.byType(SingleChildScrollView), findsOneWidget);
      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, -300),
      );
      await tester.pump();
      expect(find.text('Continue as guest'), findsOneWidget);
    });
  });

  group('LoadingScreen', () {
    testWidgets('progress bar fill renders and stages clamp at READY',
        (tester) async {
      // Pin auth in the loading state so the splash never navigates away.
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            firebaseAuthProvider.overrideWithValue(FakeFirebaseAuth()),
            authStateProvider.overrideWith(
              (ref) => const Stream<User?>.empty(),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            darkTheme: AppTheme.dark(),
            themeMode: ThemeMode.dark,
            home: const LoadingScreen(),
          ),
        ),
      );
      await tester.pump();

      // Regression: the gradient fill was a childless DecoratedBox inside
      // AnimatedFractionallySizedBox and collapsed to zero height, so the
      // bar stayed empty while the percentage kept changing.
      final fill = find.byKey(const Key('loading-progress-fill'));
      expect(fill, findsOneWidget);
      expect(tester.getSize(fill).height, 4);
      expect(tester.getSize(fill).width, greaterThan(0));
      expect(find.text('18%'), findsOneWidget);

      await tester.pump(const Duration(milliseconds: 1150));
      expect(find.text('46%'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 1100));
      expect(find.text('74%'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 1100));
      expect(find.text('96%'), findsOneWidget);

      // Regression: stages wrapped around modulo back to 18%.
      await tester.pump(const Duration(milliseconds: 2500));
      expect(find.text('96%'), findsOneWidget);
      expect(find.text('READY'), findsOneWidget);
    });

    testWidgets('shows staged splash and routes signed-out users to login',
        (tester) async {
      final auth = FakeFirebaseAuth();
      final container = ProviderContainer(
        overrides: [firebaseAuthProvider.overrideWithValue(auth)],
      );
      addTearDown(container.dispose);
      final router = container.read(routerProvider);

      router.go(RoutePaths.loading);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            theme: AppTheme.light(),
            darkTheme: AppTheme.dark(),
            themeMode: ThemeMode.dark,
            routerConfig: router,
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(LoadingScreen), findsOneWidget);
      expect(find.text('SNAP · TRACK · STAY ON TARGET'), findsOneWidget);
      expect(find.text('SECURE · END-TO-END'), findsOneWidget);

      await tester.pump(const Duration(milliseconds: 1700));
      expect(find.byType(LoadingScreen), findsOneWidget);

      // Past the minimum splash beat the signed-out session lands on login.
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pump();

      expect(find.byType(LoginScreen), findsOneWidget);
    });

    testWidgets('signed-in session routes to scan after the minimum beat',
        (tester) async {
      final auth = FakeFirebaseAuth(user: FakeUser());
      final container = ProviderContainer(
        overrides: [
          firebaseAuthProvider.overrideWithValue(auth),
          authStateProvider.overrideWith(
            (ref) => Stream.value(FakeUser()),
          ),
        ],
      );
      addTearDown(container.dispose);
      final router = container.read(routerProvider);

      router.go(RoutePaths.loading);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            theme: AppTheme.light(),
            darkTheme: AppTheme.dark(),
            routerConfig: router,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1799));
      expect(find.byType(LoadingScreen), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 2));

      expect(router.routeInformationProvider.value.uri.path, RoutePaths.scan);
    });

    testWidgets('reduced motion settles without continuous splash tickers',
        (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            firebaseAuthProvider.overrideWithValue(FakeFirebaseAuth()),
            authStateProvider.overrideWith(
              (ref) => const Stream<User?>.empty(),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const MediaQuery(
              data: MediaQueryData(disableAnimations: true),
              child: LoadingScreen(),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 3500));
      await tester.pumpAndSettle();

      expect(find.text('READY'), findsOneWidget);
      expect(find.text('96%'), findsOneWidget);
      expect(tester.binding.hasScheduledFrame, isFalse);
    });
  });
}
