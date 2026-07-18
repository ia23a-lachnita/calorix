import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'providers/scan_providers.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/router/route_names.dart';
import '../../core/time/clock_provider.dart';
import '../../shared/providers/auth_provider.dart';
import '../../shared/services/upload_queue_service.dart';

/// Camera chrome tint per cx-screen-scan.jsx (dark liquid-glass).
const _chipBg = Color(0x8C14181E); // rgba(20,24,30,0.55)
const _chipBorder = Color(0x1FFFFFFF); // rgba(255,255,255,0.12)
const _chipInk = Color(0xFFF2F3F5);

class ScanScreen extends ConsumerStatefulWidget {
  const ScanScreen({super.key});

  @override
  ConsumerState<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends ConsumerState<ScanScreen>
    with WidgetsBindingObserver, TickerProviderStateMixin {
  CameraController? _cameraController;
  late final AnimationController _captureRingController;
  late final AnimationController _shimmerController;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _captureRingController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    );
    _shimmerController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    _initCamera();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _initCamera();
    if (state == AppLifecycleState.inactive) _disposeCamera();
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty || !mounted) return;
      final controller = CameraController(
        cameras.first,
        ResolutionPreset.high,
        enableAudio: false,
      );
      await controller.initialize();
      if (!mounted) {
        controller.dispose();
        return;
      }
      setState(() => _cameraController = controller);
    } catch (_) {
      // Camera unavailable (emulator, permission denied, hardware issue)
    }
  }

  void _disposeCamera() {
    _cameraController?.dispose();
    _cameraController = null;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _captureRingController.dispose();
    _shimmerController.dispose();
    _disposeCamera();
    super.dispose();
  }

  Future<void> _capture() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      return;
    }
    final captureState = ref.read(captureStateProvider);
    if (captureState == CaptureState.capturing) {
      ref.read(captureStateProvider.notifier).state = CaptureState.idle;
      _captureRingController.stop();
      _shimmerController.stop();
      return;
    }

    ref.read(captureStateProvider.notifier).state = CaptureState.capturing;
    _captureRingController.repeat();
    _shimmerController.repeat();

    try {
      final file = await _cameraController!.takePicture();
      await _processImage(file.path);
    } catch (e) {
      ref.read(captureStateProvider.notifier).state = CaptureState.idle;
      _captureRingController.stop();
      _shimmerController.stop();
    }
  }

  Future<void> _pickFromLibrary() async {
    final picker = ImagePicker();
    final file =
        await picker.pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (file == null) return;
    ref.read(captureStateProvider.notifier).state = CaptureState.capturing;
    await _processImage(file.path);
  }

  Future<void> _processImage(String path) async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    final scanMode = ref.read(scanModeProvider);
    final service = UploadQueueService(ref.read(clockProvider));
    final entryId = await service.enqueueAndUpload(
      localPath: path,
      uid: uid,
      scanMode: scanMode.name,
    );
    if (!mounted) return;
    ref.read(captureStateProvider.notifier).state = CaptureState.idle;
    _captureRingController.stop();
    _shimmerController.stop();
    context.goNamed(RouteNames.processing, pathParameters: {'id': entryId});
  }

  @override
  Widget build(BuildContext context) {
    final captureState = ref.watch(captureStateProvider);
    final scanMode = ref.watch(scanModeProvider);
    final isCapturing = captureState == CaptureState.capturing;
    // With extendBody the scaffold reports the nav height as bottom padding.
    final navHeight = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: LayoutBuilder(
        builder: (context, constraints) => Stack(
          fit: StackFit.expand,
          children: [
            if (_cameraController != null &&
                _cameraController!.value.isInitialized)
              CameraPreview(_cameraController!)
            else
              const _CameraPlaceholder(),

            // Analyzing sweep, confined to the reticle box per the handoff.
            if (isCapturing)
              Center(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: SizedBox(
                    width: 280,
                    height: 280,
                    child: _ScanShimmer(controller: _shimmerController),
                  ),
                ),
              ),

            _ReticleOverlay(glow: isCapturing),

            // Hint pill below the reticle.
            Positioned(
              left: 0,
              right: 0,
              top: constraints.maxHeight / 2 + 160,
              child: Center(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.28),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    isCapturing ? 'ANALYZING…' : 'FRAME YOUR MEAL · TAP ONCE',
                    style: AppTextStyles.labelMono.copyWith(
                      fontSize: 10,
                      letterSpacing: 10 * 0.20,
                      color: Colors.white.withValues(alpha: 0.80),
                    ),
                  ),
                ),
              ),
            ),

            // Top chrome: flash pill + profile chip, then the mode selector.
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _FlashChip(controller: _cameraController),
                          const _ProfileChip(),
                        ],
                      ),
                      const SizedBox(height: 18),
                      _ModeSelector(
                        mode: scanMode,
                        onChanged: (m) =>
                            ref.read(scanModeProvider.notifier).state = m,
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Capture controls above the floating nav.
            Positioned(
              left: 0,
              right: 0,
              bottom: navHeight + 40,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  _RoundChipWithLabel(
                    label: 'LIBRARY',
                    icon: Icons.photo_library_outlined,
                    onTap: _pickFromLibrary,
                  ),
                  const SizedBox(width: 48),
                  _CaptureButton(
                    isCapturing: isCapturing,
                    controller: _captureRingController,
                    onTap: _capture,
                  ),
                  const SizedBox(width: 48),
                  _RoundChipWithLabel(
                    label: 'RECENT',
                    icon: Icons.history_outlined,
                    onTap: () {},
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CameraPlaceholder extends StatelessWidget {
  const _CameraPlaceholder();
  @override
  Widget build(BuildContext context) => Container(
        color: AppColors.backgroundDark,
        child: const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.camera_alt_outlined,
                  color: AppColors.textSecondaryDark, size: 48),
              SizedBox(height: 12),
              Text('Camera initializing…',
                  style: TextStyle(
                      color: AppColors.textSecondaryDark, fontFamily: 'Geist')),
            ],
          ),
        ),
      );
}

// ─── Glass chrome ─────────────────────────────────────────────────────────────

class _GlassChip extends StatelessWidget {
  const _GlassChip({required this.child, this.width, this.height = 36});

  final Widget child;
  final double? width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          width: width,
          height: height,
          padding: width == null
              ? const EdgeInsets.symmetric(horizontal: 12)
              : EdgeInsets.zero,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _chipBg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(width: 0.5, color: _chipBorder),
          ),
          child: child,
        ),
      ),
    );
  }
}

class _FlashChip extends ConsumerStatefulWidget {
  const _FlashChip({this.controller});
  final CameraController? controller;
  @override
  ConsumerState<_FlashChip> createState() => _FlashChipState();
}

class _FlashChipState extends ConsumerState<_FlashChip> {
  FlashMode _mode = FlashMode.auto;

  void _cycle() {
    setState(() {
      _mode = switch (_mode) {
        FlashMode.auto => FlashMode.torch,
        FlashMode.torch => FlashMode.off,
        FlashMode.off => FlashMode.auto,
        _ => FlashMode.auto,
      };
    });
    widget.controller?.setFlashMode(_mode);
  }

  String get _label => switch (_mode) {
        FlashMode.auto => 'Flash · Auto',
        FlashMode.torch => 'Flash · On',
        FlashMode.off => 'Flash · Off',
        _ => 'Flash · Auto',
      };

  IconData get _icon => switch (_mode) {
        FlashMode.auto => Icons.flash_auto_outlined,
        FlashMode.torch => Icons.flash_on_outlined,
        FlashMode.off => Icons.flash_off_outlined,
        _ => Icons.flash_auto_outlined,
      };

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _cycle,
      child: _GlassChip(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(_icon, color: _chipInk, size: 14),
            const SizedBox(width: 6),
            Text(
              _label,
              style: AppTextStyles.labelSmall
                  .copyWith(fontSize: 12, color: _chipInk),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileChip extends ConsumerWidget {
  const _ProfileChip();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider).valueOrNull;
    final isAnonymous = user == null ||
        (user.isAnonymous == true) ||
        (user.displayName == null && user.email == null);

    return GestureDetector(
      // Push (not go) so the sheet keeps a back stack and can be closed.
      onTap: () => context.pushNamed(RouteNames.profile),
      child: _GlassChip(
        width: 36,
        child: isAnonymous
            ? const Icon(Icons.person_outline, size: 16, color: _chipInk)
            : Text(
                user.displayName?.isNotEmpty == true
                    ? user.displayName![0].toUpperCase()
                    : user.email![0].toUpperCase(),
                style: const TextStyle(
                  color: _chipInk,
                  fontSize: 13,
                  fontFamily: 'Geist',
                  fontWeight: FontWeight.w700,
                ),
              ),
      ),
    );
  }
}

class _ModeSelector extends StatelessWidget {
  const _ModeSelector({required this.mode, required this.onChanged});

  final ScanMode mode;
  final ValueChanged<ScanMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: _chipBg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              width: 0.5,
              color: Colors.white.withValues(alpha: 0.10),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: ScanMode.values.map((m) {
              final isActive = m == mode;
              return GestureDetector(
                onTap: () => onChanged(m),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: isActive
                        ? Colors.white.withValues(alpha: 0.95)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    switch (m) {
                      ScanMode.meal => 'Meal',
                      ScanMode.barcode => 'Barcode',
                      ScanMode.label => 'Label',
                    },
                    style: TextStyle(
                      fontFamily: 'Geist',
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: isActive
                          ? const Color(0xFF0B0D10)
                          : Colors.white.withValues(alpha: 0.7),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}

class _RoundChipWithLabel extends StatelessWidget {
  const _RoundChipWithLabel({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _GlassChip(
            width: 48,
            height: 48,
            child: Icon(icon, color: _chipInk, size: 20),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: AppTextStyles.labelMono.copyWith(
              fontSize: 10,
              letterSpacing: 10 * 0.14,
              color: const Color(0xFFF2F3F5).withValues(alpha: 0.55),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Reticle + shimmer ────────────────────────────────────────────────────────

class _ReticleOverlay extends StatelessWidget {
  const _ReticleOverlay({required this.glow});

  final bool glow;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: CustomPaint(
        size: const Size(280, 280),
        painter: _ReticlePainter(glow: glow),
      ),
    );
  }
}

class _ReticlePainter extends CustomPainter {
  _ReticlePainter({required this.glow});

  final bool glow;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFFF2F3F5).withValues(alpha: 0.95)
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    if (glow) {
      paint.maskFilter = const MaskFilter.blur(BlurStyle.solid, 3);
    }

    const arm = 32.0;
    const r = 6.0;
    final w = size.width;
    final h = size.height;

    // Four rounded corner brackets per cx-screen-scan.jsx.
    Path corner(Offset origin, double sx, double sy) {
      // Draw in a local frame where the corner is top-left, then mirror.
      final path = Path()
        ..moveTo(0, arm)
        ..lineTo(0, r)
        ..arcToPoint(const Offset(r, 0), radius: const Radius.circular(r))
        ..lineTo(arm, 0);
      final m = Matrix4.identity()
        ..translateByDouble(origin.dx, origin.dy, 0, 1)
        ..scaleByDouble(sx, sy, 1, 1);
      return path.transform(m.storage);
    }

    canvas.drawPath(corner(Offset.zero, 1, 1), paint);
    canvas.drawPath(corner(Offset(w, 0), -1, 1), paint);
    canvas.drawPath(corner(Offset(0, h), 1, -1), paint);
    canvas.drawPath(corner(Offset(w, h), -1, -1), paint);
  }

  @override
  bool shouldRepaint(_ReticlePainter old) => old.glow != glow;
}

class _ScanShimmer extends StatelessWidget {
  const _ScanShimmer({required this.controller});

  final AnimationController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) => CustomPaint(
        painter: _ShimmerPainter(progress: controller.value),
      ),
    );
  }
}

class _ShimmerPainter extends CustomPainter {
  _ShimmerPainter({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height * progress;
    final band = Rect.fromLTWH(0, y - 60, size.width, 120);
    canvas.drawRect(
      band,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.transparent,
            AppColors.cyan.withValues(alpha: 0.55),
            Colors.transparent,
          ],
        ).createShader(band),
    );
    // Leading glow line.
    canvas.drawLine(
      Offset(0, y),
      Offset(size.width, y),
      Paint()
        ..color = AppColors.cyan.withValues(alpha: 0.95)
        ..strokeWidth = 2
        ..maskFilter = const MaskFilter.blur(BlurStyle.solid, 6),
    );
  }

  @override
  bool shouldRepaint(_ShimmerPainter old) => old.progress != progress;
}

// ─── Capture button ───────────────────────────────────────────────────────────

class _CaptureButton extends StatelessWidget {
  const _CaptureButton({
    required this.isCapturing,
    required this.controller,
    required this.onTap,
  });

  final bool isCapturing;
  final AnimationController controller;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 80,
        height: 80,
        child: AnimatedBuilder(
          animation: controller,
          builder: (context, child) => CustomPaint(
            painter: _CapturePainter(
              isCapturing: isCapturing,
              progress: controller.value,
            ),
            child: child,
          ),
          child: Center(
            child: isCapturing
                ? Container(
                    key: const Key('capture-core-stop'),
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: const Color(0xEB0B0D10),
                      borderRadius: BorderRadius.circular(6),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.cyan.withValues(alpha: 0.30),
                          blurRadius: 14,
                        ),
                      ],
                    ),
                  )
                : Container(
                    key: const Key('capture-core-idle'),
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      gradient:
                          const LinearGradient(colors: AppColors.brandGradient),
                      shape: BoxShape.circle,
                      border: Border.all(
                        width: 1,
                        color: Colors.white.withValues(alpha: 0.20),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.cyan.withValues(alpha: 0.50),
                          blurRadius: 18,
                        ),
                      ],
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class _CapturePainter extends CustomPainter {
  _CapturePainter({required this.isCapturing, required this.progress});

  final bool isCapturing;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);

    // Outer ring: 6px, near-black glass in both states.
    final outer = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..color = const Color(0xEB0B0D10);
    canvas.drawCircle(center, size.width / 2 - 3, outer);

    // Animation ring hugging the outer ring's inner edge.
    final animRadius = size.width / 2 - 6 - 1.25;
    if (isCapturing) {
      final sweep = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..shader = SweepGradient(
          colors: const [
            AppColors.blue,
            AppColors.cyan,
            AppColors.green,
            AppColors.blue,
          ],
          transform: GradientRotation(progress * 2 * math.pi),
        ).createShader(Rect.fromCircle(center: center, radius: animRadius));
      canvas.drawCircle(center, animRadius, sweep);
    } else {
      final idle = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..color = const Color(0xFF8C8C8C).withValues(alpha: 0.06);
      canvas.drawCircle(center, animRadius, idle);
    }
  }

  @override
  bool shouldRepaint(_CapturePainter old) =>
      old.isCapturing != isCapturing || old.progress != progress;
}
