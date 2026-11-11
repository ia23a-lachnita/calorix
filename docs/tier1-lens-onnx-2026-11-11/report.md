# Same-checkpoint ONNX runtime experiment

The converted model runs faster, but it **fails both predeclared numerical compatibility protocols**. No production/default or app change is promoted. This is runtime engineering on the same public photos, not new food-accuracy validation.

| Experiment | Actual result | Verdict |
|---|---|---|
| Original raw-v1 qualification | 4/253 blank logits exceed frozen bounds | FAILED; raw_speed_qualified=false |
| Endpoint-compatibility-v2 | 42/42 food conditional-log-gram heads exceed unchanged bounds | FAILED; material/strong qualification=false |
| Served values/display decisions | 42/42 names, order, mass and all253 presence/display-eligibility decisions identical; kcal/macros differences <=0.01 | Descriptive result only; both protocol failures remain |
| Matched CPU timing | Median of six paired Torch/ORT image-wall ratios **1.8555x** | Observed speed; not a qualified deployment |

## What ran

Source `1979215b200e43e123ce6ab020dbe06b18f3ab75` was reviewed, committed and pushed clean before new blank qualification and any food ORT call. Same pinned Lens HF revision, safetensors, model/config, RGB/BICUBIC input, FP32, two mirrored views, 253 classes and nutrient provenance. Original model/scoring modules remain unchanged. No true grams or reference calories enter workers.

Forty-two ORT food records plus six counterbalanced PyTorch controls completed, exit0/no resource stop. These are repeated predictions on **42 existing photos**, not48 meals. Thirty Nutrition5k cases have recipe-derived calories; twelve ECUST portions have grams only. No new physically weighed Android reference or food-VLM call. SDK entries remain187. Cumulative persisted released-model food records become154 (previous106+48), not154 unique meals.

Both models ran sequentially in one process on the Raspberry Pi4 ARM64 CPU, two intra/one inter threads, passive pools; ORT1.31.1 CPU only, optimizationALL. Warmups/cold loads are separate; six pairs used three orders each and10s pauses. Median42ORT image wall **36.443s**. Matched medians: Torch **67.109s**, ORT **36.497s**; ratio-of-medians 1.8388x differs from the declared median-of-ratios above. All six ratios are retained. No CPU-affinity, exclusive-host, Android latency, confidence interval or generalized speed claim. Worker wall2145.733s; sampled peak2,108,284,928B (~1.964GiB), watchdog rather than kernel isolation.

## Accuracy and numerical interpretation

On20additionalN5 cases, Torch and ORT both give MAE35.69504695, median10.9791435 andP90121.0789815kcal. On10originalN5 cases, MAE changes109.2579353→109.2599353kcal; median/P90 unchanged. BothECUST mass groups are unchanged. These describe preservation of a previous estimator, **not an accuracy gain**. Upstream training overlap and target-population transfer remain unknown. No verified recognition claim: unchanged named-food failures remain. Core nutrient matches/unverified extended fields and mass-gap priors retain original labels.

Raw-v1 is never reclassified. The separately named v2 contract was frozen/reviewed/pushed before any foodORT and retained all six other raw-head bounds plus exact253 actual decisions and point/metric bounds. Every food fails only log_grams:numeric; the failure remains even though physical quantities match. No cases excluded, tolerances tuned after food or winner selection by reference error.

## Failed routes and debugging evidence

Initial two workers hit a mistaken continuous3.5GiB available-memory floor. Reviewed correction keeps3.5GiB startup,512MiB runtime reserve and3GiB RSS cap; original failed attempts are retained. Corrected Dynamo exported74.145s toIR10/opset18; graph/data hashes are pinned, binaries outsideGit. Corrected legacy failed unsupported aten::_upsample_bicubic2d_aa. No operator/backend/precision patch was applied to this cohort.

One original blank plus five diagnostic blanks showed freshTorch exactly repeats old raw output; all four ORT optimization settings fail3–4blank logits. Newv2blank plus two cohort warmups bring measured nonfood blank forwards to9. Export/tracing work is separate. Standalone13-element arithmetic fixtures demonstrate that tiny sigmoid probability differences can be amplified by inverse-logit, but do not prove the full model's first divergent operator. ORT1.31.1 [CPU activation](https://raw.githubusercontent.com/microsoft/onnxruntime/v1.31.1/onnxruntime/core/providers/cpu/activation/activations.cc) and [MLAS logistic](https://raw.githubusercontent.com/microsoft/onnxruntime/v1.31.1/onnxruntime/core/mlas/lib/logistic.cpp) source support the mechanism. All three fixture variants/results are preserved.

## Verification and next bounded experiment

151Python tests pass in host and scoped runtimes;40Node tests pass. Independent replay verified48raw hashes/tensors,49,248raw scalars,24,288discrete decisions,12,192gram-readout fields,384nutrient products,1,640publisher fields,36Decimal metric fields andsix timing ratios. Max independent gram-readout difference0.000881522g (<0.01g engineering bound). No neural calls in the auditor. No new app/backend build or UI validation is claimed.

Next is ONE explicitly versioned stable-sigmoid standard-FP32 lowering candidate, with unchanged source/weights and original strict numerical bounds. It will run one blank only after source/tests/reviews/cleanpush; if rejected, stop that candidate without retries. If accepted, reuse all42/six controls. This is a mathematical export compatibility fix, not training or architecture redesign; original raw/v2 failures remain.
