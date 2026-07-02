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
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final bool isDark;

  static const _items = [
    _NavItem(icon: _NavIconType.today, label: 'Today'),
    _NavItem(icon: _NavIconType.history, label: 'History'),
    _NavItem(icon: _NavIconType.scan, label: 'Scan'), // FAB
    _NavItem(icon: _NavIconType.goals, label: 'Goals'),
    _NavItem(icon: _NavIconType.ai, label: 'AI'),
  ];

  @override
  Widget build(BuildContext context) {
    final bgColor = isDark ? AppColors.navBarDark : AppColors.surfaceLight;
    final activeColor =
        isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final inactiveColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    final media = MediaQuery.of(context);
    final safeBottom = media.padding.bottom;
    final scale = (media.size.width / 393.0).clamp(0.86, 1.0);
    final fabOverflow = 28.0 * scale;
    final visibleBarHeight = 92.0 * scale;
    final contentTop = fabOverflow + 14.0 * scale;

    return MediaQuery(
      data: media.copyWith(textScaler: TextScaler.linear(scale)),
      child: SizedBox(
        key: const Key('today-bottom-nav'),
        height: visibleBarHeight + fabOverflow + safeBottom,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              top: fabOverflow,
              left: 0,
              right: 0,
              bottom: 0,
              child: ClipRect(
                child: BackdropFilter(
                  filter: ui.ImageFilter.blur(sigmaX: 28, sigmaY: 28),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: bgColor.withValues(alpha: 0.92),
                      border: Border(
                        top: BorderSide(
                          color: isDark
                              ? const Color(0x12FFFFFF)
                              : AppColors.borderLight,
                          width: 0.5,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: contentTop,
              left: 0,
              right: 0,
              bottom: safeBottom,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: List.generate(_items.length, (index) {
                  if (index == 2) {
                    return Expanded(
                      child: UiDiffAnchor(
                        id: 'today.scanButton',
                        label: 'Scan FAB',
                        child: _ScanFAB(
                          isActive: currentIndex == 2,
                          isDark: isDark,
                          scale: scale,
                          onTap: () => onTap(2),
                        ),
                      ),
                    );
                  }
                  final item = _items[index];
                  final isActive = currentIndex == index;
                  return Expanded(
                    child: _NavButton(
                      icon: item.icon,
                      label: item.label,
                      isActive: isActive,
                      activeColor: activeColor,
                      inactiveColor: inactiveColor,
                      scale: scale,
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
  const _NavItem({required this.icon, required this.label});
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.activeColor,
    required this.inactiveColor,
    required this.scale,
    required this.onTap,
  });

  final _NavIconType icon;
  final String label;
  final bool isActive;
  final Color activeColor;
  final Color inactiveColor;
  final double scale;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = isActive ? activeColor : inactiveColor;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: EdgeInsets.only(top: 4 * scale),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.start,
          children: [
            _CalorixNavIcon(
              type: icon,
              color: color,
              size: 22 * scale,
              strokeWidth: isActive ? 2 : 1.6,
            ),
            SizedBox(height: 4 * scale),
            Text(
              label,
              style: AppTextStyles.labelSmall.copyWith(
                color: color,
                fontSize: 10.5,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
                letterSpacing: 0.21,
              ),
            ),
            SizedBox(height: 2 * scale),
            SizedBox(
              width: 4 * scale,
              height: 4 * scale,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: isActive ? AppColors.cyan : Colors.transparent,
                  shape: BoxShape.circle,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScanFAB extends StatelessWidget {
  const _ScanFAB({
    required this.isActive,
    required this.isDark,
    required this.scale,
    required this.onTap,
  });

  final bool isActive;
  final bool isDark;
  final double scale;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        key: const Key('scan-fab-column'),
        height: 92 * scale,
        child: Stack(
          alignment: Alignment.topCenter,
          clipBehavior: Clip.none,
          children: [
            Positioned(
              top: -28 * scale,
              child: SizedBox(
                width: 76 * scale,
                height: 76 * scale,
                child: Stack(
                  alignment: Alignment.center,
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      key: const Key('scan-glow'),
                      width: 76 * scale,
                      height: 76 * scale,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            Color(0x5919D3D9),
                            Color(0x0D3A5BFF),
                            Color(0x00000000),
                          ],
                          stops: [0.0, 0.6, 0.75],
                        ),
                      ),
                    ),
                    Container(
                      key: const Key('scan-fab-outer'),
                      width: 60 * scale,
                      height: 60 * scale,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const SweepGradient(
                          colors: AppColors.sweepGradient,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.cyan.withValues(alpha: 0.35),
                            blurRadius: 24,
                            offset: const Offset(0, 8),
                          ),
                          BoxShadow(
                            color: AppColors.blue.withValues(alpha: 0.30),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Padding(
                        padding: EdgeInsets.all(6 * scale),
                        child: Container(
                          key: const Key('scan-fab-inner'),
                          width: 48 * scale,
                          height: 48 * scale,
                          decoration: BoxDecoration(
                            color: isDark
                                ? AppColors.backgroundDark
                                    .withValues(alpha: 0.85)
                                : AppColors.surfaceLight,
                            shape: BoxShape.circle,
                          ),
                          child: _CalorixNavIcon(
                            key: const Key('scan-icon-eye'),
                            type: _NavIconType.scan,
                            color: isDark
                                ? AppColors.textPrimaryDark
                                : AppColors.textPrimaryLight,
                            size: 22 * scale,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              top: 36 * scale,
              child: Column(
                children: [
                  Text(
                    'SCAN',
                    style: AppTextStyles.labelMono.copyWith(
                      color: isActive
                          ? (isDark
                              ? AppColors.textPrimaryDark
                              : AppColors.textPrimaryLight)
                          : (isDark
                              ? AppColors.textSecondaryDark
                              : AppColors.textSecondaryLight),
                      fontSize: 9.5,
                      fontWeight: isActive ? FontWeight.w600 : FontWeight.w500,
                      letterSpacing: 1.6,
                      height: 1,
                    ),
                  ),
                  SizedBox(height: 4 * scale),
                  SizedBox(
                    width: 10 * scale,
                    height: 10 * scale,
                    child: Center(
                      child: Container(
                        width: 4 * scale,
                        height: 4 * scale,
                        decoration: BoxDecoration(
                          color:
                              isActive ? AppColors.green : Colors.transparent,
                          shape: BoxShape.circle,
                          boxShadow: isActive
                              ? [
                                  BoxShadow(
                                    color:
                                        AppColors.green.withValues(alpha: 0.2),
                                    spreadRadius: 3,
                                    blurRadius: 0,
                                  ),
                                ]
                              : null,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum _NavIconType { today, history, scan, goals, ai }

class _CalorixNavIcon extends StatelessWidget {
  const _CalorixNavIcon({
    super.key,
    required this.type,
    required this.color,
    this.size = 22,
    this.strokeWidth = 1.6,
  });

  final _NavIconType type;
  final Color color;
  final double size;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      key: Key('nav-icon-${type.name}'),
      size: Size.square(size),
      painter: _CalorixNavIconPainter(
        type: type,
        color: color,
        strokeWidth: strokeWidth,
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
          ..moveTo(19, 18)
          ..lineTo(19.5, 19.8)
          ..lineTo(21.5, 20)
          ..lineTo(19.5, 20.5)
          ..lineTo(19, 22.5)
          ..lineTo(18.5, 20.5)
          ..lineTo(16.5, 20)
          ..lineTo(18.5, 19.8)
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
