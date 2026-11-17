# Owner Android fixes

Goal: fresh camera grant succeeds, one content capture ring clears navigation, tab content/header follow swipes and spring, test APK is release arm64 with existing signer.
Owner supplied scope/order; continue autonomously on clean main. Flutter 3.41.9 via FVM; phone-adb only; no cloud writes. Tests first; Antigravity review per behavior stage; commit/push each before proceeding.

- [x] 1. `lib/shared/services/camera_service.dart`, `test/scan/`: serialize camera operations to prevent permission-dialog resume/capture race; delayed platform regressions RED/GREEN; Samsung pm-clear/grant screenshot from source-bound Test APK.
- [ ] 2. `lib/features/tier1/tier1_app.dart`, `test/tier1/`: put one semantic capture ring in content, nav selects only, retain visible active dots and safe bottom inset; widget bounds/tap assertions, dark/light narrow/large renders and Samsung screenshot.
- [ ] 3. `lib/features/tier1/`, `test/tier1/`: Flutter page controller track with spring paging and header driven by fractional position; native gesture arbitration, edge guard, modal/field protection; drag/cancel/flick/nav/reduced-motion tests and Samsung swipes. Read Swiss swipeNav/headerMotion reference in full.
- [ ] 4. `.github/workflows/android-test-apk.yml`, `test/tool/android_test_apk_contract_test.dart`: release --target-platform android-arm64, materialize existing test signing properties without changing production signing gate; preserve signer/checksum/source contract. Run local analyze/full Flutter/Python tests first, CI artifact inspect ABI/AOT/debuggable/signer/size, Samsung install/screenshots.

Every stage updates Status here and in handover/status docs; run relevant/full checks, read diff, review, commit then push. CI-dependent device follow-up can amend the same stage before starting the next. Existing legacy reference branding/nav instructions yield to explicit owner feedback.
