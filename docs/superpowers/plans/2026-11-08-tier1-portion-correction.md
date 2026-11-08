# Per-food portion correction

> Execute continuously with superpowers:executing-plans. User explicitly requests continuing between routine stages; stop only for a blocker or major decision. This is the approved Tier1 manual-correction roadmap. Existing ordered-worker exhaustion/native-edit exception and review/verification/commit/push rules remain in force.

**Goal:** Let users correct one food's served grams and recalculate approximate totals locally, preserving original predictions and an audit trail.
**Architecture:** Extend existing Tier1Meal with optional portionOverrides and adjustmentHistory. Reuse original component nutrient amounts/densities and existing private atomic store/revision CAS. Small editor dialog using existing theme, framework-owned form field and DialogRoute completion. No inference/model/catalog/backend or automatic-question change.
**Spec:** V7.1 editable estimates, one optional preparation question, retained original predictions, served/consumed distinction and local deletion/privacy. Source baseline adf7d0c.

## Invariants and review focus

- Recompute from original analysis.components plus latest overrides, never compound previous corrections. Original inventory/nutrient source/provenance remains unchanged. Zero grams explicitly excludes a component; restoring original removes its override. Same-gram action is exact no-op including consumption/history.
- Validate original masses finite/positive<=100000, input grams finite0..100000, valid indices, baseline kcal and known-macro component sums coherent. Preserve unknown macros. Scaled totals must satisfy existing finite/nonnegative domain bounds. Bad/incomplete analysis keeps total-entry fallback.
- Real portion changes reset confirmed consumption. Rename retains portions/intake. Manual nutrient-total changes archive/clear active overrides. Rerun archives old estimate/totals/overrides and clears active overrides. History snapshots exclude prior history recursively and remain inside the meal record covered by existing delete/backup controls.
- Existing unanswered preparation answer preserves component indexes/overrides when oil is appended, applies once, retains user meal name; prevent it from replacing manual nutrient totals. No additional automatic question.
- Optional additive v1 JSON fields default empty and serialize only when needed. Existing records remain readable; old APK downgrade preservation of new fields is not promised. Never invent event timestamps; app passes existing injected Clock, absent legacy programmatic timestamps remain null.
- Portion apply uses replaceIfRevision at the opening revision; stale/deleted meal closes back to refreshed History with explanation, no retry against changed indices. IO/reload errors tell user to reopen/check saved values, rather than falsely promising nothing committed.
- Dialog shows current grams, original/restore and Cancel/Apply. Disable while busy/dirty; disclose replacement of manual totals. Await route.completed before persistence; use framework-owned TextFormField. Unchanged formatted grams resolve to exact original double.

## Bounded tasks

- [x] Inspect existing editor with ARTEMIS before new test authoring; preserve all unrelated records. Pinned Samsung13/R58R61161NA only. One explicitly diagnostic public-result fixture, not a weighed Android reference; no cloud request.
- [x] Domain and widget tests first, committed/pushed actual Flutter RED via canonical test-APK workflow (host FVM absent). Cover repeated/multiple/zero/restore/noop, unknown macros, invalid inputs/coherence, manual-total and rename interactions, rerun/archive, preparation answer, roundtrip and corrected repeat; dialog lifecycle/cancel/validation/dirty/revision conflict/store failure/no extra model calls.
- [ ] Implement local model/UI with focused GREEN plus full canonical CI, analyzer and APK. No change to frozen benchmark predictions, owner reference counts or production function.
- [ ] Independent source review + mandatory MCP post-review, source/checksum/signer/compiled privacy gates, actual Samsung edit/save/restore/cancel/persistence/delete verification. Retain actual failures and distinguish automated fixtures from accuracy/user-effort evidence.
- [ ] Commit/push bounded stages and tracking; continue useful in-scope work until a genuine blocker or major automatic-inference decision. No repetitive installation instructions or routine permission handoffs.

Pre-MCP calorix-tier1-portions-20261108 primary3.8 exactagree/MUSTnone, including correction clarifying additive-format/downgrade limits, CAS and save/reload failure semantics. Do not adopt initial review's overbroad rollback-safety/persistence guarantees. Native source edit exception is carried from this same Tier1 feature's exact recorded route failures, not inferred permanent model unavailability.

Device initial exploration uses verified installed APK SHA bc9a4543799d5fcb39e38220740b8832c8011970f92f09e6c0367c7cc0548d46/source15d1bb5. Exact Flutter/Android source equivalence to current baseline confirmed. Owned fixture tier1-portion-20261108 imports an existing public A1 result (apple/almond/cauliflower); diagnosticOnly/referenceIsWeighedfalse. Baseline local record IDs captured separately; do not delete unrelated data. ARTEMIS trace5c336929-0255-48c4-bb57-13acc41a6e33 is exploration, not future-feature validation.

2026-11-08: Exploration observed existing editor before new tests. ARTEMIS subsequently hit HTTP429 dailyfreequota20/retry37906s; diagnosis required checks5/5pass, optional scrcpy absent. Trace stopped; old-app observations only, no future-feature claim. Owned fixture unchanged, original records0. Authored11domain/8widgettests; next actual CI RED before production edits.

RED: cf0b2e2 / CI42526097592 Flutter job128869938131 actual967PASS/1historicalskip/19FAIL:11missing domain behavior +8missing portion controls. No compile/harness failures. Cancelled unrelated Functions job after observed RED. Implemented domain/UI pending canonical full GREEN/analyzer/APK.
