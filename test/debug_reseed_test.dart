import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:calorix/core/router/app_router.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';

class FakeUserCredential extends Fake implements UserCredential {}

/// Signed-out fake: signInAnonymously resolves but leaves currentUser null so
/// the reseed screen skips Firestore seeding (not under test here).
class FakeFirebaseAuth extends Fake implements FirebaseAuth {
  @override
  User? get currentUser => null;

  @override
  Stream<User?> authStateChanges() => const Stream.empty();

  @override
  Future<UserCredential> signInAnonymously() async => FakeUserCredential();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
      'Debug reseed screen sets ui-diff mode and edge-to-edge system UI',
      (tester) async {
    final log = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (methodCall) async {
      log.add(methodCall);
      return null;
    });

    final container = ProviderContainer(
      overrides: [
        firebaseAuthProvider.overrideWithValue(FakeFirebaseAuth()),
      ],
    );

    final router = container.read(routerProvider);
    router.go('/debug/reseed');

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(
          routerConfig: router,
        ),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(container.read(uiDiffModeProvider), isTrue);

    final systemUiModeCall = log
        .where((call) => call.method == 'SystemChrome.setEnabledSystemUIMode')
        .lastOrNull;

    expect(systemUiModeCall, isNotNull,
        reason: 'Expected SystemChrome.setEnabledSystemUIMode call');
    expect(systemUiModeCall!.arguments, contains('SystemUiMode.edgeToEdge'));
  });
}
