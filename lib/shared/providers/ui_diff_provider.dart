import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Set to true by the debug/reseed route before navigating to Today.
/// When true, Today screen animations run at Duration.zero so UI-diff
/// captures the final rendered state instead of a mid-animation frame.
/// Has no effect in release builds because the debug/reseed route is
/// guarded by kDebugMode in app_router.dart.
final uiDiffModeProvider = StateProvider<bool>((ref) => false);
