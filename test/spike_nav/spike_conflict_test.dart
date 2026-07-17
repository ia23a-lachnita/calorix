import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/debug/spike_nav/spike_shell_a.dart';

Finder activeTab(int index) =>
    find.byKey(ValueKey('tab-body-$index')).hitTestable();

Future<void> pumpSpike(WidgetTester tester) async {
  await tester.pumpWidget(const MaterialApp(home: SpikeShellA()));
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  group('SpikeShellA (PageView)', () {
    testWidgets('slider drag does not change tab', (tester) async {
      await pumpSpike(tester);

      expect(activeTab(0), findsOneWidget);

      await tester.drag(find.byType(Slider), const Offset(-140, 0));
      await tester.pumpAndSettle();

      expect(activeTab(0), findsOneWidget);
    });

    testWidgets(
      'horizontal list drag inside its bounds does not change tab',
      (tester) async {
        await pumpSpike(tester);

        expect(activeTab(0), findsOneWidget);

        await tester.drag(
          find.byKey(const ValueKey('h-list')),
          const Offset(-200, 0),
        );
        await tester.pumpAndSettle();

        expect(activeTab(0), findsOneWidget);
      },
    );

    testWidgets('body swipe changes adjacent tab', (tester) async {
      await pumpSpike(tester);

      expect(activeTab(0), findsOneWidget);

      await tester.fling(activeTab(0), const Offset(-300, 0), 1000);
      await tester.pumpAndSettle();

      expect(activeTab(1), findsOneWidget);
    });

    testWidgets('40px release settles origin', (tester) async {
      await pumpSpike(tester);

      expect(activeTab(0), findsOneWidget);

      await tester.drag(activeTab(0), const Offset(-40, 0));
      await tester.pumpAndSettle();

      expect(activeTab(0), findsOneWidget);
    });

    testWidgets(
      'scroll offset and TextField content survive away and back',
      (tester) async {
        await pumpSpike(tester);

        expect(activeTab(0), findsOneWidget);

        await tester.drag(
          find.byKey(const ValueKey('v-list')),
          const Offset(0, -300),
        );
        await tester.pumpAndSettle();

        expect(activeTab(0), findsOneWidget);
        expect(find.text('Row 0').hitTestable(), findsNothing);

        await tester.enterText(
          find.byKey(const ValueKey('text-field')),
          'abc',
        );
        await tester.pumpAndSettle();

        await tester.flingFrom(
          const Offset(400, 300),
          const Offset(-300, 0),
          1000,
        );
        await tester.pumpAndSettle();

        await tester.flingFrom(
          const Offset(400, 300),
          const Offset(300, 0),
          1000,
        );
        await tester.pumpAndSettle();

        expect(activeTab(0), findsOneWidget);
        expect(find.text('Row 0').hitTestable(), findsNothing);
        expect(find.text('abc').hitTestable(), findsOneWidget);
      },
    );

    testWidgets('reverse fling mid-transition returns origin', (tester) async {
      await pumpSpike(tester);

      expect(activeTab(0), findsOneWidget);

      await tester.fling(activeTab(0), const Offset(-300, 0), 1000);
      await tester.pump(const Duration(milliseconds: 80));

      await tester.flingFrom(
        const Offset(400, 300),
        const Offset(300, 0),
        1000,
      );
      await tester.pumpAndSettle();

      expect(activeTab(0), findsOneWidget);
    });
  });
}
