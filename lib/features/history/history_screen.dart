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

  @override
  Widget build(BuildContext context) {
    final historyAsync = ref.watch(historyProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            floating: true,
            title: Text('History', style: AppTextStyles.heading1.copyWith(color: textColor)),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                // Calendar card with drag
                GestureDetector(
                  onVerticalDragEnd: (details) {
                    if (details.primaryVelocity! < 0) {
                      setState(() => _isMonthView = false);
                    } else {
                      setState(() => _isMonthView = true);
                    }
                  },
                  child: Card(
                    child: Column(
                      children: [
                        const SizedBox(height: 12),
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
                                ),
                        ),
                        // Drag bar
                        GestureDetector(
                          onVerticalDragEnd: (details) {
                            if (details.primaryVelocity! < 0) {
                              setState(() => _isMonthView = false);
                            } else {
                              setState(() => _isMonthView = true);
                            }
                          },
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
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
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _WeekStrip extends StatelessWidget {
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateSelected;
  const _WeekStrip({required this.selectedDate, required this.onDateSelected});

  @override
  Widget build(BuildContext context) {
    final monday = selectedDate.subtract(Duration(days: selectedDate.weekday - 1));
    final days = List.generate(7, (i) => monday.add(Duration(days: i)));
    final today = DateTime.now();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: days.map((day) {
          final isToday = DateFormat('yyyy-MM-dd').format(day) ==
              DateFormat('yyyy-MM-dd').format(today);
          final isSelected = DateFormat('yyyy-MM-dd').format(day) ==
              DateFormat('yyyy-MM-dd').format(selectedDate);
          return _DayPill(
            day: day,
            isToday: isToday,
            isSelected: isSelected,
            onTap: () => onDateSelected(day),
          );
        }).toList(),
      ),
    );
  }
}

class _DayPill extends StatelessWidget {
  final DateTime day;
  final bool isToday;
  final bool isSelected;
  final VoidCallback onTap;

  const _DayPill({
    required this.day,
    required this.isToday,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Text(
            DateFormat('E').format(day).substring(0, 1),
            style: AppTextStyles.labelSmall.copyWith(
                color: isToday ? AppColors.cyan : AppColors.textSecondaryLight),
          ),
          const SizedBox(height: 4),
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isToday ? AppColors.cyan.withAlpha(20) : Colors.transparent,
              border: Border.all(
                color: isToday ? AppColors.cyan : Colors.transparent,
                width: 1.5,
              ),
            ),
            child: Center(
              child: Text(
                day.day.toString(),
                style: AppTextStyles.labelLarge.copyWith(
                    color: isToday ? AppColors.cyan : AppColors.textPrimaryLight,
                    fontWeight: isToday ? FontWeight.w700 : FontWeight.w400),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

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
                    child: Center(
                        child: Text(d, style: AppTextStyles.labelSmall))))
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
                    Text('Weekly Average',
                        style: AppTextStyles.labelSmall.copyWith(
                            color: isDark
                                ? AppColors.textSecondaryDark
                                : AppColors.textSecondaryLight)),
                    Text('${avgKcal.round()} kcal/day',
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
                      child: Text('$targetPct% target',
                          style: AppTextStyles.labelSmall.copyWith(color: AppColors.green)),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.green.withAlpha(20),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text('🔥 $streak days',
                          style: AppTextStyles.labelSmall.copyWith(color: AppColors.green)),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),
            _Sparkline(logs: weekLogs),
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

    // Target line
    final targetY = size.height - (size.height * target / maxVal);
    canvas.drawLine(Offset(0, targetY), Offset(size.width, targetY), targetPaint);

    // Sparkline
    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (int i = 1; i < points.length; i++) {
      path.lineTo(points[i].dx, points[i].dy);
    }
    canvas.drawPath(path, linePaint);

    // Today dot
    if (points.isNotEmpty) {
      canvas.drawCircle(points.last, 4, Paint()..color = AppColors.cyan);
    }
  }

  @override
  bool shouldRepaint(_SparklinePainter old) => old.logs != logs;
}

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
              // Completion ring
              SizedBox(
                width: 28,
                height: 28,
                child: CustomPaint(
                  painter: _SmallRingPainter(fraction: pct, color: ringColor),
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
