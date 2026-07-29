import 'package:cloud_firestore/cloud_firestore.dart';

enum AiChatRole { user, assistant }

enum AiChatMessageStatus { processing, complete, failed }

/// Synchronized set of valid thread categories.
enum AiChatThreadCategory { meals, goals, scans, general }

const _defaultCategory = AiChatThreadCategory.general;

AiChatThreadCategory _parseCategory(Object? value) {
  if (value is String) {
    for (final c in AiChatThreadCategory.values) {
      if (c.name == value) return c;
    }
  }
  return _defaultCategory;
}

class AiChatTargetAction {
  const AiChatTargetAction({
    required this.field,
    required this.macro,
    required this.oldValue,
    required this.newValue,
  });

  final String field;
  final String macro;
  final int oldValue;
  final int newValue;

  factory AiChatTargetAction.fromMap(Map<String, dynamic> data) =>
      AiChatTargetAction(
        field: data['field'] as String? ?? 'Target',
        macro: data['macro'] as String? ?? '',
        oldValue: (data['old'] as num?)?.toInt() ?? 0,
        newValue: (data['new'] as num?)?.toInt() ?? 0,
      );
}

class AiChatMessage {
  const AiChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
    required this.status,
    this.action,
  });

  final String id;
  final AiChatRole role;
  final String content;
  final DateTime createdAt;
  final AiChatMessageStatus status;
  final AiChatTargetAction? action;

  factory AiChatMessage.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> document,
  ) =>
      AiChatMessage.fromMap(document.id, document.data() ?? const {});

  factory AiChatMessage.fromMap(String id, Map<String, dynamic> data) {
    final role = switch (data['role']) {
      'assistant' => AiChatRole.assistant,
      _ => AiChatRole.user,
    };
    final status = switch (data['status']) {
      'processing' => AiChatMessageStatus.processing,
      'failed' => AiChatMessageStatus.failed,
      _ => AiChatMessageStatus.complete,
    };
    final actionData = data['action'];
    return AiChatMessage(
      id: id,
      role: role,
      content: data['content'] as String? ?? '',
      createdAt: _dateValue(data['createdAt']),
      status: status,
      action: actionData is Map
          ? AiChatTargetAction.fromMap(
              Map<String, dynamic>.from(actionData),
            )
          : null,
    );
  }
}

class AiChatThread {
  const AiChatThread({
    required this.id,
    required this.uid,
    required this.createdAt,
    required this.updatedAt,
    this.linkedMealId,
    this.title,
    this.preview,
    this.pinned = false,
    this.category = _defaultCategory,
    this.unread = false,
    this.appliedActionCount = 0,
  });

  final String id;
  final String uid;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? linkedMealId;
  final String? title;
  final String? preview;
  final bool pinned;
  final AiChatThreadCategory category;
  final bool unread;
  final int appliedActionCount;

  factory AiChatThread.fromFirestore(
    String uid,
    DocumentSnapshot<Map<String, dynamic>> document,
  ) =>
      AiChatThread.fromMap(uid, document.id, document.data() ?? const {});

  factory AiChatThread.fromMap(
    String uid,
    String id,
    Map<String, dynamic> data,
  ) =>
      AiChatThread(
        id: id,
        uid: data['uid'] as String? ?? uid,
        createdAt: _dateValue(data['createdAt']),
        updatedAt: _dateValue(data['updatedAt']),
        linkedMealId: data['linkedMealId'] as String?,
        title: data['title'] as String?,
        preview: data['preview'] as String?,
        pinned: data['pinned'] as bool? ?? false,
        category: _parseCategory(data['category']),
        unread: data['unread'] as bool? ?? false,
        appliedActionCount: (data['appliedActionCount'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toMap() => {
        'uid': uid,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        if (linkedMealId != null) 'linkedMealId': linkedMealId,
        if (title != null) 'title': title,
        if (preview != null) 'preview': preview,
        'pinned': pinned,
        'category': category.name,
        'unread': unread,
        'appliedActionCount': appliedActionCount,
      };
}

DateTime _dateValue(Object? value) => switch (value) {
      Timestamp timestamp => timestamp.toDate(),
      DateTime date => date,
      String text =>
        DateTime.tryParse(text) ?? DateTime.fromMillisecondsSinceEpoch(0),
      _ => DateTime.fromMillisecondsSinceEpoch(0),
    };
