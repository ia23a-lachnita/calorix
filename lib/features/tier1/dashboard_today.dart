import '../../core/theme/app_colors.dart';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../shared/widgets/macro_ring.dart';
import 'local_meal.dart';
import 'motion.dart';
import 'targets.dart';

class DashboardToday extends StatefulWidget {
  const DashboardToday(
      {super.key,
      required this.meals,
      required this.now,
      required this.targets,
      required this.onOpenMeal,
      required this.onEditTargets,
      this.onScan});
  final List<Tier1Meal> meals;
  final DateTime now;
  final Tier1Targets targets;
  final ValueChanged<Tier1Meal>? onOpenMeal;
  final VoidCallback onEditTargets;
  final VoidCallback? onScan;
  @override
  State<DashboardToday> createState() => _DashboardTodayState();
}

class _DashboardTodayState extends State<DashboardToday> {
  late DateTime day = _day(widget.now);
  static DateTime _day(DateTime t) {
    final d = DateTime.fromMillisecondsSinceEpoch(t.millisecondsSinceEpoch);
    return DateTime(d.year, d.month, d.day);
  }

  @override
  void didUpdateWidget(covariant DashboardToday oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_day(oldWidget.now) != _day(widget.now) && day == _day(oldWidget.now)) {
      day = _day(widget.now);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context), scheme = theme.colorScheme;
    final meals = widget.meals.where((m) => _day(m.capturedAt) == day).toList();
    final isToday = day == _day(widget.now);
    final ringSize = math.min(
        math.min(320.0, 240 * MediaQuery.textScalerOf(context).scale(1.0)),
        MediaQuery.sizeOf(context).width - 60);
    double sum(double? Function(Tier1Nutrients) get) => meals.fold(
        0.0,
        (v, m) =>
            v +
            (m.served == null
                ? 0
                : (get(m.served!) ?? 0) * (m.consumedFraction ?? 1)));
    final kcal = sum((n) => n.kcal).round();
    final macros = [
      (
        'Protein',
        sum((n) => n.proteinG),
        widget.targets.proteinG,
        AppColors.protein
      ),
      ('Carbs', sum((n) => n.carbsG), widget.targets.carbsG, AppColors.carbs),
      ('Fat', sum((n) => n.fatG), widget.targets.fatG, AppColors.fat)
    ];
    final fractions = _MacroFractions(macros[0].$2 / macros[0].$3,
        macros[1].$2 / macros[1].$3, macros[2].$2 / macros[2].$3);
    final label = theme.textTheme.labelSmall
        ?.copyWith(letterSpacing: 1.1, color: scheme.onSurfaceVariant);
    return SingleChildScrollView(
        key: const PageStorageKey('tier1-today'),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Row(children: [
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      MotionLabel(
                          key: const Key('today-day-label'),
                          valueKey: day.toIso8601String(),
                          text: DateFormat('EEEE · MMMM d')
                              .format(day)
                              .toUpperCase(),
                          semanticLabel: DateFormat('EEEE, MMMM d').format(day),
                          style: label),
                      MotionLabel(
                          key: const Key('today-day-title'),
                          valueKey: '${day.toIso8601String()}-$isToday',
                          text: isToday
                              ? 'Today'
                              : DateFormat('MMM d').format(day),
                          semanticLabel: isToday
                              ? 'Today'
                              : DateFormat('MMMM d').format(day),
                          style: theme.textTheme.headlineMedium)
                    ])),
                IconButton(
                    tooltip: 'Previous day',
                    onPressed: () => setState(
                        () => day = DateTime(day.year, day.month, day.day - 1)),
                    icon: const Icon(Icons.chevron_left)),
                IconButton(
                    tooltip: 'Next day',
                    onPressed: day.isBefore(_day(widget.now))
                        ? () => setState(() =>
                            day = DateTime(day.year, day.month, day.day + 1))
                        : null,
                    icon: const Icon(Icons.chevron_right))
              ])),
          const SizedBox(height: 14),
          Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: scheme.outlineVariant)),
              child: Column(children: [
                Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: TweenAnimationBuilder<_MacroFractions>(
                        key: const Key('today-ring-fill-animation'),
                        tween: _MacroFractionsTween(end: fractions),
                        duration: Motion.of(context, Motion.medium),
                        curve: Motion.curve,
                        builder: (context, animated, _) => MacroRing(
                            key: const Key('today-calorie-ring'),
                            size: ringSize,
                            strokeWidth: 8,
                            centerClearance: 12,
                            showGlow: false,
                            proteinFraction: animated.protein,
                            carbsFraction: animated.carbs,
                            fatFraction: animated.fat,
                            center: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text('KCAL EATEN',
                                      style: label,
                                      textAlign: TextAlign.center),
                                  MotionLabel(
                                      key: const Key('today-calorie-total'),
                                      valueKey: '$kcal/${widget.targets.kcal}',
                                      text: '$kcal',
                                      semanticLabel:
                                          '$kcal kilocalories eaten of ${widget.targets.kcal}',
                                      style: theme.textTheme.displaySmall,
                                      textAlign: TextAlign.center,
                                      maxLines: 1,
                                      softWrap: false,
                                      overflow: TextOverflow.visible),
                                  Text('of ${widget.targets.kcal}',
                                      style: theme.textTheme.bodySmall,
                                      textAlign: TextAlign.center),
                                  Text(
                                      '${(widget.targets.kcal - kcal).abs()} kcal ${kcal <= widget.targets.kcal ? 'left' : 'over'}',
                                      style: theme.textTheme.labelMedium,
                                      textAlign: TextAlign.center)
                                ])))),
                for (final (name, value, target, color) in macros)
                  Container(
                      margin: const EdgeInsets.only(top: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                          color: scheme.surface,
                          borderRadius: BorderRadius.circular(14)),
                      child: Column(children: [
                        Row(children: [
                          Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                  color: color, shape: BoxShape.circle)),
                          const SizedBox(width: 8),
                          Expanded(child: Text(name)),
                          Expanded(
                              child: Align(
                                  alignment: Alignment.centerRight,
                                  child: MotionLabel(
                                      key: Key('today-macro-value-$name'),
                                      valueKey: '${value.round()}/$target',
                                      text: '${value.round()} / $target g',
                                      semanticLabel:
                                          '$name: ${value.round()} of $target grams',
                                      textAlign: TextAlign.end))),
                        ]),
                        const SizedBox(height: 8),
                        ExcludeSemantics(
                            child: TweenAnimationBuilder<double>(
                                key: Key('today-macro-progress-$name'),
                                tween: Tween<double>(
                                    end: (value / target).clamp(0.0, 1.0)),
                                duration: Motion.of(context, Motion.medium),
                                curve: Motion.curve,
                                builder: (_, fraction, __) =>
                                    LinearProgressIndicator(
                                        value: fraction,
                                        minHeight: 5,
                                        color: color)))
                      ])),
              ])),
          if (meals.any((m) =>
              m.served == null ||
              m.served!.proteinG == null ||
              m.served!.carbsG == null ||
              m.served!.fatG == null))
            const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                    'Some nutrition values are unavailable; totals include known values only.')),
          Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                  onPressed: widget.onEditTargets,
                  icon: const Icon(Icons.tune, size: 18),
                  label: const Text('Change targets'))),
          Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text('Recent meals', style: theme.textTheme.titleSmall)),
          if (meals.isEmpty)
            if (isToday)
              Container(
                  margin: const EdgeInsets.only(top: 12),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: scheme.outlineVariant)),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        DecoratedBox(
                            decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: LinearGradient(colors: [
                                  scheme.primary.withValues(alpha: 0.18),
                                  scheme.secondary.withValues(alpha: 0.12)
                                ])),
                            child: SizedBox(
                                width: 64,
                                height: 64,
                                child: Icon(Icons.photo_camera_outlined,
                                    color: scheme.primary, size: 28))),
                        const SizedBox(height: 14),
                        Text('Nothing logged yet',
                            textAlign: TextAlign.center,
                            style: theme.textTheme.titleMedium),
                        const SizedBox(height: 6),
                        Text(
                            "Point the camera at your first meal — one tap and it's tracked.",
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodyMedium
                                ?.copyWith(color: scheme.onSurfaceVariant)),
                        const SizedBox(height: 16),
                        SizedBox(
                            width: double.infinity,
                            child: FilledButton.icon(
                                onPressed: widget.onScan,
                                icon: const Icon(Icons.camera_alt_outlined),
                                label: const Text('Scan your first meal')))
                      ]))
            else
              const Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('Nothing logged on this day.')),
          for (final m in meals)
            Card(
                child: ListTile(
                    leading: m.photoPath == null
                        ? const Icon(Icons.restaurant)
                        : ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Image.file(File(m.photoPath!),
                                width: 48,
                                height: 48,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Icon(
                                    Icons.image_not_supported_outlined))),
                    title: Text(m.name),
                    subtitle: Text(m.served == null
                        ? 'Nutrition not available'
                        : '${(m.served!.kcal * (m.consumedFraction ?? 1)).round()} kcal'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: widget.onOpenMeal == null
                        ? null
                        : () => widget.onOpenMeal?.call(m))),
        ]));
  }
}

class _MacroFractions {
  const _MacroFractions(this.protein, this.carbs, this.fat);

  final double protein;
  final double carbs;
  final double fat;

  static _MacroFractions lerp(_MacroFractions a, _MacroFractions b, double t) =>
      _MacroFractions(
        a.protein + (b.protein - a.protein) * t,
        a.carbs + (b.carbs - a.carbs) * t,
        a.fat + (b.fat - a.fat) * t,
      );

  @override
  bool operator ==(Object other) =>
      other is _MacroFractions &&
      protein == other.protein &&
      carbs == other.carbs &&
      fat == other.fat;

  @override
  int get hashCode => Object.hash(protein, carbs, fat);
}

class _MacroFractionsTween extends Tween<_MacroFractions> {
  _MacroFractionsTween({required super.end});

  @override
  _MacroFractions lerp(double t) =>
      _MacroFractions.lerp(begin ?? end!, end!, t);
}
