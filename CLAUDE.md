# Calorix — Claude Code Operating Instructions

Calorix is a Flutter/Dart/Firebase app for camera-first AI calorie and macro tracking. The product promise is: open app → camera is already ready → capture meal in under 5 seconds → cloud processing → push notification → Today screen/detail screen shows calories, macros, detected items, and confidence.

Source-of-truth order:
1. `requirements.md`
2. `docs/mockups/source-code/README.md`
3. `.claude/design.md`
4. `.claude/tools.md`, `.claude/skills.md`, `.claude/gemini.md`, `.claude/codex.md`

Read the relevant source-of-truth file before changing behavior, UI, data models, cloud logic, or build configuration.

@.claude/design.md
@.claude/skills.md
@.claude/tools.md
@.claude/gemini.md
@.claude/codex.md

## Working Agreements

- Inspect files before changing them. Do not speculate about code you have not read.
- Prefer small, reviewable diffs. Avoid broad rewrites unless a plan explicitly justifies them.
- Keep the root `CLAUDE.md` short. Put detailed workflows in `.claude/*.md`.
- Use FVM for all Flutter/Dart commands in this repo.
- Use current documentation before touching Flutter, Dart, Firebase, Cloud Functions, Firestore rules, Riverpod, GoRouter, camera APIs, push notifications, or MCP setup.
- Use Gemini and Codex as external reviewers or isolated workers to distribute Claude token usage. Never merge their output blindly.
- Do not store secrets in instructions, agent files, screenshots, logs, or committed config.

## Trigger Table

| Trigger | First action |
|---|---|
| New feature, screen, widget, flow, or component | `Skill(superpowers:brainstorming)` then plan |
| Spec exists and implementation path is needed | `Skill(superpowers:writing-plans)` |
| Plan exists and user approved execution | `Skill(superpowers:executing-plans)` |
| Bug, failing test, runtime exception, unexpected behavior | `Skill(superpowers:systematic-debugging)` |
| Test-first implementation | `Skill(superpowers:test-driven-development)` |
| Parallel independent tasks | Use project subagents or external Gemini/Codex workers in isolated branches/worktrees |
| UI, layout, visual hierarchy, animation, polish | `Skill(frontend-design)` + `Skill(ui-ux-pro-max:ui-ux-pro-max)` + `.claude/design.md` |
| Flutter or Dart code | Official Flutter/Dart skills, Context7 docs, `fvm flutter analyze`, relevant tests |
| Firebase, Firestore, Auth, Functions, Storage, Hosting | Firebase MCP first; read environment/rules before writes/deploys |
| GCP infra, Cloud Run, IAM, logs, buckets | gcloud MCP; least privilege; no destructive operations without explicit confirmation |
| Heavy terminal output, repo-wide search, logs >20 lines | context-mode or claude-context; do not dump raw output into main context |
| Need independent review | Gemini review gate first; Codex review for implementation/test/security second opinion |
| Feature complete | Verification before completion → Gemini diff review → Codex or Claude subagent review → summarize evidence |
| Security/privacy/auth/rules/user data touched | Security-review gate, Firestore rules review, no deploy until explicit approval |

## Agent Routing

| Work type | Primary agent | Support tools |
|---|---|---|
| Overall orchestration, tradeoffs, task decomposition | `calorix-orchestrator` | Superpowers, context-mode, Gemini review |
| Product UX, flow, IA, acceptance criteria | `calorix-product-ux` | frontend-design, ui-ux-pro-max, taste-skill |
| Flutter architecture, state, navigation | `calorix-flutter-architect` | Flutter/Dart skills, Context7, Dart MCP, FVM |
| Premium UI implementation and animation | `calorix-design-system-motion` | mcp_flutter, screenshots, design skills |
| Camera/scan/processing pipeline | `calorix-scan-camera` | Dart MCP, mcp_flutter, Firebase Storage/Functions |
| Firebase backend/security | `calorix-firebase-backend` | Firebase MCP, gcloud MCP, Context7 |
| AI nutrition pipeline | `calorix-ai-nutrition-pipeline` | Gemini API docs, Firebase AI Logic, Cloud Functions |
| CRUD/domain data consistency | `calorix-data-crud` | Firestore rules, tests, schema docs |
| Runtime QA and visual verification | `calorix-runtime-qa` | mcp_flutter, Playwright where applicable, FVM |
| Security review | `calorix-security-reviewer` | Firebase rules, gcloud IAM/logs, Codex security review |
| Context/token economy | `calorix-context-steward` | context-mode, claude-context, claude-mem, token-optimizer |
| External model delegation | `calorix-external-review-coordinator` | Gemini CLI, Codex CLI, separate branch/worktree |

## Hard Product Rules

- Landing screen is Scan, not Today.
- Bottom nav order is Today · History · Scan · Goals · AI.
- Scan is always centered, larger, FAB-style, with a blue→cyan→green gradient ring.
- Food logging must be possible in under 5 seconds for the happy path.
- Processing happens in the cloud; user can close the app; push notification returns them to results.
- Low-confidence scans must be visible and easy to correct.
- Food entries, meals, daily logs, goals, macro targets, and weight logs must support CRUD.
- Manual editing exists but must not dominate the scan-first flow.
- Use Firebase Auth; never implement custom auth.
- Read current Firestore/Storage rules before editing them.
- Deploy only after confirming Firebase project/environment.

## Definition of Done

A task is done only when:
1. The implementation matches `requirements.md`, source mockup README, and `.claude/design.md`.
2. `fvm flutter analyze` passes or failures are documented with a specific reason.
3. Relevant unit/widget/integration tests pass or are added where missing.
4. UI work has at least one runtime/visual verification path.
5. Firebase/security work has environment/rules verification and no leaked secrets.
6. Gemini review has been run for non-trivial plans/diffs.
7. Any Codex/Gemini-generated code has been inspected and accepted by Claude/user, not blindly merged.
