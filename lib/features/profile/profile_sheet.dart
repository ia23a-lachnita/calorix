import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../shared/providers/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);

class ProfileSheet extends ConsumerWidget {
  const ProfileSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(authStateProvider);
    final themeMode = ref.watch(themeModeProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final subtextColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    return Scaffold(
      backgroundColor: isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      body: SafeArea(
        child: Column(
          children: [
            // Handle
            Center(
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

            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
              child: Row(
                children: [
                  Text('Profile',
                      style: AppTextStyles.heading2.copyWith(color: textColor)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
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
                              child: const Icon(Icons.person, color: AppColors.blue),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    user?.displayName ?? 'Guest',
                                    style: AppTextStyles.labelLarge.copyWith(color: textColor),
                                  ),
                                  Text(
                                    user?.email ??
                                        (user?.isAnonymous == true
                                            ? 'Anonymous user'
                                            : 'Not signed in'),
                                    style: AppTextStyles.bodySmall.copyWith(color: subtextColor),
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
                              subtitle: const Text('Save your data across devices'),
                              trailing: const Icon(Icons.arrow_forward_ios, size: 14),
                              onTap: () async {
                                final messenger =
                                    ScaffoldMessenger.of(context);
                                try {
                                  await linkWithGoogle(
                                      ref.read(firebaseAuthProvider));
                                  messenger.showSnackBar(const SnackBar(
                                      content: Text(
                                          'Account linked with Google.')));
                                } catch (e) {
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
                          Text('Theme', style: AppTextStyles.labelLarge.copyWith(color: textColor)),
                          const SizedBox(height: 12),
                          SegmentedButton<ThemeMode>(
                            segments: const [
                              ButtonSegment(value: ThemeMode.system, label: Text('System')),
                              ButtonSegment(value: ThemeMode.light, label: Text('Light')),
                              ButtonSegment(value: ThemeMode.dark, label: Text('Dark')),
                            ],
                            selected: {themeMode},
                            onSelectionChanged: (s) =>
                                ref.read(themeModeProvider.notifier).state = s.first,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Notifications
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.notifications_outlined),
                      title: const Text('Notifications'),
                      trailing: Switch(
                        value: true,
                        onChanged: (_) {},
                        activeThumbColor: AppColors.green,
                      ),
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
                              style: AppTextStyles.labelSmall.copyWith(color: subtextColor)),
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
                      icon: const Icon(Icons.logout, color: AppColors.error, size: 18),
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
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will be signed out and your local session will end.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign Out', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(firebaseAuthProvider).signOut();
      if (context.mounted) context.pop();
    }
  }
}
