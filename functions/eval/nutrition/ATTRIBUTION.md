# Public Evaluation Corpus Attribution

## nutrition5k-cc-by-4.0

- **Dataset**: Nutrition5k
- **Source**: Google Research Datasets
- **URL**: https://github.com/google-research-datasets/Nutrition5k
- **Image source**: `gs://nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/`
- **Image URL pattern**: `https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/{dish_id}/rgb.png`
- **License**: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- **Retrieved**: 2026-08-31
- **Cases**: 12 meal/portion cases (dish_1565035746, dish_1558639818, dish_1558549605, dish_1561663580, dish_1565898402, dish_1566328724, dish_1566838351, dish_1567107839, dish_1558639787, dish_1562788601, dish_1560456326, dish_1564427430)
- **Image format**: 640x480 PNG, RGB, overhead RealSense depth camera
- **Nutrition source**: Per-dish CSV annotations computed from USDA Food and Nutrient Database
- **Limitations**: Dataset collected from select Google cafeterias in California, USA. Does not cover all food cuisines. Overhead RGB-D images available for ~3,500 of ~5,000 dishes. Selected cases are from the official `depth_test_ids.txt` split.

### Calibration corpus (nutrition5k-cc-by-4.0)

- **Scope**: 40 dishes in manifest slot order: 24 development (slots 0-23) / 16 validation (slots 24-39).
- **Split**: Official `rgb_train_ids.txt` split (`dish_ids/splits/rgb_train_ids.txt`).
- **Image view**: Overhead `rgb.png` only, per the image URL pattern above.
- **Source/license**: Public CC BY 4.0 source above; same dataset, image source, URL pattern, and license.
- **Retrieval date**: 2026-09-24.
- **Source lock SHA-256**: `f1138680a38aa64eb400bc20c89ec656d771e8f3823ae09bed956a48eff2a43b` (`functions/eval/nutrition/calibration-source-lock.json`).
- **Manifest SHA-256**: `313c37c14cb912d5dc6410dbb3b812139c22d7533d2341678de3ac860b0c1d6d` (`functions/eval/nutrition/calibration-manifest.json`).
- **Bytes policy**: Selected image bytes are referenced by HTTPS URL/hash but not committed.
- **Dish IDs (manifest slot order)**: dish_1565117892, dish_1566844803, dish_1560442303, dish_1558116547, dish_1563986093, dish_1564000490, dish_1561575410, dish_1563812535, dish_1564778057, dish_1559846311, dish_1564588719, dish_1563480534, dish_1562688382, dish_1565711115, dish_1561492204, dish_1558115011, dish_1560798707, dish_1563910708, dish_1567629081, dish_1560874667, dish_1566501473, dish_1560356523, dish_1565119642, dish_1565021675, dish_1560442450, dish_1562173267, dish_1559241099, dish_1558630006, dish_1562602627, dish_1562096372, dish_1565972363, dish_1559846504, dish_1562184705, dish_1561393550, dish_1563563467, dish_1561665747, dish_1558115764, dish_1562689601, dish_1565118096, dish_1560800836.

## open-food-facts-odbl

- **Dataset**: Open Food Facts
- **Source**: Open Food Facts community database
- **API**: https://world.openfoodfacts.org/api/v3/product/{barcode}
- **Reuse terms**: https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/index.md
- **License**: [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1.0/); individual database contents are under the [Database Contents License (DbCL) 1.0](https://opendatacommons.org/licenses/dbcl/1.0/)
- **Image license**: [Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0)](https://creativecommons.org/licenses/by-sa/3.0/) (product photos contributed by users)
- **Retrieved**: 2026-08-31
- **Cases**: 8 OFF cases (4 barcode, 4 label)
  - Barcode/front-image cases: 3017624010701, 5449000000996, 4056489686941, 7622210449283
  - Label/nutrition-image cases: 8076809513753, 8000500310427, 4008400404127, 3228857000166
- **API fields used**: `product_name`, `nutriments` (energy-kcal_100g, proteins_100g, carbohydrates_100g, fat_100g, plus serving variants), `quantity`, `product_quantity`, `product_quantity_unit`, `serving_size`, `serving_quantity`, `image_front_url`, `image_nutrition_url`
- **Image format**: JPEG `.400.jpg` thumbnails from Open Food Facts CDN
- **Nutrition basis**: Per-100g values from OFF; package-total truth computed as `per100g × product_quantity / 100`
- **Limitations**: Community-contributed data with variable quality. Serving metadata may be inconsistent (e.g., 4056489686941 multipack contradiction between product name and catalog quantity). Label OCR rounding tolerance applied for label scanMode cases.
