import 'dart:async';

import 'package:calorix/shared/models/ai_chat_thread.dart';
import 'package:calorix/shared/repositories/ai_thread_repository.dart';
import 'package:flutter_test/flutter_test.dart';

AiChatThread _thread(
  String id,
  DateTime updatedAt, {
  String? linkedMealId,
}) =>
    AiChatThread(
      id: id,
      uid: 'user-1',
      createdAt: updatedAt.subtract(const Duration(minutes: 5)),
      updatedAt: updatedAt,
      title: 'Thread $id',
      preview: 'Preview $id',
      linkedMealId: linkedMealId,
    );

AiChatMessage _message(int index) => AiChatMessage(
      id: 'm-$index',
      role: index.isEven ? AiChatRole.user : AiChatRole.assistant,
      content: 'Message $index',
      createdAt: DateTime.utc(2026, 7, 27, 12, 0, index),
      status: AiChatMessageStatus.complete,
    );

class _FakeThreadStore implements AiThreadDataStore {
  final threads = <AiChatThread>[];
  final activeIds = <String>[];
  final archiveIds = <String>[];
  final deletedBatches = <({String collection, List<String> ids})>[];
  bool parentDeleted = false;

  @override
  Stream<List<AiChatThread>> watchThreads(String uid) =>
      Stream.value(List.of(threads));

  @override
  Future<AiMessagePage> loadMessages(
    String uid,
    String threadId, {
    required int limit,
    AiMessageCursor? after,
  }) async {
    final offset = after?.token as int? ?? 0;
    final all = List.generate(45, _message).reversed.toList();
    final page = all.skip(offset).take(limit).toList();
    final nextOffset = offset + page.length;
    return AiMessagePage(
      messages: page,
      nextCursor: nextOffset < all.length ? AiMessageCursor(nextOffset) : null,
      hasMore: nextOffset < all.length,
    );
  }

  @override
  Future<List<String>> listMessageIds(
    String uid,
    String threadId,
    String collection, {
    required int limit,
  }) async {
    final source = collection == 'messages' ? activeIds : archiveIds;
    return source.take(limit).toList();
  }

  @override
  Future<void> deleteMessageBatch(
    String uid,
    String threadId,
    String collection,
    List<String> ids,
  ) async {
    deletedBatches.add((collection: collection, ids: List.of(ids)));
    final source = collection == 'messages' ? activeIds : archiveIds;
    source.removeWhere(ids.contains);
  }

  @override
  Future<void> deleteThreadDocument(String uid, String threadId) async {
    expect(activeIds, isEmpty);
    expect(archiveIds, isEmpty);
    parentDeleted = true;
  }
}

void main() {
  test('thread list is newest first with stable id tie-break and linked meal',
      () async {
    final store = _FakeThreadStore()
      ..threads.addAll([
        _thread('a', DateTime.utc(2026, 7, 27, 12)),
        _thread(
          'c',
          DateTime.utc(2026, 7, 27, 13),
          linkedMealId: 'meal-1',
        ),
        _thread('b', DateTime.utc(2026, 7, 27, 13)),
      ]);
    final repository = AiThreadRepository.withStore(store);

    final result = await repository.watchThreads('user-1').first;

    expect(result.map((thread) => thread.id), ['c', 'b', 'a']);
    expect(result.first.linkedMealId, 'meal-1');
  });

  test('messages page 20 at a time with an opaque older-page cursor', () async {
    final repository = AiThreadRepository.withStore(_FakeThreadStore());

    final first = await repository.loadMessages('user-1', 'thread-1');
    final second = await repository.loadMessages(
      'user-1',
      'thread-1',
      after: first.nextCursor,
    );
    final third = await repository.loadMessages(
      'user-1',
      'thread-1',
      after: second.nextCursor,
    );

    expect(first.messages, hasLength(20));
    expect(second.messages, hasLength(20));
    expect(third.messages, hasLength(5));
    expect(
        first.messages
            .map((message) => message.id)
            .toSet()
            .intersection(second.messages.map((message) => message.id).toSet()),
        isEmpty);
    expect(first.hasMore, isTrue);
    expect(third.hasMore, isFalse);
  });

  test('delete clears active and archive pages before the parent', () async {
    final store = _FakeThreadStore()
      ..activeIds.addAll(List.generate(620, (index) => 'm-$index'))
      ..archiveIds.addAll(List.generate(510, (index) => 'a-$index'));
    final repository = AiThreadRepository.withStore(store);

    await repository.deleteThread('user-1', 'thread-1');

    expect(store.parentDeleted, isTrue);
    expect(store.deletedBatches, hasLength(4));
    expect(
      store.deletedBatches.every((batch) => batch.ids.length <= 500),
      isTrue,
    );
    expect(
      store.deletedBatches.map((batch) => batch.collection),
      ['messages', 'messages', 'messageArchive', 'messageArchive'],
    );
  });

  test('model mapping tolerates Firestore-like dates and structured actions',
      () {
    final message = AiChatMessage.fromMap('reply-1', {
      'role': 'assistant',
      'content': 'Raise protein.',
      'createdAt': DateTime.utc(2026, 7, 27),
      'status': 'complete',
      'action': {
        'field': 'Protein',
        'macro': 'protein',
        'old': 170,
        'new': 190,
      },
    });

    expect(message.role, AiChatRole.assistant);
    expect(message.action?.macro, 'protein');
    expect(message.action?.newValue, 190);
  });
}
