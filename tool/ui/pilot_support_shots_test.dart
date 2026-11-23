import 'dart:io';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/tier1/pilot_support_screens.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUpAll(() async {
    for (final family in ['Geist', 'GeistMono']) {
      final loader = FontLoader(family);
      for (final weight in ['Regular', 'Medium']) {
        final bytes =
            File('assets/fonts/$family-$weight.ttf').readAsBytesSync();
        loader.addFont(Future.value(ByteData.view(bytes.buffer)));
      }
      await loader.load();
    }
    final root = Platform.environment['FLUTTER_ROOT'];
    if (root != null) {
      final loader = FontLoader('MaterialIcons');
      final bytes = File(
              '$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf')
          .readAsBytesSync();
      loader.addFont(Future.value(ByteData.view(bytes.buffer)));
      await loader.load();
    }
  });
  for (final dark in [false, true]) {
    for (final screen in [
      'ai',
      'profile',
      'account',
      'history',
      'history-entry',
      'permission',
      'loading'
    ]) {
      testWidgets('$screen ${dark ? 'dark' : 'light'}', (tester) async {
        tester.view.physicalSize = const Size(720, 1600);
        tester.view.devicePixelRatio = 2;
        addTearDown(tester.view.reset);
        final page = switch (screen) {
          'ai' =>
            PilotAiScreen(meals: const [], onScan: () {}, onOpenMeal: (_) {}),
          'profile' => PilotProfileScreen(
              themeMode: ThemeMode.system, onThemeChanged: (_) {}, onGoals: () {}),
          'account' => const PilotAccountWelcomeScreen(),
          'history' =>
            PilotCorrectionHistoryScreen(meals: const [], onOpenMeal: (_) {}),
          'history-entry' => PilotCorrectionHistoryScreen(meals: [Tier1Meal(id: 'sample', name: 'Lunch', capturedAt: DateTime(2026, 11, 22), adjustmentHistory: const [{'kind': 'portion', 'at': '2026-11-22T12:00:00Z'}])], onOpenMeal: (_) {}),
          'permission' => PilotPermissionExplanation(onContinue: () {}),
          _ => const PilotLoadingScreen(),
        };
        await tester.pumpWidget(MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: dark ? AppTheme.dark() : AppTheme.light(), home: page));
        await tester.pump();
        await expectLater(
            find.byType(MaterialApp),
            matchesGoldenFile(
                'shots/pilot-$screen-${dark ? 'dark' : 'light'}.png'));
      });
    }
  }
}
