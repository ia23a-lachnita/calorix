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

Future<void> applyCalorixEdgeToEdgeSystemUi() async {
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(calorixEdgeToEdgeOverlayStyle);
}

Future<void> applyCalorixUiDiffSystemUi() async {
  SystemChrome.setSystemUIOverlayStyle(calorixEdgeToEdgeOverlayStyle);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
}
