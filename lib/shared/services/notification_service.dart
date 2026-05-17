import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Wraps Firebase Cloud Messaging and local notification display.
///
/// Firebase must be initialized before this is used. On Android the
/// `google-services` Gradle plugin and a real `google-services.json`
/// (added by `flutterfire configure`) are required for token retrieval.
class NotificationService {
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'calorix_scans',
    'Scan results',
    description: 'Notifications when a meal scan finishes processing.',
    importance: Importance.high,
  );

  /// Called with the entry doc id when the user taps a notification.
  void Function(String docId)? onNotificationTap;

  Future<bool> requestPermission() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  Future<void> initLocalNotifications() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _local.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload != null && payload.isNotEmpty) {
          onNotificationTap?.call(payload);
        }
      },
    );
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);
  }

  Future<String?> getToken() => _messaging.getToken();

  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  Stream<RemoteMessage> get onMessage => FirebaseMessaging.onMessage;

  Stream<RemoteMessage> get onMessageOpenedApp =>
      FirebaseMessaging.onMessageOpenedApp;

  Future<RemoteMessage?> getInitialMessage() => _messaging.getInitialMessage();

  String? docIdOf(RemoteMessage message) =>
      message.data['docId'] as String? ?? message.data['entryId'] as String?;

  /// Shows a local notification for a message received while the app is
  /// foregrounded (FCM does not display these automatically).
  Future<void> showForeground(RemoteMessage message) async {
    final notification = message.notification;
    final docId = docIdOf(message);
    await _local.show(
      (docId ?? message.messageId ?? '').hashCode,
      notification?.title ?? 'Calorix finished your meal scan',
      notification?.body ?? 'Your scan is ready',
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      payload: docId,
    );
  }
}
