# Gemini CLI Policy for Calorix

Gemini is an independent reviewer and optional offload worker. Its main value is catching gaps without Claude's session-context bias and distributing token usage away from Claude.

Use Gemini primarily for:
- Plan review before coding multi-step changes.
- Diff review after implementation.
- Architecture critique across Flutter/Firebase/security boundaries.
- Large-context codebase review when Claude context is constrained.
- Second opinion on Firebase schema, security rules, and AI pipeline design.

## Model Policy

Do not hardcode stale preview model names. Prefer routing or stable models unless you verify access with `/model`.

| Need | Recommended |
|---|---|
| Quick routine review | `gemini -m gemini-2.5-flash` or Auto routing |
| Normal plan/diff review | `gemini -m gemini-2.5-pro` or Pro routing |
| Deep architecture/reasoning if available | `gemini -m gemini-3.1-pro-preview` only after `/model` confirms access |
| Unknown environment | `gemini` then select `/model` → Auto or Pro |

Avoid obsolete `gemini-3-flash-preview` style calls unless the local Gemini CLI `/model` menu confirms that exact ID.

## Review Gates

| Checkpoint | Gate |
|---|---|
| Multi-step plan written | Gemini plan review must pass or issues must be addressed. |
| Feature implemented | Gemini diff review must pass or issues must be addressed. |
| Architecture changed | Gemini architecture review required. |
| Firebase/security touched | Gemini security/schema review recommended in addition to Claude review. |
| UI changed significantly | Gemini can review spec compliance, but visual truth comes from mockups and runtime screenshots. |

## Bash Patterns

```bash
# Plan review
cat .claude/plans/feature-x.md | gemini -m gemini-2.5-pro -p "Review this Flutter/Firebase implementation plan for Calorix. Flag missing steps, incorrect assumptions, edge cases, FVM issues, security/privacy risks, and design-spec violations. Be direct and concise."

# Diff review
git diff main...HEAD | gemini -m gemini-2.5-pro -p "Review this diff against Calorix requirements, .claude/design.md, and Flutter/Firebase best practices. Focus on correctness, regressions, tests, security, and UI spec compliance. Return blocker/warning/nit sections."

# Quick file review
cat path/to/file.dart | gemini -m gemini-2.5-flash -p "Review for correctness, idiomatic Dart/Flutter, and obvious defects. Be concise."

# Architecture review
cat CLAUDE.md .claude/tools.md .claude/design.md | gemini -m gemini-2.5-pro -p "Review this agentic instruction architecture for gaps, contradictions, stale tool choices, and unsafe permissions."
```

## PowerShell Patterns

```powershell
# Plan review
Get-Content .claude\plans\feature-x.md | gemini -m gemini-2.5-pro -p "Review this Calorix Flutter/Firebase implementation plan. Flag gaps, wrong assumptions, edge cases, FVM issues, and security risks."

# Diff review
git diff main...HEAD | gemini -m gemini-2.5-pro -p "Review this Calorix diff for correctness, tests, design compliance, and security. Return blocker/warning/nit sections."

# Verify available models interactively
gemini
/model
```

## Offload Modes

### Review-only mode
Use for most tasks. Pipe plan, diff, or selected files. Do not let Gemini modify files.

### Implementation offload mode
Use only when work is isolated and easy to verify.

Requirements:
1. Create a separate branch or worktree.
2. Give Gemini a narrow goal, explicit constraints, and done criteria.
3. Require tests/analyze.
4. Bring the diff back to Claude for inspection.
5. Run Gemini review again after Claude modifies or accepts the code.

### Large-context review mode
Prepare a concise dossier first:
- Goal
- Relevant files
- Requirements/design excerpts
- Current diff
- Known risks

Ask Gemini for findings, not a rewrite, unless using a worktree.

## Output Contract

Ask Gemini to return:
- `BLOCKERS`: must fix before merge.
- `WARNINGS`: should fix or document.
- `NITS`: optional improvements.
- `QUESTIONS`: ambiguity requiring user/Claude decision.

If Gemini flags issues, fix or explicitly document why a finding is not applicable, then re-run the relevant review.
