import 'dart:io';
import 'dart:typed_data';
import 'dart:async';
import 'package:calorix/shared/services/camera_service.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import '../scan/support/fake_camera_service.dart';

class _Store extends Tier1MealStore {
  _Store() : super(Directory('.'));
  final meals = <Tier1Meal>[];
  @override
  Future<String> retainGalleryPhoto(String id, Uint8List bytes) async =>
      '/nonexistent-gallery-fixture-$id.jpg';
  @override
  Future<void> save(Tier1Meal meal) async => meals.add(meal.withRevision(1));
  @override
  Future<List<Tier1Meal>> load() async => [...meals];
}

class _Gallery extends FakeCameraService implements GalleryRecovery {
  XFile? selection, recovered;
  @override
  Future<XFile?> recoverGalleryImage() async => recovered;
  @override
  Future<XFile?> pickFromLibrary() async {
    libraryCount++;
    return selection;
  }
}

void main() {
  testWidgets(
      'recovery saves the picked file locally and never dispatches analysis',
      (tester) async {
    final original = File('assets/images/coffee-oatmeal.jpg');
    final camera = _Gallery()..recovered = XFile(original.path);
    final store = _Store();
    await tester.pumpWidget(Tier1App(camera: camera, store: store));
    final timeout = Stopwatch()..start();
    while (store.meals.isEmpty) {
      if (timeout.elapsed > const Duration(seconds: 20)) {
        throw TimeoutException('gallery save');
      }
      await tester.pump(const Duration(milliseconds: 16));
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 3)));
    }
    await tester.pumpAndSettle();
    expect(store.meals.single.cloudConsent, isFalse);
    expect(store.meals.single.metadata['photoSource'], 'gallery');
    expect(camera.libraryCount, 0);
    expect(original.existsSync(), isTrue);
    expect(find.text('Send this photo for analysis?'), findsNothing);
  });
  testWidgets('canceling the gallery works after camera denial without saving',
      (tester) async {
    final camera = _Gallery()..granted = false;
    final store = _Store();
    await tester.pumpWidget(Tier1App(camera: camera, store: store));
    await tester.pumpAndSettle();
    final requests = camera.requestPermissionCount;
    expect(find.byTooltip('Choose from gallery'), findsOneWidget);
    await tester.tap(find.byTooltip('Choose from gallery'));
    await tester.pumpAndSettle();
    expect(camera.libraryCount, 1);
    expect(camera.captureCount, 0);
    expect(camera.requestPermissionCount, requests);
    expect(store.meals, isEmpty);
    expect(find.text('Take photo'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
  });
}
