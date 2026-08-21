import 'package:cloud_functions/cloud_functions.dart';

typedef AiChatCallableInvoker = Future<Object?> Function(Map<String, Object?>);

class AiChatServiceAction {
  const AiChatServiceAction({
    required this.field,
    required this.macro,
    required this.oldValue,
    required this.newValue,
  });

  final String field;
  final String macro;
  final int oldValue;
  final int newValue;

  factory AiChatServiceAction.fromMap(Map<Object?, Object?> data) =>
      AiChatServiceAction(
        field: data['field'] as String? ?? 'Target',
        macro: data['macro'] as String? ?? '',
        oldValue: (data['old'] as num?)?.toInt() ?? 0,
        newValue: (data['new'] as num?)?.toInt() ?? 0,
      );
}

class AiChatServiceResponse {
  const AiChatServiceResponse({
    required this.threadId,
    required this.reply,
    this.action,
  });

  final String threadId;
  final String reply;
  final AiChatServiceAction? action;
}

class AiChatFailure implements Exception {
  const AiChatFailure({
    required this.category,
    required this.retryable,
    required this.userMessage,
    required this.correlationId,
  });

  final String category;
  final bool retryable;
  final String userMessage;
  final String correlationId;

  @override
  String toString() =>
      'AiChatFailure(category: $category, retryable: $retryable, '
      'userMessage: $userMessage, correlationId: $correlationId)';
}

/// Client for the authenticated server-side assistant callable. Nutrition,
/// profile, recent meals, and prior turns are always loaded by the server.
class AiChatService {
  AiChatService(this._functions) : _invoker = null;

  AiChatService.withInvoker(AiChatCallableInvoker invoker)
      : _functions = null,
        _invoker = invoker;

  final FirebaseFunctions? _functions;
  final AiChatCallableInvoker? _invoker;

  Future<AiChatServiceResponse> sendMessage({
    required String message,
    required String clientMessageId,
    String? threadId,
    String? linkedMealId,
  }) async {
    final data = <String, Object?>{
      'message': message,
      'clientMessageId': clientMessageId,
      if (threadId != null) 'threadId': threadId,
      if (linkedMealId != null) 'linkedMealId': linkedMealId,
    };

    final resultData = await _callCallable(data);

    if (resultData is! Map) {
      throw AiChatFailure(
        category: 'protocol_error',
        retryable: false,
        userMessage:
            'The assistant returned an invalid response. Please try again.',
        correlationId: clientMessageId,
      );
    }

    final returnedThreadId = resultData['threadId'];
    final reply = resultData['reply'];
    if (returnedThreadId is! String ||
        returnedThreadId.isEmpty ||
        reply is! String ||
        reply.trim().isEmpty) {
      throw AiChatFailure(
        category: 'protocol_error',
        retryable: false,
        userMessage:
            'The assistant returned an invalid response. Please try again.',
        correlationId: clientMessageId,
      );
    }

    final actionData = resultData['action'];
    return AiChatServiceResponse(
      threadId: returnedThreadId,
      reply: reply,
      action: actionData is Map
          ? AiChatServiceAction.fromMap(actionData.cast<Object?, Object?>())
          : null,
    );
  }

  Future<Object?> _callCallable(Map<String, Object?> data) async {
    try {
      if (_invoker != null) {
        return await _invoker(data);
      }
      final callable = _functions!.httpsCallable('aiChat');
      final result = await callable.call<Object?>(data);
      return result.data;
    } on AiChatFailure {
      rethrow;
    } on FirebaseFunctionsException catch (e) {
      throw _mapFunctionsException(e, data['clientMessageId'] as String);
    } catch (e) {
      throw AiChatFailure(
        category: 'unknown',
        retryable: false,
        userMessage: 'An unexpected error occurred. Please try again.',
        correlationId: data['clientMessageId'] as String,
      );
    }
  }

  AiChatFailure _mapFunctionsException(
    FirebaseFunctionsException e,
    String clientMessageId,
  ) {
    final details = e.details;
    String correlationId = clientMessageId;
    if (details is Map && details['correlationId'] is String) {
      final candidate = details['correlationId'] as String;
      if (_isSafeCorrelationId(candidate)) {
        correlationId = candidate;
      }
    }

    switch (e.code) {
      case 'unavailable':
        return AiChatFailure(
          category: 'provider_unavailable',
          retryable: true,
          userMessage:
              'The assistant is temporarily unavailable. Please try again.',
          correlationId: correlationId,
        );
      case 'internal':
      case 'deadline-exceeded':
      case 'resource-exhausted':
      case 'aborted':
        return AiChatFailure(
          category: 'provider_unavailable',
          retryable: true,
          userMessage:
              'The assistant is temporarily unavailable. Please try again.',
          correlationId: correlationId,
        );
      case 'invalid-argument':
        return AiChatFailure(
          category: 'invalid_request',
          retryable: false,
          userMessage: 'The request was invalid. Please check your message.',
          correlationId: correlationId,
        );
      case 'not-found':
      case 'failed-precondition':
      case 'permission-denied':
      case 'unauthenticated':
        return AiChatFailure(
          category: 'invalid_request',
          retryable: false,
          userMessage: 'The request was invalid. Please check your message.',
          correlationId: correlationId,
        );
      default:
        return AiChatFailure(
          category: 'unknown',
          retryable: false,
          userMessage: 'An unexpected error occurred. Please try again.',
          correlationId: correlationId,
        );
    }
  }

  bool _isSafeCorrelationId(String candidate) {
    return RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(candidate);
  }
}
