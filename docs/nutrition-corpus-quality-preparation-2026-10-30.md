# Offline corpus quality preparation

Offline Phase A is qualified: the finalized candidate contains 40 passed photos in the frozen 24-development/16-validation schedule. Source and photo checks, native finalization, read-only verification and independent review passed. Nutrition accuracy remains unqualified; no calibration protocol or inference budget is activated, and the deployed model is unchanged.

The tool selects a separate 24-development/16-validation candidate set from pinned Nutrition5k sources. It excludes the 52 quarantined IDs, deprecated or unknown ingredients, and existing semantic exclusions before ranking. Public downloads require explicit opt-in. Image review binds each decision to the case, image hash, checklist and append-only correction history. Finalization requires 40 selected passes; verification reproduces source, image, selection and consideration history without downloads or writes.

Candidate artifacts cannot be consumed as existing calibration manifests. No provider client, calibration ledger or inference budget is constructed by the command.

## Verification evidence

Run `task2-parent-test-verify-02-20261029` executed the literal `cd functions && npm run test:verify`:

| Population | Passed | Existing skip | Physical test files |
| --- | ---: | ---: | ---: |
| Default | 4,541 | 1 | 68 |
| Firestore rules | 125 | 0 | 1 |
| Backend emulator | 1 | 0 | 1 |
| Total | 4,667 | 1 | 70 |

The parent and all three test processes exited 0. The run started on October 29 at 18:18:30.744 UTC and finished at 19:46:55.651 UTC, taking 5,304.906 seconds. Exact comparison preserves all 4,467 previous default case/status entries and adds 75 passing cases: 34 policy, 21 audit and 20 CLI cases. The raw case status for the existing skip is `skipped`; Vitest reports it in `numPendingTests`.

The final focused run passed 197 cases, including the unchanged 122 corpus tests. Final standalone build and lint also exited 0. All 162 Functions source/input files, four root verifier inputs, three protected configuration files and 11 frozen calibration evidence files matched their recorded fingerprints.

| Receipt | SHA-256 |
| --- | --- |
| Default | `df5b04cb721f785e080553ba1818d8e15323b7b8b1093cdb6302b4dec4c663d7` |
| Rules | `f262be8b4c7208ac628f0ad0d513646e75c28d72276401919f631429dafd7290` |
| Emulator | `4f59df31960810abb22c64f62c2b4e3802669eac4e8fda6d5cc793b70edfecbb` |
| Parent log | `56538450535882eaad782d3f9f51c8aa27810307da16558d87609741e11ed647` |

The task recorder added only six serial/reporting flags. It changed no test selectors, assertions, retries or product timeouts. Temporary files, Java temporary storage and caches used disk-backed locations.

## Independent review and fixes

One fresh native reviewer inspected the whole feature. Two important findings were reproduced with failing tests and fixed:

- Consideration history now replays the exact next selected slot across photos, skips and QC decision prefixes. It rejects invented same-stratum slots and never-reached skips while preserving legitimate rejection, replacement and correction histories.
- Publication synchronizes file contents before rename and the containing directory afterward. Newly created artifact directories and their parents are synchronized. Fault tests verify ordering and failure reporting.

The corrected focused tests and full parent passed. Antigravity MCP, using `gemini-3.8-flash` with server-supplied High effort, agreed with no must-fix findings for source-only review in conversation `calorix-offline-corpus-quality-implementation-20261029`. The corrected final review of actual source and parent receipts also returned `AGREEMENT_STATUS: agree` and `MUST_FIX: none`, scoped to the offline tool and hermetic verification. It explicitly withdrew an earlier overclaim that the file inventory proved Git cleanliness: the inspected task-owned edits were still pending commit. Reviewer source inspection is distinct from the host's executed tests.

One minor finding is deferred: several semantic errors share the sanitized `operation_failed` category. These commands fail closed, but more specific categories would improve operator diagnostics.

## Limits and next work

Both backend emulator phases used `demo-no-project`. Four function definitions loaded; the function-only phase did not execute Firestore triggers. The host used Node 22 despite the requested Node 20, and retained the outdated SDK and ADC warnings. This is local verification, not production runtime, security, deployment or end-to-end trigger approval.

Google's [runtime lifecycle schedule](https://docs.cloud.google.com/functions/docs/runtime-support), checked October 30, lists the declared Node 20 target's decommission date as October 30, 2026. A supported deployment runtime and corresponding SDK/CI/staging qualification are a separate release requirement. The actual deployed runtime has not been queried; this records source readiness rather than an observed service outage. Scoped Antigravity review agreed with recording that boundary. No engine, SDK, workflow or deployment setting was changed during curation.

Path checks address accidental existing symlinks rather than hostile same-user filesystem races. Header inspection verifies image metadata; actual pixel readability and scene quality require viewing every considered photo. Operator QC and source hashes do not certify physical food mass, hidden ingredients or nutrient truth.

The initial preparation produced 40 photos and 30 HTTP 404 skips. Its outer terminal ended with code 143 without a native wait receipt. A fresh cache-only preparation reproduced the retained inventory and exited 0 in 49.126 seconds, without replacing bytes or downloading again. Subsequent replacement preparations exited 0 in 293.455, 188.691, 158.331 and 169.302 seconds. All 56 considered photos were individually viewed, and all 56 native CLI decision receipts match those hash-bound observations: 40 passes and 16 rejections. Rejections comprise six uncertain scenes, six clipped targets, three additional food-bearing containers and one unresolved gross label conflict. All 40 selected IDs have a latest passing decision. There are 31 retained HTTP 404 skips. No superseding correction or discarded passing case was needed.

## Final candidate qualification

The native finalization run `task3-finalize-20261030` exited 0 in 55.063 seconds. Run `task3-final-readonly-verify-20261030` exited 0 in 29.844 seconds and reported 56 photos, 31 skips and zero pending cases. Comparison of all 63 candidate filesystem entries found identical file hashes, sizes, modification times, modes and directory layout across verification. The actual candidate is rejected by the existing strict v1 manifest parser; the native probe exited 0.

| Identity | Value |
| --- | --- |
| Candidate | `calorix-n5k-quality-candidate-v2` |
| Producer commit | `eb8431e0167091a75fe46bfc84c7da431c51ccb6` |
| Producer Functions tree | `3c5dbe35b4946524a085e01df79b2c0283b8ca11` |
| Source lock SHA-256 | `a9f0b32112a92efcd3cc911f9142973732770398b545cd1aed4cdb8f16d38bc9` |
| Reviewed draft raw SHA-256 | `9c4b0134670d101fa95085d28f71a0e6f6c536ea264f3831100c82415be40877` |
| Final audit raw SHA-256 | `3b8bd3280a1d2941082a8d95422e62336b93222022fd6d2f4528aa23980e8b2b` |
| Quarantine digest | `4f348798181f1eb1ae8dbd73fb0bfb0b8c14bb973b02bd5be06afc0be5627066` |

Finalization changed only the status from `draft` to `finalized`. Replacing that one status string reproduces the reviewed draft bytes exactly. All 40 selected dishes have unique IDs, no quarantined ID and a latest passing hash-bound decision. No passing candidate was discarded and no correction superseded an earlier decision.

| Partition | Count | Component bins | Calorie bins | Macro bins |
| --- | ---: | --- | --- | --- |
| Development | 24 | 8 / 8 / 8 | 8 / 8 / 8 | 8 / 8 / 8 |
| Validation | 16 | 6 / 5 / 5 | 5 / 5 / 6 | 5 / 6 / 5 |

Pinned metadata contains 4,059 training IDs, of which 3,996 are eligible before image checks. The 63 exclusions comprise 40 old training IDs, 22 dishes with deprecated ingredients and one nonpositive calorie total. All 52 quarantined IDs remain excluded; the additional 12 benchmark IDs are outside the official training split. No old validation or benchmark image/output was inspected.

Antigravity MCP `gemini-3.8-flash`, with server-supplied High effort, reviewed the actual mutable inventory before finalization and the final hash/results afterward in `calorix-corpus-quality-candidate-qc-20261030`. Both returned `AGREEMENT_STATUS: agree` and `MUST_FIX: none`. Final scope is `OFFLINE_PHASE_A_CANDIDATE_QUALIFICATION_ONLY`. There was no review fallback for these gates.

Visual scope is explicit: the main agent individually viewed all 56 considered valid downloaded photos, including every rejection. The independent reviewer rendered four samples and agreed with their two passes and two rejections. It did not independently view all 56. An earlier one-photo ingredient-absence overclaim was corrected: an invisible subordinate ingredient is not evidence of absence. The unresolved prominent unannotated component remained rejected, and uncertain neighboring food/residue remained `qc_uncertain` without inventing corrected truth.

All 56 native decision commands exited 0 and match the image hashes and recorded observations. Public downloads, assistant visual inspection and independent MCP review are separate from food-calibration inference: zero new food-prediction or token-count SDK requests were made. The complete source/input, protected configuration and frozen v1 fingerprints remained unchanged after both reviews. The full backend suite was retained from the exact unchanged source; it was not rerun for this data/documentation stage.

This is a clean-scene diagnostic corpus, not a representative app workload or measured nutrient truth. Similar/incremental-looking plates were observed; dish-ID disjointness does not prove independent plate families or absence from model pretraining. The failed v1 results and lock remain frozen. Next is a separately reviewed v2 runtime/version/budget design. The proposed 146 new images plus one token count is not activated by this qualification. No model default, prompt, response schema, nutrition gate, deployed resource or production data changed.

<details>
<summary>Complete implementation decision ledger and deferred finding</summary>

These are the recorded rulings in their original order, including the cost if wrong. They preserve implementation tradeoffs rather than extend the qualification scope.

- Ruling: use three bounded tasks with full parent verifier after assembled source (Task2), focused/build/lint atTask1 — reviewedplan keeps expensive broad gate beforeacceptance, rather than callingpartialtool production-ready — cost if wrong: integration concerns betweenTask1andTask2 remainpendinguntilassembledgate; neverclaimfullverificationearly.

- Ruling: first worker delivers tests plus minimal throwing stubs only after testsource, not algorithms — genuine behavioralRED is required, missingimportsnotaccepted — cost if wrong: scaffolding can accidentallyimplementbehavior; hostdiffandrawassertionchecks enforce boundary.

- Ruling: silent worker bounds5min withoutactualprogress, absolute15min per invocation — avoid unboundedCLIwaiting whilepreservingactualexit/logs andcheckingfilepublication — cost if wrong: latelegitimateoutputcanbelost; noquotaexhaustioninferredwithoutprovidererror.

- Ruling: probe OpenCode with task-local XDG_CONFIG_HOME rather than alter user-owned global config — reversible worker-only environment can bypass startup invalidity without changing approved model/routes — cost if wrong: provider settings may be absent and route remains unavailable; exactcatalog/worker results must be recorded, no food-runtime retry.

- Ruling: paidlastworker retains exactclaude-sonnet-5/headless/bypass route, with builtin tools only andstrict task-emptyMCPconfig — prevent unrelated MCP startup/resource use or review substitution — cost if wrong: needed tool unavailable becomes exactworkerfailure; approvedmodel/authority unchanged.

- Ruling: source digests are rawSHA and quarantine digest is SHA256 of UTF8 JSON.stringify(sortedUniqueIDs) without newline; stable primaryexclusionpriority v1/benchmark/oldsemantic/unknown/deprecated — make audit replay unambiguous without newruntimeauthority — cost if wrong: primary counts hide secondaryreasonoverlap and serialization changes require audit regeneration; all excluded rawsource remains pinned.

- Ruling: use user-authorized native editing fallback for remainingTask1/PhaseA after ordered routes unavailable/quota/invaliddelivery/boundednondelivery — no permission needed under standing2026-10-28rule; no sourcebehavior beforeRED, mandatoryreviews/fullverify/commitpush remain — cost if wrong: main authoring has less worker separation, independentreviews remainmandatory.

- Ruling: task-done validates retained just-executed156focus/build/lint/actualsourceprobe/nativeexits/sourcehashes/MCP instead of rerunning unchangedtests merely toappendledger — actualverificationalreadycollected inthissession, assembledfullparentstillmandatoryTask2 — cost if wrong: ledger command isreceiptvalidation, not anotherproducttestexecution.

- Ruling: use single audit.json with immutable finalizedstatus rather than two-file finalization authority — one atomic replacement avoids inconsistent finalartifact/marker pairs — cost if wrong: consumers must read the finalizedcandidate fromaudit.json, not a separate exportfile.

- Ruling: draft selection may be null only for provable same-stratum exhaustion, preserving the final rejection/skip prefix; finalized artifacts alwaysrequire40passed — retain evidence instead of losing the action that exhausted a stratum — cost if wrong: callers must distinguish exhausteddraft from readycandidate, never infer readiness from zero pending.

- Ruling: review the completed draft photo inventory before irreversible-by-tool finalization, then review finalhash/results asplanned — catches QCfeedback while superseding corrections remainavailable; no food predictions — cost if wrong: one extra scopedread-onlyreview, finalartifact gate stillmandatory.

- Ruling: use a file-scoped60s fixture test/hook budget for real fsync on this Pi, not the default5s — actual initialslowtest exceeded5s without productfailure, allproductiondownloadtimeouts remain30s — cost if wrong: a true fixture hang takes longer to report; raw initialtimeout retained.

- Ruling: persist each considered photo/skip originalslot and deterministicrank, verified against source stratum and schedule — explicit originalspec provenance would otherwise be lost when QC moves later slots — cost if wrong: a schema field expansion in this new, not-yet-used candidate-only artifact; no runtime/v1schema change.

- Ruling: run the one native whole-feature source review before the expensive parent verifier completes; actual result review remains MCP/host afterward — find code defects before spending a two-hour Pi gate while preserving one fresh reviewer — cost if wrong: native source verdict is not a fullparent-result approval; tests/MCP must independently close that gate.

- Ruling: parent runner uses task-empty Firebase CLI config and explicit demo-no-project identity with absent.firebaserc — isolate emulator qualification from active cloud account/project, retaining literal npm run test:verify and unchanged assertion/time budgets — cost if wrong: missing optional CLI settings may cause an explicit gate failure rather than using real-project configuration.

- Final: Ruling: actualcandidatephoto/nutritionquality is deferredtoTask3, not judged bysource reviewer — no photos fetched, sourceapprovaldoesnotqualifydataset orcalories — cost if wrong: later photoQC may rejectmany candidates or reveal datasetlimitations.

- Final: Ruling: fullparent/prodreadiness is outside this earlynative sourceverdict; retainliteralparent+MCPactualresults beforeacceptance — reviewer hadnoactualfullgateresult — cost if wrong: source reviewcannotcatchintegration/runtime-only failures untilparent.

- Final: Ruling: hostile same-user filesystem races remainoutside explicitstaticsymlinkconfinement — fixed-roottoolfortrustedlocaloperator, not asecurityboundaryagainst auser controllingthecheckout — cost if wrong: hostileconcurrentfilesystemreplacementcanracesafe-pathchecks; nosecurityapprovalinferred.

- Final: Ruling: headerinspectiondoesnotprovepixeldecodability — reuseexistingmetadatahelper plus actualTask3viewerQC, no newdecoderdependency — cost if wrong: structurallyvalidbutunreadableimage mustbeQC-rejected ratherthanpassedautomatically.

- Ruling: Task2task-done revalidates retained actual197focus/build/lint/fullparent4667+1/source/MCP receipts rather than rerunning unchanged88minute productgate — sourcebytes remainidentical andfullgatealreadyexecuted, docs-onlytrackingdoesnotjustifyrepeat — cost if wrong: completion command validatesreceipts, notanother producttestexecution; originalnativeexits/rawmultisetsretained.

- Ruling: detach task-owned orchestration supervisor from outerterminal to retain real nativewaitreceipts for longQCbatch afterobservedouter143 — previousnativeoperationfinishednormallybutattachedsupervisorlostreceipt; preserveallrawlogsandusefreshcacheverification — cost if wrong: ownoperationcanoutliveterminal, so cancel/cleanupmustinspectrecordedownPIDandstate; noforeignprocess/lockactions.

- Ruling: preserve existingbranch/PR/workflowstate ratherthanopen a135841-line490-commitPRjust totriggerCI — actualVerifyworkflowrunsmainpush/PR-to-mainonly, actionsenabled/noopenPR/nofeaturebranchruns, so remoteNode20qualificationremainsabsent; giantunrelatedintegrationisnotneededforcurrentofflinecuration — cost if wrong: localNode22hermeticqualificationdoesnotcloseproductionNode20/CIgap; properintegration/CIworkstillrequiredlater. No workflowsetting/provider change.

- Ruling: Task3 task-done validates just-executed native finalize/read-only verify, all56 native QC receipts, exact source/pin/image/final-hash invariants and MCP rather than rerun unchanged full backend suite for data/docs — source162/root4 identical to actual reviewed4667PASS+1oldskip gate, no product integration or source edit occurred — cost if wrong: this validates retained full-suite evidence, not a new full-suite run; later runtime changes require their own assembled gate.

- Ruling: retain this feature branch and isolated workspace without merging or creating a giant unrelated PR — user-authorized commit/push checkpoints and next-roadmap work do not authorize integrating490 older commits into main — cost if wrong: integration and remote CI qualification remain outstanding; no active/unmerged remote branch is deleted.

Deferred findings:

- Final: minor (deferred): semantic pin/supersession/hash/audit errors collapse to operation_failed; stable sanitized categories would improve operator diagnostics; commands still fail closed withnonzeroexit.

</details>
