import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../repositories/food_entry_repository.dart';
import '../repositories/macro_target_repository.dart';

final firebaseAuthProvider = Provider<FirebaseAuth>((ref) => FirebaseAuth.instance);

final firestoreProvider = Provider<FirebaseFirestore>((ref) => FirebaseFirestore.instance);

final foodEntryRepositoryProvider = Provider<FoodEntryRepository>(
  (ref) => FoodEntryRepository(ref.watch(firestoreProvider)),
);

final macroTargetRepositoryProvider = Provider<MacroTargetRepository>(
  (ref) => MacroTargetRepository(ref.watch(firestoreProvider)),
);

final authStateProvider = StreamProvider<User?>((ref) {
  return ref.watch(firebaseAuthProvider).authStateChanges();
});

final currentUidProvider = Provider<String?>((ref) {
  return ref.watch(authStateProvider).valueOrNull?.uid;
});

final signInAnonymouslyProvider = FutureProvider<void>((ref) async {
  final auth = ref.watch(firebaseAuthProvider);
  if (auth.currentUser == null) {
    await auth.signInAnonymously();
  }
});

bool _googleSignInInitialized = false;

/// Upgrades the current (anonymous) account to a permanent Google account via
/// `linkWithCredential`. Requires a configured OAuth client
/// (`flutterfire configure` / `google-services.json`).
Future<void> linkWithGoogle(FirebaseAuth auth) async {
  final user = auth.currentUser;
  if (user == null) {
    throw FirebaseAuthException(
        code: 'no-current-user', message: 'You are not signed in.');
  }

  final signIn = GoogleSignIn.instance;
  if (!_googleSignInInitialized) {
    await signIn.initialize();
    _googleSignInInitialized = true;
  }

  final account = await signIn.authenticate();
  final idToken = account.authentication.idToken;
  final credential = GoogleAuthProvider.credential(idToken: idToken);

  await user.linkWithCredential(credential);
}
