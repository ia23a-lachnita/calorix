import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:calorix/debug/ui_diff/ui_diff_anchor.dart';

// Helper: builds a UiDiffDeviceDto with all required fields populated.
UiDiffDeviceDto _makeDevice({
  double dpr = 3.0,
  double width = 360.0,
  double height = 800.0,
  String source = 'mediaQueryDerived',
}) =>
    UiDiffDeviceDto(
      screenshotWidthPx: width * dpr,
      screenshotHeightPx: height * dpr,
      devicePixelRatio: dpr,
      screenshotDimensionsSource: source,
      mediaQuerySizeLogical: {'width': width, 'height': height},
      paddingLogical: {'top': 0.0, 'right': 0.0, 'bottom': 0.0, 'left': 0.0},
      viewPaddingLogical:
          {'top': 0.0, 'right': 0.0, 'bottom': 0.0, 'left': 0.0},
      viewInsetsLogical:
          {'top': 0.0, 'right': 0.0, 'bottom': 0.0, 'left': 0.0},
    );

void main() {
  // Reset registry before every test to avoid cross-test contamination.
  setUp(() => UiDiffAnchorRegistry.instance.reset());

  // ---------------------------------------------------------------------------
  // DTO serialization
  // ---------------------------------------------------------------------------

  group('UiDiffAnchorRectDto', () {
    test('serializes all fields as numeric primitives', () {
      const dto =
          UiDiffAnchorRectDto(x: 10.5, y: 20.0, width: 100.0, height: 50.5);
      final json = dto.toJson();
      expect(json['x'], isA<double>());
      expect(json['y'], isA<double>());
      expect(json['width'], isA<double>());
      expect(json['height'], isA<double>());
      expect(json['x'], 10.5);
      expect(json['height'], 50.5);
    });

    test('fromRect round-trips correctly', () {
      const rect = Rect.fromLTWH(5.0, 15.0, 200.0, 80.0);
      final dto = UiDiffAnchorRectDto.fromRect(rect);
      expect(dto.x, 5.0);
      expect(dto.y, 15.0);
      expect(dto.width, 200.0);
      expect(dto.height, 80.0);
    });
  });

  group('UiDiffAnchorVisibilityDto', () {
    test('serializes all required fields', () {
      const vis = UiDiffAnchorVisibilityDto(
        visibleFraction: 0.75,
        offscreen: false,
        clippedByViewport: false,
        covered: false,
        notes: ['test_note'],
      );
      final json = vis.toJson();
      expect(json['visibleFraction'], 0.75);
      expect(json['offscreen'], false);
      expect(json['clippedByViewport'], false);
      expect(json['covered'], false);
      expect(json['notes'], ['test_note']);
    });
  });

  group('UiDiffAnchorDto', () {
    test('toJson contains all required fields', () {
      final dto = UiDiffAnchorDto(
        id: 'today.kcalLeftPill',
        label: '980 kcal left',
        rectLogical: const UiDiffAnchorRectDto(
            x: 104.0, y: 510.0, width: 90.0, height: 24.0),
        visible: true,
        visibility: const UiDiffAnchorVisibilityDto(
          visibleFraction: 1.0,
          offscreen: false,
          clippedByViewport: false,
          covered: false,
          notes: [],
        ),
      );
      final json = dto.toJson();
      expect(json['id'], 'today.kcalLeftPill');
      expect(json['label'], '980 kcal left');
      expect(json['rectLogical'], isA<Map>());
      expect(json['visible'], true);
      expect(json['visibility'], isA<Map>());
      // Must not contain any Flutter framework objects.
      expect(() => jsonEncode(json), returnsNormally);
    });
  });

  group('UiDiffDeviceDto', () {
    test('serializes screenshotDimensionsSource field', () {
      final json = _makeDevice(source: 'mediaQueryDerived').toJson();
      expect(json['screenshotDimensionsSource'], 'mediaQueryDerived');
    });

    test('exposes devicePixelRatio and mediaQuerySizeLogical', () {
      final json = _makeDevice(dpr: 3.0, width: 360.0, height: 800.0).toJson();
      expect(json['devicePixelRatio'], 3.0);
      expect(json['mediaQuerySizeLogical'], containsPair('width', 360.0));
      expect(json['mediaQuerySizeLogical'], containsPair('height', 800.0));
      expect(json['paddingLogical'], contains('top'));
      expect(json['viewPaddingLogical'], contains('bottom'));
      expect(json['viewInsetsLogical'], contains('left'));
    });

    test('screenshotWidthPx/HeightPx are size × dpr', () {
      final json = _makeDevice(dpr: 2.75, width: 393.0, height: 852.0).toJson();
      expect(json['screenshotWidthPx'], closeTo(393.0 * 2.75, 0.001));
      expect(json['screenshotHeightPx'], closeTo(852.0 * 2.75, 0.001));
    });
  });

  group('UiDiffExportDto', () {
    test('toJson contains required root fields', () {
      final dto = UiDiffExportDto(
        screen: 'today',
        device: _makeDevice(),
        anchors: const [],
      );
      final json = dto.toJson();
      expect(json['framework'], 'flutter');
      expect(json['screen'], 'today');
      expect(json['coordinateSpace'], 'flutterLogical');
      expect(json['coordinateOrigin'], 'flutterView');
      expect(json['device'], isA<Map>());
      expect(json['anchors'], isA<List>());
    });

    test('device section includes screenshotDimensionsSource', () {
      final dto = UiDiffExportDto(
        screen: 'today',
        device: _makeDevice(source: 'mediaQueryDerived'),
        anchors: const [],
      );
      final deviceJson = dto.toJson()['device'] as Map;
      expect(deviceJson['screenshotDimensionsSource'], 'mediaQueryDerived');
    });

    test('can be JSON encoded and decoded without framework objects', () {
      final dto = UiDiffExportDto(
        screen: 'today',
        device: _makeDevice(dpr: 3.0),
        anchors: [
          UiDiffAnchorDto(
            id: 'today.macroRingHero',
            label: 'Hero macro ring card',
            rectLogical: const UiDiffAnchorRectDto(
                x: 16.0, y: 100.0, width: 328.0, height: 300.0),
            visible: true,
            visibility: const UiDiffAnchorVisibilityDto(
              visibleFraction: 1.0,
              offscreen: false,
              clippedByViewport: false,
              covered: false,
              notes: [],
            ),
          ),
        ],
      );
      final encoded = dto.toJsonString();
      expect(() => jsonDecode(encoded), returnsNormally);
      final decoded = jsonDecode(encoded) as Map;
      expect(decoded['framework'], 'flutter');
      expect((decoded['anchors'] as List).first['id'], 'today.macroRingHero');
    });
  });

  // ---------------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------------

  group('UiDiffAnchorRegistry', () {
    testWidgets('export has device fields from MediaQuery', (tester) async {
      late BuildContext capturedCtx;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(builder: (ctx) {
            capturedCtx = ctx;
            return const SizedBox();
          }),
        ),
      );

      UiDiffAnchorRegistry.instance.setScreen('today');
      final dto = UiDiffAnchorRegistry.instance.export(capturedCtx);
      expect(dto.device.devicePixelRatio, isA<double>());
      expect(dto.device.mediaQuerySizeLogical['width'], isA<double>());
      expect(dto.device.mediaQuerySizeLogical['height'], isA<double>());
      expect(dto.device.paddingLogical, contains('top'));
      expect(dto.device.viewPaddingLogical, contains('bottom'));
      expect(dto.device.viewInsetsLogical, contains('left'));
    });

    testWidgets('export device contains screenshotDimensionsSource', (tester) async {
      late BuildContext capturedCtx;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(builder: (ctx) {
            capturedCtx = ctx;
            return const SizedBox();
          }),
        ),
      );

      final dto = UiDiffAnchorRegistry.instance.export(capturedCtx);
      expect(dto.device.screenshotDimensionsSource, 'mediaQueryDerived');
      // Also verify it survives JSON round-trip.
      final decoded = jsonDecode(dto.toJsonString()) as Map;
      expect(
        (decoded['device'] as Map)['screenshotDimensionsSource'],
        'mediaQueryDerived',
      );
    });

    testWidgets('export contains only stripped DTO fields (no framework objects)',
        (tester) async {
      late BuildContext capturedCtx;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(builder: (ctx) {
            capturedCtx = ctx;
            return const SizedBox();
          }),
        ),
      );

      UiDiffAnchorRegistry.instance.setScreen('test-screen');
      final dto = UiDiffAnchorRegistry.instance.export(capturedCtx);
      expect(() => jsonEncode(dto.toJson()), returnsNormally);
    });

    testWidgets('registered and measured anchor is visible', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: UiDiffAnchor(
              id: 'test.visible',
              label: 'Visible widget',
              child: const SizedBox(width: 100, height: 50),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();

      final ctx = tester.element(find.byType(MaterialApp));
      final dto = UiDiffAnchorRegistry.instance.export(ctx);
      final anchor = dto.anchors.firstWhere((a) => a.id == 'test.visible',
          orElse: () => throw StateError('anchor not found'));
      expect(anchor.visible, isTrue);
      expect(anchor.visibility.offscreen, isFalse);
      expect(anchor.visibility.visibleFraction, greaterThan(0.0));
    });

    testWidgets('widget positioned fully outside viewport is offscreen',
        (tester) async {
      // Position a widget far below the visible area (y = 10000 logical px).
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  top: 10000,
                  left: 0,
                  child: UiDiffAnchor(
                    id: 'test.offscreen',
                    label: 'Far below viewport',
                    child: const SizedBox(width: 100, height: 50),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();

      final ctx = tester.element(find.byType(MaterialApp));
      final dto = UiDiffAnchorRegistry.instance.export(ctx);
      final anchor = dto.anchors.firstWhere((a) => a.id == 'test.offscreen',
          orElse: () => throw StateError('anchor not found'));
      expect(anchor.visible, isFalse,
          reason: 'Widget at y=10000 must not be visible');
      expect(anchor.visibility.offscreen, isTrue);
      expect(anchor.visibility.visibleFraction, 0.0);
    });

    testWidgets('anchor is unregistered on dispose', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: UiDiffAnchor(
              id: 'test.dispose',
              label: 'Will be disposed',
              child: const SizedBox(),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(
        UiDiffAnchorRegistry.instance
            .export(tester.element(find.byType(MaterialApp)))
            .anchors
            .any((a) => a.id == 'test.dispose'),
        isTrue,
      );

      // Replace widget tree to trigger dispose.
      await tester.pumpWidget(const MaterialApp(home: SizedBox()));
      await tester.pump();
      expect(
        UiDiffAnchorRegistry.instance
            .export(tester.element(find.byType(MaterialApp)))
            .anchors
            .any((a) => a.id == 'test.dispose'),
        isFalse,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // UiDiffAnchor widget — no layout impact
  // ---------------------------------------------------------------------------

  group('UiDiffAnchor widget', () {
    testWidgets('does not alter child size', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: UiDiffAnchor(
              id: 'test.size',
              label: 'size test',
              child: SizedBox(width: 80, height: 40),
            ),
          ),
        ),
      );
      await tester.pump();
      final box =
          tester.renderObject<RenderBox>(find.byType(SizedBox).first);
      expect(box.size.width, 80.0);
      expect(box.size.height, 40.0);
    });

    testWidgets('renders child widget unchanged', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: UiDiffAnchor(
            id: 'test.render',
            label: 'render test',
            child: Text('hello anchor'),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('hello anchor'), findsOneWidget);
    });
  });

  // ---------------------------------------------------------------------------
  // Infrastructure — pull script default package ID
  // ---------------------------------------------------------------------------

  group('Infrastructure', () {
    test('pull script default PackageId is com.calorix.calorix', () {
      // Verify the ps1 file has the correct default so it works without -PackageId.
      final psFile =
          File('scripts/pull_flutter_anchors.ps1').readAsStringSync();
      expect(
        psFile,
        contains("'com.calorix.calorix'"),
        reason: 'Default PackageId must match Android applicationId',
      );
    });
  });
}
