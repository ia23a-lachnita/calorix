import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'providers/history_providers.dart';
import '../../shared/models/daily_log.dart';
import '../../shared/providers/plan_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../core/constants/app_constants.dart';

/// A day counts as on-target from this fraction of the kcal goal upward;
/// below it the day renders amber per the handoff status colors.
const _onTargetFraction = 0.85;

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});
  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  bool _isMonthView = false;
  DateTime _selectedDate = DateTime.now();

  DateTime get _weekStart =>
      _dateOnly(_selectedDate.subtract(Duration(days: _selectedDate.weekday - 1)));

  bool get _canGoNext {
    final now = DateTime.now();
    if (_isMonthView) {
      return DateTime(_selectedDate.year, _selectedDate.month)
          .isBefore(DateTime(now.year, now.month));
    }
    final thisWeekStart = _dateOnly(now.subtract(Duration(days: now.weekday - 1)));
    return _weekStart.isBefore(thisWeekStart);
  }

  void _goPrevious() {
    setState(() {
      _selectedDate = _isMonthView
          ? DateTime(_selectedDate.year, _selectedDate.month - 1, 1)
          : _selectedDate.subtract(const Duration(days: 7));
    });
  }

  void _goNext() {
    if (!_canGoNext) return;
    setState(() {
      if (_isMonthView) {
        final next = DateTime(_selectedDate.year, _selectedDate.month + 1, 1);
        final now = DateTime.now();
        _selectedDate =
            next.month == now.month && next.year == now.year ? now : next;
      } else {
        _selectedDate = _selectedDate.add(const Duration(days: 7));
      }
    });
  }

  int get _weekNumber {
    final d = _selectedDate;
    final dayOfYear = d.difference(DateTime(d.year, 1, 1)).inDays + 1;
    return ((dayOfYear - d.weekday + 10) / 7).floor();
  }

  int _computeStreak(List<DailyLog> logs) {
    int streak = 0;
    final today = DateTime.now();
    for (int i = 0; i < logs.length; i++) {
      final log = logs[i];
      if (!log.hasData) break;
      final expected = today.subtract(Duration(days: i));
      if (DateFormat('yyyy-MM-dd').format(log.date) !=
          DateFormat('yyyy-MM-dd').format(expected)) {
        break;
      }
      streak++;
    }
    return streak;
  }

  @override
  Widget build(BuildContext context) {
    final historyAsync = ref.watch(historyProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final logs = historyAsync.valueOrNull ?? [];
    final kcalTarget = (ref.watch(activePlanProvider).valueOrNull?.kcal ??
            AppConstants.defaultKcalTarget)
        .toDouble();

    final weekLogs = _logsForWeek(logs, _weekStart);
    final streak = _computeStreak(logs);

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // Header per cx-screen-history.jsx: eyebrow above the title with
          // week chevrons at the title baseline (no Material AppBar).
          SliverToBoxAdapter(
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'WEEK $_weekNumber · ${DateFormat('MMMM').format(_selectedDate).toUpperCase()}',
                      style: AppTextStyles.labelMono.copyWith(color: muted),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Text(
                            'History',
                            style: AppTextStyles.heading1.copyWith(
                              color: ink,
                              fontSize: 30,
                              letterSpacing: 30 * -0.04,
                              height: 1,
                            ),
                          ),
                        ),
                        GestureDetector(
                          onTap: _goPrevious,
                          child: Icon(Icons.chevron_left, size: 20, color: muted),
                        ),
                        const SizedBox(width: 6),
                        GestureDetector(
                          onTap: _goNext,
                          child: Icon(
                            Icons.chevron_right,
                            size: 20,
                            color: _canGoNext ? ink : muted.withValues(alpha: 0.4),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _CalendarCard(
                  isMonthView: _isMonthView,
                  selectedDate: _selectedDate,
                  logs: logs,
                  kcalTarget: kcalTarget,
                  isDark: isDark,
                  onViewChanged: (month) => setState(() => _isMonthView = month),
                  onDateSelected: (d) => setState(() => _selectedDate = d),
                ),
                const SizedBox(height: 12),
                _WeeklyStats(
                  weekLogs: weekLogs,
                  kcalTarget: kcalTarget,
                  isDark: isDark,
                ),
                const SizedBox(height: 16),
                if (weekLogs.isNotEmpty) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Day log',
                            style: AppTextStyles.heading3.copyWith(color: ink)),
                        if (streak > 0) _StreakPill(streak: streak),
                      ],
                    ),
                  ),
                  ...weekLogs.map((log) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _DayRow(
                          log: log,
                          kcalTarget: kcalTarget,
                          isDark: isDark,
                          onTap: () => context.go(
                              '/history/${DateFormat('yyyy-MM-dd').format(log.date)}'),
                        ),
                      )),
                ] else
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text(
                        'No logged days this week yet.',
                        style: AppTextStyles.bodySmall.copyWith(color: muted),
                      ),
                    ),
                  ),
                const SizedBox(height: 110),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

List<DailyLog> _logsForWeek(List<DailyLog> logs, DateTime weekStart) {
  final weekEnd = weekStart.add(const Duration(days: 7));
  return logs
      .where((log) =>
          !_dateOnly(log.date).isBefore(weekStart) &&
          _dateOnly(log.date).isBefore(weekEnd))
      .toList()
    ..sort((a, b) => b.date.compareTo(a.date));
}

Color? _statusColor(DailyLog? log, double target) {
  if (log == null || !log.hasData) return null;
  final fraction = target > 0 ? log.kcal / target : 0.0;
  return fraction >= _onTargetFraction ? AppColors.green : AppColors.needsReview;
}

// ─── Calendar card ────────────────────────────────────────────────────────────

class _CalendarCard extends StatelessWidget {
  const _CalendarCard({
    required this.isMonthView,
    required this.selectedDate,
    required this.logs,
    required this.kcalTarget,
    required this.isDark,
    required this.onViewChanged,
    required this.onDateSelected,
  });

  final bool isMonthView;
  final DateTime selectedDate;
  final List<DailyLog> logs;
  final double kcalTarget;
  final bool isDark;
  final ValueChanged<bool> onViewChanged;
  final ValueChanged<DateTime> onDateSelected;

  @override
  Widget build(BuildContext context) {
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          width: 0.5,
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  isMonthView
                      ? DateFormat('MMMM yyyy').format(selectedDate).toUpperCase()
                      : 'THIS WEEK',
                  style: AppTextStyles.labelMono.copyWith(color: muted),
                ),
                _ViewToggle(
                  isMonthView: isMonthView,
                  isDark: isDark,
                  onChanged: onViewChanged,
                ),
              ],
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            child: isMonthView
                ? _MonthGrid(
                    selectedDate: selectedDate,
                    logs: logs,
                    kcalTarget: kcalTarget,
                    isDark: isDark,
                    onDateSelected: onDateSelected,
                  )
                : _WeekStrip(
                    selectedDate: selectedDate,
                    logs: logs,
                    kcalTarget: kcalTarget,
                    isDark: isDark,
                    onDateSelected: onDateSelected,
                  ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 14, bottom: 10),
            child: Center(
              child: Container(
                width: 44,
                height: 5,
                decoration: BoxDecoration(
                  color: isDark ? AppColors.borderDark : AppColors.borderLight,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ViewToggle extends StatelessWidget {
  const _ViewToggle({
    required this.isMonthView,
    required this.isDark,
    required this.onChanged,
  });

  final bool isMonthView;
  final bool isDark;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.white.withValues(alpha: 0.04)
            : const Color(0xFFF4F2EE),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          width: 0.5,
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _toggleChip('W', !isMonthView, () => onChanged(false)),
          _toggleChip('M', isMonthView, () => onChanged(true)),
        ],
      ),
    );
  }

  Widget _toggleChip(String label, bool active, VoidCallback onTap) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: active
              ? (isDark ? AppColors.surfaceDark : AppColors.surfaceLight)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          boxShadow: active
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
          label,
          style: AppTextStyles.labelMono.copyWith(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            letterSpacing: 10 * 0.08,
            color: active ? ink : muted,
          ),
        ),
      ),
    );
  }
}

// ─── Week strip ───────────────────────────────────────────────────────────────

class _WeekStrip extends StatelessWidget {
  const _WeekStrip({
    required this.selectedDate,
    required this.logs,
    required this.kcalTarget,
    required this.isDark,
    required this.onDateSelected,
  });

  final DateTime selectedDate;
  final List<DailyLog> logs;
  final double kcalTarget;
  final bool isDark;
  final ValueChanged<DateTime> onDateSelected;

  @override
  Widget build(BuildContext context) {
    final monday =
        _dateOnly(selectedDate.subtract(Duration(days: selectedDate.weekday - 1)));
    final today = _dateOnly(DateTime.now());
    final logByDay = {
      for (final log in logs) DateFormat('yyyy-MM-dd').format(log.date): log,
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
      child: Row(
        children: List.generate(7, (i) {
          final day = monday.add(Duration(days: i));
          final log = logByDay[DateFormat('yyyy-MM-dd').format(day)];
          return Expanded(
            child: _DayPill(
              day: day,
              log: log,
              kcalTarget: kcalTarget,
              isToday: day == today,
              isDark: isDark,
              onTap: () => onDateSelected(day),
            ),
          );
        }),
      ),
    );
  }
}

class _DayPill extends StatelessWidget {
  const _DayPill({
    required this.day,
    required this.log,
    required this.kcalTarget,
    required this.isToday,
    required this.isDark,
    required this.onTap,
  });

  final DateTime day;
  final DailyLog? log;
  final double kcalTarget;
  final bool isToday;
  final bool isDark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final hasData = log?.hasData ?? false;
    final fraction =
        hasData && kcalTarget > 0 ? (log!.kcal / kcalTarget).clamp(0.0, 1.0) : 0.0;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: isToday
              ? AppColors.cyan.withValues(alpha: isDark ? 0.08 : 0.12)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            width: 0.5,
            color: isToday
                ? AppColors.cyan.withValues(alpha: 0.33)
                : Colors.transparent,
          ),
        ),
        child: Column(
          children: [
            Text(
              DateFormat('EEE').format(day).toUpperCase(),
              style: AppTextStyles.labelMono.copyWith(color: muted, fontSize: 9),
            ),
            const SizedBox(height: 6),
            Text(
              '${day.day}',
              style: AppTextStyles.labelMono.copyWith(
                fontSize: 15,
                fontWeight: isToday ? FontWeight.w700 : FontWeight.w600,
                color: hasData || isToday ? ink : muted,
              ),
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: 24,
              height: 24,
              child: CustomPaint(
                painter: _DayRingPainter(
                  fraction: fraction,
                  color: hasData
                      ? (fraction >= _onTargetFraction
                          ? AppColors.green
                          : AppColors.needsReview)
                      : null,
                  isDark: isDark,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayRingPainter extends CustomPainter {
  _DayRingPainter({required this.fraction, required this.color, required this.isDark});

  final double fraction;
  final Color? color;
  final bool isDark;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    const radius = 9.0;

    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..color = isDark
          ? Colors.white.withValues(alpha: 0.07)
          : const Color(0xFF0B0D10).withValues(alpha: 0.07);
    canvas.drawCircle(center, radius, track);

    if (color != null && fraction > 0) {
      final arc = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round
        ..color = color!;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -math.pi / 2,
        2 * math.pi * fraction,
        false,
        arc,
      );
    }
  }

  @override
  bool shouldRepaint(_DayRingPainter old) =>
      old.fraction != fraction || old.color != color || old.isDark != isDark;
}

// ─── Month grid ───────────────────────────────────────────────────────────────

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.selectedDate,
    required this.logs,
    required this.kcalTarget,
    required this.isDark,
    required this.onDateSelected,
  });

  final DateTime selectedDate;
  final List<DailyLog> logs;
  final double kcalTarget;
  final bool isDark;
  final ValueChanged<DateTime> onDateSelected;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final month = DateTime(selectedDate.year, selectedDate.month, 1);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final startOffset = month.weekday - 1;
    final today = _dateOnly(DateTime.now());
    final logByDay = {
      for (final log in logs) DateFormat('yyyy-MM-dd').format(log.date): log,
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Column(
        children: [
          Row(
            children: ['M', 'T', 'W', 'T', 'F', 'S', 'S']
                .map((d) => Expanded(
                      child: Center(
                        child: Text(
                          d,
                          style: AppTextStyles.labelMono.copyWith(
                            fontSize: 9,
                            letterSpacing: 9 * 0.12,
                            color: muted,
                          ),
                        ),
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 4),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              mainAxisSpacing: 2,
              crossAxisSpacing: 2,
              mainAxisExtent: 38,
            ),
            itemCount: startOffset + daysInMonth,
            itemBuilder: (context, index) {
              if (index < startOffset) return const SizedBox.shrink();
              final dayNumber = index - startOffset + 1;
              final date = DateTime(month.year, month.month, dayNumber);
              final isToday = _dateOnly(date) == today;
              final isFuture = _dateOnly(date).isAfter(today);
              final log = logByDay[DateFormat('yyyy-MM-dd').format(date)];
              final dotColor =
                  isToday ? AppColors.green : _statusColor(log, kcalTarget);

              return GestureDetector(
                key: Key('month-day-$dayNumber'),
                onTap: isFuture ? null : () => onDateSelected(date),
                child: Container(
                  decoration: BoxDecoration(
                    color: isToday
                        ? AppColors.cyan.withValues(alpha: isDark ? 0.10 : 0.12)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      width: 0.5,
                      color: isToday
                          ? AppColors.cyan.withValues(alpha: 0.33)
                          : Colors.transparent,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        '$dayNumber',
                        style: AppTextStyles.labelMono.copyWith(
                          fontSize: 11.5,
                          fontWeight: isToday ? FontWeight.w700 : FontWeight.w500,
                          color: isFuture ? muted.withValues(alpha: 0.45) : ink,
                        ),
                      ),
                      const SizedBox(height: 3),
                      if (dotColor != null && !isFuture)
                        Container(
                          key: Key('month-dot-$dayNumber'),
                          width: 4,
                          height: 4,
                          decoration: BoxDecoration(
                            color: dotColor,
                            shape: BoxShape.circle,
                          ),
                        )
                      else
                        const SizedBox(height: 4),
                    ],
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
  const _WeeklyStats({
    required this.weekLogs,
    required this.kcalTarget,
    required this.isDark,
  });

  final List<DailyLog> weekLogs;
  final double kcalTarget;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final loggedDays = weekLogs.where((l) => l.hasData).toList();
    final avgKcal = loggedDays.isEmpty
        ? 0.0
        : loggedDays.fold(0.0, (sum, l) => sum + l.kcal) / loggedDays.length;
    final targetPct = kcalTarget > 0 ? (avgKcal / kcalTarget * 100).round() : 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          width: 0.5,
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('WEEKLY AVERAGE',
                      style: AppTextStyles.labelMono.copyWith(color: muted)),
                  const SizedBox(height: 4),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        NumberFormat('#,###').format(avgKcal.round()),
                        style: AppTextStyles.labelMono.copyWith(
                          fontSize: 26,
                          fontWeight: FontWeight.w600,
                          color: ink,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text('kcal / day',
                          style:
                              AppTextStyles.bodySmall.copyWith(color: muted)),
                    ],
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.green.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.arrow_upward,
                        size: 12, color: AppColors.green),
                    const SizedBox(width: 6),
                    Text(
                      '$targetPct% target',
                      style: AppTextStyles.labelMono.copyWith(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.green,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 84,
            width: double.infinity,
            child: CustomPaint(
              painter: _SparklinePainter(
                weekLogs: weekLogs,
                target: kcalTarget,
                isDark: isDark,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _MiniStat(
                label: 'PROTEIN',
                value: _avg(weekLogs, (l) => l.protein),
                color: AppColors.protein,
                isDark: isDark,
              ),
              const SizedBox(width: 8),
              _MiniStat(
                label: 'CARBS',
                value: _avg(weekLogs, (l) => l.carbs),
                color: AppColors.carbs,
                isDark: isDark,
              ),
              const SizedBox(width: 8),
              _MiniStat(
                label: 'FAT',
                value: _avg(weekLogs, (l) => l.fat),
                color: AppColors.fat,
                isDark: isDark,
              ),
            ],
          ),
        ],
      ),
    );
  }

  static int _avg(List<DailyLog> logs, double Function(DailyLog) pick) {
    final logged = logs.where((l) => l.hasData).toList();
    if (logged.isEmpty) return 0;
    return (logged.fold(0.0, (s, l) => s + pick(l)) / logged.length).round();
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.label,
    required this.value,
    required this.color,
    required this.isDark,
  });

  final String label;
  final int value;
  final Color color;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: isDark
              ? Colors.white.withValues(alpha: 0.03)
              : const Color(0xFFF8F6F1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            width: 0.5,
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 5,
                  height: 5,
                  decoration:
                      BoxDecoration(color: color, shape: BoxShape.circle),
                ),
                const SizedBox(width: 5),
                Flexible(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: AppTextStyles.labelMono
                        .copyWith(color: muted, fontSize: 9.5),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  '$value',
                  style: AppTextStyles.labelMono.copyWith(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: ink,
                  ),
                ),
                const SizedBox(width: 3),
                Text('g/d',
                    style: AppTextStyles.bodySmall
                        .copyWith(color: muted, fontSize: 10.5)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SparklinePainter extends CustomPainter {
  _SparklinePainter({
    required this.weekLogs,
    required this.target,
    required this.isDark,
  });

  final List<DailyLog> weekLogs;
  final double target;
  final bool isDark;

  @override
  void paint(Canvas canvas, Size size) {
    const padX = 8.0;
    const padY = 8.0;
    final logByWeekday = <int, DailyLog>{
      for (final log in weekLogs) log.date.weekday: log,
    };
    final fractions = List.generate(7, (i) {
      final log = logByWeekday[i + 1];
      if (log == null || !log.hasData || target <= 0) return 0.0;
      return (log.kcal / target).clamp(0.0, 1.15);
    });

    double yFor(double fraction) =>
        size.height - padY - fraction * (size.height - padY * 2) / 1.15;

    // Dashed target line + annotation.
    final targetY = yFor(1.0);
    final dash = Paint()
      ..color = isDark
          ? Colors.white.withValues(alpha: 0.15)
          : const Color(0xFF0B0D10).withValues(alpha: 0.15)
      ..strokeWidth = 1;
    for (double x = padX; x < size.width - padX; x += 8) {
      canvas.drawLine(Offset(x, targetY), Offset(x + 3, targetY), dash);
    }
    final label = TextPainter(
      text: TextSpan(
        text: '${target.round()} KCAL',
        style: TextStyle(
          fontFamily: 'GeistMono',
          fontSize: 9,
          letterSpacing: 9 * 0.08,
          color: isDark
              ? Colors.white.withValues(alpha: 0.45)
              : const Color(0xFF7B8088),
        ),
      ),
      textDirection: ui.TextDirection.ltr,
    )..layout();
    label.paint(
        canvas, Offset(size.width - padX - label.width, targetY - 4 - label.height));

    final stepW = (size.width - padX * 2) / 6;
    final points = List.generate(
        7, (i) => Offset(padX + i * stepW, yFor(fractions[i])));

    // Area fill under the line.
    final area = Path()..moveTo(points.first.dx, points.first.dy);
    for (final p in points.skip(1)) {
      area.lineTo(p.dx, p.dy);
    }
    area
      ..lineTo(points.last.dx, size.height - padY)
      ..lineTo(points.first.dx, size.height - padY)
      ..close();
    canvas.drawPath(
      area,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.cyan.withValues(alpha: 0.20),
            AppColors.cyan.withValues(alpha: 0.0),
          ],
        ).createShader(Offset.zero & size),
    );

    final line = Paint()
      ..color = AppColors.cyan
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (final p in points.skip(1)) {
      path.lineTo(p.dx, p.dy);
    }
    canvas.drawPath(path, line);

    // Point markers on logged days.
    final bgFill = Paint()
      ..color = isDark ? AppColors.surfaceDark : AppColors.surfaceLight;
    final stroke = Paint()
      ..color = AppColors.cyan
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;
    for (var i = 0; i < 7; i++) {
      if (fractions[i] <= 0) continue;
      canvas.drawCircle(points[i], 2.5, bgFill);
      canvas.drawCircle(points[i], 2.5, stroke);
    }
  }

  @override
  bool shouldRepaint(_SparklinePainter old) =>
      old.weekLogs != weekLogs || old.target != target || old.isDark != isDark;
}

// ─── Day log ─────────────────────────────────────────────────────────────────

class _StreakPill extends StatelessWidget {
  const _StreakPill({required this.streak});

  final int streak;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.green.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.local_fire_department,
              size: 11, color: AppColors.green),
          const SizedBox(width: 4),
          Text(
            '$streak DAY STREAK',
            style: AppTextStyles.labelMono.copyWith(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              color: AppColors.green,
            ),
          ),
        ],
      ),
    );
  }
}

class _DayRow extends StatelessWidget {
  const _DayRow({
    required this.log,
    required this.kcalTarget,
    required this.isDark,
    required this.onTap,
  });

  final DailyLog log;
  final double kcalTarget;
  final bool isDark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ink = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;
    final pct = kcalTarget > 0 ? log.kcal / kcalTarget : 0.0;
    final ringColor =
        pct >= _onTargetFraction ? AppColors.green : AppColors.needsReview;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            width: 0.5,
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
          ),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 40,
              height: 40,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CustomPaint(
                    size: const Size(40, 40),
                    painter: _ScoreRingPainter(
                      fraction: pct.clamp(0.0, 1.0),
                      color: ringColor,
                      isDark: isDark,
                    ),
                  ),
                  Text(
                    '${(pct * 100).clamp(0, 100).round()}',
                    style: AppTextStyles.labelMono.copyWith(
                      color: ink,
                      fontSize: 9.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        DateFormat('EEE · MMM d').format(log.date),
                        style: AppTextStyles.labelLarge.copyWith(
                          color: ink,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            NumberFormat('#,###').format(log.kcal.round()),
                            style: AppTextStyles.labelMono.copyWith(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: ink,
                            ),
                          ),
                          const SizedBox(width: 2),
                          Text('kcal',
                              style: AppTextStyles.bodySmall
                                  .copyWith(color: muted, fontSize: 10)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        '${log.entryCount} meals',
                        style: AppTextStyles.labelMono
                            .copyWith(color: muted, fontSize: 10.5),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        width: 3,
                        height: 3,
                        decoration: BoxDecoration(
                          color: muted.withValues(alpha: 0.5),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      _MacroPip(value: log.protein, color: AppColors.protein),
                      const SizedBox(width: 8),
                      _MacroPip(value: log.carbs, color: AppColors.carbs),
                      const SizedBox(width: 8),
                      _MacroPip(value: log.fat, color: AppColors.fat),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            Icon(Icons.chevron_right, color: muted, size: 14),
          ],
        ),
      ),
    );
  }
}

class _ScoreRingPainter extends CustomPainter {
  _ScoreRingPainter({
    required this.fraction,
    required this.color,
    required this.isDark,
  });

  final double fraction;
  final Color color;
  final bool isDark;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    const radius = 16.0;

    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..color = isDark
          ? Colors.white.withValues(alpha: 0.06)
          : const Color(0xFF0B0D10).withValues(alpha: 0.05);
    canvas.drawCircle(center, radius, track);

    if (fraction > 0) {
      final arc = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round
        ..color = color;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -math.pi / 2,
        2 * math.pi * fraction,
        false,
        arc,
      );
    }
  }

  @override
  bool shouldRepaint(_ScoreRingPainter old) =>
      old.fraction != fraction || old.color != color;
}

class _MacroPip extends StatelessWidget {
  const _MacroPip({required this.value, required this.color});

  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 5,
            height: 5,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 3),
          Text(
            '${value.round()}g',
            style: AppTextStyles.labelMono.copyWith(color: color, fontSize: 10),
          ),
        ],
      );
}
