import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/constants/app_constants.dart';
import '../../core/motion/app_motion.dart';

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
      duration: Duration.zero,
    );
    _opacity = Tween<double>(begin: 0.4, end: 1.0).animate(_pulse);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _configureMotion();
  }

  @override
  void didUpdateWidget(ConfidenceBadge oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.confidence != widget.confidence) {
      _configureMotion();
    }
  }

  void _configureMotion() {
    final duration =
        AppMotion.durationOf(context, MotionDurations.confidencePulse);
    _pulse.duration = duration;
    if (_isConfirmed && duration > Duration.zero) {
      if (!_pulse.isAnimating) {
        _pulse.repeat(reverse: true);
      }
    } else {
      _pulse.stop();
      _pulse.value = 1;
    }
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
    final status = _isConfirmed ? 'Confirmed' : 'Review';
    final statusIcon =
        _isConfirmed ? Icons.check_circle_outline : Icons.warning_amber_rounded;

    return Semantics(
      container: true,
      label: '$status $pct% confidence',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity:
                _isConfirmed ? _opacity : const AlwaysStoppedAnimation(1.0),
            child: Icon(
              statusIcon,
              size: 14,
              color: color,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            '$pct% · $status',
            style: AppTextStyles.labelSmall.copyWith(color: color),
          ),
          if (!_isConfirmed && !widget.compact && widget.onReviewTap != null)
            TextButton(
              onPressed: widget.onReviewTap,
              style: TextButton.styleFrom(
                minimumSize: const Size(48, 48),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                tapTargetSize: MaterialTapTargetSize.padded,
              ),
              child: Text(
                'Needs review',
                style: AppTextStyles.labelSmall.copyWith(
                  color: AppColors.needsReview,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
