import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'providers/history_providers.dart';
import '../../shared/models/daily_log.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/constants/app_constants.dart';

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});
  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  bool _isMonthView = false;
  DateTime _selectedDate = DateTime.now();

  bool get _canGoNextWeek {
    final now = DateTime.now();
    final weekStart = _selectedDate.subtract(Duration(days: _selectedDate.weekday - 1));
    final thisWeekStart = now.subtract(Duration(days: now.weekday - 1));
    return weekStart.isBefore(
        DateTime(thisWeekStart.year, thisWeekStart.month, thisWeekStart.day));
  }

  int get _weekNumber {
    final d = _selectedDate;
    final dayOfYear = d.difference(DateTime(d.year, 1, 1)).inDays + 1;
    return ((dayOfYear - d.weekday + 10) / 7).floor();
  }

  String get _monthName => DateFormat('MMMM').format(_selectedDate).toUpperCase();

  @override
  Widget build(BuildContext context) {
    final historyAsync = ref.watch(historyProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final logs = historyAsync.valueOrNull ?? [];

    final subtextColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            floating: true,
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('History', style: AppTextStyles.heading1.copyWith(color: textColor)),
                Text(
                  'WEEK $_weekNumber · $_monthName',
                  style: AppTextStyles.labelMono.copyWith(color: subtextColor, fontSize: 10),
                ),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.chevron_left, size: 20),
                onPressed: () => setState(() =>
                    _selectedDate = _selectedDate.subtract(const Duration(days: 7))),
                color: subtextColor,
              ),
              IconButton(
                icon: const Icon(Icons.chevron_right, size: 20),
                onPressed: _canGoNextWeek
                    ? () => setState(() =>
                        _selectedDate = _selectedDate.add(const Duration(days: 7)))
                    : null,
                color: subtextColor,
              ),
              const SizedBox(width: 4),
            ],
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Calendar card — W/M toggle buttons control the view; drag gesture removed
                Card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header: THIS WEEK label + W/M toggle
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 14, 8, 0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Flexible(
                              child: Text(
                                _isMonthView ? 'THIS MONTH' : 'THIS WEEK',
                                style: AppTextStyles.labelMono.copyWith(
                                  color: isDark
                                      ? AppColors.textSecondaryDark
                                      : AppColors.textSecondaryLight,
                                ),
                              ),
                            ),
                            Row(
                              children: [
                                _ViewToggleButton(
                                  label: 'W',
                                  isActive: !_isMonthView,
                                  onTap: () => setState(() => _isMonthView = false),
                                  isDark: isDark,
                                ),
                                const SizedBox(width: 4),
                                _ViewToggleButton(
                                  label: 'M',
                                  isActive: _isMonthView,
                                  onTap: () => setState(() => _isMonthView = true),
                                  isDark: isDark,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      AnimatedSize(
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeInOut,
                        child: _isMonthView
                            ? _MonthGrid(
                                selectedDate: _selectedDate,
                                onDateSelected: (d) =>
                                    setState(() => _selectedDate = d),
                              )
                            : _WeekStrip(
                                selectedDate: _selectedDate,
                                onDateSelected: (d) =>
                                    setState(() => _selectedDate = d),
                                logs: logs,
                              ),
                      ),
                      // Drag bar
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Center(
                          child: Container(
                            width: 36,
                            height: 4,
                            decoration: BoxDecoration(
                              color: AppColors.borderLight,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Weekly stats
                historyAsync.when(
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                  data: (logs) => _WeeklyStats(logs: logs, isDark: isDark),
                ),
                const SizedBox(height: 16),

                // Day rows
                historyAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Text('Error: $e'),
                  data: (logs) => Column(
                    children: logs
                        .map((log) => Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: _DayRow(
                                log: log,
                                isDark: isDark,
                                onTap: () => context.go(
                                    '/history/${DateFormat('yyyy-MM-dd').format(log.date)}'),
                              ),
                            ))
                        .toList(),
                  ),
                ),
                const SizedBox(height: 80),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Toggle button ────────────────────────────────────────────────────────────

class _ViewToggleButton extends StatelessWidget {
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final bool isDark;

  const _ViewToggleButton({
    required this.label,
    required this.isActive,
    required this.onTap,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 28,
        height: 24,
        decoration: BoxDecoration(
          color: isActive ? AppColors.cyan.withAlpha(30) : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: isActive ? AppColors.cyan : Colors.transparent,
            width: 1,
          ),
        ),
        child: Center(
          child: Text(
            label,
            style: AppTextStyles.labelSmall.copyWith(
              color: isActive
                  ? AppColors.cyan
                  : (isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight),
              fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Week strip ───────────────────────────────────────────────────────────────

class _WeekStrip extends StatelessWidget {
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateSelected;
  final List<DailyLog> logs;

  const _WeekStrip({
    required this.selectedDate,
    required this.onDateSelected,
    required this.logs,
  });

  @override
  Widget build(BuildContext context) {
    final monday = selectedDate.subtract(Duration(days: selectedDate.weekday - 1));
    final days = List.generate(7, (i) => monday.add(Duration(days: i)));
    final today = DateTime.now();

    final logMap = <String, double>{};
    for (final log in logs) {
      final key =
          '${log.date.year}-${log.date.month.toString().padLeft(2, '0')}-${log.date.day.toString().padLeft(2, '0')}';
      logMap[key] = log.kcal;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: days.map((day) {
          final dateStr = DateFormat('yyyy-MM-dd').format(day);
          final isToday = dateStr == DateFormat('yyyy-MM-dd').format(today);
          final isSelected =
              dateStr == DateFormat('yyyy-MM-dd').format(selectedDate);
          final key =
              '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
          final kcal = logMap[key] ?? 0.0;
          const target = AppConstants.defaultKcalTarget;
          final fraction =
              target > 0 ? (kcal / target).clamp(0.0, 1.0) : 0.0;
          return _DayPill(
            day: day,
            isToday: isToday,
            isSelected: isSelected,
            onTap: () => onDateSelected(day),
            completionFraction: fraction,
          );
        }).toList(),
      ),
    );
  }
}

// ─── Day pill ─────────────────────────────────────────────────────────────────

class _DayPill extends StatelessWidget {
  final DateTime day;
  final bool isToday;
  final bool isSelected;
  final VoidCallback onTap;
  final double completionFraction;

  const _DayPill({
    required this.day,
    required this.isToday,
    required this.isSelected,
    required this.onTap,
    this.completionFraction = 0.0,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Text(
            DateFormat('EEE').format(day).substring(0, 3).toUpperCase(),
            style: AppTextStyles.labelSmall.copyWith(
                color: isToday
                    ? AppColors.cyan
                    : (isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight),
                fontSize: 9),
          ),
          const SizedBox(height: 4),
          SizedBox(
            width: 36,
            height: 36,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(
                  size: const Size(36, 36),
                  painter: _DayRingPainter(
                    fraction: completionFraction,
                    isToday: isToday,
                  ),
                ),
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isToday ? AppColors.cyan.withAlpha(20) : Colors.transparent,
                  ),
                  child: Center(
                    child: Text(
                      day.day.toString(),
                      style: AppTextStyles.labelLarge.copyWith(
                        color: isToday
                            ? AppColors.cyan
                            : (isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight),
                        fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DayRingPainter extends CustomPainter {
  final double fraction;
  final bool isToday;
  _DayRingPainter({required this.fraction, required this.isToday});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 1;

    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = AppColors.cyan.withAlpha(40);

    canvas.drawCircle(center, radius, trackPaint);

    if (fraction > 0) {
      final fillColor = fraction >= 0.85 ? AppColors.green : AppColors.cyan;
      final fillPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..color = fillColor;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -math.pi / 2,
        2 * math.pi * fraction,
        false,
        fillPaint,
      );
    }
  }

  @override
  bool shouldRepaint(_DayRingPainter old) =>
      old.fraction != fraction || old.isToday != isToday;
}

// ─── Month grid ───────────────────────────────────────────────────────────────

class _MonthGrid extends StatelessWidget {
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateSelected;
  const _MonthGrid({required this.selectedDate, required this.onDateSelected});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final firstDay = DateTime(now.year, now.month, 1);
    final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
    final startOffset = firstDay.weekday - 1;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                .map((d) => SizedBox(
                    width: 36,
                    child: Center(child: Text(d, style: AppTextStyles.labelSmall))))
                .toList(),
          ),
          const SizedBox(height: 8),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 7, mainAxisSpacing: 4, crossAxisSpacing: 4),
            itemCount: startOffset + daysInMonth,
            itemBuilder: (context, index) {
              if (index < startOffset) return const SizedBox.shrink();
              final day = index - startOffset + 1;
              final date = DateTime(now.year, now.month, day);
              final isToday = day == now.day;
              final isFuture = date.isAfter(now);
              return Opacity(
                opacity: isFuture ? 0.45 : 1.0,
                child: GestureDetector(
                  onTap: isFuture ? null : () => onDateSelected(date),
                  child: Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: isToday
                          ? Border.all(color: AppColors.cyan, width: 1.5)
                          : null,
                    ),
                    child: Center(
                      child: Text(
                        day.toString(),
                        style: AppTextStyles.labelSmall.copyWith(
                            color: isToday
                                ? AppColors.cyan
                                : AppColors.textPrimaryLight),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

// ─── Weekly stats ─────────────────────────────────────────────────────────────

class _WeeklyStats extends StatelessWidget {
  final List<DailyLog> logs;
  final bool isDark;
  const _WeeklyStats({required this.logs, required this.isDark});

  @override
  Widget build(BuildContext context) {
    if (logs.isEmpty) return const SizedBox.shrink();
    final weekLogs = logs.take(7).toList();
    final avgKcal = weekLogs.isEmpty
        ? 0.0
        : weekLogs.fold(0.0, (sum, l) => sum + l.kcal) / weekLogs.length;
    final targetPct = AppConstants.defaultKcalTarget > 0
        ? (avgKcal / AppConstants.defaultKcalTarget * 100).round()
        : 0;

    final streak = _computeStreak(logs);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        'WEEKLY AVERAGE',
                        style: AppTextStyles.labelMono.copyWith(
                            color: isDark
                                ? AppColors.textSecondaryDark
                                : AppColors.textSecondaryLight)),
                    Text('${NumberFormat('#,###').format(avgKcal.round())} kcal/day',
                        style: AppTextStyles.heading3.copyWith(
                            color: isDark
                                ? AppColors.textPrimaryDark
                                : AppColors.textPrimaryLight)),
                  ],
                ),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.green.withAlpha(30),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text('↑ $targetPct% target',
                          style:
                              AppTextStyles.labelSmall.copyWith(color: AppColors.green)),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.green.withAlpha(20),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text('🔥 $streak DAY STREAK',
                          style:
                              AppTextStyles.labelSmall.copyWith(color: AppColors.green)),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),
            _Sparkline(logs: weekLogs),
            const SizedBox(height: 12),
            _MacroAverageRow(logs: weekLogs, isDark: isDark),
          ],
        ),
      ),
    );
  }

  int _computeStreak(List<DailyLog> logs) {
    int streak = 0;
    final today = DateTime.now();
    for (int i = 0; i < logs.length; i++) {
      final expected = today.subtract(Duration(days: i));
      final log = logs.length > i ? logs[i] : null;
      if (log == null || !log.hasData) break;
      final logDate = log.date;
      if (DateFormat('yyyy-MM-dd').format(logDate) !=
          DateFormat('yyyy-MM-dd').format(expected)) {
        break;
      }
      streak++;
    }
    return streak;
  }
}

// ─── Macro averages ───────────────────────────────────────────────────────────

class _MacroAverageRow extends StatelessWidget {
  final List<DailyLog> logs;
  final bool isDark;
  const _MacroAverageRow({required this.logs, required this.isDark});

  @override
  Widget build(BuildContext context) {
    if (logs.isEmpty) return const SizedBox.shrink();
    final avgProtein = logs.fold(0.0, (s, l) => s + l.protein) / logs.length;
    final avgCarbs = logs.fold(0.0, (s, l) => s + l.carbs) / logs.length;
    final avgFat = logs.fold(0.0, (s, l) => s + l.fat) / logs.length;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceAround,
      children: [
        _MacroChip(
            label: 'PROTEIN', value: avgProtein, color: AppColors.protein, isDark: isDark),
        _MacroChip(
            label: 'CARBS', value: avgCarbs, color: AppColors.carbs, isDark: isDark),
        _MacroChip(label: 'FAT', value: avgFat, color: AppColors.fat, isDark: isDark),
      ],
    );
  }
}

class _MacroChip extends StatelessWidget {
  final String label;
  final double value;
  final Color color;
  final bool isDark;
  const _MacroChip(
      {required this.label,
      required this.value,
      required this.color,
      required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: AppTextStyles.labelSmall.copyWith(
                color: isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight,
                fontSize: 9,
                letterSpacing: 0.6,
              ),
            ),
            Text(
              '${value.round()}g/d',
              style: AppTextStyles.labelLarge.copyWith(color: color),
            ),
          ],
        ),
      ],
    );
  }
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

class _Sparkline extends StatelessWidget {
  final List<DailyLog> logs;
  const _Sparkline({required this.logs});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 60,
      child: CustomPaint(
        painter: _SparklinePainter(
          logs: logs,
          target: AppConstants.defaultKcalTarget.toDouble(),
        ),
        size: Size.infinite,
      ),
    );
  }
}

class _SparklinePainter extends CustomPainter {
  final List<DailyLog> logs;
  final double target;
  _SparklinePainter({required this.logs, required this.target});

  @override
  void paint(Canvas canvas, Size size) {
    if (logs.isEmpty) return;
    final values = List.generate(7, (i) => i < logs.length ? logs[i].kcal : 0.0);
    final maxVal = values.reduce(math.max).clamp(target, double.infinity);

    final linePaint = Paint()
      ..color = AppColors.cyan
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final targetPaint = Paint()
      ..color = AppColors.textSecondaryLight.withAlpha(80)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    final points = <Offset>[];
    for (int i = 0; i < 7; i++) {
      final x = size.width * i / 6;
      final y = size.height - (size.height * values[i] / maxVal);
      points.add(Offset(x, y));
    }

    final targetY = size.height - (size.height * target / maxVal);
    canvas.drawLine(Offset(0, targetY), Offset(size.width, targetY), targetPaint);

    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (int i = 1; i < points.length; i++) {
      path.lineTo(points[i].dx, points[i].dy);
    }
    canvas.drawPath(path, linePaint);

    if (points.isNotEmpty) {
      canvas.drawCircle(points.last, 4, Paint()..color = AppColors.cyan);
    }
  }

  @override
  bool shouldRepaint(_SparklinePainter old) => old.logs != logs;
}

// ─── Day row ─────────────────────────────────────────────────────────────────

class _DayRow extends StatelessWidget {
  final DailyLog log;
  final bool isDark;
  final VoidCallback onTap;
  const _DayRow({required this.log, required this.isDark, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final subtextColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final pct = AppConstants.defaultKcalTarget > 0
        ? log.kcal / AppConstants.defaultKcalTarget
        : 0.0;
    final ringColor = pct >= 0.85 ? AppColors.green : AppColors.needsReview;

    return GestureDetector(
      onTap: onTap,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    DateFormat('EEE, MMM d').format(log.date),
                    style: AppTextStyles.labelLarge.copyWith(color: textColor),
                  ),
                  Text(
                    '${log.entryCount} meals',
                    style: AppTextStyles.bodySmall.copyWith(color: subtextColor),
                  ),
                ],
              ),
              const Spacer(),
              Text('${log.kcal.round()} kcal',
                  style: AppTextStyles.macroGrams.copyWith(color: textColor)),
              const SizedBox(width: 12),
              SizedBox(
                width: 36,
                height: 36,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    CustomPaint(
                      size: const Size(36, 36),
                      painter: _SmallRingPainter(
                          fraction: pct.clamp(0.0, 1.0), color: ringColor),
                    ),
                    Text(
                      '${(pct * 100).clamp(0, 100).round()}',
                      style: AppTextStyles.labelSmall.copyWith(
                        color: ringColor,
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right, color: subtextColor, size: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _SmallRingPainter extends CustomPainter {
  final double fraction;
  final Color color;
  _SmallRingPainter({required this.fraction, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 2;

    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..color = color.withAlpha(30);
    canvas.drawCircle(center, radius, trackPaint);

    if (fraction > 0) {
      final fillPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round
        ..color = color;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -math.pi / 2,
        2 * math.pi * fraction.clamp(0.0, 1.0),
        false,
        fillPaint,
      );
    }
  }

  @override
  bool shouldRepaint(_SmallRingPainter old) => old.fraction != fraction;
}
