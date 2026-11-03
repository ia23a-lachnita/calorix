# Calibration failure diagnostics — read-only investigation

Date: 2026-11-03. Branch: `docs/calibration-failure-diagnostics`, based on `29ffa7ab6c53510a6fdf3c2894075ea8b36bd2c2`. This investigation changes reports/tracking only. No application code, model request, token-count request, prompt, source data, gate, provider route, saved account setting or deployment changed. The [failed V2 experiment](nutrition-calibration-v2-runtime-2026-10-30.md) and its lock remain sealed; neither profile is accuracy qualified. This work improves diagnosis, not measured accuracy or provider reliability.

## Findings supported by retained evidence

### Provider categories are deliberately discarded before journaling

The three `provider_request_failed` / `unknown` outcomes in `task5-native-development-01` cannot be assigned a more specific cause from the retained artifacts. Their approximately 28-second latencies do not establish quota or timeout failure. This conclusion does not say whether unexamined cloud telemetry exists.

The qualified source has four relevant boundaries:

1. [The runtime producer](../functions/src/nutrition-eval/calibration-runtime-evidence-producer.ts) catches an authorized raw vision rejection, verifies lifecycle/hook/authorization state, records the failed vision settlement and replaces the thrown value with a fresh static `CalibrationRuntimeProviderError`. It preserves no raw status/cause.
2. [Runtime capabilities](../functions/src/nutrition-eval/calibration-runtime-capabilities.ts) preserve independent first-fatal/poison precedence and rebuild private branded provider errors. This is trusted dependency injection and closed native authority, not a JavaScript sandbox. Arbitrary error properties are not proof of an ordinary provider failure.
3. [The live adapter](../functions/src/nutrition-eval/live-adapter.ts) propagates `CalibrationFatalError`, while other vision rejections become a generic provider-failure prediction. The exception reference is absent from that prediction.
4. [The stage driver](../functions/src/nutrition-eval/calibration-stage-driver.ts) writes `errorCategory: success ? 'none' : 'unknown'`. It has no trusted channel through which to receive the original provider category.

The [existing classifier](../functions/src/genai-adapter.ts) can recognize allowlisted HTTP statuses and some network/timeout codes before replacement. It directly reads status/code/message and must **not** be inserted into the guarded raw-rejection path without a new hostile-reflection/lifecycle design. Its privacy-safe return value alone does not make reading an arbitrary error object safe.

The installed SDK 2.19.0 `ApiError` constructor assigns an own data `status` property. A pure synthetic probe exercised nine statuses (400, 401, 403, 404, 408, 429, 422, 500, 503): the existing classifier recognized every category before static replacement and returned `unknown` after replacement. A synthetic private-message sentinel was absent from serialized summaries. Fetch attempts were zero. This is a wrapper/classifier probe, **not** a full SDK-to-producer-to-journal execution or evidence of the causes of the actual three failures.

### The largest macro error is already in the persisted raw nutrient fields

All four predicted nutrients exactly match `diagnostics.rawNutrients` in every successful development prediction: 23 LOW plus 22 MEDIUM. This establishes parity between those two persisted representations only. It does not recover raw SDK JSON, rule out earlier parsing/normalization errors, or prove global ground-truth alignment.

For the largest fat-error case, `calibration-dish_1565021965`, the report truth and candidate audit exactly match the pinned Cafe1 metadata row:

| Value | Official reference | LOW prediction | MEDIUM prediction |
| --- | ---: | ---: | ---: |
| Calories | 92.039993 kcal | 340 kcal | 350 kcal |
| Mass | 177 g | 125 g | 125 g |
| Protein | 17.700001 g | 22.5 g | 27.5 g |
| Carbohydrates | 1.239 g | 3.5 g | 3.1 g |
| Fat | 0.354 g | 26.2 g | 25 g |

The source identifies `ingr_0000000128`, egg whites, with ingredient mass 177 g and ingredient fat 0.354 g. Pinned Cafe1 metadata SHA-256: `881df31f27c2343d0ce219964527e0796f6ddadd60701ce6840fa801e8c2a960`.

Absolute fat errors are 25.846 g / 24.646 g. Exact-positive relative errors are **ratios 73.011299435 / 69.621468927**, equivalent to **7,301.13% / 6,962.15%**, not approximately 70%. The large absolute errors must not be dismissed as merely small-denominator artifacts. No truth was revised and no outlier-excluded score or relaxed gate was used to reconsider qualification.

The host re-viewed exactly **one known development photo**, SHA-256 `8b06f3e06146fc70fa2ae3b91ce38f3878b48d297ea3e9ec8d163a5ca44cbc08`, 640×480. It shows white pieces on a single plate; visual appearance alone does not prove ingredients or explain the prediction. The reviewer did not view this photo. No validation/benchmark photo or output was opened. Persisted `detectedItemCount: 1` does not retain the predicted item name, so specific food-confusion, composition, prompt or structured-output explanations remain unproven.

## Verification and inspection scope

Run group: `calorix-calibration-followup-20261103`. All files, caches and temporary paths are task-scoped on verified ext4 `/dev/sda2`; no sizable `/tmp` artifacts were created.

| Check | Actual result |
| --- | --- |
| `existing-adapter-controls` | Native 0; two existing tests PASS, zero failures; 54 other tests excluded by the explicit name filter, not new suite-wide skips. |
| Ordinary provider control | `maps a thrown vision dependency to provider/provider_request_failed` passed. |
| Fatal precedence control | `rethrows the exact fatal from generateVision without scoring a provider failure` passed. |
| `provider-category-loss-probe` | Native 0; nine synthetic status cases; zero fetch attempts; no raw-error sentinel in serialized summaries. |
| Retained experiment completion proof | Native 0 after investigation: all 210 source/root, 71 compiled/SDK, eleven frozen V1, three protected configurations, and failed V2 bytes/modes/mtime/ctime preserved; runtime worktree clean and exact origin. |

Focused command: from the qualified runtime worktree's `functions`, `node node_modules/vitest/vitest.mjs run test/nutrition-eval/live-adapter.test.ts --maxWorkers=1 --no-file-parallelism --cache=false --testNamePattern='maps a thrown vision dependency to provider/provider_request_failed|rethrows the exact fatal from generateVision' --reporter=json --outputFile=<task-disk>/existing-adapter-controls.json`, with disk-backed `TMPDIR`.

Focused raw JSON SHA-256: `b38d9afd13332103e88f8878a4b351541b2ca2384d0caa72e17c5940645ba1e8`. Synthetic probe JSON: `65c93eaa79de7c3a2a64461b8ae8d85d75781aa975e7356d2352571e2defb71b`. The prior actual full software result remains 5,377 PASS / one existing skip; it was not rerun for a documentation-only investigation. No new end-to-end authority proof or live-provider evidence is claimed.

Auditor route: host read-only source/data analysis. Reviewer: Antigravity MCP `gemini-3.8-flash`, server-supplied High, conversation `calorix-calibration-failure-diagnostics-20261103`. Corrected research scope `FAILURE_DIAGNOSTICS_RESEARCH_DIRECTION_ONLY` agreed / `MUST_FIX: none` on supplied inline evidence; actual-result/document review also returned explicit agreement / `MUST_FIX: none`, scope `READONLY_FAILURE_INVESTIGATION_ACTUAL_RESULTS_AND_REPORT_ONLY`. The reviewer ran no commands and inspected no photos or raw SDK payloads. Initial response noise about percentages, conclusive upstream localization, globally unrecoverable telemetry, zero regression risk and zero Proxy traps was corrected. No model/reviewer/recovery fallback. UI diff counts, `auditLimited` and `visualClassificationStatus` are not applicable to this numerical/source investigation.

## Next bounded work and limits

The researched next direction is an **offline, hermetic design for a diagnostic channel at the native SDK boundary**, without changing the privacy-preserving intermediate wrappers. Only a finite safe category may leave classification; no raw error/message/cause/stack/URL/headers/credentials/prompt/response may enter a diagnostic map, callback or report. Existing classifier reuse is not approved.

The concrete design must settle original request/reservation identity, lifetime/generation binding, single-use read and cleanup, and the trusted publisher's exact consumption seam. It must show how a category reaches the existing journal only after a genuine ordinary provider-failure path passes all independent fatal/poison checks. Diagnostics confer no execution or report authority and may never authorize a retry or later stage.

Guard failure, foreign/stale request identity, reentry, pending callbacks, late settlement and duplicate consumption must retain fatal/poison semantics. **They must not silently become `unknown` scored outcomes.** `unknown` is only a classification fallback for an otherwise valid ordinary failure with unavailable/unclassifiable safe metadata. Descriptor access can execute Proxy traps; accessor getters must not be invoked, and before/after lifecycle checks must prevent swallowed trap reentry from masking a fatal event. Tests must cover those cases plus privacy and unchanged legacy serialization/control flow. A private map/hook expands state and API surface; it is not automatically safer or regression-free.

This is a researched direction, **not an implementation-ready or implementation-approved contract**. Source verification and pre-implementation Antigravity review remain necessary before code changes. No new live calibration protocol or budget is granted. Historical V1/V2 locks/results stay sealed; no new 2.5 call, model switch, corpus curation, prompt/gate tuning, migration or deployment follows from this document. Adding diagnostics would not itself repair cloud failures or qualify nutrition accuracy. The original whole-feature review's two deferred Minors remain unchanged.
