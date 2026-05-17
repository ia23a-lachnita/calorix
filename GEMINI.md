# GEMINI.md — Calorix Review Context

You are reviewing or assisting with Calorix, a Flutter/Dart/Firebase camera-first AI calorie and macro tracking app.

## Mission

Calorix should feel premium, serious, smooth, modern, fitness-focused, and minimal. The core UX is extremely fast: open app, camera is ready, capture food, close app, cloud processing finishes, push notification returns user to estimated calories/macros.

## Source of Truth

1. `requirements.md`
2. `docs/mockups/source-code/README.md`
3. `.claude/design.md`
4. `.claude/tools.md`, `.claude/gemini.md`, `.claude/codex.md`

## Hard Rules

- Default landing screen is Scan.
- Bottom nav order: Today · History · Scan · Goals · AI.
- Scan is centered and FAB-like.
- Use FVM for Flutter/Dart commands.
- Do not use pure white or pure black UI tokens.
- Food entries, meals, daily logs, goals, macro targets, and weight logs support CRUD.
- Firebase Auth only.
- Read Firestore/Storage rules before editing.
- Do not deploy or mutate production data without explicit confirmation.

## Review Output Format

When reviewing plans or diffs, return:

- `BLOCKERS`: must fix before merge.
- `WARNINGS`: should fix or justify.
- `NITS`: optional improvements.
- `TEST GAPS`: missing verification.
- `QUESTIONS`: ambiguity that needs a decision.

Focus on correctness, Flutter/Dart quality, Firebase security, design-spec compliance, FVM usage, and whether the scan-first product promise is preserved.
