import 'package:flutter/material.dart';

/// Brand placeholders per the design handoff: the final name and logo are
/// undecided, so the mark is a striped slot and the wordmark is a dashed tag.
/// Both are single swappable widgets — replace here when branding lands.

const _placeholderInk = Color(0xFF7F8388);

class CxLogo extends StatelessWidget {
  final double size;
  const CxLogo({super.key, this.size = 28});

  @override
  Widget build(BuildContext context) {
    final radius = size * 0.26 < 4 ? 4.0 : size * 0.26;
    return CustomPaint(
      size: Size.square(size),
      painter: _LogoPlaceholderPainter(radius: radius),
    );
  }
}

class _LogoPlaceholderPainter extends CustomPainter {
  final double radius;
  const _LogoPlaceholderPainter({required this.radius});

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius),
    );
    canvas.save();
    canvas.clipRRect(rrect);

    // repeating-linear-gradient(45deg, ink20 0 3px, ink06 3px 7px)
    final base = Paint()..color = _placeholderInk.withValues(alpha: 0.06);
    canvas.drawRect(Offset.zero & size, base);
    final stripe = Paint()..color = _placeholderInk.withValues(alpha: 0.20);
    const period = 7.0;
    final diagonal = size.width + size.height;
    for (double d = -diagonal; d < diagonal; d += period) {
      final path = Path()
        ..moveTo(d, size.height)
        ..lineTo(d + size.height, 0)
        ..lineTo(d + size.height + 3, 0)
        ..lineTo(d + 3, size.height)
        ..close();
      canvas.drawPath(path, stripe);
    }
    canvas.restore();

    _drawDashedRRect(
      canvas,
      rrect.deflate(0.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = _placeholderInk.withValues(alpha: 0.55),
    );
  }

  void _drawDashedRRect(Canvas canvas, RRect rrect, Paint paint) {
    final path = Path()..addRRect(rrect);
    const dash = 3.0, gap = 3.0;
    for (final metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        final next = distance + dash;
        canvas.drawPath(
          metric.extractPath(distance, next.clamp(0, metric.length)),
          paint,
        );
        distance = next + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _LogoPlaceholderPainter oldDelegate) =>
      oldDelegate.radius != radius;
}

class CxWordmark extends StatelessWidget {
  final double height;
  const CxWordmark({super.key, this.height = 28});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = dark ? const Color(0xFFF2F3F5) : const Color(0xFF0B0D10);
    final fontSize = (height * 0.32).roundToDouble() < 9
        ? 9.0
        : (height * 0.32).roundToDouble();
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CxLogo(size: height),
        const SizedBox(width: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            border: Border.all(
              color: ink.withValues(alpha: 0.30),
              width: 1,
              style: BorderStyle.none,
            ),
          ),
          foregroundDecoration: _DashedBorderDecoration(
            color: ink.withValues(alpha: 0.30),
            radius: 6,
          ),
          child: Text(
            'WORDMARK',
            style: TextStyle(
              fontFamily: 'GeistMono',
              fontSize: fontSize,
              letterSpacing: fontSize * 0.22,
              height: 1.4,
              color: ink.withValues(alpha: 0.45),
            ),
          ),
        ),
      ],
    );
  }
}

class _DashedBorderDecoration extends Decoration {
  final Color color;
  final double radius;
  const _DashedBorderDecoration({required this.color, required this.radius});

  @override
  BoxPainter createBoxPainter([VoidCallback? onChanged]) =>
      _DashedBorderPainter(color: color, radius: radius);
}

class _DashedBorderPainter extends BoxPainter {
  final Color color;
  final double radius;
  _DashedBorderPainter({required this.color, required this.radius});

  @override
  void paint(Canvas canvas, Offset offset, ImageConfiguration configuration) {
    final size = configuration.size ?? Size.zero;
    final rrect = RRect.fromRectAndRadius(
      (offset & size).deflate(0.5),
      Radius.circular(radius),
    );
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = color;
    final path = Path()..addRRect(rrect);
    const dash = 3.0, gap = 3.0;
    for (final metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        final next = distance + dash;
        canvas.drawPath(
          metric.extractPath(distance, next.clamp(0, metric.length)),
          paint,
        );
        distance = next + gap;
      }
    }
  }
}
