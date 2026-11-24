import 'dart:async';
import 'dart:io';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/tier1/pilot_support_screens.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import '../../test/scan/support/fake_camera_service.dart';

class _PendingScreenshotStore extends Tier1MealStore {
  _PendingScreenshotStore(this.pending) : super(Directory('.'));
  final Completer<List<Tier1Meal>> pending;

  @override
  Future<List<Tier1Meal>> load() => pending.future;
}

void main() {
  setUpAll(() async {
    for (final family in ['Geist', 'GeistMono']) {
      final loader = FontLoader(family);
      final weights = family == 'Geist'
          ? ['Regular', 'Medium', 'SemiBold', 'Bold']
          : ['Regular', 'Medium'];
      for (final weight in weights) {
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
        if (screen == 'loading') {
          tester.platformDispatcher.platformBrightnessTestValue =
              dark ? Brightness.dark : Brightness.light;
          addTearDown(
              tester.platformDispatcher.clearPlatformBrightnessTestValue);
          final pending = Completer<List<Tier1Meal>>();
          await tester.pumpWidget(Tier1App(
            store: _PendingScreenshotStore(pending),
            camera: FakeCameraService(),
          ));
          await tester.pump();
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 450));
          expect(find.text('GETTING READY'), findsOneWidget);
          expect(
            Theme.of(tester
                    .element(find.byKey(const ValueKey('pilot-loading-ring'))))
                .brightness,
            dark ? Brightness.dark : Brightness.light,
          );
          expect(find.textContaining('%'), findsNothing);
          expect(find.textContaining('CLOUD'), findsNothing);
          expect(find.textContaining('SYNC'), findsNothing);
          await expectLater(
            find.byType(Tier1App),
            matchesGoldenFile(
                'shots/pilot-loading-${dark ? 'dark' : 'light'}.png'),
          );
          return;
        }
        final page = switch (screen) {
          'ai' =>
            PilotAiScreen(meals: const [], onScan: () {}, onOpenMeal: (_) {}),
          'profile' => PilotProfileScreen(
              themeMode: ThemeMode.system,
              onThemeChanged: (_) {},
              onGoals: () {}),
          'account' => const PilotAccountWelcomeScreen(),
          'history' =>
            PilotCorrectionHistoryScreen(meals: const [], onOpenMeal: (_) {}),
          'history-entry' => PilotCorrectionHistoryScreen(meals: [
              Tier1Meal(
                  id: 'sample',
                  name: 'Lunch',
                  capturedAt: DateTime(2026, 11, 22),
                  adjustmentHistory: const [
                    {'kind': 'portion', 'at': '2026-11-22T12:00:00Z'}
                  ])
            ], onOpenMeal: (_) {}),
          'permission' => PilotPermissionExplanation(onContinue: () {}),
          _ => const PilotLoadingScreen(),
        };
        await tester.pumpWidget(MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: dark ? AppTheme.dark() : AppTheme.light(),
            home: page));
        await tester.pump();
        await expectLater(
            find.byType(MaterialApp),
            matchesGoldenFile(
                'shots/pilot-$screen-${dark ? 'dark' : 'light'}.png'));
      });
    }
  }
}
