# Released food models: actual same-image comparison

**Result: useful reusable systems exist, but neither tested model qualifies as a Calorix replacement.** Plate-Vision substantially improved the calorie comparison on the ten selected Nutrition5k meals. Both models made worse portion estimates on the six ECUST portions with retained A1 baselines. Keep the production A1 model unchanged.

Source: `e753225e99ea194b94af7f302290eecbfbd547f6`, committed and pushed clean before inference. Experiment: `open-models-v1`. Two models × 22 fixed photos = **44 local CPU predictions**, all with valid positive mass; no training or new cloud/VLM calls. The cumulative cloud food SDK entry count remains 187. This is not 44 new meals.

## Calorie results: the same ten weighed Nutrition5k meals

All routes have 10/10 valid nutrition outputs. Values are complete served-meal estimates in kcal. P90 uses linear interpolation at index `(n−1)×0.9`; normalized error uses `max(reference kcal, 200)`.

| Route | MAE | Median absolute error | P90 absolute error | Signed bias | Mean normalized absolute error |
|---|---:|---:|---:|---:|---:|
| Retained A1 LOW baseline | 177.57 | 135.54 | 342.37 | −177.57 | 30.44% |
| Plate-Vision direct nutrition | **119.20** | **75.65** | 277.79 | −89.39 | **21.69%** |
| Plate-Vision mass + A1 composition | 140.03 | 167.41 | **217.63** | −70.33 | 24.54% |
| Dish2Calories direct nutrition | 260.55 | 222.16 | 490.29 | −228.85 | 48.27% |
| Dish2Calories mass + A1 composition | 215.78 | 189.70 | 315.90 | −188.70 | 40.41% |

Plate direct calorie MAE fell **32.87%** on these ten existing development images. That is a measured improvement, not an adoption decision or a comparison with publisher headline metrics. Plate mass fusion improved mean and P90 error but **worsened median error** relative to A1. Do not hide that divergence or assume every meal benefits from mass rescaling.

Full mass and macro errors, matched-case comparisons, coverage and frozen screen outcomes are in [result.json](result.json); all cases appear in [per-case.csv](per-case.csv). Direct learned nutrient totals are explicitly unverified model estimates, not verified nutrient-database matches. Fusion uses model-predicted mass / original A1-estimated mass, preserving A1 component proportions, identities and nutrient provenance. Reference mass is never used for fusion.

## Transfer diagnostic: twelve ECUST smartphone portions

These have author-reported gram references only. **No ECUST calorie accuracy is measured.** The six categories are bread, bun, doughnut, fried dough twist, mooncake and sachima; these simple portions do not represent all mixed meals.

| Route on the same old six portions | Mass MAE (g) | Median absolute error (g) | P90 absolute error (g) | Bias (g) |
|---|---:|---:|---:|---:|
| Retained A1 baseline | **15.18** | **13.00** | **24.95** | +11.45 |
| Plate-Vision | 33.13 | 33.35 | 50.69 | +27.88 |
| Dish2Calories | 27.54 | 19.54 | 48.10 | +9.77 |

| Separate subgroup | Plate mass MAE (g) | Dish mass MAE (g) |
|---|---:|---:|
| Fresh six portions; no A1 baseline | 33.47 | 29.93 |
| All twelve portions | 33.30 | 28.73 |

Both models fail the **predeclared exploratory screen** because old-six mass MAE and P90 worsen. This does not establish that every learned portion model fails. No post-result fitting, threshold changes, replacement photos or production promotion occurred.

All 44 runs returned valid mass, with no worker or resource-limit failures. Dish had **9/12 ECUST direct-nutrition failures** because no vocabulary item crossed its fixed threshold. The publisher's raw zero totals are retained, while the adapter marks those nutrition estimates unavailable. A mass success is not a nutrition success. Plate had no direct-nutrition failures on these 22 inputs.

## Sources, rights and training exposure

The [source audit](../open-source-food-model-audit-2026-11-10.md) records seven projects and immutable source revisions. We reused released preprocessing, head decoding and published model bytes rather than training a new model or restarting Calorix.

- **Plate-Vision:** [pinned source](https://github.com/simonkundrik/plate-vision/tree/d5690063cc8795497c603aa676f97fd253053bbf), `model-v0.2.0`; 33,995,501-byte ONNX, SHA256 `3f982c4aa8658a032cbc2a656040953a17744a3d35df11b49e722eed07f9f431`. MIT code, publisher research-use-only weights. No model redistribution into app or repository. Official dish split claimed, exact checkpoint membership unverified. Interval/conformal outputs are ignored.
- **Dish2Calories:** [pinned source](https://github.com/AmirrrezaZ/dish2calories/tree/23858d3a8c7e9a036fc36e4f6ac7e882f61aa950); 16,754,310-byte ONNX, SHA256 `f9fd72c5ac79952592a522f2fd2d9e71f53f9bd28481646dccb617f94f4e7c0f`. MIT repository with Nutrition5k attribution. Source expands dishes into frame rows before train/test splitting, allowing different views of one dish across splits. Exact released-checkpoint membership is unknown; these Nutrition5k scores cannot establish independent held-out superiority.
- **Calorie Lens:** [pinned release](https://huggingface.co/shalev396/calorie-lens/tree/f0d34a638b6b572e2df601067881b56fe6848c79) is the highest-value next pretrained candidate: complete implementation, 253 ingredient-gram queries and a frozen nutrient table, with MIT/Apache notices. Its 378,588,160-byte safetensors have not been executed here. A separate pinned runtime and bounded memory/load test are needed before a same-image comparison; author-reported accuracy is not our measurement.

Existing public reference inventory is 80 Nutrition5k scans plus 12 ECUST portion IDs; this experiment reuses ten of the former. Independence of physical plates is unverified. We have **zero weighed Android meal references**. No medical accuracy, numerical uncertainty interval, Android transfer or population-level claim follows.

## Actual runtime and verification

Host verified as Raspberry Pi 4 Model B, aarch64, Debian 13. Task-scoped Python 3.13; ONNX Runtime 1.31.1, NumPy 2.2.4, Pillow 11.1.0; CPU provider only, two intra-op and one inter-op thread, sequential execution.

| Measurement | Plate-Vision | Dish2Calories |
|---|---:|---:|
| Median preprocessing + forward + decoding per image | 301.67 ms | 194.19 ms |
| Model session load | 363.26 ms | 217.23 ms |
| Sampled peak worker RSS | 178,262,016 B | 126,136,320 B |
| Worker exit / resource stop | 0 / none | 0 / none |

These are local host measurements, not Android or end-to-end UI latency. RSS is sampled every 0.2 seconds, not a hard OS memory cap. Cloud inference requests and their API expense were zero; host energy/compute expense was not measured.

- **122 Python and 40 Node tests passed**, including observed RED→GREEN adapter and matched-case coverage regressions.
- Compile and whitespace checks passed. Clean-source preflight verified manifest, runtime, both weights/configs, all 22 photos and retained A1 receipt pins.
- Independent replay checked **44 raw-record hashes, 44 tensor hashes, 44 image-only worker specifications, 184 decoded head fields, 100 fusion fields and 134 Decimal metric fields**. No reference labels were passed to the workers. Metric tolerance: 1e−9; inverse-log tolerance: 1e−8; independent float32 macro equivalent: 1e−4. See [verification receipt](independent-verification.json).
- The published [independent replay script](independent_replay.py) reproduced the receipt and all 44 CSV rows byte-for-byte in a fresh output directory.
- Production app/backend unchanged. No new full Android build, deployment, device interaction or visual-diff gate is claimed. Prior core CI evidence is not relabeled as a new build.

## Antigravity review and rejected assertions

Research, amended plan, source and separate fresh-context whole-feature source reviews, followed by actual-result review, used `gemini-3.8-flash` / yolo. Each completed review explicitly returned `AGREEMENT_STATUS: agree`, `MUST_FIX: none`. Source/result reviews examined supplied text and measurements, not every raw artifact or image. Exhaustive numeric/raw/tensor verification above was performed by the host; there was no exhaustive external visual audit.

The broad research call timed out at 300 seconds; 3.7/3.6 fallbacks rejected high reasoning effort. Initial invalid zero-turn arguments were corrected before those actual fallback attempts. [Exact errors](research-route-errors.json) are retained; failed calls are not counted as agreement. The successful narrowed research review did not independently browse the web.

The actual-result reviewer incorrectly called the host x86_64; `uname -m` and device-tree model confirm ARM64 Raspberry Pi. Reject its unsupported causal explanation of fusion errors, statistical “significance,” claimed memory multipliers, prescribed future memory cap and guarantees about security, legal clearance or training membership. Keep the observed numbers, limitations and explicit no-promotion decision.

## Reproduce

From a clean checkout of the source commit, install `tool/open-model-requirements.txt` into a dedicated disk-backed task venv. Obtain both artifacts from the exact URLs in [profile](../../functions/eval/tier1-public/open-model-profile-v1.json), honoring upstream terms; verify bytes/SHA256 before execution.

The [frozen manifest](../../functions/eval/tier1-public/manifest-open-models-v1.json) records all 22 image and baseline hashes. ECUST image URLs are pinned there. Nutrition5k original source URLs and the RGB JPEG85/subsampling2 conversion are recorded in [meal-range manifest](../../functions/eval/tier1-public/manifest-mealrange-v1.json) and its existing preparation tools. Use those exact JPEGs, not alternative frames. Put inputs under `TASK/assets/inputs/`, models under `TASK/models/`, and create disk-backed `TASK/tmp/`. Do not write caches or large artifacts into RAM-backed /tmp.

```bash
TASK=/absolute/disk-backed/open-model-task
TMPDIR="$TASK/tmp" "$TASK/venv/bin/python" -m tool.run_open_model_eval \
  --repo "$PWD" --assets-root "$TASK/assets" --models-root "$TASK/models" \
  --tmpdir "$TASK/tmp" --output "$TASK/experiment" --preflight-only
# After successful preflight, repeat the same command without --preflight-only.
# The experiment directory must not already exist.
```

The runner records raw heads, input tensor hashes, timings, all fixed-case failures, provenance and metrics. With the publication checkout and original task assets/experiment directory, run `python docs/tier1-open-models-2026-11-10/independent_replay.py TASK NEW_AUDIT_DIRECTORY` for the separate artifact audit. No model inference is performed by that audit.

**Next engineering decision:** test the released Calorie Lens model on these frozen inputs after a bounded CPU/runtime qualification. Keep A1 deployed, preserve Plate as a useful in-domain challenger, and do not introduce object printing, second-photo requirements or new training from this result.
