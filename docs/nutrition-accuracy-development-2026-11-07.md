# Meal accuracy development candidate 1

## Implementation qualification — 2026-11-07

An opt-in candidate now adds general food/preparation, component mass/density and macro-plausibility guidance to the unchanged production meal prompt. It reuses the existing adapter, schema, normalizer, scorer and report builder. Production and historical V1/V2 paths are untouched. This implements an accuracy hypothesis; no improvement is established until the actual experiment.

The native once-only entrypoint uses Vertex / `calorix-xurschnell` / `us` / `gemini-3.8-flash` / API v1 / MEDIUM / 30 s. Approved trial: the same24FINAL development dishes, one sample each, maximum24imageSDKmethodcalls, zero token-count/warmup/retry/fallback. Manifest SHA-256 `59231d1cfda7e8a795901086f379f0bdb331dbf082ff51b37e3758e381bebd4e`. Saved MEDIUM baseline JSON SHA `34939cc3ecbc3637ee6f1e196bfbbaf68ad48668a6b16cd63ad1c2c74e9cf922`. The new root is exclusive and partial/completed runs cannot resume; old failed roots remain preserved.

Host final verification `final-controls-20261107`: **294PASS,0FAIL,0SKIP,sixfiles**, including all260old case/status instances and34newcases. Actual build/lint native0. All206previously trackedFunctions files remain byte-identical; five source/data/test files added. Raw test JSON SHA `dc299976795e6302950f60b89e2214507cf4a4d95a836d12c0c55df343aad535`. This is focused qualification, not another execution of the older5,377-test backend parent. No Flutter/UI behavior changed.

One fresh native whole-feature review reported0Critical,2Important,1Minor. Four new regression cases failed on the observed metadata/item-retention defects (21PASS/4FAIL), then passed in the final run. Present foreign/non-string model metadata now fails even for empty responses. Oversized final JSON retains only marker/length/hash, including no copied item array; the existing parser still sees the complete original text and calculates full detected-item counts and nutrition. One deferredMinor: genuine empty response failures can lack the optional safe-category tag, while their provider failure/spent attempt remains recorded. No second native reviewer was dispatched.

Corrected Antigravity MCP `gemini-3.8-flash`, server High, conversation `calorix-accuracy-development-implementation-20261107`, returned `AGREEMENT_STATUS: agree` / `MUST_FIX: none`, scope `ACTUAL_ACCURACY_CANDIDATE_IMPLEMENTATION_AND_HERMETIC_RESULTS_ONLY`. It reviewed supplied exact source/receipts inline, ran no commands and performed no food-image inspection. Initial response overclaims about memory/parsing bounds, HTTP attestation, crash durability and qualification thresholds were corrected. No reviewer/recovery/model fallback.

Synthetic native filesystem tests fake SDK and positive image verification; the missing-cache negative uses the real offline verifier. They do not establish real food accuracy or power-loss/hostile-process security. Actual host checks verify cached image SHA/header/dimensions separately before live. All24PNG files were copied exactly from the prior frozen development inputs,9,166,361bytes, no network/transform. V1 elevenfiles and failedV2 bytes/modes/mtime/ctime remain exact after review.

The [approved plan](superpowers/plans/2026-11-03-nutrition-accuracy-development.md) requires fresh account/project/source/runtime/cache qualification and clean exact origin after this implementation commit/push before the24-call run. **Actual candidate accuracy remains unmeasured; no new food/token request has run.** All22baseline-success IDs must remain successful to claim progress. Progress also requires coverage>=23/24,unsafe0,catastrophic<=2,calorie median<=18.4409%/p90<=45.4632%,zero-safe macro<1.506471. Absolute macro goal<=0.50 and each macro median<=0.35 remain separate from progress. No automatic promotion.

The saved2.5 run uses20different benchmark cases,three samples/60outcomes. The current3.8 reference uses24development dishes,one sample perLOW/MEDIUM arm. These references cannot establish which pipeline is better overall. A frozen improved candidate must validate before the same-public-benchmark aggregate comparison; no new2.5request or invented historical per-case prediction. No held-out image/output has been opened for this candidate.

## Actual trial — completed, rejected

Run `accuracy-meal-prompt-v1-d51b7a2f4621-2026-11-07T21-20-19-867Z`, execution HEAD `d51b7a2f4621d45a9b633bfd01229dff357d594b`, Functions tree `6f335521148682e067f5ea12febf5de2f177dfac`. Native exit0,200.640s. Route Vertex / calorix-xurschnell / us / gemini-3.8-flash / v1 / MEDIUM /30s; exact model metadata on24/24. Prompt SHA `05398a83b74cb5198d01e2c16a2e5017836ed79577fa9d056752a53bf3d9bd06`.

24reserved,24outcomes,24imageSDKmethodinvocations,0countTokens/0warmup/0retry/0fallback. All24parsed; both earlier provider failures recovered and all22baseline-successIDs preserved. No provider/parse failure; all24needs_review solely nutrition_basis_ambiguous. No reviewer/recovery fallback. Source211/runtime73/cache24 hashes and oldV1/V2 evidence unchanged. The sanitized fresh account/project/ADC/API/billing probe passed9checks before execution; this does not prove subscription entitlement or future quota.

| Metric | Saved MEDIUM | Candidate 1 |
| --- | ---: | ---: |
| Parsed / attempted |22/24|24/24|
| Median calorie relative error |18.4409%|21.1570%|
| P90 calorie relative error |45.4632%|67.5869%|
| Severe calorie misses |2|3|
| Unsafe complete |0|0|
| Zero-safe pooled macro mean |1.506471 (66 pairs)|1.518007 (72 pairs)|
| Legacy pooled macro mean |0.718810|0.716847|
| Protein median relative error |18.4934%|19.6607%|
| Carbs median relative error |23.5714%|22.0517%|
| Fat median relative error |25.8394%|32.9624%|
| Mean mass relative error |29.4905%|26.0022%|
| Median mass relative error |21.1467%|18.5604%|
| Mean carb-density relative error |39.2316%|37.1073%|
| Mean fat-density relative error |515.1464%|516.2767%|
| Median / P90 latency |7.627 /20.474s|7.846 /10.476s|

Accuracy metrics use parsed cases, so the22-success common subset is secondary: candidate median21.1570%,P9047.1007%,zero-safe macro1.621662,severe2. No lost-success veto, but candidate fails severe/calorie median/p90/zero-safe macro progression and absolute macro<=0.50. All three macro medians meet<=0.35, which does not rescue the pooled failure. Single-sample, noncontemporaneous development evidence does not establish causal prompt effects or superiority against historical2.5. Candidate is rejected for promotion; the accuracy goal continues.

The independently audited completion binds report SHA `c76d6864ff4a7ce24386628bcc62b2719cfac471f6a7a71c2fbfc368ebf409a7`, Markdown `f435c1a59c2ecb089f7c3e1b82089515678f8fdbdee7d6fdf4d94d08f1628d09`, diagnostics `3b0531036ec5712126ab27461581ba81a598b90c3102b1e09c665b7490014a93`. Original wrapper state reported cliResultMalformed because the SDK printed a precedence banner before the valid completedJSON line. Raw output/state are preserved; final line plus all completion/event/hash evidence were independently checked. No rerun. SDK accounting is not OS/HTTP transport attestation.

Host audit independently recomputed numeric errors, quantiles, both macro metrics, mass/density, safety, latency and all24 retained finalJSON/name/item mappings. Final outputs match parsed raw nutrients for24/24; this does not rule out earlier model identification/estimation errors. Photo visual inspection was not exhaustive; Antigravity reviewed supplied numeric/name evidence only. No UI-diff run: auditLimited/visualClassificationStatus/diff-status counts are not applicable to this backend nutrition experiment.

Corrected Antigravity MCP3.8/serverHigh conversation `calorix-accuracy-candidate1-actual-results-20261107` explicitly returned SCOPE ACTUAL_CANDIDATE1_RESULTS_ONLY, AGREEMENT_STATUS agree, MUST_FIX none. Initial response conflated the legacy macro metric with the zero-safe progression gate and implied unsupported visual/HIGH judgments; those claims were corrected in the same conversation. This approves reporting, not accuracy or production readiness.

The actual retained name for dish1565021965 is fresh mozzarella,125g,350kcal,26.5gfat; pinned official truth is egg whites,177g,92.039993kcal,0.354gfat. Fat relative error73.8588 means7,385.88%. This named mismatch supports testing independent component identification before nutrient estimation. It does not justify hardcoded white-food examples, oracle labels, changing truth or excluding this dish. Other severe cases: cauliflower mass130g vs49g; recovered greens case4kcal vs16.796001. Broader component misidentification remains an investigation question.

Next repair: a separately reviewed two-pass candidate, first an independent image-only visible-component inventory with preparation/portion cues and ambiguity, then nutrition estimation conditioned on inventory plus image. It must apply the same rule to all24, preserve all failed experiments, and keep validation/benchmark untouched. No new requests authorized by reusing this completed root; the next iteration needs its own identity/root and bounded48-image maximum (two passes per dish, no retries).

### All24 final outputs (P/C/F in grams)

| Case suffix | Actual final name | Predicted kcal | Truth kcal | Predicted P/C/F | Truth P/C/F | Severe |
| --- | --- | ---: | ---: | --- | --- | --- |
|1564761388|scrambled egg whites|68|54.599998|9.8/0.8/2.2|10.5/0.735/0.21|false|
|1563220087|Pepperoni pizza slice with steamed broccoli|155|162.740005|6.8/17.5/6.7|7.344/19.859999/6.424|false|
|1564428515|Roast Pork with Steamed Cauliflower and Garden Salad|365|484.618347|41.2/10.5/17.3|29.964256/35.868031/25.66441|false|
|1565021965|fresh mozzarella cheese|350|92.039993|25/3.5/26.5|17.700001/1.239/0.354|true|
|1563898722|Scrambled Eggs with Broccoli|232|343.350006|16.2/7.8/15.1|23.232/9.870001/23.472|false|
|1566333291|Pizza, chicken, Caesar salad, and vegetables|740|549.755615|45.5/58.5/36.3|41.324966/49.02037/21.439438|false|
|1562183065|Cooked Button Mushrooms|16|16.5|1.2/2.9/0.3|2.325/2.475/0.225|false|
|1559590130|Diced Chicken Breast with Asparagus|205|194.405991|35.5/3.1/5.2|35.888/1.521/4.107|false|
|1566333228|Pizza with Caesar Salad and Chicken|650|498.545258|38/41/38|37.857738/39.679134/20.378201|false|
|1558637698|Raw Cauliflower Florets|33|12.25|2.5/6.5/0.4|0.882/2.45/0.147|true|
|1562691409|Scrambled eggs with roasted sweet potatoes|255|225.98999|14.2/22.1/12.5|10.52/22.084/10.48|false|
|1560543605|Glazed chicken with rice, salad, and tomatoes|580|485.570892|32/50/28|63.553284/22.652529/27.281401|false|
|1563464389|cooked bacon strips|88|91.970001|6.2/0.2/7|6.29/0.238/7.14|false|
|1565640772|Grilled Chicken Salad|218|241.169998|35.1/2.2/7.4|43.658001/2.862/5.148|false|
|1561661850|Pizza with Grilled Meat and Seasoned Rice|655|648.975952|33.2/64.1/29.8|35.485809/67.575478/25.375412|false|
|1558632198|Mixed Salad Greens|4|16.796001|0.3/0.6/0.1|1.586/0.832/0.884|true|
|1560443474|Mixed Fruit Salad with Berries and Pineapple|98|172.779999|1.6/24/0.6|1.993/43.25/0.725|false|
|1567022383|Chicken Salad with Shaved Parmesan and Dressing|425|527.088013|46/13/20|70.595001/21.214001/17.344999|false|
|1566328894|Cheese Pizza|214|236.650986|9.5/25.5/8.5|9.968/29.815001/8.366|false|
|1563824279|Sliced red onion and Kalamata olives|72|58.599998|0.8/4.3/5.5|0.761/6.138/3.895|false|
|1565725188|Chicken and Parmesan Salad Bowl|285|543.117004|36.5/7.5/11.8|69.798996/25.107/17.928001|false|
|1558636544|Almonds|260|410.451019|9.5/9.7/22.5|15.904/16.117001/35.145|false|
|1563294441|Fresh Cut Pineapple and Watermelon|67|65.199997|0.9/17.2/0.3|0.889/16.793999/0.241|false|
|1563303350|Baked chicken with sliced carrots|195|202.221436|25.2/7.3/6.8|28.384161/8.355268/5.756976|false|
