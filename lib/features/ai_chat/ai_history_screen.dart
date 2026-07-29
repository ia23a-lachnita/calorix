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

/// Maps wire categories to human-readable filter labels shown in the UI.
const _filterLabels = <AiChatThreadCategory, String>{
  AiChatThreadCategory.goals: 'Plan',
  AiChatThreadCategory.meals: 'Meal edits',
  AiChatThreadCategory.scans: 'Nutrition',
  AiChatThreadCategory.general: 'Chat',
};

/// Maps wire categories to uppercase tag labels used in thread row chips.
const _tagLabels = <AiChatThreadCategory, String>{
  AiChatThreadCategory.goals: 'PLAN',
  AiChatThreadCategory.meals: 'MEAL',
  AiChatThreadCategory.scans: 'SCAN',
  AiChatThreadCategory.general: 'CHAT',
};

class AiHistoryScreen extends ConsumerStatefulWidget {
  const AiHistoryScreen({super.key});

  @override
  ConsumerState<AiHistoryScreen> createState() => _AiHistoryScreenState();
}

class _AiHistoryScreenState extends ConsumerState<AiHistoryScreen> {
  final _searchController = TextEditingController();
  String _searchQuery = '';
  AiChatThreadCategory? _activeFilter; // null = "All"

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Filtering helpers
  // ---------------------------------------------------------------------------

  bool _matchesSearch(AiChatThread t) {
    if (_searchQuery.isEmpty) return true;
    final q = _searchQuery.toLowerCase();
    final title = t.title?.toLowerCase() ?? '';
    final preview = t.preview?.toLowerCase() ?? '';
    return title.contains(q) || preview.contains(q);
  }

  bool _matchesFilter(AiChatThread t) =>
      _activeFilter == null || t.category == _activeFilter;

  List<AiChatThread> _filterThreads(List<AiChatThread> threads) =>
      threads.where((t) => _matchesSearch(t) && _matchesFilter(t)).toList();

  // ---------------------------------------------------------------------------
  // Grouping helpers
  // ---------------------------------------------------------------------------

  List<_DateGroup> _groupByDate(
    List<AiChatThread> threads, {
    required DateTime dateAnchor,
  }) {
    if (threads.isEmpty) return [];

    final todayStart = dateAnchor.isUtc
        ? DateTime.utc(dateAnchor.year, dateAnchor.month, dateAnchor.day)
        : DateTime(dateAnchor.year, dateAnchor.month, dateAnchor.day);
    final yesterdayStart = todayStart.subtract(const Duration(days: 1));

    final pinned = <AiChatThread>[];
    final today = <AiChatThread>[];
    final yesterday = <AiChatThread>[];
    final earlier = <AiChatThread>[];

    for (final t in threads) {
      if (t.pinned) {
        pinned.add(t);
        continue;
      }
      final d = t.updatedAt;
      if (!d.isBefore(todayStart)) {
        today.add(t);
      } else if (!d.isBefore(yesterdayStart)) {
        yesterday.add(t);
      } else {
        earlier.add(t);
      }
    }

    return [
      if (pinned.isNotEmpty) _DateGroup('Pinned', pinned),
      if (today.isNotEmpty) _DateGroup('Today', today),
      if (yesterday.isNotEmpty) _DateGroup('Yesterday', yesterday),
      if (earlier.isNotEmpty) _DateGroup('Earlier this week', earlier),
    ];
  }

  // ---------------------------------------------------------------------------
  // Delete helpers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final threads = ref.watch(aiThreadsProvider);
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final chipBg =
        isDark ? AppColors.surfaceDark : AppColors.surfaceRaisedLight;
    final chipBorder =
        isDark ? AppColors.borderDark : AppColors.borderLightStrong;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // ---- Compact header ----
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 16, 2),
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
            // ---- Subtitle ----
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Every conversation with ${AppConstants.appDisplayName} AI.',
                  style: AppTextStyles.bodySmall.copyWith(color: muted),
                ),
              ),
            ),
            // ---- Search bar ----
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                key: const ValueKey('ai-history-search'),
                controller: _searchController,
                onChanged: (v) => setState(() => _searchQuery = v.trim()),
                style: AppTextStyles.bodyMedium.copyWith(color: ink),
                decoration: InputDecoration(
                  hintText: 'Search',
                  hintStyle: AppTextStyles.bodyMedium.copyWith(color: muted),
                  prefixIcon: Icon(Icons.search, color: muted, size: 20),
                  suffixIcon: _searchQuery.isNotEmpty
                      ? IconButton(
                          icon: Icon(Icons.close, color: muted, size: 18),
                          onPressed: () {
                            _searchController.clear();
                            setState(() => _searchQuery = '');
                          },
                        )
                      : null,
                  filled: true,
                  fillColor: chipBg,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 6),
            // ---- Category filter chips ----
            SizedBox(
              height: 30,
              child: ListView(
                key: const ValueKey('ai-history-filters'),
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _FilterChip(
                    label: 'All',
                    selected: _activeFilter == null,
                    ink: ink,
                    chipBg: chipBg,
                    chipBorder: chipBorder,
                    onTap: () => setState(() => _activeFilter = null),
                  ),
                  const SizedBox(width: 8),
                  for (final cat in AiChatThreadCategory.values)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _FilterChip(
                        label: _filterLabels[cat]!,
                        selected: _activeFilter == cat,
                        ink: ink,
                        chipBg: chipBg,
                        chipBorder: chipBorder,
                        onTap: () => setState(() => _activeFilter = cat),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            // ---- Thread list ----
            Expanded(
              child: threads.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => _HistoryError(
                  onRetry: () => ref.invalidate(aiThreadsProvider),
                ),
                data: (items) {
                  if (items.isEmpty) return const _EmptyHistory();
                  final filtered = _filterThreads(items);
                  if (filtered.isEmpty) {
                    return _FilteredEmptyState(
                      query: _searchQuery,
                      filter: _activeFilter,
                    );
                  }
                  // Derive the date anchor from the complete snapshot so
                  // filtering/searching never relabels old threads as Today.
                  final dateAnchor = items.fold<DateTime>(
                    items.first.updatedAt,
                    (latest, t) =>
                        t.updatedAt.isAfter(latest) ? t.updatedAt : latest,
                  );
                  final groups = _groupByDate(filtered, dateAnchor: dateAnchor);
                  return ListView.builder(
                    key: const ValueKey('ai-history-list'),
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
                    itemCount: groups.fold<int>(
                      0,
                      (sum, g) => sum + 1 + g.threads.length,
                    ),
                    itemBuilder: (context, index) {
                      int cursor = 0;
                      for (final group in groups) {
                        if (index == cursor) {
                          return _DateGroupHeader(
                              label: group.label, muted: muted);
                        }
                        cursor++;
                        for (final thread in group.threads) {
                          if (index == cursor) {
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Dismissible(
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
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 20),
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
                                    queryParameters: {
                                      'threadId': thread.id,
                                    },
                                  ),
                                ),
                              ),
                            );
                          }
                          cursor++;
                        }
                      }
                      return const SizedBox.shrink();
                    },
                  );
                },
              ),
            ),
            // ---- Privacy footer ----
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: chipBg,
                border: Border(
                  top: BorderSide(color: chipBorder, width: 0.5),
                ),
              ),
              child: Text(
                'STORED LOCALLY · NEVER SHARED',
                textAlign: TextAlign.center,
                style: AppTextStyles.labelMono.copyWith(color: muted),
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

// ---------------------------------------------------------------------------
// Private widgets
// ---------------------------------------------------------------------------

class _DateGroup {
  const _DateGroup(this.label, this.threads);
  final String label;
  final List<AiChatThread> threads;
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

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.ink,
    required this.chipBg,
    required this.chipBorder,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final Color ink;
  final Color chipBg;
  final Color chipBorder;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        key: ValueKey('ai-filter-$label'),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: selected ? AppColors.cyan.withValues(alpha: 0.14) : chipBg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected
                  ? AppColors.cyan.withValues(alpha: 0.40)
                  : chipBorder,
              width: selected ? 1 : 0.5,
            ),
          ),
          child: Text(
            label,
            style: AppTextStyles.labelLarge.copyWith(
              color: selected ? AppColors.cyan : ink,
            ),
          ),
        ),
      );
}

class _DateGroupHeader extends StatelessWidget {
  const _DateGroupHeader({required this.label, required this.muted});
  final String label;
  final Color muted;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 10, bottom: 4),
        child: Text(
          label,
          style: AppTextStyles.labelLarge.copyWith(
            color: muted,
            letterSpacing: 0.4,
          ),
        ),
      );
}

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({
    required this.thread,
    required this.onTap,
  });

  final AiChatThread thread;
  final VoidCallback onTap;

  Color _tagColor(AiChatThreadCategory cat, bool isDark) => switch (cat) {
        AiChatThreadCategory.goals => AppColors.blue,
        AiChatThreadCategory.meals => AppColors.green,
        AiChatThreadCategory.scans => AppColors.cyan,
        AiChatThreadCategory.general =>
          isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight,
      };

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final date = DateFormat('MMM d · h:mm a').format(thread.updatedAt);
    final tagColor = _tagColor(thread.category, isDark);

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
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: tagColor.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Icon(Icons.auto_awesome, color: tagColor, size: 16),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Flexible(
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
                        if (thread.unread) ...[
                          const SizedBox(width: 6),
                          Container(
                            width: 7,
                            height: 7,
                            decoration: const BoxDecoration(
                              color: AppColors.cyan,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      thread.preview?.trim().isNotEmpty == true
                          ? thread.preview!
                          : 'Open conversation',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.bodySmall.copyWith(color: muted),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        _TagChip(
                          label: _tagLabels[thread.category]!,
                          color: tagColor,
                        ),
                        if (thread.linkedMealId != null) ...[
                          const SizedBox(width: 4),
                          const _TagChip(
                            label: 'LINKED MEAL',
                            color: AppColors.green,
                          ),
                        ],
                        if (thread.appliedActionCount > 0) ...[
                          const SizedBox(width: 4),
                          _TagChip(
                            label: '${thread.appliedActionCount}× APPLIED',
                            color: AppColors.amber,
                          ),
                        ],
                        const Spacer(),
                        Text(
                          date,
                          style: AppTextStyles.labelMono.copyWith(color: muted),
                        ),
                      ],
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
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          label,
          style: AppTextStyles.labelMono.copyWith(
            color: color,
            fontSize: 8,
          ),
        ),
      );
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

class _FilteredEmptyState extends StatelessWidget {
  const _FilteredEmptyState({required this.query, this.filter});
  final String query;
  final AiChatThreadCategory? filter;

  @override
  Widget build(BuildContext context) {
    final hasQuery = query.isNotEmpty;
    final hasFilter = filter != null;
    final label = hasFilter ? _filterLabels[filter]! : 'this filter';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              hasQuery ? Icons.search_off : Icons.filter_list_off,
              size: 36,
            ),
            const SizedBox(height: 12),
            Text(
              hasQuery ? 'No matching chats' : 'No chats in $label',
              style: AppTextStyles.heading2,
            ),
            const SizedBox(height: 6),
            const Text(
              'Try a different search or filter.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
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
