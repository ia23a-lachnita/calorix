enum ProcessingPhase {
  localUploading,
  localError,
  firestorePending,
  firestoreProcessing,
  firestoreComplete,
  firestoreError,
}

class ProcessingState {
  const ProcessingState({
    required this.phase,
    this.progress,
    this.errorMessage,
  });

  final ProcessingPhase phase;
  final double? progress;
  final String? errorMessage;
}

/// Pure state combiner: merges local queue state and Firestore phase into a
/// single [ProcessingState]. Firestore phases take precedence once a
/// Firestore document exists; local phases are shown while the entry is
/// still in the local upload queue.
ProcessingState combineProcessingState({
  required UploadQueueEntry? localEntry,
  ProcessingPhase? localPhase,
  double? localProgress,
  ProcessingPhase? firestorePhase,
}) {
  if (firestorePhase != null) {
    return ProcessingState(phase: firestorePhase);
  }

  if (localEntry != null && localPhase != null) {
    return ProcessingState(
      phase: localPhase,
      progress: localProgress,
      errorMessage: localEntry.lastError,
    );
  }

  return const ProcessingState(phase: ProcessingPhase.localUploading);
}

class UploadQueueEntry {
  const UploadQueueEntry({
    required this.queueId,
    required this.entryId,
    required this.imagePath,
    required this.createdAt,
    this.retryCount = 0,
    this.lastError,
    this.nextRetryAt,
    this.autoRetryDisabled = false,
    this.uid,
    this.scanMode,
    this.storagePath,
  });

  final String queueId;
  final String entryId;
  final String imagePath;
  final DateTime createdAt;
  final int retryCount;
  final String? lastError;
  final DateTime? nextRetryAt;
  final bool autoRetryDisabled;
  final String? uid;
  final String? scanMode;
  final String? storagePath;

  UploadQueueEntry copyWith({
    int? retryCount,
    String? lastError,
    DateTime? nextRetryAt,
    bool? autoRetryDisabled,
    String? imagePath,
    bool clearLastError = false,
    bool clearNextRetryAt = false,
    String? uid,
    String? scanMode,
    String? storagePath,
  }) {
    return UploadQueueEntry(
      queueId: queueId,
      entryId: entryId,
      imagePath: imagePath ?? this.imagePath,
      createdAt: createdAt,
      retryCount: retryCount ?? this.retryCount,
      lastError: clearLastError ? null : lastError ?? this.lastError,
      nextRetryAt: clearNextRetryAt ? null : nextRetryAt ?? this.nextRetryAt,
      autoRetryDisabled: autoRetryDisabled ?? this.autoRetryDisabled,
      uid: uid ?? this.uid,
      scanMode: scanMode ?? this.scanMode,
      storagePath: storagePath ?? this.storagePath,
    );
  }

  Map<String, Object?> toJson() => {
        'queueId': queueId,
        'entryId': entryId,
        'imagePath': imagePath,
        'createdAt': createdAt.toIso8601String(),
        'retryCount': retryCount,
        'lastError': lastError,
        'nextRetryAt': nextRetryAt?.toIso8601String(),
        'autoRetryDisabled': autoRetryDisabled,
        'uid': uid,
        'scanMode': scanMode,
        'storagePath': storagePath,
      };

  factory UploadQueueEntry.fromJson(Map<String, Object?> json) {
    return UploadQueueEntry(
      queueId: json['queueId'] as String,
      entryId: json['entryId'] as String,
      imagePath: json['imagePath'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      retryCount: (json['retryCount'] as num?)?.toInt() ?? 0,
      lastError: json['lastError'] as String?,
      nextRetryAt: json['nextRetryAt'] != null
          ? DateTime.parse(json['nextRetryAt'] as String)
          : null,
      autoRetryDisabled: json['autoRetryDisabled'] as bool? ?? false,
      uid: json['uid'] as String?,
      scanMode: json['scanMode'] as String?,
      storagePath: json['storagePath'] as String?,
    );
  }
}
