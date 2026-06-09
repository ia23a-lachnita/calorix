// ignore_for_file: avoid_print
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

// ---------------------------------------------------------------------------
// DTOs — plain Dart only; no Flutter framework objects.
// ---------------------------------------------------------------------------

class UiDiffAnchorRectDto {
  const UiDiffAnchorRectDto({
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  factory UiDiffAnchorRectDto.fromRect(Rect r) => UiDiffAnchorRectDto(
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
      );

  final double x;
  final double y;
  final double width;
  final double height;

  Map<String, dynamic> toJson() =>
      {'x': x, 'y': y, 'width': width, 'height': height};
}

class UiDiffAnchorVisibilityDto {
  const UiDiffAnchorVisibilityDto({
    required this.visibleFraction,
    required this.offscreen,
    required this.clippedByViewport,
    required this.covered,
    required this.notes,
  });

  final double visibleFraction;
  final bool offscreen;
  final bool clippedByViewport;
  final bool covered;
  final List<String> notes;

  Map<String, dynamic> toJson() => {
        'visibleFraction': visibleFraction,
        'offscreen': offscreen,
        'clippedByViewport': clippedByViewport,
        'covered': covered,
        'notes': notes,
      };
}

class UiDiffAnchorDto {
  const UiDiffAnchorDto({
    required this.id,
    required this.label,
    required this.rectLogical,
    required this.visible,
    required this.visibility,
  });

  final String id;
  final String label;
  final UiDiffAnchorRectDto rectLogical;
  final bool visible;
  final UiDiffAnchorVisibilityDto visibility;

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'rectLogical': rectLogical.toJson(),
        'visible': visible,
        'visibility': visibility.toJson(),
      };
}

class UiDiffDeviceDto {
  const UiDiffDeviceDto({
    required this.screenshotWidthPx,
    required this.screenshotHeightPx,
    required this.devicePixelRatio,
    required this.mediaQuerySizeLogical,
    required this.paddingLogical,
    required this.viewPaddingLogical,
    required this.viewInsetsLogical,
  });

  final double screenshotWidthPx;
  final double screenshotHeightPx;
  final double devicePixelRatio;
  final Map<String, double> mediaQuerySizeLogical;
  final Map<String, double> paddingLogical;
  final Map<String, double> viewPaddingLogical;
  final Map<String, double> viewInsetsLogical;

  Map<String, dynamic> toJson() => {
        'screenshotWidthPx': screenshotWidthPx,
        'screenshotHeightPx': screenshotHeightPx,
        'devicePixelRatio': devicePixelRatio,
        'mediaQuerySizeLogical': mediaQuerySizeLogical,
        'paddingLogical': paddingLogical,
        'viewPaddingLogical': viewPaddingLogical,
        'viewInsetsLogical': viewInsetsLogical,
      };
}

class UiDiffExportDto {
  const UiDiffExportDto({
    required this.screen,
    required this.device,
    required this.anchors,
  });

  static const framework = 'flutter';
  static const coordinateSpace = 'flutterLogical';
  static const coordinateOrigin = 'flutterView';

  final String screen;
  final UiDiffDeviceDto device;
  final List<UiDiffAnchorDto> anchors;

  Map<String, dynamic> toJson() => {
        'framework': framework,
        'screen': screen,
        'coordinateSpace': coordinateSpace,
        'coordinateOrigin': coordinateOrigin,
        'device': device.toJson(),
        'anchors': anchors.map((a) => a.toJson()).toList(),
      };

  String toJsonString({bool pretty = true}) {
    final encoder =
        pretty ? const JsonEncoder.withIndent('  ') : const JsonEncoder();
    return encoder.convert(toJson());
  }
}

// ---------------------------------------------------------------------------
// Visibility helpers
// ---------------------------------------------------------------------------

UiDiffAnchorVisibilityDto _computeVisibility(
  RenderBox renderBox,
  Size screenSize,
) {
  if (!renderBox.hasSize) {
    return const UiDiffAnchorVisibilityDto(
      visibleFraction: 0.0,
      offscreen: true,
      clippedByViewport: false,
      covered: false,
      notes: ['render_box_has_no_size'],
    );
  }

  final offset = renderBox.localToGlobal(Offset.zero);
  final widgetRect = offset & renderBox.size;
  final screenRect = Offset.zero & screenSize;

  final offscreen = !widgetRect.overlaps(screenRect);

  // Viewport clipping: check nearest scroll viewport.
  // Overlay/z-order occlusion is not fully implemented in v1.
  bool clippedByViewport = false;
  if (!offscreen) {
    final viewport = RenderAbstractViewport.maybeOf(renderBox);
    if (viewport != null && viewport is RenderBox) {
      // Explicit cast: Dart may not narrow RenderAbstractViewport → RenderBox
      // in a compound && without it.
      final vpBox = viewport as RenderBox;
      final vpOffset = vpBox.localToGlobal(Offset.zero);
      final vpRect = vpOffset & vpBox.size;
      clippedByViewport = widgetRect.intersect(vpRect).isEmpty;
    }
  }

  final fraction = _visibleFraction(widgetRect, screenRect);

  return UiDiffAnchorVisibilityDto(
    visibleFraction: fraction,
    offscreen: offscreen,
    clippedByViewport: clippedByViewport,
    covered: false, // overlay occlusion not implemented in v1
    notes: const ['overlay_occlusion_not_fully_implemented'],
  );
}

double _visibleFraction(Rect widgetRect, Rect screenRect) {
  if (widgetRect.width <= 0 || widgetRect.height <= 0) return 0.0;
  if (!widgetRect.overlaps(screenRect)) return 0.0;
  final intersection = widgetRect.intersect(screenRect);
  final widgetArea = widgetRect.width * widgetRect.height;
  final visibleArea = intersection.width * intersection.height;
  return (visibleArea / widgetArea).clamp(0.0, 1.0);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

class _AnchorEntry {
  _AnchorEntry({required this.id, required this.label});

  final String id;
  String label;
  Rect? rectLogical;
  UiDiffAnchorVisibilityDto? visibility;
}

/// Collects UiDiffAnchor measurements for the current screen and exports a
/// plain JSON DTO.  Debug-only — all methods no-op in release builds.
class UiDiffAnchorRegistry {
  UiDiffAnchorRegistry._();
  static final UiDiffAnchorRegistry instance = UiDiffAnchorRegistry._();

  final Map<String, _AnchorEntry> _anchors = {};
  String _currentScreen = 'unknown';

  void setScreen(String screen) {
    if (!kDebugMode) return;
    _currentScreen = screen;
  }

  void register(String id, String label) {
    if (!kDebugMode) return;
    _anchors.putIfAbsent(id, () => _AnchorEntry(id: id, label: label));
  }

  void unregister(String id) {
    if (!kDebugMode) return;
    _anchors.remove(id);
  }

  void update(
    String id,
    String label,
    Rect rectLogical,
    UiDiffAnchorVisibilityDto visibility,
  ) {
    if (!kDebugMode) return;
    final entry = _anchors[id] ?? _AnchorEntry(id: id, label: label);
    entry.label = label;
    entry.rectLogical = rectLogical;
    entry.visibility = visibility;
    _anchors[id] = entry;
  }

  /// Exports the current anchor state as a plain DTO.
  /// [context] must be a valid mounted BuildContext with MediaQuery.
  UiDiffExportDto export(BuildContext context) {
    final mq = MediaQuery.of(context);
    final dpr = mq.devicePixelRatio;
    final size = mq.size;
    final pad = mq.padding;
    final vpad = mq.viewPadding;
    final vins = mq.viewInsets;

    final device = UiDiffDeviceDto(
      screenshotWidthPx: size.width * dpr,
      screenshotHeightPx: size.height * dpr,
      devicePixelRatio: dpr,
      mediaQuerySizeLogical: {'width': size.width, 'height': size.height},
      paddingLogical: {
        'top': pad.top,
        'right': pad.right,
        'bottom': pad.bottom,
        'left': pad.left,
      },
      viewPaddingLogical: {
        'top': vpad.top,
        'right': vpad.right,
        'bottom': vpad.bottom,
        'left': vpad.left,
      },
      viewInsetsLogical: {
        'top': vins.top,
        'right': vins.right,
        'bottom': vins.bottom,
        'left': vins.left,
      },
    );

    const _notYetMeasured = UiDiffAnchorVisibilityDto(
      visibleFraction: 0.0,
      offscreen: true,
      clippedByViewport: false,
      covered: false,
      notes: ['not_yet_measured'],
    );

    final anchorDtos = _anchors.values.map((entry) {
      final rect = entry.rectLogical ?? Rect.zero;
      final vis = entry.visibility ?? _notYetMeasured;
      final isVisible =
          !vis.offscreen && !vis.clippedByViewport && vis.visibleFraction > 0;
      return UiDiffAnchorDto(
        id: entry.id,
        label: entry.label,
        rectLogical: UiDiffAnchorRectDto.fromRect(rect),
        visible: isVisible,
        visibility: vis,
      );
    }).toList();

    return UiDiffExportDto(
      screen: _currentScreen,
      device: device,
      anchors: anchorDtos,
    );
  }

  /// Clears all registered anchors and resets the screen name.
  /// Primarily for test isolation.
  @visibleForTesting
  void reset() {
    _anchors.clear();
    _currentScreen = 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

/// Wraps [child] with zero layout impact and records its global rect in
/// [UiDiffAnchorRegistry] each frame.  No-ops in release builds.
///
/// Place this widget around a target element you want the mobile-ui-diff MCP
/// to locate by Flutter geometry instead of static crop coordinates.
///
/// ```dart
/// UiDiffAnchor(
///   id: 'today.kcalLeftPill',
///   label: '980 kcal left',
///   child: Container(…),
/// )
/// ```
class UiDiffAnchor extends StatefulWidget {
  const UiDiffAnchor({
    required this.id,
    required this.label,
    required this.child,
    super.key,
  });

  final String id;
  final String label;
  final Widget child;

  @override
  State<UiDiffAnchor> createState() => _UiDiffAnchorState();
}

class _UiDiffAnchorState extends State<UiDiffAnchor> {
  // Guard against scheduling multiple callbacks within the same frame.
  bool _pendingUpdate = false;

  @override
  void initState() {
    super.initState();
    if (!kDebugMode) return;
    UiDiffAnchorRegistry.instance.register(widget.id, widget.label);
    _scheduleUpdate();
  }

  @override
  void didUpdateWidget(UiDiffAnchor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!kDebugMode) return;
    if (oldWidget.id != widget.id) {
      UiDiffAnchorRegistry.instance.unregister(oldWidget.id);
      UiDiffAnchorRegistry.instance.register(widget.id, widget.label);
    }
    _scheduleUpdate();
  }

  @override
  void dispose() {
    if (kDebugMode) {
      UiDiffAnchorRegistry.instance.unregister(widget.id);
    }
    super.dispose();
  }

  void _scheduleUpdate() {
    if (_pendingUpdate) return;
    _pendingUpdate = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _pendingUpdate = false;
      _updateAnchor();
    });
  }

  void _updateAnchor() {
    if (!mounted) return;
    final ro = context.findRenderObject();
    if (ro is! RenderBox || !ro.hasSize) return;
    final screenSize = MediaQuery.sizeOf(context);
    final offset = ro.localToGlobal(Offset.zero);
    final rect = offset & ro.size;
    final visibility = _computeVisibility(ro, screenSize);
    UiDiffAnchorRegistry.instance.update(
        widget.id, widget.label, rect, visibility);
  }

  @override
  Widget build(BuildContext context) {
    if (kDebugMode) _scheduleUpdate();
    // Returns child unchanged — zero layout impact in both debug and release.
    return widget.child;
  }
}
