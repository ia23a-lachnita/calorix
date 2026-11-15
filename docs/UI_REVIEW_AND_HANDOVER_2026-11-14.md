# Calorix: orientation, UI review, handover (2026-11-14, external review session)

Rules for any UI work: `/home/agent-runner/projects/_ui-review/RUBRIC.md`. Habits:
`/home/agent-runner/projects/_ui-review/REASONING_HABITS.md`. Both apply on top of AGENTS.md. They do not replace its gates.

## 1. Where the work actually is (verified 2026-11-14)

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
flutter test --update-goldens tool/ui/tier1_shots_test.dart   # writes tool/ui/shots/*.png (390x844, light+dark)
flutter test test/tier1                                        # 105 tests, about 2 minutes
dart format lib/features/tier1 test/tier1                      # pinned Dart 3.11.5; do not use another Dart
```
Open the PNGs with your image reader, or send them to Gemini (`ask-ai`, `@/abs/path.png`). To add a state, add a
`testWidgets` block to `tool/ui/tier1_shots_test.dart`. The camera area renders empty there (fake camera); every
other pixel is the real widget tree with the real fonts. Shots from 2026-11-15 (worktree `bff13cb`, after the fixes) are in
`docs/live-app-screenshots/tier1-2026-11-15/`.

**Verdict:** a working pilot with default Material forms. None of the product's identity is on screen: no macro
colors, no daily total, no ring, and the app bar says "AppName".

**Status of the list below (update after every fix):** 2, 3, 4, 7 DONE in worktree `356aa55` + `80afa21` (Gemini review asked for delete to stay visible at every revision; applied. Export alone waits for the first save.) (plus the cause of 7:
the dark theme's seeded `onPrimary` was dark navy; both schemes now state it in `lib/core/theme/app_theme.dart`).
1 is DONE in `6ac0c58`: the owner named the app **Ravlo** on 2026-11-15 (display name only: constant, Android label, iOS bundle names; package ids and the repo name stay `calorix`). 5 and 8 DONE in `48d9424` (day headers with served totals, time and macro dots per row, a today line on home; test added). 6 (plain wording) is NOT DONE: tests assert the current strings, and the served/consumed vocabulary looks deliberate, so ask the owner before rewording. Lesson from 5: never call `toLocal()` on a clock value in Tier1; test clocks hand out `TZDateTime` and it throws without the timezone database (use `_localTime`). Grok's free limit ran
out on its first task on 2026-11-15, so the main host made these edits directly, as the owner allowed.

**Photo estimate screen (the core result, rendered as `06`–`08`):** DONE in `f7ecd0c`: recognized foods are cards,
the open question is an amber block. Still weak there, in order: (a) DONE in `c8a60f4` (`Tier1Meal.componentKcal`, tested to add up to the served total); (b) the raw
record id (`usda:169756`) is shown to the user; (c) "Unverified model nutrient estimate" is internal wording;
(d) the totals at the top are five form fields, not a summary (kcal large, macros with their colour dots) with
an Edit button. (d) is DONE in `bff13cb` (owner said yes): a summary card (name, large kcal, labelled macro dots, status) with `Edit totals` revealing the form; manual entry with no estimate still opens on the form. Tests that type into the totals tap `Edit totals` first.

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

**Still open with the owner:** does Tier1 take the design handoff's components (ring, nav), or only its tokens?
Items 1–8 need no answer to that; they use tokens that already exist in `lib/core/theme/`.

**Device check** still needs the unlocked Samsung (locked on 2026-11-14 and 2026-11-15). The renderer replaces it
for layout and copy, not for camera, performance, or system insets.

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
