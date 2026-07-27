import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/time/clock.dart';
import '../../../core/time/clock_provider.dart';
import '../../../shared/models/ai_chat_thread.dart';
import '../../../shared/providers/auth_provider.dart';
import '../../../shared/services/ai_chat_service.dart';

enum MessageRole { user, ai }

enum ChatMessageStatus { complete, sending, failed }

enum ConfirmationStatus { pending, applying, applied, rejected, failed }

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.timestamp,
    this.action,
    this.status = ChatMessageStatus.complete,
    this.confirmationStatus = ConfirmationStatus.pending,
  });

  final String id;
  final MessageRole role;
  final String content;
  final AiAction? action;
  final DateTime timestamp;
  final ChatMessageStatus status;
  final ConfirmationStatus confirmationStatus;

  ChatMessage copyWith({
    AiAction? action,
    bool clearAction = false,
    ChatMessageStatus? status,
    ConfirmationStatus? confirmationStatus,
  }) =>
      ChatMessage(
        id: id,
        role: role,
        content: content,
        action: clearAction ? null : (action ?? this.action),
        timestamp: timestamp,
        status: status ?? this.status,
        confirmationStatus: confirmationStatus ?? this.confirmationStatus,
      );

  factory ChatMessage.fromPersisted(AiChatMessage message) => ChatMessage(
        id: message.id,
        role:
            message.role == AiChatRole.user ? MessageRole.user : MessageRole.ai,
        content: message.content,
        timestamp: message.createdAt,
        status: switch (message.status) {
          AiChatMessageStatus.processing => ChatMessageStatus.sending,
          AiChatMessageStatus.failed => ChatMessageStatus.failed,
          AiChatMessageStatus.complete => ChatMessageStatus.complete,
        },
        action: message.action == null
            ? null
            : AiAction.fromTargetAction(message.action!),
      );
}

class AiAction {
  const AiAction({
    required this.title,
    required this.field,
    required this.oldValue,
    required this.newValue,
    required this.delta,
    this.targetUpdate,
  });

  final String title;
  final String field;
  final String oldValue;
  final String newValue;
  final int delta;
  final Map<String, int>? targetUpdate;

  factory AiAction.fromService(AiChatServiceAction action) {
    final unit = action.macro == 'kcal' ? '' : 'g';
    return AiAction(
      title: 'Update ${action.field} target',
      field: action.field,
      oldValue: '${action.oldValue}$unit',
      newValue: '${action.newValue}$unit',
      delta: action.newValue - action.oldValue,
      targetUpdate: {action.macro: action.newValue},
    );
  }

  factory AiAction.fromTargetAction(AiChatTargetAction action) =>
      AiAction.fromService(
        AiChatServiceAction(
          field: action.field,
          macro: action.macro,
          oldValue: action.oldValue,
          newValue: action.newValue,
        ),
      );
}

class ChatMessagesNotifier extends StateNotifier<List<ChatMessage>> {
  ChatMessagesNotifier(this._clock) : super([_greeting(_clock.now())]);

  final Clock _clock;

  static ChatMessage _greeting(DateTime timestamp) => ChatMessage(
        id: 'local-greeting',
        role: MessageRole.ai,
        content:
            'Hi! I can help you plan your macros, adjust your goals, or fix any meal scans. What would you like to do?',
        timestamp: timestamp,
      );

  void loadInitial(List<AiChatMessage> messages) {
    state = messages.map(ChatMessage.fromPersisted).toList(growable: false);
  }

  void prependOlder(List<AiChatMessage> messages) {
    final existing = state.map((message) => message.id).toSet();
    state = [
      ...messages
          .where((message) => !existing.contains(message.id))
          .map(ChatMessage.fromPersisted),
      ...state,
    ];
  }

  void reset() => state = [_greeting(_clock.now())];

  void addUserMessage(String content, {required String clientMessageId}) {
    if (state.any((message) => message.id == clientMessageId)) {
      markSending(clientMessageId);
      return;
    }
    state = [
      ...state,
      ChatMessage(
        id: clientMessageId,
        role: MessageRole.user,
        content: content,
        timestamp: _clock.now(),
        status: ChatMessageStatus.sending,
      ),
    ];
  }

  void addAiMessage(String content, {AiAction? action, String? id}) {
    state = [
      ...state,
      ChatMessage(
        id: id ?? 'local-reply-${_clock.now().microsecondsSinceEpoch}',
        role: MessageRole.ai,
        content: content,
        action: action,
        timestamp: _clock.now(),
      ),
    ];
  }

  void markSending(String id) => _replace(
        id,
        (message) => message.copyWith(status: ChatMessageStatus.sending),
      );

  void markComplete(String id) => _replace(
        id,
        (message) => message.copyWith(status: ChatMessageStatus.complete),
      );

  void markFailed(String id) => _replace(
        id,
        (message) => message.copyWith(status: ChatMessageStatus.failed),
      );

  void setConfirmationStatus(String id, ConfirmationStatus status) => _replace(
        id,
        (message) => message.copyWith(confirmationStatus: status),
      );

  void clearAction(String id, ConfirmationStatus status) => _replace(
        id,
        (message) => message.copyWith(
          clearAction: true,
          confirmationStatus: status,
        ),
      );

  void _replace(
    String id,
    ChatMessage Function(ChatMessage message) update,
  ) {
    state = [
      for (final message in state)
        if (message.id == id) update(message) else message,
    ];
  }
}

final chatMessagesProvider =
    StateNotifierProvider<ChatMessagesNotifier, List<ChatMessage>>(
  (ref) => ChatMessagesNotifier(ref.watch(clockProvider)),
);

final isChatLoadingProvider = StateProvider<bool>((ref) => false);

final aiThreadsProvider = StreamProvider.autoDispose<List<AiChatThread>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value(const []);
  return ref.watch(aiThreadRepositoryProvider).watchThreads(uid);
});

final aiChatServiceProvider = Provider<AiChatService>((ref) {
  return AiChatService(
    FirebaseFunctions.instanceFor(region: AppConstants.functionsRegion),
  );
});
