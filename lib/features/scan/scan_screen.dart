import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show DeviceOrientation;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/scan_providers.dart';
import 'widgets/capture_button.dart';
import 'widgets/scan_mode_selector.dart';
import 'permission_screen.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/motion/app_motion.dart';
import '../../core/router/route_names.dart';
import '../../shared/providers/auth_provider.dart';
import '../../shared/providers/ui_diff_provider.dart';
import '../../shared/services/camera_service.dart';
import '../../debug/debug_deep_links.dart';

/// Camera chrome tint per cx-screen-scan.jsx (dark liquid-glass).
const _chipBg = Color(0x8C14181E); // rgba(20,24,30,0.55)
const _chipBorder = Color(0x1FFFFFFF); // rgba(255,255,255,0.12)
const _chipInk = Color(0xFFF2F3F5);

class ScanScreen extends ConsumerStatefulWidget {
  const ScanScreen({
    super.key,
    this.onManualEntryRequested,
    this.onRecentRequested,
    this.onPermissionGranted,
    this.initializeCamera = true,
    this.initialCaptureState,
    this.fixturePreviewAsset,
  });

  final VoidCallback? onManualEntryRequested;
  final VoidCallback? onRecentRequested;
  final VoidCallback? onPermissionGranted;
  final bool initializeCamera;
  final CaptureState? initialCaptureState;
  final String? fixturePreviewAsset;

  @override
  ConsumerState<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends ConsumerState<ScanScreen>
    with WidgetsBindingObserver {
  late final CameraLifecycleService _cameraLifecycle;
  String? _capturedImagePath;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _cameraLifecycle = ref.read(cameraLifecycleServiceProvider);
    if (widget.initializeCamera) {
      _checkPermission();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_resumeAndRecheckPermission());
    } else if (state == AppLifecycleState.inactive) {
      unawaited(_cameraLifecycle.pause());
    }
  }

  Future<void> _resumeAndRecheckPermission() async {
    await _checkPermission();
  }

  Future<void> _checkPermission() async {
    final service = ref.read(cameraServiceProvider);
    var granted = await service.hasPermission();
    if (granted) {
      try {
        await _cameraLifecycle.resume();
      } catch (_) {
        granted = false;
      }
    }
    if (!mounted) return;
    ref.read(captureStateProvider.notifier).state =
        granted ? CaptureState.idle : CaptureState.denied;
    // The initial state is already idle, so a successful camera startup does
    // not notify Riverpod. Rebuild explicitly to reveal the new controller.
    setState(() {});
    unawaited(_emitDeferredCaptureSignal(granted: granted));
    if (granted) widget.onPermissionGranted?.call();
  }

  Future<void> _regrantCamera() async {
    final settings = ref.read(cameraSettingsServiceProvider);
    if (await settings.requiresSettings()) {
      await settings.openSettings();
      return;
    }
    final result = await ref.read(cameraServiceProvider).requestPermission();
    switch (result) {
      case CameraPermissionRequestResult.granted:
        await _checkPermission();
      case CameraPermissionRequestResult.settingsRequired:
        await settings.openSettings();
      case CameraPermissionRequestResult.denied:
        break;
    }
  }

  Future<void> _emitDeferredCaptureSignal({required bool granted}) async {
    final signal = ref.read(uiDiffPendingCaptureSignalProvider);
    if (signal == null || signal.screenId != 'scan_idle') return;
    final line = granted
        ? signal.line
        : UiDiffCaptureSignal.blocked(
            nonce: signal.nonce,
            screenId: signal.screenId,
            reason: 'camera_permission_denied',
          ).line;
    // A post-frame callback runs before the engine has necessarily rasterized
    // and composited that frame. Three completed frames keep debug captures
    // from observing partially painted text/icon layers on physical devices.
    for (var frame = 0; frame < 3; frame++) {
      await WidgetsBinding.instance.endOfFrame;
    }
    if (!mounted || ref.read(uiDiffPendingCaptureSignalProvider) != signal) {
      return;
    }
    debugPrint(line);
    ref.read(uiDiffPendingCaptureSignalProvider.notifier).state = null;
  }

  void _addManually() {
    final callback = widget.onManualEntryRequested;
    if (callback != null) {
      callback();
      return;
    }
    context.pushNamed(RouteNames.manual);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_cameraLifecycle.dispose());
    super.dispose();
  }

  /// Shared guarded path for both the shutter and the LIBRARY chip: while
  /// not idle, taps are a strict no-op (no toggle-back, no stop control).
  Future<void> _runCapture(
    Future<XFile?> Function(CameraService service) captureFn,
  ) async {
    if (ref.read(captureStateProvider) != CaptureState.idle) return;
    ref.read(captureStateProvider.notifier).state = CaptureState.capturing;
    try {
      final service = ref.read(cameraServiceProvider);
      final file = await captureFn(service);
      if (file == null) return;
      await _processImage(file.path);
    } catch (_) {
      // Processing errors return the UI to idle; Task 7 owns retry UX.
    } finally {
      _resetToIdle();
    }
  }

  void _resetToIdle() {
    if (!mounted) return;
    ref.read(captureStateProvider.notifier).state = CaptureState.idle;
  }

  Future<void> _capture() => _runCapture((service) => service.captureStill());

  Future<void> _pickFromLibrary() =>
      _runCapture((service) => service.pickFromLibrary());

  Future<void> _processImage(String path) async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    final scanMode = ref.read(scanModeProvider);
    final gateway = ref.read(scanUploadGatewayProvider);
    final entryId = await gateway.enqueue(
      localPath: path,
      uid: uid,
      scanMode: scanMode.name,
    );
    if (!mounted) return;
    setState(() => _capturedImagePath = path);
    final morphDuration =
        AppMotion.durationOf(context, MotionDurations.cardEntrance);
    if (morphDuration != Duration.zero) {
      await Future<void>.delayed(morphDuration);
    }
    if (!mounted) return;
    setState(() => _capturedImagePath = null);
    context.goNamed(RouteNames.processing, pathParameters: {'id': entryId});
    gateway.scheduleDrain();
  }

  @override
  Widget build(BuildContext context) {
    final captureState =
        widget.initialCaptureState ?? ref.watch(captureStateProvider);

    if (captureState == CaptureState.denied) {
      return PermissionScreen(
        onOpenSettings: _regrantCamera,
        onAddManually: _addManually,
        showFixtureSystemPrompt: ref.watch(uiDiffFixtureEnabledProvider),
      );
    }

    final scanMode = ref.watch(scanModeProvider);
    final isCapturing = captureState == CaptureState.capturing;
    final cameraService = ref.watch(cameraServiceProvider);
    final deviceService =
        cameraService is DeviceCameraService ? cameraService : null;
    final previewController = deviceService?.previewController;
    // With extendBody the scaffold reports the nav height as bottom padding.
    final navHeight = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (previewController != null &&
              previewController.value.isInitialized)
            _CoverCameraPreview(controller: previewController)
          else if (widget.fixturePreviewAsset != null)
            Image.asset(
              widget.fixturePreviewAsset!,
              key: const ValueKey('capture-meal-preview'),
              fit: BoxFit.cover,
            )
          else
            const _CameraPlaceholder(),

          // Captured-photo overlay bridging scan-to-processing transition.
          if (_capturedImagePath != null)
            Center(
              key: const ValueKey('capture-morph-overlay'),
              child: TweenAnimationBuilder<double>(
                tween: Tween<double>(begin: 0, end: 1),
                duration:
                    AppMotion.durationOf(context, MotionDurations.cardEntrance),
                builder: (context, value, child) => Opacity(
                  opacity: value,
                  child: Transform.scale(
                    scale: 0.85 + 0.15 * value,
                    child: child,
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: SizedBox(
                    width: 280,
                    height: 280,
                    child: Image.file(
                      File(_capturedImagePath!),
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox.expand(
                        child: ColoredBox(color: Colors.black26),
                      ),
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
                        _FlashChip(service: deviceService),
                        const _ProfileChip(),
                      ],
                    ),
                    const SizedBox(height: 18),
                    ScanModeSelector(
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
                CaptureButton(isCapturing: isCapturing, onTap: _capture),
                const SizedBox(width: 48),
                _RoundChipWithLabel(
                  label: 'RECENT',
                  icon: Icons.history_outlined,
                  onTap: widget.onRecentRequested ??
                      () => context.goNamed(RouteNames.history),
                ),
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

/// Fills the screen with the live camera feed, cropping to cover per
/// `BoxFit.cover` instead of the device's native letterboxed aspect ratio.
/// `previewSize` is reported in the sensor's landscape frame, so portrait
/// device orientations need width/height swapped before fitting.
class _CoverCameraPreview extends StatelessWidget {
  const _CoverCameraPreview({required this.controller});

  final CameraController controller;

  @override
  Widget build(BuildContext context) {
    final previewSize = controller.value.previewSize ?? Size.zero;
    final isPortrait = controller.value.deviceOrientation ==
            DeviceOrientation.portraitUp ||
        controller.value.deviceOrientation == DeviceOrientation.portraitDown;
    final width = isPortrait ? previewSize.height : previewSize.width;
    final height = isPortrait ? previewSize.width : previewSize.height;

    return ClipRect(
      child: FittedBox(
        fit: BoxFit.cover,
        alignment: Alignment.center,
        child: SizedBox(
          width: width,
          height: height,
          child: CameraPreview(controller),
        ),
      ),
    );
  }
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

class _FlashChip extends StatefulWidget {
  const _FlashChip({this.service});
  final DeviceCameraService? service;
  @override
  State<_FlashChip> createState() => _FlashChipState();
}

class _FlashChipState extends State<_FlashChip> {
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
    widget.service?.setFlashMode(_mode);
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
      key: const ValueKey('scan-profile'),
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
