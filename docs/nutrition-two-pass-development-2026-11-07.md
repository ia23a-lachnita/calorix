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

## Actual measurement

Not yet run. Remaining pre-live gates: clean committed/pushed source, fresh scoped account/project/ADC/API/billing checks, exact24offlineimage/source/runtime/schema/SDK/old-evidence pins. Then invoke the reviewed entrypoint once: `RUN_NUTRITION_TWO_PASS_DEV=1 CLOUDSDK_CORE_PROJECT=calorix-xurschnell node lib/nutrition-eval/accuracy-two-pass-cli.js` from functions. No source/docs changes during that attempt.

Progress requires all24candidate1successes still parsed and all22originalsuccesses preserved, unsafe0,severe<=2,calorie median<=18.4409%/P90<=45.4632%,zero-safe macro<1.5064710070741663. Absolute goal remains pooledmacro<=0.50 plus each macro median<=0.35. Full24coverage is primary; common-success accuracy is secondary. Progress alone does not qualify production. Untouched16validation×3 and final same-public-benchmark comparison have separate later review/budgets. No new2.5request and no superiority claim from these different development/benchmark datasets.

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
