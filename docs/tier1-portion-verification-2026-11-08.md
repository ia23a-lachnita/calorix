# Local per-food portion correction verification

Status: full CI and focused Samsung runtime verification passed at source177b6a19d667bbe91037dd8004496c038d3cf31e. Final source and result/report reviews explicitly agree/MUSTnone. This is prototype workflow evidence, not calorie-accuracy or public-release approval.

## Change

The existing Tier1 editor/store are reused. Each recognized food supports a local served-grams correction, zero exclusion, Cancel and Use original. The nutrient estimate is scaled from original component amounts; repeated edits never compound. Original analysis, inventory, source labels and provenance remain intact. Missing macros remain unknown. Same-gram actions preserve the exact record/intake; restoring all portions returns exact original totals. Real corrections reset confirmed consumption. Rename retains corrected portions/intake; manual nutrient-total changes and explicit new inference archive/clear overrides. The existing optional preparation answer retains component indices/overrides and user name. Corrected repeats use corrected totals and remain unconfirmed.

Optional v1 JSON fields portionOverrides/adjustmentHistory load existing records without migration. Old APK downgrade preservation is not promised. History snapshots exclude prior history recursively and share existing local deletion/backup controls. This does not turn entered grams into weighed references. There are no new model calls, catalog changes or cloud deployment.

## Actual automated evidence

| Source / workflow | Observed result |
| --- | --- |
| cf0b2e2 /42526097592, Flutter128869938131 | Actual initial RED:967pass/1historicalskip/19new failures,11missing domain behavior and8missing UI controls. Compiled/executed; no harness import failure. |
| c9b59b1 /42526607650, Flutter128871514993 | All19new tests GREEN:986pass/1skip. Analyzer3test-helper infos (const/private API) corrected subsequently; whole workflow not green. |
| 67756fc /42526823204, Flutter128872177431 | Actual postcommit reload regression RED:986pass/1skip/1failure: stale editor remained open after CAS committed. |
| 553ac69 /42527266408, Flutter128873530103 | That regression GREEN; added repeated-read regression RED:987pass/1skip/1failure, exposing unhandled History refresh and stale cached entries. |
| 177b6a19d667bbe91037dd8004496c038d3cf31e /42527604689 | Full SUCCESS: Flutter988pass/1historicalskip/analyzer No issues; Functions97files/5340pass/1historicalskip/build/lint; Python28; Node5; signed APK. |

RED workflows were cancelled after the relevant completed Flutter job to stop unrelated backend reruns. No assertions were weakened and canonical Verify triggers/full suites stayed intact. Host FVM is absent; these are real GitHub FVM runs, not claimed local Flutter execution. Arithmetic fixtures are synthetic tests, not measured meals. Existing ordered-worker exhaustion receipts continue to authorize native edits for this same feature.

## Review and engineering decisions

Independent read-only source review found one Important, no Critical: after CAS commits, a reload failure left stale writer controls able to overwrite the correction. Fixed by closing the editor after known-committed refresh error. A second read failure on returning History now catches the error and blocks record entry until a fresh successful app load. These were reproduced in separate CI RED runs before their respective retained fixes.

Ruling: additive format preserves reading old v1 records, without guaranteeing older APKs preserve new fields. Cost if wrong: downgrade could discard correction history; no downgrade is proposed.

Ruling: known-committed reload failure closes the stale editor with an accurate saved/reopen message; a precommit write error leaves it usable with a check-saved-values message. Cost if wrong: a rare read failure requires reopening the meal.

Ruling: repeated read failure blocks cached History and existing capture/manual entry until a successful fresh app initialization. Cost if wrong: transient repeated read failure requires restarting the app. This prevents stale records from being reopened and written.

Deferred minor coverage: dedicated old-v1 reading, malformed override rejection, same-mass action after manual totals, deleted-record dialog conflict. Reviewed code has those guards; dedicated extra regressions were not added. No unresolved Important finding is knowingly deferred.

Antigravity MCP conversation calorix-tier1-portions-20261108, primary gemini-3.8-flash/server High, approvalMode yolo. Pre-review and corrected reload/history guard reviews explicitly agree/MUSTnone. Initial source review missed the stale-write hazard and later retracted its broad persistence approval. Illustrative follow-up snippet included a nonexistent camera argument and a kcal/g typo; neither was copied into source. Final source/result reviews and precision correction explicitly agree/MUSTnone. Reviews are inline source/evidence review, not exhaustive runtime visual inspection.

## Device evidence

Initial identity verified through phone-adb: Samsung SM-G780G, Android13, R58R61161NA. Initial installed checksum bc9a4543799d5fcb39e38220740b8832c8011970f92f09e6c0367c7cc0548d46/source15d1bb5. One task-owned fixture tier1-portion-20261108 imports an existing frozen public result, has no photo and explicitly diagnosticOnly/referenceIsWeighedfalse. Original local record count0 was captured; unrelated records must be preserved.

Before test authoring, ARTEMIS Pro trace5c336929-0255-48c4-bb57-13acc41a6e33 observed History/editor, served419.15/confirmedconsumed210, source-labelled foods and missing portion controls. It then hit HTTP429 Gemini3.6 dailyfreequota20/retry37906s. Required mobile_diagnose(attempt_fix=true,verify_credentials=true) returned degraded with5/5required checks passing; optional scrcpy absent. Task stopped; no final-success/Camera-return claim. Existing record remained unchanged. New-feature verification used serial-safe native ADB and observed hierarchy/contextual food bounds after the ARTEMIS quota failure; no fresh ARTEMIS success is claimed.

Task-owned disk-backed scratch calorix-tier1-portions-20261108 retains raw CI/review/device receipts; no APKs/photos/raw local records are committed. Public30-scan benchmark and all frozen predictions remain unchanged. New accuracy/user-effort measurements: none.

## Verified APK

[Download ZIP](https://github.com/ia23a-lachnita/calorix/actions/runs/42527604689/artifacts/13636472061), extract calorix-1.0.0+1-android-test.apk. Artifact expiry2026-12-08T22:13:32Z. [Full CI](https://github.com/ia23a-lachnita/calorix/actions/runs/42527604689).

- Source177b6a19d667bbe91037dd8004496c038d3cf31e; subsequent tracking commits contain documentation only.
- APK SHA2568d4db73229009a9fe0aefe9bc69e9c028c421d2b029937495e8c1c96e82e6d9d.
- Expected/extracted test signer SHA25638815fd37711f170e534cf3c8767de7f0f7ca5f958e755d8a47b03fe2b764b7c. CI apksigner cryptographic check; host native V2 certificate extraction matches the trusted signer and CI metadata.
- Source/run metadata/checksum/signer and compiled privacy gates passed sequentially with set-e before install. FirebaseInitProvider absent; messaging/analytics auto-init false; allowBackup/fullBackupContent false; cloud/device-transfer exclusions verified. The manifest's dataExtractionRules resource ID was checked against the compiled resource name/path.
- Installed base.apk SHA256 equals the verified downloaded APK. No uninstall, app clear, emulator, cloud inference or backend deployment was performed.

## Observed Samsung results on those exact bits

| Action | Persisted result |
| --- | --- |
| Almonds55→86g | Served419.15000000000003→598.6400000000001kcal; one active override and one history event; consumption null. Original analysis/raw inventory/source/provenance/metadata unchanged. |
| Cancel after typing90; unchanged Apply86 | Exact saved record and revision2 unchanged. |
| Apply100001g | Rejected; record unchanged. Initial native harness assertion could not see explanation with keyboard open. Red border visible; hiding keyboard revealed exact validation message. Screenshot/failure retained. |
| Ate half | 299.32000000000005kcal consumed against corrected total. |
| Zero almond grams | 100.7kcal; excluded label and original55g/source retained; consumption null. |
| Use original | Exact original nutrient doubles restored; overrides omitted; correction history retained. |
| Reapply86; force-stop/relaunch | 598.64 displayed, exact saved598.6400000000001; override/history survive; consumption unconfirmed. |
| Ate all; confirmed repeat1.5 | Parent consumed598.6400000000001. New meal897.9600000000002kcal, sourceconfirmed_repeat, repeatOf original, referenceIsWeighedfalse, no analysis/active overrides, consumption null. Parent unchanged. |
| Delete owned repeat and original through UI | Original baseline records0 restored; no previous backup; owned device XML removed; app returned Camera. |

No new A1 requests or accuracy/user-effort measurements. This replays an existing public prediction and scripts entered grams; it does not establish user behavior or an accuracy improvement. Domain/widget fixtures use synthetic arithmetic separately from this native replay. Last-process bounded2000-line logcat contained no matched Flutter/fatal exception. Runtime screenshots inspected by host: original dialog, applied, invalid with keyboard, excluded, restored, restarted, repeat history, cleaned History and final Camera. Sampled state inspection only, no exhaustive UI-diff/design-parity claim; no auditor/recovery provider routes or diff counts apply.

Additional deferred minor UI issue: on this Samsung keyboard-constrained dialog the validation explanation needs scrolling or keyboard dismissal; the red invalid border is visible. The native check explicitly dismisses the keyboard before asserting the message. Dedicated extra coverage gaps are recorded above. No failed native assertion is represented as an initial pass.

The highest-value next experiment is a reference-backed comparison of the original estimate with one actual user's optional correction, recording served error and interaction time. Hidden reference-weight/oracle scaling cannot establish real correction success or effort. No automatic inference/model change is bundled into this feature.

Actual canonical commands: `fvm flutter test --reporter compact`; `fvm flutter analyze lib/features/tier1 test/tier1`; `npm run build`, `npm run lint`, `npm test` in functions; `python3 -m unittest discover -s tests -p 'test_*.py'`; `node --test tool/frozen_public_eval.test.cjs`; `fvm flutter build apk --debug`, CI signing/certificate checks. All succeeded in42527604689. No additional broad tests were repeated after that passing run because subsequent changes are documentation only.

Final MCP precision receipt explicitly agrees/MUSTnone. Its initial result paraphrase overstated host crypto/byte comparison and called the quota trace20; those statements are not adopted. Cryptographic signature verification occurred in CI; host extracted certificate identity. Cancel/noop assertions compare exact JSON records/revisions. ARTEMIS quota was20calls, actual trace ID recorded above. Nine runtime screenshots were host-inspected; reviewer did not inspect them. Python28 tests and Node5 guards, not28/5 suites. Review route stayed primary3.8 with no fallback. These corrected boundaries are the final reporting basis.

Code commit177b6a1 and earlier verification tracking21d3228 were pushed to origin/feat/tier1-photo-pilot. This final documentation checkpoint follows the tested source; source equality is verified before publishing it. No merge, branch deletion, release/public-readiness approval or new cloud deployment is implied.
