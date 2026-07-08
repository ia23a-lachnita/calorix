import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'providers/goals_providers.dart';
import '../../shared/models/daily_log.dart';
import '../../shared/models/macro_target_plan.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/constants/app_constants.dart';

/// Static coaching anchors from the handoff (no real TDEE model in V1).
const _tdee = 2820;
const _bmr = 1950;

class GoalsScreen extends ConsumerStatefulWidget {
  const GoalsScreen({super.key});

  @override
  ConsumerState<GoalsScreen> createState() => _GoalsScreenState();
}

class _GoalsScreenState extends ConsumerState<GoalsScreen> {
  bool _periodOpen = false;
  String? _periodLabel;

  @override
  Widget build(BuildContext context) {
    final macroSplit = ref.watch(macroSplitProvider);
    final bodyGoal = ref.watch(bodyGoalProvider);
    final plan = ref.watch(activePlanProvider).valueOrNull ??
        MacroTargetPlan.defaultPlan();
    final weightLogs = ref.watch(weightLogsProvider).valueOrNull ?? [];
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    final planWeek = _planWeek(plan);
    final periodLabel = _periodLabel ?? 'Week $planWeek';

    return Scaffold(
      body: Stack(
        children: [
          CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _PeriodPill(
                                planName: plan.planName,
                                label: periodLabel,
                                isOpen: _periodOpen,
                                isDark: isDark,
                                onTap: () =>
                                    setState(() => _periodOpen = !_periodOpen),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Goals',
                                style: AppTextStyles.heading1.copyWith(
                                  color: ink,
                                  fontSize: 30,
                                  letterSpacing: 30 * -0.04,
                                  height: 1,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: isDark
                                ? AppColors.surfaceDark
                                : AppColors.surfaceLight,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              width: 0.5,
                              color: isDark
                                  ? AppColors.borderDark
                                  : AppColors.borderLight,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.tune_rounded, size: 13, color: muted),
                              const SizedBox(width: 4),
                              Text(
                                'Adjust',
                                style: AppTextStyles.labelSmall.copyWith(
                                  fontSize: 12,
                                  color: isDark
                                      ? AppColors.textPrimaryDark
                                          .withValues(alpha: 0.78)
                                      : const Color(0xFF3A4048),
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
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    _BodyGoalSegmented(
                      current: bodyGoal,
                      isDark: isDark,
                      onChanged: (g) {
                        ref.read(bodyGoalProvider.notifier).state = g;
                        _autoComputeMacros(ref, g);
                      },
                    ),
                    const SizedBox(height: 14),
                    _CalorieCard(
                      kcal: macroSplit.kcal,
                      onChanged: (v) =>
                          ref.read(macroSplitProvider.notifier).setKcal(v),
                      isDark: isDark,
                    ),
                    const SizedBox(height: 12),
                    _MacroSplitCard(
                      split: macroSplit,
                      notifier: ref.read(macroSplitProvider.notifier),
                      weightKg: weightLogs.isNotEmpty
                          ? weightLogs.last.weight
                          : 80.0,
                      isDark: isDark,
                    ),
                    const SizedBox(height: 12),
                    _WeightCard(
                      logs: weightLogs,
                      goal: bodyGoal,
                      isDark: isDark,
                      onLogWeight: (kg) => ref.read(logWeightProvider)(kg),
                    ),
                    const SizedBox(height: 110),
                  ]),
                ),
              ),
            ],
          ),
          // goals_select state: dropdown anchored under the period pill with
          // a transparent barrier that dismisses it.
          if (_periodOpen) ...[
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => setState(() => _periodOpen = false),
                child: const SizedBox.expand(),
              ),
            ),
            Positioned(
              top: MediaQuery.viewPaddingOf(context).top + 16 + 32,
              left: 20,
              child: _PeriodDropdown(
                plan: plan,
                planWeek: planWeek,
                selectedLabel: periodLabel,
                isDark: isDark,
                onSelected: (label) => setState(() {
                  _periodLabel = label;
                  _periodOpen = false;
                }),
              ),
            ),
          ],
        ],
      ),
    );
  }

  int _planWeek(MacroTargetPlan plan) {
    final days = DateTime.now().difference(plan.startDate).inDays;
    return (days ~/ 7) + 1;
  }

  void _autoComputeMacros(WidgetRef ref, BodyGoal goal) {
    final notifier = ref.read(macroSplitProvider.notifier);
    switch (goal) {
      case BodyGoal.loseFat:
        notifier.setKcal(2000);
        break;
      case BodyGoal.maintain:
        notifier.setKcal(2400);
        break;
      case BodyGoal.leanPlus:
        notifier.setKcal(2800);
        break;
      case BodyGoal.custom:
        break;
    }
  }
}

// ─── Period pill + dropdown (goals_select) ───────────────────────────────────

class _PeriodPill extends StatelessWidget {
  const _PeriodPill({
    required this.planName,
    required this.label,
    required this.isOpen,
    required this.isDark,
    required this.onTap,
  });

  final String planName;
  final String label;
  final bool isOpen;
  final bool isDark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        key: const Key('goals-period-pill'),
        padding: const EdgeInsets.fromLTRB(10, 4, 8, 4),
        decoration: BoxDecoration(
          color: isDark
              ? Colors.white.withValues(alpha: isOpen ? 0.05 : 0.04)
              : (isOpen ? Colors.white : const Color(0xFFFBFAF6)),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            width: 0.5,
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 5,
              height: 5,
              decoration: const BoxDecoration(
                  color: AppColors.cyan, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(
              'PLAN · ${planName.toUpperCase()} ·',
              style: AppTextStyles.labelMono.copyWith(
                fontSize: 10,
                letterSpacing: 10 * 0.10,
                color: muted,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: AppTextStyles.labelLarge.copyWith(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: ink,
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.keyboard_arrow_down, size: 12, color: muted),
          ],
        ),
      ),
    );
  }
}

class _PeriodDropdown extends StatelessWidget {
  const _PeriodDropdown({
    required this.plan,
    required this.planWeek,
    required this.selectedLabel,
    required this.isDark,
    required this.onSelected,
  });

  final MacroTargetPlan plan;
  final int planWeek;
  final String selectedLabel;
  final bool isDark;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    final rows = <Widget>[];
    Widget group(String label) => Padding(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
          child: Text(
            label.toUpperCase(),
            style: AppTextStyles.labelMono.copyWith(
              fontSize: 9,
              letterSpacing: 9 * 0.14,
              color: muted,
            ),
          ),
        );

    Widget item({
      required String label,
      required String sub,
      bool dim = false,
    }) {
      final active = label == selectedLabel;
      return GestureDetector(
        onTap: () => onSelected(label),
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: active
                ? AppColors.cyan.withValues(alpha: isDark ? 0.10 : 0.12)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Opacity(
            opacity: dim && !active ? 0.7 : 1,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: AppTextStyles.labelLarge.copyWith(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: ink,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      sub,
                      style: AppTextStyles.labelMono
                          .copyWith(fontSize: 10, color: muted),
                    ),
                  ],
                ),
                if (active)
                  const Icon(Icons.check, size: 13, color: AppColors.cyan),
              ],
            ),
          ),
        ),
      );
    }

    rows.add(group('Weeks'));
    for (var w = planWeek; w >= 1 && w > planWeek - 5; w--) {
      final start = plan.startDate.add(Duration(days: (w - 1) * 7));
      final end = start.add(const Duration(days: 6));
      final sameMonth = start.month == end.month;
      final range = sameMonth
          ? '${DateFormat('MMM d').format(start)} – ${end.day}'
          : '${DateFormat('MMM d').format(start)} – ${DateFormat('MMM d').format(end)}';
      rows.add(item(label: 'Week $w', sub: range, dim: w != planWeek));
    }
    rows.add(group('Months'));
    final now = DateTime.now();
    for (var i = 0; i < 3; i++) {
      final month = DateTime(now.year, now.month - i, 1);
      final label = DateFormat('MMMM yyyy').format(month);
      final sub = i == 0
          ? '${plan.planName.toLowerCase()} · $planWeek wk in'
          : 'before this plan';
      rows.add(item(label: label, sub: sub, dim: i != 0));
    }

    return Container(
      key: const Key('goals-period-dropdown'),
      constraints: const BoxConstraints(minWidth: 230, maxWidth: 260),
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          width: 0.5,
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.5 : 0.15),
            blurRadius: 32,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: rows,
      ),
    );
  }
}

// ─── Body goal ────────────────────────────────────────────────────────────────

class _BodyGoalSegmented extends StatelessWidget {
  const _BodyGoalSegmented({
    required this.current,
    required this.isDark,
    required this.onChanged,
  });

  final BodyGoal current;
  final bool isDark;
  final ValueChanged<BodyGoal> onChanged;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final goals = [
      (BodyGoal.loseFat, 'Lose fat', '-0.5kg/wk'),
      (BodyGoal.maintain, 'Maintain', ''),
      (BodyGoal.leanPlus, 'Lean+', '+0.2kg/wk'),
      (BodyGoal.custom, 'Custom', ''),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            'BODY GOAL',
            style: AppTextStyles.labelMono.copyWith(color: muted),
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: isDark
                ? Colors.white.withValues(alpha: 0.04)
                : const Color(0xFFEDE9E1),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              width: 0.5,
              color: isDark ? AppColors.borderDark : AppColors.borderLight,
            ),
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (i, g) in goals.indexed) ...[
                  if (i > 0) const SizedBox(width: 6),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => onChanged(g.$1),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 10),
                        decoration: BoxDecoration(
                          color: g.$1 == current
                              ? (isDark
                                  ? AppColors.surfaceDark
                                  : AppColors.surfaceLight)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            width: 0.5,
                            color: g.$1 == current
                                ? (isDark
                                    ? AppColors.borderDark
                                    : AppColors.borderLight)
                                : Colors.transparent,
                          ),
                          boxShadow: g.$1 == current
                              ? [
                                  BoxShadow(
                                    color:
                                        Colors.black.withValues(alpha: 0.06),
                                    blurRadius: 6,
                                    offset: const Offset(0, 2),
                                  ),
                                ]
                              : null,
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              g.$2,
                              textAlign: TextAlign.center,
                              style: AppTextStyles.labelLarge.copyWith(
                                fontSize: 12.5,
                                fontWeight: g.$1 == current
                                    ? FontWeight.w600
                                    : FontWeight.w500,
                                color: g.$1 == current ? ink : muted,
                              ),
                            ),
                            if (g.$3.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                g.$3,
                                style: AppTextStyles.labelMono.copyWith(
                                  fontSize: 9.5,
                                  letterSpacing: 9.5 * 0.04,
                                  color: g.$1 == current
                                      ? AppColors.green
                                      : muted,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Calorie card ─────────────────────────────────────────────────────────────

class _CalorieCard extends StatelessWidget {
  const _CalorieCard({
    required this.kcal,
    required this.onChanged,
    required this.isDark,
  });

  final int kcal;
  final ValueChanged<int> onChanged;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final delta = _tdee - kcal;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 18),
      decoration: _cardDecoration(isDark),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('DAILY CALORIE TARGET',
                        style:
                            AppTextStyles.labelMono.copyWith(color: muted)),
                    const SizedBox(height: 4),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(
                          NumberFormat('#,###').format(kcal),
                          style: AppTextStyles.labelMono.copyWith(
                            fontSize: 32,
                            fontWeight: FontWeight.w600,
                            color: ink,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text('kcal',
                            style: AppTextStyles.bodySmall
                                .copyWith(fontSize: 13, color: muted)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.blue.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.auto_awesome,
                              size: 11, color: AppColors.blue),
                          const SizedBox(width: 4),
                          Text(
                            'AI · TDEE ${NumberFormat('#,###').format(_tdee)} ${delta >= 0 ? '−' : '+'} ${delta.abs()}',
                            style: AppTextStyles.labelMono.copyWith(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 10 * 0.04,
                              color: AppColors.blue,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              _MultiplierStepper(
                kcal: kcal,
                isDark: isDark,
                onChanged: onChanged,
              ),
            ],
          ),
          const SizedBox(height: 18),
          _GradientKcalSlider(
            value: kcal,
            min: AppConstants.kcalSliderMin,
            max: AppConstants.kcalSliderMax,
            isDark: isDark,
            onChanged: onChanged,
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (final label in [
                NumberFormat('#,###').format(AppConstants.kcalSliderMin),
                'BMR ${NumberFormat('#,###').format(_bmr)}',
                'TDEE ${NumberFormat('#,###').format(_tdee)}',
                NumberFormat('#,###').format(AppConstants.kcalSliderMax),
              ])
                Text(
                  label,
                  style: AppTextStyles.labelMono.copyWith(
                    fontSize: 9.5,
                    letterSpacing: 9.5 * 0.06,
                    color: muted,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MultiplierStepper extends StatelessWidget {
  const _MultiplierStepper({
    required this.kcal,
    required this.isDark,
    required this.onChanged,
  });

  final int kcal;
  final bool isDark;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final multiplier = kcal / AppConstants.defaultKcalTarget;

    Widget button(IconData icon, int step) => GestureDetector(
          onTap: () => onChanged((kcal + step)
              .clamp(AppConstants.kcalSliderMin, AppConstants.kcalSliderMax)),
          behavior: HitTestBehavior.opaque,
          child: Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isDark
                  ? Colors.white.withValues(alpha: 0.05)
                  : const Color(0xFFF4F2EE),
            ),
            child: Icon(icon, size: 14, color: ink),
          ),
        );

    return Container(
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.white.withValues(alpha: 0.03)
            : const Color(0xFFFBFAF6),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          width: 0.5,
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          button(Icons.remove, -100),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Text(
              '${multiplier.toStringAsFixed(1)}×',
              style: AppTextStyles.labelMono.copyWith(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: ink,
              ),
            ),
          ),
          button(Icons.add, 100),
        ],
      ),
    );
  }
}

class _GradientKcalSlider extends StatelessWidget {
  const _GradientKcalSlider({
    required this.value,
    required this.min,
    required this.max,
    required this.isDark,
    required this.onChanged,
  });

  final int value;
  final int min;
  final int max;
  final bool isDark;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final fraction = ((value - min) / (max - min)).clamp(0.0, 1.0);

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;

        void handle(double dx) {
          final f = (dx / width).clamp(0.0, 1.0);
          final raw = min + f * (max - min);
          onChanged(((raw / 50).round() * 50).clamp(min, max));
        }

        return GestureDetector(
          key: const Key('goals-kcal-slider'),
          behavior: HitTestBehavior.opaque,
          onTapDown: (d) => handle(d.localPosition.dx),
          onHorizontalDragUpdate: (d) => handle(d.localPosition.dx),
          child: SizedBox(
            height: 32,
            child: Stack(
              alignment: Alignment.centerLeft,
              children: [
                // Full track: brand gradient at 25% opacity.
                Container(
                  height: 6,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    gradient: LinearGradient(
                      colors: [
                        AppColors.blue.withValues(alpha: 0.25),
                        AppColors.cyan.withValues(alpha: 0.25),
                        AppColors.green.withValues(alpha: 0.25),
                      ],
                    ),
                  ),
                ),
                // Filled portion: solid brand gradient.
                Container(
                  height: 6,
                  width: width * fraction,
                  decoration: const BoxDecoration(
                    borderRadius: BorderRadius.all(Radius.circular(999)),
                    gradient: LinearGradient(colors: AppColors.brandGradient),
                  ),
                ),
                Positioned(
                  left: (width * fraction - 13).clamp(0.0, width - 26),
                  child: Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isDark
                          ? AppColors.surfaceDark
                          : AppColors.surfaceLight,
                      border: Border.all(width: 1.5, color: ink),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.18),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Center(
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration:
                            BoxDecoration(shape: BoxShape.circle, color: ink),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ─── Macro split ──────────────────────────────────────────────────────────────

class _MacroSplitCard extends StatelessWidget {
  const _MacroSplitCard({
    required this.split,
    required this.notifier,
    required this.weightKg,
    required this.isDark,
  });

  final ({int kcal, int protein, int carbs, int fat}) split;
  final MacroSplitNotifier notifier;
  final double weightKg;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final kcal = split.kcal > 0 ? split.kcal : 1;
    final proteinPct = (split.protein * 4 / kcal).clamp(0.0, 1.0);
    final carbsPct = (split.carbs * 4 / kcal).clamp(0.0, 1.0);
    final fatPct = (split.fat * 9 / kcal).clamp(0.0, 1.0);
    final rest = (1 - proteinPct - carbsPct - fatPct).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(isDark),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('MACRO SPLIT',
                  style: AppTextStyles.labelMono.copyWith(color: muted)),
              Text(
                '${(proteinPct * 100).round()}% / ${(carbsPct * 100).round()}% / ${(fatPct * 100).round()}%',
                style: AppTextStyles.labelMono.copyWith(
                  fontSize: 10.5,
                  letterSpacing: 10.5 * 0.06,
                  color: muted,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              height: 10,
              child: Row(
                // Stretch, or the childless ColoredBoxes collapse to zero
                // height and the bar disappears.
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    flex: (proteinPct * 1000).round(),
                    child: const ColoredBox(
                        key: Key('macro-split-protein'),
                        color: AppColors.protein),
                  ),
                  Expanded(
                    flex: (carbsPct * 1000).round(),
                    child: const ColoredBox(color: AppColors.carbs),
                  ),
                  Expanded(
                    flex: (fatPct * 1000).round(),
                    child: const ColoredBox(color: AppColors.fat),
                  ),
                  if (rest > 0.005)
                    Expanded(
                      flex: (rest * 1000).round(),
                      child: ColoredBox(
                        color: isDark
                            ? Colors.white.withValues(alpha: 0.06)
                            : const Color(0xFF0B0D10).withValues(alpha: 0.05),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _TargetTile(
                label: 'PROTEIN',
                grams: split.protein,
                color: AppColors.protein,
                perKg: split.protein / weightKg,
                isDark: isDark,
                onChanged: notifier.setProtein,
              ),
              const SizedBox(width: 8),
              _TargetTile(
                label: 'CARBS',
                grams: split.carbs,
                color: AppColors.carbs,
                perKg: split.carbs / weightKg,
                isDark: isDark,
                onChanged: notifier.setCarbs,
              ),
              const SizedBox(width: 8),
              _TargetTile(
                label: 'FAT',
                grams: split.fat,
                color: AppColors.fat,
                perKg: split.fat / weightKg,
                isDark: isDark,
                onChanged: notifier.setFat,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TargetTile extends StatelessWidget {
  const _TargetTile({
    required this.label,
    required this.grams,
    required this.color,
    required this.perKg,
    required this.isDark,
    required this.onChanged,
  });

  final String label;
  final int grams;
  final Color color;
  final double perKg;
  final bool isDark;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    return Expanded(
      child: GestureDetector(
        onTap: () => _showInput(context),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: isDark
                ? Colors.white.withValues(alpha: 0.03)
                : const Color(0xFFF8F6F1),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              width: 0.5,
              color: isDark ? AppColors.borderDark : AppColors.borderLight,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration:
                        BoxDecoration(color: color, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 5),
                  Flexible(
                    child: Text(
                      label,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.labelMono
                          .copyWith(fontSize: 9.5, color: muted),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    '$grams',
                    style: AppTextStyles.labelMono.copyWith(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: ink,
                    ),
                  ),
                  const SizedBox(width: 3),
                  Text('g',
                      style: AppTextStyles.bodySmall
                          .copyWith(fontSize: 11, color: muted)),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                '${perKg.toStringAsFixed(1)}g/kg',
                style: AppTextStyles.labelMono.copyWith(
                  fontSize: 9.5,
                  letterSpacing: 9.5 * 0.04,
                  color: muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showInput(BuildContext context) async {
    final controller = TextEditingController(text: grams.toString());
    final result = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          left: 24,
          right: 24,
          top: 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Set ${label.toLowerCase()} target (g)',
                style: AppTextStyles.heading3),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration:
                  InputDecoration(hintText: '$grams', suffix: const Text('g')),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  final v = int.tryParse(controller.text);
                  Navigator.pop(ctx, v);
                },
                child: const Text('Done'),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
    if (result != null) onChanged(result);
  }
}

// ─── Weight card ──────────────────────────────────────────────────────────────

class _WeightCard extends StatelessWidget {
  const _WeightCard({
    required this.logs,
    required this.goal,
    required this.isDark,
    required this.onLogWeight,
  });

  final List<WeightLog> logs;
  final BodyGoal goal;
  final bool isDark;
  final Future<void> Function(double kg) onLogWeight;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final hasData = logs.isNotEmpty;
    final latest = hasData ? logs.last.weight : null;
    final delta = logs.length >= 2 ? logs.last.weight - logs.first.weight : null;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(isDark),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('WEIGHT · 30 DAYS',
                      style: AppTextStyles.labelMono.copyWith(color: muted)),
                  const SizedBox(height: 4),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        latest != null ? latest.toStringAsFixed(1) : '—',
                        style: AppTextStyles.labelMono.copyWith(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: ink,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text('kg',
                          style: AppTextStyles.bodySmall
                              .copyWith(fontSize: 12, color: muted)),
                      if (delta != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          '${delta <= 0 ? '−' : '+'}${delta.abs().toStringAsFixed(1)} KG',
                          style: AppTextStyles.labelMono.copyWith(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 11 * 0.04,
                            color: delta <= 0
                                ? AppColors.green
                                : AppColors.needsReview,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
              GestureDetector(
                onTap: () => _showWeightInput(context),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isDark
                        ? Colors.white.withValues(alpha: 0.04)
                        : const Color(0xFFF4F2EE),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      width: 0.5,
                      color:
                          isDark ? AppColors.borderDark : AppColors.borderLight,
                    ),
                  ),
                  child: Text(
                    'Log weight',
                    style: AppTextStyles.labelSmall.copyWith(
                      fontSize: 11,
                      color: isDark
                          ? AppColors.textPrimaryDark.withValues(alpha: 0.78)
                          : const Color(0xFF3A4048),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (logs.length >= 2)
            SizedBox(
              height: 70,
              width: double.infinity,
              child: CustomPaint(
                painter: _WeightChartPainter(logs: logs, isDark: isDark),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(
                hasData
                    ? 'Log another weight to see your trend.'
                    : 'Log your first weight to track progress.',
                style: AppTextStyles.bodySmall.copyWith(color: muted),
              ),
            ),
          if (delta != null && goal == BodyGoal.loseFat && delta < 0) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.green.withValues(alpha: isDark ? 0.06 : 0.08),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  width: 0.5,
                  color:
                      AppColors.green.withValues(alpha: isDark ? 0.18 : 0.25),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.check, size: 14, color: AppColors.green),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'On pace — down ${delta.abs().toStringAsFixed(1)} kg over the last ${logs.length} entries',
                      style: AppTextStyles.bodySmall
                          .copyWith(fontSize: 12, color: ink),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _showWeightInput(BuildContext context) {
    final controller = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          left: 24,
          right: 24,
          top: 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Log weight', style: AppTextStyles.heading3),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              autofocus: true,
              decoration:
                  const InputDecoration(hintText: 'kg', suffix: Text('kg')),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  final kg =
                      double.tryParse(controller.text.replaceAll(',', '.'));
                  if (kg != null && kg > 20 && kg < 400) {
                    onLogWeight(kg);
                  }
                  Navigator.pop(ctx);
                },
                child: const Text('Save'),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _WeightChartPainter extends CustomPainter {
  _WeightChartPainter({required this.logs, required this.isDark});

  final List<WeightLog> logs;
  final bool isDark;

  @override
  void paint(Canvas canvas, Size size) {
    final values = logs.map((l) => l.weight).toList();
    final minV = values.reduce((a, b) => a < b ? a : b) - 0.3;
    final maxV = values.reduce((a, b) => a > b ? a : b) + 0.3;
    final span = (maxV - minV).clamp(0.1, double.infinity);

    final points = List.generate(values.length, (i) {
      final x = values.length == 1
          ? size.width / 2
          : i / (values.length - 1) * size.width;
      final y = size.height - ((values[i] - minV) / span) * (size.height - 8) - 4;
      return Offset(x, y);
    });

    final area = Path()..moveTo(points.first.dx, points.first.dy);
    for (final p in points.skip(1)) {
      area.lineTo(p.dx, p.dy);
    }
    area
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(
      area,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.green.withValues(alpha: 0.22),
            AppColors.green.withValues(alpha: 0.0),
          ],
        ).createShader(Offset.zero & size),
    );

    final line = Paint()
      ..color = AppColors.green
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (final p in points.skip(1)) {
      path.lineTo(p.dx, p.dy);
    }
    canvas.drawPath(path, line);

    canvas.drawCircle(
      points.last,
      3.5,
      Paint()..color = isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
    );
    canvas.drawCircle(
      points.last,
      3.5,
      Paint()
        ..color = AppColors.green
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(_WeightChartPainter old) =>
      old.logs != logs || old.isDark != isDark;
}

BoxDecoration _cardDecoration(bool isDark) => BoxDecoration(
      color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      borderRadius: BorderRadius.circular(22),
      border: Border.all(
        width: 0.5,
        color: isDark ? AppColors.borderDark : AppColors.borderLight,
      ),
    );
