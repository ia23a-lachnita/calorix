# Nutrition calibration development result — 2026-10-29

Protocol v1 halted at the development quality gate. Execution and report publication succeeded, but neither profile qualified. There is no admitted profile, validation result, public benchmark result, production-readiness approval or deployment. Corrected Antigravity actual-result review agrees with this rejected-outcome disposition; it does not approve nutrition quality.

## Actual commands and route

- `task8-immediate-parent-test-verify-20261029`: literal `cd functions && npm run test:verify`, actual exit0/6968.106s; build/lint,4466defaultPASS+1oldskip,125rulesPASS,1emulatorPASS =4592PASS+1oldskip/67files. Four function definitions loaded, not four extra tests or an end-to-end trigger gate. Both data-emulator phases used demo-no-project.
- `task8-live-preflight-20261029`: literal `npm run eval:nutrition:calibration -- preflight`, actual exit0/59.379s;09:39:35.311082Z–09:40:34.691087Z. Two images of one development dish,LOWthenMEDIUM,one separate token-count invocation; healthy lock release.
- `task8-live-development-20261029`: literal `npm run eval:nutrition:calibration -- development`, actual exit1/477.191s;09:52:31.435033Z–10:00:28.626862Z. Public result `{exitCode:1,failureCode:"stage_failed"}`.
- Exact runtime provider Vertex AI,model gemini-3.8-flash,project calorix-xurschnell,location us,APIv1,LOW/MEDIUM,30000msSDKtimeout,no retry options/API-key route/model fallback. Every successful journal response reports gemini-3.8-flash; reported model-version metadata does not attest underlying weights.
- Implementation sourceee0674d163fe7a34c481df95a1d7c9bc5a25a5a4,Functions tree240c3bb2e04e86c96d4cdd82c84f5437985ba6d4,154source files unchanged. Live development started from tracking HEAD6c8d848. Node22.23.3 local evaluation; Node20 deployment compatibility not qualified. No new2.5 request of any kind.

## Development measurements

There are24distinct development dishes, each evaluated once per profile, not48independent dishes. These are development results against the frozen source annotations, not held-out/general accuracy estimates.

| Measure | LOW | MEDIUM | Frozen advance limit |
|---|---:|---:|---:|
| Parsed outputs |24/24|24/24|at least23|
| Unsafe completions |0|0|0|
| Catastrophic calorie misses |2|3|at most6|
| Median relative calorie error |27.61%|26.23%|at most35%|
| P90 relative calorie error |79.80%|60.83%|not a development advance gate|
| Mean zero-safe macro relative error |138.23%|139.95%|at most50% — FAIL BOTH|
| Median protein error |30.70%|31.24%|not a development advance gate|
| Median carbohydrate error |27.31%|33.55%|not a development advance gate|
| Median fat error |35.71%|29.73%|not a development advance gate|
| Median meal mass error |24.31%|22.48%|not a development advance gate|
| P90 analysis latency |7856.80ms|16994.14ms|at most30000ms|

The frozen comparator yields the pure candidate LOW because of fewer catastrophic misses. Native selection admission rejects the failing gate before any profile_selected event; LOW was **not selected into the ledger**. Both profiles' sole failed check is meanZeroSafeMacroRelativeError. The pooled zero-safe mean uses71positive-truth macro pairs; the one zero-carb truth is reported separately. All48development outcomes were uncached successful parses/source meal, and all48decisions need_review. No provider failure, parse failure or fallback explains the stop.

## Accounting and preserved authority

The canonical ledger contains50reserved/completedimages,50finishedruntimeattempts,50successfuljournalrows and one reserved/completedtoken count. This includes2preflightimages+48developmentimages. Failed development returns no aggregate SDK-method counter; successful outcomes enforce per-outcome deltas before publication. Ledger/SDK boundary evidence is not independent HTTP-count attestation or a universal opaque-retry proof.

Only preflight has stage_completed. There are zero profile_selected events and no validation/benchmark attempts. The lock remains present by the success-only release contract. One lock_recovery event records normal inter-command owner handoff after healthy preflight release; no explicit crash recovery, abandonment, retry or refund occurred. All11canonical files (ledger,journal,lock,and8reportfiles) are fingerprinted and preserved. No root reset,lock removal,threshold change,profile override or further inference is permitted within this failed protocol.

## Offline annotation and scene audit

All24exposed development truths exactly match the official fixed-column metadata. Both downloaded metadata files match committed source-lock length and SHA256; ingredient sums agree with dish totals within0.001. All24cached image hashes match their manifest pins. This establishes local mapping/integrity, not semantic correctness of the upstream labels. No held-out validation or benchmark cases were inspected.

Three of24development photos were manually viewed: dish_1558116547 (apple),dish_1564588719 (food on the main plate and a second plate entering from the upper right),dish_1565119642 (greens). Only the apple's two normalized outputs were manually examined. This is sampled visual investigation, not exhaustive visual validation.

The dominant macro outlier is the apple dish_1558116547. Its official image was fetched again and exactly matches pinned SHA256c13977d5e0d09b2112b37985d40b944ea16196eaff1775ca7a7a08057b4699a1. The hash-verified official metadata row has sole ingredient deprecated,144g,74.879997kcal,protein20.16g,carbs0.432g,fat0.288g. Both profiles predict95kcal,protein0.5g,carbs25.1g,fat0.3g. The carbohydrate relative error against that row is57.10185 (5710.185%). This is a credible annotation-quality concern; no corrected truth is established, and no local parser transposition is demonstrated. Only one of24development source rows contains a deprecated ingredient. The documented official ingredient_metadata.csv URL returned HTTP404. No substitute label was fetched or invented.

Independent arithmetic recomputes both pooled macro means. The top five positive-truth macro errors contribute76.3%/77.1% of the respective sums. Near-zero denominators and the disputed annotation affect interpretation, but no outlier was removed, truth changed, or accepted score recomputed. Three photos cannot establish the unique cause of all accuracy errors.

Primary source: [Nutrition5k repository and metadata format](https://github.com/google-research-datasets/Nutrition5k#dish-metadata). Raw pinned source rows remain local run evidence, not committed reports.

## Verification limitations and next boundary

The literal fresh parent verifier passed. A supplemental wide wall audit remains exit1: two driver cases took7226.076/5513.129ms against5000ms whole-case budgets despite passing assertions/native0. Prior same-source committed314focus qualified; a current unchanged two-case diagnostic passed at3620.533/2029.336ms. Corrected scoped external review accepted that local verification basis without asserting the wide walls all passed. Twelve other legacy wall observations (eight historical names,four newly observed) are retained in implementation-status.md. Unique resource/IO/GC cause is not proven.

All8published report artifacts were exhaustively checked programmatically:4JSONschema/hash checks and4Markdown-byte/hash checks against native bound receipts. This is not exhaustive image/output accuracy inspection. No UI diff run exists; run/diff counts,auditLimited,and visualClassificationStatus are N/A.

Task8 may close as execution/evidence of a **rejected,halted** outcome after review and tracking push. Task9validation16dishes andTask10benchmark20cases remain blocked/unrun. Keep production unchanged, do not compare these development scores to the historical2.5benchmark. Offline corpus-quality investigation remains in scope; any changed corpus/prompt/metrics/model or additional inference needs a separately reviewed versioned protocol. Unused ceiling headroom is not permission to retry.

## Immutable identities

| Identity | SHA256 |
|---|---|
| datasetHash | 2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56 |
| manifestHash | 313c37c14cb912d5dc6410dbb3b812139c22d7533d2341678de3ac860b0c1d6d |
| promptHash | 205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263 |
| responseSchemaHash | 1237ece38177ff83fcbb97fb0630718ca8943b0f17833721f19d4510876e94b0 |
| sourceLockHash | f1138680a38aa64eb400bc20c89ec656d771e8f3823ae09bed956a48eff2a43b |
| snapshotLockHash | 2b9d7b9baecb22ec20662f52010810fdb4f2fde3dd7c464d73b0cb56855003a1 |
| historicalReferenceHash | fd712bee2d4229bc8476d1cc25fce1a21172e6013c6abfe8949498cc5ce15acb |

## Report identifiers and hashes

- LOW `calibration-development-low-ee0674d163fe-20261029T095305466Z`: JSON `3e68e0760449f160f83b9e030e3175a4f912715c98e5b03bbebc127862820925`; Markdown `021a24a76627b361bfd9f24f9828232e1c1f11eddf6f4004a0d5784862d7bb59`.
- MEDIUM `calibration-development-medium-ee0674d163fe-20261029T095315725Z`: JSON `43401c3ef59dee40268cfe16c9450070ae78fb04bcea6a0ee2a1ac1dbf5b9924`; Markdown `4749a6927bcb7fc48c20e9eb70e8e8945f8836a1cdd735911041cd2a3ed9ff92`.

Preflight LOW `calibration-preflight-low-ee0674d163fe-20261029T094017539Z`: JSONdad81c14551fe010a2bc0add7f02981cfd6051d62a80de69bab1b69611b03c13,Markdownba71c99e75fcd0a737c8ce0e7fdcec7ccaadd7a1251d42f4485dbdb9674d5921.

Preflight MEDIUM `calibration-preflight-medium-ee0674d163fe-20261029T094022478Z`: JSON5eeb4ff6e2b4a28483ec002f64980485a5115d5f9ca83268a75ec036b0b9888e,Markdown3cdb93763cc748e2f7a431d105abc256f0d029f2f825f81707476bfcfbe3a278.

## Independent result review

Corrected Antigravity MCP primary gemini-3.8-flash (High supplied by server), conversation calorix-task8-actual-development-result-20261029: AGREEMENT_STATUS: agree; MUST_FIX: none. Scope: actual-result/hash/accounting/failed-gate review and rejected-outcome tracking closure, not nutrition/production acceptance. No fallback/tool error. Initial response noise explicitly retracted: one HTTP404 does not establish absent upstream corrections; apple annotation concern is not corrected truth or a proven sole root cause; no unsupported culinary-oil generalization; per-outcome SDK evidence is not HTTP retry attestation. Reviewer independently inspected the three sampled images; no exhaustive visual-output claim. Main rechecked all154source/config3/canonical11 after both review responses, unchanged.

## Execution rulings retained for audit

The native-controller stage closed before the real run. Its20rulings below retain their historical scope; statements that real accuracy was then unmeasured are historical, superseded only by the rejected development measurements above. No deferred native minor findings.

1. Ruling: reuse the existing clean linked worktree on new feat/calibration-native-controller, preserving prior feature branch and all parent work — worktree skill forbids redundant nested isolation — cost if wrong: historical worktree pathname names the prior feature; explicit branch and HEAD are authoritative.
2. Ruling: preserve the already completed unchanged-source postcommit full baseline instead of repeating it during setup; all148Functions/config hashes and dependency installation unchanged — no new concern justifies repeating65minutes before any source edit — cost if wrong: dependency/environment drift must be exposed by focused/final checks, and source/config fingerprints are checked now.
3. Ruling: normalize Task1/2/3 heading spacing to Task 1/2/3 for the literal task-brief extractor — editorial only — cost if wrong: heading-link consumers use new anchors; no behavior gate waived.
4. 2026-10-28T08:17:03.440225+00:00 Ruling: cap completely silent OpenCode tests-only attempts at5minutes from actual supervisor startedAt when output is only startupheader and no files/tool/patch progress; allow15minutes with genuine progress, and inspect active patch publication before stopping. This is bounded worker availability/delivery work, not an assertion of quota/provider failure. Cost if wrong: a legitimate late free response may be lost; preserve output and actual exit before canonical fallback, without weakening TDD/review gates.
5. Ruling: paid last-route uses the same exact claude-sonnet-5/bypass/headless route with stream-json+verbose and Read/Glob/Grep/Bash-only tool availability, so main can independently audit actual literal patch operations and tool scope. This changes observability/tool restriction only, not model/authority/review. Cost if wrong: extra task-owned diagnostic bytes; all gates unchanged and no Write/Edit/MCP/Agent tools.
6. Ruling: narrow the available paid worker to the fixture foundation first rather than accept a zero-file investigation as completion or extend a vague multi-hour phase. This stays inside Task1 file map/interfaces and normal route, with one bounded retry. Cost if wrong: extra small authoring turn; actual deliverable/scope/tests are independently checked.
7. Ruling: adopt the externally reviewed test-only witness/options amendment to satisfy existing normative observations and opaque-retry negative case, without changing any product contract. Cost if wrong: fixtures remain unaccepted until actual controls/driverRED and scoped review prove constructibility; no product gate weakened.
8. Ruling: token raw rejection with valid SDK delta vision0/token0-or1 is a known unknown failure; only success demands exact0/1, and illegal vision/token>1/invalid counters preserve pending — explicit same-conversation MCP token-boundary clarification resolves the approved contract completion-vs-failure distinction — cost if wrong: a known pre-SDK media failure could be misclassified; no retry/refund/new authority is allowed. Observed token boundary RED3PASS1FAIL then implemented exact proposal; finalGREEN pending.
9. Task 2: Ruling: replace ordinary settled image error in interruption test with controlled real-child normal exit before image settlement; add reserved SDK-entry cut — real state contract deliberately refuses recovery of a settled failure; no production change needed — cost if wrong: controlled normal exit is weaker than physical-crash evidence, explicitly not claimed. Actual focused2PASS/exit0, first244PASS1FAIL retained; final whole246 and reviews pending.
10. Task 2: Ruling: task-done validates the just-executed full actual246 receipt/nativeexit/source/AST/review instead of rerunning unchanged10minute tests solely to record the ledger — same retained-run rule usedTask1; Task3 full assembled focus/broad/committed gates remain — cost if wrong: this command is a receipt validator, explicitly not another test execution. Sourcecheckpointee0674d pushed/liveoriginmatched and checkoutclean.
11. Task 3: Ruling: hard-check source-derived raw wall budgets for all314focus and98newcases across wide receipts; preserve native Vitest callback timeouts/exits and every legacy assertion, separately audit every other legacy raw duration — corrected primary3.8 measurement consultation distinguishes whole-case hook-inclusive duration from callback timeout without lowering any timer — cost if wrong: legacy end-to-end case duration is an observation rather than a new hard performance gate; all such observations and historical matches remain explicit, including any newly observed slow case. Historical baseline audit found12 raw>callback bounds, not a current regression claim. No source/timer/test mutation or finalTask3 approval.
12. Final: Ruling: live3.8 nutrition accuracy set aside — retain unmeasured label and require separate parent live gates; fake SDK outputs cannot score real foods — cost if wrong: orchestration could be mistaken for accuracy; no default migration authorized here.
13. Final: Ruling: universal network isolation/opaque SDK retries set aside — qualify actual mediated SDK methods and independently distinguish fake transport attempts, no universal HTTP claim — cost if wrong: hidden retries may consume extra real quota; retain explicit limitation.
14. Final: Ruling: physical crash/power-loss durability set aside — controlled normal child exits establish only tested prefixes and explicit recovery, not physical persistence — cost if wrong: actual crash durability needs a separate physical-failure gate.
15. Final: Ruling: Node20/production readiness set aside — accept actual hostNode22 hermetic and function-load evidence only; Node20 and end-to-end triggers remain unqualified — cost if wrong: runtime-specific deployment failures remain possible until production-runtime gates.
16. Final: Ruling: automatic recovery/refunds set aside — preserve fail-closed consumed/uncertain history and require explicit operator abandonment; no retry entitlement invented — cost if wrong: manual intervention required after failure, with no automatic quota refund.
17. Final: Ruling: lock release after unsuccessful valid commands set aside — retain approved success-only release even on selected-profile mismatch; tests verify retained lock — cost if wrong: operator must inspect/recover a safe refusal before further work.
18. Final: Ruling: native helper token rejection classified unknown set aside — raw rejected port yields unknown, malformed returned token record yields empty_response; no additional introspection of caught errors — cost if wrong: pre-SDK media failures share coarse unknown category but cannot gain retry/refund.
19. Final: Ruling: unchanged wide suite reruns during review set aside — accept independently hashchecked actual receipts/source identity and retain required fresh postcommit314focus; no unchanged full DEFAULT duplicate for bookkeeping — cost if wrong: later environment drift outside pinned source may escape broad rerun, while committedfocus still runs.
20. Task 3: Ruling: task-done revalidates just-executed committedfocus314 plus retained actualparent/nutrition/nativeexits/source/AST/review instead of executing a second identical14minute focus solely to append completion — same retained-run policy asTasks1–2; actualrequiredpostcommit runfinished07:02:27.769817Z/exit0 — cost if wrong: ledger command is receipt verification, explicitly not another product-test execution; all required actualgates alreadyran.

Task8 rulings:

- Ruling: use existingNode22.23.3 for LOCALcalibration only rather than changeengine/source or installanother runtime — correctedprimary3.8MCP agrees bindingplan permits local eval with explicit caveat; no categoricalinstallationprohibition adopted — cost if wrong: Node20-specific compatibility or local latency differences remain unqualified; no production/security approval.
- Ruling: copy only pinned previouslyverified task-private recorder/wrapper into NEWscratch with exactpath/receipt-tag substitution, not restore/edit completed workspace — freshdryprobe verifies exact/symlink/worker/exclusion/sixflags/actual0+7; this is reusable verification tooling, not application change — cost if wrong: orchestration path/namespace error could omit or mislabel receipt; actualchildargv/nativeexit/source checks must fail closed.
- Ruling: record official2.5retirement/localfallbackrisk and defer deployedconfiguration/traffic inspection while qualifying dedicated3.8path — exactcalibrationfactory bypassesproductiondefaults; no categoricalreadban adopted and readonlyinspectionremainsauthorized — cost if wrong: currentproductionimpact staysunknown untilseparatemigration/readinesswork, so neverclaimliveoutageorproductionapproval.
- Ruling: accept literalTask8parentactual0 +priorunchanged-sourcewhole314raw-wallqualification +currentexact2focusedwhole-casewallpasses aslocalverificationbasis — correctedscopedMCPexplicitagree/MUSTnone distinguishesbindingTask8nativeexit0 fromsupplementalwallobservations; originalwideoracleexit1/twooverruns/12legacy(8known4new)retained, no edits/timeoutraise/greenwidewallclaim — cost if wrong: broad-contexttimingvariance remainsunexplained andunqualifiedforperformance, notproduction/Node20/security/accuracyapproval; allnativeCLI/source/accountgatesstillmandatory.
- Ruling: preserve protocol v1 as halted/rejected despite the apple annotation concern and investigate only exposed development data offline — frozen gates forbid post-result truth changes, reselection and retries; source integrity does not establish semantic label quality — cost if wrong: an upstream label defect may reject a capable profile and delay migration, while no passing or held-out accuracy claim is justified.
