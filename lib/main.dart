import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/constants/app_constants.dart';
import 'core/firebase/firebase_options.dart';
import 'core/router/app_router.dart';
import 'core/system/system_ui.dart';
import 'core/theme/app_theme.dart';
import 'core/time/clock_provider.dart';
import 'core/time/timezone_init.dart';
import 'features/profile/profile_sheet.dart';
import 'shared/providers/auth_provider.dart';
import 'shared/providers/notification_provider.dart';
import 'shared/providers/ui_diff_provider.dart';
import 'shared/services/seed_data_service.dart';

const _useEmulator = bool.fromEnvironment('USE_EMULATOR', defaultValue: false);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  initializeTimezoneDatabase();
  final synchronizer = TimezoneSynchronizer(FlutterTimezoneSource());
  await synchronizer.syncOnce();
  await applyCalorixFullscreenSystemUi();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  if (_useEmulator) {
    // Android emulator reaches host via 10.0.2.2; everything else uses localhost
    final host = Platform.isAndroid ? '10.0.2.2' : 'localhost';
    FirebaseFirestore.instance.useFirestoreEmulator(host, 8080);
    await FirebaseAuth.instance.useAuthEmulator(host, 9099);
    await FirebaseStorage.instance.useStorageEmulator(host, 9199);
  }

  FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
  runApp(TimezoneLifecycleHandler(
    synchronizer: synchronizer,
    child: const ProviderScope(child: CalorixApp()),
  ));
}

class CalorixApp extends ConsumerWidget {
  const CalorixApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode =
        ref.watch(uiDiffThemeOverrideProvider) ?? ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: AppConstants.appDisplayName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
      builder: (context, child) {
        return _SessionServices(child: child ?? const SizedBox.shrink());
      },
    );
  }
}

/// Runs per-session side effects when a user signs in (any provider,
/// including guest): demo seeding and notification setup. Screens and
/// navigation are owned by the router — this widget never blocks the child.
class _SessionServices extends ConsumerStatefulWidget {
  final Widget child;
  const _SessionServices({required this.child});

  @override
  ConsumerState<_SessionServices> createState() => _SessionServicesState();
}

class _SessionServicesState extends ConsumerState<_SessionServices> {
  String? _initializedUid;

  @override
  Widget build(BuildContext context) {
    ref.listen(authStateProvider, (_, next) {
      final user = next.valueOrNull;
      if (user == null || user.uid == _initializedUid) return;
      _initializedUid = user.uid;
      Future(() async {
        try {
          await SeedDataService(
                  ref.read(firestoreProvider), ref.read(clockProvider))
              .seedIfEmpty(user.uid);
        } catch (seedError) {
          debugPrint('SEED ERROR (non-fatal): $seedError');
        }
        if (mounted) initNotifications(ref);
      });
    });
    return widget.child;
  }
}
