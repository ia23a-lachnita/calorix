import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/processing_providers.dart';
import '../../shared/models/food_entry.dart';
import '../../shared/widgets/skeleton_shimmer.dart';
import '../../shared/widgets/macro_progress_bar.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/router/route_names.dart';
import '../../core/motion/app_motion.dart';
import '../../shared/models/processing_state.dart';

class ProcessingScreen extends ConsumerWidget {
  final String entryId;
  final String? fixtureBackgroundAsset;
  const ProcessingScreen({
    super.key,
    required this.entryId,
    this.fixtureBackgroundAsset,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entryAsync = ref.watch(processingEntryProvider(entryId));
    final stateAsync = ref.watch(processingStateProvider(entryId));
    final isDark = Theme.of(context).brightness == Brightness.dark;
    ref.listen(processingEntryProvider(entryId), (_, next) {
      final entry = next.valueOrNull;
      final requiresReview = entry?.status == FoodEntryStatus.needsReview ||
          entry?.status == FoodEntryStatus.complete &&
              entry?.confidence != null &&
              entry!.confidence! < 0.80;
      if (!requiresReview) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) {
          context.goNamed(
            RouteNames.review,
            pathParameters: {'id': entryId},
          );
        }
      });
    });

    final content = SafeArea(
      child: Column(
        children: [
          _GlassBanner(
            isDark: isDark,
            onTap: () => context.goNamed(RouteNames.today),
          ),
          const _AnalyzingChip(),
          const SizedBox(height: 10),
          Expanded(
            child: stateAsync.when(
              loading: () => const _ProcessingSkeleton(),
              error: (error, _) => _ErrorState(
                message: error.toString(),
                onRetry: () {},
              ),
              data: (state) => AnimatedSwitcher(
                duration: AppMotion.durationOf(
                  context,
                  MotionDurations.cardEntrance,
                ),
                child: switch (state.phase) {
                  ProcessingPhase.firestoreComplete
                      when entryAsync.valueOrNull != null =>
                    _CompletedCard(
                      key: const ValueKey('processing-complete-card'),
                      entry: entryAsync.valueOrNull!,
                    ),
                  ProcessingPhase.localError ||
                  ProcessingPhase.firestoreError =>
                    _ErrorState(
                      key: const ValueKey('processing-error-state'),
                      message: state.errorMessage,
                      onRetry: () => retryProcessingEntry(
                        ref,
                        entryId: entryId,
                        phase: state.phase,
                      ),
                    ),
                  _ => const _ProcessingSkeleton(
                      key: ValueKey('processing-skeleton'),
                    ),
                },
              ),
            ),
          ),
        ],
      ),
    );

    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surface,
      body: fixtureBackgroundAsset == null
          ? content
          : Stack(
              fit: StackFit.expand,
              children: [
                Image.asset(
                  fixtureBackgroundAsset!,
                  key: const ValueKey('capture-processing-meal'),
                  fit: BoxFit.cover,
                ),
                ColoredBox(
                  color: isDark
                      ? const Color(0xCC080A0D)
                      : const Color(0x9A080A0D),
                ),
                content,
              ],
            ),
    );
  }
}

class _AnalyzingChip extends StatelessWidget {
  const _AnalyzingChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          width: 0.5,
          color: Colors.white.withValues(alpha: 0.12),
        ),
      ),
      child: Text(
        '☁  ANALYZING IN CLOUD · EST. 4s',
        style: AppTextStyles.labelMono.copyWith(
          color: AppColors.textPrimaryDark,
          fontSize: 10.5,
          letterSpacing: 1.05,
        ),
      ),
    );
  }
}

class _GlassBanner extends StatefulWidget {
  final bool isDark;
  final VoidCallback onTap;
  const _GlassBanner({required this.isDark, required this.onTap});

  @override
  State<_GlassBanner> createState() => _GlassBannerState();
}

class _GlassBannerState extends State<_GlassBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _spin;

  @override
  void initState() {
    super.initState();
    _spin = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _spin
        ..stop()
        ..value = 0;
    } else if (!_spin.isAnimating) {
      _spin.repeat();
    }
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: widget.isDark
                    ? AppColors.textPrimaryDark.withAlpha(15)
                    : AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: widget.isDark
                      ? AppColors.textPrimaryDark.withAlpha(30)
                      : AppColors.borderLight,
                ),
              ),
              child: Row(
                children: [
                  RotationTransition(
                    turns: _spin,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppColors.cyan,
                          width: 2,
                          strokeAlign: BorderSide.strokeAlignOutside,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'You can close the app',
                          style: AppTextStyles.labelLarge.copyWith(
                            color: widget.isDark
                                ? AppColors.textPrimaryDark
                                : AppColors.textPrimaryLight,
                          ),
                        ),
                        Text(
                          "We'll send a notification when ready",
                          style: AppTextStyles.bodySmall.copyWith(
                            color: widget.isDark
                                ? AppColors.textSecondaryDark
                                : AppColors.textSecondaryLight,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    Icons.chevron_right,
                    color: widget.isDark
                        ? AppColors.textSecondaryDark
                        : AppColors.textSecondaryLight,
                    size: 18,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ProcessingSkeleton extends StatelessWidget {
  const _ProcessingSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmer(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image skeleton
            Container(
              height: 220,
              decoration: BoxDecoration(
                color: AppColors.skeletonBase,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Stack(
                children: [
                  Positioned(
                    top: 12,
                    left: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.skeletonShine,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text('AI',
                          style: TextStyle(
                              fontSize: 10,
                              fontFamily: 'Inter Tight',
                              fontWeight: FontWeight.w700,
                              color: AppColors.textSecondaryLight)),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Title skeleton
            const SkeletonLine(widthFraction: 0.6, height: 18),
            const SizedBox(height: 8),
            const SkeletonLine(widthFraction: 0.4, height: 14),
            const SizedBox(height: 24),

            // Step counter
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.skeletonBase,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text('3 / 4',
                      style: TextStyle(
                          fontFamily: 'Inter Tight',
                          fontSize: 12,
                          color: AppColors.textSecondaryLight)),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Macro bars skeleton
            for (int i = 0; i < 3; i++) ...[
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: AppColors.skeletonShine,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                      child: SkeletonLine(widthFraction: 0.3, height: 12)),
                  const SizedBox(width: 8),
                  const SizedBox(
                    width: 48,
                    child: SkeletonLine(height: 12),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              const SkeletonLine(widthFraction: 1.0, height: 4),
              const SizedBox(height: 16),
            ],
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _CompletedCard extends StatelessWidget {
  final FoodEntry entry;
  const _CompletedCard({super.key, required this.entry});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor =
        isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (entry.imageUrl != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: CachedNetworkImage(
                imageUrl: entry.imageUrl!,
                height: 220,
                width: double.infinity,
                fit: BoxFit.cover,
              ),
            ),
          const SizedBox(height: 16),
          Text(entry.foodName ?? 'Unknown food',
              style: AppTextStyles.heading2.copyWith(color: textColor)),
          const SizedBox(height: 4),
          Text('${entry.scaledKcal.round()} kcal',
              style: AppTextStyles.heroNumber
                  .copyWith(color: AppColors.blue, fontSize: 28)),
          const SizedBox(height: 20),
          MacroProgressBar(
            label: 'Protein',
            current: entry.scaledProtein,
            target: 170,
            color: AppColors.protein,
          ),
          const SizedBox(height: 12),
          MacroProgressBar(
            label: 'Carbs',
            current: entry.scaledCarbs,
            target: 250,
            color: AppColors.carbs,
          ),
          const SizedBox(height: 12),
          MacroProgressBar(
            label: 'Fat',
            current: entry.scaledFat,
            target: 70,
            color: AppColors.fat,
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => context.goNamed(RouteNames.today),
              child: const Text('View in Today'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final VoidCallback onRetry;
  final String? message;
  const _ErrorState({super.key, required this.onRetry, this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline,
              key: ValueKey('processing-error-icon'),
              color: AppColors.needsReview,
              size: 48),
          const SizedBox(height: 12),
          const Text('Analysis failed',
              style: TextStyle(
                  fontFamily: 'Inter Tight',
                  fontSize: 20,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text(message ?? 'Could not process your image',
              style: const TextStyle(
                  fontFamily: 'Inter Tight',
                  color: AppColors.textSecondaryLight)),
          const SizedBox(height: 20),
          ElevatedButton(
              key: const ValueKey('processing-retry-button'),
              onPressed: onRetry,
              child: const Text('Retry')),
        ],
      ),
    );
  }
}
