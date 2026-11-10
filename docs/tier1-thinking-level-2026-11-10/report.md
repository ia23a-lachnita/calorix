# One-photo LOW versus HIGH thinking: failed consideration gate

**HIGH thinking did not provide a useful calorie-accuracy improvement in this fixed comparison.** Mean absolute error fell only0.99%; median absolute error increased, while model response time nearly doubled. The fixed10%mean-improvement requirement failed. Archive this configuration; no product/default/deployment change or relaxed gate.

| Measure | LOW | HIGH |
|---|---:|---:|
| Valid food predictions |10/10|10/10|
| Complete served-kcal MAE |177.57|175.80|
| Median absolute error kcal |135.54|148.43|
| P90 absolute error kcal |342.37|333.00|
| Bias kcal |−177.57|−175.80|
| Floor-200 normalized absolute error |30.44%|29.50%|
| Mass MAE g |135.4|132.7|
| Model response median |11.39s|22.35s|
| Model response P90 |13.30s|28.43s|
| Reported total tokens |25,494|40,369|

Seven meals improved and three worsened. Every prediction underestimated served calories in both arms. All10-pair coverage, P90 and normalized-error guards passed; the prespecified10%relative-MAE guard failed. That relative criterion is only a candidate screen, not acceptable absolute accuracy. P90 is an interpolated descriptive quantile of ten cases, with no confidence/significance or population claim. Per-case deltas and all mass/macro scores are retained in `cases.csv` and `result.json`.

## Frozen comparison

All ten existing [meal-range development cases](../../functions/eval/tier1-public/manifest-mealrange-v1.json),274–920kcal, were retained without subsetting. ManifestSHA9d7d8f2b3097d551df8ca93d35dcd800a594ce45fd97f3e7ac1d71c8653ff9e7. These were used in earlier comparisons: not held-out/representative/unexposed plates. Nutrition5k provides measured component masses and recipe/USDA-derived calorie references, not directly measured food energy. Source reference vectors were preserved. One case has a general4/4/9energy residual over100kcal; this screening flag alone does not invalidate the reference or justify exclusion. Independent physical-plate count and foundation-model exposure unknown.

Citation: Thames et al., *Nutrition5k: Towards Automatic Nutritional Understanding of Generic Food*, CVPR2021; original dataset CC-BY4.0. Source URLs/hashes/ingredient vectors/attribution remain in the frozen manifest. No new reference meals or original-image redistribution here.

Only `thinkingConfig.thinkingLevel` differs: LOW versus HIGH on pinned gemini-3.8-flash. Same single JPEG bytes, original7131prompt, schema4306, six-record catalog, f5af422decoder, SDK2.19.0, provider-default temperature/media and8192combined output budget. Both research arms use60stimeout/oneattempt; product timeout remains30s. No image-detail improvement assumed. [Official thinking support](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking) and local SDK enums were checked, followed by the owned blank HIGH probe. Prompt/schema prefixes are hashes, not token lengths.

Fixed original manifest order, LOWfirst at indices0/2/4/6/8 and HIGHfirst1/3/5/7/9. Full original prompt/oneJPEG only enter SDK payloads, with no case IDs/reference masses/reference ingredient labels/targets. Original nutrient catalog remains in both prompts. Preparation proposals unanswered. Original73-record catalog and prior mass fits are not applied.

## Actual execution and limits

Runner source7624093d8441948d25b4ce107df6f95d95e88455 committed/pushed clean before the sole canonical `thinking-level-v1` claim. COMPLETE21: one owned blank explicitly nofood +20food predictions.0failures/unknown-inflight. No retries/fallback/resume/reset/replacements; registry CLOSED. Every raw response saved before decode. No extra SDK calls from offline scoring/oracles.

107Python/34Node tests passed, including new4Python/4Node actualRED→GREEN. The existingVerifyjob Node command now includes alltool/*.test.cjs; its exact local invocation passed34tests, without a newCI-run claim. All10photo+ownedblank hashes checked. All20raw SDK outputs independently redecoded through frozen f5;66components/totals/inventory/questions/statuses matched. Decimal88metric/delta checks passed within1e−9;8secondary oracle fields separately verified. Published replay byte-exact. Existing unchanged5TS core retains qualification from CI42811800401; no new app/build/device qualification claimed.

Input tokens20,180both; reported total+58.35%. Outputtokens4,981→3,558. Thought-token fields known333from1/10LOWresponses and16,631from10/10HIGHresponses; missing fields are unknown, not zero. Billing cost is unknown/null. Response latency excludes phone capture/upload/display; all observed responses were under30s, but this60stimeout study is not a30s product reliability qualification.

Each arm had33components,32explicitlyunverified nutrient estimates and1database match; about93.8%of predicted calories came from unverified estimates. No invented match is counted as verified. Question proposals1→0, none answered; actual human burden, missing-food precision/recall and correction benefit unmeasured. Global public food-prediction requests now184, excluding nonfood probes. Reference inventory remains80Nutrition5k scans(20TRAIN+60benchmark/development), separately6ECUST simple portions; no pooled cross-dataset calorie metric or independentmeal claim. Weighed Android meals0.

MCPprimary3.8/yolo preplan/source and separate fresh-context source audit agree/MUST_FIX none/no fallback. Actual-result review also agree/MUST_FIX none. External reviewers inspected source/text, not all photos. Durability/security/zero-leakage/independence/SLA guarantees or claims that paired statistics requireall10 were not adopted: paired-valid scores are retained on their matched subset, while the gate explicitly needsall10.

## Secondary reference-mass oracle

Offline scaling by referenceTOTALgrams/predictedTOTALgrams changes MAE to68.91kcal(LOW) and48.67kcal(HIGH). **This uses unavailable ground truth and is not automatic/app accuracy, an error bound, a validated density estimator or unique causal attribution.** It can remove compensating errors. The reference-mass diagnostic supports investigating portion measurement; it is not a deployable correction or reason to promoteHIGH.

## Reproduce and next engineering boundary

```bash
python3 -m tool.evaluate_thinking_level --experiment docs/tier1-thinking-level-2026-11-10 --output /absolute/new/result.json
python3 -m unittest discover -s tests -p 'test_*.py'
TMPDIR=/absolute/disk-backed/task-tmp node --test tool/frozen_public_eval.test.cjs tool/reference_scale.test.cjs tool/thinking_level.test.cjs
```

The scorer is offline. Never resume/reset the closed SDK registry. Verification scripts document this host's engine paths and require that exact bundle/dependencies to replay raw outputs.

This is a method-level checkpoint: the simple supplementary-view comparison, documented coin-diameter text and HIGH-thinking configuration did not earn promotion. They do not establish failure of all VLMs, scale cues or geometry. Automatic absolute calorie accuracy remains inadequate. The next high-value experiment is a bounded **pixel-localization/known-scale diagnostic**: provide measured2Dgeometry from original annotations without food labels/weights, compare against ordinary same-photo mass inference, and explicitly label annotation localization as oracle. This tests whether accurate visible geometry helps before implementing automatic localization or adding capture requirements. Height/density/preparation remain unresolved; no depth model/training/mandatory object or new production architecture is started here.

Actual-result reviewer claims of conclusive failure of monocular reasoning, unique primary volumetric cause or better component-density identification were rejected. These selected development results and aggregate mass substitution cannot establish those claims. Only the specified HIGH configuration failed its preset gate.

Final narrow CI/publication MCP3.8/yolo review agree/MUST_FIX none/no fallback. Its invented test filename aliases were rejected; actual CI glob covers frozen_public_eval.test.cjs, reference_scale.test.cjs and thinking_level.test.cjs. Local exact command passed34tests; this is test registration and not a claim of a fresh remoteCI result. Branch/worktree remain available; no merge/branch deletion performed.
