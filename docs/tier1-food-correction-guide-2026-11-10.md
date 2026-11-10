# Calorix capture and food correction guide

[Download the signed APK ZIP](https://github.com/ia23a-lachnita/calorix/actions/runs/42798006153/artifacts/13756120978), extract `calorix-1.0.0+1-android-test.apk`, and install it over the existing test app. Preserve the existing installation and its local data. This build was installed and checked on the connected Samsung SM-G780G/Android13. Artifact expires December10,2026.

Open Calorix, take one meal photo, and choose **Send photo** in the consent dialog for cloud estimation, or **Keep local** for manual entry. Eligible fresh captures open consent directly; history photos have an **Estimate photo** button. Cloud processing still requires explicit consent and a network connection. Results are approximate served calories; consumption stays unconfirmed unless you confirm it. Existing camera, cloud inference and local history are reused.

## Correct a food or portion

After an estimate, scroll to Recognized foods and nutrient sources. Use **Change food** beside the item you want to correct. Search the local list, choose the appropriate preparation, review the per-100g nutrients and USDA source, then tap **Apply food**. It saves immediately. No new cloud request is needed for this selection.

The current grams stay the same. Use **Edit portion** to change them, or enter 0 g to exclude the component. Choosing a nutrient record does not establish that the pictured food or estimated weight is correct. For a recipe missing from this limited list, use the meal's editable calorie/macro totals.

**Use predicted food** restores that item's original nutrient estimate while preserving any entered grams. **Use original** inside the portion editor restores original grams while preserving the selected food. Restore both to return to the original calculation. Original recognition and correction history remain stored. Cancel/back and unchanged selections leave the saved meal intact.

If you answered the extra-oil question, its separate component remains. Check it when choosing a prepared record that may already include oil; exclude it explicitly with 0 g if appropriate. There is no second automatic preparation question.

Changed nutrients reset consumption to unconfirmed. Confirm Ate all only if appropriate. A confirmed repeat uses the corrected estimate; it is not a weighed reference. Whole-meal manual totals remain explicitly labeled; applying a different food replaces them with the listed-component calculation.

Workflow measurement export now writes version2; the offline evaluator accepts versions 1 and 2. Food actions count activity, not measured accuracy improvement. The existing first-portion accuracy endpoint excludes active food substitutions. Export is optional and local; copied files/clipboard contents are outside the app's deletion controls.

```sh
python3 evaluate_workflows.py workflow.json reference-meals.json --output report.json
```

Use independent reference-meal data. Missing references, cost, confirmed consumption and actual active-user time remain unknown; scripted native fixtures are arithmetic/workflow checks only.
