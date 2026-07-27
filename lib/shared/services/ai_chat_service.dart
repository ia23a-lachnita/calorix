import 'package:cloud_functions/cloud_functions.dart';

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

/// Client for the authenticated server-side assistant callable. Nutrition,
/// profile, recent meals, and prior turns are always loaded by the server.
class AiChatService {
  AiChatService(this._functions);

  final FirebaseFunctions _functions;

  Future<AiChatServiceResponse> sendMessage({
    required String message,
    required String clientMessageId,
    String? threadId,
    String? linkedMealId,
  }) async {
    final callable = _functions.httpsCallable('aiChat');
    final result = await callable.call<Object?>({
      'message': message,
      'clientMessageId': clientMessageId,
      if (threadId != null) 'threadId': threadId,
      if (linkedMealId != null) 'linkedMealId': linkedMealId,
    });
    final data = result.data;
    if (data is! Map) {
      throw const FormatException('Assistant returned an invalid response');
    }
    final returnedThreadId = data['threadId'];
    final reply = data['reply'];
    if (returnedThreadId is! String ||
        returnedThreadId.isEmpty ||
        reply is! String ||
        reply.trim().isEmpty) {
      throw const FormatException('Assistant returned an empty reply');
    }
    final actionData = data['action'];
    return AiChatServiceResponse(
      threadId: returnedThreadId,
      reply: reply,
      action: actionData is Map
          ? AiChatServiceAction.fromMap(actionData.cast<Object?, Object?>())
          : null,
    );
  }
}
