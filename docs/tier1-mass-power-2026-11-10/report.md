# Mass-dependent calibration: held-out improvement, full gate fails

**New held-out10: served-kcal MAE176.25→147.48 (16.32% lower); all fixed guards pass on that set.** Earlier development40 and first confirmation10 (now development) improve9.31%/8.15%, below their required10%. **passes_all:false; not promoted, no application/default/deployment change.** No pooled average or post-hoc threshold change overrides that result.

| Cohort | Valid | Raw MAE kcal | Corrected MAE kcal | Reduction | Raw P90 kcal | Corrected P90 kcal | Full cohort gate |
|---|---:|---:|---:|---:|---:|---:|---|
| Existing40 development | 40/40 | 125.61 | 113.91 | 9.31% | 290.90 | 272.98 | FAIL: relative MAE gain |
| First10, now development | 10/10 | 220.38 | 202.42 | 8.15% | 348.50 | 310.24 | FAIL: relative MAE gain |
| New10 confirmation | 10/10 | 176.25 | 147.48 | 16.32% | 305.96 | 268.79 | PASS |

All other fixed guards pass in allthree cohorts: absolute MAE reduction>=10kcal, floor200 normalized error, P90, absolute bias, each macro MAE<=110% of raw, unchanged failures/coverage, min8 scored. Fresh normalized error .2751961→.2327501; fresh bias −170.41→−134.46kcal. These are engineering thresholds, not statistical significance or clinical accuracy. Result JSON and cases.csv contain every outcome, factor, error and guard.

The prior single global factor experiment also remains unpromoted: old40/fresh10 gains8.17%/8.10%. It was not tuned after testing. This second profile was reviewed separately, fitted once using only TRAIN mass pairs, and evaluated with a new canonical budget and ten unqueried scan IDs/dates.

## Absolute error and readiness clarification

The comparative10% improvement rule is not an acceptable-absolute-error target. This work has not established adequate calorie accuracy. Supplemental [median absolute errors](absolute-error-medians.json), computed from unchanged per-case predictions, are:

| Cohort | Raw median absolute error kcal | Corrected median absolute error kcal | Corrected P90 absolute error kcal |
|---|---:|---:|---:|
| Existing40 development | 77.77 | 67.85 | 272.98 |
| Earlier10, now development | 179.55 | 172.49 | 310.24 |
| New10 confirmation | 191.17 | 149.79 | 268.79 |

These are median **absolute prediction errors**, not median meal calories or inference latency. P90 is a tail percentile, not a worst-case bound. The current A1 route accepts oneJPEG. No reference-object, known-vessel-scale or multi-view accuracy gain has been established in this Tier1 pipeline; the two calibration experiments used aggregate arithmetic and did not test metric reference objects or geometric reconstruction.

The30-meal Android pilot remains useful for workflow, capture transfer and exploratory accuracy measurements. It does not require a good benchmark score to reveal bugs, and it does not repair poor benchmark estimates. Missing Android references **do not block further accuracy engineering on public weighed data**. The earlier recommendation to treat collection as the next mandatory blocker was too strong.

Next accuracy work is a failure audit on the available weighed benchmark, with explicit visibility/matching uncertainty: omitted/spurious visible foods, portion estimates, nutrient/preparation assumptions, and unresolved cases. A diagnostic reference substitution is not a unique causal decomposition. Nutrition5k's [official README](https://github.com/google-research-datasets/Nutrition5k) documents four rotating side-angle videos, overheadRGB-D where available, and weighed references; this enables investigation of paired views on small matched subsets. It does not itself establish usable camera calibration, metric reference dimensions, best-method accuracy or transfer to Android. Any scale/reference/multi-view candidate needs a separately frozen paired comparison before claiming benefit. One-photo remains the product default; no mandatory object, extra capture, depth or new runtime has been authorized by this clarification.

## Data and estimator

References: [Nutrition5k official dataset](https://github.com/google-research-datasets/Nutrition5k) and [paper sections3.4–3.5](https://arxiv.org/html/2103.03375v1): measured plated component masses with recipe/USDA-derived nutrient labels. They are served references; consumed intake is unknown. Now80 unique public reference scans are available:20TRAIN and60benchmark/development rows. This is not80 held-out meals or80 independent physical plates. Independent plate identity and model pretraining exposure are unknown; Android weighed meals remain0.

Fit input is strict mass-only TRAIN20: id,predictedMassG,referenceMassG,rawReceiptSha256; extra energy/macro/test fields are rejected. x=ln(predMass)-ln200, y=ln(refMass)-ln(predMass); OLS slope clipped[-.5,.5], then recentered intercept clipped[-ln2,ln2], variance<1e-12 gives slope0. This is the specified bounded estimator, not an exact constrained-optimum claim. Actual interceptLog=.07044051242149436; slopeLog=.05379745873645193. Runtime factor=exp(clip(intercept+slope*x,-ln2,ln2)) uses predicted mass only; reference labels never enter the prediction transform. Profile SHA953eb6787fca2c1fc0ad0ac661302898acdddd600281df597a162ed9d2de35f5, TRAIN inputSHA7dc5312a73f80351a696cd5a5c5a8db2192a58d8e29ccd84fe271a7057a86d59. All20 usable.

Scale original visual grams and derived kcal/macros once, preserving per100 nutrient density, identity and source status. Later explicit oil/manual amounts would not be automatically scaled. No app integration was made. Full precision is retained; rounding is for display only.

NewTEST10 selected before retrieval/predictions: officialRGB+overheadTEST; excludes146 prior IDs and55 dates used by old40/TRAIN20/first10; high5(600<E<=1200) thenmid5(200<=E<=600), mass>=150g/min2ingredients, oneSHA256-ranked date thenID, seedmass-power-v1-20261110. Only15 eligible dates existed; ten were fixed without replacement, allimagesready. Metadata/split/JPEG hashes pinned; JPEG85/noresize/noEXIF. Legacy dates may overlap; date thinning is not independent-plate proof. Four functions/eval/tier1-public/mass-power-*-v1.json files freeze profile/input/manifest/protocol.

This data-driven profile choice followed the first exposed tests; those first10 are now explicitly development. Only this new10 remained unqueried before the second fit. Allthree cohort gates were fixed before fitting/newcalls. The new10 run was unconditional even though development previews already missed the10%bar. No further parameter/test shopping or gate relaxation occurred.

## Execution, provenance and coverage

Tool source e70731ffa2ac8aac38da9cb8bf7bb22ee7b2d25a committed/pushed/clean beforelive. Raw A1 engine f5af422eeaf753440349f20065a1e937e6084a17 reused only after checking allfive current TSmodule bytes match the frozen full-CI-qualified modules. Node22.23.3/SDK2.19.0, Vertex US, gemini-3.8-flash exact returned version, original7131…prompt/4306…schema, original six-record catalog, LOW/8192/30s/oneattempt. Dependency/runtime/source/compiled hashes checked.

Git-common-dir canonical mass-power-v1 registry closed at exactly11SDKentries:1ownednonfoodprobe+10newfoodcalls. Old31 registry remains closed. No retry/fallback/resume/replacement/alternate-root reset; no additional call for transformed candidate scores. Frozen profile written beforeprobe and hashchecked afterTEST. Allten valid model/prompt/catalog/componenttotal/mass receipts checked. Actual original file chronology is recorded in actual-verification.json; public copies have publication file times.

Model inference median10567.0ms/max18951ms; known input20180/candidate5135tokens. Costs remainnull: food thought-token/billing usage incomplete. 86.2169% of predicted energy remains explicitly unverified VLM density, never upgraded to verified database data. Zeroquestionsoffered, zerohuman-correctionbenefit/active-time/missing-food-recall measurements, no phone shutter timing or consumed reference. The mathematical correction adds no inference call or user interaction; no deployed corrected latency is claimed.

A0 coverage 0/10; paired-only route comparisons are retained in test/summary.json. Never compare a small A0 subset average with full A1 cohort accuracy.

Across both experiments in this continuation:40 new food predictions and2 ownednonfood probes; prior100food prediction receipts retained. No synthetic check is counted as a measured meal. Known-mass oracle diagnosis from the previous report remains strictly a ground-truth-weight counterfactual, not photo-only accuracy, an accuracy bound, or causal attribution.

## Verification and review limits

Newtool Python91PASS/Node21PASS, with five new Python methods andtwo newNode guards observedRED→GREEN. Unchanged production TS/app core is qualified by CI42811800401 (full5354backend+1historicalskip,1054Flutter+1skip, build/lint/signedAPK); that CI is not a newFlutter/native qualification for these offline tool scripts. The previous duplicate host full backend suite was stopped after30minutes without completion; no local full-backend pass claimed.

Host independently recomputed96 metric fields and60 factors with Decimal arithmetic (metric tolerance1e-9, factor1e-12), and validated allten raw output/provenance/component sums. Mandatory Antigravity primarygemini-3.8-flash/yolo pre/source/result reviews agree/MUSTnone, no fallback. These reviews do not establish generalization, absolute leak freedom, security approval or production readiness.

The fresh native read-only reviewer completed independent TRAIN20/profile/source/selection10/JPEG reproduction and64 old-cohort metric fields/allguards, reporting noImportant findings so far, then its finalturn failed with a usage-limit error. No final receipt exists. This is partial review, not a completed full-source native audit; the exact error is in reviewer-failure.json. Host verification and the separately completed MCP source/result reviews are distinguished. No newdevice or visual-diff audit; no exhaustive visual claim.

## Reproduction and next decision

```bash
python3 -m tool.evaluate_mass_power --experiment docs/tier1-mass-power-2026-11-10 --output /absolute/new/result.json
python3 -m unittest discover -s tests -p "test_*.py"
TMPDIR=/absolute/disk-backed/task-tmp node --test tool/frozen_public_eval.test.cjs
```

Output file must not exist. Never rerun the closed inference registry. Keep both fitted profiles frozen; retain zero-shot A1 as the production baseline. The next accuracy task is the public weighed-meal failure audit described above. Keep the tested fits frozen and use separate development/confirmation data for future interventions. The original30-meal Android pilot remains a subsequent or parallel workflow/transfer study; its missing physical references are not a blocker to offline accuracy work. Do not fabricate validation or retune against these now-exposed test outcomes.
