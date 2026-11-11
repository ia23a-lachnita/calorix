---
license: cc-by-4.0
pretty_name: Calorie Lens data (cleaned Nutrition5k + USDA FoodData Central)
task_categories: [image-classification, tabular-regression]
tags: [food, nutrition, calories, portion-estimation, ml-lab]
size_categories: [100K<n<1M]
configs:
- config_name: overhead
  data_files:
  - split: train
    path: overhead/train-*.parquet
  - split: validation
    path: overhead/validation-*.parquet
  - split: test
    path: overhead/test-*.parquet
- config_name: side
  data_files:
  - split: train
    path: side/train-*.parquet
  - split: validation
    path: side/validation-*.parquet
  - split: test
    path: side/test-*.parquet
- config_name: dishes
  data_files: dishes.parquet
- config_name: items
  data_files: items.parquet
- config_name: usda
  data_files: usda.parquet
- config_name: ingredients
  data_files: ingredients.csv
- config_name: flavoria
  data_files:
  - split: train
    path: flavoria/train-*.parquet
  - split: test
    path: flavoria/test-*.parquet
- config_name: flavoria_sessions
  data_files: flavoria_sessions.parquet
- config_name: flavoria_items
  data_files: flavoria_items.parquet
---

# Calorie Lens data

Training data of [shalev396/calorie-lens](https://huggingface.co/shalev396/calorie-lens): a photo of a meal ->
the grams of each of 253 ingredients -> nutrition. Built by
[`training/src/dataset_build.py`](https://github.com/shalev396/ml-lab/tree/main/calorie-lens/training/src) from:

- **[Nutrition5k](https://github.com/google-research-datasets/Nutrition5k)** (Thames et al., CVPR 2021, **CC BY 4.0**):
  cafeteria dishes weighed ingredient by ingredient, an overhead RGB-D scan and four side-angle videos per dish.
- **[USDA FoodData Central](https://fdc.nal.usda.gov/)** (public domain, CC0): Foundation Foods, SR Legacy,
  FNDDS 2021-2023 and Branded Foods, nutrients per 100 g.

## Contents
| Config | Rows | What |
|---|---|---|
| `overhead` | one per dish with a scan | `image` (640x480 JPEG q95), `depth` (uint16 PNG, value / 10000 = metres; 0 = no reading) |
| `side` | 5 per camera | `camera` A-D, `frame` index of `n_frames`, `image` (910x512 JPEG q90 from the 1080p video) |
| `dishes` | 5005 | corrected totals (kcal, mass g, fat, carb, protein), the logged ones as `orig_*`, `group`, `split`, `test_clean` |
| `items` | 28446 | one row per (dish, ingredient): `k` (model output index), grams, nutrients |
| `ingredients` | 253 | per-gram kcal / fat / carb / protein (Nutrition5k, exact), fiber / sugars / sat_fat / sodium (mg) from the reviewed USDA match |
| `usda` | see config | name, category, alternative names, nutrients per 100 g (sodium in mg) |

## Splits
- `test` = the official Nutrition5k `rgb_test` dishes (709); those with an overhead scan are exactly the official
  `depth_test` split, so results compare with published numbers. `test_clean` marks the 565 test dishes
  whose plate never appears in train / validation.
- `validation` = 430 dishes: whole plate groups drawn from train. `train` = 3866 dishes (Cafe 2 included).
- **Plate groups**: plates were built one item at a time with a scan after each, so many dishes are earlier states of a
  later one. A group never straddles train and validation.

## Changes to the original labels
Every Nutrition5k ingredient's nutrients are grams x a per-gram table; these tables keep that exactly. Fixes (counts):
- Cafe 2 totals logged as 0: 932
- scale total != sum of ingredient grams: 449
- follows the ingredient fixes: 82
- x1000 scale error: 10
- name taken from the table: 8
- empty-plate weight, not food: 2
- photo shows a phone, not the plate: 1
- duplicate of 'watermelon': 1
- duplicate of 'apple': 1

<!-- flavoria:start -->
## FlavoriaFoodWeight1700 (second cafeteria, weighed plates)
[FlavoriaFoodWeight1700](https://zenodo.org/records/5850856) (University of Turku, **CC BY 4.0**): an automated lunch line
photographs each tray from above and weighs every serving it takes. Built by
[`training/src/flavoria.py`](https://github.com/shalev396/ml-lab/tree/main/calorie-lens/training/src):

| Config | Rows | What |
|---|---|---|
| `flavoria` | 856 | `dish_id`, `image` (the "identification" photo, 1024 px PNG -> 512 x 512 JPEG q90) |
| `flavoria_sessions` | 856 | plate weight `mass` (g, sum of the weighed servings), `date`, `split`, `n_items`, `mapped_g` |
| `flavoria_items` | per plate | each weighed component, its grams, and the Nutrition5k ingredient (`k`) where one plain food matches |

- Weight only: the source has no calories. 42% of the weighed grams map to a
  Nutrition5k ingredient (`labels/flavoria_component_map.csv`, reviewed by hand); mixed dishes count in the plate weight only.
- Splits by lunch day (32 days; every 5th is a test day): train 555,
  test 301 plates. Median plate 472 g; 138 plates over 600 g.
- Cleaning, of 3345 sessions:
  - soup or dessert (served outside the plate): 95
  - one component over 600 g (scale glitch): 378
  - plate over 1200 g or under 30 g: 384
  then 883 identification photos matched to 856 kept plates (tray RFID +
  time to the second). Sauces from the self-service station and bread are not weighed: weights are slightly low.

Sarapisto, T., Koivunen, L., Mäkilä, T., Klami, A., Ojansivu, P. (2022). FlavoriaFoodWeight1700: Automated Lunch Line Meal Pictures with Automatic Measurement of Weight and Contents. Zenodo. https://doi.org/10.5281/zenodo.5850856
<!-- flavoria:end -->

## Citation
```bibtex
@inproceedings{thames2021nutrition5k,
  title={Nutrition5k: Towards Automatic Nutritional Understanding of Generic Food},
  author={Thames, Quin and Karpur, Arjun and Norris, Wade and Xia, Fangting and Panait, Liviu and Weyand, Tobias and Sim, Jack},
  booktitle={CVPR}, pages={8903--8911}, year={2021}
}
```
U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2019-2026. fdc.nal.usda.gov.
