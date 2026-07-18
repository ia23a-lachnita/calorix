import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';

import '../../debug/ui_diff_fixture.dart';
import '../../debug/debug_deep_links.dart';

/// Set to true by the debug/reseed route before navigating to Today.
/// When true, Today screen animations run at Duration.zero so UI-diff
/// captures the final rendered state instead of a mid-animation frame.
/// Has no effect in release builds because the debug/reseed route is
/// guarded by kDebugMode in app_router.dart.
final uiDiffModeProvider = StateProvider<bool>((ref) => false);

/// Enables visual-only fixture values. Kept separate from capture mode so
/// deterministic animation behavior can never alter production aggregation.
final uiDiffFixtureEnabledProvider = StateProvider<bool>((ref) => false);

/// Local deterministic data used by capture routes. It is never persisted or
/// sent to Firebase.
final uiDiffFixtureManifestProvider =
    StateProvider<UiDiffFixtureManifest?>((ref) => null);

/// Debug capture theme; it never writes the user's persisted preference.
final uiDiffThemeOverrideProvider = StateProvider<ThemeMode?>((ref) => null);

/// A nonce-specific ready signal waiting for an asynchronous target (such as
/// a hardware camera preview) to finish mounting. Debug capture routes only.
final uiDiffPendingCaptureSignalProvider =
    StateProvider<UiDiffCaptureSignal?>((ref) => null);
