import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/constants/app_constants.dart';

class ConfidenceBadge extends StatefulWidget {
  final double confidence;
  final VoidCallback? onReviewTap;
  final bool compact;

  const ConfidenceBadge({
    super.key,
    required this.confidence,
    this.onReviewTap,
    this.compact = false,
  });

  @override
  State<ConfidenceBadge> createState() => _ConfidenceBadgeState();
}

class _ConfidenceBadgeState extends State<ConfidenceBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: AppConstants.confidencePulseDuration),
    )..repeat(reverse: true);
    _opacity = Tween<double>(begin: 0.4, end: 1.0).animate(_pulse);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  bool get _isConfirmed =>
      widget.confidence >= AppConstants.confidenceThreshold;

  @override
  Widget build(BuildContext context) {
    final pct = (widget.confidence * 100).round();
    final color = _isConfirmed ? AppColors.confirmed : AppColors.needsReview;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        FadeTransition(
          opacity: _isConfirmed ? _opacity : const AlwaysStoppedAnimation(1.0),
          child: Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          '$pct% · ${_isConfirmed ? 'Confirmed' : 'Review'}',
          style: AppTextStyles.labelSmall.copyWith(color: color),
        ),
        if (!_isConfirmed && !widget.compact && widget.onReviewTap != null) ...[
          const SizedBox(width: 4),
          GestureDetector(
            onTap: widget.onReviewTap,
            child: Text(
              'Needs review →',
              style: AppTextStyles.labelSmall.copyWith(
                color: AppColors.needsReview,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ],
      ],
    );
  }
}
