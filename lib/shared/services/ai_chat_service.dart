import 'package:cloud_functions/cloud_functions.dart';

/// One prior conversation turn sent to the assistant callable.
typedef AiChatTurn = ({String role, String text});

/// Client for the server-side `aiChat` callable. The app never holds a model
/// credential; the function reads the model name from Firestore config and
/// runs Vertex AI with its service account.
class AiChatService {
  AiChatService(this._functions);

  final FirebaseFunctions _functions;

  Future<String> sendMessage({
    required String message,
    required List<AiChatTurn> history,
    required Map<String, Object?> plan,
    required Map<String, Object?> consumed,
  }) async {
    final callable = _functions.httpsCallable('aiChat');
    final result = await callable.call<Object?>({
      'message': message,
      'history': [
        for (final turn in history) {'role': turn.role, 'text': turn.text},
      ],
      'plan': plan,
      'consumed': consumed,
    });
    final data = result.data;
    final reply = data is Map ? data['reply'] : null;
    if (reply is! String || reply.trim().isEmpty) {
      throw const FormatException('Assistant returned an empty reply');
    }
    return reply;
  }
}
