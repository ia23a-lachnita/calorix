# Weighed public baseline — Nutrition5k, November 10

Nutrition5k provides actual incremental food weights and recipe/USDA-derived nutritional references. The existing local sample contains40 public scans across25 capture dates. This report scores their original frozen A0/A1 predictions against the published totals. No personal meal collection, new model request or dataset download was needed.

The [official dataset](https://github.com/google-research-datasets/Nutrition5k#dataset-contents) lists per-ingredient masses and dish totals. The [paper, sections3.4–3.5](https://arxiv.org/html/2103.03375v1) describes weighed additions of individual ingredients or prepared recipe items, then nutrient calculation from their recipe composition. These are real weighed public references. Calories are recipe-derived; they are not calorimeter measurements.

## Actual baseline results

| Route / cohort | Valid / attempted | Served MAE kcal | Bias kcal | P90 absolute kcal | Floor-200 normalized error |
|---|---:|---:|---:|---:|---:|
| A1, all40 | 40/40 | 125.61 | -92.57 | 290.90 | 26.37% |
| A0, its covered subset | 1/40 | 191.33 | -191.33 | 191.33 | 43.60% |
| A1 mealrange10 | 10/10 | 192.99 | -192.95 | 420.00 | 32.13% |
| A1 original20 | 20/20 | 71.54 | -7.77 | 155.45 | 24.89% |
| A1 portion_audit10_original | 10/10 | 166.36 | -161.80 | 376.96 | 23.58% |

A1 returned40/40 valid estimates. Its signed bias shows average underestimation. Mass MAE is74.675g, bias−57.425g and P90 absolute mass error192.1g. Full macro, cohort, energy-bin and ingredient-count results are in [baseline.json](baseline.json). [All40 case rows](cases.csv) and [the portable input bundle](bundle.json) retain measured references, original predictions, source hashes and provenance.

A0 covers1/40 scans; the other39 are explicit catalog-coverage failures. Its191.33kcal MAE describes one scan, so it cannot be compared directly with A1’s40-scan MAE. The same-valid-pair comparison contains just one scan (A0191.328kcal error; A1240.828kcal error), insufficient for an overall route ranking. A0 shares A1 recognition/preparation and differs in serving priors.

## Fixed inputs and limits

All original20 + mealrange10 + portion-audit10 ORIGINAL arms are included. Candidate-catalog, alternative-prompt and challenger outputs are excluded by this fixed selection rule, not by their errors. The40 receipts were generated in three earlier sequential runs under gemini-3.8-flash, the original prompt7131…, schema4306…, and six-record catalog. This is a new aggregation of existing predictions, not40 new inference requests or an improvement caused by the new food editor.

The cohort is exposed development data. Related incremental scans can share physical plates;40 scans and25 dates do not establish40 independent meals. The sample is small and deliberately selected; overall representativeness and Android transfer are unmeasured. Energy bins are<200,200..600 inclusive,>600kcal. One/multiple ingredient counts are explicitly proxies; even one recipe item can be a mixed dish. Gold mixed-dish labels and quantitative missing-food counts are unavailable here. No numerical confidence intervals, consumed-intake validity, actual active-user time or complete inference cost are claimed.

Published aggregate vectors are the scoring references. Ingredient sums are validation checks only: maximum absolute residual0.00011894kcal and0.000007g, below the declared0.001 closure tolerance. No cause for the residual is asserted, and no reference value is rescaled or replaced. Raw SDK timing is reported separately from phone/shutter/user interaction.

## Correction evaluation against these weighed references

`evaluate_public_weighed.py` now accepts strict v1/v2 workflow exports and explicit per-meal links to this bundle. Each link supplies a known scan ID, image SHA, original prediction-receipt SHA and mode. Meal IDs and scan IDs must both be unique. The mode is an operator attestation, not independent proof of image identity or reference blinding.

The protocol starts from an imported frozen estimate. Only the first committed food or portion edit can qualify; its before-kcal must equal the frozen A1 baseline within1e-6. Earlier manual, preparation or reanalysis commits, incomplete journals, after-navigation events and unchanged portions exclude the pair. Portion-only and food-assisted results stay separate, and later edits do not remove the first pair. This is not an initial live-capture analysis stream evaluator.

The actual6055-byte clipboard export from the scripted native food-editor check was linked as **diagnostic** to its known public source. It validates export/reference compatibility and is explicitly excluded from human-benefit scoring. [Diagnostic result](diagnostic-summary.json): one diagnostic exclusion, zero human pairs and null benefit metrics. Synthetic positive pairs exist only in tests. There are currently no actual reference-blind user-correction pairs; weighed references are already available and are not the missing input.

## Reproduce

Analysis uses Python’s standard library. Building from the original local receipts additionally requires the existing Node22 runtime to reproduce legacy ECMAScript logical manifest digests. No model/provider SDK is imported.

```sh
python3 evaluate_public_weighed.py docs/tier1-public-weighed-2026-11-10/bundle.json \
  --bundle-sha256 0b78b33438d7b3c66647a0a2403b7f4686909be5a47e50b936a590bf84b2bea6 \
  --output /disk/path/new-public-report.json

python3 tool/build_public_weighed_benchmark.py \
  --source-root /disk/path/existing-local-receipt-root \
  --output /disk/path/new-public-bundle.json
```

The builder uses [input-index.json](input-index.json), raw SHA256 `2a18ef5677cf5a128f0034c3003c1dc9d56727792f4966c5988d6cd50b84dfe3`. Its relative paths identify the preserved local artifacts. Analysis can be reproduced directly from the published portable bundle without those original directories. Bundle SHA256 is `0b78b33438d7b3c66647a0a2403b7f4686909be5a47e50b936a590bf84b2bea6`; two fresh builder outputs were byte-identical. Explicit custom index pins are labeled custom. Existing output files and target symlinks are refused.

For a correction report, additionally pass `--workflow export.json --links links.json`. The link JSON has schema_version `public-workflow-links-1` and a links array whose exact fields are mealId, scanId, inputSha256, receiptSha256 and mode (`reference_blind_user`, `diagnostic` or `oracle`). Diagnostic/oracle cases are excluded. Use genuine operator records rather than reference masses or synthetic human timings.

## Verification and engineering decision

Actual test-first13 methods/22 missing-behavior errors became13 passing, with the full74-test Python suite passing. The first real builder run then exposed a logical-vs-raw manifest-hash mismatch. A fresh source/data reviewer independently identified the same Important issue. Revised positive and ECMAScript numeric-encoding regressions produced14 methods/2 failures before correction, then14 passing and the complete75-test Python suite passing. The existing Node22 JSON/crypto serializer now verifies the old logical digest while retaining every raw file, receipt and image pin. `python3 tool/generate_manual_food_catalog.py --check` also passed.

One fresh read-only whole-feature review reported0 Critical/1 Important/0 optional Minor. It checked89 pinned files, all40 scans/25 dates and378 independent Decimal metric fields at absolute tolerance1e-9. Its numerical audit used the raw inputs and scorer before the builder fix; the main agent subsequently verified the real builder, byte-identical output and actual diagnostic-export exclusion. The one Important issue was fixed in one RED→GREEN pass, without a second fresh reviewer loop.

Required Antigravity MCP used gemini-3.8-flash/yolo, conversationcalorix-public-weighed-benchmark-20261110, primary route/no fallback, with corrected pre-plan, fix and source/result reviews explicitly agree/MUST_FIX none. Review shorthand referring to a300kcal bin, loose0.05 tolerance, an unproven residual cause, generic Node>=20, broad security/PII guarantees or a differently named test file was not adopted. Actual bins use200, tolerance1e-6, builder Node22, tests/test_public_weighed.py; checks are scoped to local data integrity and explicit fields.

This stage has exhaustive numerical input/scorer checks on40 scans, not a new visual audit. No UI-diff run: diff counts by status/source, auditLimited and visualClassificationStatus are not applicable. Android/backend/model/prompt/dependencies and the installed APK are unchanged, so no redundant Android build, live inference or phone reinstall was performed. No old source receipts, predictions or benchmark reports were rewritten.

Rulings: keep a separate public-reference format to avoid inventing Android metadata, independent physical plate IDs or reference grades; this requires maintaining an explicit linking adapter. Reuse Node22 for exact old logical JSON hashing rather than approximate Python serialization; the builder therefore requires Node22 while downstream analysis stays pure Python. No optional review minors remain.

Decision: use this frozen40-scan public weighed baseline for further engineering comparisons and retain A1 unchanged. The next useful evidence is actual reference-blind optional correction behavior scored against these already available references, with food-assisted and portion-only outcomes separated. No reference collection or new model budget is required to run the public scorer.

Data attribution: Quin Thames et al., Nutrition5k, CVPR2021; [official source](https://github.com/google-research-datasets/Nutrition5k), [CC BY4.0](https://creativecommons.org/licenses/by/4.0/). Nutrient labels follow the dataset’s USDA/recipe method. No model training or new images were used.
