import 'package:flutter_riverpod/flutter_riverpod.dart';

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
}

class AiAction {
  final String title;
  final String field;
  final String oldValue;
  final String newValue;
  final int delta;

  const AiAction({
    required this.title,
    required this.field,
    required this.oldValue,
    required this.newValue,
    required this.delta,
  });
}

class ChatMessagesNotifier extends StateNotifier<List<ChatMessage>> {
  ChatMessagesNotifier() : super([
    ChatMessage(
      role: MessageRole.ai,
      content: 'Hi! I can help you plan your macros, adjust your goals, or fix any meal scans. What would you like to do?',
      timestamp: DateTime.now(),
    ),
  ]);

  void addUserMessage(String content) {
    state = [...state, ChatMessage(role: MessageRole.user, content: content, timestamp: DateTime.now())];
  }

  void addAiMessage(String content, {AiAction? action}) {
    state = [...state, ChatMessage(role: MessageRole.ai, content: content, action: action, timestamp: DateTime.now())];
  }

  void clear() => state = [];
}

final chatMessagesProvider =
    StateNotifierProvider<ChatMessagesNotifier, List<ChatMessage>>(
        (ref) => ChatMessagesNotifier());

final isChatLoadingProvider = StateProvider<bool>((ref) => false);
