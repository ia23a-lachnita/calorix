# Calorix — Agent Contract

This file is the single operating contract for every coding agent in this repository (Codex, Claude Code, Gemini, or others). `CLAUDE.md` and `GEMINI.md` point here and only add host-specific notes; do not duplicate rules across files. If another instruction conflicts with this contract, this contract wins unless the user overrides it in conversation.

## 1. Project

Calorix is a Flutter/Dart/Firebase app for camera-first AI calorie and macro tracking.

Core flow: open app → Scan screen is ready → capture food in under 5 seconds → cloud processing → push notification → Today/detail shows estimated calories, macros, detected foods, and confidence.

Source-of-truth order (read the relevant one before changing behavior, UI, data, cloud logic, or tooling):

1. `requirements.md`
2. `docs/design-handoff/placeholder-app/README.md`
3. `.claude/design.md`
4. `.claude/tools.md`

## 2. Non-Negotiables

- Use FVM for all Flutter/Dart commands (`fvm flutter …`, `fvm dart …`). Plain `flutter`/`dart` only to diagnose global SDK setup.
- Never deploy, delete cloud resources, or mutate production data without explicit user confirmation.
- Do not commit secrets, service-account files, or generated dependency folders.
- Commit messages: plain imperative English. A pre-commit hook **rejects** commits containing `AI`, `Bot`, `Claude`, `Gemini`, `Generated`, `Automated`, `Sonnet`, `Anthropic`, `noreply@anthropic.com`, or any `Co-Authored-By:` trailer. Never bypass the hook with `--no-verify`; strip the offending token and recommit.
- Work fully autonomously within this contract: pick and use tools without asking permission for reversible, in-scope actions. Ask only before destructive/irreversible actions (deploys, data mutation, cloud deletes) or genuine scope changes.

## 3. Agent Toolset Scope

### Delegation Policy

OpenCode headless mode using model `opencode/mimo-v2.5-free` is the **primary editor** for all repository file edits and token-heavy implementation work, while its quota is available. Canonical invocation:

```
opencode run --model opencode/mimo-v2.5-free --auto --dir <repo> "<prompt>"
```

Only after OpenCode explicitly reports quota exhaustion, is unavailable, or repeatedly stalls (record the exact error/stall evidence in `docs/implementation-status.md` first) may **Claude Code headless** edit as fallback, invoked with `--dangerously-skip-permissions`:

```
claude -p --dangerously-skip-permissions --model <model> "<prompt>"
```

Codex host/child agents **never directly edit application code**; they remain allowed for read-only research, investigation, review, planning, and sub-orchestration.

Workers (OpenCode and Claude Code headless) never commit or push; the main host reviews, verifies, commits, and pushes. This route is an explicit exception to the general do-not-shell-out rule.

The main agent retains requirements interpretation, architecture and tradeoffs, synthesis, verification judgment, production-readiness decisions, and final reporting. Subagents never commit or push; the main agent reviews, verifies, commits, and pushes.

| Capability | OpenCode (mimo-v2.5-free) | Claude Code / Codex CLI |
|---|---|---|
| File edits | `opencode run --auto` (token-heavy work, primary) | Claude Code headless fallback only (recorded exhaustion/stall); Codex never edits |
| Search | Read-only agents may search | `Grep`, `Glob`, `shell_command` (rg), MCP search |
| Shell | `opencode run` invocation only | `Bash` / `PowerShell` / `shell_command` |
| Subagents | N/A | `Agent` tool + agent dirs |
| External review | `mcp__antigravity-mcp__ask-ai` | `mcp__antigravity-mcp__ask-ai` |
| UI parity | `ui-diff` MCP server tools | `ui-diff` MCP server tools |

- Google MCP connectors (`firebase`, `gcloud`) are **disabled by default** in this repo's Claude, Codex, and Gemini configs. Do not silently re-enable them. If a task genuinely needs Firebase/GCP tooling, state that and let the user enable the connector for the session; CLI fallbacks (`firebase`, `gcloud` commands) still require the safety gates in section 6.
- Detailed tool/MCP policy, emulator setup, and the ui-diff workflow live in `.claude/tools.md`.

## 4. External Review Contract (Antigravity MCP)

- Do not use the deprecated Gemini CLI or the `agy` CLI for reviews. Use the Antigravity MCP `ask-ai` tool with `approvalMode: "yolo"`, and a persistent `conversationId` per work stream. Model routing order: (1) `"Gemini 3.6 Flash (High)"` primary, (2) `"Gemini 3.1 Pro (High)"` fallback, (3) `"Gemini 3.5 Flash (High)"` final fallback. All calls remain Antigravity MCP ask-ai with the existing strict read-only/no-mutation prompt. If one route fails before review, try the next in order and record the exact error.
- Every review prompt must explicitly say: **Do not edit files, do not run write commands, and do not mutate the repository; only inspect, reason, review, and propose changes for the main agent to apply.**
- A review is green only when the response explicitly reports `AGREEMENT_STATUS: agree` and `MUST_FIX: none`. Apply must-fix feedback and continue the same conversation until green.
- Required review gates:
  - Before implementation: multi-file features, architecture changes, Firebase/security/rules changes, data-model changes.
  - After implementation: any non-trivial diff (multi-file, behavior-changing, security-touching, or UI-parity-affecting).
  - Trivial single-file edits may skip the pre-review but record why.
- If the MCP tool or model is unavailable, record the exact error; do not substitute a CLI review or count an empty/noisy response as green. Check `git status` after review calls; reviewer responses have previously contained wrapper noise and unexpected mutations.
- Consultation is also mandatory, independent of the diff-based gates above, before the main agent presents any consequential recommendation or second opinion covering architecture, UX behavior, security/Firebase, production readiness, provider/model choice, research synthesis, or a nontrivial debugging conclusion with tradeoffs.
- Consultation is mandatory whenever the user explicitly asks for a second opinion, external/research validation, or which nontrivial approach to take.
- Exempt from this consultation gate: routine factual answers, command-output summaries, progress/status reports, and trivial typo/style choices.
- This consultation gate is additive; it does not replace the pre-implementation and post-implementation review gates above.
- Scope each persistent `conversationId` to one feature, bug, research question, or review workstream; start a new `conversationId` once the subject changes materially or the conversation becomes stale/unbounded.
- On MCP timeout/failure, follow the model routing order above and record the exact errors. If every route fails, label the recommendation as not externally reviewed and do not make production-readiness or security approval claims from it; never count a failed, empty, or noisy response as agreement.

## 5. Product Rules

- Default landing screen is Scan.
- Bottom nav order is Today · History · Scan · Goals · AI.
- Scan is centered, larger, FAB-style, with blue→cyan→green gradient ring.
- No pure `#FFFFFF` or `#000000` UI tokens.
- Protein is blue `#3A5BFF`; carbs cyan `#19D3D9`; fat green `#1FCC74`.
- Food logging must be possible in under 5 seconds on the happy path.
- Processing happens in the cloud; the user can close the app; a push notification returns them to results.
- Low-confidence scans are amber and easy to correct.
- All food entries, meals, daily logs, goals, macro targets, and weight logs support CRUD; manual editing must not dominate the scan-first flow.
- Firebase Auth only; no custom auth.

## 6. Work Contract

- Plan before multi-file or architecture changes; keep diffs small and focused; inspect files before editing.
- Test-first for logic changes and bug fixes; add or update tests with the change.
- For UI changes, compare against the dark/light mockups and `.claude/design.md`, and verify with the `ui-diff` MCP pipeline or runtime screenshots (see `.claude/tools.md`).
- Firebase/GCP safety gates before any write/deploy: confirm active project/environment, read current Firestore/Storage rules first, run emulator/local tests where applicable, run a security review for auth/rules/user-data changes, and get explicit confirmation for destructive operations or deploys.
- Keep large logs, search results, and command output out of the main conversation; summarize instead.

## 7. Definition of Done

A task is done only when:

1. The implementation matches `requirements.md`, the design-handoff README, and `.claude/design.md`.
2. `fvm flutter analyze` passes, or failures are documented with a specific reason.
3. Relevant unit/widget/integration tests pass, or missing tests are explained.
4. UI changes have at least one runtime/visual verification path (ui-diff run or runtime screenshot).
5. Firebase/security changes include environment/rules verification and no leaked secrets.
6. The Antigravity MCP review gate (section 4) is green for non-trivial diffs.
7. Externally generated code (Codex/Gemini) has been inspected before acceptance, never merged blindly.
