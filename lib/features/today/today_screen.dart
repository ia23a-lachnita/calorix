import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'providers/today_providers.dart';
import '../../shared/models/food_entry.dart';
import '../../shared/models/macro_target_plan.dart';
import '../../shared/widgets/macro_ring.dart';
import '../../shared/widgets/macro_progress_bar.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/router/route_names.dart';
import '../../shared/providers/auth_provider.dart';
import '../../shared/providers/ui_diff_provider.dart';
import '../../debug/ui_diff/ui_diff_anchor.dart';

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
    if (kDebugMode) {
      UiDiffAnchorRegistry.instance.setScreen('today');
    }
    final isUiDiffMode = ref.read(uiDiffModeProvider);
    _countUp = AnimationController(
      vsync: this,
      duration:
          isUiDiffMode ? Duration.zero : const Duration(milliseconds: 1400),
    );
    _animation = CurvedAnimation(parent: _countUp, curve: Curves.easeOutCubic);
    _countUp.forward();
    // Auto-dump removed: anchor export is driven by the integration test
    // (integration_test/today_anchor_dump_test.dart) after pumpAndSettle,
    // ensuring a stable fully-rendered layout before writing the artifact.
  }

  @override
  void dispose() {
    _countUp.dispose();
    super.dispose();
  }

  String? _userInitials(String? displayName) {
    if (displayName == null || displayName.trim().isEmpty) return null;
    final parts = displayName.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return parts[0][0].toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final entriesAsync = ref.watch(todayEntriesProvider);
    final summary = ref.watch(todayMacroSummaryProvider);
    final planAsync = ref.watch(activePlanProvider);
    final plan = planAsync.valueOrNull ?? MacroTargetPlan.defaultPlan();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor =
        isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final user = ref.watch(authStateProvider).valueOrNull;
    final isUiDiffMode = ref.watch(uiDiffModeProvider);
    final initials =
        _userInitials(user?.displayName) ?? (isUiDiffMode ? 'EK' : null);
    final headerDate = isUiDiffMode
        ? 'FRIDAY · MAY 15'
        : DateFormat('EEEE · MMMM d').format(DateTime.now()).toUpperCase();
    final media = MediaQuery.of(context);
    final mockupScale = (media.size.width / 393.0).clamp(0.86, 1.0);

    return Scaffold(
      body: MediaQuery(
        data: media.copyWith(textScaler: TextScaler.linear(mockupScale)),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(
                  20 * mockupScale,
                  54 * mockupScale,
                  20 * mockupScale,
                  8 * mockupScale,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          headerDate,
                          style: AppTextStyles.labelMono.copyWith(
                            fontSize: 10,
                            letterSpacing: 1.6,
                            color: isDark
                                ? AppColors.textSecondaryDark
                                : AppColors.textSecondaryLight,
                          ),
                        ),
                        SizedBox(height: 4 * mockupScale),
                        Text(
                          'Today',
                          style: AppTextStyles.todayTitle
                              .copyWith(color: textColor),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        _HeaderCircleButton(
                          isDark: isDark,
                          scale: mockupScale,
                          onTap: () {},
                          child: Icon(
                            Icons.notifications_none,
                            size: 18 * mockupScale,
                            color: isDark
                                ? AppColors.textSecondaryDark
                                : AppColors.textSecondaryLight,
                          ),
                        ),
                        SizedBox(width: 8 * mockupScale),
                        _HeaderCircleButton(
                          isDark: isDark,
                          scale: mockupScale,
                          onTap: () => context.goNamed(RouteNames.profile),
                          child: initials != null
                              ? Center(
                                  child: Text(
                                    initials,
                                    style: AppTextStyles.labelLarge.copyWith(
                                      color: isDark
                                          ? AppColors.textPrimaryDark
                                          : AppColors.textPrimaryLight,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13.3,
                                    ),
                                  ),
                                )
                              : Icon(
                                  Icons.person,
                                  size: 18 * mockupScale,
                                  color: isDark
                                      ? AppColors.textSecondaryDark
                                      : AppColors.textSecondaryLight,
                                ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Padding(
                padding: EdgeInsets.only(
                  left: 16 * mockupScale,
                  right: 16 * mockupScale,
                  top: 14 * mockupScale,
                ),
                child: UiDiffAnchor(
                  id: 'today.macroRingHero',
                  label: 'Hero macro ring card',
                  child: _HeroMacroCard(
                    animation: _animation,
                    summary: summary,
                    plan: plan,
                    isDark: isDark,
                    disableImplicitAnimation: isUiDiffMode,
                    scale: mockupScale,
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(
                  20 * mockupScale,
                  20 * mockupScale,
                  20 * mockupScale,
                  8 * mockupScale,
                ),
                child: entriesAsync.when(
                  loading: () => Text(
                    'Recent scans',
                    style: AppTextStyles.todaySectionHeading
                        .copyWith(color: textColor),
                  ),
                  error: (_, __) => Text(
                    'Recent scans',
                    style: AppTextStyles.todaySectionHeading
                        .copyWith(color: textColor),
                  ),
                  data: (entries) => UiDiffAnchor(
                    id: 'today.recentScansSection',
                    label: 'Recent scans section header',
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(
                          'Recent scans',
                          style: AppTextStyles.todaySectionHeading
                              .copyWith(color: textColor),
                        ),
                        if (entries.isNotEmpty)
                          UiDiffAnchor(
                            id: 'today.recentScansCount',
                            label: '${entries.length} TODAY',
                            child: Text(
                              '${entries.length} TODAY',
                              style: AppTextStyles.labelMono.copyWith(
                                fontSize: 10,
                                letterSpacing: 1.6,
                                color: isDark
                                    ? AppColors.textSecondaryDark
                                    : AppColors.textSecondaryLight,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(
                  16 * mockupScale,
                  0,
                  16 * mockupScale,
                  20 * mockupScale,
                ),
                child: entriesAsync.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, _) => _EmptyMeals(isDark: isDark),
                  data: (entries) => entries.isEmpty
                      ? _EmptyMeals(isDark: isDark)
                      : UiDiffAnchor(
                          id: 'today.mealCardsSection',
                          label: 'Meal cards section',
                          child: Column(
                            children: entries
                                .map(
                                  (e) => Padding(
                                    padding: EdgeInsets.only(
                                        bottom: 10 * mockupScale),
                                    child: _MealCard(
                                      entry: e,
                                      isDark: isDark,
                                      scale: mockupScale,
                                    ),
                                  ),
                                )
                                .toList(),
                          ),
                        ),
                ),
              ),
              Padding(
                key: const ValueKey('today.bottomContentSpacer'),
                padding: EdgeInsets.only(bottom: 132 * mockupScale),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeaderCircleButton extends StatelessWidget {
  const _HeaderCircleButton({
    required this.isDark,
    required this.scale,
    required this.onTap,
    required this.child,
  });

  final bool isDark;
  final double scale;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 38 * scale,
          height: 38 * scale,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isDark ? const Color(0x08FFFFFF) : AppColors.surfaceLight,
            border: Border.all(
              color: isDark ? const Color(0x21FFFFFF) : AppColors.borderLight,
              width: 0.5,
            ),
          ),
          child: child,
        ),
      );
}

class _HeroMacroCard extends StatelessWidget {
  final Animation<double> animation;
  final ({double kcal, double protein, double carbs, double fat}) summary;
  final MacroTargetPlan plan;
  final bool isDark;
  final bool disableImplicitAnimation;
  final double scale;

  const _HeroMacroCard({
    required this.animation,
    required this.summary,
    required this.plan,
    required this.isDark,
    required this.disableImplicitAnimation,
    required this.scale,
  });

  @override
  Widget build(BuildContext context) {
    final kcalLeft = (plan.kcal - summary.kcal).clamp(0, double.infinity);
    final textColor =
        isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 0),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(28 * scale)),
      child: Padding(
        padding: EdgeInsets.all(14 * scale),
        child: AnimatedBuilder(
          animation: animation,
          builder: (context, _) {
            final kcalNow = summary.kcal * animation.value;
            final pNow = summary.protein * animation.value;
            final cNow = summary.carbs * animation.value;
            final fNow = summary.fat * animation.value;
            return Column(
              children: [
                SizedBox(height: 8 * scale),
                Center(
                  child: AnimatedMacroRing(
                    animation: animation,
                    proteinFraction:
                        plan.protein > 0 ? summary.protein / plan.protein : 0,
                    carbsFraction:
                        plan.carbs > 0 ? summary.carbs / plan.carbs : 0,
                    fatFraction: plan.fat > 0 ? summary.fat / plan.fat : 0,
                    size: 222 * scale,
                    strokeWidth: 10 * scale,
                    trackColor: isDark
                        ? const Color(0x0FFFFFFF)
                        : const Color(0xFFF2F0EB),
                    center: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'KCAL EATEN',
                          style: AppTextStyles.labelMono.copyWith(
                              color: isDark
                                  ? AppColors.textSecondaryDark
                                  : AppColors.textSecondaryLight),
                        ),
                        Text(
                          NumberFormat('#,###').format(kcalNow.round()),
                          style: AppTextStyles.todayHeroNumber
                              .copyWith(color: textColor),
                        ),
                        Text.rich(
                          TextSpan(
                            text: 'of ',
                            style: AppTextStyles.labelSmall.copyWith(
                              fontSize: 11,
                              color: isDark
                                  ? AppColors.textSecondaryDark
                                  : AppColors.textSecondaryLight,
                            ),
                            children: [
                              TextSpan(
                                text: NumberFormat('#,###').format(plan.kcal),
                                style: AppTextStyles.todayMonoTarget.copyWith(
                                  fontSize: 11,
                                  color: isDark
                                      ? AppColors.textPrimaryDark
                                          .withValues(alpha: 0.78)
                                      : AppColors.textPrimaryLight
                                          .withValues(alpha: 0.78),
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(height: 4 * scale),
                        UiDiffAnchor(
                          id: 'today.kcalLeftPill',
                          label:
                              '${NumberFormat('#,###').format(kcalLeft.round())} kcal left',
                          child: Container(
                            key: const ValueKey('today.kcalLeftPillContainer'),
                            constraints: BoxConstraints(maxWidth: 122 * scale),
                            padding: EdgeInsets.symmetric(
                              horizontal: 8 * scale,
                              vertical: 3 * scale,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.kcalLeftPillBg,
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Text(
                                '${NumberFormat('#,###').format(kcalLeft.round())} kcal left',
                                maxLines: 1,
                                style: AppTextStyles.labelMono.copyWith(
                                  color: AppColors.green,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0.4,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                SizedBox(height: 10 * scale),
                UiDiffAnchor(
                  id: 'today.proteinRow',
                  label: 'Protein macro row',
                  child: _MacroSubCardItem(
                      label: 'Protein',
                      current: pNow,
                      target: plan.protein.toDouble(),
                      color: AppColors.protein,
                      isDark: isDark,
                      animation: animation,
                      disableImplicitAnimation: disableImplicitAnimation,
                      scale: scale),
                ),
                SizedBox(height: 8 * scale),
                UiDiffAnchor(
                  id: 'today.carbsRow',
                  label: 'Carbs macro row',
                  child: _MacroSubCardItem(
                      label: 'Carbs',
                      current: cNow,
                      target: plan.carbs.toDouble(),
                      color: AppColors.carbs,
                      isDark: isDark,
                      animation: animation,
                      disableImplicitAnimation: disableImplicitAnimation,
                      scale: scale),
                ),
                SizedBox(height: 8 * scale),
                UiDiffAnchor(
                  id: 'today.fatRow',
                  label: 'Fat macro row',
                  child: _MacroSubCardItem(
                      label: 'Fat',
                      current: fNow,
                      target: plan.fat.toDouble(),
                      color: AppColors.fat,
                      isDark: isDark,
                      animation: animation,
                      disableImplicitAnimation: disableImplicitAnimation,
                      scale: scale),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _MacroSubCardItem extends StatelessWidget {
  final String label;
  final double current;
  final double target;
  final Color color;
  final Animation<double> animation;
  final bool isDark;
  final bool disableImplicitAnimation;
  final double scale;

  const _MacroSubCardItem({
    required this.label,
    required this.current,
    required this.target,
    required this.color,
    required this.animation,
    required this.isDark,
    required this.disableImplicitAnimation,
    required this.scale,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0x08FFFFFF) : const Color(0xFFFAF8F3),
        borderRadius: BorderRadius.circular(18 * scale),
        border: Border.all(
          color: isDark ? const Color(0x12FFFFFF) : const Color(0x120B0D10),
          width: 0.5,
        ),
      ),
      padding:
          EdgeInsets.symmetric(horizontal: 14 * scale, vertical: 12 * scale),
      child: MacroProgressBar(
        label: label,
        current: current,
        target: target,
        color: color,
        animation: animation,
        denseTodayStyle: true,
        disableImplicitAnimation: disableImplicitAnimation,
      ),
    );
  }
}

class _MealCard extends StatelessWidget {
  final FoodEntry entry;
  final bool isDark;
  final double scale;

  const _MealCard({
    required this.entry,
    required this.isDark,
    required this.scale,
  });

  @override
  Widget build(BuildContext context) {
    final textColor =
        isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final subtextColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    return GestureDetector(
      onTap: () => context.goNamed(
        RouteNames.foodDetail,
        pathParameters: {'id': entry.id},
      ),
      onLongPress: () => _showActionMenu(context),
      child: Card(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22 * scale),
          side: BorderSide(
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
          ),
        ),
        child: Padding(
          padding: EdgeInsets.all(12 * scale),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(16 * scale),
                child: entry.imageUrl != null
                    ? CachedNetworkImage(
                        imageUrl: entry.imageUrl!,
                        width: 60 * scale,
                        height: 60 * scale,
                        fit: BoxFit.cover,
                      )
                    : _GradientPlaceholder(scale: scale),
              ),
              SizedBox(width: 12 * scale),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Expanded(
                          child: Text(
                            entry.foodName ?? 'Unknown',
                            style: AppTextStyles.todayMealTitle
                                .copyWith(color: textColor),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        SizedBox(width: 8 * scale),
                        Text(
                          '${entry.scaledKcal.round()}',
                          style: AppTextStyles.todayMonoValue.copyWith(
                            color: textColor,
                            fontSize: 15,
                          ),
                        ),
                        Text(
                          'kcal',
                          style: AppTextStyles.bodySmall.copyWith(
                            color: subtextColor,
                            fontSize: 10,
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 2 * scale),
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            '${DateFormat('HH:mm').format(entry.timestamp)} · ${entry.mealType.name[0].toUpperCase()}${entry.mealType.name.substring(1)}',
                            style: AppTextStyles.todayMealMeta
                                .copyWith(color: subtextColor),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        _MealMetaDivider(
                          color: subtextColor,
                          scale: scale,
                        ),
                        _MacroPip(
                          value: entry.scaledProtein,
                          color: AppColors.protein,
                          scale: scale,
                        ),
                        SizedBox(width: 8 * scale),
                        _MacroPip(
                          value: entry.scaledCarbs,
                          color: AppColors.carbs,
                          scale: scale,
                        ),
                        SizedBox(width: 8 * scale),
                        _MacroPip(
                          value: entry.scaledFat,
                          color: AppColors.fat,
                          scale: scale,
                        ),
                      ],
                    ),
                    SizedBox(height: 4 * scale),
                    if (entry.confidence != null)
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          _TodayConfidenceBadge(
                            confidence: entry.confidence!,
                            isDark: isDark,
                            scale: scale,
                          ),
                          if (entry.confidence! < 0.75)
                            GestureDetector(
                              onTap: () => context.goNamed(
                                RouteNames.foodDetail,
                                pathParameters: {'id': entry.id},
                              ),
                              child: Text(
                                'Needs review →',
                                style: AppTextStyles.labelSmall.copyWith(
                                  color: AppColors.needsReview,
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
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

  void _showActionMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => _MealActionMenu(entry: entry),
    );
  }
}

class _GradientPlaceholder extends StatelessWidget {
  const _GradientPlaceholder({required this.scale});

  final double scale;

  @override
  Widget build(BuildContext context) => Stack(
        children: [
          Container(
            width: 60 * scale,
            height: 60 * scale,
            decoration: const BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(-0.2, -0.2),
                radius: 0.85,
                colors: [Color(0xFFD6B487), Color(0xFF8A5D36)],
              ),
            ),
          ),
          Positioned(
            top: 12 * scale,
            left: 14 * scale,
            child: Transform.rotate(
              angle: -0.35,
              child: Container(
                width: 18 * scale,
                height: 8 * scale,
                decoration: BoxDecoration(
                  color: const Color(0x73FFFFFF),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
          ),
        ],
      );
}

class _MacroPip extends StatelessWidget {
  final double value;
  final Color color;
  final double scale;
  const _MacroPip({
    required this.value,
    required this.color,
    required this.scale,
  });

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5 * scale,
            height: 5 * scale,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          SizedBox(width: 3 * scale),
          Text('${value.round()}g',
              style: AppTextStyles.todayMealMeta.copyWith(color: color)),
        ],
      );
}

class _MealMetaDivider extends StatelessWidget {
  const _MealMetaDivider({required this.color, required this.scale});

  final Color color;
  final double scale;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.symmetric(horizontal: 8 * scale),
        child: Container(
          width: 3 * scale,
          height: 3 * scale,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.5),
            shape: BoxShape.circle,
          ),
        ),
      );
}

class _TodayConfidenceBadge extends StatelessWidget {
  final double confidence;
  final bool isDark;
  final double scale;

  const _TodayConfidenceBadge({
    required this.confidence,
    required this.isDark,
    required this.scale,
  });

  @override
  Widget build(BuildContext context) {
    final good = confidence >= 0.80;
    final dotColor = good ? AppColors.green : AppColors.needsReview;
    final textColor = isDark
        ? AppColors.textPrimaryDark.withValues(alpha: 0.78)
        : AppColors.textPrimaryLight.withValues(alpha: 0.78);

    return Container(
      constraints: BoxConstraints(maxWidth: 156 * scale),
      padding: EdgeInsets.fromLTRB(6 * scale, 3 * scale, 8 * scale, 3 * scale),
      decoration: BoxDecoration(
        color: isDark ? const Color(0x0AFFFFFF) : const Color(0xFFF4F2EE),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
          width: 0.5,
        ),
      ),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 5 * scale,
              height: 5 * scale,
              decoration: BoxDecoration(
                color: dotColor,
                shape: BoxShape.circle,
              ),
            ),
            SizedBox(width: 5 * scale),
            Text(
              '${(confidence * 100).round()}% · ${good ? 'Confirmed' : 'Review'}',
              style: AppTextStyles.labelMono.copyWith(
                color: textColor,
                fontSize: 10,
                letterSpacing: 0.6,
              ),
            ),
          ],
        ),
      ),
    );
  }
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
            },
          ),
          ListTile(
            leading: const Icon(Icons.label_outline),
            title: const Text('Move meal type'),
            onTap: () => Navigator.pop(context),
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline, color: AppColors.error),
            title:
                const Text('Delete', style: TextStyle(color: AppColors.error)),
            onTap: () {
              Navigator.pop(context);
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
                color: isDark
                    ? AppColors.textSecondaryDark
                    : AppColors.textSecondaryLight),
            const SizedBox(height: 12),
            Text(
              'No meals logged yet',
              style: AppTextStyles.bodyLarge.copyWith(
                  color: isDark
                      ? AppColors.textSecondaryDark
                      : AppColors.textSecondaryLight),
            ),
            const SizedBox(height: 6),
            Text(
              'Tap Scan to photograph your meal',
              style: AppTextStyles.bodySmall.copyWith(
                  color: isDark
                      ? AppColors.textSecondaryDark
                      : AppColors.textSecondaryLight),
            ),
          ],
        ),
      );
}
