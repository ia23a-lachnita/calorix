# Calibration Runtime Evidence Producer Design

**Date:** 2026-10-18

**Status:** Draft for written-spec user review. The user approved the bridge-only direction with “sure” after the scope proposal at `a4af7ce`; that approves writing this document, not implementation or a plan that does not yet exist. External review provenance is tracked below.

**Parents:** `2026-10-12-calibration-controller-runtime-design.md` and `2026-10-14-calibration-durable-runtime-evidence-design.md` in this directory. Parent tracker: `../plans/2026-09-23-gemini-38-nutrition-calibration.md`, Task7 Steps4–7.

## Intent and success criteria

Connect the completed mediated capability primitive to the completed durable evidence ledger through an unused, opt-in producer. An outcome execution must write intent before invoking the corresponding trusted port, settle what actually returned or failed, and finish only against an existing durable result terminal. Persistence failure must never become an apparently ordinary provider failure or successful result.

This moves the approved Gemini3.8 calibration toward a safely testable controller. Historical2.5 results remain comparison-only. It does not change the approved project/location/model, profile selection, samples, thresholds, call ceilings, production defaults or deployment policy.

Only this bridge and its hermetic tests are in scope. No default CLI/controller wiring, SDK/client construction, live provider or OFF request, image/snapshot default reader, benchmark authorization, historical-comparison integration, report admission seal, full146-call qualification, account/cloud/device/UI operation or production migration is included. Keep `calibration:benchmark-runtime-evidence-required` unconditional. Creating a bridge is not permission to run it against live ports.

## Verified starting point

Inspection baseline: `a4af7ce3ede33321799cdb5d9a1991075ece42a5`, branch `fix/scan-photo-flow-viewer`, matching live origin. Integration base is independently verified as `main` at928f9a9; this document does not authorize merging the long-lived branch.

- `calibration-runtime-capabilities.ts` owns serial keyed leases, barcode restrictions, final `beforeRequest` reservation, response metadata validation and private error branding. Its observations are copied in-memory diagnostics only.
- Its image-loader and snapshot-lookup exceptions are fatal. Vision-port rejection can become a fresh capability-owned provider error. A core `CalibrationFatalError` is not automatically recognized by the capability primitive's private WeakMap; merely throwing a ledger error through a vision wrapper is unsafe composition.
- `calibration-runtime-evidence-ledger.ts` prepares the unused native evidence ledger with real storage, report verifier and Git reader. It does not acquire a lock, create an SDK client or execute a stage. Native getters/mutations enforce current ownership, source identity and artifact authority.
- The evidence reducer requires image return before vision start, vision start before reservation, reservation before authorization, and authorization/model pinning before a returned vision settlement. No new start/authorization is allowed after a terminal.
- `recordSafeError` records a preflight diagnostic, not an outcome terminal. `appendResultJournal` followed by `complete` supplies an ordinary image terminal; `complete` can reference a failure journal. The special `failed` event used during recovery is not a new ordinary-provider API.
- `recordNonReservationResult` permits barcode outcomes or genuine dataset failures. A provider failure before reservation must not be relabeled as dataset failure to manufacture a finishable terminal.
- The runtime snapshot exposes owner/active attempt/events, not a native identity header or an admission token. Stage-report snapshots already expose the protocol identity.

The prerequisite's full postcommit run had3645 passed/one existing opt-in skip, including199 native cases. An earlier run had two5000ms timeouts; the unchanged retry passed, but the cause and timing margin remain unproven. Those are historical prerequisite receipts, not verification of this producer.

## Architecture and alternatives

Choose a new composition module with private wrappers and one outcome-execution entrypoint. Reuse the existing capability primitive and evidence ledger, retaining their public APIs, observation meanings and persistent formats. Do not add generic persistence hooks to the primitive in this stage. If the approved contract cannot be met without an existing-API change, stop and review that amendment rather than silently broadening implementation.

Putting durable hooks directly into the primitive would mix its deliberately nonpersistent contract with storage and alter existing callers. Combining this bridge with historical benchmark authority and the default controller would cross several still-separate review boundaries. Neither is necessary to test this missing composition seam.

The producer borrows one explicitly provided evidence ledger and captures a prepared context, optional selected profile and trusted raw image/vision/prepared-snapshot ports. It supplies the capability primitive's reservation and model-version callbacks itself. Caller replacements for those callbacks, verifier, counters, retry policy or high-level persistence are not accepted.

No default SDK, transport, image loader, snapshot reader or response cache is chosen. Factory preparation only captures/validates inputs and derives canonical plans; it invokes no ledger method, port, lock acquisition or mutation. Existing native storage preparation remains outside this factory.

The borrowed ledger and ports are trusted dependencies, not self-authenticating values. Structural method validation cannot prove that a supplied object came from the native factory. Future native composition must select the real ledger itself; tests for native authority use that real ledger, not a caller `passed:true` verifier. Cooperative exclusive use of the borrowed ledger is required during execution; arbitrary code using an alias or modifying the private filesystem is not an adversary this bridge authenticates.

That native assembly must prepare the ledger from the same captured context/base directory used by the producer. The public ledger has no root getter: `getRoot` belongs to low-level storage dependencies, not this public API. Matching public identity/owner state alone cannot prove a borrowed ledger's root association. Preserve that explicit assembly trust boundary rather than invent a root getter/token, inspect private fields or claim that identical identities distinguish two cloned roots. Real-native positive controls independently inspect the expected context's canonical on-disk root.

### Input ownership and identity binding

Capture dependency/run records through own enumerable data descriptors under a reentry guard before effects. Reject malformed records, accessors, inherited/symbol/unknown request fields and invalid functions/keys/profiles. Copy valid mutable input records instead of retaining aliases or requiring the caller to freeze them. Capture the required methods of the existing full ledger without rejecting its other legitimate methods. Never freeze caller-owned objects. Exact TypeScript signatures and file decomposition belong in the implementation plan.

Reflection traps may execute; guard against their reentry and recheck fatal state afterwards. Zero-effect rejection means no producer-invoked raw port or native mutation, not a sandbox against arbitrary code inside a trusted trap/callback.

Derive plans from copied, checksum-validated prepared-context file strings through the existing canonical planner. Capture the optional selected profile; it must agree with the locked ledger's current selected profile at execution. A profile/owner epoch change requires a new idle producer instance after explicit existing transitions/recovery, not an internal reset of used keys. A fresh producer never grants a retry for a consumed/reserved key.

Before opening an attempt, validate the captured key against that plan, read owner/active attempt using `getRuntimeEvidenceSnapshot()` and protocol identity using `getStageReportSnapshot(key.stage, key.profile).identity`, and compare the complete immutable protocol identity to the captured context. The guarded snapshot API is available under the held lock before stage completion; the runtime snapshot's active attempt must be checked, not assumed null. Check all context file/hash bindings through the existing preflight/bootstrap validation rules. The ledger must have no unfinished active attempt; lock acquisition and any recovery are the caller's explicit prerequisites. Failure occurs before any raw port or new attempt write. These public checks do not replace the same-context assembly responsibility above.

Retain implementation identity and clean Functions-tree rules across docs-only HEAD movement. Do not compare only current HEAD, accept a caller identity boolean, infer a nonexistent snapshot header/version field, or bypass native source/owner checks. Later ledger calls retain their existing fresh checks.

## Outcome lifecycle and terminal ownership

The single entrypoint conceptually accepts a canonical key, a trusted work callback and a required trusted terminal-publication callback. Validate both callbacks before opening the attempt. Neither receives the private attempt reference or raw ports. Missing publication is an invalid input, not an optional no-op mode.

The work callback receives a producer-owned facade over the capability primitive's outcome capabilities. It produces an ephemeral result using existing parsing/normalization policy. The publication callback receives the owned key and that result only after work and capability-lease closure succeed; it writes the existing result journal/terminal or barcode non-reservation result. It is terminal publication, not stage-report publication or admission.

The producer owns sequencing; the trusted publisher owns existing result construction and closed-codec validation. No new transient result value becomes durable authority merely by being returned. Results are not retained in observations or serialized by the producer; existing codecs validate/copy data before persistence. Any returned application value remains data, never an admission seal or proof of its producer's honesty.

Image journals must contain the existing full report prediction required by native report reconstruction, not merely metadata sufficient for a terminal event. The publisher derives the correct success/failure journal through existing codecs; no alternative failure/normalized-prediction/hash format is introduced.

Lifecycle:

1. Guard public entry against poison or an existing invocation. For an idle entry, reserve a private capturing phase/generation before foreign reflection; then capture and validate inputs, plan/profile/source/owner and native idle state. Recheck fatal state before moving to work. A reentrant call must not replace the first invocation's reference or generation.
2. Durably call `startRuntimeAttempt` and retain its reference privately.
3. Execute the existing primitive's `runOutcome` with the owned key and wrapped work callback. Only the producer facade is exposed. Wrap all facade methods as well as raw ports: a capability rejection before raw-port entry must not escape bridge fatal tracking.
4. Await primitive completion, which checks its own private poison and in-flight state. Independently check producer fatal state, outstanding operations/callbacks and invocation identity. Close the facade's work phase before publication.
5. Invoke the terminal publisher once. No image/vision/snapshot facade operation is permitted in publication. Recheck fatal/generation state after synchronous return and every await.
6. Call `finishRuntimeAttempt` only after the publication callback fulfills and all checks pass. The existing ledger resolves and validates the actual durable terminal; a publisher return value, `safe_error` or prediction alone is insufficient.
7. Clear the active reference and close all invocation callbacks in `finally`. Return success only after durable finish. Clearing local state never removes a native lock, rewrites history, rolls back a reservation or manufactures abandonment/recovery.

Any unexpected thrown value from work/publication, missing/wrong/duplicate terminal, unfinished operation, swallowed fatal or reentry stops the producer permanently. Native state may contain a durable incomplete prefix; leave it for explicit existing recovery. Do not invoke publication as a catch-all error handler after a fatal.

## Operation and SDK callback ordering

For image and snapshot ports: current-invocation checks, durable operation start, raw invocation, observed return/rejection, then the corresponding durable settlement. Do not put settlement persistence inside the raw-port catch: a failed settlement is a persistence fatal, not evidence the raw port failed. Snapshot lookup stays synchronous; no background publication or fire-and-forget promise is introduced.

For vision:

1. After a returned image, durably start vision before delegating to the trusted generation port.
2. Decorate the capability primitive's generation callbacks with invocation-scoped guards. Preserve the exact calibration generation arguments/options and existing metadata rules.
3. Inside the existing final `VisionGenerationOptions.beforeRequest`, the producer-supplied `deps.reserveImage` callback synchronously performs `ledger.reserve(ownedKey)` followed by `authorizeRuntimeRequest(privateRef)`. This is the only reservation implementation. The outer callback decorator invokes/checks the primitive's existing hook; it does not reserve again. Fulfill the hook only after both writes succeed and the guard still passes. Never reserve in a second earlier adapter hook.
4. Run the primitive's metadata callback through a guarded decorator; its producer-supplied version callback calls the existing ledger model-pinning API. Guard failures, malformed/duplicate metadata or pinning failures are fatal, not provider failures.
5. Record returned vision settlement only when actual return and the existing authorization/pinning preconditions hold. Missing/unfinished hook or metadata cannot be fixed by inventing a callback, reservation or returned settlement. A rejected raw generator may produce failed settlement only while the invocation remains healthy and after excluding callback/durability failure.

Track hook/metadata entry, completion and pending state privately. Reject duplicate, overlapping, stale and post-close callback invocations before ledger writes. Bind each decorator to its original generation/reference; never look up a new active attempt to service an old callback.

An honest native adapter awaits `beforeRequest` immediately before the SDK method. A failure inside that hook must cause zero SDK calls at the independently observed fake-SDK seam, even if reservation publication already succeeded. That reservation remains consumed. A completed hook is authorization, not dispatch proof. A fault discovered after handoff may occur after a request; it cannot recall or roll back that request. Record/report uncertainty and stop rather than promise universal zero dispatch across arbitrary asynchronous schedules or dishonest transports.

## First-fatal state and ordinary failures

Maintain a private monotonic first-fatal flag for the producer lifetime, plus invocation-scoped operation/callback state. It cannot be cleared by caught exceptions, a new key or a fresh work callback. Check it at every public/facade/port/callback entry, after foreign reflection or callback return, after every await, before publication and before success/finish.

Do not inspect any foreign thrown value: no message/code/name/cause/stack/`instanceof`, coercion or serialization. Mark failures from known control-flow locations and throw a fresh static causeless producer fatal. Do not retain raw exceptions. Deferred cleanup must observe its own promises to avoid unhandled rejections, but that observation is not permission to swallow a failed operation and finish successfully.

The facade tracks each invocation separately. Only a corresponding raw vision rejection after successful reservation/authorization, with no callback, capability-contract or bridge fatal, is an ordinary provider-rejection candidate. That is a side-channel fact from owned control flow, not class inspection of the capability primitive's returned error. Image/snapshot exceptions and endogenous lease/request/metadata failures retain their existing fatal semantics. Returning malformed text or omitting required callbacks is not converted into an ordinary provider failure.

The work callback may handle a genuine ordinary provider rejection and return the existing domain failure result. The trusted publisher can then publish its existing validated failure journal/terminal. If that rejection is unhandled, the producer stops conservatively; it does not guess an error category or fabricate a terminal from an arbitrary thrown object. Parser/product failures returned under existing policy are distinct from port/durability exceptions.

| Observed path | Producer disposition |
| --- | --- |
| Image and authorized vision return; work produces valid success or scored parse failure | Publisher writes existing validated image journal + `complete`; finish reconciles it. |
| Authorized raw vision rejects; work handles genuine provider failure; no private fatal | Durable failed vision settlement, then publisher writes existing failure journal + `complete`; finish reconciles it. No automatic retry or stage advancement. |
| Raw vision rejects before reservation/authorization | Stop without terminal/publication. Do not add a reservation after the fact or relabel it dataset failure. Existing explicit recovery governs the incomplete unreserved attempt. |
| Barcode snapshot returns; existing product analysis returns valid success/product failure | Publisher writes existing `reason:'barcode'` non-reservation result; finish reconciles it. Zero image/vision/reservation/live-OFF/cache use. |
| Image/snapshot throws, snapshot is missing, capability contract breaks, or any persistence/identity/owner/publication fault occurs | Producer fatal; no scored completion or automatic recovery/release. Leave the real persisted prefix and lock. |

This conservative first bridge does not introduce new dataset-error handling or modify the primitive to make loader exceptions scoreable. Although the existing ledger can represent genuine dataset non-reservation results, fabricating one is not an escape hatch for a provider or persistence fault.

The producer does not claim to set either borrowed primitive's private poison state. A native ledger method failure already poisons that ledger under its own contract; a port-only violation can leave a valid but unfinished ledger. Producer poison independently prevents further producer effects or apparent success. Producer-observed failures cannot be swallowed to bypass its guard, and a swallowed native ledger failure still prevents native finish. A callback's wholly internal, unobserved exception is not attestable: if a trusted publisher catches such an exception and nevertheless produces a valid native terminal, the bridge cannot infer that hidden history. Do not claim arbitrary publisher honesty is verified.

Leaked facade calls after work closes must set producer fatal state before reaching the primitive, including calls made and caught by the publisher. An invocation that fires only after an earlier outcome has already durably finished cannot retroactively revoke that finish; it poisons future producer use and must never write against a newer attempt. Already handed-off ports may still settle, but cannot acquire fresh effects or terminal authority after producer failure.

## Crash, ownership and reporting boundaries

Reuse the same ledger/journal/root/lock, v1 event schema, 4096-event/16KiB bounds and native publication protocol. Add no companion file, heartbeat, admission token, reset, migration or second reservation namespace. Publish evidence at the operation boundary, never by replaying `getObservations()` afterwards.

The producer never acquires/releases locks, performs takeover, calls recovery, retries, chooses the next stage/profile, publishes/adopts report receipts or completes stages. A new owner explicitly uses existing acquisition/recovery; reserved unfinished keys are never dispatched again. Unknown liveness and uncertain publication retain the lock. Clean no-active owner handoff and interrupted-attempt dispositions retain their existing separate meanings.

Interrupted, settled or finished evidence alone does not authorize benchmark completion. The future native report/comparison/benchmark integration remains a separate reviewed stage. Existing result journals may contain their approved prediction data; new runtime records/diagnostics contain no prompts, image bytes, raw responses, predictions, foreign errors, credentials or arbitrary paths. Do not add raw exception logging under the guise of profiling.

## Required hermetic verification

The implementation plan must make these cases constructible with genuine RED→GREEN evidence, not unrelated import/setup failures or mocked high-level authority:

- Positive image success, authorized provider failure handled by work, scored parse failure, barcode success/product failure and no-op preparation. Use the real native ledger and real journal/non-reservation codecs/publisher operations. Independently inspect disk arrays, ordering, hashes, owner/ref/key association and unchanged old prefixes.
- Use the real generation adapter over an injected fake SDK with an independent dispatch witness. Assert start→reserve→authorize→SDK ordering, exactly one final-hook reservation, response pinning before returned settlement and zero SDK calls on hook failure. Test a dishonest retry simulation as witness divergence, not a claim of production transport instrumentation.
- Cover all twelve manifest-derived barcode keys at the selected profile. Forbid image/vision/live-OFF/snapshot-file/cache accesses with throwing witnesses; permit only the already prepared product lookup. Do not count twelve across both profiles.
- Reject malformed/accessor/proxy inputs, mutation aliases, wrong source/context/profile/owner, used/reserved keys, unacquired/unfinished ledgers, overlapping outcomes, repeated operations, callback reentry, getters that reenter, duplicate/missing metadata and missing/duplicate final hooks before the next disallowed effect.
- Throw revoked proxies and forged error objects at every foreign boundary without inspecting them. Specifically reproduce a core fatal that the capability vision catch would otherwise normalize into a provider error; work that catches it and returns a plausible failure must still cause zero terminal publication and no producer success.
- Test work returning while operations/callbacks remain pending, rejection before final hook, a swallowed publisher/facade fatal, stale callbacks during another generation, callbacks after completion and source/lock replacement during callbacks. Use controlled promises, not arbitrary sleeps.
- Inject native write/fsync/close/rename/directory faults at attempt start, operation start/settlement, reservation, authorization, journal/terminal and finish, including effect-then-throw. Assert actual zero-next-effect witnesses, conservative persisted prefixes/counts, lock retention, poison behavior and no rollback/repair. Crash cuts use a fresh real instance with explicit recovery, never a retry of a reserved key.
- Verify missing/forged/wrong-key terminal, safe_error-only publication and legacy/forged ledger boundaries. Structural fake ledgers may test dependency validation but cannot count as native-authority controls.
- Preserve old primitive/codec/reducer/core/native tests and all default importers. Run strict real-source typing, build, full lint, focused/old controls, nutrition and default full serial Functions suites plus postcommit verification. Keep only the existing opt-in public-manifest fetch skip. Timing diagnostics are not gates and limits must not be raised to disguise failures.

These tests qualify only mediated trusted seams and cooperative filesystem behavior. They do not prove opaque SDK retry absence, universal network isolation, privileged-writer resistance, physical power-cut survival, full146-call controller completion, live nutrient accuracy or production/security readiness.

## Workflow and approval gates

Candidate new module: `functions/src/nutrition-eval/calibration-runtime-evidence-producer.ts`, with new producer tests and a separately owned helper if needed. Exact signatures, allowed files, focused tests and bounded implementation tasks belong in the implementation plan. Do not reopen a completed execution workspace or silently amend frozen prerequisite helpers.

Normal strongest-first workers author application code/tests; the host owns requirements, planning/tracking, reviews, verification judgment, commits and pushes. Previous native-edit exceptions are closed. Keep the approved inline execution style, mandatory Antigravity plan/code-result reviews and one independent native whole-plan review at the appropriate implementation gate.

Use verified disk-backed task-scoped TMPDIR/cache/logs for future execution. Keep `/tmp` minimal, preserve user `.mcp.json` unread/undiffed/unstaged, and never clean sibling workspaces. This documentation stage creates no execution workspace, worker, SDK or test fixture.

After external review and inline self-review, commit/push this spec and request user review. Only approval of the written spec permits writing the detailed implementation plan. The plan then needs its own external/user review and execution-method confirmation before any implementation. This direction approval does not preapprove either missing artifact or activate a live stage.

## Review record

The preceding direction consultation used primary `gemini-3.8-flash`/High, scoped conversation `calorix-runtime-evidence-producer-direction-20261017`. The host rejected inverted barcode permissions, safe_error-as-terminal, automatic dual-poison and blanket wrapper-feasibility claims. The correction explicitly retracted them and returned agree/MUST_FIX none for direction only. This written refinement incorporates those obligations. Exact-text receipt entries below track reviewed snapshots, not implementation evidence.

Written-spec review used actual Antigravity MCP, primary `gemini-3.8-flash`/High/yolo, new scoped conversation `calorix-runtime-evidence-producer-spec-20261018`. Call1139 reviewed the original153-line/25350-byte snapshot (host SHA256 `22b9fb4569b903b6299268b9a3addda66311a42aab35a4099efad1072dec0af9`), agree/MUST_FIX none, with two nonblocking seam/identity-lookup clarifications adopted after checking source. The host separately corrected input-copy wording, capture-before-reflection ordering and the public-root limitation. The initial reply's “completely unmodified” worktree description and blanket foreign-error mapping were recorded as response noise, not adopted as facts.

Call1144 reports complete inspection of the amended155-line/26722-byte snapshot, host SHA256 `dd22378f4ff9b535515a2cea4a644589037957f24754d292f505ec99f9b86e29`, and explicitly retracts those overbroad statements. Actual nonempty isError:false response: FINAL_WRITTEN_PRODUCER_SPEC_ONLY / AGREEMENT_STATUS agree / MUST_FIX none / SHOULD_FIX none / QUESTIONS none / NOT_IMPLEMENTATION_APPROVAL. No model fallback, tool failure or reviewer mutation was observed. The reviewer launched no tests/workers or calibration inference; source/tests and user configuration stayed unchanged. Its absolute phrasing about eliminating double reservation is treated as a statement of intended design, not verified implementation or a universal guarantee. These receipt paragraphs are appended after the exact reviewed snapshot; no normative requirement is changed by them.

Host self-review checked actual interface/terminal/error constraints, consistency, scope, ambiguity, references, fences, placeholders, snapshot hashes, source/test/package preservation and user-config fingerprint. This is documentation verification only. User approval of this written spec remains pending; no implementation plan, execution workspace or producer code has been created.
