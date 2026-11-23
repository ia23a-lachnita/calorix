import 'package:flutter_test/flutter_test.dart';

/// Opens the actual saved-meal row, even when the calendar pushes it below
/// the viewport. Keeps the navigation test independent of the current date.
Future<void> openSavedMeal(WidgetTester tester, String name) async {
  final meal = find.text(name).first;
  await tester.ensureVisible(meal);
  await tester.pumpAndSettle();
  await tester.tap(meal);
}
