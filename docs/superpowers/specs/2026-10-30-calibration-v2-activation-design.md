# Calibration v2 activation design

Date: 2026-10-30. Status: reviewed design; concrete implementation planning next. This continues the approved nutrition-calibration roadmap after offline Phase A qualification. It authorizes no model request while design, implementation or qualification gates remain open.

## Intent and evidence

Measure the unchanged Gemini 3.8 calibration procedure on the newly qualified clean-scene corpus, with a distinct protocol identity and strict accounting. Preserve the failed v1 experiment as evidence. A better corpus can improve interpretability; it does not promise passing model accuracy.

Phase A is committed and pushed at `47b607e6f5c019d5a423325c291d5fa43f7717f1`. Its candidate is `calorix-n5k-quality-candidate-v2`, finalized with raw SHA-256 `3b8bd3280a1d2941082a8d95422e62336b93222022fd6d2f4528aa23980e8b2b`. Its historical producer is commit `eb8431e0167091a75fe46bfc84c7da431c51ccb6`, Functions tree `3c5dbe35b4946524a085e01df79b2c0283b8ca11`. The source lock raw SHA-256 is `a9f0b32112a92efcd3cc911f9142973732770398b545cd1aed4cdb8f16d38bc9`; quarantine digest is `4f348798181f1eb1ae8dbd73fb0bfb0b8c14bb973b02bd5be06afc0be5627066`.

There are 40 selected passes, 24 development and 16 validation, after 56 considered photos, 16 retained rejections and 31 HTTP 404 skips. All 56 photos were individually viewed by the main agent; Antigravity independently rendered four samples and reviewed the full inventory and final hash. Native finalization and read-only verification exited 0. [The qualification report](../../nutrition-corpus-quality-preparation-2026-10-30.md) records margins, source pins, receipts and limits.

V1 used 50 image reservations/completions and one token count. Both development profiles failed the fixed pooled macro gate, no profile was admitted, and validation/benchmark did not run. Its retained lock, ledger, journal and reports must remain byte-identical. No recovery, unlock, migration, replay or rescoring of that experiment is part of v2.

## Fixed boundaries

- Keep production model defaults, prompts, response schema, confidence handling, nutrition metrics/thresholds, historical 2.5 reference, OFF snapshots and public benchmark unchanged. Do not make another 2.5 request.
- Retain Vertex AI, project `calorix-xurschnell`, location `us`, model `gemini-3.8-flash`, provider API `v1`, 30-second request timeout and current no-override/no-hidden-retry configuration. LOW and MEDIUM are the only profiles.
- No fallback model, additional model smoke, response cache, token-count rerun, replay of an ambiguous reservation, post-result corpus curation or newly tuned prompt.
- An experiment can fail. Preserve its result and stop rather than remove difficult cases, change truths or relax gates.
- No cloud deployment, production data mutation, auth/rules change, dependency upgrade, emulator/device operation or production-model promotion is included.
- Use the existing isolated clean worktree and disk-backed task storage. Commit and push bounded stages. Refresh permitted editing-worker routes for this new workstream; the completed Phase A fallback is not a blanket editing exception.

## Identity and budget

Use exactly two supported protocol identities, selected by explicit native entrypoints rather than a user-supplied descriptor, environment version, directory or manifest rename:

| Field | Existing v1 | New v2 |
| --- | --- | --- |
| Protocol/report identity | `calorix-gemini-38-calibration-v1` | `calorix-gemini-38-calibration-v2` |
| Ledger identity | `v1` | `v2` |
| Canonical root | `.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/` | `.nutrition-eval/calibration/calorix-gemini-38-calibration-v2/` |
| Training dataset identity | `calorix-n5k-calibration-v1` | `calorix-n5k-calibration-v2` |
| Selection rank prefix | `calorix-n5k-calibration-v1:` | `calorix-n5k-calibration-v2:` |
| Planned images | 146 | 146 |
| Per-protocol hard ceiling | Existing 300 unchanged | 146; no spare call entitlement |

The v2 limit is stricter than the original 300-call containment allowance. Static accounting is 50 already reserved by v1 plus at most 146 new v2 images = 196 total workstream images, below 300. V1's failed ledger cannot provide another budget. V2 allows exactly one separately typed token-count reservation. Any failed or ambiguous token/image reservation remains spent and cannot be repeated.

| Stage | New image maximum | Other outcomes |
| --- | ---: | --- |
| Preflight | 2 | One token count, same first development image, LOW and MEDIUM |
| Development | 48 | 24 dishes, one uncached sample per profile |
| Validation | 48 | 16 dishes, three samples of the one admitted profile |
| Frozen public benchmark | 48 | Existing 20-case, three-sample procedure; barcode outcomes use pinned OFF snapshots |

Retain the original lexicographic profile selector and exact development, validation and benchmark gates from the [September design](2026-09-23-gemini-38-nutrition-calibration-design.md) and existing pure gate functions. No stage advances without durable completion and its actual gate passing. An earlier failure stops all later stages.

Do not globally replace strings containing `v1`: provider API `v1`, OFF/public/historical dataset versions and evidence/report codec revisions are separate identities. Their unchanged format revision does not make a foreign protocol identity admissible.

## Trusted candidate admission

Add a committed version-specific activation lock. It binds the exact finalized candidate raw digest, historical producer commit/tree, existing corpus-source-lock raw digest, quarantine digest, frozen v1 evidence fingerprints/counts, shared benchmark/prompt/schema/OFF/history pins, fixed route and the 146/1/50/196/300 budget record. Native code reads the lock from committed current Functions source, validates a closed strict schema and its pinned digest, and rejects incompatible working copies. It is not a caller-controlled runtime configuration.

The lock must not contain its own digest or the current commit containing it. Bootstrap obtains the current runtime implementation commit/Functions tree from Git and checks that clean identity again before effectful execution.

Admission is read-only and performs no download. It verifies both candidate and corpus-source-lock raw bytes against the committed activation lock before parsing either JSON document. A shared pure context assembler and source-lock/path schema can move into a small data module used by both native readers; do not import the CLI into runtime admission. The existing CLI still supplies its current Git checkpoint, while v2 admission supplies only trusted historical pins. V2 runtime case derivation belongs in the additive v2 module rather than making the Phase A audit itself a runtime authority. It reconstructs `QualityAuditContext` from the exact cached pinned public sources and the lock's trusted historical producer checkpoint, then uses the existing pure audit validator to replay sources, metadata exclusions, ranking, consideration/QC history, quarantine and selection. Verify all referenced image bytes, not only the selected 40. Require finalized status, zero declared food requests, complete 40 passes and exact partitions/margins.

The current offline CLI intentionally derives producer identity from current Functions source. Keep that guard unchanged: it must continue rejecting the historical audit after runtime source changes. The additive runtime admission bridge accepts historical data only through the reviewed lock; it never rewrites the audit producer or trusts a self-declared checkpoint.

Native admission verifies the historical producer Git object/tree and the exact frozen v1 evidence fingerprints without executing v1 code or parsing old held-out predictions. Missing/changed candidate, sources, photos, prior evidence, Git objects or runtime source fails closed before a lock/write/client/reservation. Do not redownload substituted bytes or reconstruct QC from predictions.

## Runtime manifest and hash relationships

Derive a strict v2 training manifest from the admitted audit's selected slots, source metadata totals and image records. Do not reuse or alter the committed v1 manifest. Preserve the existing case shape, case-ID convention, exact slot order and source/portion truth conversion; change only the explicit training version/dataset/rank identity. Use a separate v2 schema/hash function; the old strict v1 schema stays strict.

Avoid a hash cycle: the activation lock pins the candidate and all underlying shared inputs, but does not pin a manifest containing the activation lock's own digest. Derive the v2 manifest deterministically with `sourceLockHash` equal to the activation-lock raw digest; serialize it as recursively key-sorted JSON without a trailing newline. The runtime identity's `manifestHash` is the SHA-256 of those derived UTF-8 bytes, and its `sourceLockHash` is the activation-lock raw digest. The source commit/tree binds the derivation implementation. The historical producer pins remain separate.

Keep existing `datasetHash`/`publicManifestHash` semantics for the frozen public benchmark, with the distinct training-manifest and activation-lock hashes binding v2 development/validation. The design does not relabel the historical legacy macro metric as the newer zero-safe metric.

## Closed runtime reuse

Reuse the existing durable controller, report planner, stage driver, journal, evidence state, publication and metric logic. Do not duplicate the large controller or create arbitrary protocol/plugin configuration. Refactor only version-sensitive boundaries into internal functions receiving one of two module-owned frozen descriptors. Existing exports continue selecting strict v1 behavior; new explicit v2 factories select the reviewed v2 descriptor.

Bind new v2 prepared contexts and handles to the expected protocol, canonical root and full identity digest through module-private runtime registration such as WeakMap/opaque tokens. Preserve existing v1 structural context APIs and their exact strict v1 identity/root validation; do not require a new registration token from legacy callers. Existing v1 handle authority stays unchanged. A v2 context cannot enter a v1 boundary by changing its type assertion or metadata. The expected descriptor comes from the boundary/factory, never the untrusted header. TypeScript brands can supplement runtime checks, but an asserted type cannot authorize a fabricated or cross-version object. Ownership/capture helpers must retain existing primitive capture, getter/proxy rejection, immutable snapshots and per-handle authority checks.

Native bootstrap is the only route from current committed source plus admitted candidate to a v2 context. Production entrypoints expose no raw descriptor, configurable root, caller-supplied report verifier or alternate source pins. Existing trusted dependency-injection boundaries remain available to hermetic tests. Pure data admission can consume explicit fixture pins, but it does not itself grant native runtime authority. Hermetic bootstrap tests may replace trusted native-reader/pin modules with independent fixture inputs while exercising the real validation algorithms; do not add a test-only context-registration export. Compiled native tests use actual fixed trust modules, and a post-commit read-only admission probe must accept the actual reviewed candidate on the real committed source. Fixtures never become native caller override options or weakened production pins.

Version-sensitive boundaries include manifest/schema and report metadata, bootstrap/outcome planning, identity/budget admission in the ledger, file-store roots, preflight capture, evidence codecs and binding hashes, producer inputs, report state/assembly/publication/artifact verification, native ledger composition and stage-driver context capture. Inspect the actual import graph before implementing; an unchanged codec format number alone is not sufficient cross-version rejection.

The shared general report reader may recognize the two explicit calibration metadata variants. Every version-specific runtime/report verifier must require its expected protocol and complete identity; a generic reader's successful parse never grants ledger/report authority. Preserve old v1 golden bytes and all legacy test populations.

## Native entrypoint and fail-closed execution

Add `eval:nutrition:calibration:v2` and a separate v2 CLI module. Reuse existing pure stage/argument/route validation and the explicit `RUN_NUTRITION_CALIBRATION_LIVE=1` opt-in. The entrypoint and committed lock choose v2; the opt-in alone does not. Do not add a `--protocol`, output-root, source-lock, manifest or recovery override. Existing v1 entrypoints remain v1.

Import and invalid invocation have no filesystem/client/network effects. Before native v2 file/lock/client/reservation effects, validate the invocation, trusted data/source inputs and any existing canonical state against the expected v2 binding. Reject cross-version headers, roots, reports, receipts, reservation bindings, selections and handles before effects. Source changes during asynchronous preparation fail closed.

Reuse the current project/client factory and request construction without changing production adapter defaults. Retain exact SDK invocation accounting, uncached samples, journal-before-completion ordering, file/directory durability and independent native receipt/report verification. Missing or uncertain evidence stops execution. A reservation with an absent/ambiguous result cannot be retried or recovered into another request.

Retain failure locks/evidence. Only the existing healthy-success release path can release this new protocol's own lock. Never remove a v1 lock. Already completed/failed/ambiguous stages cannot make another SDK request, and a profile is admitted only from actual complete development reports that pass the existing gates.

## Qualification and activation gates

1. Review the complete written design with a fresh builder check and Antigravity against actual source. Resolve important ambiguity without another routine user approval ceremony.
2. Write the concrete implementation plan with exact files, interfaces, tests, stage boundaries and verification commands. Obtain its Antigravity plan review before product edits.
3. Use permitted editing routes, genuine behavioral RED/GREEN and small commits. Add independent negative fixtures for all source/version/root/receipt/handle mismatches and effect counters showing no write/lock/client/reservation after invalid admission. Test actual compiled import/invalid-main and native composition hermetically.
4. Prove exact v1 behavior and old test case/status population remain preserved. Run focused tests, build, lint and a fresh literal `npm run test:verify` after assembled runtime changes, with actual native exits and case populations. Use the prescribed one fresh whole-feature native review and mandatory Antigravity code/result review. Fix important findings through real RED/GREEN before acceptance.
5. Record/push the final source identity, activation lock/budget and reviewed runtime qualification. Separately verify read-only ADC quota project, active project/API/billing, exact request route and actual native command guard without printing credentials. Candidate qualification alone cannot satisfy this gate.
6. Only after all prior gates are green, run the new protocol once, in stage order. Collect actual SDK/model-version, reservation, journal, report, error, latency and gate receipts. Stop at the first failure; preserve results unchanged. Do not make exploratory food requests outside this stage budget.

The user's standing roadmap authorization covers continuing these reviewed stages without renewed plan/native-edit approval. Cloud deployments and production mutations retain their separate authorization requirement.

## Limits and release work

The corpus is a clean-scene diagnostic, not representative app accuracy. ID disjointness does not prove independent incremental plate families or absence from model pretraining. Public split provenance supports train/test separation, not independence of our two subsets within the training split. No physical mass, hidden oil or nutrient ground truth is certified by a photograph.

The declared Node 20 deployment target reached its published decommission date on 2026-10-30; actual deployed runtime is unqueried. Local prior tests used Node 22. Supported runtime/SDK/CI/staging qualification remains separate release work, not a new gate authorizing food requests. No engine/dependency/workflow/deployment change is bundled here.

The builder may choose small helper file boundaries, fixture organization and names in the implementation plan. The builder may not choose a different model/project, change gates/truths, broaden budgets, relax version/source checks, mutate v1 or introduce deployment work. Remaining implementation choices require recorded reasoning and review, not speculative claims of zero regression risk.

## Review record

Bounded actual-source historical-candidate admission consultation, primary `gemini-3.8-flash`/High, conversation `calorix-v2-candidate-source-admission-20261030`, returned explicit agreement and no must-fix findings. Scope is `ACTUAL_SOURCE_V2_HISTORICAL_CANDIDATE_ADMISSION_DESIGN_ONLY`. It inspected the existing audit/context/policy/CLI boundaries and identified required shared pure context/source-lock helpers, hash-before-parse, explicit finalized admission and preservation of the old CLI guard. The written design verifies all 56 referenced photos, exceeding the consultation's selected-40 minimum. Helper names/placement in its example are proposals; the implementation plan owns exact interfaces without introducing runtime authority into Phase A.

Fresh native builder check: `nothing important left`. Bounded actual closed identity/root/capture seam review by primary `gemini-3.8-flash`/High in `calorix-v2-closed-boundary-source-review-20261030` returned explicit agreement and no must-fix findings, scope `ACTUAL_SOURCE_CLOSED_VERSION_IDENTITY_ROOT_CAPTURE_SEAM_ONLY`. It inspected both ledger identity assertions, root checks/factories, codec/report identity capture and file-store root construction. Its private-descriptor/expected-version/registered-handle requirements are incorporated; this does not guarantee whole-runtime regression freedom.

The initial combined whole-design/source request timed out after300s on3.8;3.7 and3.6 rejected server-supplied High. Exact failures were recorded before fallback; none counts as agreement. Bounded source consultations and whole written-document review are separated to stay within the tool budget, without changing models, effort, review requirements or using CLI reviews. Previous narrow conceptual consultations informed historical producer separation and runtime registration; they were not full-design approval. Earlier broad Phase B research timed out on primary and failed on the two High-incompatible fallbacks; exact errors remain recorded in the status file. Phase A data sign-off does not replace these design gates.

Whole written-document review, primary `gemini-3.8-flash`/High in `calorix-v2-runtime-design-20261030`, returned explicit `AGREEMENT_STATUS: agree` and `MUST_FIX: none`, scope `WHOLE_PHASE_B_V2_RUNTIME_DESIGN_ONLY`. This followed both bounded actual-source consultations and the fresh native builder check. The earlier combined timeout and incompatible fallbacks remain failures, not approvals. The four deferred plan decisions are shared module boundaries, registration/capture mechanics, exact manifest serialization and the negative-fixture inventory. All source162/root4/config3/canonical11/candidate hashes remained unchanged after review. Next is the concrete plan, not implementation or inference.
