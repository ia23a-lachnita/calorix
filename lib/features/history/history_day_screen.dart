import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'providers/history_providers.dart';
import '../../shared/widgets/confidence_badge.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class HistoryDayScreen extends ConsumerWidget {
  final String date;
  const HistoryDayScreen({super.key, required this.date});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final parsedDate = DateTime.tryParse(date) ?? DateTime.now();
    final entriesAsync = ref.watch(historyDayEntriesProvider(parsedDate));
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          DateFormat('EEEE, MMM d').format(parsedDate),
          style: AppTextStyles.heading2.copyWith(color: textColor),
        ),
      ),
      body: entriesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (entries) => entries.isEmpty
            ? const Center(child: Text('No meals logged'))
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: entries.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final entry = entries[index];
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(entry.foodName ?? 'Unknown',
                                    style: AppTextStyles.labelLarge
                                        .copyWith(color: textColor)),
                                Text(
                                    '${entry.scaledKcal.round()} kcal · '
                                    '${entry.scaledProtein.round()}g P · '
                                    '${entry.scaledCarbs.round()}g C · '
                                    '${entry.scaledFat.round()}g F',
                                    style: AppTextStyles.bodySmall.copyWith(
                                        color: isDark
                                            ? AppColors.textSecondaryDark
                                            : AppColors.textSecondaryLight)),
                                if (entry.confidence != null)
                                  ConfidenceBadge(
                                    confidence: entry.confidence!,
                                    compact: true,
                                  ),
                              ],
                            ),
                          ),
                          Text(
                            DateFormat('h:mm a').format(entry.timestamp),
                            style: AppTextStyles.bodySmall.copyWith(
                                color: isDark
                                    ? AppColors.textSecondaryDark
                                    : AppColors.textSecondaryLight),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
