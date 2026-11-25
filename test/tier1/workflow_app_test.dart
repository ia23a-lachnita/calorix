import 'support/dashboard_navigation.dart';
import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/tier1_cloud.dart';
import 'package:calorix/features/tier1/workflow_measurements.dart';
import 'package:calorix/features/tier1/workflow_export.dart';
import '../scan/support/fake_camera_service.dart';
import 'support/portion_fixtures.dart';

class _Store extends Tier1MealStore {
  _Store() : super(Directory('.'));
  final records = <Tier1Meal>[];
  bool conflict = false;
  bool failLoadAfterReplace = false;
  Completer<bool>? pendingReplace;
  bool _failLoad = false;
  @override
  Future<List<Tier1Meal>> load() async {
    if (_failLoad) throw const FileSystemException('synthetic refresh failure');
    return List.of(records);
  }

  @override
  Future<void> save(Tier1Meal value) async {
    final index = records.indexWhere((m) => m.id == value.id);
    final saved =
        value.withRevision(index < 0 ? 1 : records[index].revision + 1);
    if (index < 0) {
      records.add(saved);
    } else {
      records[index] = saved;
    }
  }

  @override
  Future<bool> replaceIfRevision(Tier1Meal value, int expected) async {
    if (pendingReplace != null) await pendingReplace!.future;
    if (conflict) return false;
    final old = records.where((m) => m.id == value.id).firstOrNull;
    if (old == null || old.revision != expected) return false;
    await save(value);
    _failLoad = failLoadAfterReplace;
    return true;
  }
}

class _Sink extends WorkflowSink {
  final events = <Map<String, dynamic>>[];
  bool fail = false;
  @override
  Future<void> append(String id, List<Map<String, dynamic>> values) async {
    if (fail) throw const FileSystemException('synthetic measurement failure');
    events.addAll(values);
  }

  @override
  Future<Map<String, dynamic>> export(
          {required DateTime at, String? mealId}) async =>
      workflowExportData(at: at, meals: []);
}

class _Cloud extends Tier1Cloud {
  final responses = <Completer<Map<String, dynamic>>>[
    Completer<Map<String, dynamic>>()
  ];
  int calls = 0;
  Completer<Map<String, dynamic>> get response => responses.first;
  @override
  Future<Map<String, dynamic>> analyze(String path, {required bool consent}) {
    final index = calls++;
    if (index == responses.length) {
      responses.add(Completer<Map<String, dynamic>>());
    }
    return responses[index].future;
  }
}

Future<void> visible(WidgetTester t, Finder f) async {
  await t.scrollUntilVisible(f, 150, scrollable: find.byType(Scrollable).first);
  await t.pumpAndSettle();
}

Future<void> _open(
    WidgetTester t, _Store store, _Sink sink, int Function() tick,
    {_Cloud? cloud}) async {
  await store.save(portionMeal(photo: cloud != null).confirmConsumption(.5));
  await t.pumpWidget(Tier1App(
      store: store,
      camera: FakeCameraService(),
      cloud: cloud,
      workflow: sink,
      elapsedMilliseconds: tick));
  await t.pumpAndSettle();
  await t.tap(find.text('History'));
  await t.pumpAndSettle();
  await openSavedMeal(t, 'Portion meal');
  await t.pumpAndSettle();
}

void main() {
  testWidgets(
      'an unestimated serving shows the server reference and preserves the meal',
      (t) async {
    final store = _Store(), sink = _Sink(), cloud = _Cloud();
    await _open(t, store, sink, () => 0, cloud: cloud);
    final before = store.records.single.served?.kcal;
    await visible(t, find.text('Estimate photo'));
    await t.tap(find.text('Estimate photo'));
    await t.pumpAndSettle();
    await t.tap(find.text('Send photo'));
    await t.pump();
    expect(find.text('Analyzing your photo'), findsOneWidget);
    expect(find.textContaining('remains saved on this device'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    expect(
        t
            .widget<LinearProgressIndicator>(
                find.byType(LinearProgressIndicator))
            .value,
        isNull);
    expect(find.textContaining('EST.'), findsNothing);
    expect(find.textContaining('%'), findsNothing);
    expect(find.byType(Image), findsWidgets);
    expect(cloud.calls, 1);
    const ref = '268ba27c-b44a-41c5-aa8f-8c8f7ffaa7be';
    cloud.response.completeError(FirebaseFunctionsException(
      code: 'failed-precondition',
      message: 'private provider payload',
      details: const {'failureCategory': 'no_food', 'reference': ref},
    ));
    await t.pumpAndSettle();
    expect(find.textContaining('identify a serving'), findsOneWidget);
    expect(find.textContaining(ref), findsOneWidget);
    final failed =
        sink.events.singleWhere((e) => e['kind'] == 'analysis_failed');
    expect(failed['failureCategory'], 'no_food');
    expect(failed['reference'], ref);
    expect(failed.toString(), isNot(contains('private provider payload')));
    expect(store.records.single.served?.kcal, before);
  });
  testWidgets(
      'portion save logs before/after and a foreground proxy without changing original analysis',
      (t) async {
    var tick = 0;
    final store = _Store(), sink = _Sink();
    await _open(t, store, sink, () => tick);
    final original = store.records.single;
    await visible(t, find.byTooltip('Edit portion for Almonds'));
    tick = 100;
    await t.tap(find.byTooltip('Edit portion for Almonds'));
    await t.pumpAndSettle();
    tick = 1100;
    await t.enterText(find.widgetWithText(TextFormField, 'Portion (g)'), '86');
    await t.tap(find.text('Apply portion'));
    await t.pumpAndSettle();
    final saved = sink.events.where((e) => e['kind'] == 'portion_saved').single;
    expect(saved['beforeKcal'], original.served!.kcal);
    expect(saved['afterKcal'], store.records.single.served!.kcal);
    expect(saved['dialogForegroundMs'], 1000);
    expect(saved['beforeFromOriginalAnalysis'], true);
    expect(saved['priorPortionAdjustmentCount'], 0);
    expect(store.records.single.analysis, original.analysis);
    expect(store.records.single.consumedFraction, isNull);
  });
  testWidgets(
      'cancel and no-change preserve meal bytes and do not record a saved correction',
      (t) async {
    final store = _Store(), sink = _Sink();
    await _open(t, store, sink, () => 0);
    final before = store.records.single.toJson();
    await visible(t, find.byTooltip('Edit portion for Almonds'));
    await t.tap(find.byTooltip('Edit portion for Almonds'));
    await t.pumpAndSettle();
    await t.tap(find.text('Cancel'));
    await t.pumpAndSettle();
    await t.tap(find.byTooltip('Edit portion for Almonds'));
    await t.pumpAndSettle();
    await t.tap(find.text('Apply portion'));
    await t.pumpAndSettle();
    expect(store.records.single.toJson(), before);
    expect(sink.events.where((e) => e['kind'] == 'portion_saved'), isEmpty);
    expect(sink.events.any((e) => e['kind'] == 'portion_cancelled'), true);
    expect(sink.events.any((e) => e['kind'] == 'portion_unchanged'), true);
  });
  testWidgets('measurement write failure cannot prevent a portion save',
      (t) async {
    final store = _Store(), sink = _Sink()..fail = true;
    await _open(t, store, sink, () => 0);
    await visible(t, find.byTooltip('Edit portion for Almonds'));
    await t.tap(find.byTooltip('Edit portion for Almonds'));
    await t.pumpAndSettle();
    await t.enterText(find.widgetWithText(TextFormField, 'Portion (g)'), '86');
    await t.tap(find.text('Apply portion'));
    await t.pumpAndSettle();
    expect(store.records.single.portionOverrides, {1: 86.0});
    expect(t.takeException(), isNull);
  });
  testWidgets('revision conflict never records a successful portion correction',
      (t) async {
    final store = _Store(), sink = _Sink();
    await _open(t, store, sink, () => 0);
    store.conflict = true;
    await visible(t, find.byTooltip('Edit portion for Almonds'));
    await t.tap(find.byTooltip('Edit portion for Almonds'));
    await t.pumpAndSettle();
    await t.enterText(find.widgetWithText(TextFormField, 'Portion (g)'), '86');
    await t.tap(find.text('Apply portion'));
    await t.pumpAndSettle();
    expect(sink.events.where((e) => e['kind'] == 'portion_saved'), isEmpty);
    expect(sink.events.any((e) => e['kind'] == 'portion_conflict'), true);
  });
  testWidgets(
      'analysis wait is excluded and a reopened meal has unknown shutter timing',
      (t) async {
    var tick = 0;
    final store = _Store(), sink = _Sink(), cloud = _Cloud();
    await _open(t, store, sink, () => tick, cloud: cloud);
    tick = 1000;
    await visible(t, find.text('Estimate photo'));
    await t.tap(find.text('Estimate photo'));
    await t.pumpAndSettle();
    tick = 2000;
    await t.tap(find.text('Send photo'));
    await t.pump();
    tick = 12000;
    cloud.response.complete(portionAnalysis());
    await t.pumpAndSettle();
    final saved =
        sink.events.where((e) => e['kind'] == 'analysis_saved').single;
    expect(saved['waitingMs'], 10000);
    expect(saved['foregroundMs'] - saved['waitingMs'], 2000);
    expect(saved['shutterToSavedMs'], isNull);
    final frame = sink.events.where((e) => e['kind'] == 'result_frame').single;
    expect(frame['shutterToFrameMs'], isNull);
  });
  testWidgets(
      'background time is excluded from a portion-dialog foreground proxy',
      (t) async {
    var tick = 0;
    final store = _Store(), sink = _Sink();
    await _open(t, store, sink, () => tick);
    await visible(t, find.byTooltip('Edit portion for Almonds'));
    await t.tap(find.byTooltip('Edit portion for Almonds'));
    await t.pumpAndSettle();
    tick = 100;
    for (final state in [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused
    ]) {
      t.binding.handleAppLifecycleStateChanged(state);
    }
    tick = 5100;
    for (final state in [
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed
    ]) {
      t.binding.handleAppLifecycleStateChanged(state);
    }
    tick = 5300;
    await t.enterText(find.widgetWithText(TextFormField, 'Portion (g)'), '86');
    await t.tap(find.text('Apply portion'));
    await t.pumpAndSettle();
    expect(
        sink.events
            .where((e) => e['kind'] == 'portion_saved')
            .single['dialogForegroundMs'],
        300);
  });
  testWidgets('unsaved manual cancel produces no measurement journal',
      (t) async {
    final store = _Store(), sink = _Sink();
    await t.pumpWidget(
        Tier1App(store: store, camera: FakeCameraService(), workflow: sink));
    await t.pumpAndSettle();
    await t.tap(find.text('Manual entry'));
    await t.pumpAndSettle();
    await t.tap(find.text('Create custom food'));
    await t.pumpAndSettle();
    await t.tap(find.byTooltip('Close'));
    await t.pumpAndSettle();
    expect(store.records, isEmpty);
    expect(sink.events, isEmpty);
  });
  testWidgets(
      'pending analysis uses static accessible feedback when reduced motion is enabled',
      (t) async {
    final semantics = t.ensureSemantics();
    t.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(t.platformDispatcher.clearAccessibilityFeaturesTestValue);
    final store = _Store(), sink = _Sink(), cloud = _Cloud();
    await _open(t, store, sink, () => 0, cloud: cloud);
    await visible(t, find.text('Estimate photo'));
    await t.tap(find.text('Estimate photo'));
    await t.pumpAndSettle();
    await t.tap(find.text('Send photo'));
    await t.pump();
    expect(find.text('Analyzing your photo'), findsOneWidget);
    expect(find.text('Waiting for the estimate'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    final status = find.byWidgetPredicate((widget) =>
        widget is Semantics &&
        (widget.properties.label?.startsWith('Analyzing your photo.') ??
            false) &&
        (widget.properties.label?.contains('remains saved on this device') ??
            false) &&
        (widget.properties.label?.contains('Waiting for the estimate.') ??
            false));
    expect(status, findsOneWidget);
    expect(t.widget<Semantics>(status).properties.liveRegion, isTrue);
    expect(t.widget<Semantics>(status).properties.header, isTrue);
    final traversalOrders = find
        .byType(Semantics)
        .evaluate()
        .map((element) => (element.widget as Semantics).properties.sortKey)
        .whereType<OrdinalSortKey>()
        .map((key) => key.order)
        .toSet();
    expect(traversalOrders, containsAll([0.0, 1.0]));
    semantics.dispose();
    cloud.response.completeError(FirebaseFunctionsException(
        code: 'unavailable', message: 'synthetic service failure'));
    await t.pumpAndSettle();
    expect(find.textContaining('retry'), findsOneWidget);
    expect(store.records.single.served, isNotNull);
  });

  testWidgets('failed estimate returns to a retryable saved meal', (t) async {
    final store = _Store(), sink = _Sink(), cloud = _Cloud();
    await _open(t, store, sink, () => 0, cloud: cloud);
    await visible(t, find.text('Estimate photo'));
    await t.tap(find.text('Estimate photo'));
    await t.pumpAndSettle();
    await t.tap(find.text('Send photo'));
    await t.pump();
    cloud.response.completeError(FirebaseFunctionsException(
        code: 'unavailable', message: 'synthetic service failure'));
    await t.pumpAndSettle();
    expect(
        find.textContaining('The estimate didn’t come back'), findsOneWidget);

    await visible(t, find.text('Estimate photo'));
    await t.tap(find.text('Estimate photo'));
    await t.pumpAndSettle();
    await t.tap(find.text('Send photo'));
    await t.pump();
    cloud.responses[1].complete(portionAnalysis());
    await t.pumpAndSettle();
    expect(cloud.calls, 2);
    expect(store.records.single.analysis, isNotNull);
    expect(t.takeException(), isNull);
  });

  for (final reduceMotion in [false, true]) {
    testWidgets(
        'pending analysis remains usable at large text (reduced motion: $reduceMotion)',
        (t) async {
      t.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
      if (reduceMotion) {
        t.platformDispatcher.accessibilityFeaturesTestValue =
            const FakeAccessibilityFeatures(disableAnimations: true);
        addTearDown(t.platformDispatcher.clearAccessibilityFeaturesTestValue);
      }
      final store = _Store(), sink = _Sink(), cloud = _Cloud();
      await _open(t, store, sink, () => 0, cloud: cloud);
      await visible(t, find.text('Estimate photo'));
      await t.tap(find.text('Estimate photo'));
      await t.pumpAndSettle();
      await t.tap(find.text('Send photo'));
      await t.pump();
      expect(find.text('Analyzing your photo'), findsOneWidget);
      expect(find.byTooltip('Back').hitTestable(), findsOneWidget);
      expect(find.byTooltip('Export meal'), findsOneWidget);
      expect(find.byTooltip('Delete meal'), findsOneWidget);
      expect(t.takeException(), isNull);
      cloud.response.completeError(FirebaseFunctionsException(
          code: 'unavailable', message: 'synthetic service failure'));
      await t.pumpAndSettle();
    });
  }

  testWidgets(
      'committed analysis with failed refresh stays saved rather than failed',
      (t) async {
    final store = _Store(), sink = _Sink(), cloud = _Cloud();
    await _open(t, store, sink, () => 0, cloud: cloud);
    store.failLoadAfterReplace = true;
    await visible(t, find.text('Estimate photo'));
    await t.tap(find.text('Estimate photo'));
    await t.pumpAndSettle();
    await t.tap(find.text('Send photo'));
    await t.pump();
    cloud.response.complete(portionAnalysis());
    await t.pumpAndSettle();
    expect(
        sink.events.where((e) => e['kind'] == 'analysis_saved'), hasLength(1));
    expect(sink.events.where((e) => e['kind'] == 'analysis_failed'), isEmpty);
    expect(sink.events.where((e) => e['kind'] == 'analysis_refresh_failed'),
        hasLength(1));
    expect(store.records.single.source, 'A1');
    expect(t.takeException(), isNull);
  });
  testWidgets(
      'analysis completing after navigation records success without disposed refresh',
      (t) async {
    final store = _Store(), sink = _Sink(), cloud = _Cloud();
    await _open(t, store, sink, () => 0, cloud: cloud);
    await visible(t, find.text('Estimate photo'));
    await t.tap(find.text('Estimate photo'));
    await t.pumpAndSettle();
    await t.tap(find.text('Send photo'));
    await t.pump();
    await t.tap(find.byTooltip('Back'));
    await t.pumpAndSettle();
    cloud.response
        .complete({...portionAnalysis(), 'mealName': 'Changed prediction'});
    await t.pumpAndSettle();
    expect(
        sink.events
            .where((e) => e['kind'] == 'analysis_saved')
            .single['afterNavigation'],
        true);
    expect(
        sink.events.where((e) =>
            e['kind'] == 'analysis_failed' ||
            e['kind'] == 'analysis_refresh_failed' ||
            e['kind'] == 'result_frame'),
        isEmpty);
    expect(t.takeException(), isNull);
  });
  testWidgets(
      'portion failure after navigation retains a terminal failure event',
      (t) async {
    final store = _Store(), sink = _Sink();
    await _open(t, store, sink, () => 0);
    final before = store.records.single.toJson();
    store.pendingReplace = Completer<bool>();
    await visible(t, find.byTooltip('Edit portion for Almonds'));
    await t.tap(find.byTooltip('Edit portion for Almonds'));
    await t.pumpAndSettle();
    await t.enterText(find.widgetWithText(TextFormField, 'Portion (g)'), '86');
    await t.tap(find.text('Apply portion'));
    await t.pumpAndSettle();
    await t.tap(find.byTooltip('Back'));
    await t.pumpAndSettle();
    store.pendingReplace!
        .completeError(const FileSystemException('synthetic save failure'));
    await t.pumpAndSettle();
    expect(
        sink.events
            .where((e) => e['kind'] == 'portion_failed')
            .single['afterNavigation'],
        true);
    expect(sink.events.where((e) => e['kind'] == 'portion_saved'), isEmpty);
    expect(store.records.single.toJson(), before);
    expect(t.takeException(), isNull);
  });
  testWidgets('portion dialog timing ends before delayed persistence',
      (t) async {
    var tick = 0;
    final store = _Store(), sink = _Sink();
    await _open(t, store, sink, () => tick);
    store.pendingReplace = Completer<bool>();
    await visible(t, find.byTooltip('Edit portion for Almonds'));
    tick = 100;
    await t.tap(find.byTooltip('Edit portion for Almonds'));
    await t.pumpAndSettle();
    tick = 1100;
    await t.enterText(find.widgetWithText(TextFormField, 'Portion (g)'), '86');
    await t.tap(find.text('Apply portion'));
    await t.pumpAndSettle();
    tick = 11100;
    store.pendingReplace!.complete(true);
    await t.pumpAndSettle();
    expect(
        sink.events
            .where((e) => e['kind'] == 'portion_saved')
            .single['dialogForegroundMs'],
        1000);
  });
  testWidgets('export does not copy until the explicit copy action', (t) async {
    var copied = 0;
    t.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') {
        copied++;
      }
      return null;
    });
    addTearDown(() => t.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null));
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (context) => TextButton(
                    onPressed: () => showWorkflowExport(context,
                        load: () async => workflowExportData(
                            at: DateTime.utc(2026), meals: [])),
                    child: const Text('Export'))))));
    await t.tap(find.text('Export'));
    await t.pumpAndSettle();
    expect(copied, 0);
    await t.tap(find.text('Copy JSON'));
    await t.pumpAndSettle();
    expect(copied, 1);
  });
  testWidgets(
      'dismissal while export is loading prevents a late clipboard write',
      (t) async {
    var copied = 0;
    final pending = Completer<Map<String, dynamic>>();
    t.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') {
        copied++;
      }
      return null;
    });
    addTearDown(() => t.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null));
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (context) => TextButton(
                    onPressed: () =>
                        showWorkflowExport(context, load: () => pending.future),
                    child: const Text('Export'))))));
    await t.tap(find.text('Export'));
    await t.pumpAndSettle();
    await t.tap(find.text('Copy JSON'));
    await t.pump();
    await t.tap(find.text('Cancel'));
    await t.pumpAndSettle();
    pending.complete(workflowExportData(at: DateTime.utc(2026), meals: []));
    await t.pumpAndSettle();
    expect(copied, 0);
    expect(t.takeException(), isNull);
  });
}
