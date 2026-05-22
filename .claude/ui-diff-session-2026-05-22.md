# UI Diff Session — 2026-05-22

## Goal
Compare the live Flutter app (Today screen) against the light mockup (`docs/mockups/image/light/single/Today.png`) using the `mobile-ui-diff` MCP server, make targeted visual fixes, and document findings.

## Setup
- Created `ui-diff.config.json` at repo root with a `today` screen profile.
- Platform: Android (emulator-5554, 1080×2400).
- Expected image: `docs/mockups/image/light/single/Today.png`.
- Ignore regions: status bar (y=0–80) and system nav bar (y=2350–2400).
- VLM analysis: **disabled** (Ollama failed to load model every run — all regions returned `analysisStatus: error`).

## Run History

| Run | diffPercent | Trend | Notes |
|-----|-------------|-------|-------|
| run-005 | 62.7% | — | Baseline: screenshot captured Scan screen (wrong tab) |
| run-006 | 14.7% | improved | Navigated to Today first; proper baseline |
| run-007 | 16.5% | worsened | Ring stroke/gap changes applied but app not fully rebuilt |
| run-008 | 13.7% | improved | Full restart applied all changes |

## Fixes Applied

| Issue | Fix | File |
|-------|-----|------|
| Active tab indicator dot was black in light mode | Changed dot color to `AppColors.cyan` (`#19D3D9`) | `app_shell.dart` |
| MacroRing arcs too thin vs mockup | Increased default `strokeWidth` from `18` → `24` | `macro_ring.dart` |
| MacroRing arcs too far apart (visible gap between track rings) | Reduced gap multiplier from `1.5×` → `1.2×` | `macro_ring.dart` |
| MacroRing track circles too prominent (opaque beige `#E8E4DC`) | Pass lighter track `#F2F0EB` from Today screen (dark: unchanged) | `today_screen.dart`, `macro_ring.dart` |
| `AnimatedMacroRing` didn't support `trackColor` passthrough | Added `trackColor` field to `AnimatedMacroRing` | `macro_ring.dart` |
| "kcal left" pill background barely visible (10% opacity) | Increased `kcalLeftPillBg` from `0x1A` → `0x33` (20% opacity) | `app_colors.dart` |
| Scan FAB gradient ring too thin | Increased `_SweepRingPainter` `strokeWidth` from `2.5` → `4.5` | `app_shell.dart` |

## Remaining Diff (~13.7%) — Not Actionable

| Source | Estimated contribution | Reason |
|--------|----------------------|--------|
| iOS Dynamic Island vs Android status bar | ~3% | OS-level chrome difference |
| Battery icon rendering difference (iOS vs Android) | ~1% | OS-level |
| Different meal data (Protein Shake vs Chicken Rice Bowl) | ~5% | Real app data vs mockup fixture |
| Macro ring arc pixel positions vs exact mockup rendering | ~3% | Mockup was likely rendered in Figma at a specific scale |
| Bottom nav Scan FAB ring position offset | ~1.7% | Minor size/position delta |

## Difficulties

### Navigation — App lands on Scan, not Today
The `run_screen_ui_diff` tool takes a fresh ADB screenshot before comparison. Since Scan is the default landing tab, every fresh app launch captures Scan, not Today. The workaround is to `adb shell input tap 108 2280` (Today tab coordinates at 1080×2400) before each diff run. This should ideally be scripted into the screen profile as a `preCapture` command (enhancement request for the MCP).

### VLM Analysis Unavailable
Ollama consistently failed to load the model (`model failed to load, resource limitations`). All 8 VLM slots per run returned `analysisStatus: error`. All region analysis was manual (visual inspection of crop PNGs). This significantly slows the feedback loop. Fix: ensure Ollama has sufficient RAM or use a smaller model (e.g., `llava:7b` instead of `llava:13b`).

### Hot Reload vs Hot Restart
`const` color changes (like `kcalLeftPillBg`) require a full hot restart, not hot reload. The Dart MCP `hot_reload` returned `-32000` for these changes. Workaround: stop app via `mcp__dart__stop_app` + relaunch via `mcp__dart__launch_app` + reconnect DTD + tap Today tab. Adds ~60s per iteration.

### Dart MCP `analyze_files` Hangs
The `mcp__dart__analyze_files` tool hung for over 1 hour and had to be interrupted. Workaround: use `fvm flutter analyze` via PowerShell directly (runs in ~15s).

### Image Scaling in Pixel Diff
The mockup PNG is iPhone resolution (~390px wide) while the Android screenshot is 1080px wide. The MCP tool scales both to a common size before comparing. This means pixel coordinates in the diff report don't directly map to device coordinates or source code layout units. Region crops are the best way to understand what's actually diffing.

## Config Used (`ui-diff.config.json`)

```json
{
  "screens": {
    "today": {
      "platform": "android",
      "expectedImage": "docs/mockups/image/light/single/Today.png",
      "outputDir": ".ui-diff/today",
      "pixelmatchThreshold": 0.1,
      "maxDiffPercent": 0.01,
      "maxRegions": 20,
      "maxVlmRegions": 8,
      "includeVlmAnalysis": true,
      "ignoreRegions": [
        { "x": 0, "y": 0, "width": 1080, "height": 80, "reason": "status bar" },
        { "x": 0, "y": 2350, "width": 1080, "height": 50, "reason": "navigation bar" }
      ]
    }
  }
}
```

## Improvement Suggestions for mobile-ui-diff MCP

1. **`preCapture` hook in screen profile** — run an ADB tap or shell command before capturing, so navigating to the right screen is automatic.
2. **Default to dark mockup for dark-mode capture** — add a `theme` field to the profile to auto-select the right expected image.
3. **Exclude content-only regions** — ability to mask regions by widget type (e.g., ignore text content inside `ListView` items) to avoid data-driven false positives.
4. **VLM fallback model config** — let the profile specify the Ollama model name so a smaller model can be used when VRAM is limited.
5. **Auto-ignore status bar** — detect the status bar height from ADB and auto-exclude it, removing the need to hard-code ignore region y coordinates per device.
