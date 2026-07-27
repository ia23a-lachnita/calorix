import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../shared/providers/auth_provider.dart';
import '../../shared/widgets/brand.dart';

/// Login / sign-in per handoff cx-screen-login.jsx: email + password card,
/// Apple/Google, guest affordance, trust chips. "Create an account" flips the
/// form into sign-up mode with identical visuals.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _showPassword = false;
  bool _staySignedIn = true;
  bool _signUpMode = false;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      // Success: the router redirect reacts to the auth state change.
    } on FirebaseAuthException catch (e) {
      _showError(e.message ?? 'Sign-in failed (${e.code}).');
    } catch (e) {
      _showError('Sign-in failed. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _continueWithEmail() {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || !email.contains('@')) {
      _showError('Enter a valid email address.');
      return Future.value();
    }
    if (password.length < 6) {
      _showError('Password needs at least 6 characters.');
      return Future.value();
    }
    final auth = ref.read(firebaseAuthProvider);
    return _run(() => _signUpMode
        ? signUpWithEmail(auth, email: email, password: password)
        : signInWithEmail(auth, email: email, password: password));
  }

  Future<void> _forgotPassword() async {
    final email = _email.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      _showError('Enter your email above first, then tap Forgot.');
      return;
    }
    await _run(() async {
      await sendPasswordReset(ref.read(firebaseAuthProvider), email);
      _showError('Password reset email sent to $email.');
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final ink = dark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final ink2 = dark
        ? AppColors.textPrimaryDark.withValues(alpha: 0.78)
        : const Color(0xFF3A4048);
    final muted = dark
        ? AppColors.textPrimaryDark.withValues(alpha: 0.50)
        : const Color(0xFF7B8088);
    final hairline = dark ? AppColors.borderDark : AppColors.borderLight;
    final hairline2 =
        dark ? AppColors.borderDarkStrong : AppColors.borderLightStrong;
    final surface = dark ? Colors.white.withValues(alpha: 0.04) : Colors.white;
    final fieldBg =
        dark ? Colors.white.withValues(alpha: 0.04) : const Color(0xFFFBFAF6);

    return Scaffold(
      backgroundColor:
          dark ? AppColors.backgroundDark : AppColors.backgroundLight,
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          // Decorative halos.
          Positioned(
            right: -120,
            top: -100,
            child: _halo(
                AppColors.cyan.withValues(alpha: dark ? 0.22 : 0.28), 360),
          ),
          Positioned(
            left: -140,
            bottom: 140,
            child: _halo(AppColors.blue.withValues(alpha: 0.18), 320),
          ),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: constraints.maxHeight > 64
                        ? constraints.maxHeight - 64
                        : 0,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const CxWordmark(height: 30),
                      const SizedBox(height: 28),
                      Text(
                        _signUpMode ? 'GET STARTED' : 'WELCOME BACK',
                        style: TextStyle(
                          fontFamily: 'GeistMono',
                          fontSize: 10,
                          letterSpacing: 10 * 0.16,
                          color: muted,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Snap. Track.\nStay on target.',
                        style: TextStyle(
                          fontFamily: 'Geist',
                          fontSize: 30,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 30 * -0.04,
                          height: 1.05,
                          color: ink,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 320),
                        child: Text(
                          _signUpMode
                              ? 'Create an account to sync scans, macros and goals across your devices.'
                              : "Sign in to sync today's scans, macros and goals across your devices.",
                          style: TextStyle(
                            fontFamily: 'Geist',
                            fontSize: 13.5,
                            height: 1.45,
                            letterSpacing: 13.5 * -0.005,
                            color: muted,
                          ),
                        ),
                      ),
                      const SizedBox(height: 22),
                      // Form card.
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: surface,
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(width: 0.5, color: hairline),
                          boxShadow: dark
                              ? [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.4),
                                    offset: const Offset(0, 12),
                                    blurRadius: 28,
                                  ),
                                ]
                              : [
                                  BoxShadow(
                                    color: const Color(0xFF0B0D10)
                                        .withValues(alpha: 0.04),
                                    offset: const Offset(0, 1),
                                    blurRadius: 2,
                                  ),
                                  BoxShadow(
                                    color: const Color(0xFF0B0D10)
                                        .withValues(alpha: 0.04),
                                    offset: const Offset(0, 8),
                                    blurRadius: 24,
                                  ),
                                ],
                        ),
                        child: Column(
                          children: [
                            _Field(
                              label: 'EMAIL',
                              controller: _email,
                              icon: Icons.person_outline,
                              keyboardType: TextInputType.emailAddress,
                              fieldBg: fieldBg,
                              dark: dark,
                              hairline: hairline,
                              ink: ink,
                              ink2: ink2,
                              muted: muted,
                            ),
                            const SizedBox(height: 10),
                            _Field(
                              label: 'PASSWORD',
                              controller: _password,
                              icon: Icons.lock_outline,
                              obscure: !_showPassword,
                              fieldBg: fieldBg,
                              dark: dark,
                              hairline: hairline,
                              ink: ink,
                              ink2: ink2,
                              muted: muted,
                              trailing: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () => setState(
                                    () => _showPassword = !_showPassword),
                                child: SizedBox(
                                  width: 48,
                                  height: 48,
                                  child: Center(
                                    child: Text(
                                      _showPassword ? 'HIDE' : 'SHOW',
                                      style: const TextStyle(
                                        fontFamily: 'GeistMono',
                                        fontSize: 10,
                                        letterSpacing: 10 * 0.14,
                                        color: AppColors.cyan,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                GestureDetector(
                                  onTap: () => setState(
                                      () => _staySignedIn = !_staySignedIn),
                                  behavior: HitTestBehavior.opaque,
                                  child: SizedBox(
                                    height: 48,
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 18,
                                          height: 18,
                                          decoration: BoxDecoration(
                                            borderRadius:
                                                BorderRadius.circular(6),
                                            gradient: _staySignedIn
                                                ? const LinearGradient(
                                                    begin: Alignment.topLeft,
                                                    end: Alignment.bottomRight,
                                                    colors:
                                                        AppColors.brandGradient,
                                                  )
                                                : null,
                                            border: _staySignedIn
                                                ? null
                                                : Border.all(color: hairline2),
                                          ),
                                          child: _staySignedIn
                                              ? const Icon(
                                                  Icons.check,
                                                  size: 12,
                                                  color: Color(0xFF0B0D10),
                                                )
                                              : null,
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          'Stay signed in',
                                          style: TextStyle(
                                            fontFamily: 'Geist',
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.w500,
                                            color: ink2,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                GestureDetector(
                                  onTap: _forgotPassword,
                                  child: Container(
                                    constraints:
                                        const BoxConstraints(minHeight: 48),
                                    alignment: Alignment.center,
                                    child: Container(
                                      padding: const EdgeInsets.only(bottom: 1),
                                      decoration: BoxDecoration(
                                        border: Border(
                                          bottom: BorderSide(
                                            width: 0.5,
                                            color: hairline2,
                                          ),
                                        ),
                                      ),
                                      child: Text(
                                        'Forgot?',
                                        style: TextStyle(
                                          fontFamily: 'Geist',
                                          fontSize: 12.5,
                                          fontWeight: FontWeight.w500,
                                          color: ink2,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      // Primary CTA — the one gradient use on this screen.
                      _PrimaryCta(
                        busy: _busy,
                        label: _signUpMode ? 'Create account' : 'Continue',
                        onTap: _continueWithEmail,
                      ),
                      const SizedBox(height: 18),
                      Row(
                        children: [
                          Expanded(
                              child: Container(height: 1, color: hairline)),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10),
                            child: Text(
                              'OR CONTINUE WITH',
                              style: TextStyle(
                                fontFamily: 'GeistMono',
                                fontSize: 9.5,
                                letterSpacing: 9.5 * 0.18,
                                color: muted,
                              ),
                            ),
                          ),
                          Expanded(
                              child: Container(height: 1, color: hairline)),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: _SocialButton(
                              label: 'Apple',
                              dark: dark,
                              hairline2: hairline2,
                              ink: ink,
                              mark: Icon(Icons.apple, size: 20, color: ink),
                              onTap: () => _showError(
                                  'Apple sign-in is coming soon on this build.'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _SocialButton(
                              label: 'Google',
                              dark: dark,
                              hairline2: hairline2,
                              ink: ink,
                              mark: const _GoogleMark(),
                              onTap: () => _run(() => signInWithGoogle(
                                  ref.read(firebaseAuthProvider))),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 32),
                      // Trust chips + footer. FittedBox keeps the pair on one
                      // line on devices narrower than the 402px design width.
                      Center(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Row(
                            children: [
                              _TrustChip(
                                icon: Icons.cloud_outlined,
                                label: 'NO FOOD PHOTOS SOLD',
                                dark: dark,
                                hairline: hairline,
                                ink2: ink2,
                              ),
                              const SizedBox(width: 12),
                              _TrustChip(
                                icon: Icons.check,
                                label: 'GDPR · CLOUD SYNC',
                                dark: dark,
                                hairline: hairline,
                                ink2: ink2,
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Center(
                        child: GestureDetector(
                          onTap: () =>
                              setState(() => _signUpMode = !_signUpMode),
                          child: Text.rich(
                            TextSpan(
                              text: _signUpMode
                                  ? 'Already have an account? '
                                  : 'New to ${AppConstants.appDisplayName}? ',
                              style: TextStyle(
                                fontFamily: 'Geist',
                                fontSize: 12.5,
                                color: ink2,
                              ),
                              children: [
                                TextSpan(
                                  text: _signUpMode
                                      ? 'Sign in'
                                      : 'Create an account',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: ink,
                                    decoration: TextDecoration.underline,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        height: 44,
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: _busy
                              ? null
                              : () => _run(() async {
                                    await ref
                                        .read(firebaseAuthProvider)
                                        .signInAnonymously();
                                  }),
                          style: OutlinedButton.styleFrom(
                            side: BorderSide(color: hairline2),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                            splashFactory: NoSplash.splashFactory,
                          ),
                          child: Text(
                            'Continue as guest',
                            style: TextStyle(
                              fontFamily: 'Geist',
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 13 * -0.005,
                              color: ink2,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _halo(Color color, double size) => IgnorePointer(
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [color, Colors.transparent],
              stops: const [0.0, 0.7],
            ),
          ),
        ),
      );
}

class _Field extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final IconData icon;
  final bool obscure;
  final TextInputType? keyboardType;
  final Widget? trailing;
  final Color fieldBg, hairline, ink, ink2, muted;
  final bool dark;

  const _Field({
    required this.label,
    required this.controller,
    required this.icon,
    required this.fieldBg,
    required this.dark,
    required this.hairline,
    required this.ink,
    required this.ink2,
    required this.muted,
    this.obscure = false,
    this.keyboardType,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      decoration: BoxDecoration(
        color: fieldBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(width: 0.5, color: hairline),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: dark ? Colors.white.withValues(alpha: 0.05) : Colors.white,
              borderRadius: BorderRadius.circular(9),
              border: Border.all(width: 0.5, color: hairline),
            ),
            child: Icon(icon, size: 14, color: ink2),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 48,
              child: Stack(
                children: [
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 2,
                    child: ExcludeSemantics(
                      child: Text(
                        label,
                        style: TextStyle(
                          fontFamily: 'GeistMono',
                          fontSize: 9.5,
                          letterSpacing: 9.5 * 0.16,
                          color: muted,
                        ),
                      ),
                    ),
                  ),
                  Positioned.fill(
                    child: Semantics(
                      label: label,
                      child: TextField(
                        controller: controller,
                        obscureText: obscure,
                        keyboardType: keyboardType,
                        autocorrect: false,
                        style: TextStyle(
                          fontFamily: 'Geist',
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 14 * -0.005,
                          color: ink,
                        ),
                        decoration: InputDecoration(
                          hintText: label == 'EMAIL' ? 'you@example.com' : null,
                          isDense: true,
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.only(top: 16),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (trailing != null)
            SizedBox(
              width: 48,
              height: 48,
              child: Center(child: trailing),
            ),
        ],
      ),
    );
  }
}

class _PrimaryCta extends StatelessWidget {
  final bool busy;
  final String label;
  final VoidCallback onTap;
  const _PrimaryCta(
      {required this.busy, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: busy ? null : onTap,
      child: Container(
        height: 54,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: AppColors.brandGradient,
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.cyan.withValues(alpha: 0.35),
              offset: const Offset(0, 12),
              blurRadius: 30,
            ),
          ],
          border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
        ),
        child: Center(
          child: busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Color(0xFF0B0D10),
                  ),
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontFamily: 'Geist',
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 15 * -0.01,
                        color: Color(0xFF0B0D10),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: const Color(0xFF0B0D10).withValues(alpha: 0.12),
                      ),
                      child: const Icon(
                        Icons.chevron_right,
                        size: 16,
                        color: Color(0xFF0B0D10),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _SocialButton extends StatelessWidget {
  final String label;
  final Widget mark;
  final bool dark;
  final Color hairline2, ink;
  final VoidCallback onTap;

  const _SocialButton({
    required this.label,
    required this.mark,
    required this.dark,
    required this.hairline2,
    required this.ink,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          color: dark ? Colors.white.withValues(alpha: 0.04) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(width: 0.5, color: hairline2),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            mark,
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Geist',
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                letterSpacing: 13.5 * -0.01,
                color: ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GoogleMark extends StatelessWidget {
  const _GoogleMark();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 18,
      height: 18,
      child: CustomPaint(painter: _GoogleMarkPainter()),
    );
  }
}

class _GoogleMarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    final paint = Paint()..style = PaintingStyle.fill;

    Path scaled(Path p) =>
        p.transform(Matrix4.diagonal3Values(s, s, 1).storage);

    paint.color = const Color(0xFF4285F4);
    canvas.drawPath(
      scaled(Path()
        ..moveTo(21.6, 12.2)
        ..cubicTo(21.6, 11.5, 21.5, 10.8, 21.4, 10.2)
        ..lineTo(12, 10.2)
        ..lineTo(12, 14.1)
        ..lineTo(17.4, 14.1)
        ..cubicTo(17.2, 15.4, 16.5, 16.4, 15.4, 17.1)
        ..lineTo(15.4, 19.6)
        ..lineTo(18.6, 19.6)
        ..cubicTo(20.5, 17.9, 21.6, 15.3, 21.6, 12.2)
        ..close()),
      paint,
    );
    paint.color = const Color(0xFF34A853);
    canvas.drawPath(
      scaled(Path()
        ..moveTo(12, 22)
        ..cubicTo(14.7, 22, 17, 21.1, 18.6, 19.6)
        ..lineTo(15.4, 17.1)
        ..cubicTo(14.5, 17.7, 13.4, 18.1, 12, 18.1)
        ..cubicTo(9.4, 18.1, 7.2, 16.4, 6.4, 14)
        ..lineTo(3.1, 14)
        ..lineTo(3.1, 16.6)
        ..cubicTo(4.7, 19.8, 8.1, 22, 12, 22)
        ..close()),
      paint,
    );
    paint.color = const Color(0xFFFBBC05);
    canvas.drawPath(
      scaled(Path()
        ..moveTo(6.4, 14)
        ..cubicTo(6.2, 13.4, 6.1, 12.7, 6.1, 12)
        ..cubicTo(6.1, 11.3, 6.2, 10.7, 6.4, 10)
        ..lineTo(6.4, 7.4)
        ..lineTo(3.1, 7.4)
        ..cubicTo(2.4, 8.8, 2, 10.3, 2, 12)
        ..cubicTo(2, 13.7, 2.4, 15.2, 3.1, 16.6)
        ..lineTo(6.4, 14)
        ..close()),
      paint,
    );
    paint.color = const Color(0xFFEA4335);
    canvas.drawPath(
      scaled(Path()
        ..moveTo(12, 5.9)
        ..cubicTo(13.5, 5.9, 14.8, 6.4, 15.8, 7.4)
        ..lineTo(18.7, 4.5)
        ..cubicTo(16.9, 3, 14.7, 2, 12, 2)
        ..cubicTo(8.1, 2, 4.7, 4.2, 3.1, 7.4)
        ..lineTo(6.4, 10)
        ..cubicTo(7.2, 7.6, 9.4, 5.9, 12, 5.9)
        ..close()),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _TrustChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool dark;
  final Color hairline, ink2;

  const _TrustChip({
    required this.icon,
    required this.label,
    required this.dark,
    required this.hairline,
    required this.ink2,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(99),
        color: dark
            ? Colors.white.withValues(alpha: 0.04)
            : Colors.white.withValues(alpha: 0.65),
        border: Border.all(width: 0.5, color: hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: AppColors.green),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontFamily: 'GeistMono',
              fontSize: 9.5,
              letterSpacing: 9.5 * 0.14,
              color: ink2,
            ),
          ),
        ],
      ),
    );
  }
}
