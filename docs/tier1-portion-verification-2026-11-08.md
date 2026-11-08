# Local per-food portion correction verification

Status: final Flutter988pass/1historicalskip and analyzer clean; full backend/APK/runtime checks pending. No completion or release approval claim.

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
| 177b6a19d667bbe91037dd8004496c038d3cf31e /42527604689 | Flutter988pass/1historicalskip; focused analyzer No issues. Backend/signed APK pending. |

RED workflows were cancelled after the relevant completed Flutter job to stop unrelated backend reruns. No assertions were weakened and canonical Verify triggers/full suites stayed intact. Host FVM is absent; these are real GitHub FVM runs, not claimed local Flutter execution. Arithmetic fixtures are synthetic tests, not measured meals. Existing ordered-worker exhaustion receipts continue to authorize native edits for this same feature.

## Review and engineering decisions

Independent read-only source review found one Important, no Critical: after CAS commits, a reload failure left stale writer controls able to overwrite the correction. Fixed by closing the editor after known-committed refresh error. A second read failure on returning History now catches the error and blocks record entry until a fresh successful app load. These were reproduced in separate CI RED runs before their respective retained fixes.

Ruling: additive format preserves reading old v1 records, without guaranteeing older APKs preserve new fields. Cost if wrong: downgrade could discard correction history; no downgrade is proposed.

Ruling: known-committed reload failure closes the stale editor with an accurate saved/reopen message; a precommit write error leaves it usable with a check-saved-values message. Cost if wrong: a rare read failure requires reopening the meal.

Ruling: repeated read failure blocks cached History and existing capture/manual entry until a successful fresh app initialization. Cost if wrong: transient repeated read failure requires restarting the app. This prevents stale records from being reopened and written.

Deferred minor coverage: dedicated old-v1 reading, malformed override rejection, same-mass action after manual totals, deleted-record dialog conflict. Reviewed code has those guards; dedicated extra regressions were not added. No unresolved Important finding is knowingly deferred.

Antigravity MCP conversation calorix-tier1-portions-20261108, primary gemini-3.8-flash/server High, approvalMode yolo. Pre-review and corrected reload/history guard reviews explicitly agree/MUSTnone. Initial source review missed the stale-write hazard and later retracted its broad persistence approval. Illustrative follow-up snippet included a nonexistent camera argument and a kcal/g typo; neither was copied into source. Final source review explicitly agree/MUSTnone; result review after full CI/runtime pending. Reviews are inline source/evidence review, not exhaustive runtime visual inspection.

## Device evidence

Initial identity verified through phone-adb: Samsung SM-G780G, Android13, R58R61161NA. Initial installed checksum bc9a4543799d5fcb39e38220740b8832c8011970f92f09e6c0367c7cc0548d46/source15d1bb5. One task-owned fixture tier1-portion-20261108 imports an existing frozen public result, has no photo and explicitly diagnosticOnly/referenceIsWeighedfalse. Original local record count0 was captured; unrelated records must be preserved.

Before test authoring, ARTEMIS Pro trace5c336929-0255-48c4-bb57-13acc41a6e33 observed History/editor, served419.15/confirmedconsumed210, source-labelled foods and missing portion controls. It then hit HTTP429 Gemini3.6 dailyfreequota20/retry37906s. Required mobile_diagnose(attempt_fix=true,verify_credentials=true) returned degraded with5/5required checks passing; optional scrcpy absent. Task stopped; no final-success/Camera-return claim. Existing record remained unchanged. Future-feature validation is pending on the newly verified APK; use serial-safe native observation if ARTEMIS quota remains exhausted.

Task-owned disk-backed scratch calorix-tier1-portions-20261108 retains raw CI/review/device receipts; no APKs/photos/raw local records are committed. Public30-scan benchmark and all frozen predictions remain unchanged. New accuracy/user-effort measurements: none.
