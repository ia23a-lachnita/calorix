# Two-pass meal accuracy development

Candidate1 was rejected after its actual24-image trial:24/24parsed, but calorie median21.1570%,P9067.5869%,severe3,zero-safe macro1.518007 missed the original MEDIUM progression targets. Its retained response explicitly named an egg-white dish as mozzarella. See [all24 prior outputs](nutrition-accuracy-development-2026-11-07.md). This experiment tests a concrete repair, not another unchanged-model baseline.

The new opt-in candidate first inventories visible components, preparation, identity evidence, estimated mass, alternatives and scale uncertainty from the image alone. A second request receives the image plus that tentative inventory and estimates nutrition using the unchanged final schema/parser/scorer. It can correct the preliminary identification. Neither request receives case IDs, truth, known-dish examples or historical outputs. The same model family is used twice; independence means a separate first request without prior nutrition predictions, not statistically independent model errors.

Both passes use Vertex / calorix-xurschnell / us / gemini-3.8-flash / APIv1 / MEDIUM /30s, SDK2.19.0. The exact same24FINAL development inputs/truths are reused. At most48actualimageSDKmethodinvocations,24logicaldishanalyses,zero token-count/warmup/retry/fallback. Failed inventory skips nutrition and stays a failed case. New exclusive root two-pass-v1 cannot restart/reset/resume; all prior failed experiments remain preserved. Combined workstream budget at most172images (prior124 plus48new), not172successful predictions. Prior token counts are historical, no new token count is allowed.

## Implementation verification

Actual focused TDD:3PASS24FAIL against typed throwing stubs, then27PASS. A root-directory executable-path error exited127 before testing and is not counted RED. The rejected editing-worker tests asserted stub errors on empty arrays; they were archived and replaced rather than counted as verification.

Combined qualification controls01:321PASS,0FAIL,0SKIP,eightfiles; all294oldcase/statusinstances preserved. Build/lint each native0. Raw test JSON SHA `bbba2c9ad722cedb80dc040ef093ab5ff59a4198c618f9ae6399f3cf4837f253`. All211previousFunctionsfiles remain byte-identical, including production and prior candidate paths; only four new source/test files. This is focused qualification, not a new run of the older5,377-test parent suite. No Flutter/UI source changed or device/visual-parity claim made.

Native filesystem tests use fakeSDK and mocked positive asset verification; the missing-cache negative uses the real offline verifier. They verify once-only publication, journal ordering, actual48/47counts and24outcomes, not real food accuracy, power-loss durability or hostile-process containment. Inventory responses are capped at16KiB before strict local parsing; nutrient diagnostics retain text only up to64KiB while the original full response still reaches existing parsing/scoring. This does not bound total SDK response memory, hashing or full nutrition parser memory.

One fresh read-only whole-feature review completed:0Critical,0Important,3Minor. All215source pins matched before/after; reviewer ran no tests/build/inference or credentials. Minor findings deferred: generic dish reports attribute invalid inventory to provider failure (stage.failureCode is authoritative); oversized nutrition may lack raw text (do not claim exhaustive raw audit); direct boundary tests absent for21components/instruction-like strings/unresolved persistence (controls inspected correctly). No source change required and no native re-review dispatched. These findings are not production approval.

Corrected Antigravity3.8/serverHigh implementation/hermetic-results gate explicitly returned AGREEMENT_STATUS agree, MUST_FIX none, scope TWO_PASS_IMPLEMENTATION_AND_HERMETIC_RESULTS_ONLY. Initial memory/fsync/branch/asset overclaims were rejected and corrected in the same conversation. Positive asset mocks, SDK-only counts and oversized audit limits remain disclosed. Corrected preimplementation design/plan/48callbudget gate also agrees/MUST_FIX none. Source215 unchanged across both reviews.

Ordered editing routes were attempted under current task bounds: Grok unknownmodel, Qwen explicit403quota, Ultra/Muse1.3/Ling absent refreshedcatalog, Lightning invalid behavioral tests, BigPickle core/native each300s without file progress, paidSonnet300.459s empty/native143. No quota exhaustion inferred from silence; no spend-cap message, so the special subscription-usage probe rule did not trigger. The standing native-edit exception applied, with TDD/review/verification/commit/push gates retained. The global OpenCode config’s invalid plugins key was bypassed with an existing isolated task config, without editing global/user configuration.

## Actual measurement — completed, rejected

Run `accuracy-two-pass-v1-b6907187610e-2026-11-07T22-10-18-077Z`; execution HEAD `d2df80c413aee76c94fd1c2178dd8b49343348ec`, implementation `b6907187610e680941d5e11f0211296cd6c1a0e5`, Functions tree `4141e2f4d232d9412b587480e72d2d62e96dfde3`. Native0,326.502s. Fixed Vertex/calorix-xurschnell/us/3.8/v1/MEDIUM/30s, SDK2.19.0. Composite prompt SHA `7fdb9618816a1297ec67902cc7d160d23b9c2aa88ae7939a39d3af07db31ad11`. No fallback/recovery/retry/warmup or new token count.

**16parsed/24attempted;40actualimageSDKcalls=24inventory+16nutrition,24logicalanalyses.**40reservations/40stageoutcomes/24dishoutcomes. Seven inventory failures each contain four alternatives where local validation allows three. The outgoing schema/prompt omitted that limit, so these are our request/validator contract errors, not provider failures. One actual provider-stage failure is sanitized HTTP5xx on dish1560543605, no exact5xxnumber or raw payload retained. Generic report labels all8provider_request_failed; stage failure codes are authoritative. Seven original22successes and eight candidate1successes lost: progression vetoed. Known egg-white outlier was again named mozzarella in inventory but rejected before nutrients; no final nutrient prediction exists, and no fat-error fix is claimed.

| Metric | Original MEDIUM | Candidate1 | Two-passV1 |
| --- | ---: | ---: | ---: |
| Parsed/attempted |22/24|24/24|16/24|
| Calorie median relative error |18.4409%|21.1570%|22.9727%|
| Calorie P90 relative error |45.4632%|67.5869%|69.8731%|
| Severe calorie misses |2|3|3|
| Unsafe complete |0|0|0|
| Zero-safe macro mean (pairs) |1.506471 (66)|1.518007 (72)|0.572686 (48)|
| Legacy macro mean |0.718810|0.716847|0.393299|
| Protein median relative error |18.4934%|19.6607%|21.9546%|
| Carbs median relative error |23.5714%|22.0517%|27.5787%|
| Fat median relative error |25.8394%|32.9624%|46.3961%|
| Mean mass relative error |29.4905%|26.0022%|30.5035%|
| Median mass relative error |21.1467%|18.5604%|25.5007%|
| Mean carb-density relative error |39.2316%|37.1073%|19.3313%|
| Mean fat-density relative error |515.1464%|516.2767%|93.7214%|
| Median/P90 latency |7.627/20.474s|7.846/10.476s|13.515/17.189s|

Accuracy uses parsed cases, so reduced macro averages are not improvement evidence. On the common15successes, new calorie median21.4032% vs20.3593%,P9051.8472% vs39.6736%,zero-safe macro0.565540 vs0.497782,severe2 vs1: these metrics worsened. Other diagnostics need not all worsen; common mean mass error29.9730% vs30.6404% slightly lower. Single-sample, noncontemporaneous evidence does not establish causal decomposition effects. Full24coverage remains primary. Candidate fails progression and absolute meanmacro<=0.50/fatmedian<=0.35; do not promote. All16parsed predictions need_review solely nutrition_basis_ambiguous; eight failed cases are not successful review predictions. Unsafe0 is not accuracy evidence.

All24numeric rows and40stage records were independently audited against image/truth/manifest pins, request counters, journal ordering and completion digests. All39retained structured JSON responses have matching byte lengths/hashes; the provider failure has no response and no missing text was invented. No oversized result. Source215/runtime75/cache24 unchanged throughout. HistoricalV1/V2/candidate1 raw bytes/modes/mtime/ctime remain exact; source/runtime version snapshot retained before any next repair. The audit initially compared file-type-inclusive stat mode with permissions-only pin; representation was corrected and metadata matches. This is a host audit correction, not a model rerun.

Complete/report/diagnostics/events SHA respectively `18cae75f6aa44ad04fa4168aa58a0816f7c9a811a75db3f9f6120c9ec18f91f0`, `b82215b48bb04be291be2dfab8b9f1e5e9f2a5208623f58f248fa1737f8fb9c7`, `eb009b7e700b1a8688256ee90eb69134a5a8895ba2fd3aecf1366e6e7291343b`, `979ec5ea5f10a17b1805865cd52c47e84d2e2d388d1ec31d7443134f194a6c8b`. Raw SDK precedence banner followed by valid completedJSON was handled explicitly; no wrapper-output ambiguity or rerun. SDK counts are not HTTP/server-execution attestation.

Fresh scoped account probe passed9checks/sixunderlyingCLIexits0,14.287s,timestamp2026-11-07T22:09:51.530859Z; correct project/ADC/API/billing context is not subscription entitlement or quota guarantee. One known-outlier source photo was inspected by host; this is not exhaustive photo verification. Antigravity inspected supplied numerical/structured evidence, zero photos. No UI-diff run; auditLimited/visualClassificationStatus/diff-status counts are not applicable to this backend experiment.

Corrected Antigravity3.8/serverHigh actual-results conversation `calorix-accuracy-two-pass-actual-results-20261107` explicitly agrees/MUST_FIX none, scope ACTUAL_TWO_PASS_V1_RESULTS_ONLY. Its initial request to retain raw HTTP payloads was rejected under the privacy contract; overclaims that all individual gates/all metrics failed or that causal compound error was established were corrected. It recommends offline contract repair, then a separately reviewed HIGH single-pass trial; no new plan or request budget is approved by this result signoff.

The next concrete repair is to emit the alternatives limit in the wire schema and prompt without relaxing validation, trimming retained responses or hiding failures, and test that offline. Google documents array maxItems in [structured output](https://ai.google.dev/gemini-api/docs/structured-output); this is schema guidance, not food-truth assurance. The next accuracy hypothesis is single-pass3.8 HIGH with the same candidate1prompt/cases, reducing new calls to24 rather than repeating48immediately. [Google’s thinking support table](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking) lists LOW/MEDIUM/HIGH for3.8Flash, defaultMEDIUM; no empirical HIGH benefit is claimed. That profile/budget requires its own concrete review before execution. Actual cumulative priorimageSDK164 (100old+24candidate1+40two-pass); another24wouldcap188, unused8fromthis sealed attempt are not replay credit. Heldouts and saved2.5 remain untouched; no deployment.

### All24 final outcomes

| Case suffix | Final result | kcal prediction/truth | Inventory issue |
| --- | --- | --- | --- |
|1564761388|Scrambled Egg Whites|68/54.599998|none|
|1563220087|Pepperoni pizza slice with steamed broccoli|138/162.740005|none|
|1564428515|Roasted Chicken with Cauliflower and Mixed Salad|335/484.618347|none|
|1565021965|failed; no nutrition estimate|—/92.039993|alternatives_count|
|1563898722|Scrambled Eggs with Steamed Broccoli|195/343.350006|none|
|1566333291|failed; no nutrition estimate|—/549.755615|alternatives_count|
|1562183065|Cooked button mushrooms|13/16.5|none|
|1559590130|Diced Chicken Breast with Asparagus|222/194.405991|none|
|1566333228|Pizza, Caesar Salad, and Chicken Meal|675/498.545258|none|
|1558637698|Cauliflower florets|28/12.25|none|
|1562691409|Scrambled Eggs with Roasted Sweet Potato|248/225.98999|none|
|1560543605|failed; no nutrition estimate|—/485.570892|HTTP5xx|
|1563464389|failed; no nutrition estimate|—/91.970001|alternatives_count|
|1565640772|failed; no nutrition estimate|—/241.169998|alternatives_count|
|1561661850|failed; no nutrition estimate|—/648.975952|alternatives_count|
|1558632198|Mixed Salad Greens|3/16.796001|none|
|1560443474|Mixed Berries and Pineapple|104/172.779999|none|
|1567022383|failed; no nutrition estimate|—/527.088013|alternatives_count|
|1566328894|Cheese pizza|186/236.650986|none|
|1563824279|Sliced Red Onion and Kalamata Olives|68/58.599998|none|
|1565725188|failed; no nutrition estimate|—/543.117004|alternatives_count|
|1558636544|whole almonds|174/410.451019|none|
|1563294441|Fresh Pineapple and Watermelon|62/65.199997|none|
|1563303350|baked chicken breast with cooked carrots|200/202.221436|none|

## Review limits accepted

- Actual identification/portion/calories/macros: no actualtwo-pass outputs yet; empiricaltrial next. Cost if wrong: unsupportedaccuracyclaim if syntheticcontrols mistakenforfoodproof.
- Improvement vs either previouscandidate: full24coverage+metrics decide inTask2. Cost if wrong: cherrypicked improvement if populationgate ignored.
- Superiority over2.5: samepublicbenchmark only afterfreeze/validation. Cost if wrong: invalidcrossdataset superiority claim.
- Heldoutgeneralization: heldout images/outputs remainuntouched. Cost if wrong: developmentoverfitting maynotgeneralize.
- Semanticpromptinjectionresistance: boundedJSON/untrustedprompt isnot modelobedienceproof. Cost if wrong: model mayfollow misleadingcontent; nosecurityapproval.
- Provideracceptance of inventoryschema: fakeSDK cannot establish liveAPIcompatibility. Cost if wrong: nativeprovider mayreject newstructuredschema.
- Currentaccount/billing/entitlement/quota/credentials: freshsanitizedhostqualification required; noProentitlementguarantee. Cost if wrong: wrongproject or exhaustedquota couldspendfailedattempt.
- Real24imagecachepositiveverification: positiveFSfixtures mockverifier; hostchecks actualSHA/header/dimensions. Cost if wrong: wrongasset wouldinvalidateaccuracycomparison.
- HTTPcounts/transportretries/serverexecutions: onlySDKmethodinvocationscounted. Cost if wrong: no networkbilling/transportattestation.
- Fullrawaudit afteroversizednutrition: sourcepreservesfullparse butonlyhash/lengthabove64KiB. Cost if wrong: mustdeclineexhaustiverawinspectionifrawunavailable.
- HostileDI/reentrancy/mutableSDKobjects: nativeuses trustedcallbacks; no hostileprocesscontainmentclaim. Cost if wrong: maliciousinjectedcode canbypassassumptions.
- Hostilefilesystemreplacement/powerloss: exclusivecreation/fsync notcrashproofing. Cost if wrong: incompleterunremainsspent; no durability/securityapproval.
- Repositoryroot/staleruntimesubstitution: hostcleanHEAD/source/runtime/SDKpins beforeandaftertrial. Cost if wrong: unqualifiedruntime couldinvalidateexperiment.
- Independentfresh rerunofhostverification: reviewerprohibitedtests/build/inference; hostreceiptsactual321/build0/lint0. Cost if wrong: reviewdoesnot independently reproducetestresults.
- Historicalrunartifactpreservation: reviewerverified215sourcepins; hostaudits privateoldartifacts. Cost if wrong: externalprivateartifactdrift caninvalidatecomparisons.
- Productiondeployment/mobile/foodsafetyapproval: optindevelopmentonly no deploy/UIchange. Cost if wrong: cannot infer release or food-safety readiness.
- Formatting/duplicatedsealedCLI/refactoring: no demonstratedfunctionaldefect andoldsourcepreservationintentional. Cost if wrong: maintenance debt accepted.
