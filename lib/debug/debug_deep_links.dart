import 'package:flutter/foundation.dart';

enum UiDiffFixtureProfile {
  empty,
  populated,
  flowPermission,
  flowScan,
  flowProcessing,
  flowReview,
  flowManual,
  flowLoading,
  flowLogin;

  /// Canonical wire name matching visual-state-inventory.json (e.g.
  /// "flow_permission", "flow_scan").
  String get wireName {
    if (this == UiDiffFixtureProfile.empty) return 'empty';
    if (this == UiDiffFixtureProfile.populated) return 'populated';
    if (name.startsWith('flow')) {
      final ix = name.indexOf('flow');
      final rest = name.substring(ix + 4);
      return 'flow_${rest[0].toLowerCase()}${rest.substring(1)}';
    }
    return name;
  }

  static UiDiffFixtureProfile? fromWire(String wire) {
    for (final value in values) {
      if (value.wireName == wire) return value;
    }
    return null;
  }
}

enum DebugTargetAvailability { implemented, unimplemented }

class DebugScreenTarget {
  const DebugScreenTarget({
    required this.id,
    required this.route,
    required this.availability,
    required this.fixtureProfile,
  });

  final String id;
  final String route;
  final DebugTargetAvailability availability;
  final UiDiffFixtureProfile fixtureProfile;
}

const Map<String, DebugScreenTarget> kDebugScreenTargets = {
  'loading': DebugScreenTarget(
    id: 'loading',
    route: '/debug/capture/loading',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.flowLoading,
  ),
  'login': DebugScreenTarget(
    id: 'login',
    route: '/debug/capture/login',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.flowLogin,
  ),
  'permission': DebugScreenTarget(
    id: 'permission',
    route: '/debug/capture/permission',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.flowPermission,
  ),
  'scan_idle': DebugScreenTarget(
    id: 'scan_idle',
    route: '/debug/capture/scan_idle',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.flowScan,
  ),
  'scan_capturing': DebugScreenTarget(
    id: 'scan_capturing',
    route: '/debug/capture/scan_capturing',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.flowScan,
  ),
  'processing': DebugScreenTarget(
    id: 'processing',
    route: '/debug/capture/processing',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.flowProcessing,
  ),
  'review': DebugScreenTarget(
    id: 'review',
    route: '/debug/capture/review',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.flowReview,
  ),
  'manual': DebugScreenTarget(
    id: 'manual',
    route: '/debug/capture/manual',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.flowManual,
  ),
  'today': DebugScreenTarget(
    id: 'today',
    route: '/debug/capture/today',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.populated,
  ),
  'today_empty': DebugScreenTarget(
    id: 'today_empty',
    route: '/debug/capture/today_empty',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.empty,
  ),
  'food': DebugScreenTarget(
    id: 'food',
    route: '/debug/capture/food',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.populated,
  ),
  'food_edit': DebugScreenTarget(
    id: 'food_edit',
    route: '/debug/capture/food_edit',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.populated,
  ),
  'history_week': DebugScreenTarget(
    id: 'history_week',
    route: '/debug/capture/history_week',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.populated,
  ),
  'history_month': DebugScreenTarget(
    id: 'history_month',
    route: '/debug/capture/history_month',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.populated,
  ),
  'goals': DebugScreenTarget(
    id: 'goals',
    route: '/debug/capture/goals',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.populated,
  ),
  'goals_select': DebugScreenTarget(
    id: 'goals_select',
    route: '/debug/capture/goals_select',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.populated,
  ),
  'ai': DebugScreenTarget(
    id: 'ai',
    route: '/debug/capture/ai',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.populated,
  ),
  'ai_history': DebugScreenTarget(
    id: 'ai_history',
    route: '/debug/capture/ai_history',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.populated,
  ),
  'profile': DebugScreenTarget(
    id: 'profile',
    route: '/debug/capture/profile',
    availability: DebugTargetAvailability.implemented,
    fixtureProfile: UiDiffFixtureProfile.populated,
  ),
};

enum UiDiffCaptureTheme { dark, light }

bool debugTargetDefersReadySignal(String screenId) {
  final target = kDebugScreenTargets[screenId];
  return target?.route.startsWith('/debug/capture/') ?? false;
}

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
