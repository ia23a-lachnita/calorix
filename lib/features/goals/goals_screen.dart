import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'providers/goals_providers.dart';
import '../../shared/models/macro_target_plan.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/constants/app_constants.dart';

class GoalsScreen extends ConsumerWidget {
  const GoalsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final macroSplit = ref.watch(macroSplitProvider);
    final bodyGoal = ref.watch(bodyGoalProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            floating: true,
            title: Text('Goals', style: AppTextStyles.heading1.copyWith(color: textColor)),
          ),
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Period selector
                _PeriodSelector(isDark: isDark),
                const SizedBox(height: 16),

                // Body goal segmented
                _BodyGoalSegmented(
                  current: bodyGoal,
                  onChanged: (g) {
                    ref.read(bodyGoalProvider.notifier).state = g;
                    _autoComputeMacros(ref, g);
                  },
                ),
                const SizedBox(height: 16),

                // Calorie card
                _CalorieCard(
                  kcal: macroSplit.kcal,
                  onChanged: (v) =>
                      ref.read(macroSplitProvider.notifier).setKcal(v),
                  isDark: isDark,
                  textColor: textColor,
                ),
                const SizedBox(height: 16),

                // Macro split card
                _MacroSplitCard(
                  split: macroSplit,
                  notifier: ref.read(macroSplitProvider.notifier),
                  isDark: isDark,
                  textColor: textColor,
                ),
                const SizedBox(height: 16),

                // Weight card (placeholder)
                _WeightCard(isDark: isDark, textColor: textColor),
                const SizedBox(height: 24),

                // Save button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => _savePlan(context, ref, macroSplit, bodyGoal),
                    child: const Text('Save Goals'),
                  ),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
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

  Future<void> _savePlan(
    BuildContext context,
    WidgetRef ref,
    ({int kcal, int protein, int carbs, int fat}) split,
    BodyGoal goal,
  ) async {
    // Save to Firestore via repository
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Goals saved!')),
    );
  }
}

class _PeriodSelector extends StatelessWidget {
  final bool isDark;
  const _PeriodSelector({required this.isDark});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {},
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: isDark ? AppColors.borderDark : AppColors.borderLight),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 6,
              height: 6,
              decoration: const BoxDecoration(
                  color: AppColors.green, shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
            Text(
              'Plan · Cut phase · Week 4',
              style: AppTextStyles.labelLarge.copyWith(
                  color:
                      isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_down, size: 16),
          ],
        ),
      ),
    );
  }
}

class _BodyGoalSegmented extends StatelessWidget {
  final BodyGoal current;
  final ValueChanged<BodyGoal> onChanged;
  const _BodyGoalSegmented({required this.current, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final goals = [
      (BodyGoal.loseFat, 'Lose fat'),
      (BodyGoal.maintain, 'Maintain'),
      (BodyGoal.leanPlus, 'Lean+'),
      (BodyGoal.custom, 'Custom'),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Body Goal', style: AppTextStyles.labelLarge),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: goals.map(((BodyGoal, String) g) {
                final isActive = g.$1 == current;
                return GestureDetector(
                  onTap: () => onChanged(g.$1),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: isActive ? AppColors.surfaceLight : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: isActive
                          ? [
                              BoxShadow(
                                color: AppColors.textPrimaryLight.withAlpha(20),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              )
                            ]
                          : null,
                      border: Border.all(
                          color: isActive ? Colors.transparent : AppColors.borderLight),
                    ),
                    child: Text(
                      g.$2,
                      style: AppTextStyles.labelLarge.copyWith(
                          color: isActive
                              ? AppColors.textPrimaryLight
                              : AppColors.textSecondaryLight),
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _CalorieCard extends StatelessWidget {
  final int kcal;
  final ValueChanged<int> onChanged;
  final bool isDark;
  final Color textColor;
  const _CalorieCard({
    required this.kcal,
    required this.onChanged,
    required this.isDark,
    required this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Daily Calories', style: AppTextStyles.labelLarge.copyWith(color: textColor)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.blue.withAlpha(20),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'AI · TDEE − 420',
                    style: AppTextStyles.labelSmall.copyWith(color: AppColors.blue),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '$kcal kcal',
              style: AppTextStyles.heroNumber.copyWith(color: textColor, fontSize: 32),
            ),
            const SizedBox(height: 12),
            SliderTheme(
              data: SliderThemeData(
                activeTrackColor: AppColors.blue,
                thumbColor: AppColors.blue,
                inactiveTrackColor: AppColors.blue.withAlpha(40),
                overlayColor: AppColors.blue.withAlpha(30),
                trackHeight: 4,
              ),
              child: Slider(
                value: kcal.toDouble(),
                min: AppConstants.kcalSliderMin.toDouble(),
                max: AppConstants.kcalSliderMax.toDouble(),
                divisions: (AppConstants.kcalSliderMax - AppConstants.kcalSliderMin) ~/ 50,
                onChanged: (v) => onChanged(v.round()),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('1500', style: AppTextStyles.labelSmall.copyWith(color: AppColors.textSecondaryLight)),
                Text('BMR: ~1800', style: AppTextStyles.labelSmall.copyWith(color: AppColors.textSecondaryLight)),
                Text('TDEE: ~2820', style: AppTextStyles.labelSmall.copyWith(color: AppColors.textSecondaryLight)),
                Text('3500', style: AppTextStyles.labelSmall.copyWith(color: AppColors.textSecondaryLight)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MacroSplitCard extends StatelessWidget {
  final ({int kcal, int protein, int carbs, int fat}) split;
  final MacroSplitNotifier notifier;
  final bool isDark;
  final Color textColor;

  const _MacroSplitCard({
    required this.split,
    required this.notifier,
    required this.isDark,
    required this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    final total = split.protein * 4 + split.carbs * 4 + split.fat * 9;
    final proteinPct = total > 0 ? split.protein * 4 / total : 0.33;
    final carbsPct = total > 0 ? split.carbs * 4 / total : 0.45;
    final fatPct = total > 0 ? split.fat * 9 / total : 0.22;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Macro Split', style: AppTextStyles.labelLarge.copyWith(color: textColor)),
            const SizedBox(height: 12),
            // Stacked bar
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: Row(
                children: [
                  Expanded(
                    flex: (proteinPct * 100).round(),
                    child: Container(height: 12, color: AppColors.protein),
                  ),
                  Expanded(
                    flex: (carbsPct * 100).round(),
                    child: Container(height: 12, color: AppColors.carbs),
                  ),
                  Expanded(
                    flex: (fatPct * 100).round(),
                    child: Container(height: 12, color: AppColors.fat),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            // Macro tiles
            Row(
              children: [
                _MacroTile(
                  label: 'Protein',
                  grams: split.protein,
                  color: AppColors.protein,
                  onChanged: (v) => notifier.setProtein(v),
                ),
                const SizedBox(width: 8),
                _MacroTile(
                  label: 'Carbs',
                  grams: split.carbs,
                  color: AppColors.carbs,
                  onChanged: (v) => notifier.setCarbs(v),
                ),
                const SizedBox(width: 8),
                _MacroTile(
                  label: 'Fat',
                  grams: split.fat,
                  color: AppColors.fat,
                  onChanged: (v) => notifier.setFat(v),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MacroTile extends StatelessWidget {
  final String label;
  final int grams;
  final Color color;
  final ValueChanged<int> onChanged;

  const _MacroTile({
    required this.label,
    required this.grams,
    required this.color,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: () => _showInput(context),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: color.withAlpha(15),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: color.withAlpha(60)),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 4),
                  Text(label, style: AppTextStyles.labelSmall.copyWith(color: color)),
                ],
              ),
              const SizedBox(height: 4),
              Text('${grams}g',
                  style: AppTextStyles.macroGrams.copyWith(color: color)),
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
            Text('Set $label target (g)', style: AppTextStyles.heading3),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: InputDecoration(hintText: '$grams', suffix: const Text('g')),
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

class _WeightCard extends StatelessWidget {
  final bool isDark;
  final Color textColor;
  const _WeightCard({required this.isDark, required this.textColor});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Weight', style: AppTextStyles.labelLarge.copyWith(color: textColor)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.green.withAlpha(20),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('On pace',
                      style: AppTextStyles.labelSmall.copyWith(color: AppColors.green)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('Log your first weight to track progress',
                style: AppTextStyles.bodySmall.copyWith(
                    color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight)),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _showWeightInput(context),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Log weight'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showWeightInput(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        final controller = TextEditingController();
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
            left: 24,
            right: 24,
            top: 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Log Weight', style: AppTextStyles.heading3),
              const SizedBox(height: 16),
              TextField(
                controller: controller,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                autofocus: true,
                decoration: const InputDecoration(hintText: 'kg', suffix: Text('kg')),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Save'),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        );
      },
    );
  }
}
