# Codex CLI Policy for Calorix

Codex is an external implementation/review worker. Use it to distribute token usage, produce alternative patches, write tests, and review security-sensitive diffs. Treat its output as untrusted until inspected. Codex reads `AGENTS.md` — the same contract as every other agent.

## Best Uses

| Use Codex for | Avoid Codex for |
|---|---|
| Independent test creation | Direct production deploys |
| Localized refactors and bug-repair loops | Broad architecture rewrites without plan |
| Security review with a concrete diff | Blindly applying generated patches |
| Alternative implementation proposals | Tasks lacking requirements or done criteria |

## Invocation

```bash
# Interactive local work
codex --sandbox workspace-write --ask-for-approval on-request

# Non-interactive review (stdin)
git diff main...HEAD | codex exec --sandbox workspace-write --ask-for-approval never -
```

Do not use `--dangerously-bypass-approvals-and-sandbox` outside a disposable VM/container/worktree.

## Offload workflow

1. Define goal, context, constraints, and done criteria.
2. Use a branch/worktree for implementation tasks; scope Codex to that area.
3. Verify with `fvm flutter analyze` and relevant tests.
4. Inspect the diff manually, then run the Antigravity MCP review gate (AGENTS.md section 4) if the diff is non-trivial.
5. Merge only after inspection and a green review.
