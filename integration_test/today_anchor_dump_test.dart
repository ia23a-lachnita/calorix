/// Integration test: launches the Today screen in ui-diff mode, waits for
/// layout to settle, exports the anchor registry to:
///   <appDocumentsDir>/ui-diff/today/current/flutter-anchors.json
///   <appDocumentsDir>/ui-diff/today/current/flutter-anchors.done
///
/// Fixture values match the Today mockup source:
///   kcal consumed 1420 / target 2400  →  kcal-left label: "980 kcal left"
///   protein 96 / 170  ·  carbs 132 / 250  ·  fat 38 / 70
///
/// After the test runs on device, pull the file with:
///   .\scripts\pull_flutter_anchors.ps1
/// or manually:
///   adb shell "run-as com.calorix.calorix cat files/ui-diff/today/current/flutter-anchors.json"
///
/// Run with:
///   fvm flutter test integration_test/today_anchor_dump_test.dart --device-id <device>
///
/// NOTE: today.bottomNav and today.scanButton are anchored in AppShell, not
/// TodayScreen.  They are absent from this standalone test by design.
/// To verify shell anchors, run the full app via the debug/reseed route.

// ignore_for_file: avoid_print

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:intl/intl.dart';

import 'package:calorix/debug/ui_diff/ui_diff_anchor.dart';
import 'package:calorix/debug/ui_diff/ui_diff_anchor_writer.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/models/macro_target_plan.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';

// ---------------------------------------------------------------------------
// Fixture data aligned with Today mockup source
// ---------------------------------------------------------------------------

const _kcalConsumed  = 1420.0;
const _kcalTarget    = 2400;    // matches defaultPlan()
const _kcalLeft      = _kcalTarget - _kcalConsumed; // 980

const _proteinConsumed = 96.0;
const _carbsConsumed   = 132.0;
const _fatConsumed     = 38.0;

/// Expected kcal-left label emitted by the anchor — used to verify the
/// fixture produces the right number.
final _expectedKcalLeftLabel =
    '${NumberFormat('#,###').format(_kcalLeft.round())} kcal left';

/// One fixture meal entry so recentScansSection / Count / mealCardsSection
/// anchors are actually rendered.
final _fixtureEntry = FoodEntry(
  id: 'fixture-001',
  uid: 'test-uid',
  timestamp: DateTime.now(),
  scanMode: 'meal',
  status: FoodEntryStatus.complete,
  foodName: 'Chicken Rice Bowl',
  kcal: 620,
  protein: 42,
  carbs: 68,
  fat: 18,
  confidence: 0.92,
  mealType: MealType.lunch,
);

// ---------------------------------------------------------------------------
// Required anchor IDs exported by TodayScreen (standalone, without AppShell)
// ---------------------------------------------------------------------------

const _requiredTodayAnchorIds = {
  'today.macroRingHero',
  'today.kcalLeftPill',
  'today.proteinRow',
  'today.carbsRow',
  'today.fatRow',
  'today.recentScansSection',
  'today.recentScansCount',
  'today.mealCardsSection',
};

// Shell anchors require AppShell; not verified in this standalone test.
// const _shellAnchorIds = {'today.bottomNav', 'today.scanButton'};

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('dump Today screen anchors to device storage', (tester) async {
    UiDiffAnchorRegistry.instance.reset();
    UiDiffAnchorRegistry.instance.setScreen('today');

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          uiDiffModeProvider.overrideWith((ref) => true),
          todayEntriesProvider.overrideWith(
            (_) => Stream.value([_fixtureEntry]),
          ),
          todayMacroSummaryProvider.overrideWith(
            (_) => (
              kcal: _kcalConsumed,
              protein: _proteinConsumed,
              carbs: _carbsConsumed,
              fat: _fatConsumed,
            ),
          ),
          activePlanProvider.overrideWith(
            (_) => Stream<MacroTargetPlan?>.value(MacroTargetPlan.defaultPlan()),
          ),
        ],
        child: const MaterialApp(home: TodayScreen()),
      ),
    );

    // Frame 1: build (anchors register, Riverpod emits).
    await tester.pump();
    // Frame 2: Riverpod stream delivers fixture entries; anchor callbacks fire.
    await tester.pump(const Duration(milliseconds: 50));
    // Settle: all layouts stabilise (count-up is Duration.zero in ui-diff mode).
    await tester.pumpAndSettle(const Duration(seconds: 2));

    final ctx = tester.element(find.byType(TodayScreen));
    final dto = UiDiffAnchorRegistry.instance.export(ctx);

    // -----------------------------------------------------------------------
    // Verify fixture integrity
    // -----------------------------------------------------------------------

    expect(_kcalLeft, 980,
        reason: 'Fixture must produce kcal-left = 980 to match mockup');

    // -----------------------------------------------------------------------
    // Verify all required anchor IDs are present
    // -----------------------------------------------------------------------

    final exportedIds = {for (final a in dto.anchors) a.id};
    for (final id in _requiredTodayAnchorIds) {
      expect(exportedIds, contains(id),
          reason: 'Required anchor "$id" missing from export');
    }

    // -----------------------------------------------------------------------
    // Verify kcal-left pill label matches mockup ("980 kcal left")
    // -----------------------------------------------------------------------

    final kcalPillAnchor =
        dto.anchors.firstWhere((a) => a.id == 'today.kcalLeftPill');
    expect(kcalPillAnchor.label, _expectedKcalLeftLabel,
        reason: 'today.kcalLeftPill label must match "980 kcal left"');

    // -----------------------------------------------------------------------
    // Verify device DTO has required fields
    // -----------------------------------------------------------------------

    expect(dto.device.screenshotDimensionsSource, 'mediaQueryDerived');
    expect(dto.device.devicePixelRatio, isA<double>());
    expect(dto.device.mediaQuerySizeLogical['width'], isA<double>());

    // -----------------------------------------------------------------------
    // Print summary
    // -----------------------------------------------------------------------

    print('[anchor-dump] screen=${dto.screen}  anchors=${dto.anchors.length}');
    print('[anchor-dump] device: '
        '${dto.device.screenshotWidthPx.round()}×'
        '${dto.device.screenshotHeightPx.round()}px  '
        'dpr=${dto.device.devicePixelRatio}  '
        'source=${dto.device.screenshotDimensionsSource}');
    for (final a in dto.anchors) {
      print('[anchor-dump]  ${a.id.padRight(30)} visible=${a.visible}  '
          'label="${a.label}"  '
          'rect=(${a.rectLogical.x.round()},${a.rectLogical.y.round()}) '
          '${a.rectLogical.width.round()}×${a.rectLogical.height.round()}');
    }

    // -----------------------------------------------------------------------
    // Write artifact and verify done flag
    // -----------------------------------------------------------------------

    final path = await dumpUiDiffAnchors(dto);
    expect(path, isNotNull, reason: 'anchor dump must succeed on device');
    print('[anchor-dump] written to $path');

    // Round-trip decode to prove the JSON is valid.
    final raw = dto.toJsonString();
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    expect(decoded['framework'], 'flutter');
    expect(decoded['screen'], 'today');
    expect(
      (decoded['anchors'] as List).map((a) => a['id'] as String).toSet(),
      containsAll(_requiredTodayAnchorIds),
    );
  });
}
