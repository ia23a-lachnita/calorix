import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/app_settings.dart';

abstract interface class AppSettingsStore {
  Future<AppSettings> load();
  Future<void> save(AppSettings settings);
}

class SharedPreferencesAppSettingsStore implements AppSettingsStore {
  SharedPreferencesAppSettingsStore([Future<SharedPreferences>? preferences])
      : _preferences = preferences ?? SharedPreferences.getInstance();

  SharedPreferencesAppSettingsStore.withInstance(SharedPreferences preferences)
      : _preferences = Future.value(preferences);

  final Future<SharedPreferences> _preferences;

  @override
  Future<AppSettings> load() async {
    final preferences = await _preferences;
    return AppSettings.fromMap({
      for (final key in AppSettings.preferenceKeys) key: preferences.get(key),
    });
  }

  @override
  Future<void> save(AppSettings settings) async {
    final preferences = await _preferences;
    for (final entry in settings.toMap().entries) {
      final value = entry.value;
      if (value is String) {
        await preferences.setString(entry.key, value);
      } else if (value is bool) {
        await preferences.setBool(entry.key, value);
      }
    }
  }
}

final appSettingsStoreProvider = Provider<AppSettingsStore>(
  (ref) => SharedPreferencesAppSettingsStore(),
);

final settingsProvider =
    NotifierProvider<SettingsNotifier, AppSettings>(SettingsNotifier.new);

class SettingsNotifier extends Notifier<AppSettings> {
  Future<void> _writeQueue = Future.value();
  final _hydration = Completer<void>();
  var _revision = 0;
  var _disposed = false;

  @override
  AppSettings build() {
    _disposed = false;
    ref.onDispose(() => _disposed = true);
    final revisionAtBuild = _revision;
    unawaited(_hydrate(revisionAtBuild));
    return const AppSettings();
  }

  Future<void> _hydrate(int revisionAtBuild) async {
    try {
      final loaded = await ref.read(appSettingsStoreProvider).load();
      if (!_disposed && _revision == revisionAtBuild) {
        state = loaded;
      }
    } finally {
      if (!_hydration.isCompleted) {
        _hydration.complete();
      }
    }
  }

  Future<void> get hydrated => _hydration.future;

  Future<void> _update(AppSettings value) {
    _revision += 1;
    state = value;
    final store = ref.read(appSettingsStoreProvider);
    _writeQueue = _writeQueue.then((_) => store.save(value));
    return _writeQueue;
  }

  Future<void> updateThemeMode(ThemeMode mode) =>
      _update(state.copyWith(themeMode: mode));

  Future<void> updateUnits(String units) {
    if (!AppSettings.allowedUnits.contains(units)) {
      throw ArgumentError.value(units, 'units');
    }
    return _update(state.copyWith(units: units));
  }

  Future<void> updateNotificationsEnabled(bool enabled) =>
      _update(state.copyWith(notificationsEnabled: enabled));

  Future<void> updateCameraResolution(String resolution) {
    if (!AppSettings.allowedCameraResolutions.contains(resolution)) {
      throw ArgumentError.value(resolution, 'resolution');
    }
    return _update(state.copyWith(cameraResolution: resolution));
  }

  Future<void> updateAutoCapture(bool enabled) =>
      _update(state.copyWith(autoCapture: enabled));

  Future<void> flush() => _writeQueue;
}
