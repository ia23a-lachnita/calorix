import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_constants.dart';
import '../../core/router/route_names.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/time/clock_provider.dart';
import '../../shared/models/ai_chat_thread.dart';
import '../../shared/providers/auth_provider.dart';
import 'providers/ai_chat_providers.dart';

/// Vertical offset so the FAB clears the production CalorixBottomNav by ≥ 8 px.
const double kFabAboveBottomNav = 8;

/// Maps wire categories to human-readable filter labels shown in the UI.
const _filterLabels = <AiChatThreadCategory, String>{
  AiChatThreadCategory.goals: 'Plan',
  AiChatThreadCategory.meals: 'Meal edits',
  AiChatThreadCategory.scans: 'Nutrition',
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
    final clockAnchor = ref.watch(clockProvider).nowTZ();
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final chipBg =
        isDark ? AppColors.surfaceDark : AppColors.surfaceRaisedLight;
    final chipBorder =
        isDark ? AppColors.borderDarkStrong : AppColors.borderLightStrong;
    final searchBorder = isDark ? AppColors.borderDark : AppColors.borderLight;
    final background =
        isDark ? AppColors.backgroundDark : AppColors.backgroundLight;

    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            Column(
              children: [
                const SizedBox(
                  key: ValueKey('ai-history-header-spacer'),
                  height: 12,
                ),
                // ---- Row 1: Back · APPNAME AI brand · Settings ----
                SizedBox(
                  key: const ValueKey('ai-history-header-row'),
                  height: 36,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 36,
                          height: 36,
                          child: IconButton(
                            key: const ValueKey('ai-history-back'),
                            tooltip: 'Back',
                            onPressed: context.pop,
                            padding: EdgeInsets.zero,
                            iconSize: 20,
                            icon: const Icon(Icons.chevron_left),
                          ),
                        ),
                        Expanded(
                          child: Center(
                            child: Text(
                              '${AppConstants.appDisplayName.toUpperCase()} AI',
                              style: AppTextStyles.labelMono.copyWith(
                                color: muted,
                                letterSpacing: 1.6,
                                fontSize: 10,
                              ),
                            ),
                          ),
                        ),
                        SizedBox(
                          width: 36,
                          height: 36,
                          child: IconButton(
                            key: const ValueKey('ai-history-settings'),
                            tooltip: 'Settings',
                            onPressed: () =>
                                context.pushNamed(RouteNames.profile),
                            padding: EdgeInsets.zero,
                            iconSize: 20,
                            icon: Icon(
                              Icons.tune,
                              color: muted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                // ---- Row 2: Chats + thread count badge ----
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 2),
                  child: Row(
                    children: [
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
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Every conversation with ${AppConstants.appDisplayName} AI, including any plan or meal edits it made.',
                      style: AppTextStyles.bodySmall.copyWith(color: muted),
                    ),
                  ),
                ),
                // ---- Search bar ----
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 11),
                  child: TextField(
                    key: const ValueKey('ai-history-search'),
                    controller: _searchController,
                    onChanged: (v) => setState(() => _searchQuery = v.trim()),
                    style: AppTextStyles.bodyMedium.copyWith(color: ink),
                    decoration: InputDecoration(
                      isDense: true,
                      hintText: 'Search chats and meal edits…',
                      hintStyle:
                          AppTextStyles.bodyMedium.copyWith(color: muted),
                      prefixIcon: Icon(Icons.search, color: muted, size: 16),
                      prefixIconConstraints: const BoxConstraints(
                        minWidth: 0,
                        minHeight: 0,
                      ),
                      suffixIconConstraints: const BoxConstraints(
                        minWidth: 0,
                        minHeight: 22,
                        maxHeight: 22,
                      ),
                      suffixIcon: _searchQuery.isNotEmpty
                          ? IconButton(
                              icon: Icon(Icons.close, color: muted, size: 18),
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _searchQuery = '');
                              },
                            )
                          : Padding(
                              key: const ValueKey('ai-history-search-kbd'),
                              padding: const EdgeInsets.only(right: 10),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: chipBg,
                                  borderRadius: BorderRadius.circular(4),
                                  border: Border.all(
                                    color: chipBorder,
                                    width: 0.5,
                                  ),
                                ),
                                child: Text(
                                  '⌘K',
                                  style: AppTextStyles.labelMono.copyWith(
                                    color: muted,
                                    fontSize: 9,
                                  ),
                                ),
                              ),
                            ),
                      filled: true,
                      fillColor: chipBg,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: searchBorder, width: 0.5),
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: searchBorder, width: 0.5),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                // ---- Category filter chips with live counts ----
                _FilterChipRow(
                  activeFilter: _activeFilter,
                  threads: threads,
                  ink: ink,
                  muted: muted,
                  background: background,
                  chipBg: chipBg,
                  chipBorder: chipBorder,
                  onTap: (cat) => setState(() => _activeFilter = cat),
                ),
                const SizedBox(height: 4),
                // ---- Thread list ----
                Expanded(
                  child: threads.when(
                    loading: () =>
                        const Center(child: CircularProgressIndicator()),
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
                      final dateAnchor = items.fold<DateTime>(
                        items.first.updatedAt,
                        (latest, t) =>
                            t.updatedAt.isAfter(latest) ? t.updatedAt : latest,
                      );
                      final groups =
                          _groupByDate(filtered, dateAnchor: dateAnchor);
                      for (final group in groups) {
                        group.threads.sort(
                          (a, b) => b.updatedAt.compareTo(a.updatedAt),
                        );
                      }
                      return ListView.builder(
                        key: const ValueKey('ai-history-list'),
                        padding: const EdgeInsets.fromLTRB(11, 4, 11, 96),
                        itemCount: groups.fold<int>(
                              0,
                              (sum, g) => sum + 1 + g.threads.length,
                            ) +
                            1, // +1 for privacy footer
                        itemBuilder: (context, index) {
                          int cursor = 0;
                          for (final group in groups) {
                            if (index == cursor) {
                              return _DateGroupHeader(
                                key:
                                    ValueKey('ai-history-group-${group.label}'),
                                label: group.label,
                                count: group.threads.length,
                                muted: muted,
                              );
                            }
                            cursor++;
                            for (final thread in group.threads) {
                              if (index == cursor) {
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Dismissible(
                                    key: ValueKey('ai-thread-${thread.id}'),
                                    direction: DismissDirection.endToStart,
                                    confirmDismiss: (_) =>
                                        _confirmDelete(context),
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
                                      color:
                                          Theme.of(context).colorScheme.error,
                                      child: const Icon(
                                        Icons.delete_outline,
                                        color: Colors.white,
                                      ),
                                    ),
                                    child: _ThreadRow(
                                      thread: thread,
                                      anchor: clockAnchor,
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
                          // Privacy footer as last item in scroll list
                          return _PrivacyFooter(
                              muted: muted,
                              chipBg: chipBg,
                              chipBorder: chipBorder);
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
            // ---- Compact New chat button above outer nav ----
            Positioned(
              right: 16,
              bottom: kFabAboveBottomNav,
              child: SizedBox(
                key: const ValueKey('ai-new-chat'),
                height: 48,
                child: Tooltip(
                  message: 'New chat',
                  child: Semantics(
                    label: 'New chat',
                    button: true,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => context.goNamed(RouteNames.aiChat),
                      child: Align(
                        alignment: Alignment.bottomCenter,
                        child: SizedBox(
                          key: const ValueKey('ai-new-chat-surface'),
                          width: 120,
                          height: 46,
                          child: Container(
                            padding: const EdgeInsets.fromLTRB(6, 0, 16, 0),
                            decoration: BoxDecoration(
                              color: chipBg,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: chipBorder,
                                width: 0.5,
                              ),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  key: const ValueKey('ai-new-chat-gradient'),
                                  width: 34,
                                  height: 34,
                                  alignment: Alignment.center,
                                  decoration: const BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: LinearGradient(
                                      colors: [AppColors.cyan, AppColors.blue],
                                    ),
                                  ),
                                  child: const Icon(
                                    Icons.add,
                                    size: 16,
                                    color: AppColors.backgroundDark,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: FittedBox(
                                    fit: BoxFit.scaleDown,
                                    alignment: Alignment.centerLeft,
                                    child: Text(
                                      'New chat',
                                      maxLines: 1,
                                      style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        color: ink,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
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
          '+ $count THREAD${count == 1 ? '' : 'S'}',
          style: AppTextStyles.labelMono.copyWith(color: AppColors.cyan),
        ),
      );
}

class _FilterChipRow extends StatelessWidget {
  const _FilterChipRow({
    required this.activeFilter,
    required this.threads,
    required this.ink,
    required this.muted,
    required this.background,
    required this.chipBg,
    required this.chipBorder,
    required this.onTap,
  });

  final AiChatThreadCategory? activeFilter;
  final AsyncValue<List<AiChatThread>> threads;
  final Color ink;
  final Color muted;
  final Color background;
  final Color chipBg;
  final Color chipBorder;
  final ValueChanged<AiChatThreadCategory?> onTap;

  @override
  Widget build(BuildContext context) {
    final items = threads.valueOrNull ?? [];
    final totalCount = items.length;
    final goalsCount =
        items.where((t) => t.category == AiChatThreadCategory.goals).length;
    final mealsCount =
        items.where((t) => t.category == AiChatThreadCategory.meals).length;
    final scansCount =
        items.where((t) => t.category == AiChatThreadCategory.scans).length;

    return SizedBox(
      height: 32,
      child: ListView(
        key: const ValueKey('ai-history-filters'),
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _FilterChip(
            label: 'All',
            count: totalCount,
            selected: activeFilter == null,
            ink: ink,
            muted: muted,
            background: background,
            chipBg: chipBg,
            chipBorder: chipBorder,
            onTap: () => onTap(null),
          ),
          const SizedBox(width: 6),
          _FilterChip(
            label: 'Plan',
            count: goalsCount,
            selected: activeFilter == AiChatThreadCategory.goals,
            ink: ink,
            muted: muted,
            background: background,
            chipBg: chipBg,
            chipBorder: chipBorder,
            onTap: () => onTap(AiChatThreadCategory.goals),
          ),
          const SizedBox(width: 6),
          _FilterChip(
            label: 'Meal edits',
            count: mealsCount,
            selected: activeFilter == AiChatThreadCategory.meals,
            ink: ink,
            muted: muted,
            background: background,
            chipBg: chipBg,
            chipBorder: chipBorder,
            onTap: () => onTap(AiChatThreadCategory.meals),
          ),
          const SizedBox(width: 6),
          _FilterChip(
            label: 'Nutrition',
            count: scansCount,
            selected: activeFilter == AiChatThreadCategory.scans,
            ink: ink,
            muted: muted,
            background: background,
            chipBg: chipBg,
            chipBorder: chipBorder,
            onTap: () => onTap(AiChatThreadCategory.scans),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.ink,
    required this.muted,
    required this.background,
    required this.chipBg,
    required this.chipBorder,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final Color ink;
  final Color muted;
  final Color background;
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
            color: selected ? ink : chipBg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected ? Colors.transparent : chipBorder,
              width: 0.5,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: AppTextStyles.labelLarge.copyWith(
                  color: selected ? background : ink,
                ),
              ),
              const SizedBox(width: 4),
              Text(
                '$count',
                style: AppTextStyles.labelMono.copyWith(
                  color: selected ? background : muted,
                  fontSize: 9,
                ),
              ),
            ],
          ),
        ),
      );
}

class _DateGroupHeader extends StatelessWidget {
  const _DateGroupHeader({
    super.key,
    required this.label,
    required this.count,
    required this.muted,
  });
  final String label;
  final int count;
  final Color muted;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 10, bottom: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (label == 'Pinned') ...[
                  Icon(
                    Icons.push_pin,
                    size: 12,
                    color: muted,
                  ),
                  const SizedBox(width: 4),
                ],
                Text(
                  label,
                  style: AppTextStyles.labelLarge.copyWith(
                    color: muted,
                    letterSpacing: 0.4,
                  ),
                ),
              ],
            ),
            Text(
              '$count',
              style: AppTextStyles.labelMono.copyWith(
                color: muted,
                fontSize: 9,
              ),
            ),
          ],
        ),
      );
}

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({
    required this.thread,
    required this.anchor,
    required this.onTap,
  });

  final AiChatThread thread;
  final DateTime anchor;
  final VoidCallback onTap;

  Color _tagColor(AiChatThreadCategory cat, bool isDark) => switch (cat) {
        AiChatThreadCategory.goals => AppColors.blue,
        AiChatThreadCategory.meals => AppColors.green,
        AiChatThreadCategory.scans => AppColors.cyan,
        AiChatThreadCategory.general =>
          isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight,
      };

  String _relativeTimestamp(DateTime dt, DateTime anchor) {
    final todayStart = anchor.isUtc
        ? DateTime.utc(anchor.year, anchor.month, anchor.day)
        : DateTime(anchor.year, anchor.month, anchor.day);
    final yesterdayStart = todayStart.subtract(const Duration(days: 1));

    if (!dt.isBefore(todayStart)) {
      return DateFormat('HH:mm').format(dt);
    } else if (!dt.isBefore(yesterdayStart)) {
      return 'Yesterday';
    } else {
      return DateFormat('MMM d').format(dt);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final tagColor = _tagColor(thread.category, isDark);
    final pinned = thread.pinned;

    // Pinned: cyan-tinted surface + cyan border; Normal: neutral surface.
    final Color surfaceColor;
    final Color borderColor;
    final BorderRadius borderRadius;

    if (pinned) {
      surfaceColor = isDark
          ? AppColors.cyan.withValues(alpha: 0.06)
          : AppColors.cyan.withValues(alpha: 0.04);
      borderColor = AppColors.cyan.withValues(alpha: 0.32);
      borderRadius = BorderRadius.circular(12);
    } else {
      surfaceColor = isDark ? AppColors.surfaceDark : AppColors.surfaceLight;
      borderColor = isDark ? AppColors.borderDark : AppColors.borderLight;
      borderRadius = BorderRadius.circular(12);
    }

    return Material(
      key: ValueKey('ai-thread-surface-${thread.id}'),
      color: surfaceColor,
      shape: RoundedRectangleBorder(
        borderRadius: borderRadius,
        side: BorderSide(
          width: pinned ? 0.8 : 0.5,
          color: borderColor,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: borderRadius,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // ---- 42×42 avatar ----
              _ThreadAvatar(
                key: ValueKey('ai-thread-avatar-${thread.id}'),
                thread: thread,
                isDark: isDark,
                tagColor: tagColor,
                muted: muted,
              ),
              const SizedBox(width: 12),
              // ---- Text block ----
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Title + unread dot + timestamp row
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            thread.title?.trim().isNotEmpty == true
                                ? thread.title!
                                : 'Untitled conversation',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTextStyles.labelLarge
                                .copyWith(color: ink, fontSize: 14),
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
                        const SizedBox(width: 8),
                        Text(
                          _relativeTimestamp(thread.updatedAt, anchor),
                          style: AppTextStyles.labelMono
                              .copyWith(color: muted, fontSize: 10),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    // Two-line clamped preview
                    Text(
                      thread.preview?.trim().isNotEmpty == true
                          ? thread.preview!
                          : 'Open conversation',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.bodySmall
                          .copyWith(color: muted, height: 1.25),
                    ),
                    const SizedBox(height: 4),
                    // Tag chips + chevron
                    Row(
                      children: [
                        _TagChip(
                          key: ValueKey('ai-thread-tag-${thread.id}'),
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
                        Icon(
                          Icons.chevron_right,
                          size: 18,
                          color: muted,
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

/// Avatar tile: gradient for pinned rows, neutral surface for normal rows,
/// with a small category-colored status dot at top-right.
class _ThreadAvatar extends StatelessWidget {
  const _ThreadAvatar({
    super.key,
    required this.thread,
    required this.isDark,
    required this.tagColor,
    required this.muted,
  });

  final AiChatThread thread;
  final bool isDark;
  final Color tagColor;
  final Color muted;

  @override
  Widget build(BuildContext context) {
    final pinned = thread.pinned;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 42,
          height: 42,
          decoration: pinned
              ? BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.cyan, AppColors.blue],
                  ),
                  border: Border.all(
                    color: AppColors.cyan.withValues(alpha: 0.28),
                    width: 0.8,
                  ),
                )
              : BoxDecoration(
                  color: isDark
                      ? AppColors.surfaceRaisedDark
                      : AppColors.surfaceRaisedLight,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color:
                        isDark ? AppColors.borderDark : AppColors.borderLight,
                    width: 0.5,
                  ),
                ),
          child: Center(
            child: Icon(
              Icons.auto_awesome,
              color: pinned ? AppColors.backgroundDark : muted,
              size: 18,
            ),
          ),
        ),
        // Category status dot at top-right (not shown for pinned)
        if (!pinned)
          Positioned(
            top: -1,
            right: -1,
            child: Container(
              key: ValueKey('ai-thread-avatar-status-${thread.id}'),
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: tagColor,
                shape: BoxShape.circle,
              ),
            ),
          ),
      ],
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({super.key, required this.label, required this.color});
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

class _PrivacyFooter extends StatelessWidget {
  const _PrivacyFooter({
    required this.muted,
    required this.chipBg,
    required this.chipBorder,
  });

  final Color muted;
  final Color chipBg;
  final Color chipBorder;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Text(
          'STORED LOCALLY · NEVER SHARED',
          textAlign: TextAlign.center,
          style: AppTextStyles.labelMono.copyWith(color: muted),
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
