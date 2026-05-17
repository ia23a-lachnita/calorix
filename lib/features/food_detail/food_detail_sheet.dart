import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/food_detail_providers.dart';
import '../../shared/models/food_entry.dart';
import '../../shared/widgets/confidence_badge.dart';
import '../../shared/widgets/skeleton_shimmer.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/constants/app_constants.dart';
import '../../shared/providers/auth_provider.dart';

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
              const Icon(Icons.error_outline, color: AppColors.needsReview, size: 48),
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
  bool get _isEditMode =>
      ref.watch(foodEditModeProvider(entry.id));
  PendingEdits get _pending => ref.watch(pendingEditsProvider(entry.id));

  double get _displayKcal =>
      (_pending.kcal ?? entry.kcal ?? 0) *
      (_pending.servingMultiplier ?? entry.servingMultiplier);
  double get _displayProtein =>
      (_pending.protein ?? entry.protein ?? 0) *
      (_pending.servingMultiplier ?? entry.servingMultiplier);
  double get _displayCarbs =>
      (_pending.carbs ?? entry.carbs ?? 0) *
      (_pending.servingMultiplier ?? entry.servingMultiplier);
  double get _displayFat =>
      (_pending.fat ?? entry.fat ?? 0) *
      (_pending.servingMultiplier ?? entry.servingMultiplier);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final subtextColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => Scaffold(
        backgroundColor: isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
        body: CustomScrollView(
          controller: scrollController,
          slivers: [
            SliverAppBar(
              pinned: true,
              expandedHeight: 240,
              backgroundColor:
                  isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
              leading: _BackChip(onTap: () => context.pop()),
              actions: [
                _ChipAction(
                  icon: Icons.copy_outlined,
                  label: 'Copy',
                  onTap: () => _duplicate(context, ref),
                ),
                const SizedBox(width: 8),
                _ChipAction(
                  icon: Icons.delete_outline,
                  label: 'Delete',
                  onTap: () => _delete(context, ref),
                  destructive: true,
                ),
                const SizedBox(width: 12),
              ],
              flexibleSpace: FlexibleSpaceBar(
                background: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (entry.imageUrl != null)
                      CachedNetworkImage(
                        imageUrl: entry.imageUrl!,
                        fit: BoxFit.cover,
                      )
                    else
                      Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            colors: [AppColors.blue, AppColors.cyan],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                        ),
                      ),
                    // Confidence pill
                    if (entry.confidence != null)
                      Positioned(
                        bottom: 40,
                        left: 16,
                        child: _ConfidencePill(confidence: entry.confidence!),
                      ),
                  ],
                ),
              ),
            ),

            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // Header row
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          entry.foodName ?? 'Unknown food',
                          style: AppTextStyles.heading2.copyWith(color: textColor),
                        ),
                      ),
                      _EditChip(
                        isEditing: _isEditMode,
                        onTap: () {
                          ref.read(foodEditModeProvider(entry.id).notifier).state =
                              !_isEditMode;
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Kcal banner + serving stepper
                  _KcalBanner(
                    kcal: _displayKcal,
                    multiplier: _pending.servingMultiplier ?? entry.servingMultiplier,
                    isEditing: _isEditMode,
                    onMultiplierChanged: (v) => ref
                        .read(pendingEditsProvider(entry.id).notifier)
                        .state = _pending.copyWith(servingMultiplier: v),
                    textColor: textColor,
                  ),
                  const SizedBox(height: 20),

                  // Macro rows
                  _MacroEditRow(
                    label: 'Protein',
                    value: _displayProtein,
                    color: AppColors.protein,
                    isEditing: _isEditMode,
                    onEdit: (v) => ref
                        .read(pendingEditsProvider(entry.id).notifier)
                        .state = _pending.copyWith(protein: v),
                    target: 170,
                  ),
                  const SizedBox(height: 12),
                  _MacroEditRow(
                    label: 'Carbs',
                    value: _displayCarbs,
                    color: AppColors.carbs,
                    isEditing: _isEditMode,
                    onEdit: (v) => ref
                        .read(pendingEditsProvider(entry.id).notifier)
                        .state = _pending.copyWith(carbs: v),
                    target: 250,
                  ),
                  const SizedBox(height: 12),
                  _MacroEditRow(
                    label: 'Fat',
                    value: _displayFat,
                    color: AppColors.fat,
                    isEditing: _isEditMode,
                    onEdit: (v) => ref
                        .read(pendingEditsProvider(entry.id).notifier)
                        .state = _pending.copyWith(fat: v),
                    target: 70,
                  ),
                  const SizedBox(height: 20),

                  // Detected items
                  if (entry.detectedItems.isNotEmpty) ...[
                    Text('Detected items',
                        style: AppTextStyles.labelLarge.copyWith(color: subtextColor)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ...entry.detectedItems.map(
                          (item) => Chip(
                            label: Text('${item.name} · ${item.weight.round()}g'),
                          ),
                        ),
                        if (_isEditMode)
                          ActionChip(
                            label: const Text('+ Add item'),
                            onPressed: () {},
                            side: const BorderSide(
                                color: AppColors.blue,
                                style: BorderStyle.solid),
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                  ],

                  // Ask AI CTA
                  OutlinedButton.icon(
                    onPressed: () => context.go('/ai?mealId=${entry.id}'),
                    icon: const Icon(Icons.auto_awesome_outlined, size: 16),
                    label: const Text("Not right? Ask AI to fix this"),
                  ),
                  const SizedBox(height: 80),
                ]),
              ),
            ),
          ],
        ),
        bottomNavigationBar: _isEditMode
            ? _EditActionBar(
                isSaving: _isSaving,
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
    setState(() => _isSaving = true);
    try {
      final repo = ref.read(foodEntryRepositoryProvider);
      await repo.update(entry.id, _pending.toUpdateMap(), markCorrected: true);
      if (!mounted) return;
      ref.read(foodEditModeProvider(entry.id).notifier).state = false;
      context.pop();
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete entry?'),
        content: const Text('This will remove the meal from today\'s log.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await ref.read(foodEntryRepositoryProvider).delete(entry.id);
      if (mounted) context.pop();
    }
  }

  Future<void> _duplicate(BuildContext context, WidgetRef ref) async {
    await ref.read(foodEntryRepositoryProvider).duplicate(entry);
    if (mounted) context.pop();
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
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.cameraOverlayBg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: _opacity,
            child: Container(
              width: 7,
              height: 7,
              decoration: const BoxDecoration(
                color: AppColors.green,
                shape: BoxShape.circle,
              ),
            ),
          ),
          const SizedBox(width: 6),
          Text(
            'AI · $pct% CONFIDENCE',
            style: AppTextStyles.labelMono.copyWith(color: AppColors.cameraOverlayText),
          ),
        ],
      ),
    );
  }
}

class _BackChip extends StatelessWidget {
  final VoidCallback onTap;
  const _BackChip({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 12, top: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.cameraOverlayBg,
            borderRadius: BorderRadius.circular(20),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.chevron_left, color: AppColors.cameraOverlayText, size: 16),
              const Text('Back',
                  style: TextStyle(
                      color: AppColors.cameraOverlayText,
                      fontFamily: 'Barlow',
                      fontSize: 13,
                      fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChipAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  const _ChipAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.cameraOverlayBg,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon,
                  color: destructive ? AppColors.error : AppColors.cameraOverlayText, size: 14),
              const SizedBox(width: 4),
              Text(label,
                  style: TextStyle(
                      color: destructive ? AppColors.error : AppColors.cameraOverlayText,
                      fontFamily: 'Barlow',
                      fontSize: 13,
                      fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ),
    );
  }
}

class _EditChip extends StatelessWidget {
  final bool isEditing;
  final VoidCallback onTap;
  const _EditChip({required this.isEditing, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: isEditing ? AppColors.blue : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.blue),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.edit_outlined,
                size: 14,
                color: isEditing ? AppColors.cameraOverlayText : AppColors.blue),
            if (!isEditing) ...[
              const SizedBox(width: 4),
              const Text('Edit',
                  style: TextStyle(
                      fontFamily: 'Barlow',
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: AppColors.blue)),
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
  final ValueChanged<double> onMultiplierChanged;
  final Color textColor;

  const _KcalBanner({
    required this.kcal,
    required this.multiplier,
    required this.isEditing,
    required this.onMultiplierChanged,
    required this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          '${kcal.round()} kcal',
          style: AppTextStyles.heroNumber.copyWith(
              color: AppColors.blue, fontSize: 32),
        ),
        if (isEditing)
          Row(
            children: [
              IconButton(
                onPressed: multiplier > AppConstants.servingMultiplierMin
                    ? () => onMultiplierChanged(
                        multiplier - AppConstants.servingMultiplierStep)
                    : null,
                icon: const Icon(Icons.remove_circle_outline),
                iconSize: 20,
              ),
              Text(
                '${multiplier}x',
                style: AppTextStyles.labelLarge.copyWith(color: textColor),
              ),
              IconButton(
                onPressed: multiplier < AppConstants.servingMultiplierMax
                    ? () => onMultiplierChanged(
                        multiplier + AppConstants.servingMultiplierStep)
                    : null,
                icon: const Icon(Icons.add_circle_outline),
                iconSize: 20,
              ),
            ],
          )
        else
          Text(
            '${multiplier}x serving',
            style: AppTextStyles.bodySmall.copyWith(color: AppColors.textSecondaryLight),
          ),
      ],
    );
  }
}

class _MacroEditRow extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  final bool isEditing;
  final ValueChanged<double> onEdit;
  final double target;

  const _MacroEditRow({
    required this.label,
    required this.value,
    required this.color,
    required this.isEditing,
    required this.onEdit,
    required this.target,
  });

  @override
  Widget build(BuildContext context) {
    final pct = target > 0 ? ((value / target) * 100).round() : 0;
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(label, style: AppTextStyles.labelLarge),
        ),
        if (isEditing)
          GestureDetector(
            onTap: () => _showNumericInput(context),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: color.withAlpha(30),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: color.withAlpha(100)),
              ),
              child: Text('${value.round()}g',
                  style: AppTextStyles.macroGrams.copyWith(color: color)),
            ),
          )
        else
          Text('${value.round()}g / ${target.round()}g',
              style: AppTextStyles.macroGrams),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: color.withAlpha(30),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text('$pct%',
              style: AppTextStyles.labelSmall.copyWith(color: color)),
        ),
      ],
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
            Text('Edit $label (g)',
                style: AppTextStyles.heading3),
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

class _EditActionBar extends StatelessWidget {
  final bool isSaving;
  final VoidCallback onUndo;
  final VoidCallback onSave;

  const _EditActionBar({
    required this.isSaving,
    required this.onUndo,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: Row(
          children: [
            TextButton.icon(
              onPressed: onUndo,
              icon: const Icon(Icons.undo, size: 16),
              label: const Text('Undo'),
            ),
            const Spacer(),
            ElevatedButton(
              onPressed: isSaving ? null : onSave,
              child: isSaving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Save to Today'),
            ),
          ],
        ),
      ),
    );
  }
}
