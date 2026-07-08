import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/theme/app_theme.dart';

void main() {
  // Regression: appBarTheme used SystemUiOverlayStyle.dark/.light, whose
  // baked-in systemNavigationBarColor is opaque black. Any AppBar screen
  // repainted the Android system nav bar black, and the scrim persisted
  // across tabs, covering the bottom nav's active indicator.
  group('AppBar system overlay style keeps the system nav transparent', () {
    test('dark theme', () {
      final style = AppTheme.dark().appBarTheme.systemOverlayStyle;
      expect(style, isNotNull);
      expect(style!.systemNavigationBarColor, Colors.transparent);
      expect(style.statusBarColor, Colors.transparent);
      expect(style.systemNavigationBarContrastEnforced, isFalse);
      expect(style.systemNavigationBarIconBrightness, Brightness.light);
    });

    test('light theme', () {
      final style = AppTheme.light().appBarTheme.systemOverlayStyle;
      expect(style, isNotNull);
      expect(style!.systemNavigationBarColor, Colors.transparent);
      expect(style.statusBarColor, Colors.transparent);
      expect(style.systemNavigationBarContrastEnforced, isFalse);
      expect(style.systemNavigationBarIconBrightness, Brightness.dark);
    });
  });
}
