import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_constants.dart';
import '../../core/router/app_router.dart';
import '../../core/router/route_names.dart';
import '../../features/scan/providers/scan_providers.dart';
import '../services/notification_service.dart';
import 'auth_provider.dart';

final notificationServiceProvider =
    Provider<NotificationService>((ref) => NotificationService());

/// Handles messages received while the app is terminated or backgrounded.
///
/// Messages that carry a `notification` payload are displayed by the OS
/// automatically, so this only needs to ensure Firebase is available.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

/// One-shot setup: permission, token persistence, foreground display and
/// notification-tap deep linking. Safe to call once after the user is signed
/// in; subsequent calls are ignored.
bool _initialized = false;

Future<void> initNotifications(WidgetRef ref) async {
  if (_initialized) return;
  final uid = ref.read(currentUidProvider);
  if (uid == null) return;
  _initialized = true;

  final service = ref.read(notificationServiceProvider);
  final firestore = ref.read(firestoreProvider);

  void deepLink(String? docId) {
    final router = ref.read(routerProvider);
    if (docId != null && docId.isNotEmpty) {
      router.goNamed(RouteNames.foodDetail, pathParameters: {'id': docId});
    } else {
      router.goNamed(RouteNames.today);
    }
  }

  service.onNotificationTap = deepLink;

  final granted = await service.requestPermission();
  ref.read(fcmPermissionProvider.notifier).state = granted;

  await service.initLocalNotifications();

  Future<void> writeToken(String token) {
    return firestore
        .collection(AppConstants.usersCollection)
        .doc(uid)
        .set(
          {'fcmToken': token, 'fcmUpdatedAt': FieldValue.serverTimestamp()},
          SetOptions(merge: true),
        );
  }

  try {
    final token = await service.getToken();
    if (token != null) await writeToken(token);
  } catch (_) {
    // Token retrieval needs native Firebase config; ignore in its absence.
  }
  service.onTokenRefresh.listen(writeToken);

  service.onMessage.listen(service.showForeground);
  service.onMessageOpenedApp
      .listen((message) => deepLink(service.docIdOf(message)));

  final initial = await service.getInitialMessage();
  if (initial != null) deepLink(service.docIdOf(initial));
}
