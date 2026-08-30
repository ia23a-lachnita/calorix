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
}
