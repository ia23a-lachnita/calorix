# Codex CLI Policy for Calorix

Codex is an external implementation/review worker. Use it to distribute token usage, produce alternative patches, write tests, and review security-sensitive diffs. Treat its output as untrusted until inspected.

## Best Uses

| Use Codex for | Avoid Codex for |
|---|---|
| Independent test creation | Direct production deploys |
| Localized refactors | Broad architecture rewrites without plan |
| Bug reproduction and repair loops | Firebase/GCP destructive operations |
| Security review with concrete diff | Blindly applying generated patches |
| Alternative implementation proposal | Tasks lacking requirements or done criteria |
| Non-interactive review summaries | Editing secrets/config outside workspace |

## Instructions Files

Codex reads `AGENTS.md`; keep it concise and aligned with `CLAUDE.md`. This pack includes a root `AGENTS.md` for Codex and a `.codex/config.toml` starter.

## Safe Invocation Patterns

Interactive local work:

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

Non-interactive review:

```bash
git diff main...HEAD | codex exec --sandbox workspace-write --ask-for-approval never -
```

Non-interactive task with prompt from stdin:

```bash
cat .claude/prompts/codex-review.md | codex exec --sandbox workspace-write --ask-for-approval never -
```

Do not use `--dangerously-bypass-approvals-and-sandbox` except inside a disposable VM/container/worktree created for that purpose.

## Offload Workflow

1. Define goal, context, constraints, and done criteria.
2. Use a branch/worktree for implementation tasks.
3. Ask Codex to plan first for complex tasks.
4. Let Codex modify only the scoped area.
5. Run `fvm flutter analyze` and relevant tests.
6. Inspect Codex diff manually.
7. Run Gemini review if the diff is non-trivial.
8. Merge only after Claude/user accepts the patch.

## Suggested Codex Task Prompts

### Review

```text
You are reviewing Calorix, a Flutter/Firebase camera-first calorie tracker. Read AGENTS.md and the diff. Return BLOCKERS, WARNINGS, NITS, and TEST GAPS. Do not edit files.
```

### Tests

```text
Read AGENTS.md. Add focused tests for the described behavior without changing production behavior. Use FVM commands. Keep the diff minimal and explain how to run verification.
```

### Security

```text
Read AGENTS.md and review this Firebase/Auth/Firestore-related diff. Build a threat model, identify vulnerabilities, validate findings against the code, and propose minimal fixes. Do not deploy anything.
```
