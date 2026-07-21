import 'package:calorix/shared/services/entry_existence_checker.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('reads only the authenticated user entry path', () async {
    String? readPath;
    final checker = FirestoreEntryExistenceChecker(
      uid: 'user-a',
      readDocumentExists: (path) async {
        readPath = path;
        return true;
      },
    );

    expect(await checker.exists('entry-7'), isTrue);
    expect(readPath, 'users/user-a/entries/entry-7');
  });

  test('rejects empty IDs without reading Firestore', () async {
    var reads = 0;
    final checker = FirestoreEntryExistenceChecker(
      uid: 'user-a',
      readDocumentExists: (_) async {
        reads++;
        return true;
      },
    );

    expect(await checker.exists(''), isFalse);
    expect(reads, 0);
  });
}
