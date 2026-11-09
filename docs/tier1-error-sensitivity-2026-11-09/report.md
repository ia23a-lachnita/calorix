# Aggregate calorie-error sensitivity on the frozen public sample

Unchanged predictions for30 Nutrition5k scans,23 capture dates. These calculations use hidden reference totals: they are **not new model predictions, achievable corrections, causal error attribution, or user-effort measurements**. No additional inference or photos were used. The active six-record baseline remains unchanged; the73-record variant remains archived.

## Results

All30 predictions per version are successful and oracle-eligible, so the original and hypothetical endpoints use the same cases. Values below are served-kcal MAE.

| Sample / version | Scans | Original | Reference total mass | Reference aggregate density |
| --- | ---: | ---: | ---: | ---: |
| All30 / v1 | 30 | 112.02 | 48.38 | 85.23 |
| All30 / v2 | 30 | 111.93 | 47.08 | 85.14 |
| Original20 / v1 | 20 | 71.54 | 38.01 | 50.40 |
| Original20 / v2 | 20 | 78.05 | 42.03 | 50.45 |
| Mealrange10 / v1 | 10 | 192.99 | 69.11 | 154.87 |
| Mealrange10 / v2 | 10 | 179.68 | 57.20 | 154.51 |

Original v1 MAE112.02 and v2 MAE111.93 exactly reproduce the frozen benchmark. Hypothetical total-mass substitution changes those MAEs to48.38/47.08; density substitution gives85.23/85.14. These are sensitivity differences with unavailable information, not accuracy gains from the shipped system.

## Methods and limits

For original energy E and mass M, reference energy R and mass W: mass oracle = E × W / M, retaining predicted aggregate density; density oracle = R × M / W, retaining predicted total mass. Component identities/masses are not matched or corrected. Aggregate density includes identity, recipe, preparation, composition and missing-food errors. Neither intervention uniquely separates causes. Compensating errors can make either substitution worse on an individual case; neither reduction is a guaranteed benefit of changing the model or asking a user.

The tool retains failed attempts in coverage. A successful energy with absent/nonpositive mass stays in the full original endpoint but is explicitly undefined for paired oracle scoring. All oracle comparisons use the same eligible subset; an additional full original endpoint prevents hidden exclusions. Given nonfinite values fail input validation, including values supplied on failed attempts. Missing CSV cells are rejected; explicitly empty optional cells are preserved.

P90 uses the existing evaluator's linear interpolation at (n−1)×0.9; normalized absolute error divides by max(reference kcal,200). Cohort metrics are recomputed from cases, not averaged from cohort summaries. Energy bins are <200,200..600 inclusive,>600 (12/14/4 scans). Ingredient count is not gold mixed-dish truth; no mixed-meal or independent-completed-meal claim is added. Pretraining exposure and Android transfer remain unknown.

## Reproduction and verification

Input: [frozen cases](../tier1-mealrange-2026-11-08/cases.csv), SHA256 `f08f254d11039682fb9ceee4c8bceffd153db7de05dc0a5405b46215fef55096`. Original receipts, source references and limitations: [baseline report](../tier1-mealrange-2026-11-08/report.md).

```bash
python3 evaluate_tier1_oracles.py --cases docs/tier1-mealrange-2026-11-08/cases.csv --output /disk/path/fresh-report.json
```

The default input pin fails on drift; an explicit different pin is labeled custom input. Existing outputs/symlinks are refused; no overwrite flag. Full precision, formulas, all per-case values and coverage: [results.json](results.json), [cases.csv](cases.csv).

Independent read-only Decimal recomputation (precision60) verified60 original energies,120 substituted energies and264 grouped metric/count/delta fields at absolute tolerance1e-9. Maximum differences were1.059e-13 for energies and1.5e-13 for aggregates. Input bytes still match the previous benchmark commit. Two custom-input validation gaps found during review were reproduced before correction; all39 Python tests pass after the fixes. This report's numbers are identical before/after those validation fixes.

## Engineering use

This makes a targeted portion-estimation experiment worth investigating while keeping the original benchmark immutable. It does not establish which mechanism caused the errors or choose a production change. Any candidate must be evaluated with its actual predictions and failures; do not substitute these hidden-reference calculations for that comparison.
