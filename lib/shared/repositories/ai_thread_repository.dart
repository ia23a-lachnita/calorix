import 'package:cloud_firestore/cloud_firestore.dart';

import '../../core/constants/app_constants.dart';
import '../models/ai_chat_thread.dart';

class AiMessageCursor {
  const AiMessageCursor(this.token);

  final Object token;
}

class AiMessagePage {
  const AiMessagePage({
    required this.messages,
    required this.nextCursor,
    required this.hasMore,
  });

  final List<AiChatMessage> messages;
  final AiMessageCursor? nextCursor;
  final bool hasMore;
}

abstract class AiThreadDataStore {
  Stream<List<AiChatThread>> watchThreads(String uid);

  Future<AiMessagePage> loadMessages(
    String uid,
    String threadId, {
    required int limit,
    AiMessageCursor? after,
  });

  Future<List<String>> listMessageIds(
    String uid,
    String threadId,
    String collection, {
    required int limit,
  });

  Future<void> deleteMessageBatch(
    String uid,
    String threadId,
    String collection,
    List<String> ids,
  );

  Future<void> deleteThreadDocument(String uid, String threadId);
}

class FirestoreAiThreadDataStore implements AiThreadDataStore {
  FirestoreAiThreadDataStore(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> _threads(String uid) => _firestore
      .collection(AppConstants.usersCollection)
      .doc(uid)
      .collection(AppConstants.aiThreadsSubCollection);

  @override
  Stream<List<AiChatThread>> watchThreads(String uid) => _threads(uid)
      .orderBy('updatedAt', descending: true)
      .orderBy(FieldPath.documentId, descending: true)
      .snapshots()
      .map(
        (snapshot) => snapshot.docs
            .map((document) => AiChatThread.fromFirestore(uid, document))
            .toList(growable: false),
      );

  @override
  Future<AiMessagePage> loadMessages(
    String uid,
    String threadId, {
    required int limit,
    AiMessageCursor? after,
  }) async {
    Query<Map<String, dynamic>> query = _threads(uid)
        .doc(threadId)
        .collection(AppConstants.aiMessagesSubCollection)
        .orderBy('createdAt', descending: true)
        .orderBy(FieldPath.documentId, descending: true)
        .limit(limit);
    final token = after?.token;
    if (token is DocumentSnapshot<Map<String, dynamic>>) {
      query = query.startAfterDocument(token);
    } else if (token != null) {
      throw ArgumentError.value(token, 'after', 'invalid Firestore cursor');
    }
    final snapshot = await query.get();
    final next = snapshot.docs.isNotEmpty && snapshot.docs.length == limit
        ? AiMessageCursor(snapshot.docs.last)
        : null;
    return AiMessagePage(
      messages: snapshot.docs
          .map(AiChatMessage.fromFirestore)
          .toList(growable: false),
      nextCursor: next,
      hasMore: next != null,
    );
  }

  @override
  Future<List<String>> listMessageIds(
    String uid,
    String threadId,
    String collection, {
    required int limit,
  }) async {
    final snapshot = await _threads(uid)
        .doc(threadId)
        .collection(collection)
        .orderBy(FieldPath.documentId)
        .limit(limit)
        .get();
    return snapshot.docs.map((document) => document.id).toList(growable: false);
  }

  @override
  Future<void> deleteMessageBatch(
    String uid,
    String threadId,
    String collection,
    List<String> ids,
  ) async {
    if (ids.isEmpty) return;
    if (ids.length > AiThreadRepository.deleteBatchSize) {
      throw ArgumentError.value(
          ids.length, 'ids', 'batch exceeds Firestore limit');
    }
    final batch = _firestore.batch();
    final messages = _threads(uid).doc(threadId).collection(collection);
    for (final id in ids) {
      batch.delete(messages.doc(id));
    }
    await batch.commit();
  }

  @override
  Future<void> deleteThreadDocument(String uid, String threadId) =>
      _threads(uid).doc(threadId).delete();
}

class AiThreadRepository {
  AiThreadRepository(FirebaseFirestore firestore)
      : this.withStore(FirestoreAiThreadDataStore(firestore));

  AiThreadRepository.withStore(this._store);

  static const int pageSize = 20;
  static const int deleteBatchSize = 500;

  final AiThreadDataStore _store;

  Stream<List<AiChatThread>> watchThreads(String uid) =>
      _store.watchThreads(uid).map((threads) {
        final sorted = List<AiChatThread>.of(threads)
          ..sort((a, b) {
            final byDate = b.updatedAt.compareTo(a.updatedAt);
            return byDate != 0 ? byDate : b.id.compareTo(a.id);
          });
        return List.unmodifiable(sorted);
      });

  Future<AiMessagePage> loadMessages(
    String uid,
    String threadId, {
    AiMessageCursor? after,
  }) =>
      _store.loadMessages(
        uid,
        threadId,
        limit: pageSize,
        after: after,
      );

  Future<void> deleteThread(String uid, String threadId) async {
    for (final collection in const [
      AppConstants.aiMessagesSubCollection,
      AppConstants.aiMessageArchiveSubCollection,
    ]) {
      while (true) {
        final ids = await _store.listMessageIds(
          uid,
          threadId,
          collection,
          limit: deleteBatchSize,
        );
        if (ids.isEmpty) break;
        await _store.deleteMessageBatch(uid, threadId, collection, ids);
      }
    }
    await _store.deleteThreadDocument(uid, threadId);
  }
}
