# Research Notes for Calorix Agent Instructions v2

Checked current public docs/sources before revising the instruction set.

## Instruction and Agent Best Practices

- Claude Code uses `CLAUDE.md` files for durable project instructions and recommends concise, specific, well-structured instructions. Root `CLAUDE.md` should target under ~200 lines and move multi-step procedures into skills or scoped rules.
- Claude Code subagents are Markdown files under `.claude/agents/` with YAML frontmatter. They are useful for preserving main-session context, enforcing focused tool access, and specializing behavior.
- Codex uses `AGENTS.md` as durable project guidance and recommends clear goal/context/constraints/done-when framing.
- Gemini CLI uses `GEMINI.md` context files and can import modular context.

## Current Tool Findings

- Context7 supports setup with `npx ctx7 setup`, and can use CLI/skills or MCP mode.
- Firebase recommends the official Firebase Claude plugin for Claude Code, or manual `firebase-tools@latest mcp` fallback.
- Flutter/Dart MCP is experimental, requires Dart 3.9+, and is started with `dart mcp-server`; for FVM projects this pack uses `fvm dart mcp-server`.
- FVM provides proxy commands `fvm flutter` and `fvm dart`, so project commands should use those.
- `mcp_flutter` exposes Flutter inspection, interaction, debug, and lifecycle tools; use it with `fvm flutter run --debug`.
- gcloud MCP runs via `npx -y @google-cloud/gcloud-mcp` and supports Gemini CLI extension setup.
- Gemini 3.1 Pro Preview must be verified with `/model`; stable Gemini 2.5 Flash/Pro are safer defaults. `gemini-3-pro-preview` was discontinued and should not be hardcoded.
- Codex CLI supports `codex exec`, `--sandbox workspace-write`, and `--ask-for-approval`; avoid bypassing sandbox except in isolated environments.

## Practical Decisions

- Claude remains the orchestrator and main implementer.
- Gemini is mandatory for non-trivial plan/diff review.
- Codex is optional but recommended for isolated implementation/test/security offload.
- All Flutter/Dart tooling is FVM-wrapped.
- Root `CLAUDE.md` imports detailed `.claude/*.md` files to reduce duplication.
- `AGENTS.md` and `GEMINI.md` mirror the durable project constraints for Codex and Gemini CLI.
