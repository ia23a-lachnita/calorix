import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

/// Shown in place of the scan viewfinder while camera permission is denied.
/// [onOpenSettings] opens the app's OS settings; [onAddManually] is the
/// navigation-intent seam for the manual-entry flow, which does not exist
/// as a route until Task 8.
class PermissionScreen extends StatelessWidget {
  const PermissionScreen({
    super.key,
    required this.onOpenSettings,
    required this.onAddManually,
  });

  final Future<void> Function() onOpenSettings;
  final VoidCallback onAddManually;

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
