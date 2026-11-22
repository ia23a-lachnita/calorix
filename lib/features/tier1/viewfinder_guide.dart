import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// The 32 px framing brackets from the Scan handoff.
class ViewfinderGuide extends CustomPainter {
  const ViewfinderGuide({required this.active});
  final bool active;

  @override
  void paint(Canvas canvas, Size size) {
    final corner = Path()
      ..moveTo(1.25, 32)
      ..lineTo(1.25, 7)
      ..quadraticBezierTo(1.25, 1.25, 7, 1.25)
      ..lineTo(32, 1.25);
    final outline = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..color = const Color(0x700B0D10);
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..color = active ? AppColors.cyan : const Color(0xFFF2F3F5);
    for (final (x, y) in [(1.0, 1.0), (-1.0, 1.0), (1.0, -1.0), (-1.0, -1.0)]) {
      canvas.save();
      canvas.translate(x < 0 ? size.width : 0, y < 0 ? size.height : 0);
      canvas.scale(x, y);
      canvas.drawPath(corner, outline);
      canvas.drawPath(corner, stroke);
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(ViewfinderGuide oldDelegate) =>
      oldDelegate.active != active;
}
