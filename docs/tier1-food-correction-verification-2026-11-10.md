# Food correction implementation and verification — November 10

Calorix now supports optional per-component food selection from the existing frozen73-record USDA catalog. It retains the current estimated grams, calculates nutrients from the selected per-100g record, preserves original recognition and supports predicted-food restoration. Portion edits, preparation oil, manual totals, repeat logging and consumption confirmation continue to work with these selections. No new dependency, inference model, prompt, automatic catalog promotion or backend deployment was introduced. Existing CameraX, Firebase callable, store, theme and public nutrient provenance were reused.

[Run guide and latest APK](tier1-food-correction-guide-2026-11-10.md). This follows [immediate capture consent](tier1-fast-capture-verification-2026-11-10.md): uninterrupted fresh capture offers explicit Send photo consent without the separate Estimate tap. History/manual/interrupted routes retain manual control.

## Exact source and verification

Application source `c04798ccc3d0beec3369f8c2e6220b32f5dc23ce`, branch `feat/tier1-photo-pilot`, committed and pushed. [Canonical CI42798006153](https://github.com/ia23a-lachnita/calorix/actions/runs/42798006153) fully passed:

- Flutter job129768034205:1054 passing,1 historical skip; Tier1 analyzer no issues.28 new food cases, including current-food labeling, save failure feedback and latest/legacy index bounds.
- Functions job129768034410:5354 passing,1 historical skip;61 Python tests;17 Node guards; TypeScript build and lint.
- APK build/signing job129774403982 passed. [Artifact13756120978](https://github.com/ia23a-lachnita/calorix/actions/runs/42798006153/artifacts/13756120978), expires2026-12-10T10:36:54Z, filename `calorix-1.0.0+1-android-test.apk`.
- APK SHA256 `b30eae9dd587860628ffb7f6f7096e167de7acc14406a55bbf17972c87684fcc`; trusted signer `38815fd37711f170e534cf3c8767de7f0f7ca5f958e755d8a47b03fe2b764b7c`. Host independently verified source metadata/checksum/V2 certificate identity; CI performed cryptographic apksigner verification.
- Compiled manifest checks passed: FirebaseInitProvider absent, allowBackup/fullBackupContent false, messaging auto-init/analytics collection false, and bound extraction rules exclude root/file/database/sharedpref/external from cloud backup and device transfer. These are narrow configuration checks, not general security or production-readiness approval.

Test-first evidence: initial source0e5dbb6/run42793685869/job129753264624 yielded1027 PASS/1 skip/26 missing-behavior failures; existing1026 controls and the new corruption-preservation control passed. Python56 PASS/4 expected missing-generator/version errors became60 PASS. Source9010aa2 yielded1052 PASS/1 skip/1 failure: failed-save feedback was offscreen. Fresh review additionally found the portion dialog still named the prior prediction; host found index20 oil traces rejected by the old bound. New regressions at8ff9887/run42796594957/job129763248676 yielded1051 PASS/1 skip/3 expected failures before the combined fix. Python boundary60 PASS/1 failure became61 PASS. Source014cc3e passed all28 new cases but one older default-validator test still expected20 to be invalid; its invalid boundary was migrated to21 while retaining new version2-positive20/version1-negative20 cases. Final c04798c full run is green. Superseded42797274753 was cancelled while its remaining backend job was active; it is not a full pass.

## Data and measurement contracts

Only `functions/eval/tier1-public/catalog-v2.json` is reused: raw JSON SHA256 `bad3d924253513d093728351436cdcc6e099caba25eead2cae24778ea35ff178`, version `usda-sr-2018-tier1-20261108-v2`. Generator and tests enforce source bytes/count/records; `python3 tool/generate_manual_food_catalog.py --check` passed. Runtime parses immutable local data once and compares declared version/hash constants; it does not dynamically hash the dataset or check its count cryptographically. Source URLs/archive/row hashes remain in the generated data. Selected food identity and portion remain approximate.

Active food overrides use local meal schema2; legacy records and restored meals use1. Unknown version/record/index is rejected with raw corrupt storage preserved. Food selections do not mutate original analysis. Selected nutrients use record-per100 × current grams/100; unselected nutrients scale from the original component. Remaining unknown macros stay unknown. Additional oil remains a separate editable/excludable component, with a nonblocking reminder and no second automatic question. A different food replaces manual aggregate totals only after the dialog explains this. No-op/cancel retains the record and intake; changed nutrition leaves intake unconfirmed.

Private journals and exports write2 and strictly read1/2. New food events contain operational indices/calories/timing only, no search queries, food names or record IDs. Latest index0..20 covers20 foods plus appended oil; legacy1 retains0..19. The existing first-portion endpoint excludes active food overrides even if their kcal equals the original total. Food actions count activity; no food-assisted accuracy endpoint or measured improvement was invented. Export remains explicit/local; copied content is outside app deletion controls.

## Samsung native evidence

Run label `calorix-tier1-food-correction-20261110`, direct grounded ADB through the serial-pinned wrapper; no autonomous ARTEMIS task trace is claimed. Device identitySM-G780G/Android13/R58R61161NA verified. Installed APK hash matched; every pre-existing Tier1 file hash remained identical after install.

The owned offline fixture reused an existing public prediction and a synthetic oil question. It is neither a newly predicted real meal nor a weighed reference. Native outcomes:

| Action | Persisted outcome |
|---|---|
| Cancel food picker | Full record/revision1/confirmed fraction0.5 unchanged |
| Nonmatching search | Explicit No matching records; no invented selection |
| Select cooked rice, retain55g |172.2kcal/revision2/schema2/intake unknown; original analysis unchanged |
| Edit current rice portion to86g |212.5kcal/revision3; current-food title and Original prediction visible; portion-only metric flag false |
| Restore predicted food, keep86g |598.64kcal/revision4 |
| Restore original55g | Exact original419.15000000000003 and macros/analysis/revision5/schema1 |
| Answer separate10g oil |507.55kcal/revision6 |
| Select rice with oil answer retained |260.6kcal/revision7; separate10g component and answered preparation analysis retained exactly; reminder visible |
| Inject owned revision7→8 while dialog open, then apply stale restore | Rejected; newer rice260.6 retained; visible conflict SnackBar; food_conflict1 and successful food_saved still3 |
| Explicit Copy JSON, paste inside unsaved app field |6055 UTF8 bytes, strict schema2/one owned meal, sourcefood_correction,0 write failures/0 drops; no food names, record IDs, photos, paths or raw inventory |

Independent Decimal arithmetic was prepared before the native edits; numeric comparisons use tolerance1e-9. These are arithmetic/workflow checks, not calorie-accuracy measurements. The actual pasted export evaluated with empty separate references yields0 scored pairs/null served MAE/actual-active-user time/cost. Script-driven foreground time is not validated human effort. Own clipboard JSON was replaced with a neutral marker and paste-confirmed; previous clipboard contents were not read. Unsaved paste created no meal and left parent bytes unchanged.

The first host component locator failed because the selected row's native hierarchy exposes its USDA URL rather than the expected food-name anchor. Its bounded failure/nondialog snapshot were retained. A grounded unique URL/row-button locator then succeeded; no app code changed. This is not an accessibility audit. Six targeted screenshots were inspected by the main assistant: picker, selection, current-food portion, oil reminder, conflict and export. No exhaustive visual parity or independent MCP image inspection is claimed. No UI-diff run: final status/source diff counts, auditLimited and visualClassificationStatus are not applicable.

Only the owned fixture was UI-deleted. Final Tier1 root equals baseline: sole originalmeals.json, exact `[]` bytes/all baseline hashes identical,0 meals, no owned journal/pending/backup. Owned device XML was removed; Camera restored and final ARTEMIS hierarchy observed. Native did not exhaustively test background/resume/process recreation or late-callback timing; source/widget cases and the bounded cleanup observations have their stated limits. Write-failure feedback and index20 boundaries were verified in tests, not injected separately on the phone. Zero new food inference API calls; no global network-traffic measurement or zero-I/O claim.

## Review, rulings and remaining evidence

One fresh whole-feature source/test review saved a complete receipt with0 Critical/1 Important/0 optional Minor before the agent's final narrative failed with a usage-limit error. The saved receipt was recovered/read; the final agent turn is not called successful. The Important label issue and two host-found issues were fixed in one RED→GREEN pass. No additional native reviewer was spawned.

Required Antigravity MCP used gemini-3.8-flash/yolo, conversation `calorix-tier1-food-correction-20261110`, no fallback. Corrected plan, source, combined-fix and result reviews explicitly report agree/MUST_FIX none. Earlier invented source/hash/zero-overhead/food-class/silent-fallback/preparation-multiplier/global-network/all-lifecycle/general-security extrapolations were retracted or not adopted. MCP reviewed supplied source/facts, not native pixels; no process-death test coverage is inferred from broad wording.

Ruling: active food edits use meal version2 so older clients reject and preserve data rather than silently strip overrides. Cost: older builds cannot read active corrections until a compatible client restores them. The same bounded Tier1 native-edit exception follows the exact recorded worker failures/runtime bounds; no permanent account/model-unavailability claim is made. The preceding capture stage retains its occasional manual-retry tradeoff after interrupted/permission-inactive captures. Its optional exact-path/full-mock-payload assertion strengthening remains deferred; no product defect was identified.

No software-stage blocker remains. Accuracy qualification is unfinished: existing40 public scans/100 food prediction receipts are unchanged; weighed Android meals0/30 remain deferred and actual reference-blind human correction pairs0. No measured correction benefit, active user time, Android served/consumed accuracy or inference expense was fabricated.

Highest-value next experiment: actual reference-blind optional corrections on existing reference-backed public meals, comparing before/after served error and explicitly labeled foreground proxy; keep food-assisted and portion-only outcomes separate. Do not substitute reference masses or simulated human timings. No new model budget or dataset is a prerequisite.
