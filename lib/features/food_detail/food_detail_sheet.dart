import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'providers/food_detail_providers.dart';
import '../../shared/models/food_entry.dart';
import '../../shared/models/macro_target_plan.dart';
import '../../shared/providers/plan_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/constants/app_constants.dart';
import '../../shared/providers/auth_provider.dart';
import '../../core/router/route_names.dart';

class FoodDetailSheet extends ConsumerWidget {
  final String entryId;
  const FoodDetailSheet({super.key, required this.entryId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entryAsync = ref.watch(foodEntryProvider(entryId));
    return entryAsync.when(
      loading: () => const _LoadingSheet(),
      error: (e, _) => const _ErrorSheet(),
      data: (entry) => _FoodDetailContent(entry: entry),
    );
  }
}

class _LoadingSheet extends StatelessWidget {
  const _LoadingSheet();
  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
}

class _ErrorSheet extends StatelessWidget {
  const _ErrorSheet();
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline,
                  color: AppColors.needsReview, size: 48),
              const SizedBox(height: 12),
              const Text('Failed to load food entry'),
              ElevatedButton(
                  onPressed: () => context.pop(), child: const Text('Back')),
            ],
          ),
        ),
      );
}

class _FoodDetailContent extends ConsumerStatefulWidget {
  final FoodEntry entry;
  const _FoodDetailContent({required this.entry});

  @override
  ConsumerState<_FoodDetailContent> createState() => _FoodDetailContentState();
}

class _FoodDetailContentState extends ConsumerState<_FoodDetailContent> {
  bool _isSaving = false;

  FoodEntry get entry => widget.entry;
  bool get _isEditMode => ref.watch(foodEditModeProvider(entry.id));
  PendingEdits get _pending => ref.watch(pendingEditsProvider(entry.id));

  double get _multiplier =>
      _pending.servingMultiplier ?? entry.servingMultiplier;
  double get _displayKcal => (_pending.kcal ?? entry.kcal ?? 0) * _multiplier;
  double get _displayProtein =>
      (_pending.protein ?? entry.protein ?? 0) * _multiplier;
  double get _displayCarbs =>
      (_pending.carbs ?? entry.carbs ?? 0) * _multiplier;
  double get _displayFat => (_pending.fat ?? entry.fat ?? 0) * _multiplier;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final bg = isDark ? AppColors.backgroundDark : AppColors.backgroundLight;
    final plan = ref.watch(activePlanProvider).valueOrNull ??
        MacroTargetPlan.defaultPlan();

    final detectedWeight = entry.detectedItems
        .fold(0.0, (sum, item) => sum + item.weight)
        .round();

    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => Scaffold(
        backgroundColor: bg,
        body: Stack(
          children: [
            // Hero photo with top chrome and confidence pill.
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: 320,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _HeroImage(entry: entry),
                  Positioned(
                    top: 12,
                    left: 18,
                    right: 18,
                    child: SafeArea(
                      bottom: false,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _GlassChip(
                            onTap: () => context.pop(),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.chevron_left,
                                    color: Color(0xFFF2F3F5), size: 14),
                                SizedBox(width: 2),
                                Text('Back',
                                    style: TextStyle(
                                        color: Color(0xFFF2F3F5),
                                        fontFamily: 'Geist',
                                        fontSize: 12,
                                        fontWeight: FontWeight.w500)),
                              ],
                            ),
                          ),
                          Row(
                            children: [
                              _GlassChip(
                                onTap: () => _duplicate(context, ref),
                                child: const Icon(Icons.copy_outlined,
                                    color: Color(0xFFF2F3F5), size: 14),
                              ),
                              const SizedBox(width: 8),
                              _GlassChip(
                                onTap: () => _delete(context, ref),
                                child: const Icon(Icons.delete_outline,
                                    color: Color(0xFFF2F3F5), size: 14),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (entry.confidence != null)
                    Positioned(
                      left: 18,
                      bottom: 40,
                      child: _ConfidencePill(confidence: entry.confidence!),
                    ),
                ],
              ),
            ),

            // Sheet body overlapping the hero per cx-screen-food.jsx.
            Positioned.fill(
              top: 296,
              child: Container(
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(28)),
                ),
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 8, bottom: 6),
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: isDark
                              ? AppColors.borderDark
                              : AppColors.borderLight,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        controller: scrollController,
                        padding: EdgeInsets.zero,
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'DETECTED · ${entry.mealType.name.toUpperCase()} · ${DateFormat('HH:mm').format(entry.timestamp)}',
                                  style: AppTextStyles.labelMono
                                      .copyWith(color: muted),
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            entry.foodName ?? 'Unknown food',
                                            style: AppTextStyles.heading2
                                                .copyWith(
                                              color: ink,
                                              fontSize: 24,
                                              letterSpacing: 24 * -0.03,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            detectedWeight > 0
                                                ? '${entry.detectedItems.length} items · ≈ ${detectedWeight}g'
                                                : '${_fmtMultiplier(_multiplier)} serving',
                                            style: AppTextStyles.bodySmall
                                                .copyWith(
                                                    fontSize: 13,
                                                    color: muted),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    _EditChip(
                                      isEditing: _isEditMode,
                                      isDark: isDark,
                                      onTap: () {
                                        ref
                                            .read(
                                                foodEditModeProvider(entry.id)
                                                    .notifier)
                                            .state = !_isEditMode;
                                      },
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                            child: _KcalBanner(
                              kcal: _displayKcal,
                              multiplier: _multiplier,
                              isEditing: _isEditMode,
                              isDark: isDark,
                              onMultiplierChanged: (v) => ref
                                  .read(pendingEditsProvider(entry.id).notifier)
                                  .state = _pending.copyWith(
                                      servingMultiplier: v),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                            child: Container(
                              decoration: BoxDecoration(
                                color: isDark
                                    ? AppColors.surfaceDark
                                    : AppColors.surfaceLight,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  width: 0.5,
                                  color: isDark
                                      ? AppColors.borderDark
                                      : AppColors.borderLight,
                                ),
                              ),
                              child: Column(
                                children: [
                                  _MacroEditRow(
                                    label: 'Protein',
                                    value: _displayProtein,
                                    color: AppColors.protein,
                                    target: plan.protein.toDouble(),
                                    isEditing: _isEditMode,
                                    isDark: isDark,
                                    onEdit: (v) => ref
                                        .read(pendingEditsProvider(entry.id)
                                            .notifier)
                                        .state =
                                            _pending.copyWith(protein: v),
                                  ),
                                  _rowDivider(isDark),
                                  _MacroEditRow(
                                    label: 'Carbs',
                                    value: _displayCarbs,
                                    color: AppColors.carbs,
                                    target: plan.carbs.toDouble(),
                                    isEditing: _isEditMode,
                                    isDark: isDark,
                                    onEdit: (v) => ref
                                        .read(pendingEditsProvider(entry.id)
                                            .notifier)
                                        .state = _pending.copyWith(carbs: v),
                                  ),
                                  _rowDivider(isDark),
                                  _MacroEditRow(
                                    label: 'Fat',
                                    value: _displayFat,
                                    color: AppColors.fat,
                                    target: plan.fat.toDouble(),
                                    isEditing: _isEditMode,
                                    isDark: isDark,
                                    onEdit: (v) => ref
                                        .read(pendingEditsProvider(entry.id)
                                            .notifier)
                                        .state = _pending.copyWith(fat: v),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          if (entry.detectedItems.isNotEmpty) ...[
                            Padding(
                              padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
                              child: Text(
                                'DETECTED ITEMS · TAP TO ADJUST',
                                style: AppTextStyles.labelMono
                                    .copyWith(color: muted),
                              ),
                            ),
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 16),
                              child: Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [
                                  ...entry.detectedItems.map(
                                    (item) => Container(
                                      padding: const EdgeInsets.fromLTRB(
                                          8, 7, 10, 7),
                                      decoration: BoxDecoration(
                                        color: isDark
                                            ? AppColors.surfaceDark
                                            : AppColors.surfaceLight,
                                        borderRadius:
                                            BorderRadius.circular(999),
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
                                          Container(
                                            width: 5,
                                            height: 5,
                                            decoration: const BoxDecoration(
                                              color: AppColors.cyan,
                                              shape: BoxShape.circle,
                                            ),
                                          ),
                                          const SizedBox(width: 6),
                                          Text(
                                            item.name,
                                            style: AppTextStyles.bodySmall
                                                .copyWith(
                                                    fontSize: 12, color: ink),
                                          ),
                                          const SizedBox(width: 6),
                                          Text(
                                            '${item.weight.round()}g',
                                            style: AppTextStyles.labelMono
                                                .copyWith(
                                                    fontSize: 10.5,
                                                    color: muted),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                  if (_isEditMode)
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 10, vertical: 7),
                                      decoration: BoxDecoration(
                                        borderRadius:
                                            BorderRadius.circular(999),
                                        border: Border.all(
                                          color: isDark
                                              ? AppColors.borderDark
                                              : AppColors.borderLight,
                                          style: BorderStyle.solid,
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(Icons.add,
                                              size: 12, color: muted),
                                          const SizedBox(width: 4),
                                          Text(
                                            'Add item',
                                            style: AppTextStyles.bodySmall
                                                .copyWith(
                                                    fontSize: 12,
                                                    fontWeight:
                                                        FontWeight.w500,
                                                    color: muted),
                                          ),
                                        ],
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
                            child: _AskAiCard(
                              isDark: isDark,
                              onTap: () => context.pushNamed(
                                RouteNames.aiChatOverlay,
                                queryParameters: {'mealId': entry.id},
                              ),
                            ),
                          ),
                          const SizedBox(height: 120),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        bottomNavigationBar: _isEditMode
            ? _EditActionBar(
                isSaving: _isSaving,
                isDark: isDark,
                onUndo: () {
                  ref.read(pendingEditsProvider(entry.id).notifier).state =
                      const PendingEdits();
                },
                onSave: () => _save(context, ref),
              )
            : null,
      ),
    );
  }

  Future<void> _save(BuildContext context, WidgetRef ref) async {
    final router = GoRouter.of(context);
    setState(() => _isSaving = true);
    try {
      final repo = ref.read(foodEntryRepositoryProvider);
      await repo.update(entry.uid, entry.id, _pending.toUpdateMap(),
          markCorrected: true);
      if (!mounted) return;
      ref.read(foodEditModeProvider(entry.id).notifier).state = false;
      router.pop();
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final router = GoRouter.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete entry?'),
        content: const Text('This will remove the meal from today\'s log.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child:
                const Text('Delete', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await ref.read(foodEntryRepositoryProvider).delete(entry.uid, entry.id);
      if (mounted) router.pop();
    }
  }

  Future<void> _duplicate(BuildContext context, WidgetRef ref) async {
    final router = GoRouter.of(context);
    await ref.read(foodEntryRepositoryProvider).duplicate(entry);
    if (mounted) router.pop();
  }
}

String _fmtMultiplier(double m) =>
    m == m.roundToDouble() ? '${m.round()}×' : '$m×';

Widget _rowDivider(bool isDark) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        height: 0.5,
        color: isDark ? AppColors.borderDark : AppColors.borderLight,
      ),
    );

/// Hero image resolution order: bundled asset (seed fixtures), direct URL,
/// then the scan's Cloud Storage path — real photos must never fall back to
/// a preset while a photo exists.
class _HeroImage extends ConsumerWidget {
  const _HeroImage({required this.entry});

  final FoodEntry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = entry.imageUrl;
    if (url != null && url.startsWith('assets/')) {
      return Image.asset(url, fit: BoxFit.cover);
    }
    if (url != null && url.isNotEmpty) {
      return CachedNetworkImage(
        imageUrl: url,
        fit: BoxFit.cover,
        errorWidget: (_, __, ___) => const _HeroFallback(),
      );
    }
    final path = entry.storagePath;
    if (path != null && path.isNotEmpty) {
      return ref.watch(storageImageUrlProvider(path)).when(
            data: (resolved) => CachedNetworkImage(
              imageUrl: resolved,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => const _HeroFallback(),
            ),
            loading: () => const ColoredBox(color: Color(0xFF2A221D)),
            error: (_, __) => const _HeroFallback(),
          );
    }
    return const _HeroFallback();
  }
}

class _HeroFallback extends StatelessWidget {
  const _HeroFallback();
  @override
  Widget build(BuildContext context) => const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [AppColors.blue, AppColors.cyan],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Center(
          child: Icon(Icons.restaurant, color: Colors.white54, size: 48),
        ),
      );
}

class _GlassChip extends StatelessWidget {
  const _GlassChip({required this.child, required this.onTap});

  final Widget child;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: const Color(0xFF080A0D).withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            width: 0.5,
            color: Colors.white.withValues(alpha: 0.12),
          ),
        ),
        child: child,
      ),
    );
  }
}

class _ConfidencePill extends StatefulWidget {
  final double confidence;
  const _ConfidencePill({required this.confidence});

  @override
  State<_ConfidencePill> createState() => _ConfidencePillState();
}

class _ConfidencePillState extends State<_ConfidencePill>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
    _opacity = Tween<double>(begin: 0.4, end: 1.0).animate(_pulse);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pct = (widget.confidence * 100).round();
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 6, 12, 6),
      decoration: BoxDecoration(
        color: const Color(0xFF080A0D).withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          width: 0.5,
          color: Colors.white.withValues(alpha: 0.12),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: _opacity,
            child: Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: AppColors.green,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.green.withValues(alpha: 0.18),
                    spreadRadius: 3,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            'AI · $pct% CONFIDENCE',
            style: AppTextStyles.labelMono.copyWith(
              fontSize: 10.5,
              letterSpacing: 10.5 * 0.08,
              color: const Color(0xFFF2F3F5),
            ),
          ),
        ],
      ),
    );
  }
}

class _EditChip extends StatelessWidget {
  final bool isEditing;
  final bool isDark;
  final VoidCallback onTap;
  const _EditChip({
    required this.isEditing,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final bg = isDark ? AppColors.backgroundDark : AppColors.backgroundLight;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: isEditing
              ? ink
              : (isDark ? AppColors.surfaceDark : AppColors.surfaceLight),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            width: 0.5,
            color: isEditing
                ? ink
                : (isDark ? AppColors.borderDark : AppColors.borderLight),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.edit_outlined,
                size: 14,
                color: isEditing
                    ? bg
                    : (isDark
                        ? AppColors.textPrimaryDark.withValues(alpha: 0.78)
                        : const Color(0xFF3A4048))),
            if (!isEditing) ...[
              const SizedBox(width: 6),
              Text('Edit',
                  style: AppTextStyles.labelSmall.copyWith(
                      fontSize: 12,
                      color: isDark
                          ? AppColors.textPrimaryDark.withValues(alpha: 0.78)
                          : const Color(0xFF3A4048))),
            ],
          ],
        ),
      ),
    );
  }
}

class _KcalBanner extends StatelessWidget {
  final double kcal;
  final double multiplier;
  final bool isEditing;
  final bool isDark;
  final ValueChanged<double> onMultiplierChanged;

  const _KcalBanner({
    required this.kcal,
    required this.multiplier,
    required this.isEditing,
    required this.isDark,
    required this.onMultiplierChanged,
  });

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          width: 0.5,
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('CALORIES',
                  style: AppTextStyles.labelMono.copyWith(color: muted)),
              const SizedBox(height: 2),
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text(
                    '${kcal.round()}',
                    style: AppTextStyles.labelMono.copyWith(
                      fontSize: 28,
                      fontWeight: FontWeight.w600,
                      color: ink,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text('kcal',
                      style: AppTextStyles.bodySmall
                          .copyWith(fontSize: 12, color: muted)),
                ],
              ),
            ],
          ),
          if (isEditing)
            _ServingStepper(
              multiplier: multiplier,
              isDark: isDark,
              onChanged: onMultiplierChanged,
            )
          else
            Text(
              '${_fmtMultiplier(multiplier)} serving',
              style: AppTextStyles.bodySmall.copyWith(color: muted),
            ),
        ],
      ),
    );
  }
}

class _ServingStepper extends StatelessWidget {
  const _ServingStepper({
    required this.multiplier,
    required this.isDark,
    required this.onChanged,
  });

  final double multiplier;
  final bool isDark;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;

    Widget button(String glyph, double step, {bool raised = false}) {
      final enabled = step < 0
          ? multiplier > AppConstants.servingMultiplierMin
          : multiplier < AppConstants.servingMultiplierMax;
      return GestureDetector(
        onTap: enabled ? () => onChanged(multiplier + step) : null,
        behavior: HitTestBehavior.opaque,
        child: Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: raised
                ? (isDark ? AppColors.surfaceDark : AppColors.surfaceLight)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
            boxShadow: raised
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      offset: const Offset(0, 1),
                      blurRadius: 2,
                    ),
                  ]
                : null,
          ),
          child: Text(
            glyph,
            style: AppTextStyles.labelMono.copyWith(
              fontSize: 16,
              color: enabled ? ink : ink.withValues(alpha: 0.35),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.white.withValues(alpha: 0.04)
            : const Color(0xFFF4F2EE),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          width: 0.5,
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          button('−', -AppConstants.servingMultiplierStep),
          SizedBox(
            width: 36,
            child: Text(
              _fmtMultiplier(multiplier),
              textAlign: TextAlign.center,
              style: AppTextStyles.labelMono.copyWith(fontSize: 13, color: ink),
            ),
          ),
          button('+', AppConstants.servingMultiplierStep, raised: true),
        ],
      ),
    );
  }
}

class _MacroEditRow extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  final double target;
  final bool isEditing;
  final bool isDark;
  final ValueChanged<double> onEdit;

  const _MacroEditRow({
    required this.label,
    required this.value,
    required this.color,
    required this.target,
    required this.isEditing,
    required this.isDark,
    required this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final fraction = target > 0 ? (value / target).clamp(0.0, 1.0) : 0.0;
    final pct = target > 0 ? ((value / target) * 100).round() : 0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Column(
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
                    decoration:
                        BoxDecoration(color: color, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 8),
                  Text(label,
                      style: AppTextStyles.labelLarge.copyWith(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: ink)),
                ],
              ),
              GestureDetector(
                onTap: isEditing ? () => _showNumericInput(context) : null,
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
                      color: isEditing
                          ? color.withValues(alpha: 0.6)
                          : (isDark
                              ? AppColors.borderDark
                              : AppColors.borderLight),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        '${value.round()}',
                        style: AppTextStyles.labelMono.copyWith(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: ink,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text('g',
                          style: AppTextStyles.bodySmall
                              .copyWith(fontSize: 11, color: muted)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              height: 4,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: ColoredBox(
                      color: isDark
                          ? Colors.white.withValues(alpha: 0.06)
                          : const Color(0xFF0B0D10).withValues(alpha: 0.06),
                    ),
                  ),
                  FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: fraction,
                    // Must expand or the childless ColoredBox collapses to
                    // zero height inside the loose Stack.
                    child: SizedBox.expand(
                      key: Key('macro-progress-fill-$label'),
                      child: ColoredBox(color: color),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '$pct% of ${label.toLowerCase()} target',
            style: AppTextStyles.labelMono.copyWith(
              fontSize: 10.5,
              letterSpacing: 10.5 * 0.04,
              color: muted,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showNumericInput(BuildContext context) async {
    final controller = TextEditingController(text: value.round().toString());
    final result = await showModalBottomSheet<double>(
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
            Text('Edit $label (g)', style: AppTextStyles.heading3),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: InputDecoration(
                hintText: '${value.round()}',
                suffix: const Text('g'),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  final v = double.tryParse(controller.text);
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
    if (result != null) onEdit(result);
  }
}

class _AskAiCard extends StatelessWidget {
  const _AskAiCard({required this.isDark, required this.onTap});

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
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.cyan.withValues(alpha: isDark ? 0.06 : 0.08),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            width: 0.5,
            color: AppColors.cyan.withValues(alpha: isDark ? 0.20 : 0.30),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: AppColors.brandGradient),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.auto_awesome,
                  size: 16, color: Color(0xFF0B0D10)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Not right? Ask AI to fix this',
                    style: AppTextStyles.labelLarge.copyWith(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: ink,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    "Describe the meal in your words — we'll re-estimate macros.",
                    style: AppTextStyles.bodySmall
                        .copyWith(fontSize: 11.5, color: muted),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, size: 16, color: muted),
          ],
        ),
      ),
    );
  }
}

class _EditActionBar extends StatelessWidget {
  final bool isSaving;
  final bool isDark;
  final VoidCallback onUndo;
  final VoidCallback onSave;

  const _EditActionBar({
    required this.isSaving,
    required this.isDark,
    required this.onUndo,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final bg = isDark ? AppColors.backgroundDark : AppColors.backgroundLight;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Row(
          children: [
            Expanded(
              child: SizedBox(
                height: 50,
                child: OutlinedButton.icon(
                  onPressed: onUndo,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: ink,
                    backgroundColor:
                        isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
                    side: BorderSide(
                      width: 0.5,
                      color:
                          isDark ? AppColors.borderDark : AppColors.borderLight,
                    ),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16)),
                  ),
                  icon: const Icon(Icons.undo, size: 16),
                  label: const Text('Undo'),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: SizedBox(
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: isSaving ? null : onSave,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: ink,
                    foregroundColor: bg,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16)),
                  ),
                  icon: isSaving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check, size: 16),
                  label: const Text('Save to Today'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
