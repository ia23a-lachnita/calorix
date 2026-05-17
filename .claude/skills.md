# Calorix Skills Policy

Skills are workflow accelerators, not decoration. Invoke the relevant Skill before acting when the trigger applies.

## Workflow Skills

| Trigger | Skill |
|---|---|
| New feature, screen, component, or ambiguous product ask | `superpowers:brainstorming` |
| Clear spec and need implementation plan | `superpowers:writing-plans` |
| Executing an approved plan | `superpowers:executing-plans` |
| Bug, failure, regression, runtime exception | `superpowers:systematic-debugging` |
| Writing behavior before implementation | `superpowers:test-driven-development` |
| Independent subtasks in current session | `superpowers:subagent-driven-development` |
| Parallel isolated branches/worktrees | `superpowers:dispatching-parallel-agents` + `superpowers:using-git-worktrees` |
| Completing a feature | `superpowers:verification-before-completion` |
| Asking another agent/model to review | `superpowers:requesting-code-review` |
| Applying review feedback | `superpowers:receiving-code-review` |
| Finishing a branch | `superpowers:finishing-a-development-branch` |

## Domain Skills

| Trigger | Skill |
|---|---|
| UI/UX, layout, motion, design system | `frontend-design`, `ui-ux-pro-max:ui-ux-pro-max`, `taste-skill` |
| Flutter application work | Official `flutter/skills` where installed |
| Dart code, APIs, analysis, packages | Official `dart-lang/skills` where installed |
| Code style/refactoring discipline | `andrej-karpathy-skills:karpathy-guidelines` |
| Token/context pressure | `token-optimizer:token-optimizer`, context-mode, claude-context |
| Terse internal handoff only | `caveman` optional; never use for user-facing docs or polished project instructions |
| Claude settings/hooks/permissions | `update-config` if available |
| Security/auth/rules/user data | security-review skill if installed; otherwise route to `calorix-security-reviewer` |

## Priority Order

1. Process skill first: brainstorming, planning, debugging, TDD, verification.
2. Domain skill second: Flutter/Dart/Firebase/UI/security.
3. Context/tool economy third: token optimizer, context-mode, claude-context.
4. Review/offload last: Gemini/Codex review after a plan or diff exists.

## Usage Rules

- Do not stack many skills blindly. Choose the smallest set that changes behavior.
- For UI tasks, use design skills before implementation and visual verification after implementation.
- For Firebase or GCP tasks, docs/MCP checks are mandatory before writes or deploys.
- For Flutter/Dart tasks, use FVM commands and current docs before relying on memory.
- For generated plans, ask Gemini to review before coding when the change is multi-step or architecture-affecting.
