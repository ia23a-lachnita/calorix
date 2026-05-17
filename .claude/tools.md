# Calorix Tool and MCP Catalog

Use the smallest tool that answers the question. Keep large logs, search results, docs, and command output out of the main conversation whenever possible.

## Built-in Tool Policy

| Tool | Use |
|---|---|
| `Read` | Inspect a specific file before editing. |
| `Edit` / `MultiEdit` | Targeted file changes. |
| `Write` | New files only, or full replacement after plan approval. |
| `Grep` / `Glob` / `LS` | Specific lookup and file discovery. |
| `Bash` / `PowerShell` | Short commands: git, mkdir, mv, FVM commands, tool invocations. |
| `TodoWrite` | Multi-step implementation tracking. |
| `Agent` | Delegate isolated research/review/implementation to project subagents. |

Do not use raw `WebFetch` or broad shell commands for documentation when Context7/Firebase docs/Gemini/Codex/context-mode can do it with less context pollution.

## FVM Command Standard

Run from the project root so FVM can see `.fvmrc` / `.fvm`:

```bash
fvm flutter doctor
fvm flutter pub get
fvm flutter analyze
fvm flutter test
fvm flutter run
fvm dart --version
```

Never use plain `flutter` or `dart` in project work unless diagnosing global SDK setup.

## MCP / Plugin Roles

| Toolset | Role | Use when | Notes |
|---|---|---|---|
| Context7 | Current library docs | Flutter, Dart, Firebase, Riverpod, GoRouter, package API questions | Prefer over model memory. |
| context-mode | Context-saving command/research sandbox | Output >20 lines, combined command+search, large logs | Summaries enter context, not raw logs. |
| claude-context | Semantic codebase search | Cross-file code discovery, architecture mapping | Use before grep storms. |
| claude-mem | Session memory recall | Prior decisions, previous debugging, recurring preferences | Search first, fetch full only after filtering. |
| Firebase MCP/plugin | Firebase project operations | Environment, SDK config, Firestore/Storage rules, Auth, Functions, Hosting | Always verify environment before deploy. |
| gcloud MCP | Google Cloud operations | IAM/logs/buckets/Cloud Run/GCP infra | Least privilege; no destructive ops without explicit approval. |
| Official Dart/Flutter MCP | Dart/Flutter tooling | Runtime errors, symbols, pub, analyze/test, app introspection | Use FVM-wrapped server. |
| Arenukvern `mcp_flutter` | Closed-loop Flutter runtime feedback | Screenshots, semantic snapshots, taps, logs, hot reload | Useful for visual QA and interaction testing. |
| Gemini CLI MCP / Gemini CLI | Independent review/offload | Plan review, diff review, architecture critique, large-context code review | Treat as reviewer by default. |
| Codex CLI | Independent worker/reviewer | Tests, refactors, security review, implementation alternatives | Use sandbox/worktree; inspect output. |
| Superpowers | Engineering workflow | Brainstorm, plan, debug, TDD, review | Invoke before action when relevant. |
| token-optimizer | Context health | Before/after long sessions, compaction risk, wasted context | Advisory, not a build dependency. |
| caveman | Token-minimal internal phrasing | Dense internal notes only | Do not use for user-facing docs. |

## Recommended MCP Setup

### Claude Code — project Dart/Flutter MCP through FVM

```bash
claude mcp add --transport stdio dart -- fvm dart mcp-server
```

Why: `fvm dart mcp-server` uses the Dart bundled with the Flutter SDK pinned by this project. Plain `dart mcp-server` uses whatever `dart` is first on PATH.

### Codex CLI — project Dart/Flutter MCP through FVM

```bash
codex mcp add dart -- fvm dart mcp-server --force-roots-fallback
```

### Gemini CLI — project Dart/Flutter MCP through FVM

Create or edit `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "dart": {
      "command": "fvm",
      "args": ["dart", "mcp-server"]
    }
  }
}
```

### Firebase MCP

Preferred Claude setup:

```bash
claude plugin marketplace add firebase/firebase-tools
claude plugin install firebase@firebase
claude plugin marketplace list
```

Manual fallback:

```bash
claude mcp add firebase npx -- -y firebase-tools@latest mcp
```

Gemini CLI Firebase extension:

```bash
gemini extensions install https://github.com/firebase/agent-skills/
```

### gcloud MCP

Gemini CLI extension:

```bash
npx @google-cloud/gcloud-mcp init --agent=gemini-cli
gemini mcp list
```

Generic MCP config:

```json
{
  "gcloud": {
    "command": "npx",
    "args": ["-y", "@google-cloud/gcloud-mcp"]
  }
}
```

### mcp_flutter Runtime Toolkit

Use toolkit setup, then run the app through FVM:

```bash
flutter-mcp-toolkit codegen-init
flutter-mcp-toolkit init claude-code
fvm flutter pub get
fvm flutter run --debug
```

Use `fvm flutter run --debug`, not plain `flutter run --debug`.

## Firebase/GCP Safety Gates

Before deploy or mutation:
1. Confirm active Firebase project/environment.
2. Read current Firestore/Storage rules before editing.
3. Run emulator/local tests where applicable.
4. Run security review for auth/rules/user data.
5. Ask explicit confirmation for destructive operations or deploys.

## External Docs Policy

- Use Context7 for libraries and SDKs.
- Use Firebase developerknowledge search for Firebase-specific how-to questions.
- Use official docs before third-party blogs.
- Cite/record docs used in plan notes when the change depends on current API behavior.
