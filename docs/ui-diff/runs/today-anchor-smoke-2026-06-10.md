# Today Screen — Flutter Anchor Smoke Validation
**Date:** 2026-06-10  
**Run dir:** `.ui-diff/today/today-anchor-smoke-2026-06-10/`  
**Scope:** `today.kcalLeftPill` criterion only  
**Goal:** Prove the mobile-ui-diff MCP resolves the legibility criterion via the Flutter anchor pipeline (`measurementBoxSource: flutter_anchor`) and not manual fallback.

---

## Primary Verification Results

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

## Anchor Source

Flutter anchor export from integration test (`today_anchor_dump_test.dart`):
- Device: Samsung SM-G780G, `1080×2355 px`, DPR=3.0, `screenshotDimensionsSource: mediaQueryDerived`
- `today.kcalLeftPill` logical rect: `(138.64, 269.83) 82.71×20` (logical pixels at DPR=3)
- All 8 required anchors present and exported

Anchor path: `.ui-diff/today/current/flutter-anchors.json`  
Target map: `.ui-diff/today/current/today-anchor-target-map.json`

---

## Coordinate Transform

The MCP emitted a warning that anchor dimensions (1080×2355) differ from ADB screenshot dimensions (1080×2400) — bottom navigation bar adds 45px not reflected in MediaQuery. The MCP correctly fell back to actual screenshot dimensions for the transform and still resolved via flutter_anchor.

Logical → actual physical (×3 DPR):  
`(138.64, 269.83) 82.71×20` → `(415, 809) 250×61` px

Actual → comparison/mockup (1206×2622 scale):  
`(415, 809) 250×61` → `(463, 883) 280×68` px

---

## Criterion Audit

**Criterion:** `today.kcalLeftPill.legibility` (`legibility.overlap` domain)  
**Both judges:** succeeded (OpenRouter qwen3-vl primary + NVIDIA nemotron reviewer)  
**`finalTargetStatus`:** `matched`  
**Note:** `finalJudgeAuditStatus: "fail"` is expected — fresh install shows "2,400 kcal left" (no data seeded), fixture expects "980 kcal left". Infrastructure is correct; data mismatch is expected without the debug/reseed deep link.

---

## Global Run Status

- `visualAuditStatus: "error"` — OpenRouter primary judge failed for global/ROI model judges. This is a separate issue from the criterion judges (which both succeeded). The `acceptanceStatus` was blocked by the global judge failure.
- The criterion-level judges ran independently and both passed.

---

## Infrastructure Fixes Applied This Session

1. **Integration test**: replaced `pumpAndSettle` with `pump(Duration(seconds:2))` to bypass `ConfidenceBadge` infinite repeating `AnimationController`.
2. **Integration test**: added JSON stdout output between `[anchor-json-start]` / `[anchor-json-end]` sentinels for Samsung Knox workaround (Knox blocks `run-as` on physical devices).
3. **pull_flutter_anchors.ps1**: corrected `adb` paths from `files/` to `app_flutter/`, and done-flag check from bare `adb shell [ -f ... ]` to `run-as $PackageId ls app_flutter/...`.
4. **ui-diff.config.json**: added `flutterAnchorsPath` and `targetMapPath` to `today` screen profile.
5. **today-anchor-target-map.json**: created with correct Zod-aligned schema — `version` as string, `mustContainText`/`mustNotMatch`/`anchorDescription` at criterion level (not target level).

---

## Pre-commit Verification

- `fvm flutter analyze`: 18 info-level findings, 0 errors, 0 warnings
- `fvm flutter test`: 37/37 passed
