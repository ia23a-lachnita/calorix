# Calorie Lens ONNX parity and CPU runtime implementation plan

> Execution: use superpowers:executing-plans inline. Continue the approved Tier-1 roadmap without another user approval. Keep required external research/source/result reviews and test-first development.

**Goal:** Measure whether the identical pinned Calorie Lens estimator can run faster in ONNX Runtime without meaningful output changes.

**Architecture:** Retain the original four inference/scoring modules and vendor source unchanged. Add a small NumPy input/summary adapter, explicit parity contract and bounded export/evaluation runner. Reuse the existing 42 photos, source checkpoint, saved PyTorch outputs and publication format; no training or product deployment.

**Tech stack:** Python3.11.15, existing CPU torch2.13.0+cpu/torchvision0.28.0+cpu/transformers5.22.2; new scoped ONNX1.23.2, onnxscript0.7.2, onnx-ir1.1.0, protobuf7.36.2 and ORT1.31.1. NumPy2.2.4/Pillow11.1.0 stay fixed.

**Spec:** V7.1 binding addendum and original Tier-1 master; the user approved the next same-model ONNX parity/latency step after the completed comparison in docs/tier1-calorie-lens-2026-11-11/report.md.

## Constraints

- Clean isolated worktree from cd1e715, new branch feat/calorie-lens-onnx. Preserve the original checkout and its unknown empty file. Same bounded native editing exception applies; no claim of permanent worker unavailability.
- Model HF f0d34a638b6b572e2df601067881b56fe6848c79; source and config pins unchanged; 378588160-byte safetensors SHA302f495630509a45d3437d56fdf234e0d1ecc80251cf75b71a6e73e69c05cb38.
- Preserve float32, full two-view mirroring from one photo, fixed 1×3×378×504 input, all blend parameters, no measured total grams, no attention-backend substitution, quantization or smaller input.
- Preserve source BICUBIC aspect-fit/mean padding and internal normalization. Pure NumPy summary keeps publisher Python rounding, all unidentified mass and source provenance; numeric validity is not recognition accuracy.
- Own disk-backed task temp/cache/model artifacts. Create a fully isolated task venv and install the exact baseline wheels/lock plus pinned ONNX dependencies. No .pth linkage or baseline-environment mutation. Do not resolve/use a LocateAnything interpreter/model, GPU, SSH or emulator.
- No app/backend/production/default change or new meal-inference cloud calls. New files only: existing benchmark source remains auditable.
- External reviews operate with NO TOOLS, full supplied text, in an external task directory to avoid repository noise.

## Review focus

1. Tensor channel/layout/range mistakes or double normalization: pin pixel fixtures and all 42 input tensor hashes.
2. NumPy port changes source rounding, unidentified mass or ingredient display: test fixtures and all saved PyTorch summaries independently of export.
3. NaN, wrong shapes, silent output name changes or threshold loosening: explicit fail-closed per-head and point/semantic gates.
4. Export fails, uses unsupported operators, consumes excessive RAM or writes large artifacts: bounded processes, retained failures, at most two routes.
5. Misleading timing comparisons or food/reference leakage: frozen six controls, interleaved matched timing, image-only worker cases, separate warmup/load/wall metrics and all failures.

## Numerical contract, fixed before export

| Output | atol | rtol |
|---|---:|---:|
| logits, log_grams, log_totals (dimensionless) | 0.0001 | 0.0001 |
| soft, grams, mass_gap (g) | 0.005 | 0.0001 |
| totals kcal | 0.05 | 0.0001 |
| totals six gram-valued nutrients | 0.005 | 0.0001 |
| totals sodium (mg) | 0.5 | 0.0001 |

Endpoint differences: kcal<=0.10, macros<=0.02g, total mass<=0.10g; exact displayed ingredient names/order and zero-named counts. Full42 MAE/median/P90 changes <=0.10kcal; old mass metrics <=0.10g. No per-case exclusion, clamping, label fitting or tolerance relaxation. These are numerical engineering bounds, not accuracy intervals. Pure NumPy port is checked first on saved PyTorch tensors, so serializer effects are distinguishable from graph conversion.

## Bounded export and timing

Primary: torch.onnx.export(dynamo=True,opset18,optimize=True,external_data=True,verify=False), fixed shape and seven named outputs. Installed Torch exporter uses IR10/Torchlib18. If export or owned-blank qualification fails, exactly one fallback: export the SAME nn.Module wrapper directly through legacy ONNX opset18, without JIT freezing. Legacy antialiased-bicubic export may fail; preserve that failure rather than patching operators or changing attention. No custom operator/backend/IR/precision patches. First graph passing structure, CPU input/output contract and blank parity is selected before food evaluation.

Export: CPU2 threads, sampledRSS3GiB, >=3.5GiB available before start, 900-second wall/idle limits, 512MiB artifact cap per attempt. Runtime: one process holds both models and runs them sequentially; combined sampledRSS3GiB, >=3.5GiB available, 120-second idle /3600-second worker wall. Only task-owned children may be terminated. These are watchdogs, not kernel isolation.

Six controls chosen only by seeded ID hashes: 2 discovery10, 2 validation20, 1 oldECUST, 1 freshECUST. Interleave the six paired PyTorch controls at their positions in the 42-image ORT sequence. Three fixed control ranks use Torch then ORT, three ORT then Torch; both sessions have separate owned-blank warmups and cold-load timers. One worker holds both sessions, with total combined memory guarded. ORT uses CPUExecutionProvider only, 2 intra-op/1 inter-op, sequential/ALL graph optimization, no CPU-affinity claim. Disable idle pool spinning and use OMP_WAIT_POLICY=PASSIVE for both conditions; pause 10 seconds after each paired control. Record cold loads, warmups, image wall and forward+decode timing, combined RSS, versions, CPU frequency/temperature. Forty-two new ORT food records and six PyTorch repeats are not new meals. All export dummy/qualification work is recorded separately. If blank qualification exceeds128seconds, stop full runtime evaluation and report incomplete parity instead of spending another slow42 sweep. Report every speed ratio. Material speed screen: full42 parity, all6 controls and >=1.25× median matched image-wall speedup; >=2× is a separate strong-speed flag; no automatic deployment.

## Task 1: adapters and frozen contract

Files: tool/lens_onnx_contract.py, tests/test_lens_onnx_contract.py, functions/eval/tier1-public/lens-onnx-profile-v1.json.

- [x] Write tests for preprocessing colors/aspect padding, source summary/remainder/rounding/empty names, shape/NaN/head-specific tolerances/endpoint and semantic failure, control-ID selection invariance.
- [x] Observe RED, implement minimal NumPy helpers and parity report, observe GREEN.
- [x] Freeze runtime, all existing42 source/model/input/baseline hashes and six controls. Compare pure adapter against all stored42 PyTorch records without new model calls.

## Task 2: export and runtime execution

Files: tool/run_lens_onnx.py, exact optional-dependency lock/profile, status/ledger.

- [x] Implement bounded offline strict-loading export workers, output-name contract and structural/external-data checks; preserve each attempt and failure.
- [x] Add CPU ORT numerical qualification and full42 records, same-process interleaved Torch controls, source/hash/runtime receipts and reproducible offline scoring.
- [x] Complete focused/full Python and Node checks, primary plus separate fresh-context source review, commit/push clean before model code.

## Task 3: actual measured experiment

- [ ] Preflight clean source, pins, free memory, provider/runtime versions. Export first route; only use predeclared fallback if necessary. Pin selected artifact bytes/SHA.
- [ ] Qualify before food evaluation; run six controls and all42 parity/runtime records within bounds. No source/model/profile edits while active.
- [ ] Independently check all raw endpoints/tensor hashes/metrics and timing calculations; actual-result external review.
- [ ] Publish lossless raw evidence and limits, update model manifest/pilot/status, verify a fresh checkout, commit/push.

## Evidence boundaries

The historical full model achieved MAE35.70kcal on the twenty additional N5 photos but retained recognition/domain/latency limitations. This experiment tests conversion and speed, not a new accuracy claim. Author training exposure and target-device generalization remain unverified. No synthetic image is a weighed food reference.

Pre-review disposition: initial external review disagreed. Accepted fresh venv, direct-module legacy fallback, interleaved controls and a separate 1.25× material/2× strong speed screen BEFORE measurements. Corrected misreadings: Pillow BICUBIC is retained; no NumPy resampling kernel is proposed. Source threshold is .65/min3g, ordering is descending grams. Reject hysteresis/confidence sorting because it changes published semantics; report boundary-sensitive failures instead. Per-worker3600s excludes separate export budgets. Reject unsupported claims of guaranteed export failure, ABI corruption or impossible2× speed. Revised pre-review must be green before feature code.

## API evidence checked before source implementation

- [ORT CPU threading](https://onnxruntime.ai/docs/performance/tune-performance/threading.html): explicit intra/inter counts, sequential execution, optimization and spinning settings; thread count does not establish affinity.
- [ORT compatibility](https://onnxruntime.ai/docs/reference/compatibility.html): published table is stale relative to installed1.31.1; actual graph/session qualification decides compatibility.
- [PyTorch ONNX](https://docs.pytorch.org/docs/stable/onnx.html): current documentation redirects to2.15. Exact2.13 installed exporter signature/constants were inspected locally: dynamo/external_data/optimize flags, IR10/Torchlib18. Legacy SDPA symbolic exists; no antialiased-bicubic legacy symbolic was found. No claim that either exporter must succeed.
- Official PyPI metadata checked for each new ARM64/Python3.11 wheel; install report retained in the task directory. Source model/runtime baseline lock remains unchanged.
