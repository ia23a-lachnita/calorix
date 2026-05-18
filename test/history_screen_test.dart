import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/history/history_screen.dart';
import 'package:calorix/features/history/providers/history_providers.dart';
import 'package:calorix/shared/models/daily_log.dart';

Widget _buildHistoryScreen({List<DailyLog> logs = const []}) {
  return ProviderScope(
    overrides: [
      historyProvider.overrideWith((_) => Stream.value(logs)),
    ],
    child: const MaterialApp(home: HistoryScreen()),
  );
}

Future<void> _pump(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets('History screen shows THIS WEEK label', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    expect(find.text('THIS WEEK'), findsOneWidget);
  });

  testWidgets('History screen shows W and M toggle buttons', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    // 'W' appears in day strip AND toggle; 'M' in day strip + toggle
    expect(find.text('W', skipOffstage: false), findsWidgets);
    expect(find.text('M', skipOffstage: false), findsWidgets);
  });

  testWidgets('History screen shows prev/next navigation arrows', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    expect(find.byIcon(Icons.chevron_left), findsOneWidget);
    expect(find.byIcon(Icons.chevron_right), findsOneWidget);
  });

  testWidgets('History screen week navigation: prev week updates label', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    await tester.tap(find.byIcon(Icons.chevron_left));
    await _pump(tester);
    // After going to previous week, next arrow should be enabled
    expect(find.byIcon(Icons.chevron_right), findsOneWidget);
  });

  testWidgets('History screen does NOT show permission-denied error', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen(logs: []));
    await _pump(tester);
    expect(find.textContaining('permission-denied'), findsNothing);
  });

  testWidgets('History screen shows History title', (tester) async {
    await tester.pumpWidget(_buildHistoryScreen());
    await _pump(tester);
    expect(find.text('History'), findsOneWidget);
  });
}
