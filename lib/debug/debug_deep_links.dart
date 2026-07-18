import 'package:flutter/foundation.dart';

enum DebugTargetAvailability { implemented, unimplemented }

class DebugScreenTarget {
  const DebugScreenTarget({
    required this.id,
    required this.route,
    required this.availability,
  });

  final String id;
  final String route;
  final DebugTargetAvailability availability;
}

const Map<String, DebugScreenTarget> kDebugScreenTargets = {
  'loading': DebugScreenTarget(
    id: 'loading',
    route: '/loading',
    availability: DebugTargetAvailability.implemented,
  ),
  'login': DebugScreenTarget(
    id: 'login',
    route: '/login',
    availability: DebugTargetAvailability.implemented,
  ),
  'permission': DebugScreenTarget(
    id: 'permission',
    route: '/debug/placeholder/permission',
    availability: DebugTargetAvailability.unimplemented,
  ),
  'scan_idle': DebugScreenTarget(
    id: 'scan_idle',
    route: '/scan',
    availability: DebugTargetAvailability.implemented,
  ),
  'scan_capturing': DebugScreenTarget(
    id: 'scan_capturing',
    route: '/debug/placeholder/scan_capturing',
    availability: DebugTargetAvailability.unimplemented,
  ),
  'processing': DebugScreenTarget(
    id: 'processing',
    route: '/debug/placeholder/processing',
    availability: DebugTargetAvailability.unimplemented,
  ),
  'review': DebugScreenTarget(
    id: 'review',
    route: '/debug/placeholder/review',
    availability: DebugTargetAvailability.unimplemented,
  ),
  'manual': DebugScreenTarget(
    id: 'manual',
    route: '/debug/placeholder/manual',
    availability: DebugTargetAvailability.unimplemented,
  ),
  'today': DebugScreenTarget(
    id: 'today',
    route: '/today',
    availability: DebugTargetAvailability.implemented,
  ),
  'today_empty': DebugScreenTarget(
    id: 'today_empty',
    route: '/debug/placeholder/today_empty',
    availability: DebugTargetAvailability.unimplemented,
  ),
  'food': DebugScreenTarget(
    id: 'food',
    route: '/today/food/ui_diff_fixture_today_chicken',
    availability: DebugTargetAvailability.implemented,
  ),
  'food_edit': DebugScreenTarget(
    id: 'food_edit',
    route: '/debug/placeholder/food_edit',
    availability: DebugTargetAvailability.unimplemented,
  ),
  'history_week': DebugScreenTarget(
    id: 'history_week',
    route: '/history',
    availability: DebugTargetAvailability.implemented,
  ),
  'history_month': DebugScreenTarget(
    id: 'history_month',
    route: '/debug/placeholder/history_month',
    availability: DebugTargetAvailability.unimplemented,
  ),
  'goals': DebugScreenTarget(
    id: 'goals',
    route: '/goals',
    availability: DebugTargetAvailability.implemented,
  ),
  'goals_select': DebugScreenTarget(
    id: 'goals_select',
    route: '/debug/placeholder/goals_select',
    availability: DebugTargetAvailability.unimplemented,
  ),
  'ai': DebugScreenTarget(
    id: 'ai',
    route: '/ai',
    availability: DebugTargetAvailability.implemented,
  ),
  'ai_history': DebugScreenTarget(
    id: 'ai_history',
    route: '/debug/placeholder/ai_history',
    availability: DebugTargetAvailability.unimplemented,
  ),
  'profile': DebugScreenTarget(
    id: 'profile',
    route: '/profile',
    availability: DebugTargetAvailability.implemented,
  ),
};

enum UiDiffCaptureTheme { dark, light }

enum UiDiffCaptureSignalKind { ready, blocked }

@immutable
class UiDiffCaptureSignal {
  const UiDiffCaptureSignal._({
    required this.kind,
    required this.nonce,
    required this.screenId,
    this.theme,
    this.fixtureHash,
    this.reason,
  });

  factory UiDiffCaptureSignal.ready({
    required String nonce,
    required String screenId,
    required UiDiffCaptureTheme theme,
    required String fixtureHash,
  }) =>
      UiDiffCaptureSignal._(
        kind: UiDiffCaptureSignalKind.ready,
        nonce: nonce,
        screenId: screenId,
        theme: theme,
        fixtureHash: fixtureHash,
      );

  factory UiDiffCaptureSignal.blocked({
    required String nonce,
    required String screenId,
    required String reason,
  }) =>
      UiDiffCaptureSignal._(
        kind: UiDiffCaptureSignalKind.blocked,
        nonce: nonce,
        screenId: screenId,
        reason: reason,
      );

  final UiDiffCaptureSignalKind kind;
  final String nonce;
  final String screenId;
  final UiDiffCaptureTheme? theme;
  final String? fixtureHash;
  final String? reason;

  String get line => kind == UiDiffCaptureSignalKind.ready
      ? 'UI_DIFF_READY:$nonce:$screenId:${theme!.name}:$fixtureHash'
      : 'UI_DIFF_BLOCKED:$nonce:$screenId:$reason';

  static UiDiffCaptureSignal? tryParse(String line) {
    final parts = line.trim().split(':');
    if (parts.length == 5 && parts.first == 'UI_DIFF_READY') {
      final theme = UiDiffCaptureTheme.values
          .where((value) => value.name == parts[3])
          .firstOrNull;
      if (theme == null) return null;
      return UiDiffCaptureSignal.ready(
        nonce: parts[1],
        screenId: parts[2],
        theme: theme,
        fixtureHash: parts[4],
      );
    }
    if (parts.length == 4 && parts.first == 'UI_DIFF_BLOCKED') {
      return UiDiffCaptureSignal.blocked(
        nonce: parts[1],
        screenId: parts[2],
        reason: parts[3],
      );
    }
    return null;
  }

  @override
  bool operator ==(Object other) =>
      other is UiDiffCaptureSignal && other.line == line;

  @override
  int get hashCode => line.hashCode;
}
