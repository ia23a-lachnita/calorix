# V7.1 — Binding Addendum to V7 (Build-First, Evidence-Scaled)

**Date:** 2026-11-08  
**Status:** Targeted amendment; **not** a new master architecture or a claim of validation.  
**Applies to:** `V7_Transfer_Aware_Food_Estimation_Master_Spec.md` dated 2026-11-07.  
**Precedence:** Where this addendum conflicts with V7, **this addendum controls**. Otherwise V7 remains applicable.  
**Intended product:** Nonclinical, approximate Android food logger. A stronger accuracy/health-related intended use requires separate evaluation and regulatory review.

## A. The engineering decision: two tiers, with an immediate executable first tier

### Tier 1 — Working, transparently approximate food logger

**Goal:** Deliver a usable system without pretending to have statistically validated calorie accuracy.

**Minimum functionality:** (1) one CameraX still photo; (2) a **pinned A1 zero-shot VLM** producing recognized foods, portions and preparation assumptions in a versioned structured schema; (3) energy/macros from pinned nutrient records or clearly labeled VLM estimates where a defensible database match is absent; (4) **zero or one** high-value preparation question; (5) fast correction/manual fallback; (6) photo/recipe deletion and explicit opt-in cloud processing; (7) served kcal presented as **approximate**; (8) meal-history persistence and optional repeat-meal confirmation.

**First evidence:** 30 *different physical meals* with weighed served portions for debugging and an A1-vs-A0 comparison. Expand toward ~100 diverse personal meals only if feasible and useful for iteration. Neither figure is a proof of general accuracy. Record hard mixed dishes and failures; **do not select the sample to make accuracy look good**. For single-person data, label all results **single-user exploratory**. Reference-quality grading is endpoint-specific (Section D).

**No dependency** on B0 training, latent height, depth, a second photo, large public-dataset downloads, a calibrated coverage interval, an external participant cohort, or a multi-device generalization claim. One Android device is sufficient for the first functioning prototype; document device restriction. Do not require a Raspberry Pi if Android Studio/ADB already works.

**Tier 1 release posture:** No numeric accuracy/coverage claims, no medical claims, no implied measured intake, no unqualified claim of reliability for unseen users. Minimum privacy, rights, basic security, manual correction, and failure handling **still apply**; an approximate label does not replace these protections. Public app distribution or processing other people's data requires an appropriate legal/privacy/product review independent of statistical validation.

### Tier 2 — Credible product-performance or comparative accuracy claims

**Trigger:** The Tier 1 error/failure audit identifies a material user problem, a feasible hypothesis, an intended population, and a claim worth testing. Only then commission powered multi-user, multi-device D1 studies, numerical prediction intervals, or performance marketing claims. Preregister endpoints and thresholds **before** locked testing. The sample size is determined from effect, variance, clustering, multiplicity, failure rate and claim; no arbitrary 100-, 250-, 350- or 683-meal requirement is universal.

## B. Model priority and transfer evidence (replaces V7 Sections 1.4, 4.1 priority, and G1 ordering)

1. **A0:** simple food-serving prior + nutrient database + correction; record coverage, user edits and cost.
2. **A1 (first actual product baseline):** pinned zero-shot VLM, one image + structured food/portion output, one targeted question *when needed*, nutrient/recipe reconciliation and manual fallback. Run it on the **first 30 personal pilot meals** before deciding to train anything.
3. **B0 (conditional research):** VLM-conditioned direct mass regressor **only** if Tier 1 identifies a sizable portion-mass bottleneck. Public-dataset training is an experimental comparison, not the presumed deployment winner. Compare against **A1 on the same target-phone meals** before adoption.
4. **C0 / optional adaptation:** evaluate a measured plate/vessel/reference scale and/or locally verified weighed repeat-meal correction as separate A1/B0 enhancements. **Metric-scale normalization is not guaranteed to produce framing invariance.** Consider a dedicated, leakage-safe local-adaptation set (D0.5) only if data feasibility and measured transfer failures justify it. Any adaptation examples must be isolated from a subsequent test set; 30 pilot meals do not establish general neural-regressor transfer.
5. **B1 = 2D patch-ownership/area comparator:** $a_n=\sum_p o_{n,p}$ with a **constant** latent height $h_p=1$, shared food inputs and supervision.
6. **B2 = ownership × mass-supervised latent-height:** $v_n=\sum_p o_{n,p}h_p$, with food-specific scale/density mapping to mass and the same matched inputs. If testing height without learned ownership, specify an **independent mask pooling** method; do not present an undefined patch-to-food model as a valid ablation.
7. C1 predicted depth and C2 second-view methods are **research-only until** a paired full-meal study demonstrates worthwhile incremental calorie benefit.

**Evidence limitation:** Lian (2026) tested particular estimators on particular shifts: on FPB, Nutrition5k-trained DINOv2 reached 467.5 g MAE versus 248.5 g for zero-shot Qwen3-VL-32B; on ASA24, DINOv2 reached 67.9 g versus Qwen 72.9 g (not a significant advantage). This motivates *baseline ordering*, **not** a theorem that every regressor fails or that 100–150 target meals are essential. Source: https://arxiv.org/html/2610.29025 (Table II and discussion). Liao & Li's learned-height/ownership relationship is described at https://arxiv.org/html/2607.16514.

## C. Low-friction logging flow (replaces V7 Section 2 defaults)

1. Capture one photo; display a provisional **served-energy estimate** and visible assumptions as soon as practicable. The happy path has **one compulsory capture action**, with an optional correction tap. Ask one question only where expected value outweighs burden.
2. A repeat-meal suggestion is **optional and not a second mandatory confirmation**. It cannot turn an earlier unverified prediction into weighed ground truth.
3. **Do not force a post-meal return.** The main record may remain `served_only`. An optional one-tap **“Ate all”** action confirms full consumption; users can later edit fractions or components. If a user opts into a “usually finish my plate” shortcut, store `consumption_source=assumed_default`, not `confirmed`, and visually label it accordingly. Never silently convert served energy to confirmed consumed energy.
4. Offer component-aware leftover corrections where useful, but do not require a second photo or by-component weighing for everyday logging.
5. Measure these separately: **shutter-to-first-estimate** (compute + network), **active user interaction time** (capture/reading/corrections, excluding waiting), and **total wall-clock workflow time** (including waits). Record the distribution for no-question, question and retake paths, not a single blended p95.
6. Provisional design targets for Tier 1—**not measured capability**: photo-only shutter-to-estimate p50 ≤5 s and p95 ≤12 s on specified connectivity; active user time p50 ≤12 s and p95 ≤25 s for the specified supported flow. Failure to hit these on hardware triggers simplification, not fabricated compliance. Report network/device assumptions and long-tail performance.

## D. Reference-data correction: recipe-to-plate mapping and cooking yield (replaces V7 §3.2 and qualifies §4.3/§8)

### D.1 Two layers plus transformations; no false one-to-one mapping

Store `ingredient_id` for every weighed edible recipe input **and** `plated_component_id` for a whole visible or visually coherent served dish. The mapping is **many-to-many** with an explicit transformation/allocation record, not an assumed one-to-one correspondence. A mixed curry can be one plated component made from many ingredients. An ingredient distributed across two plated components has fractional allocations. Excluded bones, evaporation, cooking discards and losses are **not** assigned as if served edible mass.

Suggested minimal schema fields:

```text
meal_id, recipe_id, cooking_batch_id, plated_component_id, ingredient_id
ingredient_input_g, ingredient_kcal_per_g, ingredient_energy_source
retained_edible_energy_kcal, discarded_edible_energy_kcal, retention_assumption
batch_cooked_edible_mass_g, serving_cooked_mass_g, leftover_cooked_mass_g
component_energy_allocation_fraction, component_mass_allocation_fraction
reference_served_grade, reference_consumed_grade, allocation_confidence
predicted_component_id, matching_status, user_answer, model_version
```

**Oracle evaluations:** First match predicted components to reference **plated components** by a prespecified matching method (including merge/split/unmatched categories). For a matched composite, use $d_c=E_c/M_c$ if the allocation is defensible; do not try to substitute ingredient masses into predicted visual boxes directly. Unmatched/spurious components remain in **complete-meal error**; skip only the undefined *component-level oracle* and report why. Aggregate total-energy oracle tests remain valid when component matching is impossible. Do not assign uniqueness or causal attribution to an order-sensitive oracle decomposition.

### D.2 Cooking yield and reference energy

For a batch with ingredients $j$:

$$E_{\mathrm{retained,batch}} = \sum_j m_{j,\mathrm{input}}d_{j,\mathrm{input}} - E_{\mathrm{discarded}} - E_{\mathrm{other\ losses\ where\ justified}}.$$

For a reasonably **homogeneous** mixed batch with weighed cooked edible batch mass $M_{\mathrm{cooked,batch}}$:

$$d_{\mathrm{batch}} = E_{\mathrm{retained,batch}}/M_{\mathrm{cooked,batch}},\qquad
E_{\mathrm{served}} = m_{\mathrm{served,cooked}}\,d_{\mathrm{batch}}.$$

Record energy retained from oils/added ingredients, nutrient retention where relevant, liquids/solids discarded and uncertainty. Water absorption/evaporation primarily changes cooked mass and kcal/g; it does not by itself create/destroy energy. For a **heterogeneous** batch or selective serving, uniform $d_{\mathrm{batch}}$ is not valid: use measured plated components or a defensible ingredient allocation with explicit uncertainty. A generic cooked database food entry must **not** silently override a measured recipe. Batch weighing is necessary **when** proportional batch allocation is the reference method, but is not a universal requirement if another independent, accurate served-energy reference exists.

### D.3 Endpoint-specific reference quality

Replace the single A/B/C grade with **`reference_served_grade` and `reference_consumed_grade`**:

- **Served-A:** defensible recipe-derived energy and served portion, including homogeneous mixed dishes when batch yield is measured. Mixed dishes must not be automatically demoted merely because individual ingredients cannot be visually separated.
- **Consumed-A:** Served-A plus defensible edible leftovers/second-helpings information, using component energy where needed. Full consumption explicitly confirmed with no sharing/spillage can qualify without component-separable leftovers.
- **B:** usable aggregate estimate with material allocation/leftover uncertainty; **C:** incomplete reference. Keep reasons and quantitative bounds where possible.

Use **all Served-A meals** (including mixed dishes) for served-energy accuracy, and **all independently scorable Consumed-A meals** for actual consumption accuracy. Publish the grade distribution *by meal type* plus A+B sensitivity/bounds; do not treat missing A-grade leftovers as zero consumption error or silently drop complex foods. Define a preplanned minimum mixed-dish representation before Tier 2 validation, appropriate to the target use—not a universal percentage.

## E. Endpoints and truthful launch contract (replaces V7 §§5.1 and 11)

**Two different questions require two different endpoints:**

- **Primary image-system endpoint:** complete-meal **served** kcal MAE, signed bias and P90 on all Served-A reference meals, compared with pinned A1 on *the same meals*. Also show kcal-size bins and a normalized error metric with a declared denominator floor (e.g., MAE of $|\hat E-E|/\max(E,200\,\mathrm{kcal})$; 200 is a planning convention, not a clinical standard).
- **Primary consumed-intake endpoint whenever an intake-accuracy claim is made:** consumed kcal MAE and bias on all Consumed-A meals using the actual workflow, plus **predefined leftover strata** (e.g., no leftovers, and leftovers ≥15% of served energy). The 15% is an analysis cutoff, not a safety threshold. For unconfirmed intake, record `unknown`, not zero error. Do not make consumed-calorie validity a consequence of passing served-calorie validation.

**Tier 1:** Technical readiness and user-understandable, correctable **approximate logging**, not achievement of V7's ungrounded ±120/±150 kcal targets. Record transparent exploratory errors and compare with A1/A0; display neither “validated” nor numerical confidence bands. Baseline fairness requires the *same nutrient-code source and preparation information* where comparing mass estimators.

**Tier 2:** Preregister a practical absolute kcal target **and** a relative improvement/noninferiority rule versus frozen A1, plus tail, failure, abstention, mixed-dish, device and energy-size guardrails. The original V7 figures (120 served MAE, 150 consumed MAE, ±30 signed bias, 350 P90) are **unjustified placeholders**, not hard scientific limits; they should be explicitly retired unless product evidence supports them. Decide whether the bias rule is (a) a **point-estimate tolerance** (not an equivalence claim), or (b) a formal **equivalence test**, requiring an appropriately defined CI wholly within the interval. Do not describe a point-estimate gate as equivalence.

**No easy-meal leakage:** Score completed manual fallbacks in a separate assisted-workflow metric; report abstention/failure on *all eligible* meal attempts and the conditional autonomous accuracy curve. If a reference is unscorable, record the reason and perform a bounded sensitivity analysis rather than manipulating the denominator.

## F. Power, second photo and multiplicity (replaces V7 §6.3–6.6)

The illustrative $n\approx349$ calculation gives approximately 80% power to reject **zero** effect when the true mean gain is 15 kcal and independent paired-difference SD is 100 kcal. It **does not** give 80% probability of passing a *joint* gate requiring both a point gain ≥15 kcal and a significance test. With $n=349$, the sampling standard error is approximately 5.35 kcal; if the true gain equals the 15-kcal cutoff, the probability that the observed gain exceeds that cutoff is about **50%**. More sample size alone cannot confer 80% pass probability when the true effect equals a strict threshold.

**Correct design:** define (i) the *minimum decision-worthy gain*, (ii) a **larger design alternative** to power the test at (e.g., 20 rather than 15 kcal under the illustrative assumptions), (iii) the exact joint test/CI decision and type-I-error treatment, and (iv) observed pilot variance and cluster structure. Use a cluster-aware bootstrap or suitable hierarchical estimator when participants contribute multiple meals. The formula $1+(m-1)\mathrm{ICC}$ is a useful approximation for equal cluster sizes—not a universal power multiplier. Holm correction and counts of ~1,455 meals arise only under the feedback's assumed ICC, cluster size, effect, SD and five comparisons.

**Lock at most one primary trained candidate versus A1** before confirmatory D1; if the second-photo intervention is also a confirmatory objective, prespecify whether it uses a separate cohort, gatekeeping strategy or multiplicity-adjusted family. Never declare 250–350 meals sufficient without pilot-derived parameters and a defined primary decision. Include refusals, retries and completion burden in second-photo user-workflow comparisons; a technical offline gain is not enough.

## G. Swiss jurisdiction, permissions and participants (amends V7 §10 and G4)

A private test on one's own meals ordinarily differs from a participant research protocol, but **“self-data are always exempt” is too categorical**. The Swiss Human Research Act's applicability turns on the purpose, research question, persons and health-related data, not merely whether the device is nonclinical. If recruiting people into a **research study involving potentially health-related personal data**, determine HRA jurisdiction **before recruitment**. If applicability is uncertain, request a *Zuständigkeitsabklärung* from the competent cantonal ethics committee; do not assume every app usability study requires HRA approval. Non-HRA projects can still have data-protection and consent obligations.

Zurich's official explanation and clarification procedure: https://www.zh.ch/de/gesundheit/ethik-humanforschung/zustaendigkeit-kantonale-ethikkommission.html . Swiss Federal Office of Public Health: https://www.bag.admin.ch/en/human-research-approval-of-research-projects . This is a compliance checkpoint, **not legal advice**.

## H. Reordered work: implement before more research

| Order | Deliverable | Decision |
|---|---|---|
| **0** | Minimal data/privacy/license manifests for only assets used; meal schema + basic cooking-yield SOP | Build safely, no sprawling dataset ingest |
| **1** | One-device CameraX shutter + JPEG + minimal metadata; manual food entry fallback | A captured meal can be saved |
| **2** | Pinned **A1** structured-output call, nutrient lookup, approximate served kcal, optional single question, editable log | Complete photo-to-estimate happy path |
| **3** | Own **30 weighed meals** (mixed and single-item) with reference labels, raw model outputs, latency, failures and cost | Quantify the first actual baseline and annotation defects |
| **4** | Fixed A0-versus-A1 report; repair obvious UX and reference-label problems; expand toward ~100 total diverse own meals **if justified** | Decide what error dominates |
| **5** | **Only if justified:** targeted scale/repeat-meal calibration, B0 public-data prototype, or second photo, each compared with A1 | Reject unhelpful complexity |
| **6** | **Only for intended external performance claims:** ethics/jurisdiction, participant/design power, second device, independent D1 and optional numeric intervals | Validate an explicit claim |

### Required deliverables in the first implementation sprint

- `android/` app that captures a still photo, shows a save/correction screen, and writes basic image metadata.
- `model_manifest.yaml` pinning the actual VLM model/version, prompt template, structured-output schema, API cost, retention policy and fallback behavior.
- `meal_schema.json` with ingredient, batch, plated-component and served/consumed-grade fields above.
- `reference_sop.md` with weighing, batch yield, edible discard, heterogeneous dish and leftover guidance.
- `evaluate_meals.py` (or equivalent) reporting complete-meal served-kcal absolute error, signed bias, P90, failure/abstention and mixed-dish counts on identical test meals.
- `pilot_report.md` with **Supported / Unsupported / Unmeasured / Decision**, including the A0/A1 comparison and next single engineering experiment.

**Do not report success because a trained model beats A1 on Nutrition5k.** The first critical question is how **A1 performs on the intended Android meals**. Later additions must buy demonstrable full-workflow benefit, not research novelty.

---

## Independent verification of the feedback

- **Accepted:** Lian Table II numbers; target-data transfer concern; latent-height/ownership ablation; power versus joint pass probability; bias-equivalence ambiguity; selective A-only exclusion; many-to-many recipe mapping; cooking yield; latency decomposition; proportionality.
- **Qualified:** The recommendation for 100–150 target meals has no universal evidentiary basis; scale features do not ensure invariance; sampled meal leftovers need not be component-separable for all served-energy references; total two-photo error variance depends on covariance; a fixed 80–90% “ate everything” rate is not substantiated; 250–350 clustered observations are not universally powered; personal self-testing is not a blanket exemption from any applicable law.

**Sources:** https://arxiv.org/html/2610.29025 ; https://arxiv.org/html/2607.16514 ; https://www.bag.admin.ch/en/human-research-approval-of-research-projects ; https://www.zh.ch/de/gesundheit/ethik-humanforschung/zustaendigkeit-kantonale-ethikkommission.html .
