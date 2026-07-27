import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/router/route_names.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../shared/models/ai_chat_thread.dart';
import '../../shared/providers/auth_provider.dart';
import 'providers/ai_chat_providers.dart';

class AiHistoryScreen extends ConsumerWidget {
  const AiHistoryScreen({super.key});

  Future<bool> _confirmDelete(BuildContext context) async {
    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Delete conversation?'),
            content: const Text(
              'This removes the conversation and its archived messages.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Delete'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    AiChatThread thread,
  ) async {
    if (!await _confirmDelete(context)) return;
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    await ref.read(aiThreadRepositoryProvider).deleteThread(uid, thread.id);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final threads = ref.watch(aiThreadsProvider);
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
              child: Row(
                children: [
                  IconButton(
                    key: const ValueKey('ai-history-back'),
                    tooltip: 'Back',
                    onPressed: context.pop,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Expanded(
                    child: Text(
                      'Chats',
                      style: AppTextStyles.heading1.copyWith(color: ink),
                    ),
                  ),
                  threads.maybeWhen(
                    data: (items) => _CountChip(count: items.length),
                    orElse: () => const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Every conversation with ${AppConstants.appDisplayName} AI.',
                  style: AppTextStyles.bodySmall.copyWith(color: muted),
                ),
              ),
            ),
            Expanded(
              child: threads.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => _HistoryError(
                  onRetry: () => ref.invalidate(aiThreadsProvider),
                ),
                data: (items) => items.isEmpty
                    ? const _EmptyHistory()
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                        itemCount: items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final thread = items[index];
                          return Dismissible(
                            key: ValueKey('ai-thread-${thread.id}'),
                            direction: DismissDirection.endToStart,
                            confirmDismiss: (_) => _confirmDelete(context),
                            onDismissed: (_) {
                              final uid = ref.read(currentUidProvider);
                              if (uid != null) {
                                ref
                                    .read(aiThreadRepositoryProvider)
                                    .deleteThread(uid, thread.id);
                              }
                            },
                            background: Container(
                              alignment: Alignment.centerRight,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              color: Theme.of(context).colorScheme.error,
                              child: const Icon(
                                Icons.delete_outline,
                                color: Colors.white,
                              ),
                            ),
                            child: _ThreadRow(
                              thread: thread,
                              onTap: () => context.goNamed(
                                RouteNames.aiChat,
                                queryParameters: {'threadId': thread.id},
                              ),
                              onDelete: () => _delete(context, ref, thread),
                            ),
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const ValueKey('ai-new-chat'),
        onPressed: () => context.goNamed(RouteNames.aiChat),
        icon: const Icon(Icons.add),
        label: const Text('New chat'),
      ),
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: AppColors.cyan.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.cyan.withValues(alpha: 0.28)),
        ),
        child: Text(
          '$count THREAD${count == 1 ? '' : 'S'}',
          style: AppTextStyles.labelMono.copyWith(color: AppColors.cyan),
        ),
      );
}

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({
    required this.thread,
    required this.onTap,
    required this.onDelete,
  });

  final AiChatThread thread;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final date = DateFormat('MMM d · h:mm a').format(thread.updatedAt);

    return Material(
      color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          width: 0.5,
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.cyan.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.auto_awesome, color: AppColors.cyan),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            thread.title?.trim().isNotEmpty == true
                                ? thread.title!
                                : 'Untitled conversation',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style:
                                AppTextStyles.labelLarge.copyWith(color: ink),
                          ),
                        ),
                        Text(
                          date,
                          style: AppTextStyles.labelMono.copyWith(color: muted),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      thread.preview?.trim().isNotEmpty == true
                          ? thread.preview!
                          : 'Open conversation',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.bodySmall.copyWith(color: muted),
                    ),
                    if (thread.linkedMealId != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.green.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          'LINKED MEAL',
                          style: AppTextStyles.labelMono
                              .copyWith(color: AppColors.green),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: 'Conversation options',
                onSelected: (_) => onDelete(),
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'delete',
                    child: Row(
                      children: [
                        Icon(Icons.delete_outline),
                        SizedBox(width: 8),
                        Text('Delete'),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyHistory extends StatelessWidget {
  const _EmptyHistory();

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.forum_outlined, size: 40),
              const SizedBox(height: 12),
              const Text(
                'No conversations yet',
                style: AppTextStyles.heading2,
              ),
              const SizedBox(height: 6),
              const Text(
                'Start a chat to plan meals, understand your day, or adjust goals.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => context.goNamed(RouteNames.aiChat),
                child: const Text('Start a chat'),
              ),
            ],
          ),
        ),
      );
}

class _HistoryError extends StatelessWidget {
  const _HistoryError({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Could not load conversations.'),
            const SizedBox(height: 8),
            TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      );
}
