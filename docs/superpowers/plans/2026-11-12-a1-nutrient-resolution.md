# Conservative A1 nutrient resolution implementation plan

> Continue inline under the approved roadmap and strongest-first editing-worker routes. User explicitly requests uninterrupted execution; no renewed approval gate. Required Antigravity reviews remain.

**Goal:** Measure and implement a deterministic post-recognition nutrient candidate without altering the pinned production A1.

**Architecture:** Reuse the existing 73-record pinned USDA catalog. Resolve only currently unverified components through exact full-name policy and preparation equality, retaining original food identities, order, grams, assumptions, questions and receipts. Replay existing predictions offline as development evidence; any validation uses a separately frozen cohort.

**Tech stack:** Existing Python standard library and unit tests; existing JSON catalog. No new model/dependency/service.

**Spec:** `docs/superpowers/specs/2026-11-08-v71-binding-addendum.md`, Section A/B/F; original research-direction amendment in `docs/tier1-food-agreement-2026-11-11/antigravity-nutrientResearchAmendment.json`.

## Constraints and review focus

- Pin catalog bytes/version and policy; preserve old source/profile receipts unchanged. Original model densities remain available for audit.
- Exact normalized full names/approved conservative aliases and preparation states only. No fuzzy/substring routing, guessed cut/skin/salt/fat/recipe details or composites. Unknown/ambiguous preparations abstain. Do not infer source truth from model/reference agreement.
- No component addition/splitting/removal or mass changes; keep original provenance and separate candidate namespace. Database match does not verify identity/portion. Existing v1 database components remain unchanged.
- Invalid numbers, mismatched sums, colliding policy entries and hash drift fail explicitly. Unknown names/preparations remain unverified with reasons.
- Replays use zero SDK/NN calls; current N5/NV cohorts are development. Preserve original NV labels and all cases, with unresolved source anomaly. Private NV numerical/derived artefacts remain private.
- Candidate screen: at least10% lower MAE; nonworse median/P90/normalized error/coverage; fewer unverified densities; zero policy preparation mismatches. No production adoption solely from development results.

## Tasks

- [x] **Resolver RED.** Create `tests/test_tier1_nutrient_resolver.py`. Cover exact match/math, existing-DB preservation, immutability, source provenance, unsupported/ambiguous prep, skin/salt qualifiers, composites/generic names, collisions, source tamper, bool/nonfinite/invalid grams and inconsistent totals. Run focused unittest; expect missing-module failure before implementation.
- [x] **Resolver GREEN.** Implement `tool/tier1_nutrient_resolver.py` and `functions/eval/tier1-public/nutrient-resolution-policy-v1.json`. Expose `load_policy(catalog_path, policy_path)` and `resolve_estimate(estimate, policy, original_receipt_sha256)`. Pass focused and full Python tests; inspect source diff independently.
- [ ] **Development replay.** Freeze source/policy, commit/push, then replay original N5/NV receipts with no inference. Compare A1, resolver, original Nov10 frozen mass-power calibration, and both together. No refit or threshold change: the old calibration failed its all-cohort promotion gate, which remains failed regardless of transfer results. Retain original predictions; independently verify per-component invariants, source fields, whole-meal metrics and failures. Record actual coverage and zero-switch outcomes honestly.
- [ ] **Result review and continuation.** Antigravity code/result review; publish permissible code/receipts/status, keep NV numerical outputs private; commit/push. Decide further portion work from results within the existing roadmap, with a new method review and fresh validation if warranted. No repetition of failed expanded prompt, scalar multiplier or serving gate.

## Review gates

Preimplementation supplied-method review `calorix-a1-nutrient-resolution-20261112`, primary gemini-3.8-flash/yolo: agree / MUST_FIX none. Reviewer's file URI is a hypothetical pointer, not evidence of file inspection. Postimplementation review must inspect supplied actual code and results.

Unchanged mass-power replay method review `calorix-frozen-mass-transfer-20261112`: agree / MUST_FIX none, supplied method only. Profile SHA953eb6787fca2c1fc0ad0ac661302898acdddd600281df597a162ed9d2de35f5. The floor200 guard is normalized absolute error; reject review shorthand conflating it with normalized bias. Existing old40/first10 failed guards are not relaxed. Any new20 prospective cohort is conditional on reviewed diagnostic results and a separate pre-image/source freeze, not automatic promotion.
