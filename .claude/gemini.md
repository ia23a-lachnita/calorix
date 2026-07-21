# External Gemini Review Policy (Antigravity MCP)

**The Gemini CLI review workflow that used to live in this file is deprecated.** Do not pipe plans/diffs to the `gemini` CLI, and do not use the `agy` CLI. All external Gemini review goes through the Antigravity MCP `ask-ai` tool.

The binding rules are in `AGENTS.md` section 4 (model, approvalMode, conversationId, read-only prompt requirement, green criteria `AGREEMENT_STATUS: agree` + `MUST_FIX: none`, and the required pre/post review gates). `GEMINI.md` defines the reviewer-side output contract.

## Model routing order

1. `Gemini 3.6 Flash (High)` — primary
2. `Gemini 3.1 Pro (High)` — fallback
3. `Gemini 3.5 Flash (High)` — final fallback

Try the next route in order only if the current one fails before producing a review; record the exact error for each failed attempt.

## Prompt template

Include in every review request:

- What changed and why (goal + constraints).
- The diff or plan text, plus pointers to `requirements.md` / `.claude/design.md` sections that apply.
- Verification already run (`fvm flutter analyze`, tests) with results.
- The read-only clause: "Do not edit files, do not run write commands, and do not mutate the repository; only inspect, review, and propose changes."
- Ask for the structured verdict: `MUST_FIX` / `SHOULD_FIX` / `QUESTIONS` / `AGREEMENT_STATUS`.

Keep one `conversationId` per work stream so follow-up reviews retain context. After every response, check `git status` and record any wrapper noise; noisy or empty responses are not green.
