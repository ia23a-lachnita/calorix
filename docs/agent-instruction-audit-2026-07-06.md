# Agent Instruction & Config Audit — Calorix (2026-07-06)

Scope: agent instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/*`), host configs (`.mcp.json`, `.claude/settings*`, `.codex/config.toml`, `.gemini/settings.json`), and repo hygiene. Not a full app-code audit.

## Findings and status

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | Instruction stack was cluttered and partially obsolete: `.claude/tools.md` still mandated the retired `mobile-ui-diff` server (`vlm_health`, local ollama models qwen2.5vl/moondream) although the project now uses the `ui-diff` MCP server with cloud providers; an agent following it literally would stop and ask the user to "fix VLM" that no longer exists. | **Fixed**: tools.md rewritten around the real `ui-diff` tools (`compare_ui_images`, `start_ui_diff_run`, `read_ui_diff_report`, `capture_mobile_screen`, `ui_diff_model_health`, …). |
| 2 | High | `.claude/gemini.md` + `GEMINI.md` + `CLAUDE.md` prescribed the deprecated Gemini CLI pipe-review workflow (with stale `gemini-2.5-*` model names), conflicting with the enforced Antigravity MCP review used in practice. | **Fixed**: all external Gemini review now goes through Antigravity MCP `ask-ai` with the `AGREEMENT_STATUS`/`MUST_FIX` green criteria; Gemini CLI review explicitly deprecated. |
| 3 | Medium | Rules were duplicated across `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` (product rules, done criteria, source-of-truth list) with slight wording differences — guaranteed drift. | **Fixed**: `AGENTS.md` is the single contract; `CLAUDE.md`/`GEMINI.md` are thin host-specific overlays. |
| 4 | Medium | Google MCP connectors (`firebase`, `gcloud`) were enabled by default in `.claude/settings.local.json`, `.codex/config.toml`, and `.gemini/settings.json`, loading on every session although rarely needed. | **Fixed**: disabled by default in all three host configs (plus the machine-global Codex config); contract forbids silently re-enabling. |
| 5 | Medium | `CLAUDE.md` imported five `.claude/*.md` files into every session and routed all work through a 12-subagent table plus large trigger tables — significant context cost with no evidence of use. | **Fixed**: imports reduced to `AGENTS.md`, `design.md`, `tools.md`; subagents and per-topic policies referenced on demand. |
| 6 | Low | Stale references: skills `taste-skill` and `andrej-karpathy-skills:karpathy-guidelines` are not installed; `.claude/settings.local.json` allows `mcp__gemini-cli__*` but no `gemini-cli` MCP server is configured; `WebFetch`/`WebSearch` appear in both allow and deny lists in `.claude/settings.json` (deny wins — the allow entries are dead). | **Partially fixed**: stale skill references removed from instructions. Dead permission entries left in place (harmless) — clean up `settings.local.json` when convenient. |
| 7 | Low | `.claude/` contains 30+ committed `ui-diff-session-*.md` transcripts and one-off plan files, cluttering the instruction directory. | **Open (recommendation)**: move session logs to `docs/archive/ui-diff-sessions/` (or delete); keep `.claude/` for durable instructions only. |
| 8 | Low | `.claude/settings.local.json` is tracked in git although it holds machine-local permission grants; other machines inherit and overwrite each other's local settings. | **Open (recommendation)**: gitignore it and fold the durable parts into `.claude/settings.json`. |
| 9 | Info | Untracked clutter: `.gemini/settings.json.bak-20260517-220447`, stray screenshots in `docs/screenshots/`, and `.claude/ui-diff-runs/` at repo root. | **Open (recommendation)**: delete the `.bak`, gitignore run artifacts, and commit or remove the screenshots deliberately. |

## Product-level open issue (from ui-diff-mcp status)

Calorix Today visual parity against `docs/design-handoff/placeholder-app/reference-images/today--dark.png` is not achieved: the last hydrated release report shows 91 final diffs and a 2.16% device/reference aspect-ratio mismatch. A fresh release-live run with the real LocateAnything model is pending on the ui-diff-mcp side.
