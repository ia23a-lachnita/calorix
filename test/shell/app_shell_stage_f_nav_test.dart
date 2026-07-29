import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/shell/app_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

const _comparisonScale = 1.0925;

Widget _app({
  required int currentIndex,
  required bool dark,
  ValueChanged<int>? onTap,
}) {
  return MaterialApp(
    theme: AppTheme.light(),
    darkTheme: AppTheme.dark(),
    themeMode: dark ? ThemeMode.dark : ThemeMode.light,
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        padding: EdgeInsets.zero,
        viewPadding: EdgeInsets.zero,
      ),
      child: child!,
    ),
    home: Stack(
      clipBehavior: Clip.none,
      children: [
        const SizedBox.expand(),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                padding: EdgeInsets.zero,
                viewPadding: EdgeInsets.zero,
              ),
              child: CalorixBottomNav(
                currentIndex: currentIndex,
                onTap: onTap ?? (_) {},
                isDark: dark,
                floating: currentIndex == 2,
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

Future<void> _pumpNav(
  WidgetTester tester, {
  required int currentIndex,
  required bool dark,
  ValueChanged<int>? onTap,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  tester.view.viewPadding = FakeViewPadding.zero;
  tester.view.padding = FakeViewPadding.zero;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetViewPadding);
  addTearDown(tester.view.resetPadding);
  await tester.pumpWidget(
    _app(currentIndex: currentIndex, dark: dark, onTap: onTap),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('Stage F canonical raised Scan navigation', () {
    for (final dark in [true, false]) {
      testWidgets(
        '${dark ? 'dark' : 'light'} mode keeps Scan raised when AI is active',
        (tester) async {
          await _pumpNav(tester, currentIndex: 4, dark: dark);

          expect(find.byKey(const Key('scan-branch')), findsOneWidget);
          expect(find.byKey(const Key('scan-fab-outer')), findsOneWidget);
          expect(find.byKey(const Key('scan-fab-inner')), findsOneWidget);
          expect(find.byKey(const Key('scan-glow')), findsOneWidget);
          expect(find.text('SCAN'), findsOneWidget);
          expect(find.byKey(const Key('scan-active-pip')), findsNothing);

          expect(
            tester.getSize(find.byKey(const Key('scan-fab-outer'))).width,
            closeTo(60 / _comparisonScale, 0.01),
          );
          expect(
            tester.getSize(find.byKey(const Key('scan-fab-inner'))).width,
            closeTo(48 / _comparisonScale, 0.01),
          );
          expect(
            tester.getSize(find.byKey(const Key('scan-glow'))).width,
            closeTo(76 / _comparisonScale, 0.01),
          );
          expect(
            tester.getSize(find.byKey(const Key('scan-hit-target'))).width,
            greaterThanOrEqualTo(60),
          );

          final navRow = tester.getRect(
            find.byKey(const Key('nav-items-row')),
          );
          final outer = tester.getRect(
            find.byKey(const Key('scan-fab-outer')),
          );
          expect(outer.top, lessThan(navRow.top));
          final navElement = tester.element(
            find.byType(CalorixBottomNav),
          );
          final safeBottom = MediaQuery.viewPaddingOf(navElement).bottom;
          expect(
            tester.getSize(find.byKey(const Key('today-bottom-nav'))).height,
            closeTo(98 / _comparisonScale + safeBottom, 0.01),
          );
        },
      );
    }

    testWidgets('Scan-active state adds only the green pip', (tester) async {
      await _pumpNav(tester, currentIndex: 2, dark: true);

      expect(find.byKey(const Key('scan-active-pip')), findsOneWidget);
      expect(find.byKey(const Key('scan-branch')), findsOneWidget);
      expect(find.text('SCAN'), findsOneWidget);
    });

    testWidgets('Scan has a labeled callback target and no clipping ancestor',
        (tester) async {
      int? selectedIndex;
      final semantics = tester.ensureSemantics();
      await _pumpNav(
        tester,
        currentIndex: 0,
        dark: true,
        onTap: (index) => selectedIndex = index,
      );

      expect(find.bySemanticsLabel('Scan'), findsOneWidget);
      expect(
        tester.getSize(find.byKey(const Key('scan-hit-target'))),
        const Size(60, 60),
      );
      expect(
        find.ancestor(
          of: find.byKey(const Key('scan-fab-outer')),
          matching: find.byType(ClipRect),
        ),
        findsNothing,
      );
      expect(
        tester
            .renderObject<RenderStack>(
              find.byKey(const Key('today-bottom-nav-stack')),
            )
            .clipBehavior,
        Clip.none,
      );

      await tester.tap(find.byKey(const Key('scan-hit-target')));
      expect(selectedIndex, 2);
      semantics.dispose();
    });
  });
}
