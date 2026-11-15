// Renders the Tier1 screens to PNG files with the app's real fonts, so the
// UI can be looked at without a phone or emulator. Not part of `flutter test`
// (it lives outside test/). Run from the repo root:
//
//   flutter test --update-goldens tool/ui/tier1_shots_test.dart
//
// Output: tool/ui/shots/<state>-<light|dark>.png at 390x844 logical, 2x.
import 'dart:io';

import 'package:calorix/core/time/clock.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../test/scan/support/fake_camera_service.dart';

class _FixedClock implements Clock {
  @override
  DateTime now() => DateTime(2026, 11, 14, 20);
  @override
  tz.TZDateTime nowTZ() => tz.TZDateTime.from(now(), tz.UTC);
}

class _MemoryStore extends Tier1MealStore {
  _MemoryStore() : super(Directory('.'));
  final List<Tier1Meal> records = [];
  @override
  Future<List<Tier1Meal>> load() async => List.of(records);
  @override
  Future<void> save(Tier1Meal meal) async {
    records.removeWhere((m) => m.id == meal.id);
    records.add(meal.withRevision(meal.revision + 1));
  }
}

// Synthetic arithmetic fixture, not a measured meal. Totals equal the exact
// component sums so the record passes Tier1Meal validation.
Map<String, dynamic> _analysis({bool question = true}) {
  Map<String, dynamic> component(String name, double mass, String preparation,
          Map<String, dynamic> nutrients,
          {List<String> assumptions = const [],
          String kind = 'unverified_vlm_estimate',
          String? recordId}) =>
      {
        'name': name,
        'massG': mass,
        'preparation': preparation,
        'assumptions': assumptions,
        'nutrients': nutrients,
        'source': {'kind': kind, 'recordId': recordId},
      };
  return {
    'schemaVersion': 1,
    'mealName': 'Chicken rice bowl',
    'totals': {'kcal': 459.0, 'proteinG': 44.4, 'carbsG': 56.1, 'fatG': 5.1},
    'components': [
      component('Chicken breast', 120, 'grilled',
          {'kcal': 198.0, 'proteinG': 37.2, 'carbsG': 0.0, 'fatG': 4.3},
          assumptions: ['Skinless; no visible sauce']),
      component('White rice', 180, 'boiled',
          {'kcal': 234.0, 'proteinG': 4.9, 'carbsG': 50.8, 'fatG': 0.5},
          kind: 'database_match', recordId: 'usda:169756'),
      component('Broccoli', 80, 'steamed',
          {'kcal': 27.0, 'proteinG': 2.3, 'carbsG': 5.3, 'fatG': 0.3}),
    ],
    'ambiguities': <String>['Rice variety uncertain (white or jasmine)'],
    'question': question
        ? {
            'id': 'added-fat',
            'text': 'Was oil added while cooking?',
            'answered': false,
            'answer': null,
            'options': [
              {
                'id': 'oil_10g',
                'label': 'About 2 tsp oil (10 g)',
                'add': {
                  'kcal': 88.4,
                  'proteinG': 0.0,
                  'carbsG': 0.0,
                  'fatG': 10.0
                },
                'component': {
                  'name': 'Additional oil',
                  'massG': 10.0,
                  'preparation': 'oil',
                  'assumptions': <String>[],
                  'nutrients': {
                    'kcal': 88.4,
                    'proteinG': 0.0,
                    'carbsG': 0.0,
                    'fatG': 10.0
                  },
                  'source': {
                    'kind': 'database_match',
                    'recordId': 'usda:171413'
                  }
                }
              },
              {
                'id': 'none',
                'label': 'No added oil',
                'add': {
                  'kcal': 0.0,
                  'proteinG': 0.0,
                  'carbsG': 0.0,
                  'fatG': 0.0
                },
                'component': null
              },
            ]
          }
        : null,
    'provenance': {
      'model': 'fixture-only',
      'promptSha256': 'fixture-original',
      'catalogVersion': 'fixture'
    },
    'rawInventory': {'fixture': true, 'original': true},
  };
}

Future<void> _loadFonts() async {
  Future<void> family(String name, List<String> paths) async {
    final loader = FontLoader(name);
    for (final path in paths) {
      final bytes = File(path).readAsBytesSync();
      loader.addFont(Future.value(ByteData.view(bytes.buffer)));
    }
    await loader.load();
  }

  const dir = 'assets/fonts';
  await family('Geist', [
    for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold'])
      '$dir/Geist-$w.ttf'
  ]);
  await family(
      'GeistMono', ['$dir/GeistMono-Regular.ttf', '$dir/GeistMono-Medium.ttf']);
  await family('BarlowCondensed', [
    for (final w in ['Regular', 'Medium', 'SemiBold', 'Bold'])
      '$dir/BarlowCondensed-$w.ttf'
  ]);
  await family('Barlow', [
    for (final w in ['Light', 'Regular', 'Medium', 'SemiBold', 'Bold'])
      '$dir/Barlow-$w.ttf'
  ]);
  final root = Platform.environment['FLUTTER_ROOT'];
  final icons = File(
      '$root/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
  if (root != null && icons.existsSync()) {
    await family('MaterialIcons', [icons.path]);
  }
}

Future<_MemoryStore> _storeWithMeals() async {
  final store = _MemoryStore();
  await store.save(Tier1Meal(
          id: 'a',
          capturedAt: DateTime(2026, 11, 14, 12, 30),
          name: 'Chicken rice bowl',
          served: Tier1Nutrients(
              kcal: 459, proteinG: 44.4, carbsG: 56.1, fatG: 5.1))
      .confirmConsumption(1));
  await store.save(Tier1Meal(
      id: 'b',
      capturedAt: DateTime(2026, 11, 14, 8, 5),
      name: 'Oat porridge with banana',
      served: Tier1Nutrients(kcal: 380, proteinG: 12, carbsG: 68, fatG: 7.5)));
  await store.save(Tier1Meal(
      id: 'c',
      capturedAt: DateTime(2026, 11, 13, 19, 10),
      name: 'Spaghetti bolognese',
      served: Tier1Nutrients(kcal: 720)));
  return store;
}

void main() {
  setUpAll(_loadFonts);

  for (final brightness in Brightness.values) {
    final mode = brightness.name;

    Future<void> boot(WidgetTester tester, Tier1MealStore store) async {
      tester.view.physicalSize = const Size(780, 1688);
      tester.view.devicePixelRatio = 2;
      tester.platformDispatcher.platformBrightnessTestValue = brightness;
      addTearDown(tester.view.reset);
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      await tester.pumpWidget(Tier1App(
          store: store,
          camera: FakeCameraService(),
          // fixed, so the Today and Yesterday headers do not depend on the run date
          clock: _FixedClock()));
      await tester.pumpAndSettle();
    }

    Future<void> shot(WidgetTester tester, String name) => expectLater(
        find.byType(MaterialApp), matchesGoldenFile('shots/$name-$mode.png'));

    testWidgets('home, no meals ($mode)', (tester) async {
      await boot(tester, _MemoryStore());
      await shot(tester, '01-home-empty');
    });

    testWidgets('manual entry ($mode)', (tester) async {
      await boot(tester, _MemoryStore());
      await tester.tap(find.text('Manual entry'));
      await tester.pumpAndSettle();
      await shot(tester, '02-manual-entry');
    });

    testWidgets('photo estimate with recognized foods and a question ($mode)',
        (tester) async {
      final store = _MemoryStore();
      await store.save(Tier1Meal(
          id: 'p',
          capturedAt: DateTime(2026, 11, 14, 12, 30),
          name: 'Chicken rice bowl',
          source: 'photo',
          cloudConsent: true,
          analysis: _analysis(),
          served: Tier1Nutrients(
              kcal: 459, proteinG: 44.4, carbsG: 56.1, fatG: 5.1)));
      await boot(tester, store);
      await tester.tap(find.text('History'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Chicken rice bowl'));
      await tester.pumpAndSettle();
      await shot(tester, '06-estimate-top');
      await tester.drag(find.byType(ListView).first, const Offset(0, -700));
      await tester.pumpAndSettle();
      await shot(tester, '07-estimate-foods');
      await tester.drag(find.byType(ListView).first, const Offset(0, -700));
      await tester.pumpAndSettle();
      await shot(tester, '08-estimate-more');
      await tester.drag(find.byType(ListView).first, const Offset(0, 2000));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit totals'));
      await tester.pumpAndSettle();
      await shot(tester, '09-edit-totals');
    });

    testWidgets('portion and food dialogs ($mode)', (tester) async {
      final store = _MemoryStore();
      await store.save(Tier1Meal(
          id: 'p',
          capturedAt: DateTime(2026, 11, 14, 12, 30),
          name: 'Chicken rice bowl',
          source: 'photo',
          cloudConsent: true,
          analysis: _analysis(),
          served: Tier1Nutrients(
              kcal: 459, proteinG: 44.4, carbsG: 56.1, fatG: 5.1)));
      await boot(tester, store);
      await tester.tap(find.text('History'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Chicken rice bowl'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Edit portion').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit portion').first);
      await tester.pumpAndSettle();
      await shot(tester, '10-portion-dialog');
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Change food').first);
      await tester.pumpAndSettle();
      await shot(tester, '11-food-dialog');
    });

    testWidgets('home with meals, then a meal opened ($mode)', (tester) async {
      await boot(tester, await _storeWithMeals());
      await shot(tester, '03-home-meals');
      await tester.tap(find.text('History'));
      await tester.pumpAndSettle();
      await shot(tester, '04-history');
      final meal = find.text('Chicken rice bowl');
      if (meal.evaluate().isNotEmpty) {
        await tester.tap(meal.first);
        await tester.pumpAndSettle();
        await shot(tester, '05-meal-open');
      }
    });
  }
}
