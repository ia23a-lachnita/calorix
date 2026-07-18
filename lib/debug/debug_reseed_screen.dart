import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/system/system_ui.dart';
import '../core/time/clock_provider.dart';
import '../shared/providers/auth_provider.dart';
import '../shared/providers/ui_diff_provider.dart';
import '../shared/services/seed_data_service.dart';
import 'debug_deep_links.dart';

class DebugReseedScreen extends ConsumerStatefulWidget {
  const DebugReseedScreen({
    super.key,
    required this.screenId,
    required this.theme,
    required this.nonce,
  });

  final String screenId;
  final UiDiffCaptureTheme theme;
  final String nonce;

  @override
  ConsumerState<DebugReseedScreen> createState() => _DebugReseedScreenState();
}

class _DebugReseedScreenState extends ConsumerState<DebugReseedScreen> {
  String? _blockedReason;

  @override
  void initState() {
    super.initState();
    _prepareTarget();
  }

  Future<void> _prepareTarget() async {
    final target = kDebugScreenTargets[widget.screenId];
    if (target == null ||
        target.availability == DebugTargetAvailability.unimplemented) {
      _emitBlocked(target == null ? 'unknown_target' : 'unimplemented');
      return;
    }

    final auth = ref.read(firebaseAuthProvider);
    if (auth.currentUser == null) await auth.signInAnonymously();

    var fixtureHash = 'no-user';
    final uid = auth.currentUser?.uid;
    if (uid != null) {
      fixtureHash = await SeedDataService(
        ref.read(firestoreProvider),
        ref.read(clockProvider),
      ).forceReseedForUiDiff(uid);
    }
    if (!mounted) return;

    ref.read(uiDiffModeProvider.notifier).state = true;
    ref.read(uiDiffFixtureEnabledProvider.notifier).state = true;
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
          fixtureHash: fixtureHash,
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
