import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../shared/providers/auth_provider.dart';
import '../../shared/providers/settings_provider.dart';
import '../../core/router/route_names.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

export '../../shared/providers/settings_provider.dart'
    show
        appSettingsStoreProvider,
        settingsProvider,
        SharedPreferencesAppSettingsStore;

/// Derived from [settingsProvider] so main.dart can keep its existing import
/// while the persisted value is the source of truth.
final themeModeProvider = Provider<ThemeMode>((ref) {
  return ref.watch(settingsProvider).themeMode;
});

class ProfileDisplayIdentity {
  const ProfileDisplayIdentity({
    required this.displayName,
    required this.email,
  });

  final String displayName;
  final String email;
}

/// The sheet may sit on a replaced stack (deep link, stale navigation);
/// closing must never strand the user, so fall back to the Scan home.
void _closeSheet(BuildContext context) {
  if (context.canPop()) {
    context.pop();
  } else {
    context.goNamed(RouteNames.scan);
  }
}

class ProfileSheet extends ConsumerWidget {
  const ProfileSheet({super.key, this.displayIdentity});

  final ProfileDisplayIdentity? displayIdentity;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(authStateProvider);
    final settings = ref.watch(settingsProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor =
        isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final subtextColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    return GestureDetector(
      onVerticalDragEnd: (details) {
        if (details.primaryVelocity != null && details.primaryVelocity! > 300) {
          _closeSheet(context);
        }
      },
      child: Scaffold(
        backgroundColor:
            isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
        body: SafeArea(
          child: Column(
            children: [
              // Handle — tap to dismiss
              GestureDetector(
                onTap: () => _closeSheet(context),
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Container(
                      width: 36,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.borderLight,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ),
              ),

              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                child: Row(
                  children: [
                    Text('Profile',
                        style:
                            AppTextStyles.heading2.copyWith(color: textColor)),
                    const Spacer(),
                    IconButton(
                      key: const ValueKey('profile-close'),
                      tooltip: 'Close profile',
                      icon: const Icon(Icons.close),
                      onPressed: () => _closeSheet(context),
                    ),
                  ],
                ),
              ),

              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    // User info
                    userAsync.when(
                      loading: () => const SizedBox.shrink(),
                      error: (_, __) => const SizedBox.shrink(),
                      data: (user) => Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 24,
                                backgroundColor: AppColors.blue.withAlpha(30),
                                child: const Icon(Icons.person,
                                    color: AppColors.blue),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      displayIdentity?.displayName ??
                                          user?.displayName ??
                                          'Guest',
                                      style: AppTextStyles.labelLarge
                                          .copyWith(color: textColor),
                                    ),
                                    Text(
                                      displayIdentity?.email ??
                                          user?.email ??
                                          (user?.isAnonymous == true
                                              ? 'Anonymous user'
                                              : 'Not signed in'),
                                      style: AppTextStyles.bodySmall
                                          .copyWith(color: subtextColor),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Link account (if anonymous)
                    userAsync.when(
                      loading: () => const SizedBox.shrink(),
                      error: (_, __) => const SizedBox.shrink(),
                      data: (user) => user?.isAnonymous == true
                          ? Card(
                              child: ListTile(
                                leading: const Icon(Icons.login),
                                title: const Text('Sign in with Google'),
                                subtitle:
                                    const Text('Save your data across devices'),
                                trailing: const Icon(Icons.arrow_forward_ios,
                                    size: 14),
                                onTap: () async {
                                  final messenger =
                                      ScaffoldMessenger.of(context);
                                  try {
                                    await linkWithGoogle(
                                        ref.read(firebaseAuthProvider));
                                    if (!context.mounted) return;
                                    messenger.showSnackBar(const SnackBar(
                                        content: Text(
                                            'Account linked with Google.')));
                                  } catch (e) {
                                    if (!context.mounted) return;
                                    messenger.showSnackBar(SnackBar(
                                        content: Text(
                                            'Could not link account: $e')));
                                  }
                                },
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                    const SizedBox(height: 16),

                    // Theme selector
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Theme',
                                style: AppTextStyles.labelLarge
                                    .copyWith(color: textColor)),
                            const SizedBox(height: 12),
                            SegmentedButton<ThemeMode>(
                              segments: const [
                                ButtonSegment(
                                    value: ThemeMode.system,
                                    label: Text('System')),
                                ButtonSegment(
                                    value: ThemeMode.light,
                                    label: Text('Light')),
                                ButtonSegment(
                                    value: ThemeMode.dark, label: Text('Dark')),
                              ],
                              selected: {settings.themeMode},
                              onSelectionChanged: (s) => ref
                                  .read(settingsProvider.notifier)
                                  .updateThemeMode(s.first),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Units
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Units',
                                style: AppTextStyles.labelLarge
                                    .copyWith(color: textColor)),
                            const SizedBox(height: 12),
                            SegmentedButton<String>(
                              segments: const [
                                ButtonSegment(
                                    value: 'metric', label: Text('Metric')),
                                ButtonSegment(
                                    value: 'imperial', label: Text('Imperial')),
                              ],
                              selected: {settings.units},
                              onSelectionChanged: (s) => ref
                                  .read(settingsProvider.notifier)
                                  .updateUnits(s.first),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Notifications
                    Card(
                      child: SwitchListTile(
                        key: const ValueKey('profile-notifications-toggle'),
                        title: const Text('Notifications'),
                        secondary: const Icon(Icons.notifications_outlined),
                        value: settings.notificationsEnabled,
                        onChanged: (v) => ref
                            .read(settingsProvider.notifier)
                            .updateNotificationsEnabled(v),
                        activeThumbColor: AppColors.green,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Camera resolution
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Camera Resolution',
                                style: AppTextStyles.labelLarge
                                    .copyWith(color: textColor)),
                            const SizedBox(height: 12),
                            SegmentedButton<String>(
                              segments: const [
                                ButtonSegment(value: 'low', label: Text('Low')),
                                ButtonSegment(
                                    value: 'high', label: Text('High')),
                              ],
                              selected: {settings.cameraResolution},
                              onSelectionChanged: (s) => ref
                                  .read(settingsProvider.notifier)
                                  .updateCameraResolution(s.first),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Auto-capture
                    Card(
                      child: SwitchListTile(
                        key: const ValueKey('profile-auto-capture-toggle'),
                        title: const Text('Auto-capture'),
                        subtitle: const Text(
                            'Automatically capture when food is detected'),
                        secondary: const Icon(Icons.camera_alt_outlined),
                        value: settings.autoCapture,
                        onChanged: (v) => ref
                            .read(settingsProvider.notifier)
                            .updateAutoCapture(v),
                        activeThumbColor: AppColors.green,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Legal
                    Card(
                      child: Column(
                        children: [
                          ListTile(
                            leading: const Icon(Icons.privacy_tip_outlined),
                            title: const Text('Privacy Policy'),
                            trailing: const Icon(Icons.open_in_new, size: 14),
                            onTap: () {},
                          ),
                          const Divider(height: 0),
                          ListTile(
                            leading: const Icon(Icons.description_outlined),
                            title: const Text('Terms of Service'),
                            trailing: const Icon(Icons.open_in_new, size: 14),
                            onTap: () {},
                          ),
                          const Divider(height: 0),
                          ListTile(
                            leading: const Icon(Icons.info_outline),
                            title: const Text('Version'),
                            trailing: Text('1.0.0',
                                style: AppTextStyles.labelSmall
                                    .copyWith(color: subtextColor)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Sign out
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () => _confirmSignOut(context, ref),
                        icon: const Icon(Icons.logout,
                            color: AppColors.error, size: 18),
                        label: const Text('Sign Out',
                            style: TextStyle(color: AppColors.error)),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: AppColors.error),
                          padding: const EdgeInsets.symmetric(vertical: 14),
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
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
            'You will be signed out and your local session will end.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign Out',
                style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(firebaseAuthProvider).signOut();
      if (context.mounted) _closeSheet(context);
    }
  }
}
