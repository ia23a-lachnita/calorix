# UI Diff Session - Today Screen - 2026-05-30

## Goal

Use the mobile-ui-diff MCP from Codex on the connected Android device, run the Calorix app, inspect the Today screen against the mockup, and document what the MCP did and did not catch.

## Environment

- Repo: `C:\Users\xursc\projects\calorix`
- Branch at start: `main`, ahead of `origin/main` by one existing local commit:
  - `dbe4a4a Reduce Today macro ring visual footprint`
- Device: Samsung `SM-G780G`, serial `R58R61161NA`
- Android: 13
- Device screenshot size: `1080x2400`
- Density: `480`
- Expected image used by config: `docs/mockups/image/dark/single/Today.png`
- `Today_1080.png`: not used and not recreated.

## MCP Availability

The UI diff MCP is available in Codex, but there was one tool discovery issue:

- The stale namespace form `mcp__mobile_ui_diff__...` returned `unsupported call`.
- After refreshing/discovering tools, the working namespace was `mcp__mobile_ui_diff`.
- Working tools used:
  - `vlm_health`
  - `calibrate_android_device`
  - `capture_android_screenshot`
  - `run_screen_ui_diff`

This should be noted as an MCP/Codex discovery issue because an agent can believe the MCP is unavailable if it calls the stale namespace first.

## App And Device Setup

I built and installed the debug app on the connected device:

```powershell
fvm flutter build apk --debug
adb -s R58R61161NA install -r build\app\outputs\flutter-apk\app-debug.apk
adb -s R58R61161NA shell pm grant com.calorix.calorix android.permission.POST_NOTIFICATIONS
```

The first capture path produced an invalid black screenshot because the device screen was dark/asleep. I then woke and unlocked the device and kept the screen awake:

```powershell
adb -s R58R61161NA shell input keyevent KEYCODE_WAKEUP
adb -s R58R61161NA shell wm dismiss-keyguard
adb -s R58R61161NA shell svc power stayon true
adb -s R58R61161NA shell settings put system screen_off_timeout 1800000
```

## VLM Health

`vlm_health` passed.

- Provider: Ollama
- Selected model: `moondream:latest`
- Ollama reachable: yes
- Model installed: yes
- Model running: yes
- Load check: ok
- Image input check: ok
- Warnings: none
- `actionRequired`: none

## Calibration

`calibrate_android_device` succeeded.

- Status bar estimate: `y=0`, `height=72`
- Navigation bar estimate: `y=2316`, `height=84`
- Calibration result itself had no config suggestions.
- The later diff run still suggested adding a device profile for `SM-G780G`.

The current `ui-diff.config.json` masks the actual status bar as `0,0,1080,80` and bottom chrome as `0,2268,1080,132`. That is close, but the comparison still includes enough platform/header/nav geometry to create noisy diffs.

## Today ROI Config Inspection

Current Today ROIs:

| ROI | maxDiffPercent | critical | visualAssertions |
| --- | ---: | --- | --- |
| `macro-ring-hero` | 15% | false/not set | none |
| `macro-rows` | 15% | false/not set | none |
| `meal-cards` | 25% | false/not set | none |

Important: because `critical` is not set and there are no `visualAssertions`, `qualityStatus` can be `pass` even when an ROI status is `fail`. That happened again in this session.

## Runs

### run-025 - invalid

- MCP status: `fail`
- Global diff: `30.46%`
- `qualityStatus`: `pass`
- Problem: `actual.png` and ROI actual crops were visually all black.

This run should not be used for UI decisions. It proves the MCP can currently compute and report metrics on a blank/black capture without stopping the run. Manual artifact inspection caught this. The MCP should ideally detect blank captures before VLM/ROI analysis and return an explicit invalid-capture error.

### Manual Screenshot

After waking the device, I captured:

`C:\Users\xursc\projects\calorix\.ui-diff\today\manual-2026-05-30-before-rerun.png`

This screenshot was valid and showed the seeded Today screen.

### run-026 - valid

- MCP status: `pass`
- Global diff: `12.78%`
- Global threshold: `14%`
- `qualityStatus`: `pass`
- Expected: `docs/mockups/image/dark/single/Today.png`
- `Today_1080.png`: not used
- VLM: `moondream:latest`
- VLM fallback used: no
- `actionRequired`: none
- Warning: "Global pass does not mean local visual parity; large local hotspots remain."
- Warning: no matching Android device profile found for `SM-G780G`.

Artifacts:

- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\expected.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\actual.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\diff.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\regions-of-interest\macro-ring-hero-expected.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\regions-of-interest\macro-ring-hero-actual.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\regions-of-interest\macro-ring-hero-structural-diff.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\regions-of-interest\macro-rows-expected.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\regions-of-interest\macro-rows-actual.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\regions-of-interest\macro-rows-structural-diff.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\regions-of-interest\meal-cards-expected.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\regions-of-interest\meal-cards-actual.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\regions-of-interest\meal-cards-structural-diff.png`
- `C:\Users\xursc\projects\calorix\.ui-diff\today\run-026\report.json`

## Before/After ROI Table

The prior valid visual run from the previous session was `run-024`. This session's valid run is `run-026`.

| ROI | run-024 raw | run-024 structural | run-024 status | run-026 raw | run-026 structural | run-026 status | run-026 dynamicMaskedPercentOfRoi |
| --- | ---: | ---: | --- | ---: | ---: | --- | ---: |
| `macro-ring-hero` | 18.21% | 15.34% | fail | 18.27% | 15.41% | fail | 14.19% |
| `macro-rows` | 6.93% | 8.30% | pass | 6.93% | 8.30% | pass | 40.02% |
| `meal-cards` | 13.32% | 6.82% | pass | 13.33% | 6.82% | pass | 70.05% |

The numbers are effectively unchanged from the last valid run. That is expected because this session did not make another Flutter visual change; it tested the current committed state on the connected device.

## Manual Visual Findings

The seeded macro totals remained correct:

- `1,420` kcal eaten
- `980 kcal left`
- Protein `96g / 170g`
- Carbs `132g / 250g`
- Fat `38g / 70g`

Manual inspection still finds real differences that the global pass hides:

1. The macro ring is still too large/right-shifted/downward and too glowy compared with the mockup. It is improved from the old oversized state, but still fails `macro-ring-hero` structurally at `15.41%` against a `15%` threshold.
2. The green arc overlaps the center pill area enough that `980 kcal left` appears partially obscured/clipped in the actual screenshot. This is a concrete user-visible problem, not just a diff artifact.
3. The macro rows now pass structurally, but the top of the `macro-rows` ROI still contains some ring intrusion. I do not see a separate macro-row component bug yet; the remaining row noise looks mostly connected to the ring/card geometry and masks.
4. The first meal card in actual is `Salmon & Vegetables` at `410 kcal`. The expected mockup shows `Chicken Rice Bowl` at `620 kcal`.
5. The seed service comment says Chicken Rice Bowl should be first, but the seed timestamps make Salmon latest:
   - `lib\shared\services\seed_data_service.dart` says Chicken should be latest.
   - `watchTodayEntries` sorts by `timestamp` descending.
   - Salmon is seeded at `16:00`; Chicken is seeded at `12:48`.
6. The `3 TODAY` badge differs visually. The app uses a green rounded pill; the mockup reads more like compact text without the same filled-pill treatment.
7. Header/date/platform chrome differ. The expected image has iPhone-style `9:41` and `FRIDAY - MAY 15`; actual is Android device chrome and `SATURDAY - MAY 30`.
8. Bottom navigation and scan FAB geometry differ because the Android device chrome and baseline image geometry do not match exactly.

## MCP/VLM Findings

The MCP is useful for producing repeatable artifacts and ROI numbers, but it still needs guardrails:

1. `qualityStatus` is misleading for this config. `run-026` has `qualityStatus: pass` even though `macro-ring-hero` is `fail`. If ROI failures should block acceptance, the ROIs need `critical: true` or visual assertions, or MCP quality logic needs to treat ROI failure as a quality failure.
2. Blank capture detection is missing. `run-025` actual output was black, yet the MCP still created normal-looking metrics and a `qualityStatus: pass`.
3. The VLM labels are not trustworthy enough to drive fixes alone. Examples from `run-026` include weak labels like `KCAL EATING` and irrelevant descriptions for crops. The VLM is fine as extra signal, but manual artifact inspection is still required.
4. The dynamic masks are very broad:
   - `macro-rows`: 40.02% of ROI masked
   - `meal-cards`: 70.05% of ROI masked
   These masks explain why meal cards can pass structurally while the first visible meal title/order is wrong.
5. The MCP correctly warns that global pass does not mean local parity. That warning is important and should probably be elevated when a configured ROI fails.
6. The run suggested adding a calibrated device profile for `SM-G780G`; this should reduce repeated system-bar/platform noise.

## Recommended Next Actions

1. Add or save a reviewed `SM-G780G` device profile in `ui-diff.config.json`.
2. Add black/blank screenshot detection to the MCP or preCapture flow. A blank `actual.png` should invalidate the run.
3. Decide whether Today ROI failures should gate quality. If yes, mark `macro-ring-hero` critical and/or add visual assertions for ring size, pill legibility, and row intrusion.
4. Fix the seed ordering mismatch so `Chicken Rice Bowl` is actually first, or update the expected/mockup contract if Salmon is intended to be first.
5. Make one more small ring iteration: reduce glow/arc dominance or adjust layering so the kcal-left pill stays legible.
6. Reconsider the meal-card dynamic mask. Masking 70% of the ROI hides exactly the text/order mismatch that matters on this screen.
7. Consider an Android-specific expected baseline at `1080x2400`, or improve scaling/cropping so iPhone mockup chrome does not dominate Android comparisons.

## Conclusion

The UI diff MCP is usable from Codex and can run against the connected device, but the current Today setup can still report a pass while hiding important visual mismatches. The most important real UI issue remains the macro ring/pill composition. The most important test-tooling issues are blank-capture detection, non-gating ROI failures, overly broad dynamic masks, and missing Android device profile support.
