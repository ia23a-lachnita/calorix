import '../../core/theme/app_colors.dart';
import 'package:flutter/material.dart';
import 'targets.dart';
import 'local_meal.dart';
import 'package:intl/intl.dart';

/// Displays the persisted daily targets and delegates changes to the existing
/// validated target editor. No body plan or weight history is fabricated.
class DashboardGoals extends StatefulWidget {
  const DashboardGoals(
      {super.key,
      required this.targets,
      required this.onEdit,
      this.meals = const [],
      this.now});
  final Tier1Targets targets;
  final VoidCallback onEdit;
  final List<Tier1Meal> meals;
  final DateTime? now;
  @override
  State<DashboardGoals> createState() => _DashboardGoalsState();
}

class _GoalPeriod {
  const _GoalPeriod(this.key, this.label, this.start, this.end);
  final String key, label;
  final DateTime start, end;
}

class _DashboardGoalsState extends State<DashboardGoals> {
  String selected = 'daily';
  static DateTime day(DateTime t) {
    final local = DateTime.fromMillisecondsSinceEpoch(t.millisecondsSinceEpoch);
    return DateTime(local.year, local.month, local.day);
  }

  @override
  Widget build(BuildContext context) {
    final targets = widget.targets;
    final periods = <String, _GoalPeriod>{};
    void addPeriod(DateTime d) {
      final week = DateTime(d.year, d.month, d.day - d.weekday + 1);
      final month = DateTime(d.year, d.month);
      final weekEnd = DateTime(week.year, week.month, week.day + 7);
      final lastDay = DateTime(weekEnd.year, weekEnd.month, weekEnd.day - 1);
      final wk = 'w:${DateFormat('yyyy-MM-dd').format(week)}';
      final mk = 'm:${DateFormat('yyyy-MM').format(month)}';
      periods[wk] = _GoalPeriod(
          wk,
          '${DateFormat('MMM d').format(week)} – ${DateFormat('MMM d').format(lastDay)}, ${lastDay.year}',
          week,
          weekEnd);
      periods[mk] = _GoalPeriod(mk, DateFormat('MMMM yyyy').format(month),
          month, DateTime(month.year, month.month + 1));
    }

    final today = day(widget.now ?? DateTime.now());
    addPeriod(today);
    for (final meal in widget.meals) {
      addPeriod(day(meal.capturedAt));
    }
    final weeks = periods.values.where((p) => p.key.startsWith('w:')).toList()
      ..sort((a, b) => b.start.compareTo(a.start));
    final months = periods.values.where((p) => p.key.startsWith('m:')).toList()
      ..sort((a, b) => b.start.compareTo(a.start));
    final period = periods[selected];
    final included = period == null
        ? widget.meals.where((m) => day(m.capturedAt) == today).toList()
        : widget.meals.where((m) {
            final d = day(m.capturedAt);
            return !d.isBefore(period.start) && d.isBefore(period.end);
          }).toList();
    final kcal = included
        .fold<double>(
            0,
            (sum, meal) =>
                sum + (meal.served?.kcal ?? 0) * (meal.consumedFraction ?? 1))
        .round();
    final theme = Theme.of(context), scheme = theme.colorScheme;
    final label = theme.textTheme.labelSmall
        ?.copyWith(letterSpacing: 1.2, color: scheme.onSurfaceVariant);
    Widget card(Widget child) => Container(
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: scheme.outlineVariant)),
        child: child);
    return ListView(children: [
      Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  PopupMenuButton<String>(
                      tooltip: 'Target period',
                      onSelected: (value) => setState(() => selected = value),
                      itemBuilder: (_) => [
                            const PopupMenuItem(
                                value: 'daily', child: Text('Daily targets')),
                            if (weeks.isNotEmpty)
                              const PopupMenuItem<String>(
                                  enabled: false, child: Text('WEEKS')),
                            for (final p in weeks)
                              PopupMenuItem(value: p.key, child: Text(p.label)),
                            if (months.isNotEmpty)
                              const PopupMenuItem<String>(
                                  enabled: false, child: Text('MONTHS')),
                            for (final p in months)
                              PopupMenuItem(value: p.key, child: Text(p.label)),
                          ],
                      child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                              border: Border.all(color: scheme.outlineVariant),
                              borderRadius: BorderRadius.circular(20)),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Flexible(
                                child: Text(period?.label ?? 'Daily targets',
                                    overflow: TextOverflow.ellipsis)),
                            const Icon(Icons.keyboard_arrow_down, size: 18)
                          ]))),
                  const SizedBox(height: 8),
                  Text('Goals', style: theme.textTheme.headlineMedium),
                ])),
            OutlinedButton.icon(
                onPressed: widget.onEdit,
                icon: const Icon(Icons.tune, size: 16),
                label: const Text('Adjust'))
          ])),
      if (period == null)
        card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Today: $kcal kcal logged', style: theme.textTheme.titleMedium),
          Text('Current daily target: ${targets.kcal} kcal',
              style: theme.textTheme.bodySmall),
          if (included.any((m) => m.served == null))
            const Text(
                'Some meals have no nutrition yet; only known values are included.'),
        ])),
      if (period != null)
        card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('LOGGED IN THIS PERIOD', style: label),
          const SizedBox(height: 6),
          Text('$kcal kcal', style: theme.textTheme.headlineSmall),
          Text(
              '${included.length} ${included.length == 1 ? 'meal' : 'meals'} · Current daily target: ${targets.kcal} kcal',
              style: theme.textTheme.bodySmall),
          if (included.any((m) => m.served == null))
            const Text(
                'Some meals have no nutrition yet; only known values are included.'),
        ])),
      card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('DAILY CALORIE TARGET', style: label),
        const SizedBox(height: 6),
        Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text('${targets.kcal}', style: theme.textTheme.headlineMedium),
              const SizedBox(width: 5),
              const Text('kcal')
            ]),
        const SizedBox(height: 8),
        TextButton.icon(
            onPressed: widget.onEdit,
            icon: const Icon(Icons.tune, size: 16),
            label: const Text('Adjust calories')),
        Text('Your daily target', style: theme.textTheme.bodySmall)
      ])),
      card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('MACRO TARGETS', style: label),
        const SizedBox(height: 12),
        Semantics(
            label: 'Target macro calorie composition',
            child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(
                    height: 10,
                    child: Row(children: [
                      for (final (weight, color) in [
                        (targets.proteinG * 4, AppColors.protein),
                        (targets.carbsG * 4, AppColors.carbs),
                        (targets.fatG * 9, AppColors.fat)
                      ])
                        Expanded(flex: weight, child: ColoredBox(color: color)),
                    ])))),
        const SizedBox(height: 14),
        Row(children: [
          for (final (name, value, color) in [
            ('Protein', targets.proteinG, AppColors.protein),
            ('Carbs', targets.carbsG, AppColors.carbs),
            ('Fat', targets.fatG, AppColors.fat)
          ])
            Expanded(
                child: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                            color: scheme.surface,
                            borderRadius: BorderRadius.circular(12)),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Container(
                                    width: 6,
                                    height: 6,
                                    decoration: BoxDecoration(
                                        shape: BoxShape.circle, color: color)),
                                const SizedBox(width: 5),
                                Flexible(
                                    child: Text(name,
                                        overflow: TextOverflow.ellipsis,
                                        style: label))
                              ]),
                              const SizedBox(height: 5),
                              Text('$value g',
                                  style: theme.textTheme.titleMedium)
                            ]))))
        ])
      ])),
      const SizedBox(height: 24),
    ]);
  }
}
