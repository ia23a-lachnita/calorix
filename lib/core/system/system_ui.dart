import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

const SystemUiOverlayStyle calorixEdgeToEdgeOverlayStyle = SystemUiOverlayStyle(
  statusBarColor: Colors.transparent,
  systemNavigationBarColor: Colors.transparent,
  systemNavigationBarDividerColor: Colors.transparent,
  statusBarIconBrightness: Brightness.light,
  statusBarBrightness: Brightness.dark,
  systemNavigationBarIconBrightness: Brightness.light,
  systemStatusBarContrastEnforced: false,
  systemNavigationBarContrastEnforced: false,
);

/// Light-theme variant: same fully transparent bars, dark icons.
const SystemUiOverlayStyle calorixEdgeToEdgeOverlayStyleLight =
    SystemUiOverlayStyle(
  statusBarColor: Colors.transparent,
  systemNavigationBarColor: Colors.transparent,
  systemNavigationBarDividerColor: Colors.transparent,
  statusBarIconBrightness: Brightness.dark,
  statusBarBrightness: Brightness.light,
  systemNavigationBarIconBrightness: Brightness.dark,
  systemStatusBarContrastEnforced: false,
  systemNavigationBarContrastEnforced: false,
);

/// Channel used to communicate fullscreen system-bar requests to the native
/// Android layer.  The name must match the Kotlin registration exactly.
const MethodChannel calorixSystemUiChannel =
    MethodChannel('com.calorix.calorix/system_ui');

/// Applies the Calorix fullscreen system-ui policy.
///
/// On Android the native WindowInsetsControllerCompat hides system bars
/// (status + navigation) via a dedicated MethodChannel, which survives
/// targetSdk 36 where Flutter's `SystemChrome.setEnabledSystemUIMode` is
/// ignored.  On iOS we fall back to `SystemUiMode.immersiveSticky`.
///
/// The transparent-bar overlay style is set on every platform so the
/// status-bar icons remain light-on-dark when bars are transiently shown.
Future<void> applyCalorixFullscreenSystemUi() async {
  SystemChrome.setSystemUIOverlayStyle(calorixEdgeToEdgeOverlayStyle);

  if (kIsWeb) return;

  if (defaultTargetPlatform == TargetPlatform.android) {
    await calorixSystemUiChannel.invokeMethod<void>('hideSystemBars');
  } else if (defaultTargetPlatform == TargetPlatform.iOS) {
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }
}
