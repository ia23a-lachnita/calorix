import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/services/gemini_service.dart';

enum MessageRole { user, ai }

class ChatMessage {
  final MessageRole role;
  final String content;
  final AiAction? action;
  final DateTime timestamp;

  const ChatMessage({
    required this.role,
    required this.content,
    this.action,
    required this.timestamp,
  });

  ChatMessage copyWith({AiAction? action, bool clearAction = false}) =>
      ChatMessage(
        role: role,
        content: content,
        action: clearAction ? null : (action ?? this.action),
        timestamp: timestamp,
      );
}

class AiAction {
  final String title;
  final String field;
  final String oldValue;
  final String newValue;
  final int delta;

  /// Machine-applicable target change, e.g. `{'protein': 190}`. Keys are
  /// `kcal`, `protein`, `carbs`, `fat`. Null when the action is advisory only.
  final Map<String, int>? targetUpdate;

  const AiAction({
    required this.title,
    required this.field,
    required this.oldValue,
    required this.newValue,
    required this.delta,
    this.targetUpdate,
  });
}

class ChatMessagesNotifier extends StateNotifier<List<ChatMessage>> {
  ChatMessagesNotifier()
      : super([
          ChatMessage(
            role: MessageRole.ai,
            content:
                'Hi! I can help you plan your macros, adjust your goals, or fix any meal scans. What would you like to do?',
            timestamp: DateTime.now(),
          ),
        ]);

  void addUserMessage(String content) {
    state = [
      ...state,
      ChatMessage(
          role: MessageRole.user, content: content, timestamp: DateTime.now())
    ];
  }

  void addAiMessage(String content, {AiAction? action}) {
    state = [
      ...state,
      ChatMessage(
          role: MessageRole.ai,
          content: content,
          action: action,
          timestamp: DateTime.now())
    ];
  }

  /// Clears the confirm-card action on the message at [index] once it has
  /// been applied or rejected.
  void clearActionAt(int index) {
    if (index < 0 || index >= state.length) return;
    final next = [...state];
    next[index] = next[index].copyWith(clearAction: true);
    state = next;
  }

  void clear() => state = [];
}

final chatMessagesProvider =
    StateNotifierProvider<ChatMessagesNotifier, List<ChatMessage>>(
        (ref) => ChatMessagesNotifier());

final isChatLoadingProvider = StateProvider<bool>((ref) => false);

/// Gemini API key is injected at build time and never committed:
/// `flutter run --dart-define=GEMINI_API_KEY=...`
const _geminiApiKey = String.fromEnvironment('GEMINI_API_KEY');

final geminiServiceProvider = Provider<GeminiService>((ref) {
  return GeminiService(_geminiApiKey);
});

final geminiConfiguredProvider = Provider<bool>((ref) => _geminiApiKey.isNotEmpty);
