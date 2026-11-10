# Native workflow verification — 2026-11-10

The pending native workflow checks passed on the physical Samsung. The earlier authentication blocker was incorrect: ordinary wake, nonsecure keyguard dismissal and app launch were sufficient. No credentials or security configuration were changed.

## Source and execution

- Device: Samsung SM-G780G, Android13, serial`R58R61161NA`, using only `/home/agent-runner/.local/bin/phone-adb` for host device commands.
- Installed source:`b08919221eb3b085fabbe8bd21fb9e61cb258c04`. APK SHA256:`d911b12e8e6af325738e39892656f66ea748e34b3a97d41a0fd9fe278e768dd9`, rechecked before and after testing. [Signed APK artifact](https://github.com/ia23a-lachnita/calorix/actions/runs/42653648480/artifacts/13691887699).
- Application, backend, dependency and Android source were unchanged. [Canonical CI42653648480](https://github.com/ia23a-lachnita/calorix/actions/runs/42653648480) remains the exact-source build evidence:5354 backend/1016 Flutter/54 Python/17 Node tests passed, with2 historical skips; build/lint/Tier1 analysis/signing passed. Fresh Python rerun:54 passed.
- Run label:`calorix-native-workflow-20261110`; direct, dynamically grounded ADB execution, not an autonomous ARTEMIS task or invented trace ID. Task-owned scripts, screenshots and receipts are retained locally under the matching task directory in `.local/share`.
- Initial ARTEMIS helper diagnosis disagreed with visible Calorix and Android`secure=false/showing=false`. Direct UIAutomator returned15 nodes. Final ARTEMIS diagnosis passed5/5 required checks, `is_locked=false`, successful7-element hierarchy probe; direct state observation also returned Camera controls. Only optional scrcpy recording is missing. The mismatch's underlying cause is unproven.

## Actual checks

The owned offline fixture reused an existing public prediction and a synthetic preparation question. Its gram values and answer were scripted diagnostics, not blind human corrections or weighed meal measurements.

| Check | Observed result |
|---|---|
| Unsaved manual entry/back | No meal or journal created. |
| Portion Cancel and unchanged Apply | Complete fixture unchanged: revision1, confirmed fraction0.5; cancelled/unchanged events, no successful correction. |
| Almonds55→86g | Revision2;419.15→598.64 approximate served kcal, independently recalculated from the retained component estimates. Original analysis preserved; consumption reset to unknown. Journal retained before/after grams/kcal, original-analysis eligibility and prior-adjustment count0. |
| Use original | Revision3; original419.15 total restored exactly, empty/omitted portion overrides; intake remains unconfirmed. |
| Stale edit | Only the owned fixture's revision was advanced3→4 while its dialog was open. Applying86g produced `portion_conflict`, preserved nutrition and did not add a successful correction. History displayed “Meal changed; reopen it to edit.” |
| Invalid100001g | Full finite-range error visible and keyboard dismissed; no portion commit. Cancel retained the saved meal. |
| Optional preparation answer | Scripted10g oil answer persisted at revision5, adding88.4kcal to507.55; answered state saved locally. No inference request. |
| Export Cancel | Deliberately primed own clipboard sentinel survived Cancel, verified by pasting into an unsaved Calorix field. Prior user clipboard was not read. |
| Explicit Copy JSON | Actual clipboard payload pasted into an unsaved Calorix field:6805 UTF-8 bytes, one owned meal, strict evaluator schema valid, zero process metric-write failures, no dropped events, no food names/photos/paths/raw inventory. |
| Clipboard cleanup | Owned export replaced with a neutral test-complete marker; replacement verified by paste. Unsaved fields discarded. |
| Fixture deletion | UI deletion removed the owned meal, journal, pending/backup files. Original meal bytes restored; no recreation observed during the bounded post-close check. General queued-late-append coverage remains the existing unit test, not an exhaustive native concurrency claim. |
| CameraX capture | New local720×1280 JPEG,22082 bytes, valid JPEG magic and matching metadata. Camera ID0/back lens/sensor90/portrait/focus-auto/exposure-auto recorded; unavailable intrinsics/focal length/zoom remained null. No GPS request. |
| Cloud decline and photo deletion | Capture preceded the consent dialog. Estimate photo→Keep local declined subsequent analysis; Send photo was never selected. The owned capture and its journal were deleted. |

An initial camera-unavailable warning was observed despite granted permission. Capture subsequently worked, and the final Camera screen had no warning. No camera source change or root-cause/reliability claim follows from this observation.

Final cleanup independently verified: only the original `app_flutter/tier1/meals.json` remains, byte-exact baseline`[]`;0 saved meals; owned JPEG absent; journals/pending/backup absent. The host separately removed its owned device XML. Calorix was returned to Camera. No uninstalls, data wipes, auth changes, new model calls or production changes occurred.

## Verification limits and reviewed decision

The exported native diagnostic parses in `evaluate_workflows.py`. With separate empty references it reports0 scored pairs, an explicit unmatched reference, and null accuracy/actual-attention/cost. It is not added to the weighed pilot. All new timing is automation-contaminated foreground proxy data, not human active effort or validated latency-target performance. Existing40 public scan IDs/100 food prediction receipts and0/30 Android weighed references are unchanged.

Visual checks were sampled and self-inspected: wake, manual cancel, corrected portion, conflict, invalid input, export disclosure and final Camera screenshots. No UI-diff run was performed; final diff counts by status/source, `auditLimited` and `visualClassificationStatus` are not applicable. No exhaustive visual/design-parity claim or new end-to-end cloud inference test is made.

Execution harness corrections were recorded rather than classified as application defects: the merged History row needed a contains locator; the first post-Apply store read preceded asynchronous route removal/persistence and was replaced with an explicit persisted-event wait; empty portion overrides may be omitted; remote existence checks require shell-v2 status because this host's `exec-out` did not propagate the remote exit status. Cleanup assertions subsequently passed.

Antigravity MCP pre-debug/result review: `gemini-3.8-flash`, yolo, conversation`calorix-native-workflow-20261110`, final explicit`AGREEMENT_STATUS: agree`/`MUST_FIX: none`; no fallback. Invented SQLite/package/causal assertions and conflations between source changes, owned data mutations, UI deletion, XML removal and capture/consent were retracted and not adopted. Review covered reported evidence and boundaries, not an external exhaustive screenshot audit or general security approval.

The native UI/journal/clipboard blocker is resolved. The next single experiment remains an actual reference-blind optional portion correction against separate weighed references, with foreground time explicitly labeled as a proxy. Broader accuracy and pilot qualification remain unfinished.

Implementation rulings retained from the completed plan:

- Sidecar journals share the existing serializer to preserve meal revision/CAS/cancel semantics; the tradeoff is bounded additional local I/O.
- Foreground-minus-wait is explicitly a proxy including reading and idle; actual attention remains unmeasured.
- Explicit capped clipboard export avoids a new native plugin; the tradeoffs are manual export and copies outside app deletion controls.
- Ordinary wake/nonsecure dismissal plus observed app/tree state permits UI tests despite the initial helper mismatch; unexpected UI still stops grounded actions, and credentials/configuration remain unchanged.

No deferred independent-review minor remains: the dialog-duration finding was fixed before the signed build. The unproven initial camera warning remains a recorded observation, not a resolved causal diagnosis.
