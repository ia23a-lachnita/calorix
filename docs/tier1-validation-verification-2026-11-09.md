# Portion validation and aggregate measurement continuation

The invalid-portion message now wraps and the keyboard closes on invalid Apply. Typed input/dialog and saved record/revision stay intact; valid resubmission works. Existing local Tier1 UI/store/theme, original analysis and model route were reused. Production inference was not changed or redeployed.

## Actual verification

Tests first70ba870: [CI42583485555](https://github.com/ia23a-lachnita/calorix/actions/runs/42583485555) ran988pass/1historicalskip/2expectedfail (RenderParagraph ellipsis at360x800 and keyboard stayed visible). No compile/import failure. Cancelled unrelated backend rerun after this observed RED.

Sourcec4b2aebbb43aa48d326e6ae8d52b46b16a98a29c: [fullCI42585060571](https://github.com/ia23a-lachnita/calorix/actions/runs/42585060571) SUCCESS: Flutter990pass/1historicalskip/analyzerNoissues; Functions97files/5340pass/1historicalskip/build/lint; Python37; Node5; signed APK. Subsequentf015010 changes only Python diagnostic validation/tests and reports: new2regressionmethods reproduced9subtestfailures, then all39Python pass locally. Do not attribute39 to the earlier CI37. App/backend/dependency source remains byte-identical to the CI source at this checkpoint.

## APK and device

[Verified APK ZIP](https://github.com/ia23a-lachnita/calorix/actions/runs/42585060571/artifacts/13659103621), expires2026-12-09T08:35:47Z. Extract calorix-1.0.0+1-android-test.apk.

- APK SHA256: df05f2f055fa631958e2b8f236858abb490be43dbdecb46da3164aaf9cd2534c.
- Trusted/CI/extracted V2 certificate SHA256:38815fd37711f170e534cf3c8767de7f0f7ca5f958e755d8a47b03fe2b764b7c. CI verified cryptographic signature; host matched certificate identity/checksum/source/run metadata.
- Before install, set-e enforced all gates. Compiled manifest: FirebaseInitProvider absent, messaging/analytics auto-init false, allowBackup/fullBackupContent false, cloud/device transfer exclusions. Manifest extraction-rule resource ID matches the checked compiled XML resource.
- Samsung SM-G780G/Android13/R58R61161NA identity and installed base.apk hash verified. No uninstall/clear/emulator or provider photo request.

Fresh ARTEMIS tracebdd8592c-1ee3-4c03-8591-9b57c393254b explored old UI before test authoring: full accessibility string but visually ellipsized with and without keyboard. That corrects the earlier limited interpretation based on accessibility alone. Later HTTP429daily20/retry86247s; required diagnose5/5pass, optional scrcpy missing, task cancelled. Wrapper independently confirmed Camera and unchanged owned fixture. No completed-task claim from the cancelled trace.

On the newly verified APK, serial-safe native UI/dumpsys/rawJSON checks confirmed keyboard visible before100001 Apply and automatically hidden afterward WITHOUT Back. The host inspected the screenshot: the full range0..100000g wraps visibly. Invalid text100001/dialog and exact saved record/revision stayed unchanged. Valid86 afterward saved598.64kcal with original analysis retained; restore exact and focused Cancel passed. Owned diagnostic/backup/deviceXML removed; baseline0records preserved; app Camera. Bounded2000line current-process logcat had no matched Flutter/fatal exception. This is sampled runtime inspection, no exhaustive UI-diff/parity or public-release security approval.

## Measurement work

[evaluate_tier1_oracles.py](../evaluate_tier1_oracles.py) and [results/report](tier1-error-sensitivity-2026-11-09/report.md) reuse the frozen public30, no new inference or user measurements. Independent Decimal precision60 recomputation confirmed60original/120substituted energies/264group metric/count/delta fields, errors<1e-9. Full original MAEs unchanged. No causal/achievable-user-correction claim.

Independent source review found0Critical/2Important custom-input gaps: supplied NaN/Infinity on failed statuses bypassed validation, and missing optional trailing CSV cells passed. New regression tests failed before fixes; missing/explicit blank failed predictions remain supported, any supplied malformed numeric value fails, missing cells reject while explicit blank optional cells pass. All39Python pass. Existing frozen results unchanged after fixes.

MCP primary3.8 conversations calorix-tier1-validation-20261109 and calorix-tier1-oracles-20261109: corrected pre/source/fix reviews explicitly agree/MUSTnone. Initial oracle review overgeneralized strictness; independent findings and actual regression proof corrected that. Initial diagnostic review's causal bottleneck wording,300kcal bins,overwrite flag and NaN-undefined proposal were rejected; final scope uses200kcal floor/bins, no overwrite, nonfinite-input rejection and sensitivity-only interpretation. Final validation result review explicitly agree/MUSTnone on supplied evidence; reviewer did not inspect screenshots or execute tests.

Task-owned disk-backed calorix-tier1-continuation-20261109 retains CI/source/APK/runtime/review receipts and synthetic/public diagnostic artifacts. No raw local records, photos, APKs, keys or dependency caches are committed.

## Continued execution

The user requested continued progress after checkpoints. Next is a separately reviewed, bounded actual portion-audit prompt experiment using fresh paired public scans, with production default unchanged. This is not blocked on owner measurements, and it cannot make Android accuracy or actual-user-effort claims. No automatic production promotion is implied.
