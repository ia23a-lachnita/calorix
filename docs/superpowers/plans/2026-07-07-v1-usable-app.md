# V1 Usable App Plan — UI parity, backend hardening, testing architecture

Date: 2026-07-07
Status: stages 1–5 executed and verified (2026-07-08); stages 6–10 pending

Progress (2026-07-08): plan reviewed green and committed (911971f); functions ported to tested TypeScript (a09dca4); data model migrated to owner subcollections with client-owned `date` keys, idempotent re-summation aggregation, review gating, rules+indexes rewrite with emulator rules tests (d17574f); loading/login onboarding with auth-driven routing (6b85b0e); history ordering + overflow fixes (9255936). Deployed to `calorix-xurschnell` (rules, indexes, `processEntry`, `aggregateDailyLogs`; old `processFood` deleted; `model_configs/default` seeded with verified-live `gemini-2.5-flash`). Live device verification: fresh-install loading→login→guest→scan flow, camera+notification permissions, reseed deep link, real photo scan end-to-end (Vertex analysis, FCM push, exact dailyLog recompute 845+590=1435), History rendering from server aggregates. Post-implementation review green. Suites: 61 Flutter tests, 25 functions unit tests, 12 rules tests, analyze clean. Follow-ups noted: `@google-cloud/vertexai` SDK is past its announced removal date — migrate functions to `@google/genai`; orphaned legacy top-level `entries`/`dailyLogs` docs remain in Firestore (dev data, safe to purge later); `.firebaserc` stays local-only (repo gitignores it).
Scope: make the app feel and work like an almost-done first version: every design-handoff screen implemented, backend correct and trustworthy, testing architecture in place.

## 1. Inputs and precedence

1. `requirements.md` — product vision (camera-first, <5s logging, cloud processing + push, CRUD everywhere). Top source of truth per `AGENTS.md`.
2. `docs/design-handoff/placeholder-app/` — 19-screen Claude-design handoff. JSX in `src/` is ground truth for UI; reference PNGs are visual aid. UI must match 1:1.
3. `C:\Users\xursc\Downloads\deep-research-report.md` — external research for the V1 backend/product (Flutter + Firebase + GCloud plan). Treated as strong input, **not** blindly trusted; every recommendation below is explicitly adopted, adapted, deferred, or rejected with a reason.

Where the report contradicts requirements.md or the handoff mockups, requirements.md + handoff win (the user owns product direction; the report is advisory).

## 2. Current-state assessment

### What exists and is good
- Flutter app with 5-tab shell (Today · History · Scan · Goals · AI), scan → processing → today flow, food detail sheet with edit mode (`_isEditMode`), history week/month, goals with period pill, AI chat, profile sheet.
- Today screen has been through multiple ui-diff parity rounds; do not regress it.
- Design tokens/fonts (Geist, GeistMono) are in place; theme system exists.
- Debug reseed deep link (`calorix://debug/reseed`) powers the ui-diff pipeline; must keep working.
- Anonymous auth + Google account linking exists.
- One deployed Cloud Function (`processFood`, JS, Firestore trigger) does Vertex AI meal analysis + FCM push — proves billing/Blaze is active on `calorix-xurschnell`.

### Gaps vs the 19-screen handoff
| Handoff screen | Current state | Action |
|---|---|---|
| loading | missing | build |
| login | missing (auto anonymous sign-in only) | build |
| permission | missing | build |
| scan_idle / scan_capturing | exists (`scan_screen.dart`) | align to JSX |
| processing | exists | align to JSX |
| review (<80% confidence) | **missing** | build |
| manual (search fallback) | **missing** | build |
| today / today_empty | exists, parity-tuned | leave; verify only |
| food / food_edit | exists incl. edit mode | align to JSX |
| history_week / history_month | exists | align to JSX |
| goals / goals_select | exists; select state unverified | align/build select |
| ai | exists | align to JSX |
| ai_history | **missing** | build |
| profile | exists (sheet) | align to JSX |

### Backend defects found (must fix)
1. **Security hole:** `firestore.rules` — `match /entries/{entryId} { allow list: if request.auth != null; }` lets any authenticated user query *all* users' entries. |
2. **Aggregation desync:** `dailyLogs` is incremented only by `processFood`. Client edits/deletes/duplicates of entries never update it, so History month totals drift from reality. Today computes client-side from entries, so the bug is invisible until History is inspected.
2b. **Timezone misfiling:** `processFood` derives the daily-log key from `toISOString()` (UTC) while the client buckets days by device-local midnight. Any entry logged when local date ≠ UTC date lands in the wrong `dailyLogs` document.
3. **No review gating:** `processFood` increments `dailyLogs` and pushes "finished" regardless of confidence. The handoff's review branch (<80% → review screen) has no backend semantics; report's "never auto-log uncertain results" is violated.
4. **Hardcoded retired-generation model:** `gemini-2.5-flash` in functions, `gemini-2.5-pro/flash` in the client. Report (correctly) warns Gemini generations retire; model names must be server-side config.
5. **Client-side Gemini API key:** AI chat uses `String.fromEnvironment('GEMINI_API_KEY')` — the key ships inside the APK and is extractable. Chat must move server-side (Vertex AI via service account, no key at all).
6. **JS, untyped, untested functions:** single `index.js`, no tests, no emulator config, `fetch(imageUrl)` instead of Admin SDK storage read (relies on public token URLs).
7. **Barcode/label modes are UI-only:** `ScanMode.barcode/label` exist but everything goes down the same meal-photo path; no product lookup, no OFF/USDA integration.
8. `.firebaserc` has no default project (CLI works because of global login; repo config should pin `calorix-xurschnell`).

### Testing gaps
- Flutter: 7 test files (shell, reseed, history, today ×2, ui-diff anchor, smoke). No tests for scan, processing, goals, AI, food detail, auth.
- Functions: zero tests, no emulator harness.
- Rules: zero tests (the `list` hole would have been caught).

## 3. Decision log (research report triage)

### Adopted
- **TypeScript Cloud Functions v2** for all backend code (report §Technical architecture). Node 20+, `firebase-functions` v2 API.
- **Server-side model config**: `model_configs/default` Firestore doc (`visionModel`, `chatModel`, `confidenceThreshold`, prompt version), read by functions with short in-memory TTL cache. No model names in app or function code. Rules **deny all client access** to `model_configs/*` (functions read via Admin SDK, which bypasses rules; clients have no reason to see it). (Report suggests Remote Config; a server-owned Firestore doc is equally remote-changeable, one fewer SDK, and readable by rules-locked admin tooling. Adapted, same intent.)
- **Review gating**: `confidence >= threshold` → status `complete`, aggregates update, push "finished your meal scan". Below → status `needs_review`, **no aggregate contribution**, push "scan ready to review", opens review screen. Matches handoff flow map exactly.
- **Aggregation consistency (idempotent re-summation)**: a Firestore trigger on entry writes recomputes the **absolute totals** of every affected `dateKey` by querying all `complete` entries for that user+day and writing the sum — never blind `FieldValue.increment` deltas. Firestore triggers are at-least-once, so increments double-count on retries; re-summation is idempotent by construction, self-heals drift, and tolerates out-of-order events. When an edit changes an entry's `dateKey`, **both** the old and new day are recomputed. Per-day entry counts are small (<50), so the extra read cost is negligible. Fixes defects 2/2b for every CRUD path.
- **Client-owned `dateKey`**: every entry stores `dateKey: 'YYYY-MM-DD'` computed client-side from the device-local timezone at logging time (rules-validated format). Queries (Today/History day) and aggregation key on `dateKey`, replacing timestamp-range queries and eliminating the UTC-vs-local mismatch — the server never re-derives the user's calendar day. Derived-data contract: Today keeps streaming entries directly (real-time UX); History month reads `dailyLogs`; both derive from the same entries via the same `dateKey`, so they cannot disagree at rest.
- **Barcode path with Open Food Facts**: on-device ML Kit barcode detection in barcode mode → `lookupProductByBarcode` callable → `barcode_index`/`catalog_products` Firestore cache → OFF v2 API on miss → normalized product + confidence + reasons. OFF never blindly trusted: missing/implausible nutriments → lower confidence → review path. **Cache-poisoning guard:** clients have zero write (and zero direct read) access to `barcode_index`/`catalog_products`; only the callable (Admin SDK) reads/populates them, and rules deny all client access.
- **Manual search backed by `searchFoodCatalog` callable** (catalog cache + OFF search; USDA FDC added only if OFF coverage proves weak in practice — defer external dependency count).
- **Server-side AI chat**: `aiChat` callable using Vertex AI (service-account auth). Client key removed. V1 intents scoped: correct a scan, adjust amounts/targets, macro-fit questions — matching requirements.md's AI-with-confirmation-cards.
- **Label mode**: label photos run through the same trigger pipeline with a label-specific structured prompt (nutrition-panel extraction, per-100g/per-serving normalization). On-device OCR preview deferred (see Deferred).
- **Storage reads via Admin SDK** (bucket + path stored on entry), not URL fetch.
- **Rules rewrite + rules tests** (defect 1), owner-only everywhere, server-owned collections locked to Admin SDK.
- **Emulator-first backend development** with the Firebase Local Emulator Suite.
- **Trust UI**: result/review cards show source (Meal estimate / Barcode / Label), confidence band, and reason chips — the handoff already renders confidence badges; we add source + reasons within the existing visual language. Entries in `needs_review` are visibly excluded from daily totals (amber badge per handoff) until confirmed; processing/skeleton states already cover the recompute window.

### Adapted (report says X, we do a leaner X with the same goal)
- **Cloud Run split → Functions v2 only for V1.** Report recommends callable Functions + separate Cloud Run services for heavy analysis. Functions v2 *are* Cloud Run under the hood; at V1 scale a 1GiB/300s function covers label/meal analysis without a second deploy target, custom App Check verification middleware, or container CI. The split is documented as the V2 growth path (trigger: sustained >30s p95 analysis or need for custom containers). This is the report's own effort-to-value logic applied to its architecture.
- **Data model**: report wants `users/{uid}/foodLogs`. We migrate `entries` → `users/{uid}/entries` and `dailyLogs` → `users/{uid}/dailyLogs/{dateKey}` (owner-only by construction, kills the cross-user list hole structurally, and subcollection queries drop the `uid` field filter). `catalog_products/{productId}` + `barcode_index/{barcode}` added as server-owned top-level collections per report. Repos, seed service, functions, rules, and indexes updated together; reseed keeps producing the exact Today fixture the ui-diff gates expect.
- **App Check**: adopt in **monitoring mode** in V1 (register app, debug provider for dev/adb builds so the ui-diff pipeline keeps working), enforce after real distribution exists. Enforcing now would break the automated capture pipeline for zero abuse-risk reduction (no public users yet). **Enforcement milestone:** flip to enforced before any public distribution (store listing or external testers), not on a calendar date.
- **Single Firebase project until launch**: `calorix-xurschnell` serves dev + device testing. A separate staging project (reviewer suggestion) is recorded as a **pre-launch requirement** — it becomes mandatory the moment real user data exists in production, and is deliberately not created now (no users, and it would double every deploy/config step during the build-out phase).

### Deferred (documented, intentionally not V1)
- Package-front product matching (`matchProductFromPackage`) — report marks Should; needs catalog breadth we don't have yet.
- USDA FDC integration — added when OFF generic-food coverage measurably fails; avoids two external APIs on day one.
- On-device OCR preview (ML Kit text recognition) for label mode — cloud parse is the V1 path; preview is a latency optimization.
- Cloud Tasks async job queue — processing is already async via Firestore trigger + FCM; a queue adds nothing at V1 scale.
- Commercial data providers, depth/LiDAR portioning, recipe builder, wearables — per report's own exclusion list.
- Apple sign-in — button rendered per mockup but disabled with a "coming soon" affordance (requires Apple developer account + iOS build pipeline; Android is the active target). Recorded for the user.

### Rejected (report conflicts with owned product direction)
- **Scanner mode reorder to `Auto | Product | Label | Meal`** — the handoff mockups and requirements.md define Meal/Barcode/Label with meal-first camera identity. Keeping mockup order; the report's reordering is recorded as a product decision for the user, not silently applied.
- **De-emphasizing "processing in cloud / you can close the app"** — that copy is a core requirements.md behavior (close app, get push). Keeping the mockup processing screen as designed.
- **Light theme as default** — handoff ships both themes with equal fidelity; default stays as currently shipped. User decision, not build-time.

## 4. Target backend architecture

```
Flutter app
  ├─ on-device: ML Kit barcode detect (barcode mode)
  ├─ Storage upload: scans/{uid}/{entryId}.jpg  (+ storagePath on entry doc)
  ├─ Firestore (client writes, owner-only rules):
  │    users/{uid}                     profile, fcmToken, settings
  │    users/{uid}/entries/{entryId}   diary entries (status: pending|processing|complete|needs_review|error)
  │    users/{uid}/targets/…           macro targets (existing)
  │    users/{uid}/weightLogs/…        (existing)
  │    users/{uid}/dailyLogs/{dateKey} server-maintained aggregates (client read-only)
  └─ callables (TS, v2): lookupProductByBarcode · searchFoodCatalog · aiChat

Functions (TypeScript, us-central1)
  ├─ onEntryWritten  (users/{uid}/entries/*): status transitions → analysis dispatch;
  │                   idempotent re-summation of affected dateKey(s) into dailyLogs
  │                   (absolute totals from all status=complete entries; old+new day on dateKey change)
  ├─ analyzeEntry    meal|label analysis via Vertex AI structured output; model from model_configs;
  │                   confidence >= threshold → complete, else needs_review; FCM push per outcome
  ├─ lookupProductByBarcode: barcode_index → catalog_products cache → OFF v2 → normalize+cache
  ├─ searchFoodCatalog: catalog cache + OFF search
  └─ aiChat: Vertex AI chat, scoped intents, confirmation-card contract

Server-owned (Admin SDK only): catalog_products/{productId}, barcode_index/{barcode}, model_configs/{id}
```

Region stays `us-central1` (existing function + data). Project `calorix-xurschnell` pinned in `.firebaserc`. Deploys only after emulator tests pass; live deploy is required for device end-to-end testing and is authorized for this work stream (Blaze already active — verified by the existing deployed function; if a deploy hits a plan/billing wall, stop and report exactly, user changes tier in the web console).

## 5. UI implementation plan

Ground truth: JSX in `docs/design-handoff/placeholder-app/src/`, tokens in `flutter/design_tokens.dart`, rules in handoff README (exact values, no Material defaults, 0.5px hairlines, gradient once per screen, GeistMono tabular numerals, motion specs).

Build order (per handoff README, adjusted for dependencies):
1. **Token/theme audit** — diff `flutter/design_tokens.dart` against current `app_colors/app_text_styles/app_theme`; reconcile without regressing Today.
2. **Onboarding**: loading (staged splash) → login (email/password + Google + guest + disabled Apple) → permission (camera-denied overlay + manual fallback card). Router: app start → loading while auth resolves → login if signed out → scan. Guest = anonymous auth (preserves current behavior).
3. **Review screen** — photo hero + bottom sheet, candidate radio list, None-of-these / Confirm, Ask-AI hook; wired to `needs_review` entries (from push tap and processing screen).
4. **Manual screen** — search field, filter chips, result rows with `+`, dashed create-custom-food; backed by `searchFoodCatalog`; reachable from scan (Library/Recent) and permission fallback.
5. **ai_history** — past threads list; requires chat threads persisted under `users/{uid}/aiThreads/*` (new, small).
6. **goals_select** — period picker open-state on goals screen.
7. **Alignment passes** on scan, processing, food/food_edit, history, goals, ai, profile against JSX.
8. **Barcode mode UX** — reticle + on-device detect → product card (source: Barcode) → amount selector → log.

Verification per screen: build → run on device/emulator → screenshot → **vision comparison against `reference-images/<screen>--dark/light.png` + JSX values** (per user instruction: no ui-diff MCP run per screen; it is slow/token-heavy). One optional final ui-diff calorix release run at the very end as an independent gate on Today only.

## 6. Testing architecture

| Layer | Tooling | What gets covered |
|---|---|---|
| Flutter unit | `fvm flutter test` | providers (scan routing, review gating client logic, auth flows with fakes, barcode provider with fake callable), models, repositories against `fake_cloud_firestore` or emulator |
| Flutter widget | `fvm flutter test` | each new screen: renders in dark+light, key interactions (login validation, review confirm, manual search states); existing today/history/shell tests preserved |
| Functions unit | `vitest` in `functions/` | analysis orchestration with mocked Vertex/OFF, delta aggregation math, OFF normalization + plausibility checks, confidence banding, push payloads |
| Rules | `@firebase/rules-unit-testing` against emulator | owner-only entries/dailyLogs/targets/weightLogs; regression for the cross-user `list` hole; server-owned collections locked |
| Backend integration | `firebase emulators:exec` script | entry lifecycle: create pending → trigger → complete/needs_review → aggregate correctness across create/edit/delete/confirm |
| App integration | existing `integration_test/` + adb smoke | reseed deep link unchanged; scan→processing→today happy path on device |
| Static | `fvm flutter analyze`, `tsc --noEmit`, eslint in functions | zero-warning gate |

Command surface: `fvm flutter analyze && fvm flutter test`; `cd functions && npm test`; `npm run test:integration` (emulator-wrapped). CI (GitHub Actions) is a follow-up, documented not built.

## 7. Staged delivery (each stage: implement → verify → commit → push)

| # | Stage | Verification gate |
|---|---|---|
| 1 | This plan + Antigravity review | review green (`AGREEMENT_STATUS: agree`, `MUST_FIX: none`) |
| 2 | Functions TS migration + emulator + vitest harness (behavior-identical port of processFood) | functions unit tests green, emulator run green |
| 3 | Data-model migration (subcollections) + rules rewrite + rules tests + repo/seed updates | rules tests green, flutter tests green, reseed produces identical Today fixture |
| 4 | Review gating + delta aggregation + model_configs + storage-path reads + push variants | functions tests green, emulator lifecycle test green |
| 5 | Onboarding UI (loading/login/permission) + auth flows | widget tests green, vision check vs reference images |
| 6 | Review + manual screens + needs_review wiring end-to-end | widget tests + emulator lifecycle green, vision check |
| 7 | Barcode: ML Kit + lookupProductByBarcode + OFF cache | functions tests green, live barcode smoke on device |
| 8 | aiChat server-side + ai/ai_history UI + thread persistence | tests green, vision check |
| 9 | goals_select + alignment passes (scan/processing/food/history/goals/profile) | vision checks, no Today regression |
| 10 | Deploy, device end-to-end pass, full test suite, final report | all suites green, manual flow walkthrough, optional single ui-diff Today gate |

Stages 2–4 are backend-first on purpose: UI screens in 5–8 need the new semantics (needs_review, product lookup, threads) to be *usable*, not mocked — per the no-shortcut rule.

## 8. Risks and user callouts

- **Blaze/billing**: assumed active (existing deployed function). If any deploy/API enablement fails on plan limits, work stops with the exact error for the user to change tier in the console.
- **Apple sign-in** deferred (needs Apple dev account); button present but disabled per mockup fidelity.
- **App Check enforcement** deferred to post-distribution; monitoring mode only, debug provider keeps adb/ui-diff automation alive.
- **Vertex model choice** verified at implementation time against what `calorix-xurschnell` can actually serve; config-driven so retirements are a config edit, not a release.
- **OFF data quality**: treated as untrusted input (plausibility checks + confidence penalties), per its own docs.
- **Scanner mode order / processing copy**: report recommendations recorded but not applied (see Rejected) — flag to user for a product decision post-V1.
