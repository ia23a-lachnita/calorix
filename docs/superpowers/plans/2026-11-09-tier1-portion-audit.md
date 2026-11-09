# Bounded single-call portion-audit comparison implementation plan

> Execute task by task with superpowers:executing-plans. User explicitly requests continuous autonomous work; no routine plan/checkpoint permission handoff. Existing native-edit exception, independent review, actual TDD, commit/push and MCP gates remain.

**Goal:** Compare one fixed actual prompt candidate against the unchanged A1 baseline on10 fresh public scans, then retain the evidence without automatic production promotion.
**Architecture:** Reuse SDK, strict parser/reconciler, public-evaluator injection seam and frozen-source runner. Share the existing request implementation internally; add a research-only prompt/export and explicit profile provenance guards. Default callable and Android request path stay on original prompt.
**Tech Stack:** Existing TypeScript/Node22, GoogleGenAI2.19.0, Zod; Python/Pillow11.1.0 for source-verified preparation. No dependency changes.
**Spec:** docs/superpowers/specs/2026-11-08-v71-binding-addendum.md A/B/E/H, approved Tier1 accuracy-debug roadmap; corrected MCP conversation calorix-tier1-portion-audit-20261109.

## Global constraints

- Pinned gemini-3.8-flash; LOW thinkingLevel (not temperature),8192output cap,30s timeout,1SDKattempt/no fallback; original six-record catalog/schema and exact baseline promptSHA7131abc1a34804893a785c500091401d7619708acd4994105a1a7d509d5e9566 unchanged.
- At most20SDK calls total (10original+10candidate),10PNG downloads; no retries/resume/replacements/tuning after outcomes. Failure/pending/unattempted cases remain in denominators. Stop on infrastructure/auth/quota/model/prompt drift.
- No app/server deployment, personal photos, reference-derived question answers, numerical confidence/medical/generalization/actual-user-effort claims. Published costs remain unknown if not actually measured.
- Exact candidate addendum, appended with one newline to baseline: “Before returning JSON, audit the portion estimates: include all visible pieces and piles in each component’s combined cooked edible mass. Do not default to a generic serving or a small sample. Check for both overestimation and underestimation of the entire visible serving; do not systematically increase amounts, infer unseen food, or double count composites.”

## Review focus

- Default model request remains identical; research export is not a new callable/client option. Verify original hash, model, endpoint, retry, image-only payload and production caller.
- Candidate metadata and actual result prompt hashes must agree; mismatch halts rather than writing a success under wrong provenance.
- Sampling excludes all legacy IDs/dates and current30IDs, but only2unused dates remain: explicitly permit/report cross-batchdate overlap, never claim independent held-out plates.
- Input/reference fields never reach the model; only the exact JPEG and fixed prompt. Dataset failures never trigger replacement images or reattempts.
- Parser/model/provider failures and partial runs remain truthful, including SDK invocations consumed before failure; no budget resets by a new output directory.

## Task1: Explicit research profile and strict execution provenance

Files: functions/src/tier1-analysis.ts; functions/src/tier1-public-eval.ts; tool/run_frozen_public_eval.cjs; new functions/test/tier1-portion-audit.test.ts, additions to tier1-public-eval.test.ts and tool/frozen_public_eval.test.cjs.
Interfaces: export TIER1_PORTION_AUDIT_ADDENDUM, TIER1_PORTION_AUDIT_PROMPT and inferTier1PortionAudit(imageBase64:string):Promise<Tier1Estimate>; default inferTier1 remains unchanged externally. Options.expectedPromptSha256?:string validates hex, stamps run.json and checks result; mismatch typed category prompt_drift/halts. Runner profile enum original|portion-audit-v1, selected only after byte/source verification; no arbitrary prompt override.
- [x] Write/run focused RED: defaulthash/settings invariant; candidate exactprompt/hash/oneattempt; drift/nofood shared; explicit metadata/mismatchhalt/invalidhash beforemkdir; runner unknown/missingprofile exports rejected before execution.
- [ ] Minimal implementation, focused GREEN, TypeScript build/lint and Nodeguards. Commit/push tracking. Mandatory MCP source review and independent review before live requests.

## Task2: Fresh deterministic10 and immutable manifest

Files: new tool/prepare_tier1_portion_audit.py and tests/test_prepare_tier1_portion_audit.py; committed functions/eval/tier1-public/manifest-portion-audit-v1.json and candidate profile metadata under eval.
Interface: select_portion_audit(dishes,test_ids,legacy_ids,recent_ids,recent_dates,vocabulary) returns cases/selection; CLI mirrors existing verified source/preparation pipeline and refuses existing output.
- [x] Tests first RED for quotas4[600,1000)kcal/3[200,600)/3(0,200), deterministicdate/ID ranks, uniqueness/exclusions/legacydates, no quota fallback and overlap disclosure.
- [x] Implement using existing source checks/parsers/converter/exclusive writer; fixed seed calorix-tier1-portion-audit-20261109-v1. Freeze selection before image results; up to10downloads, no retry/replacement. Record ready/failed assets and all source/image/JPEG hashes/Pillow versions. Allnewbatch dates unique; overlaps withold30 explicit.
- [ ] Commit manifest/profile/source and verify clean checkout before inference. Exact candidateprompt/hash and baseline/node/SDK/catalog/schema/source commits pinned. Build and independently verify frozen bundle; no productiondefault/catalog changes.

## Task3: Execute and report actual paired results

- [ ] Read-only project/ADC/model/endpoint preflight; explicit public-evaluation consent flag, no credentials printed or changed.
- [ ] Freeze max20 control receipt; original10 then candidate10, one SDK call per ready image. On systemfailure stop both arms; retain partial results and do not replace/rerun. No reference-derived answers.
- [ ] Recompute complete endpoints/coverage/failures, MAE/bias/P90/normfloor200/energystrata/mass, unansweredquestions, knownusage and rawlatency; mark missingfood gold/cost/phone/user-time unknown. Execution-order/cache confounding prevents latency causal claims. A0 remains shared-recognition conditional comparator.
- [ ] Prespecified consideration gate, not adoption: both10valid, candidate servedMAE and normalizederror improve, P90 notworse, no failureincrease. No automatic productionpromotion or post-result prompt tuning; evaluate the candidate’s actual complete output, not an isolated mass effect.
- [ ] Independent source/input/result review + corrected MCP agreement, relevant fullCI/build/lint. Retain public numeric/provenance reports, never photos/raw private artifacts/secrets. Commit/push accurate status; proceed only within the closed experiment budget.

Pre-review primary3.8 explicitly agrees/MUSTnone after correction: thresholds/floor are kcal, LOW is reasoning, no invented suffix wordcount, no guaranteed zero accidental exposure or prior ADC check. The actual call paths/guards must be tested. Existing older inference budgets stay closed; this is a separate explicitly bounded development comparison under the continued Tier1 execution instruction.

Actual tests-first: SDK/public13tests 7pass/6expectedfails (3missingcandidateexports,3profilemetadata/guard), originalrequest test alreadyGREEN; Node original5pass/new2fail; selector5tests errors with explicitNotImplemented contract afterinitialimportRED. All no-network. Next implement minimally thenGREEN/build/lint/independentMCPbeforelive; no image downloads or inference yet.

Implementation checkpoint: actual focused GREEN32Functions/5files, all44Python,8Nodeguards; TypeScript build/lint exit0. Extra explicit-equals profile regression RED7pass/1fail thenGREEN8. Ten selected before downloads;10ready JPEGs/406478bytes,10unique within-batchdates/eightold-dateoverlaps, no oldIDs/JPEGhashes reused. ManifestSHA d150ef3c0503487116a65337817f0eccff8a8ab48124d3ff47a4ca09cca88e63; candidateSHA1d2406db986503a127eb04367f692e1c87d1a9e58311d343de49e5ebb6a25e77. No SDK calls yet. Independent source/input review running; mandatory MCP source review/fullCI/frozen bundle/ADC preflight remain before calls. Default callable/request/schema/catalog unchanged.

Fresh independent source/input review016dbe3:0Critical/1Important/0Minor. Aggregate experiment-control gap fixed in one TDD pass: sixnewtests, actualRED9pass/5fail14 (one refusaltest alreadypasses onstub), GREEN14/14. Added experiment-only orchestrator canonicalGitcommon-dir wx registry keyed fixedmanifest; reserves botharms/fixedpaths/source/profile/hashpins; alternateoutputrefuses, noresume/deletion; original systemic/pending/missing/inconsistent receipt halts candidate, onlyknown perimagefailures continue. Genericrunner reusable, not adversarial accesscontrol. MCP repairpreplanprimary3.8 exactagree/MUSTnone; noSDK yet. Independent input audit reproduced6sourcepins/all10references/JPEGbytes/noEXIF/exclusions/eightdateoverlap/proximity. Final sourceMCP/fullCI required before dispatch.
