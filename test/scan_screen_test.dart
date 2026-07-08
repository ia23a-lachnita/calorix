import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/scan/scan_screen.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

Widget _buildScan() {
  return ProviderScope(
    overrides: [
      authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      home: const ScanScreen(),
    ),
  );
}

void main() {
  testWidgets('scan screen renders the handoff camera chrome', (tester) async {
    await tester.pumpWidget(_buildScan());
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Flash · Auto'), findsOneWidget);
    expect(find.text('Meal'), findsOneWidget);
    expect(find.text('Barcode'), findsOneWidget);
    expect(find.text('Label'), findsOneWidget);
    expect(find.text('FRAME YOUR MEAL · TAP ONCE'), findsOneWidget);
    expect(find.text('LIBRARY'), findsOneWidget);
    expect(find.text('RECENT'), findsOneWidget);
    expect(find.byKey(const Key('capture-core-idle')), findsOneWidget);
  });

  testWidgets('flash chip cycles modes', (tester) async {
    await tester.pumpWidget(_buildScan());
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.text('Flash · Auto'));
    await tester.pump();
    expect(find.text('Flash · On'), findsOneWidget);

    await tester.tap(find.text('Flash · On'));
    await tester.pump();
    expect(find.text('Flash · Off'), findsOneWidget);
  });
}
