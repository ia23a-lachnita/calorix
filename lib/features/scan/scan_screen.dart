import 'dart:math' as math;
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'providers/scan_providers.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/router/route_names.dart';
import '../../shared/providers/auth_provider.dart';
import '../../shared/services/upload_queue_service.dart';

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
      duration: const Duration(seconds: 2),
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
    if (_cameraController == null || !_cameraController!.value.isInitialized) return;
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
    final file = await picker.pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (file == null) return;
    ref.read(captureStateProvider.notifier).state = CaptureState.capturing;
    await _processImage(file.path);
  }

  Future<void> _processImage(String path) async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    final scanMode = ref.read(scanModeProvider);
    final service = UploadQueueService();
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

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Camera preview
          if (_cameraController != null && _cameraController!.value.isInitialized)
            CameraPreview(_cameraController!)
          else
            const _CameraPlaceholder(),

          // Scan shimmer overlay
          if (isCapturing) _ScanShimmer(controller: _shimmerController),

          // Reticle
          const _ReticleOverlay(),

          // Top controls — explicitly anchored to top of screen
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _FlashChip(controller: _cameraController),
                    const _ProfileChip(),
                  ],
                ),
              ),
            ),
          ),

          // Mode selector — top overlay below flash row
          Positioned(
            top: 110,
            left: 0,
            right: 0,
            child: Center(
              child: _ModeSelector(
                mode: scanMode,
                onChanged: (m) => ref.read(scanModeProvider.notifier).state = m,
              ),
            ),
          ),

          // Hint text + capture button
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Hint text
                if (!isCapturing)
                  const Text(
                    'Center your meal',
                    style: TextStyle(
                      color: Color(0xCCFFFFFF),
                      fontSize: 13,
                      fontFamily: 'Inter Tight',
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                const SizedBox(height: 12),

                // Bottom row: library + capture + recent
                _BottomRow(
                  isCapturing: isCapturing,
                  captureController: _captureRingController,
                  onCapture: _capture,
                  onLibrary: _pickFromLibrary,
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ],
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
              Icon(Icons.camera_alt_outlined, color: AppColors.textSecondaryDark, size: 48),
              SizedBox(height: 12),
              Text('Camera initializing…',
                  style: TextStyle(color: AppColors.textSecondaryDark, fontFamily: 'Inter Tight')),
            ],
          ),
        ),
      );
}

class _ScanShimmer extends StatelessWidget {
  final AnimationController controller;
  const _ScanShimmer({required this.controller});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return CustomPaint(
          painter: _ShimmerPainter(progress: controller.value),
        );
      },
    );
  }
}

class _ShimmerPainter extends CustomPainter {
  final double progress;
  _ShimmerPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height * progress;
    final rect = Rect.fromLTWH(0, y - 40, size.width, 80);
    final paint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Colors.transparent,
          AppColors.cyan.withAlpha(80),
          Colors.transparent,
        ],
      ).createShader(rect);
    canvas.drawRect(rect, paint);
  }

  @override
  bool shouldRepaint(_ShimmerPainter old) => old.progress != progress;
}

class _ReticleOverlay extends StatelessWidget {
  const _ReticleOverlay();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: CustomPaint(
        size: const Size(240, 240),
        painter: _ReticlePainter(),
      ),
    );
  }
}

class _ReticlePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.cameraOverlayText.withAlpha(200)
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    const len = 28.0;
    final corners = [
      Offset.zero,
      Offset(size.width, 0),
      Offset(size.width, size.height),
      Offset(0, size.height),
    ];
    for (final corner in corners) {
      final dx = corner.dx == 0 ? len : -len;
      final dy = corner.dy == 0 ? len : -len;
      canvas.drawLine(corner, Offset(corner.dx + dx, corner.dy), paint);
      canvas.drawLine(corner, Offset(corner.dx, corner.dy + dy), paint);
    }
  }

  @override
  bool shouldRepaint(_ReticlePainter old) => false;
}

class _FlashChip extends ConsumerStatefulWidget {
  final CameraController? controller;
  const _FlashChip({this.controller});
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
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.cameraOverlayBg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.cameraOverlayText.withAlpha(50)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(_icon, color: AppColors.cameraOverlayText, size: 14),
            const SizedBox(width: 4),
            Text(_label,
                style: AppTextStyles.labelSmall.copyWith(color: AppColors.cameraOverlayText)),
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
    final isAnonymous = user == null || (user.isAnonymous == true) ||
        (user.displayName == null && user.email == null);

    return GestureDetector(
      onTap: () => context.goNamed(RouteNames.profile),
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: AppColors.cameraOverlayBg,
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.cameraOverlayText.withAlpha(60), width: 1.5),
        ),
        child: Center(
          child: isAnonymous
              ? const Icon(Icons.person_outline, size: 20, color: AppColors.cameraOverlayText)
              : Text(
                  user.displayName?.isNotEmpty == true
                      ? user.displayName![0].toUpperCase()
                      : user.email![0].toUpperCase(),
                  style: const TextStyle(
                    color: AppColors.cameraOverlayText,
                    fontSize: 14,
                    fontFamily: 'Inter Tight',
                    fontWeight: FontWeight.w700,
                  ),
                ),
        ),
      ),
    );
  }
}

class _ModeSelector extends StatelessWidget {
  final ScanMode mode;
  final ValueChanged<ScanMode> onChanged;
  const _ModeSelector({required this.mode, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.cameraOverlayBg,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: ScanMode.values.map((m) {
          final isActive = m == mode;
          return GestureDetector(
            onTap: () => onChanged(m),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: isActive ? AppColors.cameraOverlayText : Colors.transparent,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                switch (m) {
                  ScanMode.meal => 'Meal',
                  ScanMode.barcode => 'Barcode',
                  ScanMode.label => 'Label',
                },
                style: TextStyle(
                  fontFamily: 'Inter Tight',
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isActive ? AppColors.backgroundDark : AppColors.cameraOverlayText,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _BottomRow extends StatelessWidget {
  final bool isCapturing;
  final AnimationController captureController;
  final VoidCallback onCapture;
  final VoidCallback onLibrary;

  const _BottomRow({
    required this.isCapturing,
    required this.captureController,
    required this.onCapture,
    required this.onLibrary,
  });

  static const _labelStyle = TextStyle(
    color: AppColors.cameraOverlayText,
    fontSize: 9,
    fontFamily: 'Inter Tight',
    fontWeight: FontWeight.w500,
    letterSpacing: 0.8,
  );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Library button + label
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              GestureDetector(
                onTap: onLibrary,
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.cameraOverlayBg,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.cameraOverlayText.withAlpha(50)),
                  ),
                  child: const Icon(Icons.photo_library_outlined,
                      color: AppColors.cameraOverlayText, size: 22),
                ),
              ),
              const SizedBox(height: 4),
              const Text('LIBRARY', style: _labelStyle),
            ],
          ),
          // Capture button
          _CaptureButton(
            isCapturing: isCapturing,
            controller: captureController,
            onTap: onCapture,
          ),
          // Recent button + label
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.cameraOverlayBg,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.cameraOverlayText.withAlpha(50)),
                ),
                child: const Icon(Icons.history_outlined,
                    color: AppColors.cameraOverlayText, size: 22),
              ),
              const SizedBox(height: 4),
              const Text('RECENT', style: _labelStyle),
            ],
          ),
        ],
      ),
    );
  }
}

class _CaptureButton extends StatelessWidget {
  final bool isCapturing;
  final AnimationController controller;
  final VoidCallback onTap;

  const _CaptureButton({
    required this.isCapturing,
    required this.controller,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final innerColor = isDark ? AppColors.backgroundDark : Colors.white;

    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 100,
        height: 100,
        child: AnimatedBuilder(
          animation: controller,
          builder: (context, child) {
            return CustomPaint(
              painter: _CapturePainter(
                isCapturing: isCapturing,
                progress: controller.value,
              ),
              child: child,
            );
          },
          child: Center(
            child: Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                color: innerColor,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: isCapturing
                    ? Container(
                        width: 22,
                        height: 22,
                        decoration: BoxDecoration(
                          color: isDark ? AppColors.cameraOverlayText : AppColors.backgroundDark,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      )
                    : Container(
                        width: 20,
                        height: 20,
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            colors: [AppColors.blue, AppColors.cyan],
                          ),
                          shape: BoxShape.circle,
                        ),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CapturePainter extends CustomPainter {
  final bool isCapturing;
  final double progress;

  _CapturePainter({required this.isCapturing, required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 2;

    if (isCapturing) {
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..shader = SweepGradient(
          colors: AppColors.sweepGradient,
          transform: GradientRotation(progress * 2 * math.pi),
        ).createShader(Rect.fromCircle(center: center, radius: radius));
      canvas.drawCircle(center, radius, paint);
    } else {
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = Colors.white.withValues(alpha: 0.10);
      canvas.drawCircle(center, radius, paint);
    }
  }

  @override
  bool shouldRepaint(_CapturePainter old) =>
      old.isCapturing != isCapturing || old.progress != progress;
}
