# Fresh-session handoff — Calorix nutrition accuracy

This is the entry point after the user's requested chat reset. **Resume the existing accuracy work; do not restart research, rerun sealed experiments or ask for another routine plan approval.** No new feature work was started after the reset request.

## Start here

The shell may start in `/home/agent-runner/projects/ui-diff-mcp`. The active task is in **Calorix**, at:

```bash
cd /home/agent-runner/.local/share/calorix-failure-diagnostics-worktree.hs0c9bmt
git status --short --branch
git log -3 --oneline
sed -n '1,95p' docs/implementation-status.md
cat docs/superpowers/specs/2026-11-07-nutrition-high-thinking-design.md
cat docs/superpowers/plans/2026-11-07-nutrition-high-thinking.md
```

Read this checkout's `AGENTS.md` and applicable skills before implementation. Do not dump the whole implementation-status file: its historical log is very large. Its top authoritative handoff supersedes old entries.

Branch: `feat/nutrition-accuracy-development`. Working tree is to be clean and exact `origin` at the handoff commit. Last result commit before this documentation checkpoint: `57d69d703bd841e8dd925e8f1a344a5f8f4af02d`. Actual Functions implementation remains `b6907187610e680941d5e11f0211296cd6c1a0e5`, Functions tree `4141e2f4d232d9412b587480e72d2d62e96dfde3`. The handoff commit changes documentation only.

## User's goal and standing preferences

Improve actual calorie/macro accuracy as far as possible, compare fairly against the saved2.5 result, then exceed it. The user objected to merely observing failures and building evaluation infrastructure. Implement concrete repairs and measure them; a rejected candidate does not end the overall goal.

- Keep2.5 as historical evidence; make no new2.5 requests. Do not call3.8 better from different evaluation datasets.
- Continue the approved roadmap without repeated plan approval. If permitted editing routes fail, the standing native-edit exception applies; retain genuine RED/GREEN, independent review, verification, commits/pushes. No repeated native-edit permission request.
- Antigravity MCP gates remain mandatory. Use3.8primary/3.7fallback/3.6finalfallback, yolo,persistent scopedconversation; High is supplied by server, not appended to model ID. No CLI substitute or noisy/empty response counted green.
- Every review prompt must include: “Do not edit files, do not run write commands, and do not mutate the repository; only inspect, reason, debug, review, and propose changes for the main agent to apply.” Prefer inline evidence and no tool/file/command execution by reviewer.
- Always isolated clean Git workspaces; preserve original/user changes, commit/push bounded stages, give GitHub plan links. No age-based remote branch deletion. Open PR list was empty at last inspection; active/unmerged remote branches preserved.
- `/tmp` is RAM-backed. Use disk-backed task storage below (`/dev/sda2`,ext4 verified), set TMPDIR/tool caches, never sweep shared/foreign temporary data.
- No production deployment/data mutation without explicit authorization. Current work is opt-in backend development; no UI/device/production change.

## Exactly where work stops

**Next plan:** [inventory contract repair + HIGH single-pass](superpowers/plans/2026-11-07-nutrition-high-thinking.md), [design](superpowers/specs/2026-11-07-nutrition-high-thinking-design.md).

The preimplementation research/design/plan and **max24newimageSDKcalls** review is green. The user interrupted the tool call to request a fresh session; a read-only `read_conversation` recovered its completed response:

```text
SCOPE: HIGH_DESIGN_PLAN_AND_24_CALL_BUDGET_ONLY
AGREEMENT_STATUS: agree
MUST_FIX: none
```

Conversation `calorix-accuracy-high-thinking-design-20261107`, response timestamp `2026-11-07T22:29:36.834Z`. Initial review overclaims were corrected: all24success required, SDK counters are not HTTP attestation, modern responseJsonSchema, strict-positive validator unchanged. **No review replay is needed.** This gate approves the plan/budget, not actual implementation, nutrition accuracy or production.

**Task1 has not started.** No HIGH source/test files exist, no HIGH SDK request has run, and the seven-failure inventory contract bug remains in current code. Start Task1 with executing-plans `task-start`, read its generated brief and BASE, then write the failing regression before modifying application code:

```bash
/home/agent-runner/.codex/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/executing-plans/scripts/task-start docs/superpowers/plans/2026-11-07-nutrition-high-thinking.md 1
```

Then:

1. Fix outgoing inventory array bounds/prompt descriptions offline; strict Zod stays unchanged, zero live two-pass calls. Do not trim four alternatives or fabricate a success. Add regression for actual outgoing SDK schema, keep four-alternative rejection covered.
2. Implement/test opt-in1:1 HIGH SDK facade and once-only native entrypoint using unchanged candidate1prompt, same24inputs,30s timeout. Do not widen the old global LOW/MEDIUM resolver or mutate sealed APIs. Actual HIGH route must be explicit in metadata.
3. Run appropriate old321controls plus new tests/build/lint; one fresh whole-feature read-only review for this NEW combined feature, mandatory MCP source/hermetic-results review, commit/push clean source before live. No new live call until these gates and fresh account/cache/runtime checks pass.
4. Execute the separately budgeted24-image HIGH trial once, audit all24, obtain actual-results MCP review, commit/push results and continue repair/freeze decision. Held-out validation and final comparison budgets remain later work.

No existing HIGH plan workspace/ledger has been initialized. Completed prior plan ledgers remain available; do not confuse them with this new plan.

## Completed actual experiments

| Reference | Parsed / attempted | Calorie median / P90 | Severe | Zero-safe macro mean |
| --- | --- | --- | ---: | --- |
| Original3.8 MEDIUM |22/24|18.4409% /45.4632%|2|1.506471 (66pairs)|
| Candidate1 prompt repair |24/24|21.1570% /67.5869%|3|1.518007 (72pairs)|
| Two-passV1 |16/24|22.9727% /69.8731%|3|0.572686 (48pairs)|

**Both repair candidates rejected.** The two-pass macro mean is not improvement evidence: eight cases failed, including the hard egg-white outlier. On the common15successes its zero-safe macro mean also worsened:0.565540 vs baseline0.497782; calorie median21.4032% vs20.3593%,P9051.8472% vs39.6736%. Other diagnostics need not all worsen. Single-sample, noncontemporaneous results do not establish causal prompt/profile effects.

Candidate1 run: `accuracy-meal-prompt-v1-d51b7a2f4621-2026-11-07T21-20-19-867Z`, source/execution `d51b7a2f4621d45a9b633bfd01229dff357d594b`. Native0,24imageSDKcalls,0newtoken/retry/fallback; all22oldsuccesses retained. Known egg-white dish1565021965 predicted mozzarella350kcal/26.5gfat vs92.039993kcal/0.354gfat. Fat relative error73.8588 means7,385.88%, not74%. [All24 results](nutrition-accuracy-development-2026-11-07.md).

Two-pass run: `accuracy-two-pass-v1-b6907187610e-2026-11-07T22-10-18-077Z`; execution `d2df80c413aee76c94fd1c2178dd8b49343348ec`, implementationb690718. Native0,326.502s, **40SDKimages=24inventory+16nutrition**,40reserved/40stageoutcomes/24dishoutcomes,0newtoken/retry/fallback. Seven failures were four alternatives against clientmax3; outgoing schema/prompt omitted max3. These are request/validator contract errors. One actual provider-stage HTTP5xx on1560543605, exactstatus/rawpayload not retained. Generic dish report labels all8provider_request_failed; stage failure codes are authoritative. Known egg-white inventory still named mozzarella, then failed validation; **no nutrition output exists for it**. [Full results, hashes and review limits](nutrition-two-pass-development-2026-11-07.md).

All16parsed two-pass outputs need_review solely nutrition_basis_ambiguous; eight failures are not successful review predictions. Unsafe0 is not accuracy proof. No production promotion or2.5superiority claim.

Both actual-results MCP gates are corrected green, reporting scope only:
- `calorix-accuracy-candidate1-actual-results-20261107`
- `calorix-accuracy-two-pass-actual-results-20261107`

## Verification already completed

Two-pass implementation genuine focused TDD3PASS24FAIL →27PASS. Combined **321PASS,0FAIL,0SKIP,eightfiles**, all294prior case/status instances preserved, build0/lint0. Original211Functionsfiles byte-exact; four new two-pass source/test files give215 tracked Functionsfiles. Raw JSON SHA `bbba2c9ad722cedb80dc040ef093ab5ff59a4198c618f9ae6399f3cf4837f253`. This is not a rerun of the older5,377-test parent suite.

One fresh whole-feature reviewer completed0Critical/0Important/3Minor,215pins matched before/after. Corrected MCP implementation/hermetic gate green (`calorix-accuracy-two-pass-implementation-20261107`). Do not dispatch a re-review of that completed feature. The new HIGH feature still needs its own review after implementation.

Deferred minors and exhaustive declined-to-judge/ruling lists are in the two-pass report and ledger. Preserve them for final reporting:
- Invalid inventory generic-provider attribution; stage codes carry real cause.
- Oversized nutrition can succeed without retained raw text; never claim exhaustive raw-response inspection when unavailable.
- Missing direct boundary tests for21components/instruction-like strings/unresolved persistence promise; source controls inspected correctly. Do not silently turn minor polish into another framework task.

The host audited24numeric rows/40stage records/39retainedJSONresponses; one provider failure has no response,0oversized. Source215/runtime75/images24 and all old run bytes/modes/mtime/ctime matched. Host inspected one source photo this attempt, not all24; reviewer inspected zero photos. Backend experiment: no UI-diff run, auditLimited/visualClassificationStatus/diff counts not applicable.

Do not rerun unchanged tests just for this documentation handoff. After Task1/Task2 code changes run appropriate tests. Do not rerun old completion proofs after their preconditions change (e.g. root-absent or source215-exact checks).

## Persistent artifacts and dangerous-to-repeat commands

Private task artifacts, receipts, reviews and helpers:
`/home/agent-runner/.local/share/calorix-accuracy-development-20261103.cpe3el5n` (call this D).

Important D files:
- `two-pass-actual-audit.json`, `two-pass-actual-audit.log`, `audit-actual-two-pass.py`.
- `accuracy-two-pass-v1-live-20261107.state.json` — terminal/exited/native0; **never restart wrapper**.
- `two-pass-actual-execution-pin.json` —215source/75runtime/24images/old-evidence hashes and exact execution identity.
- `two-pass-qualified.json`, `two-pass-pre-review-source215.json`, `two-pass-controls01.json/.log`, `two-pass-build01.log`, `two-pass-lint01.log`, `two-pass-verification-native-exits.json`.
- `two-pass-whole-feature-review.json`, `two-pass-implementation-review-corrected.json`, `two-pass-actual-review-corrected.json`.
- `high-design-review-initial.json` (noisy), `high-design-review-recovered.json` (full persisted turn), `high-design-review-corrected.json` (explicit green).
- `two-pass-v1-source-runtime-snapshot/` — four source/test files plus two compiledJSfiles and hashes, captured before future repair.
- `two-pass-route-failures.jsonl` —exact current ordered-route failures, timestamps and runtime bounds.
- `candidate1-actual-audit.json`, `candidate1-reference-name-audit.json`, `baseline-medium-frozen.json`.

Sealed native roots under active checkout:
- `.nutrition-eval/accuracy-development/meal-prompt-v1`
- `.nutrition-eval/accuracy-development/two-pass-v1`
- `.nutrition-eval/accuracy-development/inputs/<sha>.png` —exact24cache,9,166,361bytes.

**Never execute** `D/run-actual-trial.py` or `D/run-actual-two-pass.py` again. They are completed once-only experiments, not restart commands. Do not delete/unlock/resume their roots. The future HIGH root `.nutrition-eval/accuracy-development/single-pass-high-v1` is absent and must remain so until the reviewed new implementation is ready.

PriorV1/V2 roots are in the old runtime checkout `/home/agent-runner/.local/share/calorix-benchmark-authority-worktree.KG3o6P/.nutrition-eval/calibration/`. Frozen old proof archive:
`/home/agent-runner/.local/share/calorix-corpus-repair-research.6toehx3b/calibration-v2-runtime-evidence-20261103-29ffa7a`.

OldV1/V2 spent100imageSDKcalls total; candidate1 added24, two-pass added40: **164 actual total**. New HIGH maximum24 →188maximum. Unused8from the two-pass budget are not permission to replay it. Historical token-count calls remain historical; zero new count-token/warmup calls are allowed.

Saved2.5 baseline is only an aggregate: run `run-2026-09-11T20-22-21-450Z`,20publiccases×3=60outcomes (36meal/12label/12barcode),60parsed,0unsafe,15severe,calmedian27.19%/P90101.36%,legacy macro0.5227. Current development has different24dishes and zero-safe macro metric; do not invent historical per-case rows or a superiority comparison.

## Resume constraints and operational traps

Progress: all24candidate1successes plus original22subset retained, unsafe0,severe<=2,calmedian<=.18440896769339005,P90<=.45463187086065293,zero-safe macro<1.5064710070741663. Absolute target mean<=.50 and each macro median<=.35 is separate; progress is not qualification. Freeze before untouched16validation×3=48images; final20public×3=60outcomes (48images+12OFFsnapshots) needs separate reviewed budget and honest whole-pipeline comparison.

Editing routes in this continuous session were exhausted: Grok4.6 unknownID; Qwen3.7max403freequota; Ultra/Muse1.3/Ling absent successful refreshedcatalog; Lightning delivered invalid placeholder tests; BigPickle core/native each300s no progress; paidSonnet5 empty300.459s/native143. Exact messages/times are retained. Only Qwen explicitly reported quota exhaustion. No spend-cap message, so `/usage` special diagnostic was not triggered. The standing native exception persists across a chat reset; record applicability of these current failures to continued work rather than ask again. Refresh appropriate availability if evidence changes; do not assert permanent quota exhaustion. The HIGH plan records carrying this same continuous-work exhaustion forward.

OpenCode global config has an invalid `plugins` key; global files were preserved. Isolated `D/worker-config` refreshed successfully, with `XDG_CONFIG_HOME` set there. Do not “repair” global config as an unrelated task.

Use `TMPDIR=D/tmp` and disk-backed task cache/log paths. Native filesystem tests create and clean only owned test fixtures there. Do not sweep other entries/caches; preserve evidence and current source/runtime snapshots.

Run Vitest/build/lint from **R/functions**. Writing paths from R and then running `./node_modules/.bin/vitest` from R caused a command127; it is not RED evidence. Correct focused full command uses eight existing files: `test/genai-adapter.test.ts`, `test/nutrition-eval/{live-adapter,scorer,report,accuracy-development,accuracy-development-cli,accuracy-two-pass,accuracy-two-pass-cli}.test.ts`; include new HIGH files once authored. Use local binary, one worker, disk TMPDIR. Collect terminal exit codes/JSON before claiming pass.

Fresh account checks must be repeated only before future live, not mistaken for lasting entitlement. Existing `D/two-pass-account-probe.py` is sanitized/read-only and writes named two-pass receipts; create DISTINCT HIGH-named outputs to preserve historical records. Invoke with scoped `CLOUDSDK_CORE_PROJECT=calorix-xurschnell`; do not change global gcloud project. Never log tokens/ADCJSON/accountemail or raw HTTP payloads. Model's returned version is checked; requested thinking level is source/config evidence, not server reasoning-allocation attestation.

Original `/home/agent-runner/projects/calorix` remains branchfix/scan-photo-flow-viewer atfe792e5 with user `.mcp.json` change preserved. Old runtime worktree remains branchfeat/calibration-v2-runtime at29ffa7a. Do not overwrite/stash/delete unrelated work or old remote branches. No local LocateAnything, emulators or Windows-host SSH; any later mobile work must use the Samsung phone-adb wrapper per AGENTS. None is needed for the next backend task.

## No background work to wait for

All editing workers, test/build/lint processes and actual inference attempts from this session finished. The sole fresh code-review subagent completed; its report is persisted. The interrupted HIGH review also completed and was recovered. No implementation or inference should be restarted from an old terminal/session ID. If process inspection is needed, verify ownership and current start identity; do not kill a stale numeric PID.
