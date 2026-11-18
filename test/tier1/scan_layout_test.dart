import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/workflow_measurements.dart';
import '../scan/support/fake_camera_service.dart';

class _Store extends Tier1MealStore {
  _Store({this.counted = true, this.unestimated = false})
      : super(Directory('.'));
  final bool counted;
  final bool unestimated;
  @override
  Future<List<Tier1Meal>> load() async => [
        if (counted)
          Tier1Meal(
              id: 'layout-only',
              name: 'Synthetic layout fixture',
              capturedAt: DateTime.now(),
              served: Tier1Nutrients(kcal: 420)),
        if (unestimated)
          Tier1Meal(
              id: 'pending-layout-only',
              name: 'Synthetic unestimated fixture',
              capturedAt: DateTime.now(),
              photoPath: '/scan-layout-missing-photo.jpg')
      ];
}

class _SuspendedCamera extends FakeCameraService {
  final result = Completer<XFile?>();
  @override
  Future<XFile?> captureStill() async {
    captureCount++;
    return result.future;
  }
}

Future<({ByteData bytes, int width})> _pixels(
    WidgetTester t, Finder boundary) async {
  final box = t.renderObject<RenderRepaintBoundary>(boundary);
  return (await t.runAsync(() async {
    final image = await box.toImage(pixelRatio: 1);
    final bytes = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
    final width = image.width;
    image.dispose();
    return (bytes: bytes, width: width);
  }))!;
}

void main() {
  setUpAll(() async {
    final font = FontLoader('Geist');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      font.addFont(Future.value(ByteData.sublistView(
          File('assets/fonts/Geist-$weight.ttf').readAsBytesSync())));
    }
    await font.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  for (final size in [const Size(360, 800), const Size(402, 874)]) {
    for (final brightness in Brightness.values) {
      testWidgets('Scan summary at top and hollow shutter at $size $brightness',
          (t) async {
        t.view.physicalSize = size;
        t.view.devicePixelRatio = 1;
        t.platformDispatcher.platformBrightnessTestValue = brightness;
        addTearDown(t.view.reset);
        addTearDown(t.platformDispatcher.clearPlatformBrightnessTestValue);
        final camera = FakeCameraService()..returnNullFile = true;
        await t.pumpWidget(RepaintBoundary(
            key: const Key('scan-screen'),
            child: Tier1App(
                store: _Store(),
                camera: camera,
                workflow: const NoopWorkflowSink())));
        await t.pumpAndSettle();
        final ring = find.byKey(const ValueKey('tier1-capture-ring'));
        final summary = find.byKey(const ValueKey('scan-today-summary'));
        final picture = await _pixels(t, find.byKey(const Key('scan-screen')));
        final center = t.getCenter(ring);
        final offset =
            (center.dy.floor() * picture.width + center.dx.floor()) * 4;
        final scheme = Theme.of(t.element(ring));
        final expected = scheme.scaffoldBackgroundColor;
        expect(picture.bytes.getUint8(offset), (expected.r * 255).round(),
            reason:
                'Shutter center shows the camera/background, not a white disc');
        expect(picture.bytes.getUint8(offset + 1), (expected.g * 255).round());
        expect(picture.bytes.getUint8(offset + 2), (expected.b * 255).round());
        expect(summary, findsOneWidget);
        final header = t.getRect(find.byKey(const ValueKey('tab-header-1')));
        expect(t.getRect(summary).top, greaterThanOrEqualTo(header.bottom));
        expect(t.getRect(summary).bottom, lessThan(size.height * .4));
        expect(find.text('420'), findsOneWidget);
        expect(find.text('1 meal'), findsOneWidget);
        expect(t.getRect(find.text('kcal')).right,
            closeTo(t.getRect(summary).right - 16, 1),
            reason: 'Calorie value is anchored to the summary trailing edge');
        expect(
            t.getRect(ring).bottom, lessThan(t.getRect(find.text('SCAN')).top));
        final isolated = await _pixels(t, ring);
        final middle = (40 * isolated.width + 40) * 4;
        expect(isolated.bytes.getUint8(middle + 3), 0,
            reason:
                'True hole is transparent even over a different live camera image');
        expect(isolated.bytes.getUint8((3 * isolated.width + 40) * 4 + 3),
            greaterThan(0),
            reason: 'Ring stroke remains visible');
        final renderDir = Platform.environment['CALORIX_SCAN_RENDER_DIR'];
        if (renderDir != null) {
          final boundary = t.renderObject<RenderRepaintBoundary>(
              find.byKey(const Key('scan-screen')));
          await t.runAsync(() async {
            final image = await boundary.toImage(pixelRatio: 1);
            final png = await image.toByteData(format: ui.ImageByteFormat.png);
            await Directory(renderDir).create(recursive: true);
            await File(
                    '$renderDir/${size.width.toInt()}-${brightness.name}.png')
                .writeAsBytes(png!.buffer.asUint8List());
            image.dispose();
          });
        }
        await t.tap(summary);
        await t.pumpAndSettle();
        expect(find.text('KCAL EATEN'), findsOneWidget);
        expect(find.text('420'), findsOneWidget);
        expect(camera.captureCount, 0);
        expect(t.takeException(), isNull);
      });
    }
  }
  for (final pending in [false, true]) {
    testWidgets(
        'no top summary for ${pending ? 'an unestimated photo' : 'empty history'}',
        (t) async {
      await t.pumpWidget(Tier1App(
          store: _Store(counted: false, unestimated: pending),
          camera: FakeCameraService(),
          workflow: const NoopWorkflowSink()));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('scan-today-summary')), findsNothing);
      expect(find.byKey(const ValueKey('tier1-capture-ring')), findsOneWidget);
    });
  }
  testWidgets('top summary and shutter remain separate with large text',
      (t) async {
    t.view.physicalSize = const Size(360, 800);
    t.view.devicePixelRatio = 1;
    t.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(t.view.reset);
    addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
    await t.pumpWidget(Tier1App(
        store: _Store(),
        camera: FakeCameraService(),
        workflow: const NoopWorkflowSink()));
    await t.pumpAndSettle();
    final summary = find.byKey(const ValueKey('scan-today-summary'));
    final ring = find.byKey(const ValueKey('tier1-capture-ring'));
    expect(t.getRect(summary).bottom, lessThan(t.getRect(ring).top));
    expect(t.getRect(ring).bottom, lessThan(t.getRect(find.text('SCAN')).top));
    expect(t.takeException(), isNull);
  });
  testWidgets(
      'busy shutter keeps a transparent center and ignores repeat capture',
      (t) async {
    final camera = _SuspendedCamera();
    await t.pumpWidget(Tier1App(
        store: _Store(counted: false),
        camera: camera,
        workflow: const NoopWorkflowSink()));
    await t.pumpAndSettle();
    final ring = find.byKey(const ValueKey('tier1-capture-ring'));
    await t.tap(ring);
    await t.pumpAndSettle();
    final pixels = await _pixels(t, ring);
    expect(pixels.bytes.getUint8((40 * pixels.width + 40) * 4 + 3), 0);
    await t.tap(ring);
    await t.pump();
    expect(camera.captureCount, 1);
    camera.result.complete(null);
    await t.pumpAndSettle();
    expect(find.text('Take photo'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
