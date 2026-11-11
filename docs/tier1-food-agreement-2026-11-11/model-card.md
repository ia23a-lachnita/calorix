---
license: mit
pipeline_tag: image-classification
tags:
- ml-lab
- pytorch
- food
- nutrition
- calorie-estimation
- portion-estimation
- multi-label
datasets:
- shalev396/calorie-lens-data
metrics:
- mae
ml_lab:
  title: Calorie Lens
  order: 18
  summary: Looks at a photo of a meal, finds each ingredient and its weight in grams, and turns that into calories, protein, fat, carbs and more.
  framework: PyTorch
  architecture: Image backbone + 253 ingredient queries -> grams -> frozen per-gram nutrition layer, plus a from-scratch food-name model
  dataset: Nutrition5k (cleaned) + FlavoriaFoodWeight1700 + USDA FoodData Central
  space: shalev396/calorie-lens
  runtime: zerogpu
  ui_kind: custom
  colab: https://colab.research.google.com/github/shalev396/ml-lab/blob/main/calorie-lens/training/notebook.ipynb
  github: https://github.com/shalev396/ml-lab/tree/main/calorie-lens
  metric:
    name: kcal_pmae
    value: 16.012844778871038
    split: test
  params: 94637834
  params_human: 94.64M
  trained_at: '2026-10-13'
model-index:
- name: calorie-lens
  results:
  - task:
      type: image-classification
    dataset:
      name: Nutrition5k (cleaned) + FlavoriaFoodWeight1700 + USDA FoodData Central
      type: shalev396/calorie-lens-data
      split: test
    metrics:
    - type: kcal_mae
      value: 40.9075
      name: kcal_mae
    - type: kcal_pmae
      value: 16.0128
      name: kcal_pmae
    - type: mass_pmae
      value: 12.6435
      name: mass_pmae
    - type: fat_pmae
      value: 23.3219
      name: fat_pmae
    - type: carb_pmae
      value: 21.6526
      name: carb_pmae
    - type: protein_pmae
      value: 21.7153
      name: protein_pmae
    - type: side_dish_kcal_pmae
      value: 15.8816
      name: side_dish_kcal_pmae
    - type: test_clean_kcal_pmae
      value: 16.281
      name: test_clean_kcal_pmae
    - type: presence_map
      value: 0.6885
      name: presence_map
    - type: ingredient_grams_mae
      value: 10.1312
      name: ingredient_grams_mae
    - type: flavoria_mass_pmae
      value: 25.4688
      name: flavoria_mass_pmae
    - type: nutritext_kcal_mae_per_100g
      value: 31.2459
      name: nutritext_kcal_mae_per_100g
---
# Calorie Lens

A photo of a meal goes in; out come **the ingredients on the plate, how many grams of each, and the
nutrition of every ingredient and of the whole plate** (kcal, protein, fat, carbs, fiber, sugars,
saturated fat, sodium). It is two models fused into one network, trained on the
[Nutrition5k](https://github.com/google-research-datasets/Nutrition5k) dishes, whose every ingredient was
weighed on a scale, on plates weighed at a Finnish lunch line
([FlavoriaFoodWeight1700](https://zenodo.org/records/5850856)) and on [USDA FoodData Central](https://fdc.nal.usda.gov/).

## Model

```
photo ─► backbone (DINOv2-B, or ConvNeXt-B) ─► 253 ingredient queries (cross-attention)
                                              ├─ is ingredient k on the plate?   (presence)
                                              └─ how many grams, if it is?       (grams)
         backbone ─► totals head ─► plate mass, kcal, macros
grams_k = P(k) x grams_k, rescaled to the plate mass, tilted toward the plate's kcal per gram
        ──►  253 neurons  =  stage 1's output        (the photo and its mirror image, averaged)
253 neurons ─► NutritionLayer (frozen, 253 x 8 per-gram table) ─► nutrition per ingredient + totals
food name ─► NutriText (own BPE tokenizer + 4-layer transformer, from scratch) ─► nutrients / 100 g
```

| | |
|---|---|
| Stage 1 (IngredientNet) | DINOv2-B with registers + a query decoder: one learned query per Nutrition5k ingredient reads the image tokens (2 cross-attention layers, no query self-attention), each query has its own presence and grams outputs. A totals head reads the CLS token and the mean patch token and estimates the plate's mass, kcal and macros directly |
| Readout | the ingredient grams are rescaled to the plate mass (in log space: 0.85 x the totals head + 0.15 x their own sum), then tilted toward a kcal-per-gram target (90 % the ingredients' own, 10 % the totals head's): denser foods gain grams and lighter ones lose them at the same plate mass. The photo and its mirror image are averaged. These settings and the number of views were fitted on validation |
| Stage 2a (NutritionLayer) | a bias-free linear layer whose weights are per-gram nutrients and are **never trained**: kcal / fat / carb / protein are Nutrition5k's own values (its labels are exactly grams x this table), fiber / sugars / saturated fat / sodium come from a reviewed USDA match per ingredient. The 253 gram neurons are its input layer, so the whole thing trains end to end |
| Stage 2b (NutriText) | open vocabulary: any food name -> nutrients per 100 g. Composition comes from a softmax x 100 g (can never exceed 100 g), sugars and saturated fat are bounded by carbs and fat, kcal stays close to the Atwater energy of the composition. Trained from scratch on ~470k USDA names |
| Input | any RGB photo, fitted (aspect kept) into a 378 x 504 canvas |
| Output | `{"ingredients": [{name, grams, confidence, kcal, fat_g, carb_g, protein_g, fiber_g, sugars_g, sat_fat_g, sodium_mg}], "other": {...}, "totals": {...}, "direct_estimate": {...}}`; the rows add up to the totals exactly |
| Files | `model.safetensors` (all three stages), `config.json` (ingredients, per-gram table, backbone config, fitted settings), `nutritext_tokenizer.json`, `model.py`, `handler.py` + `requirements.txt`, `metrics.json`, `assets/`, `NOTICE` + `LICENSE-APACHE-2.0.txt` (for the DINOv2 weights it was fine-tuned from) |

`config.json` records `pretrained: false`; `model.load()` rebuilds every network from `config.json` and
loads `model.safetensors`, so inference never downloads a base model. The weights load with `transformers`
versions before and after 5.18, which renamed DINOv2's attention layers.

## Usage

**Python**
```python
from huggingface_hub import snapshot_download
import sys
path = snapshot_download("shalev396/calorie-lens")
sys.path.insert(0, path)
import model
predictor = model.load(path, device="cpu")            # or "cuda"
result = predictor.predict("meal.jpg")                # a PIL image, bytes or base64 work too
result = predictor.predict("meal.jpg", total_grams=420)   # plate weighed? the scale becomes exact
result, heatmaps = predictor.analyze("meal.jpg")      # + where each ingredient's query looked
predictor.calculate([("grilled salmon", 150), ("white rice", 200)])   # stage 2b food calculator
```

**Space API (free):** the [Space](https://huggingface.co/spaces/shalev396/calorie-lens) exposes
`/predict` (photo + optional total grams in, `[result, seconds, device]` out).

**Inference Endpoint:** deploy this repo from its page (*Deploy -> Inference Endpoints*). `handler.py`
takes an image (`Content-Type: image/jpeg`, or JSON `{"inputs": "<base64>", "parameters": {"total_grams": 350}}`)
and returns the result above; `{"inputs": [["oatmeal", 250], ["banana", 120]]}` runs the calculator.

## Training

- **Data:** [shalev396/calorie-lens-data](https://huggingface.co/datasets/shalev396/calorie-lens-data):
  - **Nutrition5k:** one overhead RGB-D scan per dish where available and 5 frames from each of the 4
    side-angle videos. Label bugs were fixed (Cafe 2 totals logged as 0, x1000 scale errors, empty names,
    duplicate table rows) and every dish was assigned a plate group (plates were scanned once per added
    item), so validation never shares a plate with training. Test = the official split.
  - **FlavoriaFoodWeight1700:** 856 lunch plates from an automated cafeteria line in Finland, photographed
    from above with every serving weighed (median 472 g, 138 plates over 600 g). They give the plate weight
    and, for 52 plain foods (rice, potatoes, tomato, ...), the grams of that ingredient; no calories. Split by
    lunch day: 555 train, 301 test. 15 % of the training samples.
- **Recipe:** see [training/](https://github.com/shalev396/ml-lab/tree/main/calorie-lens/training): AdamW with
  layer-wise learning-rate decay, warmup + cosine, bf16, EMA of the weights, 40 epochs with early stopping on
  validation; augmentation on the GPU (any rotation for overhead scans, which keeps the camera-height scale
  cue). Targets a sample doesn't have (Flavoria's calories) are masked out of the loss. The totals head is
  trained on both log error and absolute error.
- **Selection:** two backbones trained with the same recipe: ConvNeXt-B from ImageNet-22k weights (timm) and
  DINOv2-B. Each of them, and the shipped v1 model, is read with 1, 2 or 4 test-time views and gets its own
  readout fitted on validation; the lowest validation score ships. The test split is evaluated once, at the end.

## Experiments

<!-- experiments:start -->
| candidate | val score | test kcal PMAE (overhead) | test mass PMAE | side-dish kcal PMAE | Flavoria weight PMAE | views | params |
|---|---|---|---|---|---|---|---|
| **E2 DINOv2-B (deployed)** | **14.92** | **16.01%** | **12.64%** | **15.88%** | **25.47%** | **2** | **94.64M** |
| E1 ConvNeXt-B in22k | 15.17 | 16.11% | 12.57% | 14.64% | 51.46% | 2 | 95.82M |
| v1 ConvNeXt-B (shipped) | 16.55 | 17.46% | 14.06% | 16.83% | 45.43% | 2 | 95.55M |
<!-- experiments:end -->

Validation picked DINOv2-B (14.92 vs 15.17; the gap is inside its 95 % CI of -1.78 to +1.45, and the test
split agrees: 16.01 % vs 16.11 %). On the Finnish plates DINOv2-B is far better (25.5 % vs 51.5 %). Both new
networks beat the v1 network, which reaches 17.46 % with the new readout (18.35 % with its old one): the
readout is worth about 0.9 points, the new training about 1.5 more. DINOv2-B peaked at epoch 32 and then
slowly overfit; ConvNeXt-B peaked at epoch 35. Training took 2.9 h on a Colab GPU (ConvNeXt-B 64 min,
DINOv2-B 101 min, NutriText and evaluation the rest).

![Training loss and validation score of every experiment](assets/training_curves.png)

![Test calorie error per candidate](assets/experiments.png)

## Evaluation

Numbers: overhead test scans (the official `depth_test` split, labels corrected), as MAE and percent MAE
(MAE / mean of the truth, the Nutrition5k convention). `metrics.json` also has the side-angle views,
`test_clean` (plates never seen in training), the original labels and the 95 % CI.

<!-- metrics:start -->
| metric (test) | value |
|---|---|
| kcal_mae | 40.9075 |
| kcal_pmae | 16.0128 |
| mass_pmae | 12.6435 |
| fat_pmae | 23.3219 |
| carb_pmae | 21.6526 |
| protein_pmae | 21.7153 |
| side_dish_kcal_pmae | 15.8816 |
| test_clean_kcal_pmae | 16.2810 |
| presence_map | 0.6885 |
| ingredient_grams_mae | 10.1312 |
| flavoria_mass_pmae | 25.4688 |
| nutritext_kcal_mae_per_100g | 31.2459 |
<!-- metrics:end -->

**Headline:** 16.01 % calorie error (40.9 kcal) on the 507 overhead test scans, 95 % CI 14.1-17.9 %
(bootstrap over plate groups), down from 18.35 % for v1. The original labels give the same 16.01 % on these
scans, so the number compares directly with published results. Plate mass: 12.6 % (25 g). Averaging all
side-angle frames of a dish: 15.9 %. Plates never seen in training (`test_clean`): 16.3 %.

| method (official overhead test, kcal PMAE) | input | error |
|---|---|---|
| Nutrition5k paper (Thames et al., 2021) | RGB | 26.1 % |
| Nutrition5k paper | RGB + depth | 18.8 % |
| Calorie Lens v1 | RGB | 18.35 % |
| **Calorie Lens v2** | **RGB** | **16.01 %** |
| best published RGB-only | RGB | 14.1 % |

![Predicted vs true kcal on the overhead test scans](assets/kcal_scatter.png)

Large plates improved but are still underestimated: over 600 kcal (38 dishes) the error fell from 167 to
146 kcal, and from 78 to 64 kcal at 400-600 kcal. Under 100 kcal it is 12 kcal (v1: 11).

![Calorie error by plate size](assets/error_by_kcal.png)

**Another cafeteria.** 301 Finnish plates from lunch days never trained on (weight only: the source has no
calories):

| plate weight | error | bias | error on plates over 600 g |
|---|---|---|---|
| v1 | 45.4 % (216 g) | -207 g | 410 g |
| v2, deployed readout (`totals`) | 25.5 % (121 g) | +104 g | 86 g |
| v2, totals head alone (`direct_estimate`) | 16.1 % (77 g) | -5 g | 135 g |

v1 had never seen a plate over ~600 g and came out 207 g light on average. v2's totals head learned these
plates: 16 % error and almost no bias. The itemised readout is worse there, because on these photos the model
marks dozens of ingredients as present: Flavoria labels say which foods are on a plate but never which are
absent, and the readout blends 15 % of that inflated gram sum into the plate mass.

**What each part is worth.** The totals head read on its own scores 15.7 %, close to the itemised
readout's 16.0 % (in v1 the gap was 16.4 vs 18.35 %). Step by step: soft grams rescaled to the plate mass
16.25 %, tilted toward the kcal per gram 16.08 %, averaged over 2 views 16.01 %. The plain sum of the soft
grams, without rescaling, is the worst (21.9 %).

![Calorie error of each way to read the model](assets/ablation.png)

**Ingredients:** presence mAP 0.69 (F1 0.75 at the display threshold 0.65); 10.1 g error per present
ingredient. Each ingredient's query looks at its own part of the plate:

![Where each ingredient's query looked](assets/heatmaps.png)

**NutriText** (stage 2b), on 633 USDA foods it never saw: kcal R² 0.89 vs 0.78 for a TF-IDF
nearest-neighbour lookup, 31.2 vs 47.4 kcal per 100 g, and better on all eight nutrients. On the 253
Nutrition5k names (zero-shot): 52 vs 87 kcal per 100 g (median 19 vs 49).

![NutriText vs a TF-IDF nearest-neighbour lookup](assets/nutritext.png)

## Limitations

- The Nutrition5k photos come from two Google cafeterias (a fixed overhead camera height, 253 ingredients);
  the Finnish plates add a third cafeteria, for weight only. On other photos the mass scale is uncertain;
  entering the plate's weight (`total_grams`) removes that error completely.
- On photos that don't look like Nutrition5k the ingredient list is unreliable: it spreads over many likely
  dishes (a Finnish rice-and-ratatouille plate comes out as lasagna, mashed potatoes, pasta, rice, ...). The
  plate weight in `direct_estimate` holds up better there.
- Hidden oil, butter, dressings and sauces can only be inferred from how the food looks.
- Only kcal, fat, carbs and protein are Nutrition5k's own values; the other four nutrients come from a
  USDA food matched to each ingredient. NutriText values for names it never saw are estimates, and some are
  off (it gives grilled salmon 6.2 g of carbs per 100 g).
- Plates over ~600 kcal are still underestimated (see the chart above).
- Results on corrected labels are not directly comparable with published Nutrition5k numbers; the
  original-label results are in `metrics.json`.

Code licence: MIT. The image backbone was fine-tuned from DINOv2 weights (Apache-2.0, see `NOTICE`).
Training data: Nutrition5k (CC BY 4.0, Thames et al., CVPR 2021), FlavoriaFoodWeight1700 (CC BY 4.0,
Sarapisto et al., 2022) and USDA FoodData Central (public domain).
