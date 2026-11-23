import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Supplies the locally persisted appearance choice to the pilot's app shell.
class PilotTheme extends StatefulWidget {
  const PilotTheme({super.key, required this.builder});
  final Widget Function(BuildContext, ThemeMode, ValueChanged<ThemeMode>)
      builder;

  static PilotThemeScope of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<PilotThemeScope>()!;

  @override
  State<PilotTheme> createState() => _PilotThemeState();
}

class _PilotThemeState extends State<PilotTheme> {
  static const _key = 'app_settings.themeMode';
  ThemeMode _mode = ThemeMode.system;
  int _revision = 0;
  Future<void> _writes = Future.value();

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final revision = _revision;
    try {
      final preferences = await SharedPreferences.getInstance();
      final mode = switch (preferences.getString(_key)) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
      if (mounted && revision == _revision) {
        setState(() => _mode = mode);
      }
    } catch (_) {
      // Keep the system appearance if preferences are unavailable.
    }
  }

  void _select(ThemeMode mode) {
    _revision++;
    setState(() => _mode = mode);
    _writes = _writes.then((_) async {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(_key, mode.name);
    }).catchError((Object _) {});
  }

  @override
  Widget build(BuildContext context) => PilotThemeScope(
        mode: _mode,
        setMode: _select,
        child: widget.builder(context, _mode, _select),
      );
}

class PilotThemeScope extends InheritedWidget {
  const PilotThemeScope(
      {super.key,
      required this.mode,
      required this.setMode,
      required super.child});
  final ThemeMode mode;
  final ValueChanged<ThemeMode> setMode;

  @override
  bool updateShouldNotify(PilotThemeScope oldWidget) => mode != oldWidget.mode;
}
