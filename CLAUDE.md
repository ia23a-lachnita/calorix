# Calorix — Claude Code Instructions

@AGENTS.md
@.claude/design.md
@.claude/tools.md

`AGENTS.md` is the single agent contract for this repository. Follow it exactly; this file only adds Claude-Code-specific notes and must stay thin to prevent drift.

## Claude Code specifics

- External review tool name in Claude Code: `mcp__antigravity-mcp__ask-ai` (same tool the contract calls `ask-ai`).
- Prefer built-in tools (`Read`, `Edit`, `Grep`, `Glob`, `Bash`/`PowerShell`) over shelling out; use `claude-context` semantic search before repo-wide grep storms.
- Project subagents exist in `.claude/agents/` (orchestrator, flutter-architect, firebase-backend, scan-camera, design-system-motion, data-crud, runtime-qa, security-reviewer, and others). Delegate to them only when a task is genuinely isolated; do not route every task through them.
- Workflow skills: use `superpowers` skills for brainstorming/planning/debugging/TDD when they apply, `frontend-design` and `ui-ux-pro-max` for UI work, `context7` for current library docs, and `token-optimizer`/`context-mode` under context pressure. Choose the smallest set that changes behavior; do not stack skills for decoration.
- Detailed policies (read on demand, not upfront): `.claude/skills.md` (skill triggers), `.claude/codex.md` (Codex offload), `.claude/gemini.md` (Antigravity review prompts).
