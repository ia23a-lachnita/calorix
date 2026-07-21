import 'package:cloud_firestore/cloud_firestore.dart';

typedef DocumentExistsReader = Future<bool> Function(String path);

abstract class EntryExistenceChecker {
  Future<bool> exists(String entryId);
}

class FirestoreEntryExistenceChecker implements EntryExistenceChecker {
  FirestoreEntryExistenceChecker({
    required String uid,
    DocumentExistsReader? readDocumentExists,
  })  : _uid = uid,
        _readDocumentExists = readDocumentExists ?? _firestoreRead;

  final String _uid;
  final DocumentExistsReader _readDocumentExists;

  static Future<bool> _firestoreRead(String path) async =>
      (await FirebaseFirestore.instance.doc(path).get()).exists;

  @override
  Future<bool> exists(String entryId) {
    if (_uid.isEmpty || entryId.isEmpty) return Future.value(false);
    return _readDocumentExists('users/$_uid/entries/$entryId');
  }
}
