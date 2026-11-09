# Portion-audit prompt: measured negative result

Keep the production prompt. One fixed portion-audit instruction failed its prespecified consideration rule on ten new public scan IDs: all twenty estimates succeeded, but calorie MAE, P90 and normalized error worsened. No prompt, model, catalog or function was deployed from this experiment.

| Complete served estimate | Original prompt | Portion-audit candidate |
|---|---:|---:|
| Valid outputs / selected scans | 10/10 | 10/10 |
| Calorie MAE, kcal | 166.36 | 171.37 |
| Signed calorie bias, kcal | −161.80 | −139.49 |
| P90 absolute calorie error, kcal | 376.96 | 404.68 |
| Mean normalized absolute error, floor 200 kcal | 23.58% | 26.24% |
| Mass MAE, g | 67.80 | 69.80 |
| Protein MAE, g | 17.13 | 14.91 |
| Carbohydrate MAE, g | 3.61 | 6.99 |
| Fat MAE, g | 10.99 | 11.90 |

Three cases improved, five worsened and two were unchanged in absolute calorie error. Less negative mean bias did not produce better absolute accuracy. The comparison evaluates the complete returned estimates: identities, preparation assumptions and nutrient densities can also change, so this does not isolate a causal portion effect.

| Reference energy slice | Scans | Original kcal MAE | Candidate kcal MAE |
|---|---:|---:|---:|
| Below 200 kcal | 3 | 1.49 | 1.70 |
| 200–600 kcal | 3 | 129.40 | 172.21 |
| Above 600 kcal | 4 | 317.72 | 297.99 |

The three low-energy scans contain single ingredients and only **2.53–10.98 kcal**. They are not representative complete meals. The higher-energy slices and their denominators are therefore shown separately. Selection and scoring rules were frozen before downloads or predictions; no case was replaced after seeing its image or outcome.

## Execution and provenance

Both arms used the same ten metadata-referenced Nutrition5k JPEGs, the existing six USDA records, strict output validation, schema, `gemini-3.8-flash`, LOW thinking, 8,192 output-token cap, 30-second timeout and one SDK attempt. The candidate appended only the [fixed instruction](../../functions/eval/tier1-public/portion-audit-profile-v1.json). Original prompt SHA starts `7131abc1`; candidate `1d2406db`; schema `4306216d`. Full hashes and source pins are retained in the profile and [verification receipt](verification.json).

Engine and manifest source: `2b26b7ea46cfaa488e2c358036a25214aa104720`. Manifest SHA256: `d150ef3c0503487116a65337817f0eccff8a8ab48124d3ff47a4ca09cca88e63`. The [manifest](../../functions/eval/tier1-public/manifest-portion-audit-v1.json) contains source URLs/hashes, reference nutrients, ingredient mappings and image hashes. Attribution: Thames et al., Nutrition5k, CVPR 2021, CC BY 4.0.

The single locked experiment started 2026-11-09 at 09:43:42 UTC. It consumed exactly twenty SDK invocations, ten per arm, with zero failed, pending, unattempted or replaced cases and no retries or provider/model fallbacks. The shared Git registry reserves both arms across output directories/worktrees and prevents resuming this experiment. References and ingredient labels were used for offline scoring, not sent to inference. Only the fixed prompt/schema/catalog and one JPEG were submitted per request. The earlier thirty-scan experiment remains unchanged.

A0 had **0/10 complete-image coverage in each arm** because at least one component lacked a verified catalog match. Its calorie metrics remain null; this is a reported comparator failure, not zero error or an overall A0/A1 ranking. Both arms had 26 components, only four database matches each. Unverified estimates contributed 86.77% and 84.22% of predicted energy respectively; those are never represented as verified nutrient matches.

One original and two candidate preparation questions remained unanswered. No reference-derived answers or manual corrections were substituted. Recorded inference latency was median 10.169 s / P90 12.188 s for original, versus 11.733 s / 24.397 s for candidate. Arm order and caching confound latency; these are descriptive SDK timings, not phone workflow timings. Known prompt/candidate token counts were 20,180/3,904 and 20,850/3,962. Billed cost, thought-token completeness, actual correction effort and consumed-meal accuracy are unmeasured.

## Verification and decision

[Full canonical CI 42593998502](https://github.com/ia23a-lachnita/calorix/actions/runs/42593998502) passed on the exact engine source: 5,347 backend tests across 98 files, 990 Flutter tests, 44 Python tests, fourteen Node execution guards, TypeScript build/lint and Flutter analyzer. There are two historical skips. Both verification jobs passed before inference; the signed APK build also passed. Its downloaded source/checksum/trusted V2 signer matched, and its bytes equal the previously verified Android APK (`df05f2f0…`). No additional installation was needed for this backend-only experiment.

Independent source/input review reproduced all ten selections, reference vectors and byte-exact stripped JPEGs. Its one important aggregate-budget finding was fixed with actual RED→GREEN tests before requests. Numeric result audit and Antigravity MCP review are recorded in [verification.json](verification.json). No exhaustive visual recognition, missing-food gold audit or UI parity validation is claimed.

The preset consideration rule required both ten valid outputs, lower MAE and normalized error, P90 no worse and no increase in failures. **It failed.** Preserve this negative result and archive the candidate. No tuning or additional calls on this closed experiment budget.

This is a development comparison, not held-out generalization evidence. IDs and JPEGs are new, but eight capture dates overlap the earlier thirty scans, and nearby scans may depict progressive versions of a plate. Independent completed-plate identity and pretraining exposure are unknown. Public references use the dataset's nutrient assumptions; visual matches and preparation remain estimated. Owner Android weighed references remain 0/30, counted separately.

Next experiment: compare one separately pinned, available VLM challenger on a frozen public subset of meal-sized scans, using the same nutrient reconciliation, question policy and complete-output scoring. Model selection and its new bounded budget require a separate reviewed workstream; this result does not justify changing production.

Full-precision [case CSV](cases.csv), [summary](summary.json) and [public prediction receipts](receipts.json) retain all twenty outputs and coverage denominators. Offline metrics use linear-interpolated P90 and normalization by `max(reference_kcal, 200)`.
