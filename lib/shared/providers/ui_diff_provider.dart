import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/material.dart';

/// Set to true by the debug/reseed route before navigating to Today.
/// When true, Today screen animations run at Duration.zero so UI-diff
/// captures the final rendered state instead of a mid-animation frame.
/// Has no effect in release builds because the debug/reseed route is
/// guarded by kDebugMode in app_router.dart.
final uiDiffModeProvider = StateProvider<bool>((ref) => false);

/// Enables visual-only fixture values. Kept separate from capture mode so
/// deterministic animation behavior can never alter production aggregation.
final uiDiffFixtureEnabledProvider = StateProvider<bool>((ref) => false);

/// Debug capture theme; it never writes the user's persisted preference.
final uiDiffThemeOverrideProvider = StateProvider<ThemeMode?>((ref) => null);
