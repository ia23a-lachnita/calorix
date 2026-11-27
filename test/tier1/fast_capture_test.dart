import 'support/dashboard_navigation.dart';
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/tier1_cloud.dart';
import '../scan/support/fake_camera_service.dart';
import 'support/portion_fixtures.dart';

class _PhotoStore extends Tier1MealStore {
  _PhotoStore({this.retainedPath = '/tier1-fast-capture-retained-fixture.jpg'})
      : super(Directory('.'));
  final String retainedPath;
  final records = <Tier1Meal>[];
  final photoSaved = Completer<void>(), saveAttempt = Completer<void>();
  bool rejectSave = false;
  VoidCallback? onFirstPhotoSaved;
  int retained = 0;
  @override
  Future<String> retainCapture(String id, String source) async {
    retained++;
    return retainedPath;
  }

  @override
  Future<List<Tier1Meal>> load() async => List.of(records);
  @override
  Future<void> save(Tier1Meal value) async {
    if (!saveAttempt.isCompleted) saveAttempt.complete();
    if (rejectSave) {
      throw const FileSystemException('synthetic parent save failure');
    }
    final index = records.indexWhere((m) => m.id == value.id);
    final saved =
        value.withRevision(index < 0 ? 1 : records[index].revision + 1);
    if (index < 0) {
      records.add(saved);
    } else {
      records[index] = saved;
    }
    if (!photoSaved.isCompleted) {
      onFirstPhotoSaved?.call();
      photoSaved.complete();
    }
  }

  @override
  Future<bool> replaceIfRevision(Tier1Meal value, int expected) async {
    final old = records.where((m) => m.id == value.id).firstOrNull;
    if (old == null || old.revision != expected) return false;
    await save(value);
    return true;
  }
}

class _PhotoCamera extends FakeCameraService {
  _PhotoCamera(this.bytes);
  final Uint8List bytes;
  Completer<XFile?>? held;
  XFile get image => XFile.fromData(bytes,
      path: 'tier1-fast-capture-memory-fixture.jpg', mimeType: 'image/jpeg');
  @override
  Future<XFile?> captureStill() async {
    captureCount++;
    return held == null ? image : await held!.future;
  }
}

class _Cloud extends Tier1Cloud {
  int calls = 0;
  Completer<Map<String, dynamic>>? held;
  @override
  Future<Map<String, dynamic>> analyze(String path,
      {required bool consent}) async {
    if (!consent) throw StateError('Explicit consent required');
    calls++;
    return held == null ? portionAnalysis() : await held!.future;
  }
}

Future<void> _start(WidgetTester t, _PhotoStore store, _PhotoCamera camera,
    {Tier1Cloud? cloud, Future<void> Function()? initialize}) async {
  await t.pumpWidget(Tier1App(
      store: store, camera: camera, cloud: cloud, initializeCloud: initialize));
  await t.pumpAndSettle();
}

Future<void> _take(WidgetTester t, _PhotoStore store) async {
  await t.tap(find.text('Take photo'));
  await _until(t, () => store.photoSaved.isCompleted);
}

Future<void> _until(WidgetTester t, bool Function() completed) async {
  // Advance widget-zone continuations and allow real codec/I/O callbacks.
  // Readiness is the observed completion condition, never a guessed delay.
  final elapsed = Stopwatch()..start();
  while (!completed()) {
    if (elapsed.elapsed > const Duration(seconds: 90)) {
      throw TimeoutException('Capture pipeline did not complete');
    }
    await t.pump(const Duration(milliseconds: 16));
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 1)));
  }
}

void _lifecycle(WidgetTester t, bool foreground) {
  final states = foreground
      ? [
          AppLifecycleState.hidden,
          AppLifecycleState.inactive,
          AppLifecycleState.resumed
        ]
      : [
          AppLifecycleState.inactive,
          AppLifecycleState.hidden,
          AppLifecycleState.paused
        ];
  for (final state in states) {
    t.binding.handleAppLifecycleStateChanged(state);
  }
}

void main() {
  late Uint8List jpeg;
  setUpAll(() {
    jpeg = File('assets/images/coffee-oatmeal.jpg').readAsBytesSync();
  });

  testWidgets(
      'valid JPEG capture reaches a saved editor without cloud dispatch',
      (t) async {
    final store = _PhotoStore(), camera = _PhotoCamera(jpeg), cloud = _Cloud();
    await _start(t, store, camera, cloud: cloud);
    await _take(t, store);
    await _until(t, () => find.text('Meal estimate').evaluate().isNotEmpty);
    await t.pumpAndSettle();
    expect(camera.captureCount, 1);
    expect(store.retained, 1);
    expect(store.records.single.revision, 1);
    expect(store.records.single.metadata['width'], greaterThan(0));
    expect(find.text('Meal estimate'), findsOneWidget);
    expect(store.records.single.cloudConsent, false);
    expect(cloud.calls, 0);
    expect(t.takeException(), isNull);
  });

  testWidgets(
      'fresh capture retains its JPEG then offers consent without an Estimate tap',
      (t) async {
    final store = _PhotoStore(), camera = _PhotoCamera(jpeg), cloud = _Cloud();
    await _start(t, store, camera, cloud: cloud);
    await _take(t, store);
    await _until(t, () => find.text('Send this photo for analysis?').evaluate().isNotEmpty);
    await t.pumpAndSettle();
    // Positive controls distinguish capture/codec failures from the missing offer.
    expect(camera.captureCount, 1);
    expect(store.retained, 1);
    expect(store.records.single.revision, 1);
    expect(store.records.single.metadata['width'], greaterThan(0));
    expect(find.text('Meal estimate'), findsOneWidget);
    expect(find.text('Send this photo for analysis?'), findsOneWidget);
    expect(cloud.calls, 0);
    expect(store.records.single.cloudConsent, false);
    expect(store.records.single.analysis, isNull);
  });

  testWidgets(
      'fresh capture flies its exact still into the preview before consent',
      (t) async {
    final store = _PhotoStore(retainedPath: 'assets/images/coffee-oatmeal.jpg'),
        camera = _PhotoCamera(jpeg),
        cloud = _Cloud();
    await _start(t, store, camera, cloud: cloud);
    await _take(t, store);

    final id = store.records.single.id;
    final flight = find.byKey(ValueKey('capture-flight-image-$id'));
    await _until(t, () => flight.evaluate().isNotEmpty);
    await t.pump(const Duration(milliseconds: 100));
    expect(flight, findsOneWidget);
    final image = t.widget<CustomPaint>(flight);
    expect(image.painter, isNotNull);
    final bounds = t.getRect(flight);
    final canvas = TestRecordingCanvas();
    image.painter!.paint(canvas, bounds.size);
    final draw = canvas.invocations
        .singleWhere((call) => call.invocation.memberName == #drawImageRect)
        .invocation.positionalArguments;
    final source = draw[1] as Rect, destination = draw[2] as Rect;
    expect(destination.width / destination.height,
        closeTo(source.width / source.height, 0.0001));
    expect(bounds.height, greaterThan(220));
    expect(bounds.height, lessThan(t.view.physicalSize.height));
    expect(find.text('Send this photo for analysis?'), findsNothing);
    expect(cloud.calls, 0);

    await t.pumpAndSettle();
    expect(find.text('Send this photo for analysis?'), findsOneWidget);
    final destinationPhoto = find.byWidgetPredicate((widget) =>
        widget is Image &&
        widget.image is ResizeImage &&
        (widget.image as ResizeImage).imageProvider is FileImage &&
        ((widget.image as ResizeImage).imageProvider as FileImage).file.path ==
            store.retainedPath &&
        widget.fit == BoxFit.contain);
    expect(destinationPhoto, findsOneWidget);
    expect(find.byKey(ValueKey('capture-flight-image-$id')), findsNothing);
    expect(cloud.calls, 0);
    expect(store.records.single.cloudConsent, false);
    await t.tap(find.text('Keep local'));
    await t.pumpAndSettle();
    expect(find.text('Send this photo for analysis?'), findsNothing);
    expect(cloud.calls, 0);
    await t.binding.handlePopRoute();
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('tab-content-0')), findsOneWidget);
    expect(find.text('Take photo'), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets(
      'declining fresh-capture consent keeps the local photo and lazy cloud fallback',
      (t) async {
    final store = _PhotoStore(), camera = _PhotoCamera(jpeg);
    var initializations = 0;
    await _start(t, store, camera, initialize: () async {
      initializations++;
    });
    await _take(t, store);
    await _until(t, () => find.text('Send this photo for analysis?').evaluate().isNotEmpty);
    await t.pumpAndSettle();
    expect(find.text('Keep local'), findsOneWidget);
    await t.tap(find.text('Keep local'));
    await t.pumpAndSettle();
    final saved = store.records.single;
    expect(saved.photoPath, isNotNull);
    expect(saved.cloudConsent, false);
    expect(saved.analysis, isNull);
    expect(initializations, 0);
    expect(
        t
            .widget<FilledButton>(find.ancestor(
                of: find.text('Estimate photo'),
                matching: find.byWidgetPredicate((w) => w is FilledButton)))
            .onPressed,
        isNotNull);
    await t.pump();
    await t.pumpAndSettle();
    expect(find.text('Send this photo for analysis?'), findsNothing);
    await t.tap(find.text('Estimate photo'));
    await t.pumpAndSettle();
    expect(find.text('Keep local'), findsOneWidget);
    expect(initializations, 0);
  });

  testWidgets(
      'dismissing the fresh consent dialog leaves an explicit manual retry',
      (t) async {
    final store = _PhotoStore(), camera = _PhotoCamera(jpeg), cloud = _Cloud();
    await _start(t, store, camera, cloud: cloud);
    await _take(t, store);
    await _until(t, () => find.text('Send this photo for analysis?').evaluate().isNotEmpty);
    await t.pumpAndSettle();
    expect(find.text('Send this photo for analysis?'), findsOneWidget);
    t.state<NavigatorState>(find.byType(Navigator).first).pop();
    await t.pumpAndSettle();
    expect(find.text('Meal estimate'), findsOneWidget);
    expect(find.text('Estimate photo'), findsOneWidget);
    expect(cloud.calls, 0);
    expect(store.records.single.cloudConsent, false);
  });

  testWidgets(
      'Send photo explicitly dispatches one mock estimate and leaves editable saved results',
      (t) async {
    final store = _PhotoStore(), camera = _PhotoCamera(jpeg), cloud = _Cloud();
    await _start(t, store, camera, cloud: cloud);
    await _take(t, store);
    await _until(t, () => find.text('Send this photo for analysis?').evaluate().isNotEmpty);
    await t.pumpAndSettle();
    expect(cloud.calls, 0);
    expect(find.text('Send photo'), findsOneWidget);
    await t.tap(find.text('Send photo'));
    await t.pumpAndSettle();
    expect(cloud.calls, 1);
    expect(store.records.single.source, 'A1');
    expect(
        store.records.single.served!.kcal, portionAnalysis()['totals']['kcal']);
    expect(store.records.single.cloudConsent, true);
    expect(store.records.single.consumedFraction, isNull);
    expect(store.records.single.photoPath, isNotNull);
    await t.tap(find.text('Edit totals'));
    await t.pumpAndSettle();
    expect(
        t
            .widget<TextFormField>(
                find.widgetWithText(TextFormField, 'Meal name'))
            .enabled,
        true);
    expect(t.takeException(), isNull);
  });

  testWidgets('pending result returns to one interactive form with a fade', (t) async {
    final semantics = t.ensureSemantics();
    final store = _PhotoStore(), camera = _PhotoCamera(jpeg), cloud = _Cloud();
    cloud.held = Completer<Map<String, dynamic>>();
    await _start(t, store, camera, cloud: cloud);
    await _take(t, store);
    await _until(t, () => find.text('Send this photo for analysis?').evaluate().isNotEmpty);
    await t.pumpAndSettle();
    await t.tap(find.text('Send photo'));
    await _until(t, () => cloud.calls == 1);
    await t.pump(const Duration(milliseconds: 60));
    expect(find.byType(Form, skipOffstage: false), findsOneWidget);
    expect(find.widgetWithText(TextFormField, 'Meal name'), findsNothing);
    expect(find.bySemanticsLabel('Meal name'), findsNothing);
    cloud.held!.complete(portionAnalysis());
    await _until(t, () => store.records.single.served != null);
    await t.pump();
    await t.pump(const Duration(milliseconds: 60));
    expect(find.byType(Form, skipOffstage: false), findsOneWidget);
    expect(find.text('Edit totals'), findsOneWidget);
    final fades = find.ancestor(of: find.text('Edit totals'), matching: find.byType(FadeTransition));
    expect(t.widgetList<FadeTransition>(fades).any((f) => f.opacity.value > 0 && f.opacity.value < 1), isTrue);
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
    semantics.dispose();
  });

  testWidgets(
      'opening a saved photo from History does not offer automatic consent',
      (t) async {
    final store = _PhotoStore(), camera = _PhotoCamera(jpeg), cloud = _Cloud();
    await store.save(Tier1Meal(
        id: 'existing-photo',
        capturedAt: portionDate,
        name: 'Existing photo',
        photoPath: '/existing-photo-fixture.jpg',
        source: 'photo'));
    await _start(t, store, camera, cloud: cloud);
    await t.tap(find.text('History'));
    await t.pumpAndSettle();
    await openSavedMeal(t, 'Existing photo');
    await t.pumpAndSettle();
    expect(find.text('Send this photo for analysis?'), findsNothing);
    expect(find.text('Estimate photo'), findsOneWidget);
    expect(cloud.calls, 0);
  });

  testWidgets('background capture completion does not queue consent on resume',
      (t) async {
    final store = _PhotoStore(),
        camera = _PhotoCamera(jpeg)..held = Completer<XFile?>(),
        cloud = _Cloud();
    await _start(t, store, camera, cloud: cloud);
    await t.tap(find.text('Take photo'));
    await t.pump();
    _lifecycle(t, false);
    camera.held!.complete(camera.image);
    await _until(t, () => store.photoSaved.isCompleted);
    await t.pumpAndSettle();
    expect(find.text('Send this photo for analysis?'), findsNothing);
    _lifecycle(t, true);
    await t.pumpAndSettle();
    expect(find.text('Send this photo for analysis?'), findsNothing);
    expect(cloud.calls, 0);
    expect(find.text('Estimate photo'), findsOneWidget);
  });

  testWidgets(
      'leaving the fresh editor before its offer callback cannot put consent on History',
      (t) async {
    final store = _PhotoStore(), camera = _PhotoCamera(jpeg), cloud = _Cloud();
    await _start(t, store, camera, cloud: cloud);
    final navigator = t.state<NavigatorState>(find.byType(Navigator).first);
    store.onFirstPhotoSaved = () => t.binding.addPostFrameCallback((_) {
          if (navigator.canPop()) navigator.pop();
        });
    await _take(t, store);
    await t.pumpAndSettle();
    expect(find.text('Send this photo for analysis?'), findsNothing);
    expect(cloud.calls, 0);
    expect(store.records.single.cloudConsent, false);
  });

  testWidgets(
      'background and resume before the editor frame permanently cancel its automatic offer',
      (t) async {
    final store = _PhotoStore(), camera = _PhotoCamera(jpeg), cloud = _Cloud();
    await _start(t, store, camera, cloud: cloud);
    // No widget frame is pumped while paused: the editor can first build only
    // after resume, as on a real device that defers rendering in background.
    store.onFirstPhotoSaved = () {
      _lifecycle(t, false);
      _lifecycle(t, true);
    };
    await _take(t, store);
    await _until(t, () => find.text('Meal estimate').evaluate().isNotEmpty);
    await t.pumpAndSettle();
    expect(find.text('Meal estimate'), findsOneWidget);
    expect(find.text('Send this photo for analysis?'), findsNothing);
    expect(find.text('Estimate photo'), findsOneWidget);
    expect(cloud.calls, 0);
    expect(store.records.single.cloudConsent, false);
  });

  testWidgets('failed parent save cannot offer consent or call the cloud',
      (t) async {
    final store = _PhotoStore()..rejectSave = true,
        camera = _PhotoCamera(jpeg),
        cloud = _Cloud();
    await _start(t, store, camera, cloud: cloud);
    await t.tap(find.text('Take photo'));
    await _until(t, () => store.saveAttempt.isCompleted);
    await t.pumpAndSettle();
    expect(store.records, isEmpty);
    expect(cloud.calls, 0);
    expect(find.text('Send this photo for analysis?'), findsNothing);
  });
}
