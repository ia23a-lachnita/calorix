import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_text_styles.dart';
import '../debug/ui_diff/ui_diff_anchor.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  void _onTap(int index) {
    widget.navigationShell.goBranch(
      index,
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final currentIndex = widget.navigationShell.currentIndex;
    final floating = currentIndex == 2;

    return Scaffold(
      extendBody: true,
      body: widget.navigationShell,
      bottomNavigationBar: UiDiffAnchor(
        id: 'today.bottomNav',
        label: 'Bottom navigation bar',
        child: _CalorixBottomNav(
          currentIndex: currentIndex,
          onTap: _onTap,
          isDark: isDark,
          floating: floating,
        ),
      ),
    );
  }
}

class _CalorixBottomNav extends StatelessWidget {
  const _CalorixBottomNav({
    required this.currentIndex,
    required this.onTap,
    required this.isDark,
    this.floating = false,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final bool isDark;
  final bool floating;

  static const _items = [
    _NavItem(icon: _NavIconType.today, label: 'Today', key: 'nav-item-today'),
    _NavItem(
        icon: _NavIconType.history, label: 'History', key: 'nav-item-history'),
    _NavItem(icon: _NavIconType.scan, label: 'Scan', key: 'nav-item-scan'),
    _NavItem(icon: _NavIconType.goals, label: 'Goals', key: 'nav-item-goals'),
    _NavItem(icon: _NavIconType.ai, label: 'AI', key: 'nav-item-ai'),
  ];

  // Scan uses same geometry with translucent camera material.
  @override
  Widget build(BuildContext context) {
    final activeColor =
        isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final inactiveColor = floating
        ? (isDark
            ? const Color(0xFFF2F3F5).withValues(alpha: 0.55)
            : const Color(0xFF0B0D10).withValues(alpha: 0.52))
        : (isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight);

    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    final bottomZone = math.max(36.0, bottomInset + 26.0);
    final totalHeight = 14.0 + 46.0 + bottomZone;

    final backdropColor = floating
        ? (isDark
            ? const Color(0xFF0C0F13).withValues(alpha: 0.28)
            : Colors.white.withValues(alpha: 0.38))
        : (isDark
            ? AppColors.navBarDark.withValues(alpha: 0.92)
            : Colors.white.withValues(alpha: 0.92));

    final topBorderColor = floating
        ? (isDark
            ? Colors.white.withValues(alpha: 0.08)
            : const Color(0xFF0B0D10).withValues(alpha: 0.08))
        : (isDark ? AppColors.borderDark : AppColors.borderLight);

    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.0,
      child: SizedBox(
        key: const Key('today-bottom-nav'),
        height: totalHeight,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              key: const Key('today-bottom-nav-glass'),
              child: ClipRect(
                child: BackdropFilter(
                  filter: ui.ImageFilter.blur(sigmaX: 8, sigmaY: 8),
                  child: Container(
                    decoration: BoxDecoration(
                      color: backdropColor,
                      border: Border(
                        top: BorderSide(
                          color: topBorderColor,
                          width: 0.5,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: isDark
                      ? AppColors.topHighlightDark
                      : AppColors.borderLight,
                ),
              ),
            ),
            Positioned(
              top: 14,
              left: 6,
              right: 6,
              height: 46,
              child: Row(
                children: List.generate(_items.length, (index) {
                  final item = _items[index];
                  final isActive = currentIndex == index;
                  return Expanded(
                    child: _NavButton(
                      key: ValueKey(item.key),
                      icon: item.icon,
                      label: item.label,
                      isActive: isActive,
                      activeColor: activeColor,
                      inactiveColor: inactiveColor,
                      onTap: () => onTap(index),
                    ),
                  );
                }),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavItem {
  final _NavIconType icon;
  final String label;
  final String key;
  const _NavItem({required this.icon, required this.label, required this.key});
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    super.key,
    required this.icon,
    required this.label,
    required this.isActive,
    required this.activeColor,
    required this.inactiveColor,
    required this.onTap,
  });

  final _NavIconType icon;
  final String label;
  final bool isActive;
  final Color activeColor;
  final Color inactiveColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = isActive ? activeColor : inactiveColor;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _CalorixNavIcon(
            type: icon,
            color: color,
            strokeWidth: isActive ? 2.0 : 1.6,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: AppTextStyles.labelSmall.copyWith(
              color: color,
              fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 2),
          Opacity(
            opacity: isActive ? 1.0 : 0.0,
            child: Container(
              width: 4,
              height: 4,
              decoration: const BoxDecoration(
                color: AppColors.cyan,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

enum _NavIconType { today, history, scan, goals, ai }

class _CalorixNavIcon extends StatelessWidget {
  const _CalorixNavIcon({
    required this.type,
    required this.color,
    this.strokeWidth = 1.6,
  });

  final _NavIconType type;
  final Color color;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      key: Key('nav-icon-${type.name}'),
      dimension: 22,
      child: CustomPaint(
        size: const Size.square(22),
        painter: _CalorixNavIconPainter(
          type: type,
          color: color,
          strokeWidth: strokeWidth,
        ),
      ),
    );
  }
}

class _CalorixNavIconPainter extends CustomPainter {
  _CalorixNavIconPainter({
    required this.type,
    required this.color,
    required this.strokeWidth,
  });

  final _NavIconType type;
  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 24;
    canvas.save();
    canvas.scale(scale, scale);

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..color = color
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final fill = Paint()
      ..style = PaintingStyle.fill
      ..color = color;

    switch (type) {
      case _NavIconType.today:
        final path = Path()
          ..moveTo(3, 17)
          ..lineTo(21, 17)
          ..moveTo(6, 14)
          ..arcToPoint(
            const Offset(18, 14),
            radius: const Radius.circular(6),
            clockwise: true,
          )
          ..moveTo(12, 5)
          ..lineTo(12, 7)
          ..moveTo(5.6, 7.6)
          ..lineTo(7, 9)
          ..moveTo(18.4, 7.6)
          ..lineTo(17, 9);
        canvas.drawPath(path, paint);
        break;
      case _NavIconType.history:
        final path = Path()
          ..moveTo(4, 12)
          ..arcToPoint(
            const Offset(6.5, 6.2),
            radius: const Radius.circular(8),
            largeArc: true,
            clockwise: false,
          )
          ..moveTo(4, 4)
          ..lineTo(4, 7.5)
          ..lineTo(7.5, 7.5)
          ..moveTo(12, 8)
          ..lineTo(12, 12)
          ..lineTo(15, 14);
        canvas.drawPath(path, paint);
        break;
      case _NavIconType.scan:
        final path = Path()
          ..moveTo(2.5, 12)
          ..cubicTo(2.5, 12, 6.1, 6, 12, 6)
          ..cubicTo(17.9, 6, 21.5, 12, 21.5, 12)
          ..cubicTo(21.5, 12, 17.9, 18, 12, 18)
          ..cubicTo(6.1, 18, 2.5, 12, 2.5, 12);
        canvas.drawPath(path, paint);
        canvas.drawCircle(const Offset(12, 12), 3.2, paint);
        canvas.drawCircle(const Offset(13, 11), 0.9, fill);
        break;
      case _NavIconType.goals:
        canvas.drawCircle(const Offset(11, 13), 8, paint);
        canvas.drawCircle(const Offset(11, 13), 4, paint);
        final path = Path()
          ..moveTo(11, 13)
          ..lineTo(20.5, 3.5)
          ..moveTo(16.5, 3.5)
          ..lineTo(20.5, 3.5)
          ..lineTo(20.5, 7.5);
        canvas.drawPath(path, paint);
        canvas.drawCircle(const Offset(11, 13), 1.1, fill);
        break;
      case _NavIconType.ai:
        final path = Path()
          ..moveTo(12, 3.5)
          ..lineTo(13.3, 9.5)
          ..lineTo(19.5, 11)
          ..lineTo(13.3, 12.5)
          ..lineTo(12, 18.5)
          ..lineTo(10.7, 12.5)
          ..lineTo(4.5, 11)
          ..lineTo(10.7, 9.5)
          ..close()
          ..moveTo(19, 17.4)
          ..lineTo(19.7, 19.4)
          ..lineTo(22, 20)
          ..lineTo(19.7, 20.6)
          ..lineTo(19, 22.7)
          ..lineTo(18.3, 20.6)
          ..lineTo(16, 20)
          ..lineTo(18.3, 19.4)
          ..close();
        canvas.drawPath(path, fill);
        break;
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_CalorixNavIconPainter old) =>
      old.type != type || old.color != color || old.strokeWidth != strokeWidth;
}
