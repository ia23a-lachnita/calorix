# Additional10: reference-blind inventory review

This is a **secondary-assistant qualitative audit**, not human-verified gold truth, a new production predictor or numerical food-recognition accuracy. It does not alter the frozen calorie results or references. All Vertex request budgets remain closed.

An isolated read-only reviewer first viewed all10 original JPEGs with **no supplied reference labels, weights, calories, production predictions or result metrics**. It described visible forms and tentative food groups. After returning that inventory, it received reference ingredient names and per-case anonymous Alpha/Beta component names/preparations. Version assignment was deterministically randomized per case and withheld during comparison. No masses, calories or aggregate scores were supplied in that phase. This protocol withholds the supplied labels; it does not establish absence of model pretraining exposure.

The reviewer allowed many reference ingredients to map to a single visible composite. Hidden oil, salt, seasonings and obscured foods were not counted as proven omissions. Reference-label agreement was not treated as independent visual confirmation. The reviewer made no new production inference requests or repository edits.

| Public scan | Defensible finding | Unresolved interpretation |
|---|---|---|
|1566590007|Both inventories cover topped flat pieces, a granular mixture and a pale mixed region.|Millet reference versus quinoa/bulgur predictions is a label disagreement; grain identity is not visually established. Chicken is unnamed and possibly omitted, but mixed contents are unresolved.|
|1566414412|Both cover potatoes, grain-containing mixture and leafy/tomato salad; chicken is reference-compatible.|Couscous/pasta alternatives differ from quinoa/wheat-berry labels. Creamy protein and embedded ingredients cannot be independently identified.|
|1568305257|Both name scrambled eggs and turkey bacon; the egg-like region is visually clear.|Both describe spinach/carrot where source vegetable labels differ. This may be prediction or source/visual disagreement; do not silently change the reference. Raw versus sautéed preparation is unresolved.|
|1558722247|Both list all three clearly visible reference groups: apple, almonds, cauliflower.|Raw versus roasted/unsalted almonds and cauliflower cooking state are not established by appearance.|
|1568401233|Both cover carrot, orange vegetable and a flaked-protein salad; tuna/squash alternatives are source-compatible.|Exact protein, orange-vegetable identity and preparation remain uncertain.|
|1563389600|Both list chicken and tomatoes, matching broad reference groups.|The pale food’s identity is visually uncertain. Roasted versus reference grilled is a preparation-label disagreement, not visually proven error.|
|1566920365|Both list egg whites, sweet potato and salsa, plausibly mapping to the three regions.|White-food identity, hard-boiling/roasting and salsa subtype remain uncertain despite reference agreement.|
|1564687046|Both cover green beans and sliced meat; both allow reference fish in the sauced region.|Fish versus eggplant and embedded rice/millet/greens are obscured; a defensible missing-food count is unavailable.|
|1558461792|Both list all four visibly supported broad groups: grapes, tomatoes, almonds and leafy greens.|Nut treatment and finer leaf identity are not visually established.|
|1561739238|Both cover the reference broad groups; separate berry predictions map many-to-one to the berries label.|White-food identity, shredded-potato preparation and the isolated dark berry subtype remain uncertain.|

No overall Alpha/Beta ranking or systematic omission count follows. The audit records possible omissions and label disagreements without converting uncertain recipe ingredients into false missing-food statistics. The automatic benchmark's `missingFoodsAudit` remains `not_assessed`; this limited qualitative supplement does not replace a validated annotation set.

## One concrete matched-group portion example

For `dish_1558722247`, source labels and the blinded visual inventory agree on apple, almonds and cauliflower. The reference has343g/604.616kcal:160g apple,86g almonds,97g cauliflower. The six-record baseline predicts285g/419.15kcal:160g apple,55g almonds,70g cauliflower. Candidate predicts310g/493.15kcal:160g apple,65g almonds,85g cauliflower.

This example establishes component mass underestimation despite broad-group coverage **on that image**. It does not prove mass is the dominant cause across30 scans, validate the density/preparation matches, or turn reference-weight scaling into a deployable model. The full30 report retains identity, preparation and composition uncertainties alongside measured mass errors.

Anonymous comparison inputs and the version key stay in task-owned local evidence; reviewer messages remain in the session transcript. The published findings are curated summaries. Source food labels and images: Thames et al., *Nutrition5k*, CVPR2021, [official dataset](https://github.com/google-research-datasets/Nutrition5k), [CC BY4.0](https://creativecommons.org/licenses/by/4.0/).
