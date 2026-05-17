import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/firebase/firebase_options.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_colors.dart';
import 'core/theme/app_theme.dart';
import 'features/profile/profile_sheet.dart';
import 'shared/providers/auth_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const ProviderScope(child: CalorixApp()));
}

class CalorixApp extends ConsumerWidget {
  const CalorixApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'Calorix',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
      builder: (context, child) {
        return _AuthGate(child: child ?? const SizedBox.shrink());
      },
    );
  }
}

class _AuthGate extends ConsumerStatefulWidget {
  final Widget child;
  const _AuthGate({required this.child});

  @override
  ConsumerState<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends ConsumerState<_AuthGate> {
  bool _signingIn = false;

  @override
  void initState() {
    super.initState();
    _ensureSignedIn();
  }

  Future<void> _ensureSignedIn() async {
    if (_signingIn) return;
    _signingIn = true;
    try {
      final auth = ref.read(firebaseAuthProvider);
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }
    } catch (_) {
      // authStateProvider will emit error, handled in build
    } finally {
      _signingIn = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);

    return authState.when(
      loading: () => const _SplashScreen(),
      error: (error, _) => _AuthErrorScreen(onRetry: _ensureSignedIn),
      data: (user) {
        if (user == null) return const _SplashScreen();
        return widget.child;
      },
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0E1117),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Gradient logo mark
            Container(
              width: 72,
              height: 72,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF3A5BFF), Color(0xFF19D3D9), Color(0xFF1FCC74)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.remove_red_eye_outlined,
                  color: AppColors.textPrimaryDark, size: 32),
            ),
            const SizedBox(height: 20),
            const Text(
              'CALORIX',
              style: TextStyle(
                fontFamily: 'BarlowCondensed',
                fontSize: 28,
                fontWeight: FontWeight.w700,
                color: Color(0xFFF2F1EE),
                letterSpacing: 4,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Snap. Track. Stay on target.',
              style: TextStyle(
                fontFamily: 'Barlow',
                fontSize: 13,
                color: Color(0xFF8A8A9A),
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 40),
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Color(0xFF19D3D9),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AuthErrorScreen extends StatelessWidget {
  final VoidCallback onRetry;
  const _AuthErrorScreen({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0E1117),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.wifi_off_outlined,
                  color: Color(0xFF8A8A9A), size: 48),
              const SizedBox(height: 16),
              const Text(
                'Connection error',
                style: TextStyle(
                    fontFamily: 'BarlowCondensed',
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFFF2F1EE)),
              ),
              const SizedBox(height: 8),
              const Text(
                'Could not connect to Calorix servers. Please check your connection and try again.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontFamily: 'Barlow',
                    fontSize: 14,
                    color: Color(0xFF8A8A9A),
                    height: 1.5),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: onRetry,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
