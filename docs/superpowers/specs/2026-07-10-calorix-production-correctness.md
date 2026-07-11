# Calorix Production Correctness Design

**Date:** 2026-07-10

**Status:** Proposed follow-on design. No production code, migration, deploy, commit, or push is performed by this document.

## Purpose

Close the release blockers verified in `docs/audits/2026-07-10-fable-session-review.md` while preserving the camera-first product contract: a user captures once, cloud processing reaches an honest terminal state, and only a confirmed entry contributes to their own diary and macro totals.

This design supersedes only the blocker-remediation portion of the V1 plan. The V1 screen inventory and visual handoff remain authoritative for product and presentation decisions.

The active V1 execution plan remains [linked here](../plans/2026-07-07-v1-usable-app.md); this design and its [execution plan](../plans/2026-07-10-calorix-production-correctness.md) provide the blocker-remediation sequence without replacing the V1 product scope.

## Evidence And Risk Order

| Priority | Verified risk | Required outcome |
|---|---|---|
| P0 | A client-controlled `storagePath` can make Admin Storage read another user's object; a client-controlled `imageUrl` can make the function fetch arbitrary network targets. | Analysis reads one path derived by the server from `{uid, entryId}` and never fetches a client URL. |
| P0 | `error -> pending` is rules-legal but `onDocumentCreated` does not process the retry, and a crashed worker can leave an entry in `processing` forever. | Every accepted callable retry is atomically claimed exactly once; server-bounded recovery moves stale processing to a safe error; each attempt reaches `complete`, `needs_review`, or `error`. |
| P0 | Editing a `needs_review` entry can leave it excluded from totals forever. | The review save action confirms the reviewed version as `complete`; an explicit cancel/delete remains available. |
| P0 | Editable nutrition and `servingMultiplier` use ambiguous units and can be multiplied twice. | One-serving base nutrition is canonical; all displayed and aggregated totals equal base x multiplier exactly once. |
| P1 | Plans can fall back to process-local defaults; goal controls and chat can act on stale/global state. | Every authenticated user has one durable active plan; providers and chat threads are keyed by authenticated uid. |
| P1 | `needs_review` remains visually indistinguishable from processing. | Processing routes to Review, Complete, or Error; no terminal backend state is rendered as a spinner. |
| P1 | The active Today visual target does not exist at the documented source path. | The canonical reference directory is restored as an early independent evidence stage, with a recorded source revision and manifest before any cross-repository visual gate. |
| P2 | Camera/library failures, lifecycle recovery, notification preference, history drilldown, reseed, theme capture, and concurrent chat sends have weak or unverifiable behavior. | Each has a recoverable user path and a focused automated or device verification. |

## Scope And Non-Goals

In scope: Firestore and Storage trust boundaries, entry lifecycle/retry/review semantics, nutrition units, durable plans, authenticated persistent chat, processing routes, reference restoration, and the listed secondary UX defects.

Out of scope: new model providers, barcode catalog breadth, public App Check enforcement, a new profile/TDEE formula, or production deploy/data mutation. TDEE/BMR/weight values may not be invented to make the goals UI look populated; until a validated profile contract exists, the UI shows only persisted target-plan and weight-log data.

## Canonical Contracts

### Entry Image Ownership

For an entry at `users/{uid}/entries/{entryId}`, the only analysis object is:

```text
scans/{uid}/{entryId}.jpg
```

The function derives that value from the event parameters. It does not trust `storagePath`, `imageUrl`, a signed URL, or any client-provided bucket name when loading analysis bytes. It performs a bounded Admin Storage download from the configured default bucket, accepts JPEG content only, and maps missing/invalid objects to a safe terminal error code such as `image_unavailable`.

`storagePath` remains a read-compatible display hint during migration, but new client documents must either omit it or match the canonical value exactly. New writes do not carry `imageUrl`; Flutter resolves a download URL from the canonical path only when it needs to render the owner-readable image. Legacy `imageUrl` is read-only compatibility data and is never an analysis input.

Firestore rules use an allowlist of client-owned fields and enforce the canonical path if that legacy field is present. Storage rules continue owner-only access and add image MIME type and bounded-size validation. A function must not add a URL-fetch fallback for legacy records: an absent canonical object is an error requiring re-capture or retry after upload, not permission to make an outbound request.

### Entry State Machine

```text
new capture -> pending -> processing -> complete
                                   -> needs_review -> complete | deleted
                                   -> error -> pending (server retry claim) -> processing
processing -- server recovery after safety threshold --> error
```

`complete`, `needs_review`, and `error` are terminal from the analysis worker's perspective. `pending` and `processing` are nonterminal. Only a server-side retry callable can move `error` to `pending`. In one Firestore transaction, it re-reads the owned entry, requires the current state to be `error`, checks the server-defined retry cap and cooldown, increments `retryCount`, records `retryRequestedAt`, clears stale display-error fields, and transitions to `pending`. Direct client status edits are not a retry API, and no retry path invokes analysis inline.

Each bounded server recovery invocation examines at most `MAX_STUCK_RECOVERY_BATCH` entries. For a candidate older than the server-defined `PROCESSING_SAFETY_THRESHOLD_MS`, it uses a transaction to confirm that the document still exists, remains `processing`, and still has an expired `processingStartedAt`; it then writes terminal `error` with `errorCode: 'processing_timeout'` and `errorAt`. Recovery never transitions directly to `pending`, never exceeds its batch limit, and therefore preserves the callable-only retry policy. A worker that eventually returns after recovery is stale and cannot overwrite that error.

An `onDocumentWritten` dispatcher observes only eligible `missing -> pending` and callable-authored `error -> pending` transitions. Before analysis it uses a Firestore transaction to claim the entry only when it still exists and its current state is `pending`, changing it to `processing`, assigning `processingAttemptId`, and recording server `processingStartedAt`. The dispatcher has recursion guards: its own `pending -> processing` claim, worker terminal writes, recovery writes, and every other transition exit without dispatching.

A worker finalizes through a Firestore transaction, not a blind update. The transaction succeeds only when the document still exists, its status is still `processing`, and its current `processingAttemptId` exactly equals the worker's token; otherwise it performs no write. Thus a duplicate delivery, stale worker, timeout recovery, retry, or user deletion cannot recreate an entry or overwrite the current attempt.

Firestore rules reject client edits to analysis-owned fields, status, nutrition, or `servingMultiplier` while an entry is `pending` or `processing`; a user may still take the explicit delete path. This prevents a user edit from racing an active analysis attempt.

Failure fields are structured and user-safe: `errorCode`, `errorAt`, retry metadata, and a concise display message. Raw provider responses, URLs, bucket errors, or stack traces do not enter Firestore or notifications.

### Review Completion

The reviewed values are the values the user confirms. Saving a `needs_review` entry updates the editable base nutrition fields, marks `corrected: true`, and sets `status: complete` in the same repository operation. The aggregate trigger then includes it. Saving a `complete` entry is a normal edit and preserves `complete`; saving `pending`, `processing`, or `error` is not offered as a nutrition edit.

The route contract is explicit:

| Entry status | Processing destination |
|---|---|
| `pending`, `processing` | Processing skeleton with close-app affordance |
| `complete` | Result card, then Today/detail |
| `needs_review` | Review route or review-capable detail route, never the spinner |
| `error` | Error route with a disabled-while-running retry control |

Push payloads continue to contain only `entryId`; notification-tap routing resolves the entry under the current uid and follows the same status mapping.

### Nutrition Invariant

The canonical persisted nutrition fields are `baseKcal`, `baseProtein`, `baseCarbs`, and `baseFat`: finite double-precision nutrition values for one serving. `servingMultiplier` is a finite double from 0.25 through 5.0 in 0.25 steps.

```text
displayed nutrient = base nutrient * servingMultiplier
daily-log nutrient = sum(base nutrient * servingMultiplier for status == complete)
```

No storage, worker, edit conversion, or aggregation layer rounds base or scaled nutrition; rounding and locale formatting occur only at presentation. In edit mode, macro fields show displayed totals; saving converts a user-entered displayed total back to `base = displayed / multiplier`. A multiplier-only edit does not rewrite the base values. The model exposes named `base*` and `scaled*` getters so call sites cannot silently treat an ambiguous `kcal` field as both.

For compatibility, readers use legacy `kcal`, `protein`, `carbs`, and `fat` as base values only when `base*` is absent. The aggregation function does the same while the deferred backfill has not run. New worker, manual-entry, duplicate, seed, and edit writes emit only the canonical fields. An explicit one-shot backfill is dry-run first, idempotent, batched, and requires separate user authorization before production execution.

### Durable Plans And User-Scoped Providers

Targets remain at `users/{uid}/targets/{planId}`. The repository exposes `ensureActivePlan(uid)` as a transaction: if no active plan exists it creates one persisted default plan and establishes exactly one active plan; otherwise it returns the active document. Authentication absence is a loading/signed-out state, not `MacroTargetPlan.defaultPlan()` masquerading as persisted data.

Goal adjustments persist the selected body goal and macro values to the active plan. The macro draft provider is keyed by uid and active-plan id, initializes only after the plan stream resolves, and resets when either changes. Client rules validate target shape and active-plan transition so malformed plan, target, or weight values cannot be written. Static TDEE/BMR/80 kg presentation is removed or withheld until sourced from a validated user profile.

### Persistent, Authenticated Chat

Chat threads live below the authenticated user:

```text
users/{uid}/aiThreads/{threadId}
users/{uid}/aiThreads/{threadId}/messages/{messageId}
```

The callable accepts `message`, optional `threadId`, and optional `entryId`; it derives plan, current daily totals, entry context, and recent thread history using `request.auth.uid`. It does not accept client-supplied plan, consumption, or prior history as model context. Admin writes append both user and assistant turns with server timestamps and a request id for deduplication. Rules allow owners to read their threads but deny direct client writes to server-authored thread/message content.

Flutter providers are `family` providers keyed by uid and thread id, and invalidate on auth change. The composer serializes sends per thread and disables duplicate submission while an outstanding request exists. The first message can create a thread; an optional meal context must resolve to an entry owned by that uid. Confirm cards still require an explicit app-side plan mutation and display the persisted old/new values.

## Migration And Backward Compatibility

1. Ship read compatibility before any backfill: canonical image derivation, legacy nutrition fallback, and legacy image rendering from `storagePath`/`imageUrl` only as UI fallback.
2. Update Flutter and Functions together before tightening rules that would reject their former write shape. Existing pending documents receive one bounded compatibility path: derive their canonical object path and process only if the object exists; otherwise terminal `image_unavailable`.
3. Deploy rules and Functions only after emulator tests pass. Do not execute a production data backfill, Storage move, rule deployment, or Function deployment without the user's separate explicit approval.
4. After a release observation window, run a dry-run migration report that counts legacy fields, malformed paths, missing objects, and documents requiring user recovery. Review it before any batched write.
5. Only after the approved backfill is verified may rules reject legacy fields entirely and readers remove fallback code in a later compatibility-removal release.

## Reference And Secondary UX Correctness

The canonical screenshot evidence is the 38-file new placeholder-app handoff in `docs/design-handoff/placeholder-app/reference-images/`, not legacy docs/mockups. Restore the exact Git tree from `307dfc04ee23bee022f85059cc09dc363b2e80f6^` (the pre-rename `86b4858^` tree), retaining the byte-identical `reference-images-buggy/` directory untouched as historical evidence. Do not substitute the six incomplete 1206×2622 `good-screenshots` files for the full 402×874 handoff set.

`docs/design-handoff/placeholder-app/reference-images-manifest.json` is the checked-in contract. It records `source_commit` (`307dfc04ee23bee022f85059cc09dc363b2e80f6`), `source_tree` (`97339699422bcec8d92f2ec8e47c4179c184e034`), and an exactly 38-item `reference_images` list. Every item contains `filename`, `sha256`, `width`, `height`, and `size_bytes`; the validator reads PNG signatures/IHDR dimensions and verifies every byte hash. Update the handoff README and ui-diff instructions to use this restored directory. This restoration and manifest validation is an early independent evidence stage: it may run in parallel with the security work, but it must finish before any cross-repository visual capture or ui-diff gate.

The secondary fixes are intentionally bounded:

- Camera initialization, permission denial, lifecycle pause/resume, capture exceptions, and gallery cancellation/failure yield a usable manual/library fallback and restore `CaptureState.idle`.
- The notification preference is persisted per user, controls permission request and token registration behavior, and is reflected after restart without claiming an OS permission can be silently revoked.
- History day rows open the expected date drilldown and render a clear empty/error state.
- Debug reseed reports a terminal success or failure state rather than navigating to Today after an exception; capture setup selects the intended dark/light theme explicitly, and light system-bar icons contrast with the actual surface.
- The visual gate captures both themes against the restored canonical reference and records the exact reference hash, device, route, and reseed outcome.

## External Review Record

Main-agent Antigravity MCP follow-up review recorded on 2026-07-11 in conversation `risk-first-remediation-plans-2026-07-11` with `model:"gemini-3.1-pro-preview"`: `AGREEMENT_STATUS: agree`, `MUST_FIX: none`, `SHOULD_FIX: none`; no MCP response noise. This is a green documentation review only and does not claim production implementation or readiness.

## Test And Release Strategy

Test-first work is required for every behavior change. Unit tests cover pure state transitions, nutrition conversion, provider scoping, rules predicates, and chat request serialization. The entry tests explicitly name and begin red for `stale worker finalization`, `deletion after claim`, `stuck threshold`, and `concurrent retry`; nutrition tests explicitly name and begin red for `nutrition precision round trip`. Functions integration tests exercise the emulator lifecycle from capture through complete/review/error/retry/aggregate. Flutter widget tests cover the terminal processing routes, review confirmation, goals persistence states, chat disabled-send behavior, and capture fallbacks.

The release gate is ordered by risk:

1. `fvm flutter analyze` and `fvm flutter test`.
2. Independently restore and validate the canonical reference manifest. This may run alongside security work, but is a hard prerequisite to the later cross-repository visual gate.
3. `cd functions && npm run lint && npm run build && npm test && npm run test:rules`.
4. New emulator integration command for ownership, no-SSRF behavior, token-guarded finalization, stale-processing recovery, retry, review completion, unrounded nutrition totals, and uid-scoped chat.
5. Runtime/device verification for capture, library, lifecycle, notification preference, retry, review, history drilldown, and chat thread switch.
6. Dark and light cross-repository reference capture verification using the restored manifest; Today is not called visually exhaustive until every final artifact is inspected or the delegated reviewer explicitly says so.
7. Security review and Antigravity MCP implementation review must report `AGREEMENT_STATUS: agree` and `MUST_FIX: none` before a production-readiness claim.

## Acceptance Criteria

- A forged `storagePath`, `imageUrl`, foreign uid, or non-image upload cannot cause an analysis worker to read another user's data or make an outbound fetch.
- A retry has one transaction-protected eligibility check, no stale overwrite, bounded cost, and one terminal result; server-bounded timeout recovery prevents a permanent processing spinner, while only the callable moves an error back to pending.
- Saving a reviewed entry completes it and changes that day's aggregate exactly once; editing a served entry preserves unrounded double-precision `base x multiplier` in both detail and history, with rounding only in the UI.
- A fresh authenticated user obtains a persisted active plan, plan changes survive restart, and no global provider state leaks into another uid.
- Chat context and stored turns belong only to the caller's uid; rapid double-send yields one ordered request/turn pair per accepted action.
- Processing visibly routes all terminal states, capture failures are recoverable, and the current visual target exists at the documented canonical path with a reproducible manifest.
