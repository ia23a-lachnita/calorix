import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../../../core/motion/app_motion.dart';
import '../providers/scan_providers.dart';

const _chipBg = Color(0x8C14181E); // rgba(20,24,30,0.55)

/// Glass segmented control for Meal/Barcode/Label. Exactly one segment is
/// active at a time, so its highlight container is the sliding "thumb" —
/// keyed for tests rather than modeled as a separately positioned overlay.
class ScanModeSelector extends StatelessWidget {
  const ScanModeSelector(
      {super.key, required this.mode, required this.onChanged});

  final ScanMode mode;
  final ValueChanged<ScanMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: _chipBg,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              width: 0.5,
              color: Colors.white.withValues(alpha: 0.10),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: ScanMode.values.map((m) {
              final isActive = m == mode;
              return GestureDetector(
                onTap: () => onChanged(m),
                child: AnimatedContainer(
                  key: isActive ? const ValueKey('mode-selector-thumb') : null,
                  duration: MotionDurations.reticleSnap,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: isActive
                        ? Colors.white.withValues(alpha: 0.95)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    switch (m) {
                      ScanMode.meal => 'Meal',
                      ScanMode.barcode => 'Barcode',
                      ScanMode.label => 'Label',
                    },
                    style: TextStyle(
                      fontFamily: 'Geist',
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: isActive
                          ? const Color(0xFF0B0D10)
                          : Colors.white.withValues(alpha: 0.7),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}
