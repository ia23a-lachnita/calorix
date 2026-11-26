import 'package:calorix/features/tier1/dashboard_history.dart';
import 'package:calorix/features/tier1/dashboard_today.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/targets.dart';
import 'package:calorix/shared/widgets/macro_ring.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('Today macro copy clears the inner track at narrow widths',
      (tester) async {
    for (final width in [360.0, 402.0]) {
      for (final (scale, kcal, target, balance) in [
        (2.0, 2000, 2400, '400 kcal left'),
        (1.0, 9999, 10000, '1 kcal left'),
      ]) {
        tester.view.physicalSize = Size(width * 2, 1600);
        tester.view.devicePixelRatio = 2;
        addTearDown(tester.view.reset);
        final now = DateTime(2026, 9, 30);
        final meal = Tier1Meal(
            id: 'large',
            name: 'Large total',
            capturedAt: now,
            served: Tier1Nutrients(
                kcal: kcal.toDouble(), proteinG: 30, carbsG: 35, fatG: 20));
        await tester.pumpWidget(MaterialApp(
            home: MediaQuery(
                data: MediaQueryData(
                    size: Size(width, 800),
                    textScaler: TextScaler.linear(scale)),
                child: Scaffold(
                    body: DashboardToday(
                        meals: [meal],
                        now: now,
                        targets: Tier1Targets(
                            kcal: target,
                            proteinG: 100,
                            carbsG: 100,
                            fatG: 100),
                        onOpenMeal: (_) {},
                        onEditTargets: () {})))));

        final ring = tester.getRect(find.byType(MacroRing));
        final ringCenter = ring.center;
        expect(ring.width, greaterThan(208),
            reason: 'Today should use the wider macro ring at $width px');
        Rect paintedBounds(String text) {
          final finder = find.text(text);
          final textWidget = tester.widget<Text>(finder);
          final paragraph = tester.renderObject<RenderParagraph>(finder);
          final boxes = paragraph.getBoxesForSelection(TextSelection(
              baseOffset: 0, extentOffset: textWidget.data!.length));
          return boxes.map((box) {
            final rect = box.toRect();
            return Rect.fromPoints(paragraph.localToGlobal(rect.topLeft),
                paragraph.localToGlobal(rect.bottomRight));
          }).reduce((a, b) => a.expandToInclude(b));
        }

        final centerLabelRects = [
          paintedBounds('KCAL EATEN'),
          paintedBounds('$kcal'),
          paintedBounds('of $target'),
          paintedBounds(balance),
        ];
        expect(
            tester
                .renderObject<RenderParagraph>(find.text('$kcal'))
                .getBoxesForSelection(
                    TextSelection(baseOffset: 0, extentOffset: '$kcal'.length))
                .length,
            1,
            reason: 'the calorie total should stay on one line');
        final cornerRadius = centerLabelRects
            .expand((rect) => [
                  rect.topLeft,
                  rect.topRight,
                  rect.bottomLeft,
                  rect.bottomRight
                ])
            .map((point) => (point - ringCenter).distance)
            .reduce((a, b) => a > b ? a : b);
        // Today uses an 8 px stroke and 12 px spacing; the innermost track's
        // inner edge sits 32 px inside the ring's half-size.
        final innerRingRadius = ring.width / 2 - 32;
        expect(innerRingRadius - cornerRadius, greaterThanOrEqualTo(12),
            reason:
                '$width logical px wide at $scale× text should leave at least '
                '12 logical px between the center copy and innermost track; '
                'ring=$ring, center=$centerLabelRects');
        expect(tester.takeException(), isNull);
      }
    }
  });

  testWidgets('Today and history fit narrow layouts with larger text',
      (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final meals = [
      Tier1Meal(
          id: 'a',
          name: 'Lunch',
          capturedAt: DateTime(2026, 9, 30),
          served: Tier1Nutrients(kcal: 500, proteinG: 40, carbsG: 70, fatG: 20))
    ];
    Widget page(Widget body) => MaterialApp(
        home: MediaQuery(
            data: const MediaQueryData(
                size: Size(360, 800), textScaler: TextScaler.linear(2)),
            child: Scaffold(body: body)));
    await tester.pumpWidget(page(DashboardToday(
        meals: const [],
        now: DateTime(2026, 9, 30),
        targets: Tier1Targets.defaults,
        onOpenMeal: (_) {},
        onEditTargets: () {})));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(page(DashboardHistory(
        meals: meals,
        now: DateTime(2026, 9, 30),
        targets: Tier1Targets.defaults,
        onOpenMeal: (_) {})));
    await tester.tap(find.byTooltip('Previous period'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
