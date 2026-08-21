import 'dart:async';

import 'package:calorix/core/router/route_names.dart';
import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/services/ai_chat_service.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

class _RecordingAiChatService implements AiChatService {
  _RecordingAiChatService(this._send);

  final Future<AiChatServiceResponse> Function({
    required String message,
    required String clientMessageId,
  }) _send;

  final calls = <({String message, String clientMessageId})>[];

  @override
  Future<AiChatServiceResponse> sendMessage({
    required String message,
    required String clientMessageId,
    String? threadId,
    String? linkedMealId,
  }) async {
    calls.add((message: message, clientMessageId: clientMessageId));
    return _send(message: message, clientMessageId: clientMessageId);
  }
}

Widget _app(AiChatService service, {String uid = 'anonymous-uid'}) {
  return ProviderScope(
    overrides: [
      aiChatServiceProvider.overrideWithValue(service),
      currentUidProvider.overrideWithValue(uid),
    ],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: RoutePaths.aiChat,
        routes: [
          GoRoute(
            path: RoutePaths.aiChat,
            name: RouteNames.aiChat,
            builder: (_, __) => const AiChatScreen(),
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
      ),
    ),
  );
}

Future<void> _send(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField), text);
  await tester.tap(find.byIcon(Icons.arrow_upward));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

String _visibleText(WidgetTester tester) {
  final buffer = StringBuffer();
  for (final widget in tester.allWidgets) {
    if (widget is Text) {
      buffer.writeln(widget.data ?? widget.textSpan?.toPlainText() ?? '');
    } else if (widget is RichText) {
      buffer.writeln(widget.text.toPlainText());
    }
  }
  return buffer.toString();
}

void main() {
  test(
    'unavailable FirebaseFunctionsException maps to retryable AiChatFailure',
    () async {
      const clientMessageId = 'client-unavailable-1';
      const secret = 'GEMINI_API_KEY=secret123';
      final service = AiChatService.withInvoker((_) async {
        throw FirebaseFunctionsException(
          code: 'unavailable',
          message: 'Provider internal error: $secret project=my-project',
          details: const <String, Object?>{
            'provider': 'vertex',
            'rawError': 'quota exceeded',
          },
        );
      });

      try {
        await service.sendMessage(
          message: 'hello',
          clientMessageId: clientMessageId,
        );
        fail('Expected AiChatFailure');
      } on AiChatFailure catch (failure) {
        expect(failure.category, 'provider_unavailable');
        expect(failure.retryable, isTrue);
        expect(
          failure.userMessage,
          'The assistant is temporarily unavailable. Please try again.',
        );
        expect(failure.correlationId, clientMessageId);
        expect(failure.userMessage, isNot(contains(secret)));
        expect(failure.userMessage, isNot(contains('GEMINI_API_KEY')));
        expect('$failure', isNot(contains(secret)));
        expect('$failure', isNot(contains('vertex')));
      }
    },
  );

  test(
    'invalid-argument is nonretryable; safe correlation is kept and unsafe falls back',
    () async {
      const clientMessageId = 'client-invalid-1';
      const safeCorrelationId = 'safe-correlation-abc123';

      final safeService = AiChatService.withInvoker((_) async {
        throw FirebaseFunctionsException(
          code: 'invalid-argument',
          message: 'clientMessageId: must be a safe document identifier',
          details: const <String, Object?>{'correlationId': safeCorrelationId},
        );
      });

      try {
        await safeService.sendMessage(
          message: 'hello',
          clientMessageId: clientMessageId,
        );
        fail('Expected AiChatFailure');
      } on AiChatFailure catch (failure) {
        expect(failure.category, 'invalid_request');
        expect(failure.retryable, isFalse);
        expect(failure.correlationId, safeCorrelationId);
      }

      final unsafeService = AiChatService.withInvoker((_) async {
        throw FirebaseFunctionsException(
          code: 'invalid-argument',
          message: 'invalid input',
          details: const <String, Object?>{'correlationId': '../unsafe-id'},
        );
      });

      try {
        await unsafeService.sendMessage(
          message: 'hello',
          clientMessageId: clientMessageId,
        );
        fail('Expected AiChatFailure');
      } on AiChatFailure catch (failure) {
        expect(failure.retryable, isFalse);
        expect(failure.correlationId, clientMessageId);
        expect(failure.correlationId, isNot(contains('../')));
      }
    },
  );

  test(
    'malformed or empty callable data maps to nonretryable protocol_error',
    () async {
      const clientMessageId = 'client-protocol-1';

      Future<void> expectProtocolFailure(Object? data) async {
        final service = AiChatService.withInvoker((_) async => data);
        try {
          await service.sendMessage(
            message: 'hello',
            clientMessageId: clientMessageId,
          );
          fail('Expected AiChatFailure');
        } on AiChatFailure catch (failure) {
          expect(failure.category, 'protocol_error');
          expect(failure.retryable, isFalse);
          expect(failure.correlationId, clientMessageId);
          expect(
            failure.userMessage,
            'The assistant returned an invalid response. Please try again.',
          );
          expect(failure.userMessage, isNot(contains('FormatException')));
          expect('$failure', isNot(contains('FormatException')));
        }
      }

      await expectProtocolFailure(null);
      await expectProtocolFailure(<String, Object?>{});
      await expectProtocolFailure(<String, Object?>{
        'threadId': '',
        'reply': '',
      });
    },
  );

  testWidgets(
    'retry reuses the generated id and message, clears stale diagnostic, then succeeds',
    (tester) async {
      const typedMessage = 'Keep this prompt on retry';
      const diagnostic =
          'The assistant is temporarily unavailable. Please try again.';
      const reply = 'Recovered on retry';
      final retry = Completer<AiChatServiceResponse>();
      var attempts = 0;
      final service = _RecordingAiChatService(({
        required message,
        required clientMessageId,
      }) async {
        attempts++;
        if (attempts == 1) {
          throw AiChatFailure(
            category: 'provider_unavailable',
            retryable: true,
            userMessage: diagnostic,
            correlationId: clientMessageId,
          );
        }
        return retry.future;
      });

      await tester.pumpWidget(_app(service));
      await tester.pump();
      await _send(tester, typedMessage);

      expect(service.calls, hasLength(1));
      final generatedId = service.calls.first.clientMessageId;
      expect(generatedId, isNotEmpty);
      expect(service.calls.first.message, typedMessage);
      expect(find.text(diagnostic), findsOneWidget);
      expect(find.textContaining('Reference ID'), findsOneWidget);

      final retryFinder = find.byKey(ValueKey('ai-retry-$generatedId'));
      expect(retryFinder, findsOneWidget);

      try {
        await tester.ensureVisible(retryFinder);
        await tester.pump();
        await tester.tap(retryFinder);
        await tester.pump();

        expect(service.calls, hasLength(2));
        expect(service.calls[1].clientMessageId, generatedId);
        expect(service.calls[1].message, typedMessage);
        expect(find.text(typedMessage), findsOneWidget);
        expect(find.text(diagnostic), findsNothing);
        expect(find.textContaining('Reference ID'), findsNothing);

        retry.complete(
          const AiChatServiceResponse(threadId: 'thread-1', reply: reply),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));

        expect(find.text(reply), findsOneWidget);
        expect(find.text('Retry'), findsNothing);
      } finally {
        if (!retry.isCompleted) {
          retry.complete(
            const AiChatServiceResponse(threadId: 'thread-1', reply: ''),
          );
        }
      }
    },
  );

  testWidgets(
    'anonymous retryable failure shows sanitized diagnostic and Retry without secrets or signup language',
    (tester) async {
      const diagnostic =
          'The assistant is temporarily unavailable. Please try again.';
      final service = _RecordingAiChatService(({
        required message,
        required clientMessageId,
      }) async {
        throw AiChatFailure(
          category: 'provider_unavailable',
          retryable: true,
          userMessage: diagnostic,
          correlationId: clientMessageId,
        );
      });

      await tester.pumpWidget(_app(service, uid: 'anonymous-uid'));
      await tester.pump();
      await _send(tester, 'Hello');

      expect(find.text(diagnostic), findsOneWidget);
      expect(find.textContaining('Reference ID'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);

      final visible = _visibleText(tester);
      expect(visible, isNot(contains('GEMINI_API_KEY')));
      expect(visible, isNot(contains('secret123')));
      expect(visible, isNot(contains('vertex')));
      final lower = visible.toLowerCase();
      expect(lower, isNot(contains('sign-in')));
      expect(lower, isNot(contains('sign in')));
      expect(lower, isNot(contains('signin')));
      expect(lower, isNot(contains('login')));
      expect(lower, isNot(contains('signup')));
      expect(lower, isNot(contains('sign up')));
    },
  );

  test(
    'valid threadId/reply with malformed nested action types maps to protocol_error',
    () async {
      const clientMessageId = 'client-malformed-action-1';

      Future<void> expectProtocolFailureForAction(Object? actionData) async {
        final service =
            AiChatService.withInvoker((_) async => <String, Object?>{
                  'threadId': 'thread-1',
                  'reply': 'Here is my recommendation.',
                  if (actionData != null) 'action': actionData,
                });
        try {
          await service.sendMessage(
            message: 'hello',
            clientMessageId: clientMessageId,
          );
          fail('Expected AiChatFailure');
        } on AiChatFailure catch (failure) {
          expect(failure.category, 'protocol_error');
          expect(failure.retryable, isFalse);
          expect(failure.correlationId, clientMessageId);
          expect(
            failure.userMessage,
            'The assistant returned an invalid response. Please try again.',
          );
        }
      }

      // old/new as Strings instead of ints
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'Protein',
        'macro': 'protein',
        'old': 'not-a-number',
        'new': 190,
      });

      // macro not in enum set
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'Protein',
        'macro': 'admin',
        'old': 170,
        'new': 190,
      });

      // field missing
      await expectProtocolFailureForAction(<String, Object?>{
        'macro': 'protein',
        'old': 170,
        'new': 190,
      });

      // non-integer num (float) rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'Protein',
        'macro': 'protein',
        'old': 1.5,
        'new': 190,
      });

      // NaN rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'Protein',
        'macro': 'protein',
        'old': double.nan,
        'new': 190,
      });

      // Infinity rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'Protein',
        'macro': 'protein',
        'old': double.infinity,
        'new': 190,
      });

      // old negative rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'Protein',
        'macro': 'protein',
        'old': -1,
        'new': 190,
      });

      // old > 20000 rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'Protein',
        'macro': 'protein',
        'old': 20001,
        'new': 190,
      });

      // new <= 0 rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'Protein',
        'macro': 'protein',
        'old': 170,
        'new': 0,
      });

      // new > 20000 rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'Protein',
        'macro': 'protein',
        'old': 170,
        'new': 20001,
      });

      // non-kcal macro grams > 2000 rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'Protein',
        'macro': 'protein',
        'old': 170,
        'new': 2001,
      });

      // empty field rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': '',
        'macro': 'protein',
        'old': 170,
        'new': 190,
      });

      // whitespace-only field rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': '   ',
        'macro': 'protein',
        'old': 170,
        'new': 190,
      });

      // field > 40 chars rejected
      await expectProtocolFailureForAction(<String, Object?>{
        'field': 'a' * 41,
        'macro': 'protein',
        'old': 170,
        'new': 190,
      });
    },
  );

  testWidgets(
    'nonretryable failure shows diagnostic and reference without Retry',
    (tester) async {
      const diagnostic = 'The request was invalid. Please check your message.';
      final service = _RecordingAiChatService(({
        required message,
        required clientMessageId,
      }) async {
        throw AiChatFailure(
          category: 'invalid_request',
          retryable: false,
          userMessage: diagnostic,
          correlationId: clientMessageId,
        );
      });

      await tester.pumpWidget(_app(service, uid: 'anonymous-uid'));
      await tester.pump();
      await _send(tester, 'Hello');

      expect(find.text(diagnostic), findsOneWidget);
      expect(find.textContaining('Reference ID'), findsOneWidget);
      expect(find.text('Retry'), findsNothing);
    },
  );
}
