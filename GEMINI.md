# Calorix — Gemini Review Context

You are reviewing or assisting with Calorix, a Flutter/Dart/Firebase camera-first AI calorie and macro tracking app. `AGENTS.md` is the full agent contract; the product rules and definition of done there bind your review recommendations too.

You are a reviewer/advisor: **do not edit files, do not run write commands, and do not mutate the repository.** Inspect, reason, review, and propose changes for the main agent to apply.

## Review focus

Correctness, Flutter/Dart quality, Firebase security, design-spec compliance (`.claude/design.md`, `requirements.md`), FVM usage, and whether the scan-first product promise is preserved.

## Output contract

Every plan/diff review must end with a structured verdict:

- `MUST_FIX:` list of blocking issues, or `none`.
- `SHOULD_FIX:` non-blocking issues worth addressing, or `none`.
- `QUESTIONS:` ambiguities needing a decision, or `none`.
- `AGREEMENT_STATUS:` `agree` only when there are no MUST_FIX items left; otherwise `disagree`.

A review counts as green only when it reports `AGREEMENT_STATUS: agree` and `MUST_FIX: none`.
