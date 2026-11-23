import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:calorix/features/tier1/pilot_theme.dart';

void main() {
  testWidgets('theme choice persists across a fresh wrapper', (tester) async {
    SharedPreferences.setMockInitialValues({});
    Widget app() => PilotTheme(
        builder: (context, mode, setMode) => MaterialApp(
            themeMode: mode,
            home: Scaffold(
                body: TextButton(
                    onPressed: () => setMode(ThemeMode.dark),
                    child: Text(mode.name)))));
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.tap(find.text('system'));
    await tester.pumpAndSettle();
    expect(find.text('dark'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    expect(find.text('dark'), findsOneWidget);
  });
  testWidgets('profile route observes and changes the live theme',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(PilotTheme(
        builder: (context, mode, setMode) => MaterialApp(
              themeMode: mode,
              home: Scaffold(
                  body: Builder(
                      builder: (context) => TextButton(
                          onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute<void>(builder: (context) {
                                final theme = PilotTheme.of(context);
                                return Scaffold(
                                    body: TextButton(
                                        onPressed: () =>
                                            theme.setMode(ThemeMode.dark),
                                        child: Text(theme.mode.name)));
                              })),
                          child: const Text('Profile')))),
            )));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('system'));
    await tester.pumpAndSettle();
    expect(find.text('dark'), findsOneWidget);
  });
}
