import 'package:calorix/debug/debug_deep_links.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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

  test('debug target registry covers all 19 canonical IDs exactly', () {
    expect(kDebugScreenTargets.keys.toSet(), canonicalIds);
    expect(kDebugScreenTargets, hasLength(19));
    for (final entry in kDebugScreenTargets.entries) {
      expect(entry.value.id, entry.key);
      expect(entry.value.route, isNotEmpty);
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

  test('camera-backed scan capture defers readiness to the target screen', () {
    expect(debugTargetDefersReadySignal('scan_idle'), isTrue);
    expect(debugTargetDefersReadySignal('today'), isFalse);
  });
}
