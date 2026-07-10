# Calorix Fable Session Review

Date: 2026-07-10  
Scope: code-review evidence for changes `911971f..72ee550`, the V1 plan, Firebase rules/functions, Flutter flows, reference-image moves, and existing untracked workspace artifacts. This is not an independently verified cloud-state audit. Gemini and user review come first; no detailed implementation plan is included.

## Verification Level

- Exhaustive programmatic review of the cited changed source and plan/diff metadata.
- Sampled visual review against available handoff/screenshots, not an exhaustive screen-by-screen parity pass.
- Fresh verification passed: `fvm flutter analyze` exit 0 with no issues; 76 Flutter tests, 32 functions tests, and 12 rules tests passed.
- Preserve existing untracked artifacts. Cloud/deploy state is not independently verified here.

## Findings

### P1

1. **Storage path and image URL are forgeable trust boundaries.** Rules do not constrain `storagePath` or `imageUrl`. The function uses Admin Storage for any supplied path and falls back to `fetch(data.imageUrl)` (`functions/src/index.ts:46-76`), enabling cross-user Admin Storage reads through a forged path and SSRF through an arbitrary URL.
2. **Retry status is allowed but processing is create-only.** Rules permit `error -> pending` (`firestore.rules:41-51`), while `processEntry` uses `onDocumentCreated` (`functions/src/index.ts:33-40`). A retry update has no matching analysis dispatch and can remain pending.
3. **Low-confidence save does not necessarily complete review.** The repository has a distinct `confirmReview`, but ordinary editing saves fields and `corrected` without changing status (`lib/shared/repositories/food_entry_repository.dart:45-55`). A `needs_review` entry can remain there after a save.
4. **Serving edits can double-scale nutrition.** The detail UI multiplies displayed macros by the pending multiplier (`lib/features/food_detail/food_detail_sheet.dart:73-80`), saves the multiplier with editable base fields, and aggregation multiplies stored values again (`functions/src/aggregation.ts:46`).
5. **Goals are not reliably persisted and the macro provider can be stale/global.** The screen contains static coaching anchors (`lib/features/goals/goals_screen.dart:11-13`), while the active-plan path falls back to a default plan without establishing durable goal-selection semantics.
6. **`needs_review` can hang in Processing.** The processing flow does not establish a terminal review route for a low-confidence result, so the backend status can be `needs_review` while the user remains in the processing experience.
7. **AI meal context is discarded and chat is not auth-scoped.** The callable accepts plan, consumed totals, and client-supplied history but no meal/entry context (`functions/src/ai-chat.ts:11-27`); the client stores messages in a process-global `StateNotifier` (`lib/features/ai_chat/providers/ai_chat_providers.dart:52-104`) rather than authenticated per-user threads.
8. **The active Today expected reference is missing.** Commit `86b4858` R100-renamed `reference-images` to `reference-images-buggy` and added six unrelated good screenshots, so the expected Today source path used by the plan/report is absent.

### P2

9. `servingMultiplier` is not rules-validated; target and weight schemas are too permissive; anonymous model/storage cost controls are absent.
10. Scan library failure and camera lifecycle/permission failure paths are weak; History lacks the expected drilldown; the notification toggle is not a complete persisted control.
11. Goals displays fabricated/static TDEE, BMR, and `80kg` anchors rather than values derived from a validated profile and plan.
12. Concurrent chat sends are not guarded, so overlapping requests can reorder or duplicate visible turns.
13. The ui-diff capture path does not force the intended dark theme; reseed failures lack a terminal signal; the light-theme system-bar icon treatment can mismatch the surface.
14. Plan/docs claims, test counts, integration command names, project pin, and deploy evidence remain stale or non-reproducible beside the later partial implementation.

## Remediation Order

1. Close storage/URL trust boundaries and status-transition/retry correctness, including a terminal `needs_review` path.
2. Make nutrition scaling, review confirmation, goals persistence, and authenticated chat context consistent.
3. Restore a canonical Today reference, then verify camera, library, notification, history, theme, reseed, and concurrency paths.
4. Refresh reproducible deploy documentation after fresh cloud/deploy evidence exists.

## Disposition

These are code-review findings from the cited range, not independently verified cloud state. The fresh local suites pass, but that does not clear the release blockers or establish production readiness.

## External Review

Antigravity MCP conversation `ui-diff-calorix-post-fable-audit-2026-07-10`, using `gemini-3.1-pro-preview`, corroborated all production blockers and rejected none. Follow-up audit-document verdict: `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`, `PRODUCTION_BLOCKERS_RECORDED: yes`. Response noise: the first review glued the final `MUST_FIX` item to the `SHOULD_FIX` header; the follow-up was clean.
