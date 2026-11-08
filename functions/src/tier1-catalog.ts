// USDA FoodData Central SR Legacy. Actual API records fetched 2026-11-07.
// Food identity/preparation matching is still an estimate; these are nutrient records, not verified meal truth.
export const CATALOG_VERSION = 'usda-sr-2019-tier1-20261108-v1';
export const CATALOG = [
  {
    "id": "usda:168878",
    "description": "Rice, white, long-grain, regular, enriched, cooked",
    "preparation": "cooked",
    "priorG": 200,
    "per100": {
      "kcal": 130.0,
      "proteinG": 2.69,
      "carbsG": 28.17,
      "fatG": 0.28
    },
    "sourceUrl": "https://fdc.nal.usda.gov/food-details/168878/nutrients",
    "dataType": "SR Legacy",
    "published": "4/1/2019",
    "retrieved": "2026-11-07",
    "responseSha256": "6abf7acb3c1bb7f0306de2a3d99c760a098d8fc373c1f4d4d2bbd2776987186b"
  },
  {
    "id": "usda:171413",
    "description": "Oil, olive, salad or cooking",
    "preparation": "oil",
    "priorG": 10,
    "per100": {
      "kcal": 884.0,
      "proteinG": 0.0,
      "carbsG": 0.0,
      "fatG": 100.0
    },
    "sourceUrl": "https://fdc.nal.usda.gov/food-details/171413/nutrients",
    "dataType": "SR Legacy",
    "published": "4/1/2019",
    "retrieved": "2026-11-07",
    "responseSha256": "e2507aa9164e584e6fcb517ce5b7499d47351a3fff46de6abbea42c627a86f3d"
  },
  {
    "id": "usda:171477",
    "description": "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
    "preparation": "cooked roasted",
    "priorG": 150,
    "per100": {
      "kcal": 165.0,
      "proteinG": 31.02,
      "carbsG": 0.0,
      "fatG": 3.57
    },
    "sourceUrl": "https://fdc.nal.usda.gov/food-details/171477/nutrients",
    "dataType": "SR Legacy",
    "published": "4/1/2019",
    "retrieved": "2026-11-07",
    "responseSha256": "afda67c5c25a711e1f646207c6bcda01342dde59a557a8901f8b684da65edc41"
  },
  {
    "id": "usda:170380",
    "description": "Broccoli, frozen, spears, cooked, boiled, drained, without salt",
    "preparation": "cooked boiled",
    "priorG": 100,
    "per100": {
      "kcal": 28.0,
      "proteinG": 3.1,
      "carbsG": 5.36,
      "fatG": 0.11
    },
    "sourceUrl": "https://fdc.nal.usda.gov/food-details/170380/nutrients",
    "dataType": "SR Legacy",
    "published": "4/1/2019",
    "retrieved": "2026-11-07",
    "responseSha256": "d909ec2a5ad9f8c21bb332bae4bd1cbd08ef2a20c7e2c540875e0a18d178ec73"
  },
  {
    "id": "usda:173424",
    "description": "Egg, whole, cooked, hard-boiled",
    "preparation": "cooked hard-boiled",
    "priorG": 50,
    "per100": {
      "kcal": 155.0,
      "proteinG": 12.58,
      "carbsG": 1.12,
      "fatG": 10.61
    },
    "sourceUrl": "https://fdc.nal.usda.gov/food-details/173424/nutrients",
    "dataType": "SR Legacy",
    "published": "4/1/2019",
    "retrieved": "2026-11-07",
    "responseSha256": "8be047fdca236bf4495a2e465fc292428ce0d766a35f3ad961974fa1475c0629"
  },
  {
    "id": "usda:171705",
    "description": "Avocados, raw, all commercial varieties",
    "preparation": "raw",
    "priorG": 100,
    "per100": {
      "kcal": 160.0,
      "proteinG": 2.0,
      "carbsG": 8.53,
      "fatG": 14.66
    },
    "sourceUrl": "https://fdc.nal.usda.gov/food-details/171705/nutrients",
    "dataType": "SR Legacy",
    "published": "4/1/2019",
    "retrieved": "2026-11-07",
    "responseSha256": "04d2d5513c3b124f880b468d2833d104e73dcb8de4f262f0c61e8cdfebb5b735"
  }
] as const;
