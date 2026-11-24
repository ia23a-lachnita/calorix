import 'support/dashboard_navigation.dart';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/tier1/meal_photo.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/workflow_measurements.dart';
import '../scan/support/fake_camera_service.dart';

class _Store extends Tier1MealStore {
  _Store(this.meal) : super(Directory('.'));
  final Tier1Meal meal;
  var saves = 0;
  @override
  Future<List<Tier1Meal>> load() async => [meal];
  @override
  Future<void> save(Tier1Meal meal) async {
    saves++;
  }
}

Future<void> _loadPhoto(WidgetTester t) async {
  final image = t.widget<Image>(find.byType(Image).first);
  final stream = image.image.resolve(
      createLocalImageConfiguration(t.element(find.byType(Image).first)));
  var settled = false;
  final listener = ImageStreamListener((info, _) {
    settled = true;
    info.dispose();
  }, onError: (_, __) {
    settled = true;
  });
  stream.addListener(listener);
  final deadline = Stopwatch()..start();
  // File I/O completes in real time; pump its queued test-zone continuations.
  while (!settled && deadline.elapsed < const Duration(seconds: 10)) {
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 1)));
    await t.pump();
  }
  stream.removeListener(listener);
  expect(settled, isTrue,
      reason: 'Image load must settle before inspecting pixels');
  await t.pumpAndSettle();
}

Future<void> _edges(WidgetTester t, Size source) async {
  final box =
      t.renderObject<RenderRepaintBoundary>(find.byKey(const Key('preview')));
  final pixels = (await t.runAsync(() async {
    final capture = await box.toImage(pixelRatio: 1);
    final data =
        (await capture.toByteData(format: ui.ImageByteFormat.rawRgba))!;
    final width = capture.width;
    capture.dispose();
    return (data: data, width: width);
  }))!;
  final bytes = pixels.data;
  final fitted = applyBoxFit(BoxFit.contain, source, box.size).destination;
  final rect = Alignment.center.inscribe(fitted, Offset.zero & box.size);
  final x = rect.center.dx.floor();
  final top = (rect.top + rect.height * .08).floor();
  final bottom = (rect.bottom - rect.height * .08).floor();
  final red = (top * pixels.width + x) * 4;
  final blue = (bottom * pixels.width + x) * 4;
  expect(bytes.getUint8(red), greaterThan(220),
      reason: 'Original top edge visible');
  expect(bytes.getUint8(red + 2), lessThan(30));
  expect(bytes.getUint8(blue + 2), greaterThan(220),
      reason: 'Original bottom edge visible');
  expect(bytes.getUint8(blue), lessThan(30));
  final left = (rect.center.dy.floor() * pixels.width +
          (rect.left + rect.width * .075).floor()) *
      4;
  final right = (rect.center.dy.floor() * pixels.width +
          (rect.right - rect.width * .075).floor()) *
      4;
  expect(bytes.getUint8(left + 1), greaterThan(220),
      reason: 'Original left edge visible');
  expect(bytes.getUint8(left), lessThan(30));
  expect(bytes.getUint8(left + 2), lessThan(30));
  expect(bytes.getUint8(right), greaterThan(220),
      reason: 'Original right edge visible');
  expect(bytes.getUint8(right + 1), greaterThan(220));
  expect(bytes.getUint8(right + 2), lessThan(30));
}

Future<void> _render(WidgetTester t, String name) async {
  final destination = Platform.environment['CALORIX_PHOTO_RENDER_DIR'];
  if (destination == null) return;
  final box =
      t.renderObject<RenderRepaintBoundary>(find.byKey(const Key('screen')));
  await t.runAsync(() async {
    final capture = await box.toImage(pixelRatio: 1);
    final png = await capture.toByteData(format: ui.ImageByteFormat.png);
    await Directory(destination).create(recursive: true);
    await File('$destination/$name.png')
        .writeAsBytes(png!.buffer.asUint8List());
    capture.dispose();
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  final photos = <String, File>{};
  setUpAll(() async {
    root = await Directory.systemTemp.createTemp('meal-photo-test-');
    final loader = FontLoader('Geist');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      final bytes = File('assets/fonts/Geist-$weight.ttf').readAsBytesSync();
      loader.addFont(Future.value(ByteData.sublistView(bytes)));
    }
    await loader.load();
    final icons = FontLoader('MaterialIcons');
    icons.addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
    for (final portrait in [true, false]) {
      final width = portrait ? 120 : 240, height = portrait ? 240 : 120;
      final recorder = ui.PictureRecorder(), paint = Paint();
      final canvas = Canvas(recorder);
      canvas.drawRect(Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
          paint..color = const Color(0xff778899));
      canvas.drawRect(Rect.fromLTWH(0, 0, width.toDouble(), height * .2),
          paint..color = const Color(0xffff0000));
      canvas.drawRect(
          Rect.fromLTWH(0, height * .8, width.toDouble(), height * .2),
          paint..color = const Color(0xff0000ff));
      canvas.drawRect(Rect.fromLTWH(0, height * .2, width * .15, height * .6),
          paint..color = const Color(0xff00ff00));
      canvas.drawRect(
          Rect.fromLTWH(width * .85, height * .2, width * .15, height * .6),
          paint..color = const Color(0xffffff00));
      final picture = recorder.endRecording(),
          image = await picture.toImage(width, height);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      final key = portrait ? 'portrait' : 'landscape';
      photos[key] = await File('${root.path}/$key.png')
          .writeAsBytes(data!.buffer.asUint8List());
      image.dispose();
      picture.dispose();
    }
  });
  tearDownAll(() => root.delete(recursive: true));

  for (final width in [360.0, 402.0]) {
    for (final dark in [false, true]) {
      for (final kind in ['portrait', 'landscape']) {
        testWidgets(
            'whole $kind photo at $width ${dark ? 'dark' : 'light'} opens and closes',
            (t) async {
          t.view.devicePixelRatio = 1;
          t.view.physicalSize = Size(width, width == 360 ? 800 : 874);
          addTearDown(t.view.resetPhysicalSize);
          addTearDown(t.view.resetDevicePixelRatio);
          await t.pumpWidget(RepaintBoundary(
              key: const Key('screen'),
              child: MaterialApp(
                  debugShowCheckedModeBanner: false,
                  theme: dark ? AppTheme.dark() : AppTheme.light(),
                  home: Scaffold(
                      body: Center(
                          child: SizedBox(
                              width: width - 40,
                              child: RepaintBoundary(
                                  key: const Key('preview'),
                                  child: MealPhotoPreview(
                                      photoPath: photos[kind]!.path))))))));
          await _loadPhoto(t);
          await _edges(t,
              kind == 'portrait' ? const Size(120, 240) : const Size(240, 120));
          await _render(
              t, '${width.toInt()}-${dark ? 'dark' : 'light'}-$kind-preview');
          await t.tap(find.byTooltip('View full photo'));
          await t.pumpAndSettle();
          await _loadPhoto(t);
          expect(find.text('Meal photo'), findsOneWidget);
          expect(find.byType(InteractiveViewer), findsOneWidget);
          final image = t.widget<Image>(find.byType(Image).last);
          expect(image.fit, BoxFit.contain);
          await _render(
              t, '${width.toInt()}-${dark ? 'dark' : 'light'}-$kind-full');
          await t.tap(find.byTooltip('Close'));
          await t.pumpAndSettle();
          expect(find.byType(InteractiveViewer), findsNothing);
          expect(find.byTooltip('View full photo'), findsOneWidget);
          expect(t.takeException(), isNull);
        });
      }
    }
  }
  testWidgets('viewer supports pinch zoom and Android back', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MealPhotoPreview(photoPath: photos['portrait']!.path))));
    await _loadPhoto(t);
    await t.tap(find.byTooltip('View full photo'));
    await t.pumpAndSettle();
    await _loadPhoto(t);
    final viewer = find.byType(InteractiveViewer), center = t.getCenter(viewer);
    final a = await t.startGesture(center - const Offset(30, 0), pointer: 1);
    final b = await t.startGesture(center + const Offset(30, 0), pointer: 2);
    await a.moveTo(center - const Offset(90, 0));
    await b.moveTo(center + const Offset(90, 0));
    await t.pump();
    final transform = t.widget<Transform>(
        find.descendant(of: viewer, matching: find.byType(Transform)).first);
    expect(transform.transform.getMaxScaleOnAxis(), greaterThan(1));
    await a.up();
    await b.up();
    await t.pumpAndSettle();
    await t.binding.handlePopRoute();
    await t.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
  });
  testWidgets('missing photo shows readable fallback and viewer can close',
      (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MealPhotoPreview(photoPath: '${root.path}/missing.jpg'))));
    await _loadPhoto(t);
    expect(find.text('Saved photo is unavailable'), findsOneWidget);
    await t.tap(find.byTooltip('View full photo'));
    await t.pumpAndSettle();
    await _loadPhoto(t);
    expect(find.text('Saved photo is unavailable'), findsOneWidget);
    await t.tap(find.byTooltip('Close'));
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
  });
  testWidgets(
      'editor full-photo route preserves unsaved form and never saves meal',
      (t) async {
    t.view.devicePixelRatio = 1;
    t.view.physicalSize = const Size(360, 800);
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final meal = Tier1Meal(
        id: 'saved-photo',
        name: 'Saved photo',
        capturedAt: DateTime(2026, 11, 18),
        revision: 1,
        photoPath: photos['portrait']!.path,
        served: Tier1Nutrients(kcal: 100));
    final store = _Store(meal);
    await t.pumpWidget(Tier1App(
        store: store,
        camera: FakeCameraService(),
        workflow: const NoopWorkflowSink()));
    await t.pumpAndSettle();
    await t.tap(find.text('History'));
    await t.pumpAndSettle();
    await openSavedMeal(t, 'Saved photo');
    await t.pumpAndSettle();
    await _loadPhoto(t);
    await t.tap(find.text('Edit totals'));
    await t.pumpAndSettle();
    final field = find.widgetWithText(TextFormField, 'Meal name');
    final editorScroll = find
        .descendant(
            of: find.byType(ListView).first, matching: find.byType(Scrollable))
        .first;
    await t.scrollUntilVisible(field, 160, scrollable: editorScroll);
    await t.enterText(field, 'Unsaved edit');
    t.testTextInput.hide();
    await t.pumpAndSettle();
    final expand = find.byIcon(Icons.fullscreen);
    await t.scrollUntilVisible(expand.hitTestable(), -160, scrollable: editorScroll);
    await t.pumpAndSettle();
    await t.tap(expand.hitTestable());
    await t.pumpAndSettle();
    await _loadPhoto(t);
    await t.tap(find.byTooltip('Close'));
    await t.pumpAndSettle();
    await t.scrollUntilVisible(field, 160, scrollable: editorScroll);
    expect(find.text('Unsaved edit'), findsOneWidget);
    expect(store.saves, 0);
    expect(meal.revision, 1);
    expect(meal.cloudConsent, false);
  });
}
