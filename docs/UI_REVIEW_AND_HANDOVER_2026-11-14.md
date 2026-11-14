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

## 2. The UI that ships is Tier1, and nobody has looked at it

In the newest worktree, `lib/main.dart` boots `Tier1App` (`lib/features/tier1/`, about 2,600 lines, "local-first
workflow, legacy Firebase services never mounted"). The designed Today/Scan/History UI from
`docs/design-handoff/` is **not mounted** on that branch. So the polished mockups are not what the owner sees.

**Next step 1 (blocking all UI judgement):** get eyes on Tier1.
1. Owner unlocks the Samsung (it was locked at 2026-11-14, `mDreamingLockscreen=true`). ARTEMIS also refuses to run while it is locked.
2. Install the CI test APK for the worktree's pushed HEAD (AGENTS.md CI cadence; there is no Flutter SDK on this Pi).
3. `phone-adb exec-out screencap -p > tier1-<screen>.png` for every Tier1 screen: capture, food selection, the meal
   editor, the list, and export.
4. Judge each with RUBRIC.md, then with Gemini (`ask-ai`, `@png`; it can see images, verified 2026-11-14). Write 3
   `[element] [defect] [fix]` per screen into this file.
5. Decide with the owner: does Tier1 adopt the design tokens and components of the handoff, or does the handoff
   UI come back once the pilot ends? Without that decision, UI polish has no target.

**Code hygiene:** Tier1 Dart is unformatted (`if(value==null)return '';`, many statements per line). Run
`fvm dart format lib/features/tier1 test/tier1` in CI or on a machine with the SDK, as its own commit
(no behavior change).

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
- **Result:** the mandatory strongest-first editing chain has no working free route. The owner must decide:
  fix auth and routes, or allow the main host to edit while routes are down. Do not burn sessions retrying dead routes.

## 5. Reminders
- The commit-msg hook rejects `AI`, `Claude`, `Gemini`, `Generated`, `Co-Authored-By` and similar. Write plain messages.
- `phone-adb` only. Never plain `adb`.
