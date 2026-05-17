import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'providers/today_providers.dart';
import '../../shared/models/food_entry.dart';
import '../../shared/models/macro_target_plan.dart';
import '../../shared/widgets/macro_ring.dart';
import '../../shared/widgets/macro_progress_bar.dart';
import '../../shared/widgets/confidence_badge.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/router/route_names.dart';

class TodayScreen extends ConsumerStatefulWidget {
  const TodayScreen({super.key});
  @override
  ConsumerState<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends ConsumerState<TodayScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _countUp;
  late final Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _countUp = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _animation = CurvedAnimation(parent: _countUp, curve: Curves.easeOutCubic);
    _countUp.forward();
  }

  @override
  void dispose() {
    _countUp.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final entriesAsync = ref.watch(todayEntriesProvider);
    final summary = ref.watch(todayMacroSummaryProvider);
    final planAsync = ref.watch(activePlanProvider);
    final plan = planAsync.valueOrNull ?? MacroTargetPlan.defaultPlan();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            floating: true,
            title: Text('Today', style: AppTextStyles.heading1.copyWith(color: textColor)),
            actions: [
              IconButton(
                icon: const Icon(Icons.person_outline),
                onPressed: () => context.goNamed(RouteNames.profile),
              ),
            ],
          ),
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Hero macro card
                _HeroMacroCard(
                  animation: _animation,
                  summary: summary,
                  plan: plan,
                  isDark: isDark,
                ),
                const SizedBox(height: 20),

                // Macro sub-cards
                _MacroSubCards(
                  animation: _animation,
                  summary: summary,
                  plan: plan,
                  isDark: isDark,
                ),
                const SizedBox(height: 24),

                // Meals header
                Text(
                  "Today's Meals",
                  style: AppTextStyles.heading3.copyWith(color: textColor),
                ),
                const SizedBox(height: 12),

                // Meal list
                entriesAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) =>
                      const Text('Error loading meals', style: TextStyle(color: AppColors.needsReview)),
                  data: (entries) => entries.isEmpty
                      ? _EmptyMeals(isDark: isDark)
                      : Column(
                          children: entries
                              .map((e) => Padding(
                                    padding: const EdgeInsets.only(bottom: 12),
                                    child: _MealCard(entry: e, isDark: isDark),
                                  ))
                              .toList(),
                        ),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroMacroCard extends StatelessWidget {
  final Animation<double> animation;
  final ({double kcal, double protein, double carbs, double fat}) summary;
  final MacroTargetPlan plan;
  final bool isDark;

  const _HeroMacroCard({
    required this.animation,
    required this.summary,
    required this.plan,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    final kcalLeft = (plan.kcal - summary.kcal).clamp(0, double.infinity);
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: AnimatedBuilder(
          animation: animation,
          builder: (context, _) {
            final kcalNow = summary.kcal * animation.value;
            return Column(
              children: [
                AnimatedMacroRing(
                  animation: animation,
                  proteinFraction: plan.protein > 0 ? summary.protein / plan.protein : 0,
                  carbsFraction: plan.carbs > 0 ? summary.carbs / plan.carbs : 0,
                  fatFraction: plan.fat > 0 ? summary.fat / plan.fat : 0,
                  size: 180,
                  center: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'KCAL EATEN',
                        style: AppTextStyles.labelMono.copyWith(color: AppColors.textSecondaryDark),
                      ),
                      Text(
                        kcalNow.round().toString(),
                        style: AppTextStyles.heroNumber.copyWith(color: textColor),
                      ),
                      Text(
                        'of ${plan.kcal}',
                        style: AppTextStyles.labelSmall.copyWith(
                            color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.kcalLeftPillBg,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '${kcalLeft.round()} kcal left',
                          style: AppTextStyles.labelMono.copyWith(color: AppColors.green),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _MacroSubCards extends StatelessWidget {
  final Animation<double> animation;
  final ({double kcal, double protein, double carbs, double fat}) summary;
  final MacroTargetPlan plan;
  final bool isDark;

  const _MacroSubCards({
    required this.animation,
    required this.summary,
    required this.plan,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _MacroSubCard(
          label: 'Protein',
          current: summary.protein,
          target: plan.protein.toDouble(),
          color: AppColors.protein,
          animation: animation,
          isDark: isDark,
        ),
        const SizedBox(height: 8),
        _MacroSubCard(
          label: 'Carbs',
          current: summary.carbs,
          target: plan.carbs.toDouble(),
          color: AppColors.carbs,
          animation: animation,
          isDark: isDark,
        ),
        const SizedBox(height: 8),
        _MacroSubCard(
          label: 'Fat',
          current: summary.fat,
          target: plan.fat.toDouble(),
          color: AppColors.fat,
          animation: animation,
          isDark: isDark,
        ),
      ],
    );
  }
}

class _MacroSubCard extends StatelessWidget {
  final String label;
  final double current;
  final double target;
  final Color color;
  final Animation<double> animation;
  final bool isDark;

  const _MacroSubCard({
    required this.label,
    required this.current,
    required this.target,
    required this.color,
    required this.animation,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: MacroProgressBar(
          label: label,
          current: current,
          target: target,
          color: color,
          animation: animation,
        ),
      ),
    );
  }
}

class _MealCard extends StatelessWidget {
  final FoodEntry entry;
  final bool isDark;

  const _MealCard({required this.entry, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final subtextColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    return GestureDetector(
      onTap: () => context.goNamed(
        RouteNames.foodDetail,
        pathParameters: {'id': entry.id},
      ),
      onLongPress: () => _showActionMenu(context),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Thumbnail
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: entry.imageUrl != null
                    ? CachedNetworkImage(
                        imageUrl: entry.imageUrl!,
                        width: 60,
                        height: 60,
                        fit: BoxFit.cover,
                      )
                    : _GradientPlaceholder(),
              ),
              const SizedBox(width: 12),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.foodName ?? 'Unknown',
                      style: AppTextStyles.labelLarge.copyWith(color: textColor),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(
                          '${entry.scaledKcal.round()} kcal',
                          style: AppTextStyles.bodyMedium.copyWith(color: textColor),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          DateFormat('h:mm a').format(entry.timestamp),
                          style: AppTextStyles.bodySmall.copyWith(color: subtextColor),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        _MacroPip(
                          value: entry.scaledProtein,
                          color: AppColors.protein,
                          label: 'P',
                        ),
                        const SizedBox(width: 8),
                        _MacroPip(
                          value: entry.scaledCarbs,
                          color: AppColors.carbs,
                          label: 'C',
                        ),
                        const SizedBox(width: 8),
                        _MacroPip(
                          value: entry.scaledFat,
                          color: AppColors.fat,
                          label: 'F',
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    if (entry.confidence != null)
                      ConfidenceBadge(
                        confidence: entry.confidence!,
                        compact: true,
                        onReviewTap: () => context.goNamed(
                          RouteNames.foodDetail,
                          pathParameters: {'id': entry.id},
                        ),
                      ),
                  ],
                ),
              ),

              Icon(Icons.chevron_right, color: subtextColor, size: 18),
            ],
          ),
        ),
      ),
    );
  }

  void _showActionMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => _MealActionMenu(entry: entry),
    );
  }
}

class _GradientPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        width: 60,
        height: 60,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppColors.blue, AppColors.cyan],
          ),
        ),
      );
}

class _MacroPip extends StatelessWidget {
  final double value;
  final Color color;
  final String label;
  const _MacroPip({required this.value, required this.color, required this.label});

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5,
            height: 5,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 3),
          Text('${value.round()}g',
              style: AppTextStyles.bodySmall.copyWith(color: color)),
        ],
      );
}

class _MealActionMenu extends ConsumerWidget {
  final FoodEntry entry;
  const _MealActionMenu({required this.entry});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.borderLight,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),
          ListTile(
            leading: const Icon(Icons.copy_outlined),
            title: const Text('Duplicate'),
            onTap: () {
              Navigator.pop(context);
              // duplicate via repository
            },
          ),
          ListTile(
            leading: const Icon(Icons.label_outline),
            title: const Text('Move meal type'),
            onTap: () => Navigator.pop(context),
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline, color: AppColors.error),
            title: const Text('Delete', style: TextStyle(color: AppColors.error)),
            onTap: () {
              Navigator.pop(context);
              // delete via repository
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _EmptyMeals extends StatelessWidget {
  final bool isDark;
  const _EmptyMeals({required this.isDark});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Column(
          children: [
            Icon(Icons.camera_alt_outlined,
                size: 48,
                color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight),
            const SizedBox(height: 12),
            Text(
              'No meals logged yet',
              style: AppTextStyles.bodyLarge.copyWith(
                  color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight),
            ),
            const SizedBox(height: 6),
            Text(
              'Tap Scan to photograph your meal',
              style: AppTextStyles.bodySmall.copyWith(
                  color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight),
            ),
          ],
        ),
      );
}
