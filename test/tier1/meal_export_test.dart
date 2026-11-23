import 'support/dashboard_navigation.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/meal_export.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/workflow_measurements.dart';
import '../scan/support/fake_camera_service.dart';

class _SavedStore extends Tier1MealStore {
  _SavedStore(this.saved) : super(Directory('.'));
  final Tier1Meal saved;
  @override
  Future<List<Tier1Meal>> load() async => [saved];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    // Geometry assertions use the production font, as the UI renderer does.
    final font = FontLoader('Geist');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      final bytes = File('assets/fonts/Geist-$weight.ttf').readAsBytesSync();
      font.addFont(Future.value(ByteData.view(bytes.buffer)));
    }
    await font.load();
  });
  const channel = MethodChannel('com.calorix.calorix/meal_export');
  late Directory root;
  late File photo;
  late Tier1Meal meal;
  final at = DateTime.utc(2026, 11, 18, 9);
  setUp(() async {
    root = await Directory.systemTemp.createTemp('meal-export-');
    photo = File('${root.path}/source.jpg');
    await photo.writeAsBytes([255, 216, 1, 2, 3, 255, 217]);
    meal = Tier1Meal(
        id: 'test-meal',
        capturedAt: at,
        name: 'Local meal',
        photoPath: photo.path,
        source: 'photo',
        revision: 1,
        metadata: const {'width': 10, 'height': 20});
  });
  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    await root.delete(recursive: true);
  });

  test(
      'snapshot binds exact photo and portable saved record without changing it',
      () async {
    final before = jsonEncode(meal.toJson());
    final payload = await prepareMealCopy(meal, exportedAt: at);
    expect(payload['fileName'], 'ravlo-test-meal.zip');
    final bytes = payload['photo'] as Uint8List;
    expect(bytes, await photo.readAsBytes());
    final record =
        jsonDecode(utf8.decode(payload['record'] as Uint8List)) as Map;
    expect(record['schemaVersion'], 1);
    expect(record['photoFile'], 'photo.jpg');
    expect(record['photoSha256'], sha256.convert(bytes).toString());
    expect(record['referenceMeasurementsIncluded'], false);
    expect(record['exportedAtUtc'], at.toIso8601String());
    expect((record['meal'] as Map).containsKey('photoPath'), false);
    expect(record['meal']['revision'], 1);
    expect(record['meal']['cloudConsent'], false);
    expect(jsonEncode(meal.toJson()), before);
    expect(utf8.decode(payload['record'] as Uint8List),
        isNot(contains(root.path)));
  });

  test('original JPEG bytes after the end marker are preserved', () async {
    final original =
        await File('assets/images/coffee-oatmeal.jpg').readAsBytes();
    final withTrailer = [...original, 10, 20, 30];
    await photo.writeAsBytes(withTrailer);
    final payload = await prepareMealCopy(meal, exportedAt: at);
    expect(payload['photo'], withTrailer);
  });

  test('missing, unsaved, non-JPEG and oversized inputs never open picker',
      () async {
    var calls = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async {
      calls++;
      return true;
    });
    final unsaved = meal.withRevision(0);
    await expectLater(saveMealCopy(unsaved, exportedAt: at),
        throwsA(isA<MealCopyException>()));
    await photo.writeAsBytes([1, 2, 3]);
    await expectLater(
        saveMealCopy(meal, exportedAt: at), throwsA(isA<MealCopyException>()));
    final handle = await photo.open(mode: FileMode.write);
    await handle.truncate(20 * 1024 * 1024 + 1);
    await handle.close();
    await expectLater(
        saveMealCopy(meal, exportedAt: at), throwsA(isA<MealCopyException>()));
    await photo.delete();
    await expectLater(
        saveMealCopy(meal, exportedAt: at), throwsA(isA<MealCopyException>()));
    expect(calls, 0);
  });

  test('metadata byte limit is enforced before platform call', () async {
    await photo.writeAsBytes([255, 216, 255, 217]);
    final huge = Tier1Meal(
        id: meal.id,
        capturedAt: at,
        name: meal.name,
        photoPath: photo.path,
        revision: 1,
        metadata: {'note': 'x' * (1024 * 1024)});
    await expectLater(prepareMealCopy(huge, exportedAt: at),
        throwsA(isA<MealCopyException>()));
  });

  test(
      'platform receives snapshot only; success cancellation and error preserve source',
      () async {
    for (final answer in [true, false]) {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        expect(call.method, 'saveMealCopy');
        expect((call.arguments as Map).keys.toSet(),
            {'fileName', 'photo', 'record'});
        return answer;
      });
      expect(await saveMealCopy(meal, exportedAt: at), answer);
    }
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async {
      throw PlatformException(code: 'write_failed');
    });
    await expectLater(
        saveMealCopy(meal, exportedAt: at), throwsA(isA<PlatformException>()));
    expect(await photo.readAsBytes(), [255, 216, 1, 2, 3, 255, 217]);
  });

  Future<void> open(WidgetTester t,
      {required Future<bool> Function() save,
      Future<void> Function()? measurements,
      bool canSave = true,
      ThemeData? theme}) async {
    await t.pumpWidget(MaterialApp(
        theme: theme ?? AppTheme.dark(),
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () => showMealCopyExport(context,
                        save: save,
                        measurements: measurements ?? () async {},
                        canSave: canSave),
                    child: const Text('Open'))))));
    await t.tap(find.text('Open'));
    await t.pumpAndSettle();
  }

  testWidgets(
      'busy save prevents duplicate and back, cancellation permits retry',
      (t) async {
    final pending = Completer<bool>();
    var calls = 0;
    await open(t, save: () {
      calls++;
      return pending.future;
    });
    await t.tap(find.text('Save meal copy'));
    await t.pump();
    await t.tap(find.text('Saving…'));
    await t.pump();
    await t.binding.handlePopRoute();
    await t.pump();
    expect(calls, 1);
    expect(find.text('Export meal'), findsOneWidget);
    pending.complete(false);
    await t.pumpAndSettle();
    expect(find.text('No copy saved.'), findsOneWidget);
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Save meal copy'))
            .onPressed,
        isNotNull);
  });

  testWidgets(
      'failure is readable, original remains available and success closes',
      (t) async {
    var fail = true;
    await open(t, save: () async {
      if (fail) throw PlatformException(code: 'private-path');
      return true;
    });
    await t.tap(find.text('Save meal copy'));
    await t.pumpAndSettle();
    expect(find.textContaining('partial copy may remain'), findsOneWidget);
    expect(find.textContaining('private-path'), findsNothing);
    fail = false;
    await t.tap(find.text('Save meal copy'));
    await t.pumpAndSettle();
    expect(find.text('Export meal'), findsNothing);
    expect(find.text('Meal copy saved.'), findsOneWidget);
  });

  testWidgets('dirty meal blocks copy and measurements path remains explicit',
      (t) async {
    var saves = 0, measures = 0;
    await open(t,
        save: () async {
          saves++;
          return true;
        },
        canSave: false,
        measurements: () async {
          measures++;
        });
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Save meal copy'))
            .onPressed,
        isNull);
    expect(find.text('Save your changes before exporting a meal copy.'),
        findsOneWidget);
    await t.tap(find.text('Measurements only'));
    await t.pumpAndSettle();
    expect(saves, 0);
    expect(measures, 1);
  });

  for (final hasPhoto in [false, true]) {
    testWidgets(
        'saved ${hasPhoto ? 'photo' : 'manual'} editor keeps measurements path',
        (t) async {
      final saved = Tier1Meal(
          id: 'saved',
          name: 'Saved meal',
          capturedAt: at,
          photoPath: hasPhoto ? photo.path : null,
          revision: 1,
          served: Tier1Nutrients(kcal: 100));
      await t.pumpWidget(Tier1App(
          store: _SavedStore(saved),
          camera: FakeCameraService(),
          workflow: const NoopWorkflowSink()));
      await t.pumpAndSettle();
      await t.tap(find.text('History'));
      await t.pumpAndSettle();
      await openSavedMeal(t, 'Saved meal');
      await t.pumpAndSettle();
      await t.tap(
          find.byTooltip(hasPhoto ? 'Export meal' : 'Export measurements'));
      await t.pumpAndSettle();
      if (hasPhoto) {
        expect(find.text('Export meal'), findsOneWidget);
        await t.tap(find.text('Measurements only'));
        await t.pumpAndSettle();
      }
      expect(find.text('Export workflow measurements'), findsOneWidget);
      expect(find.text('Copy JSON'), findsOneWidget);
      expect(find.textContaining('No photos or food names'), findsOneWidget);
      await t.tap(find.text('Cancel'));
      await t.pumpAndSettle();
      expect(saved.revision, 1);
      expect(saved.cloudConsent, false);
    });
  }

  for (final width in [360.0, 402.0]) {
    for (final light in [false, true]) {
      testWidgets(
          'dialog fits ${width.toInt()} ${light ? 'light' : 'dark'} and cancels',
          (t) async {
        t.view.devicePixelRatio = 1;
        t.view.physicalSize = Size(width, 800);
        addTearDown(t.view.resetDevicePixelRatio);
        addTearDown(t.view.resetPhysicalSize);
        var saves = 0;
        await open(t, save: () async {
          saves++;
          return true;
        }, theme: light ? AppTheme.light() : AppTheme.dark());
        expect(t.takeException(), isNull);
        expect(t.getRect(find.text('Save meal copy')).bottom, lessThan(800));
        expect(t.getCenter(find.text('Cancel')).dy,
            closeTo(t.getCenter(find.text('Save meal copy')).dy, 1));
        expect(t.getRect(find.text('Measurements only')).bottom,
            lessThan(t.getRect(find.text('Cancel')).top));
        expect(find.textContaining('deletion controls'), findsOneWidget);
        await t.tap(find.text('Cancel'));
        await t.pumpAndSettle();
        expect(saves, 0);
        expect(find.text('Export meal'), findsNothing);
      });
    }
  }
}
