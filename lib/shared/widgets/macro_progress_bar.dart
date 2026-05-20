import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class MacroProgressBar extends StatelessWidget {
  final String label;
  final double current;
  final double target;
  final Color color;
  final Animation<double>? animation;

  const MacroProgressBar({
    super.key,
    required this.label,
    required this.current,
    required this.target,
    required this.color,
    this.animation,
  });

  double get _fraction => target > 0 ? (current / target).clamp(0.0, 1.0) : 0;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor =
        isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final subtextColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(label, style: AppTextStyles.labelLarge.copyWith(color: textColor)),
              ],
            ),
            Row(
              children: [
                Text(
                  '${current.round()}g',
                  style: AppTextStyles.macroGrams.copyWith(color: textColor),
                ),
                Text(
                  ' / ${target.round()}g',
                  style: AppTextStyles.bodySmall.copyWith(color: subtextColor),
                ),
                const SizedBox(width: 6),
                _PercentBadge(
                  percent: (target > 0 ? (current / target * 100) : 0).round(),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 6),
        animation != null
            ? AnimatedBuilder(
                animation: animation!,
                builder: (context, _) => _Bar(
                  fraction: _fraction * animation!.value,
                  color: color,
                ),
              )
            : _Bar(fraction: _fraction, color: color),
      ],
    );
  }
}

class _Bar extends StatelessWidget {
  final double fraction;
  final Color color;
  const _Bar({required this.fraction, required this.color});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => Stack(
        children: [
          Container(
            height: 4,
            width: constraints.maxWidth,
            decoration: BoxDecoration(
              color: color.withAlpha(30),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          AnimatedContainer(
            duration: const Duration(milliseconds: 1200),
            height: 4,
            width: constraints.maxWidth * fraction,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    );
  }
}

class _PercentBadge extends StatelessWidget {
  final int percent;
  const _PercentBadge({required this.percent});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? const Color(0x14FFFFFF) : const Color(0x0F000000);
    final textColor = isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        '$percent%',
        style: AppTextStyles.labelSmall.copyWith(color: textColor),
      ),
    );
  }
}
