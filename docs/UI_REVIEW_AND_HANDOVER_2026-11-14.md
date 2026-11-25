# Calorix: orientation, UI review, handover (2026-11-14, external review session)

Rules for any UI work: `/home/agent-runner/projects/_ui-review/RUBRIC.md`. Habits:
`/home/agent-runner/projects/_ui-review/REASONING_HABITS.md`. Both apply on top of AGENTS.md. They do not replace its gates.

## Status — owner Android fixes (completed 2026-11-18)

Active checkout `/home/agent-runner/projects/calorix`, `main`; all fixes committed and pushed in order.

1. Camera grant: `b0b3fc0`. Reproduced after Samsung `pm clear`: permission granted but Camera unavailable. Serialized controller capture/lifecycle operations; RED4/GREEN13. CI44159267355 source/checksum/signer matched; fresh clear → grant → saved-photo editor, screenshot opened.
2. Single content shutter and safe nav: `7203dde`. Scan nav only selects; content ring clears nav and active dot. RED6/GREEN6, 22 existing tests pass; light/dark360/402 renders and Samsung CI44163076469 screenshot inspected; repeated nav taps do not capture.
3. Swipe/header motion: `f3b886c`. Finger-following native pager, moving headers, spring380/38, reduced-motion snapping; fullTier1 120pass. Both directions/held swipe inspected on Samsung CI44166551378. No current horizontal in-tab conflicts; vertical lists retain scrolling and editors stay outside pager. No FPS/parity benchmark claimed.
4. Release APK: `2e4fc6b` plus strict ABI correction `0909bb8`. Final [Test Android APK44251000772](https://github.com/ia23a-lachnita/calorix/actions/runs/44251000772) succeeded: 23,269,141 bytes (23.3 MB), arm64-v8a only, AOT, no JIT kernel/Vulkan validation layer; source/checksum/existing test signer matched. Installed on Samsung SM-G780G/Android13, non-debuggable; revoke → grant → saved-photo editor, nav reselect and bidirectional/held swipes checked; all selected screenshots opened. Prior unsplit APK rejected for extra plugin ABIs.

Local final proof: `fvm flutter test --no-pub --concurrency=4 --reporter compact` exit0,1077pass/1intentional OFF-live skip; `fvm flutter analyze lib/features/tier1 test/tier1` no issues; Python unittest discover265run/4optional ONNX/Torch skips; APK contract76pass. Whole-project analyzer remains29baseline diagnostics (3missing ignored Firebase options errors,26existing infos). Source reviews: independent no Critical/Important; Antigravity primary3.8 agree/MUST_FIX none.

Visual scope: selected Scan/editor/Today/History/held frames, plus prior both-theme/two-size renders; not exhaustive visual parity. No photo sent for cloud analysis; no Firebase/cloud changes or deployments. Evidence retained under `~/.local/share/calorix-owner-fixes-20261117/`.

Scan follow-up, checked 2026-11-19. `b94401e` moved today's calories beneath the header and replaced the white shutter centre with a hollow gradient ring. [Scan layout APK ZIP](https://github.com/ia23a-lachnita/calorix/actions/runs/44391991407/artifacts/14470000119) passed CI and was installed on Samsung without resetting app data. The before/after screenshots show the same 100 kcal test entry, and tapping the summary opened Today. The test entry was removed and both existing photo records remain. Source, checksum, signer and arm64 release contents matched. The owner's meal screenshot was reviewed, and the serving-intent warning remains.

Startup camera permission `f007f93` was installed and verified on the Samsung. Launch prompts for missing access. Granting prepares the preview, and the first shutter tap opens the saved-photo editor. Denying leaves manual entry available. When the shutter opens a retry prompt, granting takes the photo without a second tap. Both CI runs passed. [Current APK ZIP](https://github.com/ia23a-lachnita/calorix/actions/runs/44576423398/artifacts/14558487898)

Photo-estimate diagnostics (Nov 21): the callable now returns the same random support reference it writes to its structured failure log. Redaction, failures and successful estimates passed 9 callable tests; 22 tests passed against the isolated deployment source. Server change f85a727 deployed only analyzeTier1Meal. The app now distinguishes an unrecognized serving, invalid photo and service failure, and shows the support reference when one is available. All 29 focused client tests passed and scoped analysis found no issues.

Scan now opens the system gallery with camera permission denied, copies JPEG/PNG photos into the private meal store, and recovers an interrupted Android selection. Seventeen gallery and camera tests passed; scoped analyzer clean. Selecting a photo keeps analysis opt-in.

The deployed diagnostic revision analyzetier1meal-00002-niw returned a support reference for a no-photo request. Cloud Logging matched the reference and the auth rejection. Client 15e2adb passed Verify and Test Android APK.

Portion corrections now accept pieces, millilitres and a share of a batch. One third of four large hard-boiled eggs uses a food-specific reference and changes only the eggs. User-entered weights and shares survive export and reopening. Whole-meal shares are separate. The original photo estimate remains available for comparison. Eighteen focused tests and the eleven offline comparator tests passed.

Samsung check for gallery commit `c65e3b2` used the source- and signer-verified [Test Android APK 45015094447](https://github.com/ia23a-lachnita/calorix/actions/runs/45015094447). Android’s file picker imported a test PNG into the meal editor. The full-screen viewer showed the whole image, and analysis required a separate tap. Inspected the Scan, editor and full-screen screenshots, verified the external PNG checksum and removed the temporary test meal and files.

The first quantities build stopped at a photo-viewer regression test. Reproduced the missed tap under the toolbar and targeted the visible expand icon. The test still checks that closing the viewer preserves the unsaved meal name and causes no save.

Quantities and the viewer regression passed [Verify](https://github.com/ia23a-lachnita/calorix/actions/runs/45042298898) and [Test Android APK](https://github.com/ia23a-lachnita/calorix/actions/runs/45042299043) at `bc98375`. Checked source, checksum, signer and arm64 release contents, then installed on the Samsung. Entering 1/3 for a temporary 300 kcal meal displayed 100 kcal counted. Inspected the editor screenshot and removed the test entry.

The local shell now opens on Scan in the middle of five swipeable tabs. The gallery, hollow shutter and recent meals sit around the viewfinder. The camera preview uses the shared cover layout. Thirty focused navigation checks passed, along with the safe-inset checks and scoped analysis. Inspected 360 and 402 px renders in both themes. Dashboard, editor and account screens have separate implementation and verification work.

Five-tab source `90c8a10` exposed a duplicate screen-reader label on Scan. The corrected navigation item has one “Scan” label and one accessibility action. All four shared navigation tests passed, including the original accessibility check. Python ran 282 tests with 11 optional skips, and all 109 Node checks passed.

Samsung verification used `ed1e762` from [Test Android APK 45070589702](https://github.com/ia23a-lachnita/calorix/actions/runs/45070589702). Source, checksum, existing test signer and arm64 AOT contents matched. Tapping Scan stayed in the viewfinder, and swiping to Goals and back worked. Screenshots showed a second prominent ring around the navigation icon. The active Ravlo shell now uses a regular Scan tab icon and reserves the hollow ring for capture. Thirty navigation, accessibility and layout tests passed. Device verification of this follow-up uses the next release APK.

Installed `ff1a248` from the [verified Samsung APK](https://github.com/ia23a-lachnita/calorix/actions/runs/45126898592/artifacts/14797051151). The screenshot shows one hollow shutter above five equal navigation items. Android reported each tab label once and the active dot was visible.

Manual entry now searches the offline food catalog and labels its editable values per 100 g. The meal editor shows stored calories and individual macros, the real pending analysis state and outstanding preparation questions. The editor, workflow and numeric tests exposed a focus bug that assigned entered calories to protein. Keeping the search field in place fixed the original offline save test, including no cloud initialization. Photo detail and edit layout refinements follow.

Today, History and Goals now share the local meal and target data. History supports week/month views, older meals, and a trend with gaps for missing observations. Goals shows consumed portions for the selected period and opens the saved targets editor. Tested stale-history recovery, clock rollover, large text, navigation and a calendar with no meals. The combined run exposed stale meal rows remaining enabled after a read failure; the fix passed the original recovery test.

The dashboard, calendar and goal periods shipped in `c76ace9`. The Profile header now opens local account information, persisted appearance, Goals and signed-out welcome. The companion tab opens Scan or correction history using actual saved adjustments. Camera-denial help preserves the original permission and capture flow. Reviewed 14 light/dark renders, including empty and fixture-populated history. Natural-language corrections and account sign-in remain future work.

Profile and local appearance shipped in `2d87bb0`. Photo details now show the whole image above the nutrition sheet, with full-screen zoom available. Manual meals retain offline search and editable nutrients. The save and full-photo tests reproduced missed taps after scrolling and now reach both controls, including with an unsaved meal name. On the Samsung, the signed `1305261` APK returned “Bananas, raw” for an offline search and filled 89 kcal with an explicit 100 g basis. The form was closed without saving the test entry.

Photo layout `99f2220` passed all 18 integrated photo, manual entry and history tests. Scan now reads the camera controller’s flash mode and lets the user cycle off, auto and on. Tests cover an unavailable flash and a rejected mode change. Physical flash verification is pending the signed build.

The signed build for `33ded66` stopped at the clock contract. Goals now requires the date supplied by the app clock for its daily, weekly and monthly views. All eight clock contract checks and twelve dashboard/app tests passed. Initial review calls timed out or rejected the configured effort; the final source review agreed with no required fixes.

Both workflows passed for `f9c0945`. Installed the [signed 23,858,965-byte arm64 APK](https://github.com/ia23a-lachnita/calorix/actions/runs/45342578802/artifacts/14897163096) over the existing Samsung app. Source, checksum and signer matched. Flash cycled Auto → On → Off → Auto. Opened Profile → Goals, Today and Scan; inspected all four screenshots.

Manual entry can now use a drink label per 100 mL. Entering 250 mL at 40 kcal per 100 mL previews 100 kcal. The user can dismiss the keyboard, check the preview and save. The local record retains the label and volume; editing the totals clears the old label basis. Missing macros stay unknown.

Drink label entry shipped in `45c4fc5`. An empty Today now offers a shortcut to Scan. Selecting it leaves the shutter under the user’s control. Earlier empty days retain their date-specific message. Ten dashboard and app tests passed, including 360 × 800 at double text size and unchanged camera and permission counters.

On the Samsung, the [signed drink-entry APK](https://github.com/ia23a-lachnita/calorix/actions/runs/45345522150/artifacts/14899345464) saved and reopened 250 mL at 40 kcal and 10 g carbs per 100 mL as 100 kcal and 25 g carbs. Only the test record was deleted. Local Flutter at `45c4fc5` passed 1,176 tests, with one skipped, and scoped analysis was clean. Both workflows also passed for the empty Today change `f165301`.

Saved photo details now lead with the date, meal name and nutrition. The whole photo opens full-screen. Macro bars show the portion eaten against current daily targets; pending analysis and errors are visible beside the photo action. Keyboard, consent, manual and drink-entry regressions passed in 31 focused tests; independent and external source review agreed.

The real local startup screen now uses the mockup’s artwork in light and dark. Its indicator runs only while the store is getting ready and respects reduced motion. Twelve support and route tests passed, both themes were rendered and inspected, and scoped analysis passed. The first editor CI run for `1164a60` failed at Flutter tests; device confirmation for that build is pending the regression fix.

The sole failure in the editor’s first Verify run was a test tapping the decorative expand icon after a scroll. It now taps the actual “View full photo” control. The unsaved edit, record revision and consent assertions remain, and all eleven photo tests passed locally. The loading artwork shipped in `42f8f41`.

Partial meals now distinguish the full serving from what was eaten. Half of a serving with 40 g of protein shows 40 g served and 20 g eaten, and the bar uses 20 g. Editing still starts from the full serving. Ten focused tests passed, including the changed-target and partial-serving cases.

The startup label wraps at 360 px and double text size. The test now holds the local store open during launch so it actually sees the loading artwork. Both failing CI scenarios and all thirteen route/support checks passed locally.

The [signed Samsung-tested APK for `c2436c6`](https://github.com/ia23a-lachnita/calorix/actions/runs/45559924821/artifacts/14998302202) passed both CI workflows. A local gallery photo opened uncropped and full-screen. After saving 300 kcal and logging one third, the detail and dashboard showed 100 kcal counted, and protein showed 30 g served and 10 g eaten. The worker removed the test record and fixture. No cloud analysis was invoked.

Manual entry now opens a searchable list of 73 local foods with separate custom-food and packaged-drink actions. Selecting a food opens its editable 100 g serving. Android Back returns to the picker, and Close exits. Focused and independent navigation, drink and offline save checks passed; both themes were inspected at 360 px.

The Samsung check found the privacy text touching the viewfinder corners when a daily total was present. Scan now reserves room for the summary and privacy text at ordinary and larger text sizes. Nine layout tests passed, and 360 and 402 px renders were captured in both themes. Manual food search shipped as `8c3dbd2`.

The pending analysis screen now uses the saved photo and shows indeterminate progress while Ravlo waits for the actual response. Its status remains readable at double text size and with reduced motion. Six focused workflow tests passed, including retry after failure and returning before the response. Light and dark captures were inspected with a held local test service. Closing and reopening the same record during a request still does not reattach the pending screen. Both workflows passed for Scan layout revision `253ab58`.

## Roadmap continuation — 2026-11-18

Source-weight follow-up checked all 251 published NutritionVerse dish records. Every food type repeats one recorded weight and nutrition combination. Portion correspondence remains unresolved. Android accuracy work continues with the first independently measured meal when available. [Source audit](tier1-multifood-audit-2026-11-18/report.md#follow-up-on-the-source-weights--2026-11-19)

V7.1 stored335-meal audit `7c869da` pushed; original multiplier remains rejected, selected source-weight concern unverified. [Audit](tier1-multifood-audit-2026-11-18/report.md).
Release meal copy `7ece316` pushed; [Test Android APK44281178207](https://github.com/ia23a-lachnita/calorix/actions/runs/44281178207) succeeded:23,334,677bytes, arm64only/AOT, source/checksum/existing signer matched. Samsung local picker cancel/retry/two saves checked; both ZIPs contain exact matching JPEG/hash and unchanged saved record; measurements dialog retained. Selected physical screenshots and six360/402lightdark renders opened. FullFlutter1091pass/1intentional skip; scoped analyzer clean; Python281run/4optional skips including7native cases. No cloud upload/change/deployment. Offline comparator `f0ebe8f` pushed; Verify44344990152 and TestAndroidAPK44344990144 succeeded. Frozen-source replay excludes later edits, preserves unknown A0 coverage;108Node/281Pythonrun(4optional skips)/DartCIcontract passed. Missing analysis records original attempt unknown; two stored public diagnostic wrappers reproduced all original prediction fields without new calls. No Android/calorie-accuracy claim; owner-weighed references remain0. These are persistent working notes, not a transfer to another agent.
Owner photo-view fix `6e06f88` pushed: whole preview, full-screen pinch viewer, Close/back. [Verified APK ZIP](https://github.com/ia23a-lachnita/calorix/actions/runs/44351574174/artifacts/14453910401)23,400,213bytes arm64release/AOT, source/hash/existing signer matched; Verify44351574144/TestAPK44351574174 succeeded. Samsung tap/Close/back/aspect screenshots inspected; post-view export exact original photo/meal unchanged. Pinch widget-tested, not hardwaretwofinger-tested. Local146pass/native0 +scopedanalyzerclean; all16finalrealfont renders opened; peer/MCPgreen. No cloud change/deploy.

## 1. Historical worktree locations (superseded 2026-11-17)

This checkout (`fix/scan-photo-flow-viewer`, `fe792e5`, 2026-10-19) is **not** where work happens. `git worktree list`:

| Worktree | Branch | Last commit |
|---|---|---|
| `~/.local/share/calorix-food-agreement-20261111/worktree` | `feat/structured-food-routing` | 2 days ago (newest) |
| `~/.local/share/calorix-lens-verification-worktree.7mbbsoe_` | `feat/calorie-lens-onnx` | 3 days ago |
| `~/.local/share/calorix-failure-diagnostics-worktree.hs0c9bmt` | `feat/tier1-photo-pilot` | 3 days ago |
| `~/.local/share/calorix-benchmark-authority-worktree.KG3o6P` | `feat/calibration-v2-runtime` | 11 days ago |

Read the newest worktree's `docs/implementation-status.md`, not this checkout's. When you create a worktree,
add it to this table.

**Ratio check:** since 2026-10-01, the newest worktree has 504 commits; 260 touch only .md/.json (212 start with
"Record"). The last week is healthier (111 of 137 touch code). Keep it that way (REASONING_HABITS rules 24–27).

## 2. Tier1 has now been looked at (2026-11-15) and it has no design yet

**How to see it (no phone, no emulator, 15 seconds).** Flutter 3.41.9 is installed on this Pi at
`~/.local/share/flutter-3.41.9` (there is no FVM here; put its `bin` on PATH instead of `fvm flutter`).
In the newest worktree:

```
export PATH=$HOME/.local/share/flutter-3.41.9/bin:$PATH
flutter test --update-goldens tool/ui/tier1_shots_test.dart   # writes tool/ui/shots/*.png (360x800, light+dark)
flutter test test/tier1                                        # 105 tests, about 2 minutes
dart format lib/features/tier1 test/tier1                      # pinned Dart 3.11.5; do not use another Dart
flutter analyze lib/features/tier1 test/tier1                  # CI gate: must print "No issues found!" (infos fail it)
python3 -m unittest discover -s tests -p 'test_*.py'           # CI gate: 259 tests, under a second
```
**Two CI gates the local Tier1 tests do not cover (both broke on 2026-11-15, fixed in `fb268a8`):**
`lib/features/tier1/manual_nutrient_catalog_data.dart` must stay byte-identical to
`tool/generate_manual_food_catalog.py` output, so after any `dart format` restore it with
`git checkout lib/features/tier1/manual_nutrient_catalog_data.dart`. And the analyzer step fails on info-level
lints, so an `if` whose statement sits on its own line needs braces (`dart fix --apply
--code=curly_braces_in_flow_control_structures` from the repo root). The `Test Android APK` workflow runs both
before it builds: `gh workflow run android-test-apk.yml --ref <branch>`.
Open the PNGs with your image reader, or send them to Gemini (`ask-ai`, `@/abs/path.png`). To add a state, add a
`testWidgets` block to `tool/ui/tier1_shots_test.dart`. The camera area renders empty there (fake camera); every
other pixel is the real widget tree with the real fonts. Shots from 2026-11-15 (worktree `bff13cb`, after the fixes) are in
`docs/live-app-screenshots/tier1-2026-11-15/`.

**Verdict:** a working pilot with default Material forms. None of the product's identity is on screen: no macro
colors, no daily total, no ring, and the app bar says "AppName".

**Status of the list below (update after every fix):** 2, 3, 4, 7 DONE in worktree `356aa55` + `80afa21` (Gemini review asked for delete to stay visible at every revision; applied. Export alone waits for the first save.) (plus the cause of 7:
the dark theme's seeded `onPrimary` was dark navy; both schemes now state it in `lib/core/theme/app_theme.dart`).
1 is DONE in `6ac0c58`: the owner named the app **Ravlo** on 2026-11-15 (display name only: constant, Android label, iOS bundle names; package ids and the repo name stay `calorix`). 5 and 8 DONE in `48d9424` (day headers with served totals, time and macro dots per row, a today line on home; test added). 6 (plain wording) is DONE in `7115ccf` (owner said yes on 2026-11-15): "Estimated calories", "Not marked as eaten", "Eaten · N kcal", "Estimated from the photo", "From the food database" (the record id is no longer shown), field label "Calories (kcal)", button "Clear eaten mark". The home and history totals still say "kcal served". History rows carry one status line since `4f81013` ("Estimated 459 kcal · eaten" / "· not eaten yet" / "· eaten 230 kcal"), and row photos have rounded corners. Lesson from 5: never call `toLocal()` on a clock value in Tier1; test clocks hand out `TZDateTime` and it throws without the timezone database (use `_localTime`). Grok's free limit ran
out on its first task on 2026-11-15, so the main host made these edits directly, as the owner allowed.

**Photo estimate screen (the core result, rendered as `06`–`08`):** DONE in `f7ecd0c`: recognized foods are cards,
the open question is an amber block. Still weak there, in order: (a) DONE in `c8a60f4` (`Tier1Meal.componentKcal`, tested to add up to the served total); (b) and (c) DONE in `7115ccf` (plain source lines, no record id);
(d) the totals at the top are five form fields, not a summary (kcal large, macros with their colour dots) with
an Edit button. (d) is DONE in `bff13cb` (owner said yes): a summary card (name, large kcal, labelled macro dots, status) with `Edit totals` revealing the form; manual entry with no estimate still opens on the form. Tests that type into the totals tap `Edit totals` first.

**Dialogs (rendered as `10`, `11`; the totals form as `09`):** DONE in `35ca117`. Both correction dialogs use the app's colours (`dialogTheme` in `app_theme.dart`, was Material's lavender tint), short text, labels "Portion (g)" and "Search foods", and two actions in a row; "Use original" / "Use predicted food" moved into the dialog body because three actions stacked vertically. Manual entry with nothing in it reads "New meal / What did you eat?" since `998aa92` (it used to say "Meal estimate / Estimated calories / Not marked as eaten"). Run `dart format` on `lib/features/tier1 test/tier1 tool/ui` only: formatting all of `lib` rewrites nine unrelated files.

**Defects, most visible first** (`lib/features/tier1/tier1_app.dart` unless noted):
1. [App bar title] shows the literal `AppName` (`lib/core/constants/app_constants.dart:3`). Set it to `Calorix`.
2. [Meal editor header] the status line ("Confirmed consumed · 459 kcal") touches and overlaps the floating
   "Meal name" label. Put 16px between the header block and the first field.
3. [Meal editor, below Save] a divider sits directly under the helper text, then `Ate all` / `Ate half` /
   `Leave unconfirmed` with no label. Add 16px above and below the divider and a label: "How much did you eat?"
4. [Home] the primary action `Take photo` is a small pill; the secondary `Manual entry` is full width. Swap the
   weights: `Take photo` full width and 56px high, `Manual entry` as a text button under it.
5. [History rows] three identical grey fork icons, no time, no macros. Show `12:30 · 459 kcal`, then
   `P 44 · C 56 · F 5` in the macro colors (protein `#3A5BFF`, carbs `#19D3D9`, fat `#1FCC74`), grouped under a
   day header with that day's total.
6. [Copy] "Approximate served calories", "Consumption not confirmed", "Saving corrections resets consumption to
   unconfirmed. Missing macros stay unknown." are internal vocabulary. Suggested: "Estimated calories",
   "Not marked as eaten", "Editing clears the eaten mark. Empty macros stay empty." Tests in `test/tier1`
   assert on the old strings; change them in the same commit.
7. [Manual entry] `Save meal` with nothing filled in is a full blue pill with dark text (looks broken, about
   2.5:1). Give it the theme's disabled style. The export and delete icons show on an entry that does not exist
   yet; hide them until the meal is saved.
8. [Home] saved meals appear nowhere on the first screen and there is no "today" total. One line above the
   buttons ("Today · 839 kcal · 2 meals", tappable to History) costs little and shows the product's point.

**Owner decisions of 2026-11-16, all DONE in the worktree (`c9fdb21` and the three commits before it):**
- Tier1 takes the design's ring and navigation. Three tabs: Today (ring from `lib/shared/widgets/macro_ring.dart`
  against `AppConstants.default*Target`, macro bars, today's meals), Scan in the middle (still the landing
  screen; a second tap on it takes the photo), History. `Manual entry` moved to the app bar. Renders: `12-today`.
  `Change targets` on Today opens a sheet (`lib/features/tier1/targets.dart`, saved to `tier1/targets.json`; render `13-targets`).
  NEXT: the design's Goals and AI tabs, if the owner wants them in Tier1.
- Anticipation fixes after using the phone (`abdf5d4` and three commits before): the keyboard's Next/Done
  walks the manual form and Done saves; a blank manual entry opens with the keyboard up; after logging a meal
  of today the app returns to Today; a photo kept on the phone reads "Your photo" with `Estimate photo` as the
  only filled button (render `14-photo-kept-local`). Camera capture and the consent dialog were checked on the
  Samsung with "Keep local"; no photo was sent.
  Checked on the Samsung on 2026-11-16 with the APK from run 43776290244 (`7aff81a`): all three tabs render
  (`device-SM-G780G-tabs-2026-11-16.png`).
  Motion was then judged from a screen recording cut into frame strips
  (`/home/agent-runner/projects/_ui-review/phone-motion.sh`): slide and cross-fade are there; it showed that the
  Today figure did not count up on first appearance and that a photo without an estimate read "0 kcal · 1 meal"
  (both fixed, `7adde99`). The camera flash after closing the editor is fixed too (`6754871`, seen on the
  phone: the editor slides off Today and the figure counts 640 to 790). Accuracy numbers: `tool/pooled_a1_size_check.py`.
- A logged meal counts as eaten; "Ate half" is the exception ("190 of 380 kcal eaten"). The word "served" is gone
  from the UI. Stored data is unchanged (`consumedFraction == null` now reads as "all").
- A saved, unchanged meal closes with an outlined `Done`; `Save meal` shows only with the form.
- Motion follows `docs/tier1-motion.md` (in the worktree); all durations are in `lib/features/tier1/motion.dart`.
  Antigravity was asked to implement it and timed out after 5 minutes without an edit, so the host did it.

**Device check DONE 2026-11-15** on the Samsung (APK from workflow run 43756437794, commit `ae0cccb`, installed
with `phone-adb install -r`). The phone has no lock: `phone-adb shell input keyevent KEYCODE_WAKEUP` then
`phone-adb shell wm dismiss-keyguard` opens it. Checked: name "Ravlo", camera screen, manual entry with the
keyboard, save, history, meal summary card, today line; insets top and bottom are fine
(`device-SM-G780G-meal-and-home.png`). Found and fixed in `e4b7f12`: the phone is 360dp wide, so the history status
line wrapped; it is now "380 kcal · not eaten yet", and the renderer draws at 360x800 for that reason.
Not checked on the device: a real photo estimate (it sends a photo to the cloud; the owner should trigger that).
Open observation, not changed: on a saved, unchanged meal `Save meal` is still the biggest button although there
is nothing to save; `_save` writes an edit and a `manual_saved` trace even then, so changing it needs care.

**Worktree commits this session:** `3b551cc` (AGENTS.md §3 routes corrected), `1b2e122` + `503496d` (Tier1
formatted, renderer added). An unfinished emulator screenshot test from a cut-off agent was removed; the
renderer above made it unnecessary.

## 3. Designed UI vs mockup (for when it returns)

Compared `docs/live-app-screenshots/round5/02_today.png` (2026-08, the last live capture) with
`reference-images/today--light.png`. Concrete gaps, most visible first:
1. **Ring:** the reference has three *progress arcs* from 12 o'clock on neutral grey tracks. Live draws three full
   pastel circles (macro-colored tracks at low alpha), which read as decoration. Tracks: `#EEECE6` light /
   `rgba(255,255,255,.06)` dark; arcs in full macro colors.
2. **Header:** the reference puts a mono date (`FRIDAY · MAY 15`) *above* "Today" and uses 36px outlined circular
   buttons with initials. Live puts the date below and uses 52px grey filled circles. The live header looks heavy.
3. **Numbers:** the reference uses mono tabular `96 / 170g` at row size. Live uses a large bold `0g` with a thin
   `/ 170g`. The mixed weights make the rows uneven.
4. **Nav:** the reference uses custom line icons with a glowing gradient Scan FAB and a mono `SCAN` label. Live
   uses stock Material icons, and the Scan label is greyed as if disabled.
5. **Recent scans header** lacks the right-aligned mono counter (`3 TODAY`). The empty state uses a stock camera icon.
6. Known: `BOTTOM OVERFLOWED BY 5.5 PIXELS` on Today, and "Error loading meals" (missing Firestore composite index,
   `docs/known-issues.md` #1). The index needs a deploy, which needs owner confirmation.

## 4. Worker routes in AGENTS.md §3 are broken (verified 2026-11-14)

- `grok-4.6` no longer exists. `grok models` lists only `grok-4.7`, and the CLI prints "You are not authenticated".
- OpenCode is v2.1.4: `opencode run` has **no `--dir` flag** (every command in §3 fails with
  `Unrecognized flag: --dir`). Run from the repo directory instead. `opencode/nemotron-3-ultra-free` returns
  `Model unavailable`. `opencode models --standalone` lists no `opencode/` free models, only `google/*`, and
  sometimes crashes with `ServiceUnavailableError: Location plugins did not finish activating`.
- Status file: `qwen3.7-max` hit its free-tier quota.
- **Update 2026-11-15:** the owner logged Grok in (`grok-4.7` works) and said: when a worker route is down, the
  main host edits code itself without asking; pushes and deploys are allowed at any time. Worktree AGENTS.md §3
  is corrected (`3b551cc`). OpenCode's free quota can run out for the day.
- **Result on 2026-11-14 (superseded by the update):** the mandatory strongest-first editing chain had no working free route. The owner must decide:
  fix auth and routes, or allow the main host to edit while routes are down. Do not burn sessions retrying dead routes.

## 5. Reminders
- The commit-msg hook rejects `AI`, `Claude`, `Gemini`, `Generated`, `Co-Authored-By` and similar. Write plain messages.
- `phone-adb` only. Never plain `adb`.

## Estimate accuracy: where it stands (read 2026-11-16, no code changed)

- Live route: one `gemini-3.8-flash` call per photo (`functions/src/tier1-analysis.ts`), six USDA records, everything
  else is the model's own per-100 g guess. The app sends only the JPEG, no user text.
- All evidence is Nutrition5k cafeteria photos. Weighed phone meals: 0. Reports: `pilot_report.md` in the worktree.
- Pooling the per-meal tables already in `docs/tier1-mass-power-2026-11-10/cases.csv` and
  `docs/tier1-food-agreement-2026-11-11/per-case.csv` (79 meals, A1 rows): mean error 132 kcal, bias -96.
  Under 200 kcal the model reads 37% high (median); over 500 kcal it reads low on 21 of 21 meals, median 36% low.
- A single factor (x1.31 when the estimate is 150 kcal or more) cuts mean error to 106 kcal leave-one-out (19%).
  Earlier runs rejected the same idea because each 10-meal cohort alone missed a 10% bar. Not shipped: owner decides.
- 2026-11-16, REJECTED on held-out meals (owner asked for a broad test): rule fixed in advance (x1.4 at 400 kcal or
  more), run once on 150 random Nutrition5k + 185 unused NutritionVerse-Real dishes. Nutrition5k: error 74.5 -> 92.4
  kcal (24% worse). NutritionVerse: 285.9 -> 263.8 (8% better, interval crosses zero). On random meals the bias is only
  -7 kcal; the low reading is real only on big multi-food plates. Do not ship a flat factor. Result and script:
  branch `feat/structured-food-routing`, `docs/tier1-size-rule-holdout-2026-11-16/`, `tool/size_rule_holdout.py`
  (worktree `~/.local/share/calorix-food-agreement-20261111/worktree`). Per-meal table stays local (NV licence).
- Tried and rejected by earlier agents, do not repeat: second photo, coin for scale, high thinking, portion-audit
  prompt, Argon model, 73-record catalog, name-based priors. The specialist model wins on Nutrition5k only, needs
  32 s on a Pi, and fails on other photo sets.
- Untested and likely worth more than any of the above: a typed note sent with the photo ("250 g pasta, 2 tbsp oil"),
  and a barcode route for packaged food.
