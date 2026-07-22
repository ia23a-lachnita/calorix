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

Widget _app(FoodEntry? entry) {
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
      themeMode: ThemeMode.dark,
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
    expect(find.textContaining('DETECTED · LUNCH ·'), findsOneWidget);
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
}
