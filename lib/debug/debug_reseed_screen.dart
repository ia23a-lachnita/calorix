import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:timezone/timezone.dart' as tz;

import '../core/system/system_ui.dart';
import '../core/time/clock.dart';
import '../shared/providers/ui_diff_provider.dart';
import 'debug_deep_links.dart';
import 'ui_diff_fixture.dart';

class DebugReseedScreen extends ConsumerStatefulWidget {
  const DebugReseedScreen({
    super.key,
    required this.screenId,
    required this.theme,
    required this.nonce,
    required this.fixtureEpochMs,
  });

  final String screenId;
  final UiDiffCaptureTheme theme;
  final String nonce;
  final int fixtureEpochMs;

  @override
  ConsumerState<DebugReseedScreen> createState() => _DebugReseedScreenState();
}

class _DebugReseedScreenState extends ConsumerState<DebugReseedScreen> {
  String? _blockedReason;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _prepareTarget());
  }

  Future<void> _prepareTarget() async {
    enforceUiDiffDebugGuard(isDebug: kDebugMode);
    final target = kDebugScreenTargets[widget.screenId];
    if (target == null ||
        target.availability == DebugTargetAvailability.unimplemented) {
      _emitBlocked(target == null ? 'unknown_target' : 'unimplemented');
      return;
    }

    final manifest = UiDiffFixtureManifest.create(
      uid: 'ui-diff-local',
      clock: FakeClock(
        tz.TZDateTime.fromMillisecondsSinceEpoch(
          tz.UTC,
          widget.fixtureEpochMs,
        ),
      ),
    );

    ref.read(uiDiffModeProvider.notifier).state = true;
    ref.read(uiDiffFixtureEnabledProvider.notifier).state = true;
    ref.read(uiDiffFixtureManifestProvider.notifier).state = manifest;
    ref.read(uiDiffThemeOverrideProvider.notifier).state =
        widget.theme == UiDiffCaptureTheme.dark
            ? ThemeMode.dark
            : ThemeMode.light;
    await applyCalorixFullscreenSystemUi();
    if (!mounted) return;

    context.go(target.route);
    _afterTwoFrames(() {
      debugPrint(
        UiDiffCaptureSignal.ready(
          nonce: widget.nonce,
          screenId: widget.screenId,
          theme: widget.theme,
          fixtureHash: manifest.fixtureHash,
        ).line,
      );
    });
  }

  void _emitBlocked(String reason) {
    final line = UiDiffCaptureSignal.blocked(
      nonce: widget.nonce,
      screenId: widget.screenId,
      reason: reason,
    ).line;
    debugPrint(line);
    if (mounted) setState(() => _blockedReason = reason);
  }

  void _afterTwoFrames(VoidCallback callback) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      WidgetsBinding.instance.addPostFrameCallback((_) => callback());
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0E1117),
      body: Center(
        child: _blockedReason == null
            ? const CircularProgressIndicator(
                strokeWidth: 2,
                color: Color(0xFF19D3D9),
              )
            : Text(
                'UI diff target blocked: $_blockedReason',
                style: const TextStyle(color: Colors.white),
              ),
      ),
    );
  }
}
