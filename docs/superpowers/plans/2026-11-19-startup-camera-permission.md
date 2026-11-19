# Startup camera permission plan

On launch, Ravlo requests missing Android camera access and prepares the preview after a grant. If the user has already tapped the shutter, that action continues to a single capture once access is granted.

1. [x] Add regressions to `test/tier1/capture_navigation_test.dart`: startup request and preview, no capture until tap, denial with manual entry, one tap through a later grant, overlapping startup and shutter requests, and leaving Scan during a pending shutter.
2. [x] Update `lib/features/tier1/tier1_app.dart`: request once per startup in the foreground, share a pending permission check and request, retain manual entry and existing device camera serialization. Run focused tests and the Tier1 analyzer, review, then commit and push.
3. [x] Verify the source-matched test APK on Samsung. Revoke only camera access to exercise the initial grant and denial with a shutter retry. Inspect screenshots and remove only test captures. Update the Status section and `docs/tier1-phone-runbook.md`.

The local run passed 172 tests and the scoped analyzer. Verify 44576419470 and Test Android APK 44576423398 passed. On Samsung, the [source-matched APK](https://github.com/ia23a-lachnita/calorix/actions/runs/44576423398/artifacts/14558487898) passed startup grant, first tap, startup denial, manual entry and capture immediately after a shutter retry grant. Removed both local test photos and confirmed existing records remain.
