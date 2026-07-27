import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../shared/widgets/brand.dart';

/// Shown in place of the scan viewfinder while camera permission is denied.
/// [onOpenSettings] opens the app's OS settings; [onAddManually] is the
/// navigation-intent seam for the manual-entry flow, which does not exist
/// as a route until Task 8.
class PermissionScreen extends StatelessWidget {
  const PermissionScreen({
    super.key,
    required this.onOpenSettings,
    required this.onAddManually,
    this.showFixtureSystemPrompt = false,
  });

  final Future<void> Function() onOpenSettings;
  final VoidCallback onAddManually;
  final bool showFixtureSystemPrompt;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: Stack(
        fit: StackFit.expand,
        children: [
          ImageFiltered(
            key: const ValueKey('permission-blurred-viewfinder'),
            imageFilter: ui.ImageFilter.blur(sigmaX: 30, sigmaY: 30),
            child: Container(
              color: AppColors.backgroundDark,
              child: Center(
                child: Icon(
                  Icons.camera_alt_outlined,
                  size: 120,
                  color: AppColors.textSecondaryDark.withValues(alpha: 0.3),
                ),
              ),
            ),
          ),
          if (showFixtureSystemPrompt)
            _FixturePermissionPrompt(
              onAllow: onOpenSettings,
              onAddManually: onAddManually,
            )
          else
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.camera_alt_outlined,
                      size: 40,
                      color: AppColors.textSecondaryDark,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Camera access needed',
                      style: AppTextStyles.heading3
                          .copyWith(color: AppColors.textPrimaryDark),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${AppConstants.appDisplayName} scans your meals with the camera. Enable access '
                      'to keep logging food in under 5 seconds.',
                      textAlign: TextAlign.center,
                      style: AppTextStyles.bodyMedium
                          .copyWith(color: AppColors.textSecondaryDark),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        key: const ValueKey('permission-regrant-button'),
                        onPressed: onOpenSettings,
                        child: const Text('Enable Camera Access'),
                      ),
                    ),
                    const SizedBox(height: 16),
                    GestureDetector(
                      key: const ValueKey('permission-add-manually-card'),
                      onTap: onAddManually,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.16),
                          ),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.edit_outlined,
                              size: 18,
                              color: AppColors.textSecondaryDark,
                            ),
                            const SizedBox(width: 12),
                            Text(
                              'Add manually instead',
                              style: AppTextStyles.labelLarge
                                  .copyWith(color: AppColors.textPrimaryDark),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _FixturePermissionPrompt extends StatelessWidget {
  const _FixturePermissionPrompt({
    required this.onAllow,
    required this.onAddManually,
  });

  final Future<void> Function() onAllow;
  final VoidCallback onAddManually;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final hairline =
        isDark ? AppColors.borderDarkStrong : AppColors.borderLightStrong;

    return Stack(
      key: const ValueKey('permission-fixture-system-prompt'),
      children: [
        Positioned.fill(
          child: ColoredBox(color: Colors.black.withValues(alpha: 0.45)),
        ),
        Center(
          child: Transform.translate(
            offset: const Offset(0, -28),
            child: Container(
              width: 286,
              decoration: BoxDecoration(
                color:
                    isDark ? const Color(0xE624282E) : const Color(0xF6F6F6F8),
                borderRadius: BorderRadius.circular(16),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x73000000),
                    blurRadius: 60,
                    offset: Offset(0, 24),
                  ),
                ],
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 20, 18, 16),
                    child: Column(
                      children: [
                        const CxLogo(size: 40),
                        const SizedBox(height: 12),
                        Text(
                          '"${AppConstants.appDisplayName}" Would Like to Access the Camera',
                          textAlign: TextAlign.center,
                          style: AppTextStyles.labelLarge.copyWith(color: ink),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Scanning meals needs the camera. Photos are analyzed in the cloud and never sold or shared.',
                          textAlign: TextAlign.center,
                          style: AppTextStyles.bodySmall.copyWith(color: muted),
                        ),
                      ],
                    ),
                  ),
                  Divider(height: 0, thickness: 0.5, color: hairline),
                  SizedBox(
                    height: 44,
                    child: Row(
                      children: [
                        Expanded(
                          child: TextButton(
                            onPressed: () {},
                            child: const Text("Don't Allow"),
                          ),
                        ),
                        VerticalDivider(
                          width: 0.5,
                          thickness: 0.5,
                          color: hairline,
                        ),
                        Expanded(
                          child: TextButton(
                            onPressed: onAllow,
                            child: const Text(
                              'Allow',
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        Positioned(
          left: 20,
          right: 20,
          bottom: 56,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: isDark ? const Color(0x9E14181E) : const Color(0xB8FFFFFF),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: hairline, width: 0.5),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'No camera? No problem.',
                        style: AppTextStyles.labelLarge.copyWith(color: ink),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'You can log any meal by search instead.',
                        style: AppTextStyles.bodySmall.copyWith(color: muted),
                      ),
                    ],
                  ),
                ),
                OutlinedButton(
                  key: const ValueKey('permission-add-manually-card'),
                  onPressed: onAddManually,
                  child: const Text('Add manually'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
