# Immediate capture consent implementation plan

> Execute inline with superpowers:executing-plans. User requires continuous implementation without routine checkpoint approval. Preserve mandatory test-first, independent and Antigravity reviews, signed build and native verification.

**Goal:** Remove the separate Estimate photo tap for a newly captured photo while retaining explicit per-photo Send photo consent.
**Architecture:** Add one explicit fresh-capture flag to the existing private editor route. One guarded post-frame callback offers the existing consent dialog; reuse all current estimation, persistence, failure and correction code. No automatic offer from history, restart, repeat, resumed background work or manual entry.
**Tech stack:** Existing pinned Flutter3.41.9, CameraX, Tier1 store/cloud interfaces and widget tests; no new dependencies.
**Spec:** docs/superpowers/specs/2026-11-08-v71-binding-addendum.md A/C/H; original execution directive A/B/C. Basef6a97ca, existing clean isolatedfeat/tier1-photo-pilot worktree.

## Fixed contracts and review focus

- `_open(Tier1Meal,{int? captureTick,bool startEstimate=false})`; only successful `_capture` passestrue, after JPEG retention and parent save. `_MealEditor.startEstimate` defaultsfalse.
- `initState` registers at most one post-frame callback whenstartEstimate. A consumed one-shot flag is set before any async operation. Requiremounted, foreground/resumed lifecycle (null allowed by existing test convention), current route, notbusy/notdirty. Otherwise skip permanently; manual Estimate photo stays available. No resume/background retry queue.
- `_estimate()` mirrors the existing button's dirty/busy guard and requiresmounted/photo before opening the existing consent dialog. Reuse consent text and all storage/provenance/CAS/failure handling. Decline/barrier/back leaves the retained local photo and manual entry; no cloud consent write, initialization, analysis or automatic retry.
- Success remains approximate served calories, editable and saved; consumption unknown. Two actions on the permission-granted fresh capture path: Take photo and Send photo, not silent one-tap upload or measured latency performance.
- Provider/model/prompt/schema/catalog/backend/permissions/privacy settings and frozen experiments unchanged. No real model calls for implementation verification. Same-Tier1 native-edit exception continues from exact recorded November7 route failures; this is not a permanent worker/account-exhaustion claim.
- Review focus: parent save/decode failure; callback after navigation/background; dirty forms; rebuilt/reopened routes; consent cancellation followed by explicit retry; exact mock-result saving with original photo; no initializer/analysis before Send.

## Task1 — Tests and minimal route change

Files: newtest/tier1/fast_capture_test.dart; lib/features/tier1/tier1_app.dart.
- [ ] Write a valid JPEG camera fixture and memory store, with positive capture/editor control before testing consent. Use pinned cross_file0.3.5+2 `XFile.fromData`; exact archive SHA matcheslock. Async decoding uses `tester.runAsync` with interleaved fake-frame pumps/real-I/O yields and an explicit parent-save completion condition, not a readiness delay guess. Assert source/model-call-free controls.
- [ ] Actual canonical Flutter RED before source edits: fresh capture automatically offers consent, explicit approval saves mock estimate, decline/back leave local fallback and no retry; history/reopen/background/navigation remain controls. Repair harness failures before crediting behavioralRED.
- [ ] Minimal fresh-route flag, guarded one-shot callback and synchronous dirty guard; no other route/default changes. Run focused/full canonical tests and Tier1 analyzer; commit/push bounded source.

## Task2 — Review, artifact and real device

- [ ] One fresh read-only whole-feature review, fix Critical/Important findings in one RED→GREEN pass. Mandatory Antigravity source/privacy review and corrected literal agreement; no inferred approval from noisy statements.
- [ ] Canonical android-test-apk.yml exact committed source must pass full Functions/Flutter/Python/Node/build/lint/analyzer/signing. Verify downloadedsource/checksum/trusted signer and compiled privacy before updating the authorized Samsung, preserve all unrelated records/files.
- [ ] Native fresh capture auto-offers consent; decline/dismiss leaves local photo/edit route, history reopen does not auto-offer; explicit retry dialog available, no Send photo/model call. Delete only owned captures/journals, restore baseline and return Camera. Record sampled visual scope, actual failures and limitations; no new accuracy or human-effort measurement claim.
- [ ] Corrected final MCP result review, status/guide/pilot tracking, commit/push/clean check. Continue the next original-spec implementation gap without ending the turn at this checkpoint.

Pre-review: Antigravitygemini-3.8-flash/yolo conversationcalorix-tier1-fast-capture-20261110 explicitagree/MUSTnone, guard feedback adopted. Actual route is Tier1Home, not the review's shorthand ScanScreen; actual method is `_estimate()` without a context argument. No general readiness or zero-global-network guarantee is adopted.

Native grounding before test authoring: exactinstalledb089/d911 source capture/consent/Keep local/manual/edit/history/clipboard/deletion observed with ARTEMIS and pinned groundedADB, reportdocs/tier1-native-workflow-verification-2026-11-10.md. Only the new offer timing is unimplemented; existing dialog/actions are verified.
