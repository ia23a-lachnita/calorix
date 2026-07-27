import 'package:flutter/material.dart';

const _kThemeModeKey = 'app_settings.themeMode';
const _kUnitsKey = 'app_settings.units';
const _kNotificationsEnabledKey = 'app_settings.notificationsEnabled';
const _kCameraResolutionKey = 'app_settings.cameraResolution';
const _kAutoCaptureKey = 'app_settings.autoCapture';

String _serializeThemeMode(ThemeMode mode) {
  return switch (mode) {
    ThemeMode.system => 'system',
    ThemeMode.light => 'light',
    ThemeMode.dark => 'dark',
  };
}

ThemeMode _deserializeThemeMode(String? value) {
  return switch (value) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };
}

@immutable
class AppSettings {
  static const allowedUnits = {'metric', 'imperial'};
  static const allowedCameraResolutions = {'low', 'high'};
  static const preferenceKeys = {
    _kThemeModeKey,
    _kUnitsKey,
    _kNotificationsEnabledKey,
    _kCameraResolutionKey,
    _kAutoCaptureKey,
  };

  final ThemeMode themeMode;
  final String units;
  final bool notificationsEnabled;
  final String cameraResolution;
  final bool autoCapture;

  const AppSettings({
    this.themeMode = ThemeMode.system,
    this.units = 'metric',
    this.notificationsEnabled = true,
    this.cameraResolution = 'high',
    this.autoCapture = false,
  });

  AppSettings copyWith({
    ThemeMode? themeMode,
    String? units,
    bool? notificationsEnabled,
    String? cameraResolution,
    bool? autoCapture,
  }) {
    return AppSettings(
      themeMode: themeMode ?? this.themeMode,
      units: units ?? this.units,
      notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
      cameraResolution: cameraResolution ?? this.cameraResolution,
      autoCapture: autoCapture ?? this.autoCapture,
    );
  }

  Map<String, Object?> toMap() {
    return {
      _kThemeModeKey: _serializeThemeMode(themeMode),
      _kUnitsKey: units,
      _kNotificationsEnabledKey: notificationsEnabled,
      _kCameraResolutionKey: cameraResolution,
      _kAutoCaptureKey: autoCapture,
    };
  }

  factory AppSettings.fromMap(Map<String, Object?> map) {
    final units = map[_kUnitsKey] as String?;
    final cameraResolution = map[_kCameraResolutionKey] as String?;
    return AppSettings(
      themeMode: _deserializeThemeMode(map[_kThemeModeKey] as String?),
      units: allowedUnits.contains(units) ? units! : 'metric',
      notificationsEnabled: (map[_kNotificationsEnabledKey] as bool?) ?? true,
      cameraResolution: allowedCameraResolutions.contains(cameraResolution)
          ? cameraResolution!
          : 'high',
      autoCapture: (map[_kAutoCaptureKey] as bool?) ?? false,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is AppSettings &&
      themeMode == other.themeMode &&
      units == other.units &&
      notificationsEnabled == other.notificationsEnabled &&
      cameraResolution == other.cameraResolution &&
      autoCapture == other.autoCapture;

  @override
  int get hashCode => Object.hash(
        themeMode,
        units,
        notificationsEnabled,
        cameraResolution,
        autoCapture,
      );
}
