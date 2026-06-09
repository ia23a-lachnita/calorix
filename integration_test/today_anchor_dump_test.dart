/// Integration test: launches the Today screen in ui-diff mode, waits for
/// layout, exports the anchor registry to:
///   <appDocumentsDir>/ui-diff/today/current/flutter-anchors.json
///   <appDocumentsDir>/ui-diff/today/current/flutter-anchors.done
///
/// After the test runs on device, pull the file with:
///   .\scripts\pull_flutter_anchors.ps1
/// or manually:
///   adb shell "run-as com.example.calorix cat files/ui-diff/today/current/flutter-anchors.json"
///
/// Run with:
///   fvm flutter test integration_test/today_anchor_dump_test.dart --device-id <device>

// ignore_for_file: avoid_print

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:calorix/debug/ui_diff/ui_diff_anchor.dart';
import 'package:calorix/debug/ui_diff/ui_diff_anchor_writer.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('dump Today screen anchors to device storage', (tester) async {
    UiDiffAnchorRegistry.instance.reset();
    UiDiffAnchorRegistry.instance.setScreen('today');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          uiDiffModeProvider.overrideWith((ref) => true),
          todayEntriesProvider.overrideWith((_) => Stream.value([])),
          todayMacroSummaryProvider.overrideWith(
            (_) => (kcal: 980.0, protein: 96.0, carbs: 120.0, fat: 40.0),
          ),
          activePlanProvider.overrideWith(
            (_) => Stream<MacroTargetPlan?>.value(MacroTargetPlan.defaultPlan()),
          ),
        ],
        child: const MaterialApp(home: TodayScreen()),
      ),
    );

    // Frame 1: build widget tree (anchors register + first callback added).
    await tester.pump();
    // Frame 2: anchor post-frame callbacks fire, rects are measured.
    await tester.pump(const Duration(milliseconds: 50));
    // Settle remaining animations (count-up is Duration.zero in ui-diff mode).
    await tester.pumpAndSettle(const Duration(seconds: 1));

    final ctx = tester.element(find.byType(TodayScreen));
    final dto = UiDiffAnchorRegistry.instance.export(ctx);

    print('[anchor-dump] anchors=${dto.anchors.length} screen=${dto.screen}');
    for (final a in dto.anchors) {
      print('[anchor-dump]  ${a.id} visible=${a.visible} '
          'rect=(${a.rectLogical.x.round()},${a.rectLogical.y.round()}) '
          '${a.rectLogical.width.round()}×${a.rectLogical.height.round()}');
    }

    final path = await dumpUiDiffAnchors(dto);
    expect(path, isNotNull, reason: 'anchor dump must succeed');
    print('[anchor-dump] written to $path');
  });
}
