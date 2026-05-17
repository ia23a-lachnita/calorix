import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
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
