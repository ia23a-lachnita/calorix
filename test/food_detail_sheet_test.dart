import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/food_detail/food_detail_sheet.dart';
import 'package:calorix/features/food_detail/providers/food_detail_providers.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:calorix/shared/providers/auth_provider.dart';

FoodEntry _entry({
  String? imageUrl,
  String? storagePath,
  FoodEntryStatus status = FoodEntryStatus.complete,
}) =>
    FoodEntry(
      id: 'e1',
      uid: 'u1',
      timestamp: DateTime(2026, 7, 8, 12, 48),
      date: '2026-07-08',
      imageUrl: imageUrl,
      storagePath: storagePath,
      scanMode: 'meal',
      status: status,
      foodName: 'Chicken Rice Bowl',
      kcal: 620,
      protein: 48,
      carbs: 72,
      fat: 16,
      confidence: 0.91,
      detectedItems: const [
        DetectedItem(name: 'Grilled chicken', weight: 120),
        DetectedItem(name: 'Jasmine rice', weight: 180),
      ],
    );

FoodEntry _canonicalEntry({
  String basis = 'package',
  double? nutritionAmount = 500,
  String unit = 'ml',
  double? consumedAmount = 250,
  String? status,
  double servingMultiplier = 9,
  int? packageUnitCount,
  double? unitAmount,
  List<DetectedItem>? detectedItems,
}) =>
    FoodEntry.fromData(
      id: 'e1',
      data: {
        'uid': 'u1',
        'timestamp': DateTime(2026, 7, 8, 12, 48),
        'date': '2026-07-08',
        'scanMode': 'barcode',
        'status':
            status ?? (consumedAmount == null ? 'needs_review' : 'complete'),
        'foodName': 'Vitamin Well Reload',
        'baseKcal': 85.0,
        'baseProtein': 0.0,
        'baseCarbs': 21.0,
        'baseFat': 0.0,
        'servingMultiplier': servingMultiplier,
        'nutritionBasis': basis,
        'nutritionAmount': nutritionAmount,
        'nutritionUnit': unit,
        if (consumedAmount != null) 'consumedAmount': consumedAmount,
        if (packageUnitCount != null) 'packageUnitCount': packageUnitCount,
        if (unitAmount != null) 'unitAmount': unitAmount,
        if (detectedItems != null)
          'detectedItems': detectedItems.map((d) => d.toMap()).toList(),
        'reviewReasons': <String>[],
      },
    );

FoodEntry _invalidCanonicalEntry() => FoodEntry.fromData(
      id: 'e1',
      data: {
        'uid': 'u1',
        'timestamp': DateTime(2026, 7, 8, 12, 48),
        'date': '2026-07-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'foodName': 'Invalid package',
        'baseKcal': 85.0,
        'servingMultiplier': 9.0,
        'nutritionBasis': 'package',
        'nutritionAmount': null,
        'nutritionUnit': 'ml',
        'reviewReasons': <String>[],
      },
    );

Widget _app(
  FoodEntry? entry, {
  ThemeMode themeMode = ThemeMode.dark,
}) {
  return ProviderScope(
    overrides: [
      authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
      foodEntryProvider.overrideWith((ref, id) => Stream.value(entry)),
      storageImageUrlProvider.overrideWith(
          (ref, path) async => 'https://example.com/resolved/$path'),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      home: const FoodDetailSheet(entryId: 'e1'),
    ),
  );
}

Future<void> _pump(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets('seed fixtures with asset urls render via Image.asset',
      (tester) async {
    await tester.pumpWidget(
        _app(_entry(imageUrl: 'assets/images/chicken_rice_bowl_square.jpg')));
    await _pump(tester);

    // Regression: asset paths were fed into CachedNetworkImage and broke.
    expect(find.byType(CachedNetworkImage), findsNothing);
    final image = tester.widget<Image>(find.byType(Image).first);
    expect(image.image, isA<AssetImage>());
  });

  testWidgets('real scans resolve their storage path to the actual photo',
      (tester) async {
    await tester.pumpWidget(_app(_entry(storagePath: 'scans/u1/e1.jpg')));
    await _pump(tester);

    // Regression: entries without imageUrl fell back to a gradient preset
    // even though the scan photo exists in Cloud Storage.
    expect(find.byType(CachedNetworkImage), findsOneWidget);
    // The fake URL cannot actually load in tests; swallow the codec error.
    tester.takeException();
  });

  testWidgets('detail sheet renders handoff structure', (tester) async {
    await tester.pumpWidget(_app(_entry(storagePath: 'scans/u1/e1.jpg')));
    await _pump(tester);

    expect(find.text('Chicken Rice Bowl'), findsOneWidget);
    expect(find.text('CALORIES'), findsOneWidget);
    expect(find.text('DETECTED · '), findsOneWidget);
    expect(find.text('LUNCH'), findsOneWidget);
    expect(find.text('AI · 91% CONFIDENCE'), findsOneWidget);
    expect(find.textContaining('% of protein target'), findsOneWidget);

    // Regression: progress fill collapsed to zero height in the loose Stack.
    final fill =
        tester.getSize(find.byKey(const Key('macro-progress-fill-Protein')));
    expect(fill.height, 4);
    expect(fill.width, greaterThan(0));

    // Lower content builds lazily; scroll it into view.
    await tester.drag(find.byType(ListView), const Offset(0, -400));
    await _pump(tester);
    expect(find.text('DETECTED ITEMS · TAP TO ADJUST'), findsOneWidget);
    expect(find.text('Not right? Ask AI to fix this'), findsOneWidget);
    tester.takeException();
  });

  testWidgets('missing entry renders an explicit unavailable state',
      (tester) async {
    await tester.pumpWidget(_app(null));
    await _pump(tester);

    expect(find.text('Food entry no longer exists'), findsOneWidget);
    expect(find.text('Back'), findsOneWidget);
  });

  for (final themeMode in [ThemeMode.dark, ThemeMode.light]) {
    testWidgets(
        '${themeMode.name} detail theme renders the full action surface',
        (tester) async {
      await tester.pumpWidget(_app(_entry(), themeMode: themeMode));
      await _pump(tester);

      expect(find.text('Chicken Rice Bowl'), findsOneWidget);
      expect(find.text('Edit'), findsOneWidget);
      expect(find.byIcon(Icons.copy_outlined), findsOneWidget);
      expect(find.byIcon(Icons.delete_outline), findsOneWidget);
    });
  }

  testWidgets('unsaved serving edit prompts before destructive exit',
      (tester) async {
    await tester.pumpWidget(_app(_entry()));
    await _pump(tester);

    await tester.tap(find.text('Edit'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('serving-increment')));
    await tester.pump();
    await tester.binding.handlePopRoute();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Discard changes?'), findsOneWidget);
    expect(find.text('Keep editing'), findsOneWidget);
    expect(find.text('Discard'), findsOneWidget);

    await tester.tap(find.text('Keep editing'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Save to Today'), findsOneWidget);
  });

  final presentationCases = <(String, FoodEntry, List<String>)>[
    ('package ml', _canonicalEntry(), ['500 ml bottle', '250 ml']),
    (
      'package g',
      _canonicalEntry(
        nutritionAmount: 250,
        unit: 'g',
        consumedAmount: 125,
      ),
      ['250 g pack', '125 g'],
    ),
    (
      'agreeing multipack',
      _canonicalEntry(
        nutritionAmount: 1500,
        consumedAmount: 1500,
        packageUnitCount: 6,
        unitAmount: 250,
      ),
      ['6 × 250 ml · whole pack', '1500 ml'],
    ),
    (
      'contradictory multipack fallback',
      _canonicalEntry(
        nutritionAmount: 1500,
        consumedAmount: 1500,
        packageUnitCount: 6,
        unitAmount: 300,
      ),
      ['1500 ml bottle', '1500 ml'],
    ),
    (
      'portion',
      _canonicalEntry(
        basis: 'portion',
        nutritionAmount: 1,
        unit: 'portion',
        consumedAmount: 1,
      ),
      ['full visible portion', '1 portion'],
    ),
    (
      'resolved per-100',
      _canonicalEntry(
        basis: 'per100g',
        nutritionAmount: 100,
        unit: 'g',
        consumedAmount: 150,
      ),
      ['100 g reference', '150 g'],
    ),
    (
      'decimal package amount',
      _canonicalEntry(
        nutritionAmount: 250.5,
        unit: 'g',
        consumedAmount: 125.25,
      ),
      ['250.5 g pack', '125.25 g'],
    ),
  ];
  for (final (name, entry, labels) in presentationCases) {
    testWidgets('view mode formats $name canonical amount', (tester) async {
      await tester.pumpWidget(_app(entry));
      await _pump(tester);
      for (final label in labels) {
        expect(find.text(label), findsOneWidget, reason: name);
      }
      expect(find.byKey(const Key('canonical-amount-control')), findsNothing);
      expect(find.byKey(const Key('legacy-serving-stepper')), findsNothing);
    });
  }

  testWidgets('unresolved per-100 amount fails closed in view mode',
      (tester) async {
    await tester.pumpWidget(
      _app(_canonicalEntry(
        basis: 'per100g',
        nutritionAmount: 100,
        unit: 'g',
        consumedAmount: null,
      )),
    );
    await _pump(tester);
    expect(find.text('100 g reference · amount required'), findsOneWidget);
    expect(find.text('Amount required'), findsOneWidget);
    expect(find.textContaining('9 serving'), findsNothing);
  });

  testWidgets('invalid canonical tuple is unavailable in view mode',
      (tester) async {
    await tester.pumpWidget(_app(_invalidCanonicalEntry()));
    await _pump(tester);
    expect(find.text('Amount unavailable'), findsNWidgets(2));
    expect(find.textContaining('9 serving'), findsNothing);
    expect(find.byKey(const Key('canonical-amount-control')), findsNothing);
    expect(find.byKey(const Key('legacy-serving-stepper')), findsNothing);
  });

  testWidgets('edit mode exposes only canonical amount controls',
      (tester) async {
    await tester.pumpWidget(_app(_canonicalEntry()));
    await _pump(tester);
    await tester.tap(find.text('Edit'));
    await tester.pump();
    expect(find.byKey(const Key('canonical-amount-control')), findsOneWidget);
    expect(find.byKey(const Key('legacy-serving-stepper')), findsNothing);
    expect(find.byKey(const Key('serving-increment')), findsNothing);
    expect(find.byKey(const Key('serving-decrement')), findsNothing);
  });

  testWidgets('edit mode exposes only the legacy quarter-step control',
      (tester) async {
    await tester.pumpWidget(_app(_entry()));
    await _pump(tester);
    await tester.tap(find.text('Edit'));
    await tester.pump();
    expect(find.byKey(const Key('legacy-serving-stepper')), findsOneWidget);
    expect(find.byKey(const Key('canonical-amount-control')), findsNothing);
    expect(find.byKey(const Key('serving-increment')), findsOneWidget);
    expect(find.byKey(const Key('serving-decrement')), findsOneWidget);
  });

  testWidgets('invalid canonical tuple exposes no amount control',
      (tester) async {
    await tester.pumpWidget(_app(_invalidCanonicalEntry()));
    await _pump(tester);
    await tester.tap(find.text('Edit'));
    await tester.pump();
    expect(find.byKey(const Key('canonical-amount-control')), findsNothing);
    expect(find.byKey(const Key('legacy-serving-stepper')), findsNothing);
    expect(find.byKey(const Key('serving-increment')), findsNothing);
  });

  testWidgets(
      'Vitamin Well display and base edits use 250 over 500 and ignore multiplier 9',
      (tester) async {
    await tester.pumpWidget(_app(_canonicalEntry()));
    await _pump(tester);

    expect(find.text('43'), findsOneWidget);
    expect(find.text('11'), findsOneWidget);
    expect(find.text('765'), findsNothing);

    await tester.tap(find.text('Edit'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('kcal-editor')));
    await _pump(tester);
    await tester.enterText(find.byType(TextField).last, '50');
    await tester.tap(find.text('Done'));
    await _pump(tester);

    final pending = ProviderScope.containerOf(
      tester.element(find.byType(FoodDetailSheet)),
    ).read(pendingEditsProvider('e1'));
    expect(pending.kcal, 100);
    expect(pending.servingMultiplier, isNull);
  });

  testWidgets(
      'canonical amount editor preserves exact input and rescales totals',
      (tester) async {
    await tester.pumpWidget(_app(_canonicalEntry()));
    await _pump(tester);
    await tester.tap(find.text('Edit'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('canonical-amount-control')));
    await _pump(tester);
    await tester.enterText(find.byType(TextField).last, '500');
    await tester.tap(find.text('Done'));
    await _pump(tester);

    final pending = ProviderScope.containerOf(
      tester.element(find.byType(FoodDetailSheet)),
    ).read(pendingEditsProvider('e1'));
    expect(pending.consumedAmount, 500);
    expect(pending.servingMultiplier, isNull);
    expect(find.text('85'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(
          const Key('macro-editor-Carbs'),
          skipOffstage: false,
        ),
        matching: find.text('21', skipOffstage: false),
      ),
      findsOneWidget,
    );
  });

  testWidgets('unresolved canonical amount must be supplied before base edits',
      (tester) async {
    await tester.pumpWidget(
      _app(_canonicalEntry(
        basis: 'per100g',
        nutritionAmount: 100,
        unit: 'g',
        consumedAmount: null,
      )),
    );
    await _pump(tester);
    await tester.tap(find.text('Edit'));
    await tester.pump();

    expect(find.byKey(const Key('canonical-amount-control')), findsOneWidget);
    await tester.tap(find.byKey(const Key('kcal-editor')));
    await _pump(tester);
    expect(find.text('Edit calories'), findsNothing);
  });

  for (final invalid in ['0', '-1', 'NaN', 'Infinity', '-Infinity', 'abc']) {
    testWidgets('canonical amount editor rejects $invalid', (tester) async {
      await tester.pumpWidget(_app(_canonicalEntry()));
      await _pump(tester);
      await tester.tap(find.text('Edit'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('canonical-amount-control')));
      await _pump(tester);
      await tester.enterText(find.byType(TextField).last, invalid);
      await tester.tap(find.text('Done'));
      await _pump(tester);

      expect(find.byType(TextField), findsOneWidget);
      final pending = ProviderScope.containerOf(
        tester.element(find.byType(FoodDetailSheet)),
      ).read(pendingEditsProvider('e1'));
      expect(pending.consumedAmount, isNull);
    });
  }

  testWidgets('edit mode exposes and applies direct nutrition inputs',
      (tester) async {
    tester.view.physicalSize = const Size(800, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(_app(_entry()));
    await _pump(tester);

    await tester.tap(find.text('Edit'));
    await tester.pump();
    expect(find.text('Undo'), findsOneWidget);
    expect(find.text('Save to Today'), findsOneWidget);

    await tester.tap(find.byKey(const Key('kcal-editor')));
    await _pump(tester);
    expect(find.text('Edit calories'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, '700');
    tester.testTextInput.hide();
    await tester.pump();
    await tester.drag(
      find.byType(SingleChildScrollView).last,
      const Offset(0, -360),
    );
    await tester.pump();
    await tester.tap(find.text('Done'));
    await _pump(tester);
    expect(find.text('700'), findsOneWidget);

    await tester.tap(find.byKey(const Key('macro-editor-Protein')));
    await _pump(tester);
    expect(find.text('Edit Protein (g)'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, '50');
    tester.testTextInput.hide();
    await tester.pump();
    await tester.drag(
      find.byType(SingleChildScrollView).last,
      const Offset(0, -360),
    );
    await tester.pump();
    await tester.tap(find.text('Done'));
    await _pump(tester);
    expect(find.text('50'), findsOneWidget);
  });

  testWidgets('edit mode changes name and meal type inline', (tester) async {
    tester.view.physicalSize = const Size(800, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(_app(_entry()));
    await _pump(tester);
    await tester.tap(find.text('Edit'));
    await tester.pump();

    await tester.tap(find.byKey(const Key('food-name-editor')));
    await _pump(tester);
    await tester.enterText(find.byType(TextField).last, 'Teriyaki bowl');
    tester.testTextInput.hide();
    await tester.pump();
    await tester.drag(
      find.byType(SingleChildScrollView).last,
      const Offset(0, -360),
    );
    await tester.pump();
    await tester.tap(find.text('Done'));
    await _pump(tester);
    expect(find.text('Teriyaki bowl'), findsOneWidget);

    await tester.tap(find.byKey(const Key('meal-type-editor')));
    await _pump(tester);
    await tester.tap(find.text('Dinner').last);
    await _pump(tester);
    expect(find.textContaining('DINNER'), findsOneWidget);
  });

  testWidgets('detected items can be adjusted and added in edit mode',
      (tester) async {
    tester.view.physicalSize = const Size(800, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(_app(_entry()));
    await _pump(tester);
    await tester.tap(find.text('Edit'));
    await tester.scrollUntilVisible(
      find.byKey(const Key('detected-item-0')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('detected-item-0')));
    await _pump(tester);
    expect(find.text('Edit detected item'), findsOneWidget);
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(1), '140');
    tester.testTextInput.hide();
    await tester.pump();
    await tester.drag(
      find.byType(SingleChildScrollView).last,
      const Offset(0, -420),
    );
    await tester.pump();
    await tester.tap(find.text('Done'));
    await _pump(tester);
    expect(find.text('140g'), findsOneWidget);

    await tester.tap(find.byKey(const Key('add-detected-item')));
    await _pump(tester);
    expect(find.text('Add detected item'), findsOneWidget);
    await tester.enterText(find.byType(TextField).at(0), 'Broccoli');
    await tester.enterText(find.byType(TextField).at(1), '80');
    tester.testTextInput.hide();
    await tester.pump();
    await tester.drag(
      find.byType(SingleChildScrollView).last,
      const Offset(0, -420),
    );
    await tester.pump();
    await tester.tap(find.text('Add'));
    await _pump(tester);
    expect(find.text('Broccoli'), findsOneWidget);
    expect(find.text('80g'), findsOneWidget);
  });

  for (final status in [
    FoodEntryStatus.pending,
    FoodEntryStatus.processing,
  ]) {
    testWidgets('${status.name} entries hide edit controls', (tester) async {
      await tester.pumpWidget(_app(_entry(status: status)));
      await _pump(tester);

      expect(find.text('Edit'), findsNothing);
      expect(find.text('Save to Today'), findsNothing);
    });
  }

  testWidgets(
      'tapping asset hero image opens full-screen viewer with same AssetImage',
      (tester) async {
    await tester.pumpWidget(
      _app(_entry(imageUrl: 'assets/images/chicken_rice_bowl_square.jpg')),
    );
    await _pump(tester);

    final heroImage = tester.widget<Image>(find.byType(Image).first);
    expect(heroImage.image, isA<AssetImage>());
    final assetName = (heroImage.image as AssetImage).assetName;

    expect(find.byKey(const Key('food-image-viewer')), findsNothing);
    await tester.tap(find.byType(Image).first);
    await _pump(tester);

    expect(find.byKey(const Key('food-image-viewer')), findsOneWidget);

    final viewerImage =
        tester.widget<Image>(find.byKey(const Key('food-image-viewer')));
    expect(viewerImage.image, isA<AssetImage>());
    expect((viewerImage.image as AssetImage).assetName, assetName);
    expect(viewerImage.fit, BoxFit.contain);

    final interactive =
        tester.widget<InteractiveViewer>(find.byType(InteractiveViewer));
    expect(interactive.minScale, 1.0);
    expect(interactive.maxScale, 4.0);

    expect(find.byKey(const Key('food-image-viewer-close')), findsOneWidget);
    await tester.tap(find.byKey(const Key('food-image-viewer-close')));
    await _pump(tester);
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byKey(const Key('food-image-viewer')), findsNothing);
    expect(find.text('Chicken Rice Bowl'), findsOneWidget);
  });

  testWidgets('fallback hero for entry with no image is not tappable',
      (tester) async {
    await tester.pumpWidget(_app(_entry()));
    await _pump(tester);

    expect(find.byType(Image), findsNothing);
    expect(find.byKey(const Key('food-image-viewer')), findsNothing);

    await tester.tapAt(const Offset(180, 160));
    await _pump(tester);

    expect(find.byKey(const Key('food-image-viewer')), findsNothing);
  });

  testWidgets(
      'original scan precedence: storagePath wins over product imageUrl',
      (tester) async {
    await tester.pumpWidget(_app(
      _entry(
        imageUrl: 'https://product-catalog.example.com/chicken_rice.jpg',
        storagePath: 'scans/u1/e1.jpg',
      ),
    ));
    await _pump(tester);

    // Regression: current production picks imageUrl first, but real scans
    // must render the resolved storage path (the user's actual photo).
    expect(find.byType(CachedNetworkImage), findsOneWidget);
    final cachedImage =
        tester.widget<CachedNetworkImage>(find.byType(CachedNetworkImage));
    expect(
        cachedImage.imageUrl, 'https://example.com/resolved/scans/u1/e1.jpg');
    tester.takeException();
  });

  testWidgets(
      'canonical package with detected items shows item count, weight, and consumed',
      (tester) async {
    final entry = _canonicalEntry(
      nutritionAmount: 500,
      unit: 'ml',
      consumedAmount: 250,
      detectedItems: const [
        DetectedItem(name: 'Water', weight: 150),
        DetectedItem(name: 'Flavoring', weight: 150),
      ],
    );
    await tester.pumpWidget(_app(entry));
    await _pump(tester);

    expect(find.text('2 items · ≈ 300g'), findsOneWidget);
    expect(find.text('500 ml bottle'), findsOneWidget);
    expect(find.text('250 ml'), findsOneWidget);
  });

  for (final (name, malformedValue) in [
    ('NaN', double.nan),
    ('Infinity', double.infinity),
    ('-Infinity', double.negativeInfinity),
    ('-1', -1.0),
    ('0', 0.0),
    ('1000000001', 1000000001.0),
  ]) {
    testWidgets(
        'malformed persisted consumedAmount $name does not throw in edit mode',
        (tester) async {
      final entry = _canonicalEntry(
        consumedAmount: malformedValue,
      );
      await tester.pumpWidget(_app(entry));
      await _pump(tester);

      await tester.tap(find.text('Edit'));
      await tester.pump();

      expect(find.byKey(const Key('canonical-amount-control')), findsOneWidget);
      expect(
        find.textContaining('Set amount'),
        findsOneWidget,
        reason:
            'malformed consumedAmount $name must display Set amount in edit mode',
      );
      expect(find.byKey(const Key('legacy-serving-stepper')), findsNothing);

      await tester.tap(find.byKey(const Key('canonical-amount-control')));
      await _pump(tester);

      final textFields = find.byType(TextField);
      expect(textFields, findsOneWidget);
      final field = tester.widget<TextFormField>(find.byType(TextFormField));
      expect(field.initialValue, isEmpty,
          reason: 'editor must open empty for malformed consumedAmount $name');
    });
  }
}
