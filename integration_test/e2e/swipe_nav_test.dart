import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/features/goals/goals_screen.dart';
import 'package:calorix/features/history/history_screen.dart';
import 'package:calorix/features/scan/scan_screen.dart';
import 'package:calorix/features/today/today_screen.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('swipe_nav_test - traversal and retained tab state', () {
    testWidgets('swipes through all five tabs in both directions',
        (tester) async {
      final harness = await E2EHarness.create();
      await harness.pump(tester, initialLocation: '/today');

      expect(_onstage<TodayScreen>(), findsOneWidget);
      await _swipeLeft(tester);
      expect(
        _pagePixels(tester),
        closeTo(tester.getSize(_pageView()).width, 5),
      );
      expect(_onstage<HistoryScreen>(), findsOneWidget);
      await _swipeLeft(tester);
      expect(_onstage<ScanScreen>(), findsOneWidget);
      await _swipeLeft(tester);
      expect(_onstage<GoalsScreen>(), findsOneWidget);
      await _swipeLeft(tester);
      expect(_onstage<AiChatScreen>(), findsOneWidget);

      await _swipeRight(tester);
      expect(_onstage<GoalsScreen>(), findsOneWidget);
      await _swipeRight(tester);
      expect(_onstage<ScanScreen>(), findsOneWidget);
      await _swipeRight(tester);
      expect(_onstage<HistoryScreen>(), findsOneWidget);
      await _swipeRight(tester);
      expect(_onstage<TodayScreen>(), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Today vertical scroll offset survives a swipe round trip',
        (tester) async {
      final harness = await E2EHarness.create();
      await harness.pump(tester, initialLocation: '/today');

      final scrollable = _verticalScrollableWithin<TodayScreen>();
      final before = tester.state<ScrollableState>(scrollable);
      await tester.drag(scrollable, const Offset(0, -360));
      await tester.pump(const Duration(milliseconds: 300));
      final savedOffset = before.position.pixels;
      expect(savedOffset, greaterThan(0));

      await _swipeLeft(tester);
      expect(_onstage<HistoryScreen>(), findsOneWidget);
      await _swipeRight(tester);
      expect(_onstage<TodayScreen>(), findsOneWidget);

      final restored = tester
          .state<ScrollableState>(_verticalScrollableWithin<TodayScreen>());
      expect(restored.position.pixels, closeTo(savedOffset, 1));
    });

    testWidgets('History month and selected period survive a swipe round trip',
        (tester) async {
      final clock = makeE2EClock();
      final harness = await E2EHarness.create(
        clock: clock,
        accountCreated: clock.now().subtract(const Duration(days: 365)),
      );
      await harness.pump(tester, initialLocation: '/history');

      await tester.tap(find.text('M').hitTestable());
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('JULY 2026').hitTestable(), findsOneWidget);
      await tester.tap(find.byKey(const Key('history.previous')));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('JUNE 2026').hitTestable(), findsOneWidget);

      await _swipeLeft(tester);
      expect(_onstage<ScanScreen>(), findsOneWidget);
      await _swipeRight(tester);
      expect(_onstage<HistoryScreen>(), findsOneWidget);
      expect(find.text('JUNE 2026').hitTestable(), findsOneWidget);
      expect(
          find.byKey(const Key('month-day-1')).hitTestable(), findsOneWidget);
    });

    testWidgets('Assistant draft and message scroll survive a swipe round trip',
        (tester) async {
      final harness = await E2EHarness.create();
      await harness.pump(tester, initialLocation: '/ai');

      for (var i = 0; i < 8; i++) {
        final composer = find.byType(TextField).hitTestable();
        await tester.enterText(composer, 'message $i');
        await tester.tap(find.byIcon(Icons.arrow_upward).hitTestable());
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
      }

      final messageList = _assistantMessageList();
      await tester.drag(messageList, const Offset(0, 320));
      await tester.pump(const Duration(milliseconds: 250));
      final savedOffset =
          tester.state<ScrollableState>(messageList).position.pixels;
      expect(savedOffset, greaterThanOrEqualTo(0));

      final composer = find.byType(TextField).hitTestable();
      await tester.enterText(composer, 'unsent draft');
      await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
      await tester.pump(const Duration(milliseconds: 200));

      await _swipeRight(tester);
      expect(_onstage<GoalsScreen>(), findsOneWidget);
      await _swipeLeft(tester);
      expect(_onstage<AiChatScreen>(), findsOneWidget);

      final restoredComposer =
          tester.widget<TextField>(find.byType(TextField).hitTestable());
      expect(restoredComposer.controller?.text, 'unsent draft');
      final restoredOffset = tester
          .state<ScrollableState>(_assistantMessageList())
          .position
          .pixels;
      expect(restoredOffset, closeTo(savedOffset, 1));
    });
  });
}

Finder _pageView() => find.byType(PageView).hitTestable();

Finder _onstage<T extends Widget>() => find.byType(T).hitTestable();

double _pagePixels(WidgetTester tester) {
  final scrollable = find
      .descendant(
        of: _pageView(),
        matching: find.byWidgetPredicate(
          (widget) =>
              widget is Scrollable &&
              (widget.axisDirection == AxisDirection.right ||
                  widget.axisDirection == AxisDirection.left),
        ),
      )
      .first;
  return tester.state<ScrollableState>(scrollable).position.pixels;
}

Finder _verticalScrollableWithin<T extends Widget>() => find
    .descendant(
      of: _onstage<T>(),
      matching: find.byWidgetPredicate(
        (widget) =>
            widget is Scrollable && widget.axisDirection == AxisDirection.down,
      ),
    )
    .first;

Finder _assistantMessageList() => find
    .descendant(
      of: _onstage<AiChatScreen>(),
      matching: find.byWidgetPredicate(
        (widget) =>
            widget is Scrollable && widget.axisDirection == AxisDirection.down,
      ),
    )
    .first;

Future<void> _swipeLeft(WidgetTester tester) async {
  await tester.flingFrom(
    _swipeOrigin(tester),
    const Offset(-220, 0),
    600,
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 1000));
  await tester.pump();
}

Future<void> _swipeRight(WidgetTester tester) async {
  await tester.flingFrom(
    _swipeOrigin(tester),
    const Offset(220, 0),
    600,
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 1000));
  await tester.pump();
}

Offset _swipeOrigin(WidgetTester tester) {
  final pageRect = tester.getRect(_pageView());
  return Offset(pageRect.center.dx, pageRect.top + 110);
}
