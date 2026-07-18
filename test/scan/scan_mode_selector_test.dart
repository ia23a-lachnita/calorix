import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/motion/app_motion.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/features/scan/widgets/scan_mode_selector.dart';

void main() {
  testWidgets(
    'Meal/Barcode/Label segments animate smoothly and update ScanMode',
    (tester) async {
      var current = ScanMode.meal;

      await tester.pumpWidget(
        MaterialApp(
          home: StatefulBuilder(
            builder: (context, setState) => Scaffold(
              body: ScanModeSelector(
                mode: current,
                onChanged: (mode) => setState(() => current = mode),
              ),
            ),
          ),
        ),
      );

      expect(find.text('Meal'), findsOneWidget);
      expect(find.text('Barcode'), findsOneWidget);
      expect(find.text('Label'), findsOneWidget);
      expect(find.byKey(const ValueKey('mode-selector-thumb')), findsOneWidget);

      await tester.tap(find.text('Barcode'));
      await tester.pump(MotionDurations.reticleSnap);
      expect(current, ScanMode.barcode);

      await tester.tap(find.text('Label'));
      await tester.pump(MotionDurations.reticleSnap);
      expect(current, ScanMode.label);
    },
  );
}
