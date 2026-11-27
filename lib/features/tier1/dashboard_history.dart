import 'dart:io';
import 'dart:math' as math;
import '../../core/theme/app_colors.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'local_meal.dart';
import 'motion.dart';
import 'targets.dart';

/// Calendar and summaries of actual local records; opening a meal is delegated
/// to the existing editor so the record and its revision remain authoritative.
class DashboardHistory extends StatefulWidget {
  const DashboardHistory(
      {super.key,
      required this.meals,
      required this.now,
      required this.targets,
      required this.onOpenMeal});
  final List<Tier1Meal> meals;
  final DateTime now;
  final Tier1Targets targets;
  final ValueChanged<Tier1Meal>? onOpenMeal;
  @override
  State<DashboardHistory> createState() => _DashboardHistoryState();
}

class _DashboardHistoryState extends State<DashboardHistory> {
  late DateTime anchor = _day(widget.now);
  bool month = false;
  DateTime? expanded;
  static DateTime _day(DateTime value) {
    final d = DateTime.fromMillisecondsSinceEpoch(value.millisecondsSinceEpoch);
    return DateTime(d.year, d.month, d.day);
  }

  DateTime get start => month
      ? DateTime(anchor.year, anchor.month)
      : DateTime(anchor.year, anchor.month, anchor.day - anchor.weekday + 1);
  DateTime get end => month
      ? DateTime(anchor.year, anchor.month + 1)
      : DateTime(start.year, start.month, start.day + 7);
  int _kcal(List<Tier1Meal> meals) => meals
      .fold<double>(
          0, (s, m) => s + (m.served?.kcal ?? 0) * (m.consumedFraction ?? 1))
      .round();
  void _move(int delta) => setState(() {
        anchor = month
            ? DateTime(anchor.year, anchor.month + delta, 1)
            : DateTime(anchor.year, anchor.month, anchor.day + delta * 7);
        expanded = null;
      });
  @override
  void didUpdateWidget(covariant DashboardHistory oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_day(oldWidget.now) != _day(widget.now) &&
        anchor == _day(oldWidget.now)) {
      anchor = _day(widget.now);
    }
  }

  @override
  Widget build(BuildContext context) {
    double targetFraction(num calories) => widget.targets.kcal > 0
        ? (calories / widget.targets.kcal).clamp(0.0, 1.0)
        : 0;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final byDay = <DateTime, List<Tier1Meal>>{};
    for (final meal in widget.meals) {
      (byDay[_day(meal.capturedAt)] ??= []).add(meal);
    }
    List<Tier1Meal> on(DateTime date) => byDay[date] ?? const [];
    final recent = [...widget.meals]
      ..sort((a, b) => b.capturedAt.compareTo(a.capturedAt));
    final days = <DateTime>[];
    for (var d = start;
        d.isBefore(end);
        d = DateTime(d.year, d.month, d.day + 1)) {
      days.add(d);
    }
    final logged =
        days.where((d) => on(d).isNotEmpty).toList().reversed.toList();
    final nutritionDays = days
        .where((d) => on(d).isNotEmpty && on(d).every((m) => m.served != null))
        .toList();
    final average = nutritionDays.isEmpty
        ? 0
        : (nutritionDays.fold<int>(0, (n, d) => n + _kcal(on(d))) /
                nutritionDays.length)
            .round();
    final chartValues = days.map<double?>((d) {
      final meals = on(d);
      if (meals.isEmpty || meals.any((m) => m.served == null)) return null;
      return _kcal(meals).toDouble();
    }).toList();
    String macroAverage(double? Function(Tier1Nutrients) pick) {
      final validDays = days.where((d) {
        final meals = on(d);
        return meals.isNotEmpty &&
            meals.every((m) => m.served != null && pick(m.served!) != null);
      }).toList();
      if (validDays.isEmpty) return '— g/day';
      final total = validDays.fold<double>(
          0,
          (sum, d) =>
              sum +
              on(d).fold<double>(
                  0,
                  (value, m) =>
                      value + pick(m.served!)! * (m.consumedFraction ?? 1)));
      return '${(total / validDays.length).round()} g/day';
    }

    final label = theme.textTheme.labelSmall
        ?.copyWith(letterSpacing: 1.2, color: scheme.onSurfaceVariant);
    Widget card(Widget child) => Container(
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: scheme.outlineVariant)),
        child: child);
    Widget dayDetails(DateTime date) => expanded == date
        ? Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final meal in on(date))
                ListTile(
                    title: Text(meal.name),
                    subtitle: Text(meal.served == null
                        ? 'Nutrition not available'
                        : '${((meal.served!.kcal) * (meal.consumedFraction ?? 1)).round()} kcal'),
                    onTap: widget.onOpenMeal == null
                        ? null
                        : () => widget.onOpenMeal?.call(meal)),
            ],
          )
        : const SizedBox.shrink();
    final calendar = GridView.count(
        crossAxisCount: 7,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        childAspectRatio: (month ? 1.15 : .62) /
            MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0),
        children: [
          if (month)
            for (var i = 1; i < start.weekday; i++) const SizedBox.shrink(),
          for (final d in days)
            InkWell(
                onTap: () =>
                    setState(() => expanded = on(d).isEmpty ? null : d),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                    decoration: BoxDecoration(
                        color: d == _day(widget.now)
                            ? scheme.primary.withValues(alpha: .12)
                            : null,
                        borderRadius: BorderRadius.circular(12)),
                    child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (!month)
                            FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                    DateFormat('E').format(d).toUpperCase(),
                                    maxLines: 1,
                                    style: label)),
                          Text('${d.day}', style: theme.textTheme.titleSmall),
                          const SizedBox(height: 5),
                          if (month)
                            Container(
                                width: 4,
                                height: 4,
                                decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: on(d).isEmpty
                                        ? Colors.transparent
                                        : scheme.primary))
                          else
                            SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                    strokeWidth: 3,
                                    value: targetFraction(_kcal(on(d)))))
                        ]))),
        ]);
    return SingleChildScrollView(
        key: const PageStorageKey('tier1-history'),
        child: Column(children: [
          Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(DateFormat('MMMM').format(anchor).toUpperCase(),
                        style: label),
                    Row(children: [
                      Expanded(
                          child: Text('History',
                              style: theme.textTheme.headlineMedium)),
                      IconButton(
                          tooltip: 'Previous period',
                          onPressed: () => _move(-1),
                          icon: const Icon(Icons.chevron_left)),
                      IconButton(
                          tooltip: 'Next period',
                          onPressed: () => _move(1),
                          icon: const Icon(Icons.chevron_right))
                    ]),
                  ])),
          card(Column(children: [
            Row(children: [
              Expanded(child: Builder(builder: (context) {
                final text = month
                    ? DateFormat('MMMM yyyy').format(anchor).toUpperCase()
                    : (start ==
                            DateTime(
                                _day(widget.now).year,
                                _day(widget.now).month,
                                _day(widget.now).day -
                                    _day(widget.now).weekday +
                                    1)
                        ? 'THIS WEEK'
                        : '${DateFormat('MMM d').format(start)} – ${DateFormat('MMM d, yyyy').format(DateTime(end.year, end.month, end.day - 1))}'
                            .toUpperCase());
                return MotionLabel(
                    key: const Key('history-period-title'),
                    valueKey:
                        '${month ? 'month' : 'week'}-${start.toIso8601String()}',
                    text: text,
                    semanticLabel: text,
                    style: label);
              })),
              for (final mode in [false, true])
                TextButton(
                    onPressed: () => setState(() {
                          month = mode;
                          expanded = null;
                        }),
                    style: TextButton.styleFrom(
                        backgroundColor: month == mode ? scheme.surface : null,
                        minimumSize: const Size(36, 32),
                        padding: EdgeInsets.zero),
                    child: Text(mode ? 'M' : 'W'))
            ]),
            if (month)
              Row(children: [
                for (final d in ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
                  Expanded(child: Center(child: Text(d, style: label)))
              ]),
            if (MediaQuery.disableAnimationsOf(context))
              calendar
            else
              AnimatedSize(
                  key: const Key('history-calendar-grid'),
                  duration: Motion.of(context, Motion.medium),
                  curve: Motion.curve,
                  alignment: Alignment.topCenter,
                  child: calendar),
            const SizedBox(height: 10),
            Container(
                width: 44,
                height: 5,
                decoration: BoxDecoration(
                    color: scheme.outlineVariant,
                    borderRadius: BorderRadius.circular(10))),
          ])),
          card(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            MotionLabel(
                key: const Key('history-average-heading'),
                valueKey: month,
                text: month ? 'MONTHLY AVERAGE' : 'WEEKLY AVERAGE',
                semanticLabel: month ? 'MONTHLY AVERAGE' : 'WEEKLY AVERAGE',
                style: label),
            const SizedBox(height: 4),
            Wrap(
                spacing: 5,
                crossAxisAlignment: WrapCrossAlignment.end,
                children: [
                  MotionLabel(
                      key: const Key('history-average-value'),
                      valueKey: '$month-${start.toIso8601String()}-$average',
                      text: nutritionDays.isEmpty ? '—' : '$average',
                      semanticLabel: nutritionDays.isEmpty
                          ? 'No average available'
                          : '$average kcal average per logged day',
                      style: theme.textTheme.headlineSmall),
                  Text('kcal / logged day', style: theme.textTheme.bodySmall),
                ]),
            const SizedBox(height: 16),
            Semantics(
                label:
                    'Calorie trend; gaps indicate days without complete calorie data',
                child: SizedBox(
                    height: 80,
                    width: double.infinity,
                    child: AnimatedSwitcher(
                        key: const Key('history-trend-transition'),
                        duration: Motion.of(context, Motion.medium),
                        reverseDuration: Motion.of(context, Motion.medium),
                        layoutBuilder: (current, previous) =>
                            Stack(fit: StackFit.expand, children: [
                              for (final child in previous)
                                ExcludeSemantics(
                                    child: IgnorePointer(child: child)),
                              if (current != null) current,
                            ]),
                        child: CustomPaint(
                            key: ValueKey(
                                '$month:${start.toIso8601String()}:${chartValues.join(',')}:${widget.targets.kcal}'),
                            painter: _CalorieTrendPainter(
                                chartValues,
                                widget.targets.kcal.toDouble(),
                                scheme.primary,
                                scheme.outlineVariant))))),
            const SizedBox(height: 14),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final (name, value, color) in [
                ('Protein', macroAverage((n) => n.proteinG), AppColors.protein),
                ('Carbs', macroAverage((n) => n.carbsG), AppColors.carbs),
                ('Fat', macroAverage((n) => n.fatG), AppColors.fat),
              ])
                Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                        color: scheme.surface,
                        borderRadius: BorderRadius.circular(12)),
                    child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(mainAxisSize: MainAxisSize.min, children: [
                            Container(
                                width: 6,
                                height: 6,
                                decoration: BoxDecoration(
                                    color: color, shape: BoxShape.circle)),
                            const SizedBox(width: 5),
                            Text(name, style: label)
                          ]),
                          const SizedBox(height: 4),
                          MotionLabel(
                              key: Key('history-macro-value-$name'),
                              valueKey:
                                  '$month:${start.toIso8601String()}:$value',
                              text: value,
                              semanticLabel: '$name: $value',
                              style: theme.textTheme.bodySmall)
                        ])),
            ]),
            Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Macro averages use complete logged days.',
                    style: theme.textTheme.bodySmall)),
            if (days.any((d) => on(d).any((m) => m.served == null)))
              const Text('Some meals have no nutrition yet.'),
            const SizedBox(height: 12),
            Semantics(
                key: const Key('history-average-progress'),
                value: '${(targetFraction(average) * 100).round()}%',
                child: ExcludeSemantics(
                    child: TweenAnimationBuilder<double>(
                        tween: Tween(end: targetFraction(average)),
                        duration: Motion.of(context, Motion.medium),
                        curve: Motion.curve,
                        builder: (_, value, __) =>
                            LinearProgressIndicator(value: value))))
          ])),
          Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
              child: Text('Day log', style: theme.textTheme.titleSmall)),
          if (logged.isEmpty)
            const Padding(
                padding: EdgeInsets.all(20),
                child: Text('No meals logged in this period.')),
          for (final d in logged)
            card(Column(children: [
              ListTile(
                  key: Key(
                      'history-day-row-${DateFormat('yyyy-MM-dd').format(d)}'),
                  contentPadding: EdgeInsets.zero,
                  leading: SizedBox(
                      width: 40,
                      height: 40,
                      child: CircularProgressIndicator(
                          value: targetFraction(_kcal(on(d))), strokeWidth: 4)),
                  title: Text(DateFormat('E · MMM d').format(d)),
                  subtitle: Text(
                      '${on(d).length} ${on(d).length == 1 ? 'meal' : 'meals'}'),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(on(d).any((m) => m.served != null)
                        ? '${_kcal(on(d))} kcal'
                        : '— kcal'),
                    const Icon(Icons.chevron_right)
                  ]),
                  onTap: () =>
                      setState(() => expanded = expanded == d ? null : d)),
              if (MediaQuery.disableAnimationsOf(context))
                dayDetails(d)
              else
                AnimatedSize(
                    key: Key(
                        'history-day-details-${DateFormat('yyyy-MM-dd').format(d)}'),
                    duration: Motion.of(context, Motion.medium),
                    curve: Motion.curve,
                    alignment: Alignment.topCenter,
                    child: dayDetails(d)),
            ])),
          if (expanded == null && recent.isNotEmpty) ...[
            Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Recent meals',
                        style: theme.textTheme.titleSmall))),
            for (final meal in recent.take(10))
              card(ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: meal.photoPath == null
                      ? const Icon(Icons.restaurant)
                      : ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.file(File(meal.photoPath!),
                              width: 48,
                              height: 48,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Icon(
                                  Icons.image_not_supported_outlined))),
                  title: Text(meal.name),
                  subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                            '${DateFormat('E · MMM d, yyyy').format(_day(meal.capturedAt))} · ${meal.served == null ? 'Nutrition not available' : '${(meal.served!.kcal * (meal.consumedFraction ?? 1)).round()} kcal${meal.consumedFraction == null ? ' served' : ' eaten'}'}'),
                        if (meal.served != null)
                          Wrap(spacing: 10, children: [
                            for (final (name, grams) in [
                              ('Protein', meal.served!.proteinG),
                              ('Carbs', meal.served!.carbsG),
                              ('Fat', meal.served!.fatG)
                            ])
                              if (grams != null)
                                Text(
                                    '${(grams * (meal.consumedFraction ?? 1)).round()} g',
                                    semanticsLabel:
                                        '$name ${(grams * (meal.consumedFraction ?? 1)).round()} grams')
                          ])
                      ]),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: widget.onOpenMeal == null
                      ? null
                      : () => widget.onOpenMeal?.call(meal))),
            if (recent.length > 10)
              TextButton(
                  onPressed: () =>
                      Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (context) => Scaffold(
                              appBar: AppBar(title: const Text('All meals')),
                              body: ListView.builder(
                                  itemCount: recent.length,
                                  itemBuilder: (context, index) {
                                    final meal = recent[index];
                                    return ListTile(
                                        title: Text(meal.name),
                                        subtitle: Text(
                                            DateFormat('E · MMM d, yyyy')
                                                .format(_day(meal.capturedAt))),
                                        onTap: widget.onOpenMeal == null
                                            ? null
                                            : () {
                                                Navigator.pop(context);
                                                widget.onOpenMeal?.call(meal);
                                              });
                                  })))),
                  child: const Text('See all meals')),
          ],
          const SizedBox(height: 24),
        ]));
  }
}

class _CalorieTrendPainter extends CustomPainter {
  _CalorieTrendPainter(this.values, this.target, this.color, this.track);
  final List<double?> values;
  final double target;
  final Color color, track;
  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final maxValue = values.whereType<double>().fold<double>(target, math.max);
    final scale = math.max(maxValue, 1.0);
    const pad = 5.0;
    final usableHeight = math.max(size.height - pad * 2, 0.0);
    final usableWidth = math.max(size.width - pad * 2, 0.0);
    Offset point(int i, double value) => Offset(
        pad + (values.length == 1 ? 0 : usableWidth * i / (values.length - 1)),
        pad + usableHeight * (1 - value / scale));
    final guide = Paint()
      ..color = track
      ..strokeWidth = 1;
    final targetY = point(0, target).dy;
    canvas.drawLine(
        Offset(pad, targetY), Offset(size.width - pad, targetY), guide);
    final line = Paint()
      ..color = color
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i < values.length; i++) {
      final value = values[i];
      if (value == null) continue;
      final p = point(i, value);
      if (i > 0 && values[i - 1] != null) {
        canvas.drawLine(point(i - 1, values[i - 1]!), p, line);
      }
      canvas.drawCircle(p, 2.5, line);
    }
  }

  @override
  bool shouldRepaint(covariant _CalorieTrendPainter old) =>
      old.values != values ||
      old.target != target ||
      old.color != color ||
      old.track != track;
}
