import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_text_styles.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> with TickerProviderStateMixin {
  late final AnimationController _fabRingController;

  @override
  void initState() {
    super.initState();
    _fabRingController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat();
  }

  @override
  void dispose() {
    _fabRingController.dispose();
    super.dispose();
  }

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
      body: widget.navigationShell,
      bottomNavigationBar: _CalorixBottomNav(
        currentIndex: currentIndex,
        onTap: _onTap,
        fabRingController: _fabRingController,
        isDark: isDark,
      ),
    );
  }
}

class _CalorixBottomNav extends StatelessWidget {
  const _CalorixBottomNav({
    required this.currentIndex,
    required this.onTap,
    required this.fabRingController,
    required this.isDark,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final AnimationController fabRingController;
  final bool isDark;

  static const _items = [
    _NavItem(icon: Icons.today_outlined, activeIcon: Icons.today, label: 'Today'),
    _NavItem(icon: Icons.history_outlined, activeIcon: Icons.history, label: 'History'),
    _NavItem(icon: null, activeIcon: null, label: 'Scan'), // FAB
    _NavItem(icon: Icons.flag_outlined, activeIcon: Icons.flag, label: 'Goals'),
    _NavItem(icon: Icons.auto_awesome_outlined, activeIcon: Icons.auto_awesome, label: 'AI'),
  ];

  @override
  Widget build(BuildContext context) {
    final bgColor = isDark ? AppColors.navBarDark : AppColors.navBarLight;
    final activeColor =
        isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final inactiveColor =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondaryLight;

    return Container(
      height: 72 + MediaQuery.of(context).padding.bottom,
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(
          top: BorderSide(
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
            width: 0.5,
          ),
        ),
      ),
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: List.generate(_items.length, (index) {
            if (index == 2) {
              return Expanded(
                child: _ScanFAB(
                  isActive: currentIndex == 2,
                  controller: fabRingController,
                  isDark: isDark,
                  onTap: () => onTap(2),
                ),
              );
            }
            final item = _items[index];
            final isActive = currentIndex == index;
            return Expanded(
              child: _NavButton(
                icon: isActive ? item.activeIcon! : item.icon!,
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
    );
  }
}

class _NavItem {
  final IconData? icon;
  final IconData? activeIcon;
  final String label;
  const _NavItem({required this.icon, required this.activeIcon, required this.label});
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.activeColor,
    required this.inactiveColor,
    required this.onTap,
  });

  final IconData icon;
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
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 2),
          Text(
            label,
            style: AppTextStyles.labelSmall.copyWith(color: color),
          ),
          const SizedBox(height: 2),
          if (isActive)
            Container(
              width: 4,
              height: 4,
              decoration: BoxDecoration(
                color: activeColor,
                shape: BoxShape.circle,
              ),
            )
          else
            const SizedBox(height: 4),
        ],
      ),
    );
  }
}

class _ScanFAB extends StatelessWidget {
  const _ScanFAB({
    required this.isActive,
    required this.controller,
    required this.isDark,
    required this.onTap,
  });

  final bool isActive;
  final AnimationController controller;
  final bool isDark;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedBuilder(
            animation: controller,
            builder: (context, child) => CustomPaint(
              painter: _SweepRingPainter(progress: controller.value),
              child: child,
            ),
            child: Container(
              width: 48,
              height: 48,
              margin: const EdgeInsets.symmetric(horizontal: 3),
              decoration: BoxDecoration(
                color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.remove_red_eye_outlined,
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight,
                size: 22,
              ),
            ),
          ),
          const SizedBox(height: 1),
          Text(
            'SCAN',
            style: AppTextStyles.labelSmall.copyWith(
              color: isActive
                  ? (isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight)
                  : AppColors.textSecondaryDark,
            ),
          ),
          const SizedBox(height: 2),
          if (isActive)
            Container(
              width: 4,
              height: 4,
              decoration: const BoxDecoration(
                color: AppColors.green,
                shape: BoxShape.circle,
              ),
            )
          else
            const SizedBox(height: 4),
        ],
      ),
    );
  }
}

class _SweepRingPainter extends CustomPainter {
  final double progress;
  _SweepRingPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..shader = SweepGradient(
        colors: AppColors.sweepGradient,
        startAngle: 0,
        endAngle: 2 * math.pi,
        transform: GradientRotation(progress * 2 * math.pi),
      ).createShader(Rect.fromCircle(center: center, radius: radius));

    canvas.drawCircle(center, radius - 1.5, paint);
  }

  @override
  bool shouldRepaint(_SweepRingPainter old) => old.progress != progress;
}
