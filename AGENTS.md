# AGENTS.md — Calorix

This file is for Codex and other coding agents. Claude Code should read `CLAUDE.md`; Gemini CLI should read `GEMINI.md`.

## Project

Calorix is a Flutter/Dart/Firebase app for fast camera-first AI calorie and macro tracking.

Core flow: open app → Scan screen is ready → capture food in under 5 seconds → cloud processing → push notification → Today/detail shows estimated calories, macros, detected foods, and confidence.

## Source of Truth

1. `requirements.md`
2. `docs/mockups/source-code/README.md`
3. `.claude/design.md`
4. `.claude/tools.md`, `.claude/gemini.md`, `.claude/codex.md`

Read relevant docs before changing behavior, UI, data, cloud logic, or tooling.

## Commands

Use FVM for project Flutter/Dart commands:

```bash
fvm flutter pub get
fvm flutter analyze
fvm flutter test
fvm flutter run
fvm dart --version
```

Do not use plain `flutter` or `dart` except to diagnose global setup.

## Product Rules

- Default landing screen is Scan.
- Bottom nav order is Today · History · Scan · Goals · AI.
- Scan is centered, larger, FAB-style, with blue→cyan→green gradient ring.
- No pure `#FFFFFF` or `#000000` UI tokens.
- Protein is blue `#3A5BFF`; carbs cyan `#19D3D9`; fat green `#1FCC74`.
- Low-confidence scans are amber and easy to correct.
- All food entries, meals, daily logs, goals, macro targets, and weight logs support CRUD.
- Firebase Auth only; no custom auth.
- Read current Firestore/Storage rules before changing them.

## Work Style

- Plan before multi-file or architecture changes.
- Keep diffs small and focused.
- Inspect existing files before editing.
- Add or update tests for logic changes.
- For UI changes, compare against the dark/light mockup images and `.claude/design.md`.
- Never deploy, delete cloud resources, or mutate production data without explicit confirmation.
- Do not commit secrets.

## Done When

- Implementation matches requirements and design docs.
- `fvm flutter analyze` passes or failures are documented.
- Relevant tests pass or missing tests are explained.
- UI changes have a visual/runtime verification path.
- Firebase/security changes include rules/environment review.
