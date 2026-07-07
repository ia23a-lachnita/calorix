import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:calorix/core/router/app_router.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/onboarding/loading_screen.dart';
import 'package:calorix/features/onboarding/login_screen.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

class FakeUserCredential extends Fake implements UserCredential {}

class FakeFirebaseAuth extends Fake implements FirebaseAuth {
  final _controller = StreamController<User?>.broadcast();
  int anonymousSignIns = 0;

  @override
  User? get currentUser => null;

  @override
  Stream<User?> authStateChanges() async* {
    yield null;
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
      testWidgets('renders handoff structure in ${dark ? 'dark' : 'light'} mode',
          (tester) async {
        await tester.pumpWidget(_wrap(const LoginScreen(), FakeFirebaseAuth(),
            dark: dark));
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

    testWidgets('rejects invalid email before calling Firebase', (tester) async {
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
  });

  group('LoadingScreen', () {
    testWidgets('shows staged splash and routes signed-out users to login',
        (tester) async {
      final auth = FakeFirebaseAuth();
      final container = ProviderContainer(
        overrides: [firebaseAuthProvider.overrideWithValue(auth)],
      );
      addTearDown(container.dispose);
      final router = container.read(routerProvider);

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

      // Past the minimum splash beat the signed-out session lands on login.
      await tester.pump(const Duration(milliseconds: 1900));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(LoginScreen), findsOneWidget);
    });
  });
}
