import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/app_constants.dart';
import '../../core/motion/app_motion.dart';
import '../../core/router/route_names.dart';
import '../../core/theme/app_colors.dart';
import '../../shared/providers/auth_provider.dart';
import '../../shared/widgets/brand.dart';

/// Splash per handoff cx-screen-loading.jsx: halo + tick ring around the brand
/// mark, staged progress copy, no bare spinners. Routes to login or scan once
/// the auth session resolves and the minimum splash beat has played.
class LoadingScreen extends ConsumerStatefulWidget {
  const LoadingScreen({
    super.key,
    this.navigateWhenReady = true,
    this.freezeForCapture = false,
  });

  final bool navigateWhenReady;
  final bool freezeForCapture;

  @override
  ConsumerState<LoadingScreen> createState() => _LoadingScreenState();
}

class _LoadingScreenState extends ConsumerState<LoadingScreen>
    with TickerProviderStateMixin {
  static const _stages = [
    (pct: 18, label: 'WAKING SENSORS'),
    (pct: 46, label: 'CONNECTING · AI CLOUD'),
    (pct: 74, label: 'SYNCING TODAY'),
    (pct: 96, label: 'READY'),
  ];

  late final AnimationController _spin = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );
  late final AnimationController _halo = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );
  late final AnimationController _dot = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  Timer? _stageTimer;
  Timer? _minimumBeatTimer;
  int _stage = 0;
  bool _minBeatDone = false;
  bool _navigated = false;
  bool? _reducedMotion;

  @override
  void initState() {
    super.initState();
    if (widget.freezeForCapture) {
      _stage = _stages.length - 1;
      _minBeatDone = true;
      return;
    }
    _stageTimer = Timer.periodic(const Duration(milliseconds: 1100), (timer) {
      if (!mounted || _stage >= _stages.length - 1) {
        timer.cancel();
        return;
      }
      setState(() => _stage += 1);
    });
    _minimumBeatTimer = Timer(const Duration(milliseconds: 1800), () {
      if (!mounted) return;
      _minBeatDone = true;
      _maybeNavigate();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reducedMotion = AppMotion.reducedOf(context);
    if (_reducedMotion == reducedMotion) return;
    _reducedMotion = reducedMotion;
    if (reducedMotion) {
      _spin
        ..stop()
        ..value = 0;
      _halo
        ..stop()
        ..value = 0.5;
      _dot
        ..stop()
        ..value = 1;
    } else {
      _spin.repeat();
      _halo.repeat(reverse: true);
      _dot.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _stageTimer?.cancel();
    _minimumBeatTimer?.cancel();
    _spin.dispose();
    _halo.dispose();
    _dot.dispose();
    super.dispose();
  }

  void _maybeNavigate() {
    if (!widget.navigateWhenReady || _navigated || !_minBeatDone || !mounted) {
      return;
    }
    final auth = ref.read(authStateProvider);
    if (auth.isLoading) return;
    _navigated = true;
    final signedIn = auth.valueOrNull != null;
    context.go(signedIn ? RoutePaths.scan : RoutePaths.login);
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authStateProvider, (_, __) => _maybeNavigate());
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = dark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final ink2 = dark
        ? AppColors.textPrimaryDark.withValues(alpha: 0.78)
        : const Color(0xFF3A4048);
    final muted = dark
        ? AppColors.textPrimaryDark.withValues(alpha: 0.50)
        : const Color(0xFF7B8088);
    final cur = _stages[_stage];

    return Scaffold(
      body: Stack(
        children: [
          // Backdrop: base radial + two soft accent halos.
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.center,
                  radius: 1.1,
                  colors: dark
                      ? const [Color(0xFF0F1319), Color(0xFF0A0D11)]
                      : const [Color(0xFFF7F5F0), Color(0xFFECE9E3)],
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(-0.4, -0.56),
                  radius: 0.7,
                  colors: [
                    AppColors.blue.withValues(alpha: dark ? 0.22 : 0.18),
                    Colors.transparent,
                  ],
                  stops: const [0.0, 0.65],
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0.6, 0.56),
                  radius: 0.7,
                  colors: [
                    (dark ? AppColors.green : AppColors.cyan)
                        .withValues(alpha: dark ? 0.18 : 0.16),
                    Colors.transparent,
                  ],
                  stops: const [0.0, 0.65],
                ),
              ),
            ),
          ),
          // Dot mesh texture with radial fade.
          Positioned.fill(
            child: CustomPaint(
              painter: _DotMeshPainter(dark: dark),
            ),
          ),
          // Top status pill.
          Positioned(
            top: 64,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.fromLTRB(9, 6, 12, 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: dark
                      ? Colors.white.withValues(alpha: 0.05)
                      : Colors.white.withValues(alpha: 0.72),
                  border: Border.all(
                    width: 0.5,
                    color: dark
                        ? Colors.white.withValues(alpha: 0.10)
                        : const Color(0xFF0B0D10).withValues(alpha: 0.07),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.green,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.green.withValues(alpha: 0.2),
                            spreadRadius: 3,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'V1.0 · IOS',
                      style: TextStyle(
                        fontFamily: 'GeistMono',
                        fontSize: 10.5,
                        letterSpacing: 10.5 * 0.16,
                        color: ink2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // Center: ring + logo + wordmark + tagline.
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 196,
                  height: 196,
                  child: Stack(
                    children: [
                      AnimatedBuilder(
                        animation: _halo,
                        builder: (context, _) {
                          final v = Curves.easeInOut.transform(_halo.value);
                          return Positioned.fill(
                            child: Transform.scale(
                              scale: 1 + 0.06 * v,
                              child: Opacity(
                                opacity: 0.65 + 0.30 * v,
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: RadialGradient(
                                      colors: [
                                        AppColors.cyan.withValues(alpha: 0.40),
                                        Colors.transparent,
                                      ],
                                      stops: const [0.0, 0.7],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                      AnimatedBuilder(
                        animation: _spin,
                        builder: (context, _) => CustomPaint(
                          size: const Size.square(196),
                          painter: _LoadingRingPainter(
                            dark: dark,
                            rotation: _spin.value * 2 * math.pi,
                          ),
                        ),
                      ),
                      Positioned.fill(
                        child: Padding(
                          padding: const EdgeInsets.all(30),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color:
                                  dark ? const Color(0xFF0E1217) : Colors.white,
                              border: Border.all(
                                width: 0.5,
                                color: dark
                                    ? Colors.white.withValues(alpha: 0.10)
                                    : const Color(0xFF0B0D10)
                                        .withValues(alpha: 0.06),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: dark
                                      ? Colors.black.withValues(alpha: 0.45)
                                      : const Color(0xFF0B0D10)
                                          .withValues(alpha: 0.10),
                                  offset: const Offset(0, 18),
                                  blurRadius: 40,
                                ),
                              ],
                            ),
                            child: const Center(child: CxLogo(size: 68)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),
                const CxWordmark(height: 32),
                const SizedBox(height: 10),
                Text(
                  'SNAP · TRACK · STAY ON TARGET',
                  style: TextStyle(
                    fontFamily: 'GeistMono',
                    fontSize: 10.5,
                    letterSpacing: 10.5 * 0.22,
                    color: muted,
                  ),
                ),
              ],
            ),
          ),
          // Bottom: staged status + determinate progress.
          Positioned(
            left: 24,
            right: 24,
            bottom: 56,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Row(
                      children: [
                        AnimatedBuilder(
                          animation: _dot,
                          builder: (context, _) => Opacity(
                            opacity: 0.6 + 0.4 * _dot.value,
                            child: Container(
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: AppColors.cyan,
                                boxShadow: [
                                  BoxShadow(
                                    color:
                                        AppColors.cyan.withValues(alpha: 0.2),
                                    spreadRadius: 3,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          cur.label,
                          style: TextStyle(
                            fontFamily: 'GeistMono',
                            fontSize: 10.5,
                            letterSpacing: 10.5 * 0.16,
                            color: ink2,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      '${cur.pct}%',
                      style: TextStyle(
                        fontFamily: 'GeistMono',
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: ink,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: SizedBox(
                    height: 4,
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: ColoredBox(
                            color: dark
                                ? Colors.white.withValues(alpha: 0.06)
                                : const Color(0xFF0B0D10)
                                    .withValues(alpha: 0.07),
                          ),
                        ),
                        AnimatedFractionallySizedBox(
                          duration: AppMotion.durationOf(
                            context,
                            const Duration(milliseconds: 900),
                          ),
                          curve: Curves.easeOutCubic,
                          alignment: Alignment.centerLeft,
                          widthFactor: cur.pct / 100,
                          // Must expand: a bare DecoratedBox has no child and
                          // collapses to zero height, leaving the bar empty.
                          child: SizedBox.expand(
                            child: DecoratedBox(
                              key: const Key('loading-progress-fill'),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(999),
                                gradient: const LinearGradient(
                                  colors: AppColors.brandGradient,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color:
                                        AppColors.cyan.withValues(alpha: 0.45),
                                    blurRadius: 12,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${AppConstants.appDisplayName.toUpperCase()} ENGINE · V1.0',
                      style: TextStyle(
                        fontFamily: 'GeistMono',
                        fontSize: 9.5,
                        letterSpacing: 9.5 * 0.14,
                        color: muted,
                      ),
                    ),
                    Text(
                      'SECURE · END-TO-END',
                      style: TextStyle(
                        fontFamily: 'GeistMono',
                        fontSize: 9.5,
                        letterSpacing: 9.5 * 0.14,
                        color: muted,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DotMeshPainter extends CustomPainter {
  final bool dark;
  const _DotMeshPainter({required this.dark});

  @override
  void paint(Canvas canvas, Size size) {
    const pitch = 14.0;
    final center = Offset(size.width / 2, size.height / 2);
    final maxDist = center.distance;
    final baseColor = dark
        ? Colors.white.withValues(alpha: 0.55)
        : const Color(0xFF0B0D10).withValues(alpha: 0.42);
    final globalOpacity = dark ? 0.30 : 0.32;
    final paint = Paint();
    for (double x = 0; x < size.width; x += pitch) {
      for (double y = 0; y < size.height; y += pitch) {
        final d = (Offset(x, y) - center).distance / maxDist;
        // radial mask: solid to 60%, fading to transparent at 100%
        final mask = d <= 0.6 ? 1.0 : (1 - (d - 0.6) / 0.4).clamp(0.0, 1.0);
        if (mask <= 0) continue;
        paint.color = baseColor.withValues(
          alpha: baseColor.a * globalOpacity * mask,
        );
        canvas.drawCircle(Offset(x, y), 1.1, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DotMeshPainter oldDelegate) =>
      oldDelegate.dark != dark;
}

class _LoadingRingPainter extends CustomPainter {
  final bool dark;
  final double rotation;
  const _LoadingRingPainter({required this.dark, required this.rotation});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    const r = 84.0;

    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = dark
          ? Colors.white.withValues(alpha: 0.06)
          : const Color(0xFF0B0D10).withValues(alpha: 0.06);
    canvas.drawCircle(center, r, track);

    final tick = Paint()
      ..color = dark
          ? Colors.white.withValues(alpha: 0.18)
          : const Color(0xFF0B0D10).withValues(alpha: 0.18);
    for (int i = 0; i < 60; i++) {
      final a = (i / 60) * 2 * math.pi;
      final major = i % 5 == 0;
      final outer = Offset(
        center.dx + math.cos(a) * 70,
        center.dy + math.sin(a) * 70,
      );
      final inner = Offset(
        center.dx + math.cos(a) * (major ? 64 : 67),
        center.dy + math.sin(a) * (major ? 64 : 67),
      );
      tick.strokeWidth = major ? 1 : 0.5;
      canvas.drawLine(outer, inner, tick);
    }

    // Spinning gradient arc: 28% of the circle, round caps, starting at top.
    final rect = Rect.fromCircle(center: center, radius: r);
    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: AppColors.brandGradient,
      ).createShader(rect);
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(rotation);
    canvas.translate(-center.dx, -center.dy);
    canvas.drawArc(rect, -math.pi / 2, 2 * math.pi * 0.28, false, arc);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _LoadingRingPainter oldDelegate) =>
      oldDelegate.rotation != rotation || oldDelegate.dark != dark;
}
