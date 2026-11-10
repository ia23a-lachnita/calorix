# TRAIN-fitted portion calibration: actual results

The fixed scalar reduces served-calorie MAE by 8.17% on the existing40 scans and 8.10% on ten fresh scans. It misses the frozen10% relative-improvement requirement on both. **Not promoted; application/default/deployment unchanged.**

This is measured public-data evidence, not statistical significance or Android calorie accuracy. References are Nutrition5k incrementally weighed plated components with recipe/USDA-derived nutrients ([official dataset](https://github.com/google-research-datasets/Nutrition5k), [paper sections3.4–3.5](https://arxiv.org/html/2103.03375v1)). They are served references, not consumed intake. Independent physical-plate count and model pretraining exposure are unknown.

| Cohort | Raw MAE kcal | Calibrated MAE kcal | Raw bias | Calibrated bias | Raw P90 | Calibrated P90 |
|---|---:|---:|---:|---:|---:|---:|
| Existing40 development | 125.61 | 115.35 | -92.57 | -68.52 | 290.90 | 264.25 |
| Fresh10 confirmation | 220.38 | 202.53 | -163.54 | -126.44 | 348.50 | 308.75 |

All50 benchmark estimates valid. Absolute gains10.26/17.86kcal; both relative gains below10%. All other fixed guards pass: floor200 normalized error, P90, absolute bias, unchanged failure/coverage, and each macro MAE within110% of raw. Fresh normalized error barely changes (.3997183→.3996911). Thresholds are engineering conventions, not clinical targets. Every case/error/guard is in result.json and cases.csv; do not report only a favorable average.

## Reproducibility and scope

Fit:20 officialTRAIN scans, one scalar minimizing complete-meal TRAIN calorie L1, weighted median(ref/pred), weight=positive predicted kcal; minimizer interval closest1, clamp[.5,2]. All20 usable. Locked factor **1.096492793911007**; profile.json and its SHA persisted before first TEST request, enforced by source and supported by observed file times. Test labels never fitted. All original components and derived grams/kcal/macros scale once; per100 densities, identity/preparation/source status remain unchanged. Later user-entered oil/manual grams would not be automatically scaled. This experiment does not integrate a calibration into the app.

Selection fixed before image retrieval: TRAIN high4/mid10/low6, freshTEST high5/mid5, exact bins <200/200..600/>600..1200. Fresh TEST mass>=150g/min2ingredients. Both exclude116 prior IDs and25 old40 dates; TRAIN also excludes all10 newTESTdates. Thirty ready images, no replacements; RGB+overhead officialTRAIN/TEST splits pinned and disjoint. Capture-date thinning is a heuristic; legacy dates may still overlap. PNG→JPEG85/noresize/noEXIF; all30 image hashes/conversions independently reproduced. Manifests live in functions/eval/tier1-public/portion-scale-{train,test}-v1.json.

Pinned source f5af422eeaf753440349f20065a1e937e6084a17; Node22.23.3/SDK2.19.0, Vertex US, gemini-3.8-flash exact returned model, original7131… prompt/4306… schema, original six-record catalog, LOW/8192/30s/one attempt. The original A1 callable/model/prompt remains unchanged. A canonical Git-common-dir single-use claim closed at exactly31 SDK entries:1 owned nonfood compatibility probe +20 TRAIN +10 TEST. No retry, fallback, resume, replacement or extra call for the arithmetic transform. Raw output/source records are retained here; image URLs/hashes are in committed manifests.

Public70 unique referenced scans are now available across40 development +20TRAIN +10fresh; only50 are benchmark test/development rows, not70 held-out samples. This adds30 food predictions to the prior100, not31 food predictions. Android weighed meals remain0; no synthetic diagnostic is counted as food validation.

Current ADC read-only project check200/ACTIVE; an initial global model-metadata GET403 was followed by successful exactUSrep metadata GET200, then successful pinned-model probe. No inference was used for metadata checks. SDK logs warn that explicit project/location takes precedence over an environment API key; credentials are never published.

## Latency, source coverage and effort

| Arm | Calls | Valid | Model latency median ms | Maximum ms | Known input tokens | Known candidate tokens | Unverified-estimate energy share |
|---|---:|---:|---:|---:|---:|---:|---:|
| train | 20 | 20 | 13387.5 | 21187 | 40360 | 8424 | 83.9524% |
| test | 10 | 10 | 14628.5 | 21365 | 20180 | 5204 | 88.3536% |

A0 train: 0/20 covered; compare only its paired valid subset, retained in train/summary.json. Never compare a tiny A0 subset average with all A1 cases.

A0 test: 0/10 covered; compare only its paired valid subset, retained in test/summary.json. Never compare a tiny A0 subset average with all A1 cases.

One optional preparation question offered per arm; both remain unanswered. No human correction benefit, active-user time, missing-food recall, phone shutter latency or consumed reference was measured. Costs remainnull: food thought-token/billing usage incomplete. Calibration adds no model request or user interaction; model latency/token receipts describe raw A1, not a deployed calibrated app. Most energy remains explicitly unverified VLM density estimates, never relabeled as verified database matches.

## Independent no-call mass diagnostic

mass-oracle-diagnostic.json replaces predicted aggregate mass with measured reference mass while keeping predicted aggregate energy density. Raw→oracle MAE: old40 **125.61→56.02kcal**, fresh10 **220.38→72.55kcal**. TRAIN20 diagnostic is separately labeled. This requires ground-truth weight and is **not photo-only accuracy, a deployable predictor, an accuracy bound, or causal attribution**. It can worsen a case by removing compensating errors (covered by a hand-calculated regression). Aggregate mass can conceal omitted food/mixture errors. These results motivate testing variable mass calibration; they do not establish that mass is the sole cause or that a new method will reproduce the oracle.

## Verification

Source CI42811800401 alljobsSUCCESS: Flutter1054PASS+1historicalskip; backend5354PASS+1historicalskip; Python83PASS/Node19PASS/build/lint/APK. Diagnostic-only addendum: local Python86PASS, three new tests had actualRED→GREEN; unchanged app/backend is qualified by f5af422 CI, not a new native-device claim. Duplicate host full backend rerun was stopped after the30minute runtime bound while still active; no local full-suite pass claimed. Exact-source CI5354PASS+1skip remains the completed full-backend verification. Python first-stage eight methods actualRED→GREEN; Node two orchestration tests were mistakenly authored after implementation, explicitly not TDD. A wrong profile-hash fault fails; restored19PASS. Initial wrong-cwd test/mutation commands failed before target execution and are not passing evidence.

Fresh native whole-feature reviewer0Critical/0Important; verified all30 source/receipt pins, canonical31, fit-beforeTEST chronology,64metricfields and every guard. Host independently reproduced16served metric fields with Decimal within1e-9. Mandatory primary3.8/yolo MCP pre/source/result reviews recorded in status; no model fallback. Reviews occasionally invented filenames or called the oracle an upper bound: those assertions are rejected. No device/UI visual diff audit in this stage; no exhaustive visual/security/readiness claim.

Reproduce without inference from repo root:

```bash
python3 -m tool.evaluate_portion_calibration --experiment docs/tier1-portion-calibration-2026-11-10 --output /absolute/new/result.json
python3 -m tool.diagnose_mass_oracle --experiment docs/tier1-portion-calibration-2026-11-10 --output /absolute/new/diagnostic.json
python3 -m unittest discover -s tests -p "test_*.py"
```

Output paths must not exist. Keep frozen experiment closed. Next engineering step: separately reviewed mass-dependent calibration fitted only on the existingTRAIN mass pairs, checked on a new untouched ten-scan set; no change to the failed scalar or its gate.
