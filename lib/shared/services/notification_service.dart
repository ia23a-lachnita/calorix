import 'package:firebase_messaging/firebase_messaging.dart';

/// Wraps Firebase Cloud Messaging token and message-stream access.
///
/// Firebase must be initialized before this is used. On Android the
/// `google-services` Gradle plugin and a real `google-services.json`
/// (added by `flutterfire configure`) are required for token retrieval.
class NotificationService {
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;

  Future<bool> requestPermission() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  Future<String?> getToken() => _messaging.getToken();

  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  Stream<RemoteMessage> get onMessageOpenedApp =>
      FirebaseMessaging.onMessageOpenedApp;

  Future<RemoteMessage?> getInitialMessage() => _messaging.getInitialMessage();

  String? docIdOf(RemoteMessage message) =>
      message.data['entryId'] as String? ?? message.data['docId'] as String?;
}
