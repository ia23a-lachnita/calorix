# Calorix Skills Policy

Skills are workflow accelerators, not decoration. Choose the smallest set that changes behavior.

| Trigger | Skill |
|---|---|
| New feature / ambiguous product ask | `superpowers:brainstorming`, then a plan |
| Clear spec, need implementation plan | `superpowers:writing-plans` |
| Executing an approved plan | `superpowers:executing-plans` |
| Bug, failing test, regression | `superpowers:systematic-debugging` |
| Behavior change / bug fix | `superpowers:test-driven-development` |
| Feature complete | `superpowers:verification-before-completion`, then the Antigravity review gate |
| UI/UX, layout, motion, design system | `frontend-design`, `ui-ux-pro-max:ui-ux-pro-max`, plus `.claude/design.md` |
| Library/API questions (Flutter, Dart, Firebase, Riverpod, GoRouter) | `context7` docs before model memory |
| Token/context pressure | `token-optimizer`, `context-mode`, `claude-context` |
| Claude settings/hooks/permissions | `update-config` |

Priority order: process skill first (plan/debug/TDD/verify) → domain skill (UI/Flutter/Firebase) → context economy → external review last (Antigravity MCP per `AGENTS.md` section 4, after a plan or diff exists).
