# Install Calorix Agent Instructions v2

Copy these files into the Calorix repository root.

```text
CLAUDE.md
AGENTS.md
GEMINI.md
.mcp.json
.claude/
.gemini/
.codex/
docs/mockups/
```

Then from the project root:

```bash
# Confirm FVM uses the project-pinned SDK
fvm dart --version
fvm flutter doctor

# Claude Code Dart/Flutter MCP through FVM
claude mcp add --transport stdio dart -- fvm dart mcp-server

# Firebase plugin/MCP
claude plugin marketplace add firebase/firebase-tools
claude plugin install firebase@firebase

# Optional manual Firebase MCP fallback
claude mcp add firebase npx -- -y firebase-tools@latest mcp

# Gemini CLI model and MCP checks
gemini
/model
/mcp

# Codex Dart MCP through FVM
codex mcp add dart -- fvm dart mcp-server --force-roots-fallback
```

For `mcp_flutter`:

```bash
flutter-mcp-toolkit codegen-init
flutter-mcp-toolkit init claude-code
fvm flutter pub get
fvm flutter run --debug
```

Restart Claude Code after adding or editing `.claude/agents/*.md` so subagent definitions reload.
