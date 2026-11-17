# Size rule: held-out result — rejected

Run 2026-11-16/17, 335 photos, one call each, 5 calls without an estimate. Rule and pass conditions were committed
before scoring (`criteria.md`). Every case is in `~/.local/share/calorix-size-rule-holdout-20261116/cases.csv` (kept out of the repository: NutritionVerse references may not be redistributed).

| Source | Meals | Error before | Error with rule | Change (95% interval) | Meals changed | Better | Worse |
|---|---:|---:|---:|---|---:|---:|---:|
| Nutrition5k, random | 146 | 74.5 kcal | 92.4 kcal | +24% (+6 to +31 kcal) | 24 | 6 | 18 |
| NutritionVerse-Real | 168 | 285.9 kcal | 263.8 kcal | -8% (-47 to +3 kcal) | 101 | 59 | 42 |

All three conditions fail on Nutrition5k; conditions 1 to 3 fail on NutritionVerse as well (interval reaches
zero, 42% of changed meals worse, 90th percentile 418 -> 431). **The rule does not go into the app.**

What the earlier 79-meal figure hid: those scans were picked to include big plates. On scans drawn at random the
model's average error is -7 kcal, so there is no general low reading to correct, and most estimates of 400 kcal
or more are already close. The low reading is real on NutritionVerse (-253 kcal on average), where plates hold
several foods and often more than 1000 kcal; a flat factor on the total helps there in 6 of 10 changed meals and
overshoots in the other 4.

The 16 NutritionVerse dishes with the known wrong "near-whole-chicken" reference are left out above. Including
them makes the rule look better (-9%, interval excluding zero) only because their references are about four
times too high.

Next step worth trying, not done here: look at why multi-food plates read low (missed foods or small portions per
food) on the 168 NutritionVerse receipts in the run folder, instead of scaling the total.
