import 'package:calorix/debug/debug_deep_links.dart';
import 'package:flutter_test/flutter_test.dart';

const canonicalIds = <String>{
  'loading',
  'login',
  'permission',
  'scan_idle',
  'scan_capturing',
  'processing',
  'review',
  'manual',
  'today',
  'today_empty',
  'food',
  'food_edit',
  'history_week',
  'history_month',
  'goals',
  'goals_select',
  'ai',
  'ai_history',
  'profile',
};

const canonicalFixtureProfileById = <String, UiDiffFixtureProfile>{
  'loading': UiDiffFixtureProfile.flowLoading,
  'login': UiDiffFixtureProfile.flowLogin,
  'permission': UiDiffFixtureProfile.flowPermission,
  'scan_idle': UiDiffFixtureProfile.flowScan,
  'scan_capturing': UiDiffFixtureProfile.flowScan,
  'processing': UiDiffFixtureProfile.flowProcessing,
  'review': UiDiffFixtureProfile.flowReview,
  'manual': UiDiffFixtureProfile.flowManual,
  'today': UiDiffFixtureProfile.populated,
  'today_empty': UiDiffFixtureProfile.empty,
  'food': UiDiffFixtureProfile.populated,
  'food_edit': UiDiffFixtureProfile.populated,
  'history_week': UiDiffFixtureProfile.populated,
  'history_month': UiDiffFixtureProfile.populated,
  'goals': UiDiffFixtureProfile.populated,
  'goals_select': UiDiffFixtureProfile.populated,
  'ai': UiDiffFixtureProfile.populated,
  'ai_history': UiDiffFixtureProfile.populated,
  'profile': UiDiffFixtureProfile.populated,
};

void main() {
  test('debug target registry covers all 19 canonical IDs exactly', () {
    expect(kDebugScreenTargets.keys.toSet(), canonicalIds);
    expect(kDebugScreenTargets, hasLength(19));
    for (final entry in kDebugScreenTargets.entries) {
      expect(entry.value.id, entry.key);
      expect(entry.value.route, isNotEmpty);
    }
  });

  test('every target has a valid fixture profile matching the inventory', () {
    for (final entry in kDebugScreenTargets.entries) {
      final profile = entry.value.fixtureProfile;
      expect(
        canonicalFixtureProfileById[entry.key],
        profile,
        reason: 'Target ${entry.key} has wrong fixture profile',
      );
      expect(UiDiffFixtureProfile.values, contains(profile));
    }
  });

  test('all 9 UiDiffFixtureProfile values are used across the 19 targets',
      () {
    final usedProfiles =
        kDebugScreenTargets.values.map((t) => t.fixtureProfile).toSet();
    expect(usedProfiles, hasLength(9));
    expect(usedProfiles, UiDiffFixtureProfile.values.toSet());
  });

  test('all targets are implemented (route adapters in next slice)', () {
    for (final entry in kDebugScreenTargets.entries) {
      expect(
        entry.value.availability,
        DebugTargetAvailability.implemented,
        reason: 'Target ${entry.key} should be implemented',
      );
    }
  });

  test('ready and blocked signals are nonce-specific and round-trip', () {
    const nonce = 'capture-7f34';
    const fixtureHash = 'fixture-sha256';

    final ready = UiDiffCaptureSignal.ready(
      nonce: nonce,
      screenId: 'today',
      theme: UiDiffCaptureTheme.dark,
      fixtureHash: fixtureHash,
    );
    final blocked = UiDiffCaptureSignal.blocked(
      nonce: nonce,
      screenId: 'review',
      reason: 'unimplemented',
    );

    expect(
      ready.line,
      'UI_DIFF_READY:$nonce:today:dark:$fixtureHash',
    );
    expect(
      blocked.line,
      'UI_DIFF_BLOCKED:$nonce:review:unimplemented',
    );
    expect(UiDiffCaptureSignal.tryParse(ready.line), ready);
    expect(UiDiffCaptureSignal.tryParse(blocked.line), blocked);
    expect(
      UiDiffCaptureSignal.tryParse(
        'UI_DIFF_READY:stale-nonce:today:dark:$fixtureHash',
      )?.nonce,
      isNot(nonce),
    );
  });

  test('all capture targets defer readiness to the isolated adapter screen',
      () {
    for (final target in kDebugScreenTargets.values) {
      expect(target.route, '/debug/capture/${target.id}');
      expect(debugTargetDefersReadySignal(target.id), isTrue);
    }
  });
}
