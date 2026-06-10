# Today Screen — Flutter Anchor Smoke Validation
**Date:** 2026-06-10  
**Run dir:** `.ui-diff/today/today-anchor-smoke-2026-06-10/`  
**Scope:** `today.kcalLeftPill` criterion only  
**Outcome:** Infrastructure smoke PASSED. Visual parity NOT evaluated (data not seeded).

---

## What Was Tested

This was an infrastructure smoke test only — not a visual parity acceptance run. The goal was to prove the mobile-ui-diff MCP resolves the legibility criterion via the Flutter anchor pipeline (`measurementBoxSource: flutter_anchor`) rather than manual fallback. Visual acceptance requires the app to display the correct fixture data (980 kcal left), which was not seeded in this run.

---

## Infrastructure Smoke: PASSED

| Field | Value | Status |
|---|---|---|
| `measurementBoxSource` | `flutter_anchor` | PASS |
| `resolvedViaFlutterAnchor` | `1` | PASS |
| `resolvedViaManualFallback` | `0` | PASS |
| `manual_fallback` string in report | absent | PASS |
| `rectActualPx` | `{x:415, y:809, w:250, h:61}` | PASS |
| `rectComparisonPx` | `{x:463, y:883, w:280, h:68}` | PASS |
| `transformActualToComparison` | `true` | PASS |
| Criterion `finalTargetStatus` | `matched` | PASS |
| Criterion `errorCount` | `0` | PASS |
| `cacheSummary` | `{attempted:2, cached:0, skipped:0, fresh:2}` | PASS |

---

## Visual Parity: NOT EVALUATED

- `finalJudgeAuditStatus: "fail"` — expected. Device showed "2,400 kcal left" (no data seeded); criterion expects "980 kcal left". The criterion judges correctly flagged the mismatch.
- `visualAuditStatus: "error"` — OpenRouter primary judge failed for global/ROI model judges. Criterion-level judges ran independently and both passed.
- `acceptanceStatus` was not reached. This is not a regression; it reflects the absence of seeded data.

**Visual parity is not confirmed by this run.**

---

## Next-Run TODO

Before a visual acceptance run is valid:

1. **Seed the debug state**: trigger `calorix://debug/reseed` deep link (or `adb shell am start -a android.intent.action.VIEW -d calorix://debug/reseed com.calorix.calorix/.MainActivity`) and wait 5 s for Firestore reseed to complete.
2. **Verify the Today screen shows "980 kcal left"** before capturing the screenshot.
3. **Fix OpenRouter primary judge**: run `model_judges_health mode:deep` to diagnose the API connectivity failure before relying on global/ROI visual audit results.
4. Only after 1–3 does `acceptanceStatus: pass` carry meaningful signal.

---

## Anchor Source

Flutter anchor export from integration test (`today_anchor_dump_test.dart`):
- Device: Samsung SM-G780G, `1080×2355 px`, DPR=3.0, `screenshotDimensionsSource: mediaQueryDerived`
- `today.kcalLeftPill` logical rect: `(138.64, 269.83) 82.71×20` (logical pixels at DPR=3)
- All 8 required anchors present and exported

Anchor path: `.ui-diff/today/current/flutter-anchors.json` (gitignored — regenerate via integration test)  
Target map: `docs/ui-diff/target-maps/today-anchor-target-map.json` (committed stable path)

---

## Coordinate Transform

The MCP emitted a warning that anchor dimensions (1080×2355) differ from ADB screenshot dimensions (1080×2400) — the bottom navigation bar adds 45 px not reflected in MediaQuery. The MCP correctly used actual screenshot dimensions for the transform and still resolved via `flutter_anchor`.

Logical → actual physical (×3 DPR):  
`(138.64, 269.83) 82.71×20` → `(415, 809) 250×61` px

Actual → comparison/mockup (1206×2622 scale):  
`(415, 809) 250×61` → `(463, 883) 280×68` px

---

## Anchor Extraction: Stdout Sentinel Method

Samsung Knox blocks `run-as` on physical devices even for debug builds. The integration test APK is also uninstalled after the run, so direct `adb pull` from app-private storage is unavailable.

**Workaround (implemented):** The integration test prints the full anchor JSON to stdout between sentinel markers:

```
[anchor-json-start]
{ ...json... }
[anchor-json-end]
```

Extract on the host with:

```powershell
$output = fvm flutter test integration_test/today_anchor_dump_test.dart --device-id <device> 2>&1
$json = ($output -join "`n") -replace '(?s).*\[anchor-json-start\]\r?\n(.*?)\r?\n\[anchor-json-end\].*', '$1'
$json | Set-Content .ui-diff\today\current\flutter-anchors.json
```

**Note:** `pull_flutter_anchors.ps1` still attempts `run-as` as a secondary path. This works on rooted devices and emulators; it will silently fail on Knox-locked physical devices. The stdout method is the reliable path for this device.

---

## Infrastructure Fixes Applied This Session

1. **Integration test**: replaced `pumpAndSettle` with `pump(Duration(seconds:2))` to bypass `ConfidenceBadge` infinite repeating `AnimationController`.
2. **Integration test**: added stdout JSON export with sentinels for Samsung Knox workaround.
3. **pull_flutter_anchors.ps1**: corrected `adb` paths from `files/` to `app_flutter/`; done-flag check uses `run-as $PackageId ls app_flutter/...`.
4. **ui-diff.config.json**: added `flutterAnchorsPath` and `targetMapPath` to `today` screen profile; `targetMapPath` now points to committed stable path.
5. **today-anchor-target-map.json**: moved to `docs/ui-diff/target-maps/` (committed); Zod-aligned schema — `version` as string, `mustContainText`/`mustNotMatch`/`anchorDescription` at criterion level.

---

## Pre-commit Verification

- `fvm flutter analyze`: 18 info-level findings, 0 errors, 0 warnings
- `fvm flutter test`: 37/37 passed
