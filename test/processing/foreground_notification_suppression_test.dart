import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Deterministic source-contract tests.
///
/// These read the actual .dart / .ts source files and assert the presence or
/// absence of specific identifiers.  The goal: verify that foreground local
/// notification machinery lives in the right layer (or doesn't exist yet) and
/// that the cloud→push→deep-link surface is wired correctly.
///
/// These tests compile and run WITHOUT any Firebase / Flutter engine setup.
/// They fail only when source files contain unexpected artifacts.

String _read(String relativePath) {
  // tests run from the project root
  final file = File('${Directory.current.path}/$relativePath');
  if (!file.existsSync()) {
    fail('Source file not found: ${file.path}');
  }
  return file.readAsStringSync();
}

// ── File paths ──────────────────────────────────────────────────────────────

const _servicePath = 'lib/shared/services/notification_service.dart';
const _providerPath = 'lib/shared/providers/notification_provider.dart';
const _mainPath = 'lib/main.dart';
const _pushTsPath = 'functions/src/push.ts';

// ── Forbidden tokens ────────────────────────────────────────────────────────

/// Tokens that must NOT appear in the service file.
const _serviceForbidden = [
  'flutter_local_notifications',
  'FlutterLocalNotificationsPlugin',
  'AndroidNotificationChannel',
  'initLocalNotifications',
  'showForeground',
  'onNotificationTap',
];

/// Matches only the standalone foreground getter (`get onMessage`) whose
/// body returns `FirebaseMessaging.onMessage`, tolerant of whitespace and
/// line breaks. Word boundaries keep this from matching the required
/// `onMessageOpenedApp` getter/token.
final _serviceForbiddenForegroundGetter = RegExp(
  r'get\s+onMessage\b\s*(?:=>|\{)\s*FirebaseMessaging\.onMessage\b',
);

/// Tokens that must NOT appear in the provider file.
const _providerForbidden = [
  'flutter_local_notifications',
  'FlutterLocalNotificationsPlugin',
  'AndroidNotificationChannel',
  'initLocalNotifications',
  'showForeground',
  'onNotificationTap',
  'onMessage.listen',
];

// ── Required tokens ─────────────────────────────────────────────────────────

/// Tokens that MUST appear in the service file.
const _serviceRequired = [
  'onMessageOpenedApp',
  'getInitialMessage',
  'onTokenRefresh',
  'docIdOf',
];

/// Tokens that MUST appear in the provider file (deep-link / token wiring).
const _providerRequired = [
  'onMessageOpenedApp',
  'getInitialMessage',
  'onTokenRefresh',
  'writeToken',
  'fcmToken',
  'deepLink',
];

/// Token that MUST appear in main.dart.
const _mainRequired = [
  'FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler)',
];

/// Tokens that MUST appear in push.ts.
const _pushRequired = [
  'ScanPushMessage',
  'buildScanCompletePush',
  'buildScanReviewPush',
  'notification',
  'entryId',
];

void main() {
  late String serviceSrc;
  late String providerSrc;
  late String mainSrc;
  late String pushSrc;

  setUpAll(() {
    serviceSrc = _read(_servicePath);
    providerSrc = _read(_providerPath);
    mainSrc = _read(_mainPath);
    pushSrc = _read(_pushTsPath);
  });

  // ── Service: forbidden foreground artifacts ──────────────────────────────

  group(
      'NotificationService must not contain foreground-local-notification artifacts',
      () {
    for (final token in _serviceForbidden) {
      test('service must not contain "$token"', () {
        expect(serviceSrc, isNot(contains(token)),
            reason: '$_servicePath contains forbidden token "$token"');
      });
    }

    test('service must not contain a standalone foreground onMessage getter',
        () {
      expect(_serviceForbiddenForegroundGetter.hasMatch(serviceSrc), isFalse,
          reason:
              '$_servicePath contains a forbidden foreground onMessage getter');
    });
  });

  // ── Provider: forbidden foreground artifacts ────────────────────────────

  group(
      'NotificationProvider must not contain foreground-local-notification artifacts',
      () {
    for (final token in _providerForbidden) {
      test('provider must not contain "$token"', () {
        expect(providerSrc, isNot(contains(token)),
            reason: '$_providerPath contains forbidden token "$token"');
      });
    }
  });

  // ── Service: required surface ───────────────────────────────────────────

  group('NotificationService exposes required deep-link / token surface', () {
    for (final token in _serviceRequired) {
      test('service must contain "$token"', () {
        expect(serviceSrc, contains(token),
            reason: '$_servicePath is missing required token "$token"');
      });
    }
  });

  // ── Provider: required token write ──────────────────────────────────────

  group('NotificationProvider wires token persistence', () {
    for (final token in _providerRequired) {
      test('provider must contain "$token"', () {
        expect(providerSrc, contains(token),
            reason: '$_providerPath is missing required token "$token"');
      });
    }
  });

  // ── main.dart: background handler registration ──────────────────────────

  group('main.dart registers the background handler', () {
    for (final token in _mainRequired) {
      test('main must contain "$token"', () {
        expect(mainSrc, contains(token),
            reason: '$_mainPath is missing required token "$token"');
      });
    }
  });

  // ── push.ts: notification payload structure ─────────────────────────────

  group('functions/src/push.ts defines the notification payload', () {
    for (final token in _pushRequired) {
      test('push.ts must contain "$token"', () {
        expect(pushSrc, contains(token),
            reason: '$_pushTsPath is missing required token "$token"');
      });
    }
  });
}
