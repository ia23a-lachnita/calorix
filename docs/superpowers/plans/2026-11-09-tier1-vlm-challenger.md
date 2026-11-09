# Bounded zero-shot VLM challenger

Execute inline with superpowers:executing-plans; user approved continuing this comparison and opted out of routine approval pauses. Binding authority: V7.1 Sections A/B/E/H, then V7. Keep the working Android flow and deployed A1 unchanged. This is development evidence, not completion of the separate 30-meal Android pilot.

## Constraints and current evidence

- Existing clean linked worktree, branch `feat/tier1-photo-pilot`, base `ae4a53efef45ef8fac60b3c5086f9803c11d1e8f`; original checkout changes preserved. Existing same-Tier1 native-edit exception remains applicable after recorded worker exhaustion; no permanent quota claim or new editing model.
- Read-only current US publisher-model GET: `gemini-3.8-flash` and `gemini-4-argon` HTTP200; Argon metadata says GA. `gemini-3.1-pro-preview` US404/global200. Metadata availability is not inference availability. No new SDK calls yet.
- Choose the US GA challenger pragmatically; no claim that its calorie accuracy is better. Model comparison controls the external harness, not internal compute, weights or routing. One earlier prompt failure does not prove other prompts cannot help.
- Same original prompt SHA7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566, schema SHA4306216d1b1b075e3994265d84527e1fc32fa29f80591201b1aab63d47288185, six USDA records, US endpoint/APIv1, LOW thinking,8192output cap,30s timeout,1SDKattempt/no fallback. No temperature parameter. SDK stays2.19.0 unless a separate justified/reviewed change is needed; no automatic upgrade or continuation.
- First one owned blank JPEG compatibility probe; if it fails schema/auth/timeout/model pin or does not produce explicit no_food, stop this candidate and record zero food attempts. Absolute new budget is at most21SDKcalls:1probe plus up to20food requests. No retries/resume/replacement/tuning.
- Food cases: reuse the whole frozen `manifest-mealrange-v1.json` ten public scans,274.19–920.12kcal,>=150g and>=2referenceingredients, ten dates. Reuse verified existing JPEGs, no downloads. Cases are already exposed development data; independence/pretraining exposure unknown. No reference labels or answers sent to inference.
- Preset consideration rule only: both10valid; challenger MAE and normalizederror improve; P90 not worse; no failure increase. No automatic promotion/deployment. Keep all failures/coverage/A0 limitations. Latency sequential-arm/cache confounded; cost, phone effort and consumed accuracy unknown.

## Task1 — One compatibility probe

Files: task-owned disk receipts only; this plan and status tracking.
- [x] Save corrected MCP pre-review and model GET evidence. Verify old frozen engine prompt/schema/catalog/dependency pins without changing source.
- [x] Exclusively claim the one-probe receipt before SDK entry; use owned64x64 gray JPEG, fixed production prompt/schema/settings but exact challenger model. Verify returnedModel before strict decoder. Record no_food as expected success, raw usage/latency/model and no food accuracy. Never retry a used claim.
- [x] Compatibility passed:exact4argon/explicitno_food,1SDKentry/0foodrequests/9,895ms. Incompatible branch not taken; no food accuracy claim.

## Task2 — Explicit research model profile and provenance

Only if Task1 passes. Files: functions/src/tier1-analysis.ts, tier1-public-eval.ts; tool/run_frozen_public_eval.cjs; new focused backend tests and existing Node guard tests; fixed profile/experiment metadata under functions/eval/tier1-public; an experiment-only launcher reusing audited executePair from run_bounded_portion_experiment.cjs.
Interfaces: named `TIER1_CHALLENGER_MODEL` and `inferTier1Challenger(imageBase64)`; private helper accepts model while production functions retain fixed defaults. Evaluator `expectedModel?:string` validates before mkdir, requires explicit infer for nondefault, stamps run.json and checks both provenance.model and returnedModel before recording success. Runner whitelist `vlm-challenger-v1` binds exact model/function/prompt from source-verified bundle. Original and earlier portion profiles stay unchanged.
- [ ] Test-first actual RED: original callable/request/hash unchanged; challenger exact model/same prompt/settings/provenance; model drift/nofood/one attempt; evaluator model metadata and failclosed guards; frozen profile whitelist; shared registry cap/restart/systemic halt behavior.
- [ ] Minimal implementation, focused GREEN/build/lint/Python/Node; clean commit/push. Freeze exact profile/source/input hashes and a separate canonical experiment registry with fixed original/challenger paths, max20 food calls and no reset/resume; old closed registries unchanged.
- [ ] Fresh independent source/input review; fix Important findings with actual RED→GREEN. Corrected MCP source agreement; canonical full CI/frozen bundle verification before food requests. No production deploy or SDK/dependency change.

## Task3 — Execute and retain actual evidence

- [ ] Run both arms once under registry after all gates. On infrastructure/auth/quota/model/prompt drift stop both; preserve partial results. No substitutions/extra requests or reference-derived answers.
- [ ] Complete served-kcal MAE/bias/P90/normfloor200, macros/mass/bins/coverage/failures/questions/tokenusage/latency/costunknown. A0 shares A1 recognition/preparation and only its covered subset can be scored; no overall ranking if coverage insufficient.
- [ ] Independent result arithmetic/provenance audit, corrected MCP result review, report and manifest/status updates, commit/push and clean checkout. Public evidence remains separate from Android pilot. Stop at the resulting major production/model decision, not routine checkpoints.

## Sources and pre-review

- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-argon — model ID, image/structured-output support, US and LOW.
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-argon — newer SDK requirements concern long continuations; older SDK short-request compatibility remains unverified until probe.
- MCP `calorix-tier1-vlm-challenger-20261109`, primarygemini-3.8-flash/yolo: corrected preplan AGREEMENT_STATUS agree/MUST_FIX none. Initialresponse added pureweights isolation, promptfutility, globalpolicyviolation and present-tenseprobe claims; all retracted/not adopted. No temperature parameter is set despite a generic reference in corrected response. Preplan approval only, not future source/outcome/readiness approval.

ActualTask2RED:twofocusedbackendfiles14PASS/6expectedFAIL20 (one new isolationtestalreadyPASS), missingchallengerexports/modelmetadata/guard. Nodeinitial14PASS/3expectedFAIL17; extra originalprofilemodelmetadataassertionRED next. No network in tests. Probe result is committed factual diagnostic metadata; ownedblankJPEG/privateprobe/rawproviderresponse remain task-owned disk. One probe consumed;20food-call cap stillunused.
