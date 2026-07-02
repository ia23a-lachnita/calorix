import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';

class MacroProgressBar extends StatelessWidget {
  final String label;
  final double current;
  final double target;
  final Color color;
  final Animation<double>? animation;
  final bool denseTodayStyle;
  final bool disableImplicitAnimation;

  const MacroProgressBar({
    super.key,
    required this.label,
    required this.current,
    required this.target,
    required this.color,
    this.animation,
    this.denseTodayStyle = false,
    this.disableImplicitAnimation = false,
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
                  width: denseTodayStyle ? 9 : 8,
                  height: denseTodayStyle ? 9 : 8,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                    boxShadow: denseTodayStyle
                        ? [
                            BoxShadow(
                              color: color.withValues(alpha: 0.13),
                              spreadRadius: 3,
                              blurRadius: 0,
                            ),
                          ]
                        : null,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: (denseTodayStyle
                          ? AppTextStyles.labelLarge.copyWith(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                              letterSpacing: -0.14,
                            )
                          : AppTextStyles.labelLarge)
                      .copyWith(color: textColor),
                ),
              ],
            ),
            Row(
              children: [
                Text(
                  '${current.round()}',
                  style: (denseTodayStyle
                          ? AppTextStyles.todayMonoValue
                          : AppTextStyles.macroGrams)
                      .copyWith(color: textColor),
                ),
                Text(
                  ' / ${target.round()}g',
                  style: (denseTodayStyle
                          ? AppTextStyles.todayMonoTarget
                          : AppTextStyles.bodySmall)
                      .copyWith(color: subtextColor),
                ),
                const SizedBox(width: 6),
                _PercentBadge(
                  percent: (target > 0 ? (current / target * 100) : 0).round(),
                  denseTodayStyle: denseTodayStyle,
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
                  height: denseTodayStyle ? 6 : 4,
                  disableImplicitAnimation: disableImplicitAnimation,
                ),
              )
            : _Bar(
                fraction: _fraction,
                color: color,
                height: denseTodayStyle ? 6 : 4,
                disableImplicitAnimation: disableImplicitAnimation,
              ),
      ],
    );
  }
}

class _Bar extends StatelessWidget {
  final double fraction;
  final Color color;
  final double height;
  final bool disableImplicitAnimation;
  const _Bar({
    required this.fraction,
    required this.color,
    required this.height,
    required this.disableImplicitAnimation,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => Stack(
        children: [
          Container(
            height: height,
            width: constraints.maxWidth,
            decoration: BoxDecoration(
              color: color.withAlpha(30),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          AnimatedContainer(
            duration: disableImplicitAnimation
                ? Duration.zero
                : const Duration(milliseconds: 1200),
            height: height,
            width: constraints.maxWidth * fraction,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        ],
      ),
    );
  }
}

class _PercentBadge extends StatelessWidget {
  final int percent;
  final bool denseTodayStyle;
  const _PercentBadge({
    required this.percent,
    required this.denseTodayStyle,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? const Color(0x14FFFFFF) : const Color(0x0F000000);
    final textColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        '$percent%',
        style: (denseTodayStyle
                ? AppTextStyles.todayPercentBadge
                : AppTextStyles.labelSmall)
            .copyWith(color: textColor),
      ),
    );
  }
}
