# Calorie Lens and fixed serving-route comparison

**Measured improvement, with limits:** on twenty additional Nutrition5k photos, the published Calorie Lens pipeline reduced served-calorie MAE from **71.54 to 35.70 kcal**. A conservative A1/specialist selection rule reduced MAE to **60.06 kcal** while retaining the existing A1 results on six small ECUST portions. It did not improve every switched meal. Production inference is unchanged.

Code/model source was committed and pushed clean at `b268f5fb89c17048ebfd7b7b9971658207569ee8`. A reviewed, timing-driven execution amendment was committed and pushed at `6fb20933cc245328959742b7b6f6d15efc7c068d`; model weights, preprocessing, precision, threads, routing and scoring stayed fixed.

## What was implemented and reused

Existing capture, cloud consent, A1 recognition, nutrient reconciliation, editing, logging and privacy flows remain intact. New headless tooling adds:

- The pinned [Calorie Lens implementation](https://huggingface.co/shalev396/calorie-lens/tree/f0d34a638b6b572e2df601067881b56fe6848c79), strict offline safetensors loading, source-faithful preprocessing and structured prediction records.
- A reference-blind serving router, failure fallback, separate direct/mass-fusion/direct-head scoring, pinned runtime and exact input/reference provenance.
- An actual comparison with retained A1 and Plate-Vision estimates, independent mathematical replay and portable compressed evidence.

No training, depth, extra photograph, printed object, new service, app deployment or meal-inference cloud request was introduced.

## Fixed data and counts

The comparison contains **42 public photographs**: ten prior Nutrition5k discovery images, all twenty original Nutrition5k benchmark images newly evaluated by these specialist models, and twelve ECUST portions with gram references only.

There are **84 compared food predictions**: 42 Plate-Vision and 42 Calorie Lens. Twenty-two Plate results were retained from the previous comparison. This stage produced **62 new local food records**, two owned blank qualification records, and at most one interrupted local forward with no saved prediction. These are not 62 new meals or SDK calls. The cumulative meal-inference SDK entry count remains 187. Review-model calls and model/package downloads are separate from that counter.

All 62 new food outputs have valid finite positive mass and finite nutrition totals. That is numerical validity, **not verified recognition**. No original input or failed case was replaced. No new reference meals were collected; the wider inventory remains 80 Nutrition5k scan IDs and 12 ECUST portion IDs. Independent physical plates are not established, and weighed Android references remain zero.

The twenty-case group is new to this specialist comparison, not a pristine holdout from all previous VLM work or from external model training. These are cafeteria photos with source recipe-derived calorie/macronutrient references, not bomb-calorimetry truth. Retained A1 receipts use the original prompt and six-record catalog; they are historical rather than contemporaneous re-inferences. Do not pool the two groups into an independent target-population score.

## Additional twenty: complete served-calorie results

All routes below have 20/20 numerical coverage. P90 uses linear interpolation at (n−1)×0.9. Normalized absolute error divides by max(reference kcal, 200); it is not the publisher's PMAE. These P90 values describe the observed cohort, not intervals for future meals. “Full” Calorie Lens means the publisher's ingredient-gram → nutrient-table pipeline, including its explicit unidentified remainder; it is distinct from the raw direct regression head.

| Route | MAE kcal | Median absolute error | P90 absolute error | Signed bias | Mean normalized error |
|---|---:|---:|---:|---:|---:|
| Retained A1 | 71.54 | 43.19 | 155.45 | −7.77 | 24.89% |
| Plate-Vision full | 47.95 | 19.93 | 116.03 | +5.65 | 17.06% |
| Plate-Vision serving route | 57.34 | 35.71 | 116.03 | +8.15 | 20.52% |
| Calorie Lens full | **35.70** | **10.98** | 121.08 | −2.65 | **12.43%** |
| Calorie Lens serving route | 60.06 | 36.39 | 123.91 | −6.32 | 21.12% |
| Calorie Lens mass + A1 components | 56.21 | 45.46 | 133.13 | +7.82 | 20.88% |

Calorie Lens full reduced MAE **50.10%** on these twenty images. Serving-route reductions were **19.84% for Plate** and **16.04% for Lens**. Plate's serving-route absolute bias slightly worsened; all values remain visible.

The Lens raw direct-head diagnostic gave MAE 35.22, median 12.22 and P90 112.07 kcal. It is a separate output, not silently substituted into the publisher pipeline or primary router.

### The fixed selection rule and its losses

Use a specialist's full estimate only when **original A1 estimated component mass sums to at least 150 g and there are at least two positive-mass component rows**. Fractional rows count. Otherwise retain A1. Invalid A1 is an explicit failure; a failed specialist falls back to valid A1. Reference grams/calories, dataset IDs and error values never enter this function.

The rule selected four of twenty meals; sixteen stayed on A1. Both specialists improved two switched cases and worsened two. In one case, Plate increased absolute error by 85.35 kcal and Lens by 80.52 kcal. In another, Lens worsened error by 53.37 kcal. See [all four cases](eligible-case-details.json) and [all 84 compared records](per-case.csv).

Both predeclared exploratory screens pass: at least 10% MAE gain, median/P90/normalized error and coverage no worse, plus old-six ECUST mass protection. This does not certify production readiness or universal per-meal improvement.

## Original ten larger mixed-meal discovery images

| Route | MAE kcal | Median absolute error | P90 absolute error |
|---|---:|---:|---:|
| A1 | 177.57 | 135.54 | 342.37 |
| Plate full | 119.20 | 75.65 | 277.79 |
| Plate mass + A1 components | 140.03 | 167.41 | 217.63 |
| Lens full | 109.26 | 92.27 | 237.68 |
| Lens mass + A1 components | **88.81** | **61.41** | **194.86** |

Lens mass fusion is useful here: it retains A1 food identities, proportions and nutrient sources and scales them by **predicted Lens mass / original A1 estimated mass**, never measured reference mass. Its improvement does not carry uniformly to the twenty-case group, where median error worsens from 43.19 to 45.46 kcal.

After inspecting primary results, an explicitly **post-hoc** application of the same serving gate to Lens mass fusion produced MAE 67.02, median 43.19 and P90 143.59 kcal on the twenty. It missed the 10% gain check and slightly worsened normalized error. This supplementary calculation is not independent validation, did not change the primary rule, and is not promoted. See [post-hoc record](posthoc-gated-mass-hypothesis.json).

## Portions, macros and source-row breakdown

For the twenty additional images:

| Route | Mass MAE g | Protein MAE g | Carbohydrate MAE g | Fat MAE g |
|---|---:|---:|---:|---:|
| A1 | 49.60 | 5.43 | 5.10 | 4.72 |
| Lens full | 21.33 | 4.77 | 4.03 | 2.56 |
| Lens serving route | 30.66 | 3.86 | 4.54 | 4.67 |
| Lens mass + A1 components | 21.33 | 3.38 | 5.06 | 4.84 |

Mass fusion's fat MAE worsens slightly; calorie gains do not imply every macro improves.

An exploratory source-row breakdown gives Lens full MAE 22.38 versus A1 55.03 kcal on twelve one-row references, and 55.67 versus 96.30 on eight multi-row references. A single composite record can itself be a mixed recipe; this is a metadata proxy, not adjudicated meal complexity or a routing input. [Subgroups](source-row-subgroups.json).

### ECUST transfer: mass only

| Route on the old six portions | Mass MAE g | Median error g | P90 error g |
|---|---:|---:|---:|
| A1 | **15.18** | **13.00** | **24.95** |
| Plate full | 33.13 | 33.35 | 50.69 |
| Lens full | 29.12 | 33.65 | 37.60 |
| Either serving route | 15.18 | 13.00 | 24.95 |

Zero old-six portions qualified for switching. This is protection **by retaining A1**, not proof of specialist transfer. On the fresh six, Plate/Lens mass MAEs were 33.47/35.12 g. Those cases have no A1 baseline and no fabricated hybrid score. **There is no ECUST calorie gold.**

## Recognition and nutrient provenance

The image model has a fixed 253-ingredient vocabulary; the open-vocabulary NutriText branch accepts text, not arbitrary image food classes. All source ingredient IDs in these thirty Nutrition5k references occur in that vocabulary, limiting conclusions about unfamiliar cuisines.

Lens displayed no named ingredient rows on **2/20** additional Nutrition5k photos and **6/12** ECUST photos. Their soft ingredient/remainder outputs still produce numerical totals. Do not call these verified food identifications or measured food-recognition success. Display scores are not calibrated accuracy probabilities. A1/NN food-recognition precision, missing-food counts and user correction benefit were not independently adjudicated. [Output coverage](recognition-output-coverage.json).

The pinned original Nutrition5k CSV matches 252/253 model rows by ID, exact name and four core nutrient values within 1e−6. Row 63 differs by trailing name whitespace and remains conservatively unverified. A matched nutrient record does not verify predicted identity, preparation or grams. Extended USDA columns remain unverified source claims.

Publisher mass gaps use `config.mean_density`, an **unverified average-training-plate prior**, never a verified database match. Gaps and their energy contribution are explicit in [provenance](mass-gap-provenance.json). MIT/Apache notices and Nutrition5k CC-BY attribution are preserved. No weights or photographs are committed in this stage.

[Plate-Vision](https://github.com/simonkundrik/plate-vision/tree/d5690063cc8795497c603aa676f97fd253053bbf) weights remain publisher research-only and are not redistributed into Calorix. Calorie Lens code/weight lineage is retained from its pinned MIT/Apache release. Exact released-checkpoint training membership is unverified; author-reported 40.9 kcal on 507 overhead test scans is not this comparison.

Further source-only inspection of FoodCNN's [pinned training notebook](https://github.com/FoodCNN/FoodCNN/blob/2c944166f988acff4374d131b8b1fe535a64abf6/src/02_weight_estimation/DeepWeightCNN.ipynb) found an image-row split after collecting multiple frames per dish. Exact checkpoint overlap is unknown. Its small mass-head checkpoint remains unbenchmarked here; no claim of clean held-out superiority is made.

## Execution, latency and reproducibility

Host: aarch64 Raspberry Pi4, Debian13; task-only Python3.11.15, CPU torch2.13.0+cpu/torchvision0.28.0+cpu, transformers5.22.2, safetensors0.8.0, NumPy2.2.4 and Pillow11.1.0. Full dependency lock and official CPU wheel SHA URLs are pinned; remaining wheels used PyPI and the host's piwheels configuration. Two intra-op threads/one inter-op thread; no dedicated-core affinity claim.

Lens median food processing took **63.65 seconds** (range 61.32–78.35), versus **316.06 ms** for twenty new Plate predictions. Lens model loads took 23.34/19.30 seconds separately. These are host measurements, not Android or deployment predictions. Local energy/compute expense is unknown; no new meal-inference API request was made.

Repeated ~65-second measurements showed that 42 photos exceeded the initial 1200-second budget. Before inspecting **food-estimate** outcomes, the timing-only intent and reviewed 3600-second continuation were frozen. The first blank's 63.6 g numerical output had been seen; it was never a weighed reference or a selection criterion. Original partial outputs, seven acknowledged Lens foods and all twenty Plate foods were preserved. Only the owned Lens worker was stopped; 35 remaining food IDs were frozen by completed-file absence. An in-flight forward may have been interrupted, with no saved prediction. Completed records were not retried or selected by error.

The continuation exited 0 with no resource stop. Sampled peak RSS was 1,128,398,848 bytes (about 1.051 GiB), under the 2.5 GiB watchdog threshold. Sampling is not hard OS isolation. The original source profile is immutable; the separate [runtime amendment](../../functions/eval/tier1-public/calorie-lens-runtime-amendment-v1.json) records the budget override. Both blank qualifications returned identical raw heads, publisher summaries and input tensors; that is numerical-contract evidence, not food accuracy.

### Verification actually completed

- 130 Python / 40 Node tests passed; 130 Python tests also passed in the actual inference venv. New adapter/routing and source-pin tests observed RED→GREEN. Compile and whitespace checks passed.
- Clean-source preflight checked image, reference-receipt, model, metadata and runtime pins.
- Independent verification checked all **84 input tensors/raw records**, 99 image-only specification entries, 1,743 publisher summary fields, 336 nutrient dot products, 210 direct-head fields, 10,668 independently recomputed gram-readout fields, 338 Decimal metric fields and 72 routed cases.
- Metric tolerance was 1e−9. Independent float64 gram reconciliation differed by at most 0.000356535 g across all 42 Lens records, below the 0.01 g engineering tolerance. This is not an uncertainty interval.
- All 64 new raw output/qualification records are losslessly compressed with original SHA256 values. Materializing the published evidence reproduced primary metrics, the 84-row CSV, eligible-four report and independent receipt **byte-for-byte**, with no model forward calls.
- Antigravity primary `gemini-3.8-flash` / yolo pre-plan, source, separate fresh-context source, source-note, runtime-amendment and actual-result and final-curation reviews returned agree / MUST_FIX none; no fallback was needed in this workstream. A bounded primary-source consultation also checked the two pinned model texts; its factual research response is not counted as an approval gate.
- External reviewers saw supplied source/measurements, not every raw image/artifact. Full numerical replay above was performed by the host. Reject reviewer claims of universal safety/no-bias, exact checkpoint membership, qualification-before-all-models, fabricated source line aliases, a 1.13 GiB conversion, or a permanent rejection of every mass-fusion method. No exhaustive visual identity or UI-diff audit occurred.
- No current-source Android/backend build or deployment is claimed for these headless-only changes. Existing production code and its older CI qualification were not relabeled as newly built.

### Replay the published evidence

From the repository root and with the pinned analysis dependencies:

```bash
CALORIX_REPLAY_DIR=/absolute/disk-backed/calorix-replay
python3 docs/tier1-calorie-lens-2026-11-11/materialize_evidence.py "$CALORIX_REPLAY_DIR"
# Copy/link the exact frozen assets/ directory into CALORIX_REPLAY_DIR/assets.
PYTHONPATH="$PWD" OPENBLAS_NUM_THREADS=1 python3 \
  docs/tier1-calorie-lens-2026-11-11/independent_audit.py \
  "$CALORIX_REPLAY_DIR" /absolute/new/audit-output
```

The audit performs no model forward calls or downloads. The original code commit must be available in Git. Image source URLs, conversion settings and input SHA256 values are in the existing manifests; exact JPEG reconstruction requires matching encoder behavior and preflight refuses drift. Images and weights remain outside Git. Recorded worker paths are original provenance, not portable commands to execute.

## Next engineering decision

Keep the existing A1 workflow and preserve these candidates and losses. The next bounded experiment is **prediction-parity and latency testing of the same pinned Calorie Lens model through the existing ONNX CPU runtime**. Define numerical parity tolerances before execution and keep hardware/thread settings comparable. This optimization has not been performed. It is preferable to another training effort or an unmeasured infrastructure change while a 63-second CPU latency remains unresolved.

Repository hygiene: an unexpected empty untracked `nutrients` file appeared in the original checkout during the bounded research window. Its creator is unproven. It was preserved in place and excluded from the commit; source-code pins remain unchanged. A separate clean checkout verifies publication integrity. See [review-window record](review-window-noise.json). The research response was not counted as an approval gate.
