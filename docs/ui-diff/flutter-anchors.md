# Flutter UI-Diff Anchors

## What is `UiDiffAnchor`?

`UiDiffAnchor` is a debug-only wrapper widget that records a widget's global
layout rect after each frame.  It allows the `mobile-ui-diff` MCP to locate UI
targets by current Flutter geometry instead of hand-tuned static crop
coordinates.

**Zero visual impact** — `build()` returns `widget.child` unchanged in both
debug and release builds.  No layout, padding, semantics, or painting changes.

## How to Add a New Anchor

Wrap the target widget:

```dart
import '../../debug/ui_diff/ui_diff_anchor.dart';

UiDiffAnchor(
  id: 'today.myNewWidget',     // stable dot-notation ID
  label: 'My widget label',    // human-readable; can be dynamic
  child: MyWidget(...),
)
```

Rules:
- **ID format**: `<screen>.<elementName>` — e.g. `today.kcalLeftPill`
- IDs must be stable across runs so the MCP can look them up in the config.
- Do not change IDs once used in `ui-diff.config.json`.
- In release builds the wrapper is a transparent pass-through (no overhead).

Call `UiDiffAnchorRegistry.instance.setScreen('today')` in the screen's
`initState` so the export knows which screen produced the anchors.

## Required JSON Fields

The exported file is a plain JSON object.  No Flutter framework types appear.

```jsonc
{
  "framework": "flutter",
  "screen": "today",
  "coordinateSpace": "flutterLogical",  // logical pixels
  "coordinateOrigin": "flutterView",    // top-left of the Flutter view
  "device": {
    "screenshotWidthPx":  1080,         // physical pixels (size × dpr)
    "screenshotHeightPx": 2400,
    "devicePixelRatio":   3.0,
    "mediaQuerySizeLogical": { "width": 360.0, "height": 800.0 },
    "paddingLogical":        { "top": 24.0, "right": 0.0, "bottom": 0.0, "left": 0.0 },
    "viewPaddingLogical":    { "top": 24.0, "right": 0.0, "bottom": 34.0, "left": 0.0 },
    "viewInsetsLogical":     { "top": 0.0,  "right": 0.0, "bottom": 0.0, "left": 0.0 }
  },
  "anchors": [
    {
      "id":    "today.kcalLeftPill",
      "label": "980 kcal left",
      "rectLogical": { "x": 104.0, "y": 510.0, "width": 90.0, "height": 24.0 },
      "visible": true,
      "visibility": {
        "visibleFraction": 1.0,
        "offscreen":       false,
        "clippedByViewport": false,
        "covered":         false,
        "notes":           ["overlay_occlusion_not_fully_implemented"]
      }
    }
  ]
}
```

### Why DPR, padding, viewPadding, viewInsets?

The MCP converts Flutter logical coordinates to physical pixel crop boxes for
the screenshot.  It needs `devicePixelRatio` for the scale factor and all
padding variants to correctly account for system chrome (status bar, nav bar,
keyboard) that shifts the visible area.

## Visibility Rules

| Condition | `visible` | Notes |
|---|---|---|
| Widget rect overlaps screen rect | `true` | Normal case |
| Widget scrolled above/below viewport | `false` | `offscreen: true` |
| Widget clipped by nearest scroll viewport | `false` | `clippedByViewport: true` |
| Widget behind overlay (z-order) | `false` (v2) | v1: always `covered: false` |

**v1 limitation**: Overlay/z-order occlusion is not implemented.  `covered` is
always `false`.  All anchors include `"overlay_occlusion_not_fully_implemented"`
in their `notes`.  This will be addressed in a future iteration.

## How to Generate `flutter-anchors.json`

### Option A — Integration test (recommended for MCP use)

```powershell
# Connect a device or start the emulator first
fvm flutter emulators --launch Api35_NoPlay   # wait for adb devices
fvm flutter test integration_test/today_anchor_dump_test.dart --device-id <id>
# Then pull from device:
.\scripts\pull_flutter_anchors.ps1
```

The file lands at `.ui-diff/today/current/flutter-anchors.json`.

### Option B — In-app auto-dump (UI-diff mode)

When `uiDiffModeProvider` is `true` (set by the debug/reseed route), the Today
screen automatically dumps anchors after the second frame.  The file is written
to app documents storage on the device.  Pull it with:

```powershell
.\scripts\pull_flutter_anchors.ps1
```

Or manually:
```powershell
adb shell "run-as com.example.calorix cat files/ui-diff/today/current/flutter-anchors.json"
```

## Artifact Protocol

The writer follows an atomic two-step protocol:

1. Write JSON to `flutter-anchors.tmp.json` with `flush: true`.
2. Rename (or copy+delete) to `flutter-anchors.json`.
3. Write timestamp to `flutter-anchors.done` with `flush: true`.

The MCP **must** wait for `flutter-anchors.done` before reading the JSON.
This prevents partial reads if the write is slow.

## MCP Behaviour for Missing Anchors

If a `ui-diff.config.json` overlapLegibility or criterion region references an
anchor ID that is absent from `flutter-anchors.json`, the MCP should emit:

```
actionRequired: missing_flutter_anchor
message: "anchor today.kcalLeftPill not found in flutter-anchors.json"
```

The run should be rejected (not silently skipped) so the missing anchor is
visible in the session report.

## Anchor IDs Added to the Today Screen

| ID | Widget |
|---|---|
| `today.macroRingHero` | Outer `_HeroMacroCard` Card |
| `today.kcalLeftPill` | "X kcal left" Container inside ring center |
| `today.proteinRow` | Protein `_MacroSubCardItem` |
| `today.carbsRow` | Carbs `_MacroSubCardItem` |
| `today.fatRow` | Fat `_MacroSubCardItem` |
| `today.recentScansSection` | "Recent scans" header Row |
| `today.recentScansCount` | "N today" Text |
| `today.mealCardsSection` | Meal cards Column |
| `today.bottomNav` | `_CalorixBottomNav` Container (AppShell) |
| `today.scanButton` | `_ScanFAB` GestureDetector (AppShell) |
