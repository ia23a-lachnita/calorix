# Weighed benchmark failure audit

This diagnostic reproduces all60 existing benchmark/development rows, then inspects10 selected overhead photos and6 corresponding sideframes. It makes no new accuracy, detection-precision, causal-decomposition or reference-object claim. Original recipe/USDA-derived reference calories and all historic predictions stay unchanged.

Selection was fixed before image inspection:8largest historical mass-power-corrected absolute errors, one UTCdate each, then2lowest-error controls on unuseddates; IDties. The fixed supplementary-view probe uses the first4large errors plusbothcontrols. Selection by error is deliberately unrepresentative; historical cases must not serve as their own contemporaneous control.

| Selected case | Role | Raw mass error g | Corrected kcal error | Known-reference-mass counterfactual kcal error |
|---|---|---:|---:|---:|
| dish_1565811139 | large_error | -131.0 | -531.9 | -408.0 |
| dish_1563478751 | large_error | -295.0 | -520.4 | -87.1 |
| dish_1566414412 | large_error | -298.0 | -389.7 | -44.6 |
| dish_1568305257 | large_error | -175.0 | -382.1 | -118.0 |
| dish_1563389626 | large_error | -220.0 | -348.7 | -132.4 |
| dish_1566502573 | large_error | -152.0 | -322.0 | -163.3 |
| dish_1562790855 | large_error | -222.0 | -286.9 | -3.3 |
| dish_1562172643 | large_error | -222.0 | -285.7 | 71.7 |
| dish_1558461760 | small_error_control | -1.0 | -0.1 | -0.0 |
| dish_1557862783 | small_error_control | 42.0 | 0.6 | -95.1 |

All8selectedlarge-error cases underpredict aggregate mass. This is a description of that outcome-selected subset, not proof that mass is the unique cause or that all meals need a larger scale. Known-reference-mass substitution also leaves substantial residual error on several meals and can overshoot; it requires unavailable ground truth and is not deployable accuracy or an accuracy bound.

Concrete discrepancies: pasta reference545g/model250g, chicken-and-sides658g/360g, egg-and-bacon420g/245g. The salad source includes205g chicken versus65g in the inventory and45g oil versus10g assumed; oil mass and precise cheese identity cannot be established from those photographs. The carrot bowl source includes194g grilled chicken while the prediction calls the occluded white material feta: this is a potential identity/omission mismatch, not an adjudicated missed-food count.

The low-error meat/cauliflower control illustrates compensation: raw predictedmass300g versus258g reference, while nutrient-density differences and the historic mass correction nearly cancel the calorie error. Accurate total calories on one case therefore do not establish correct physical mass or ingredient assignment. The other control is a simple61g/10.98kcal tomato serving and does not represent mixed meals.

Reference screening: the fish/pork mixed dish has published calories about280kcal below its protein/carbohydrate/fat energy using coarse4/4/9 factors. This warrants source-level scrutiny; it does not automatically invalidate the meal or authorize rewriting its reference. Specific food factors, fiber, alcohol and recipe/metadata issues cannot be uniquely resolved by that calculation. All source vectors remain published, and all60 cases remain in the denominator.

Visual inspection was by the primary assistant, one unblinded pass, without independent human adjudication. Broad food groups and visibility uncertainty are in visual-notes.json. Hidden ingredients/oil quantities and exact composite matching are unresolved; food precision/recall and human correction benefit are unmeasured. Only10overhead+6sideimages were visually inspected, notall60.

All6fixedcameraA clips were retrieved (52,707,168bytes), source sizes/GCSMD5/localSHA verified; the firstdecoded outputframe was used without camera/time substitution. An initial12MiBperclip proposal was amended to24MiB before download after metadata showed one18.45MBcontrol; total72MiB stayed fixed. JPEG85/Pillow11.1/noresize/noEXIF, imageSHA pins and ffmpegversion retained. A replay using cached source videos reproduced all12overhead/side inputJPEG bytes exactly. No metric camera calibration, marker dimensions, frame rate, exact temporal synchrony or pose reconstruction is established. RawH264 r_frame_rate1200000/1 is not treated as a recording rate.

Both views appear to show matching vessels and broad food groups with no unequivocal food-state change; this is visual preflight, not proof of simultaneity. Side images are1920x1080 while overhead is640x480. The planned comparison therefore tests a supplementary camera/resolution/view-context package, not a pure calibrated geometry effect.

## Next controlled probe

Six fixed development cases; NEWone-image and NEWtwo-image calls, SAME multi-compatibleprompt/model/schema/catalog/settings;13maxSDKentries includingoneownedtwo-blank compatibilityprobe. Counterbalanced per-casearmorder, allinputsvalidatedbeforecanonicalclaim, no retries/resume/fallback/replacements. No recipe labels, weights or reference nutrients are sent to the model. Report all6paired deltas, failures, andworst4/control2 groups separately. No productpromotion regardlessresult; current app remains oneJPEG. Actual results will be reported separately after execution; this audit itself made0SDKcalls and collected0newreference meals.

Reproduce audit (output must not exist):

```bash
python3 -m tool.build_failure_audit --index functions/eval/tier1-public/failure-audit-inputs-v1.json --index-sha256 3fab2632d9e236f31e883574b7ac921451fd51acd285632af7f094e284dbda55 --output /absolute/new/audit.json
```
