# Size rule: what the held-out test must show (written before scoring)

Rule under test, fixed in `tool/size_rule_holdout.py`: an estimate of 400 kcal or more is multiplied by 1.4.

Why a new test: the rule was found on 79 Nutrition5k scans that were picked to include big plates, from one
cafeteria and one camera rig. The only other evidence was 40 NutritionVerse-Real photos, where it helped 14 meals
and hurt 6, with an interval for the average change that reached zero.

Held-out meals: 150 Nutrition5k scans drawn uniformly at random (no size filter) and all 185 NutritionVerse-Real
dishes not used before, one model call each. 16 NutritionVerse dishes carry a known wrong reference
("near-whole-chicken" with granola-bar nutrients) and are scored separately.

The rule goes into the app only if all three hold on each source separately:

1. Mean absolute error falls, and the 95% bootstrap interval of the change does not include zero.
2. Of the meals the rule changes, no more than one in four gets worse.
3. The 90th-percentile error does not rise.

Limits that no result here removes: both sources are weighed lab or cafeteria meals. Neither is a phone photo of a
home or restaurant meal, and neither covers packaged food, drinks, or partly eaten plates. A pass here means "safe
on two public sources", not "right for real use"; that needs the owner's own weighed meals.
