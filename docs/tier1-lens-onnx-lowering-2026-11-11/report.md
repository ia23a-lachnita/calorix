# Stable FP32 ONNX candidate: strict parity passes

The explicitly versioned **v3-stable-sigmoid** candidate passes all frozen numerical and decision checks on42public photos plus6matched Torch controls. Median matched CPU speed ratio is **1.9393x**. This is a faithful, faster runtime for the SAME estimator, not an improvement in meal-calorie accuracy or a production deployment.

| Protocol / candidate | Numerical result | Speed qualification |
|---|---|---|
| Original raw-v1 conversion | FAILED, retained unchanged | raw_speed_qualified=false |
| Original endpoint-v2 conversion | FAILED on42conditional-log-gram heads, retained unchanged | material/strong=false |
| Versioned v3 stable candidate | 42/42ORT +6/6Torch strict7head ANDall253decision/point/metric checks PASS | material>=1.25PASS; strong>=2FAIL |

Originalfailures remain coupled to every v3artifact. We did not relax a tolerance or relabel the first conversion. No default app/backend change is promoted.

## What changed and was reused

Reused pinned CalorieLens source/config/checkpoint, existing nutrient records/provenance, the SAME42JPEGs and historicalmodel outputs, scoring modules and six seed-selected counterbalanced controls. All12originalsource pins and the old runtimeprofile/summary remain unchanged. No model training, camera change, new photographs, new food-VLM calls or API service. Existing Android A1 capture/edit/save workflow remains the production baseline.

One ONNX Sigmoid becomes10standardFP32nodes: e=exp(-abs(x)), d=1+e, where(x>=0,1/d,e/d). The learned parameters, input preprocessing, two mirrored views, blends, output schema and nutrient table stay unchanged. ORT optimization is explicitlyNONE for this candidate. It is a new serialized artifact, not the original graph silently patched in place.

Independent graph audit confirms1094→1103nodes, all1093othernodes byte-identical,331initializers identical, input/output/opset/IR unchanged. Parentgraph SHAcd1f8b96b6fbc1992d79e79551eb8e492f1ced568ba080ee0817b6bb9bb0c80a; candidate SHA70c2d8813e9eb17a26536c4cae105b68a7738d6bd6d322a9a128a84afab5cb9e. External weights358,417,205B SHA f660f737f7780254f8b553aba05ad1a2332f095ce0eb65556ce603440231c276 are byte-identical independent copies. Checkpoint378,588,160B SHA302f495630509a45d3437d56fdf234e0d1ecc80251cf75b71a6e73e69c05cb38 unchanged.

## Measured execution

Frozen source **dc8aff0f43b6c3dea604ca621de7807f3d76f085** was reviewed, tested and pushed clean before the candidate's first model forward or food evaluation. One strict owned-blank qualification passed(32.844s); its conservative cohort projection was2368.489s, not a guarantee. Both benchmark warmups then passed. The all48food worker exited0/no resource stop in1966.157s; sampled peak1,993,035,776B (~1.856GiB). Watchdogs, not kernel isolation.

Hardware/runtime: RaspberryPi4 ARM64 CPU, pinnedPython3.11.15/Torch2.13.0+cpu/ORT1.31.1/NumPy2.2.4/Pillow11.1.0. One process holds both models and runs them sequentially. Both receive the same contiguousFP32input;2intra/1inter, passiveOMP/poolspinningoff, three pairedorders each,10s pair pauses. No CPU affinity or exclusive-host claim.

- All42ORT image-wall median: **32.390s**.
- Six matched Torch median: **63.311s**; matched ORT median: **32.663s**.
- Declared median of six per-case ratios: **1.939323x**; ratio-of-medians: 1.938325x.
- All ratios: bread004: 1.8754x, bread005: 2.0473x, dish_1562963246: 1.9909x, dish_1566414412: 2.0150x, dish_1560203400: 1.8877x, dish_1568401233: 1.8682x.
- ORT food endpoint temperature snapshots 50.63–57.45C. Snapshots do not establish continuous thermal/frequency conditions.

These are localCPU timings, not Android or deployed-service latency, inference-cost savings, statistical confidence intervals or a generalized speed guarantee. No new app/Android/backend build is claimed for these headless-only changes.

## Accuracy and references

Every served calorie and primary macro estimate differs by at most0.01kcal/0.01g; rounded total mass, displayedfood names/order, all253presence decisions(.65) and mass-display eligibility(3g) are identical. All7unroundedhead bounds pass too, including the conditional-log-grams that failedbefore. These are numerical-engineering bounds, not meal-accuracy intervals.

On20additionalN5photos, oldTorch and v3both retain MAE35.69504695, median10.9791435 andP90121.0789815kcal. On10originalN5photos, MAE changes+.002kcal, median/P90 unchanged; bothECUST mass groups unchanged. This preserves earlier accuracy, including its weaknesses. Training overlap and target-phone/recipe generalization remain unknown; no adjudicated food-recognition improvement. Same252/253core nutrient matches, conservative record63mismatch, unverified extended fields, mass-gap priors and unnamed-food outputs retain their labels.

Thirty N5photos have recipe-derived complete-meal served calorie references;12ECUST portions have gram references only. No consumed-calorie or freshly weighed Android validation. References do not enter inference. This stage adds48local records; with previousv2's48,96newrepeated food predictions span the SAME42photos. Cumulative released-model food records202(previous106+96), not202meals. Trackedfood-evaluation SDK count187unchanged. Twelve savedownedblank predictions across originaldiagnostics/v2/v3 are separate; export/tracing and scalar/operator fixtures are separate from meal counts.

## Failed startup and provenance

The first v3worker at99fcbb2 stopped beforeORTsession/forward: ONNX1.23.2checker rejects multiply-linked externaldata. The file-storage regression reproduced that exacterror. IO-only correction uses verified copies, keepschecker protections, restores parentnlink1, retains allfailure traces/inode metadata and requires the SAME candidate graphSHA beforeORT. No numericalcandidate retry occurred; no blank ran in the failedstartup. Earliermemory-floor mistakes/Dynamo/legacy/v2failures are retained in the original report. No archive was scrubbed or reference-based case excluded.

[All48per-case predictions, references, errors, timing and source flags](per-case.csv). Calorie-reference fields remain empty for mass-only ECUST; no invented zero-calorie references.

## Verification and reproducibility

-157/157Python tests pass in the pinned inference environment. System157with4optionalONNXskips;40/40Node tests pass.
- Independent full replay:16sourcepins,42baseline hashes,48record/tensor hashes,49,248rawscalars,24,288discrete decisions,12,192gram fields,384nutrient products,1,640publisher fields,36Decimal metric fields andsix timing ratios. Max independentgram difference0.000856372g(<0.01g engineering bound). No auditor forward calls.
- Independent graph/weight audit as above. PublishedrawJSON/text is losslessgzip with original bytecounts/SHA; no model weights/photos committed.
- Model binaries and exact pinned environment remain local task assets; portable raw-result replay needs neither weights nor neural inference. No artifact-release/deployment claim.

Replay from a checkout with the existing NumPy/Pillow evaluation requirements:

```bash
python -m tool.summarize_lens_lowering --repo . \
  --execution docs/tier1-lens-onnx-lowering-2026-11-11/execution \
  --output /disk/task/replayed-result.json
python docs/tier1-lens-onnx-lowering-2026-11-11/audit_full.py \
  --repo . --execution docs/tier1-lens-onnx-lowering-2026-11-11/execution \
  --summary /disk/task/replayed-result.json --output /disk/task/replayed-audit.json
```

Omitting localassets on portableaudit verifies storedtensor hashes against pinnedbaselines; the actual host audit additionally reconstructed all42pixels/tensors. Graphaudit requires the retainedbinary artifacts andONNXpackage. Raw-v1/v2failures andcandidatev3verdicts are always reported together.

Next highest-value accuracy experiment: freeze an A1/specialist selection rule using food-domain agreement, then compare it on an additional weighedpublic-meal cohort with the existing ECUST regression slice. It must test actual calorie/portion transfer, not merely runtime, and must not select winners by reference error. No new training or capture requirement is implied.

Actual-result and independent-auditor source reviews: Antigravity gemini-3.8-flash/yolo, explicitagree/MUST_FIXnone; suppliedtextonly, no external exhaustivepixel/rawinspection. Hostnumeric/graphreplaywasexhaustive. Allcallsusedprimaryrouteinthiscandidateworkstream; earliercanonicalfallbackerrors remainintheoriginalruntimeevidence.

Fresh checkout at publication5a35409 passed107Git-visiblefilepins,157pinnedPython/40Node tests, fullsource/input/runtime/parentpinpreflight and byte-exact summary/48rowCSV replay. Portableaudit matcheshost receipt except its explicitpixel-recompute flag(falsewithoutlocalimages; actualhosttrue). Temporarytask-owneddependency symlink wasremovedaftertests beforecleanpreflight; targetdependenciesretained, no sourcechange. [Verificationreceipt](fresh-checkout-verification.json).
