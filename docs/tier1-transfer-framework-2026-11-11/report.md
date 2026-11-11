# Independent-domain comparison: tooling and current gate

The dataset adapter, bounded A1/local-model runners and comparison metrics are implemented and tested. **No NutritionVerse-Real calorie benchmark has run.** No reference CSV or photos have been saved/processed, no new meal SDK calls or local food forwards occurred, and no app/default/deployment changed.

The remaining prerequisite is the project-purpose clarification already requested from the user. NutritionVerse-Real's publisher currently lists **CC BY-NC-SA4.0**. The project does not yet establish whether this use is personal/noncommercial or commercially directed. The actual [rights decision record](../../functions/eval/transfer/nutritionverse-rights-v1.json) therefore stays `evaluationAllowed:false`, `purpose:pending`. Elapsed time or approval to continue coding is not treated as an answer. The real-configuration smoke check verified refusal before an output directory, protected-data fetch or model call. This is a dataset-use gate, not a claim that model credentials or hardware are missing.

## Source facts established

- [NutritionVerse-Real paper](https://arxiv.org/abs/2401.08598):889 photographs of251 distinct dishes/45 food types; weighed ingredients, recipe-derived calories/macros from packaging or the Canada Nutrient File. Those are publisher-reported counts; the actual CSV schema/references are **not yet qualified**.
- Publisher [Kaggle dataset](https://www.kaggle.com/datasets/nutritionverse/nutritionverse-real), API version2:892 listed files, including889 photos, a204751-byte nutrition CSV,61424-byte split CSV and3095055-byte COCO annotation file. The1.126GB full bundle will not be downloaded.
- Individual-file access is available through the current official SDK endpoint (`api.kaggle.com/v1/datasets.DatasetApiService/DownloadDataset`), version2/raw single-file request. A header-only probe returned HTTP200 and the expected204751-byte length; its body was not used. Legacy HEAD URLs returned404 and were not mistaken for an authentication failure.
- NutritionVerse-Real is absent from the specialist's documented Nutrition5k/Flavoria/USDA training sources. That does not prove zero exposure in all backbone or closed-VLM pretraining. It is an independent-domain candidate rather than guaranteed unseen data.

All dataset source/derived images, labels, manifests, raw predictions and per-case results stay in private task storage. Public Git contains code, protocol, permission status, source facts, hashes and any subsequently permitted aggregate evidence. No dataset redistribution or commercial-training permission is inferred.

## Implemented comparison

`tool/transfer_dataset.py` validates explicit reference columns/units, positive kcal/mass, nonnegative macros and finite/non-boolean values. It joins published image paths, split filenames and unique dish IDs; unsafe/ambiguous/mismatched mappings fail explicitly. Actual source discrepancies must be audited after the gate opens, rather than silently skipped. Distinct author dish IDs are ranked by a fixed seeded SHA256, with one ranked view per dish. Neither food vocabulary nor model errors select the sample.

`tool/prepare_transfer_eval.py` checks the purpose record before protected-data access, reads only two small reference files and20 individually selected photos, and freezes a private selection receipt before fetching any pixels. It applies EXIF orientation, RGB JPEG85/subsampling2, strips EXIF and retains the full frame. Source/derived image hashes and the pre-image selection SHA are recorded in the final private manifest. Bad photos remain failed attempts; no meal replacement or retry occurs. Actual ingredient/mixed-dish metadata and source reference quality still require inspection; fixtures do not qualify them.

`tool/run_transfer_a1.cjs` uses the unchanged original frozen five-module A1 bundle, SDK/model/prompt/schema and original A0 serving priors. It verifies clean pushed source, Git-visible source/profile bytes, consent, compatible purpose and both private manifest/selection hashes before calls. Reference labels are not passed to inference. Pending receipts precede each call; no-food results continue, systemic quota/auth/model/prompt errors halt with an explicit unattempted remainder. The budget is at most20 SDK calls, without retries.

`tool/run_transfer_lens.py` reuses the previously qualified graph/weights, preprocessing and decoding: CPU only, disabled ORT optimization, intra2/inter1, original pinned Python/dependencies and source checks. Worker cases contain only canonical ID, image path and hash. No measured mass/reference data are passed. The local budget is at most20 food forwards with sampled3GiB RSS,120s no-progress and1800s wall limits. Failure output suppresses raw exception text/private paths and preserves sanitized status.

The planned scoring exposes different questions:

| Route | Question |
|---|---|
| A0 | How does the original serving-prior/catalog baseline perform where it has coverage? |
| A1 | How does the unchanged whole pipeline perform? |
| LensFull | How does the complete specialist perform using its own nutrient assumptions? |
| LensMassCounterfactual | What changes when only valid specialist total mass replaces A1 mass, preserving A1 food proportions and nutrient records? Failures remain missing. |
| A1LensMass | How does that mass integration perform as a workflow with explicit A1 fallback? |
| OldServingGate | How does the existing >=150g/>=2-component gate transfer without retuning? |

The pure mass arm also reports a same-valid-pair A1 comparison. Its missing cases cannot be disguised as successful substitutions. The workflow's fallbacks are counted separately. Full Lens and A1 have different nutrient assumptions; their complete-system comparison does not isolate geometry. Sparse A0 coverage cannot establish a full-cohort A0 ranking.

Complete-meal served-kcal MAE, bias, median/P90 absolute error, normalized error(floor200), mass/macros and all-attempt coverage/failures are implemented. Screens require20 valid A1/candidate cases, at least10% MAE improvement and non-worse median/P90/normalized error. They remain exploratory; `productionPromotable:false`. Latency, token/cost status, questions and available mixed-dish strata must accompany actual results. No numerical confidence intervals, Android-accuracy claims or medical claims follow from this public comparison.

## Actual verification

All **202 pinned-runtime Python tests and51 Node tests pass**, with no skips. This adds21 Python/11 Node tests to the prior181/40. They use owned synthetic fixtures, not validation meals. The adapter, metrics, preparation and runner loops observed focused RED→GREEN. Additional real regressions reproduced and fixed: an outside-Git source pin, hidden working-profile drift, selection-receipt drift, missing pure-counterfactual failure coverage, uppercase extensions and raw worker traceback/private-path output. All88 previous experiment artifact pins are unchanged. No model calls occurred in these checks.

Primary Antigravity plan/amendment, corrected-source and separate fresh-context clean reviews explicitly report agreement/no must-fixes on **supplied source text**. They did not execute code, inspect photos, determine legal purpose or qualify actual NutritionVerse data. An earlier review invented a split-view count, incorrectly claimed all A0 IDs were absent, and misread the existing fallback contract/log location; those claims were rejected and corrected. Its fabricated filesystem links and overbroad guarantees are not adopted.

Editing-worker attempts were recorded in strongest-first order: Grok unknown model, Qwen free-quota403, OpenCode invalid shared configuration/catalog, paid last route empty180s bounded nondelivery. Native editing used the user's standing fallback, with test-first checks and reviews retained. No permanent account/subscription exhaustion is inferred.

## Resume sequence

1. Establish and record a compatible current project purpose or separate permission. Keep the gate closed otherwise.
2. Run `python -m tool.prepare_transfer_eval --rights functions/eval/transfer/nutritionverse-rights-v1.json --files /disk/task/research/nv-files-all.json --output /disk/task/private-prepared`.
3. Audit actual CSV headers, ingredient metadata, units/reference quality, joins and unavailable dishes; resolve source discrepancies transparently before freezing any model run.
4. Create a committed transfer profile pinning the **exact final private manifest and pre-image selection SHA**, approved purpose record, source files, original A1 engine/prompt/schema, qualified graph/data and limits. Commit/push clean before inference.
5. Run the generic A1 and local Lens wrappers once on the same selected photos; score via `score_transfer`, independently replay arithmetic/hash closure, obtain result review and publish permitted aggregate findings.

The next result must answer whether Lens or its mass-only contribution transfers beyond its documented training domain. This tooling stage supplies no new calorie-accuracy evidence.
