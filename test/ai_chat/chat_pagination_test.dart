import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/shared/models/ai_chat_thread.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/repositories/ai_thread_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

AiChatMessage _message(String id, DateTime createdAt) => AiChatMessage(
      id: id,
      role: id.startsWith('user') ? AiChatRole.user : AiChatRole.assistant,
      content: id,
      createdAt: createdAt,
      status: AiChatMessageStatus.complete,
    );

class _PagedStore implements AiThreadDataStore {
  int loadCount = 0;

  @override
  Future<AiMessagePage> loadMessages(
    String uid,
    String threadId, {
    required int limit,
    AiMessageCursor? after,
  }) async {
    loadCount++;
    if (after == null) {
      final messages = List.generate(
        20,
        (index) => _message(
          'recent-$index',
          DateTime.utc(2026, 7, 27, 12, 20 - index),
        ),
      );
      return AiMessagePage(
        messages: messages,
        nextCursor: const AiMessageCursor('older'),
        hasMore: true,
      );
    }
    return AiMessagePage(
      messages: [
        _message('oldest-message', DateTime.utc(2026, 7, 27, 11)),
      ],
      nextCursor: null,
      hasMore: false,
    );
  }

  @override
  Stream<List<AiChatThread>> watchThreads(String uid) => const Stream.empty();

  @override
  Future<List<String>> listMessageIds(
    String uid,
    String threadId,
    String collection, {
    required int limit,
  }) =>
      throw UnimplementedError();

  @override
  Future<void> deleteMessageBatch(
    String uid,
    String threadId,
    String collection,
    List<String> ids,
  ) =>
      throw UnimplementedError();

  @override
  Future<void> deleteThreadDocument(String uid, String threadId) =>
      throw UnimplementedError();
}

Widget _app(_PagedStore store) {
  final router = GoRouter(
    initialLocation: '/ai?threadId=thread-1',
    routes: [
      GoRoute(
        path: RoutePaths.aiChat,
        name: RouteNames.aiChat,
        builder: (_, state) => AiChatScreen(
          threadId: state.uri.queryParameters['threadId'],
        ),
      ),
      GoRoute(
        path: RoutePaths.scan,
        name: RouteNames.scan,
        builder: (_, __) => const Scaffold(body: Text('Scan')),
      ),
      GoRoute(
        path: RoutePaths.aiHistory,
        name: RouteNames.aiHistory,
        builder: (_, __) => const Scaffold(body: Text('History')),
      ),
    ],
  );
  return ProviderScope(
    overrides: [
      currentUidProvider.overrideWithValue('user-1'),
      aiThreadRepositoryProvider.overrideWithValue(
        AiThreadRepository.withStore(store),
      ),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

void main() {
  testWidgets(
      'opening a thread loads 20 and upward scroll loads older messages',
      (tester) async {
    final store = _PagedStore();
    await tester.pumpWidget(_app(store));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(store.loadCount, 1);
    expect(find.text('oldest-message'), findsNothing);

    await tester.fling(
      find.byType(ListView).first,
      const Offset(0, 1200),
      2500,
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(store.loadCount, 2);
    await tester.fling(
      find.byType(ListView).first,
      const Offset(0, 1200),
      2500,
    );
    await tester.pumpAndSettle();
    expect(find.text('oldest-message'), findsOneWidget);
  });
}
