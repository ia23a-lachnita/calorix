import type { NutritionReference } from './nutrition-contract';

type PackageUnit = 'g' | 'ml';

export interface OffProduct {
  name: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  barcode?: string;
  rawQuantity?: string;
  productQuantity?: { amount: number; unit: PackageUnit };
  productQuantityIssue?: 'invalid' | 'unsupported_unit';
  servingReference?: NutritionReference;
  per100Reference?: NutritionReference;
  nutritionDataPer?: '100g' | 'serving';
}

export interface OffClientOptions {
  fetchFn?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
}

const DEFAULT_USER_AGENT =
  'Calorix/1.0 (https://github.com/ia23a-lachnita/calorix)';

function finiteNutrition(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function packageUnit(value: unknown): PackageUnit | null {
  return value === 'g' || value === 'ml' ? value : null;
}

function reference(
  nutrients: Record<string, unknown>,
  suffix: '100g' | 'serving',
  amount: unknown,
  unit: unknown,
): NutritionReference | null {
  const kcal = finiteNutrition(nutrients[`energy-kcal_${suffix}`]);
  const proteinG = finiteNutrition(nutrients[`proteins_${suffix}`]);
  const carbsG = finiteNutrition(nutrients[`carbohydrates_${suffix}`]);
  const fatG = finiteNutrition(nutrients[`fat_${suffix}`]);
  const validAmount = finitePositive(amount);
  const validUnit = packageUnit(unit);
  if (
    kcal === null ||
    proteinG === null ||
    carbsG === null ||
    fatG === null ||
    validAmount === null ||
    validUnit === null
  ) {
    return null;
  }
  return { kcal, proteinG, carbsG, fatG, amount: validAmount, unit: validUnit };
}

export async function fetchOffProduct(
  barcode: string,
  options: OffClientOptions = {},
): Promise<OffProduct | null> {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 5000,
  );
  try {
    const fields = encodeURIComponent(
      'code,product_name,quantity,product_quantity,product_quantity_unit,' +
        'serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,nutriments',
    );
    const response = await (options.fetchFn ?? fetch)(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?fields=${fields}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as Record<string, unknown>;
    const result = payload.result as Record<string, unknown> | undefined;
    const product = payload.product as Record<string, unknown> | undefined;
    if (payload.status !== 'success' || result?.id !== 'product_found' || !product) {
      return null;
    }
    const name = product.product_name;
    const nutrients = product.nutriments as Record<string, unknown> | undefined;
    if (typeof name !== 'string' || name.trim().length === 0 || !nutrients) {
      return null;
    }
    const productBarcode = product.code;
    if (typeof productBarcode !== 'string' || !/^\d{8,14}$/.test(productBarcode)) {
      return null;
    }
    const unit = packageUnit(product.product_quantity_unit);
    const per100Reference = reference(nutrients, '100g', 100, unit ?? 'g');
    if (!per100Reference) {
      return null;
    }
    const quantity = finitePositive(product.product_quantity);
    const servingReference = reference(
      nutrients,
      'serving',
      product.serving_quantity,
      product.serving_quantity_unit,
    );
    const rawQuantity = product.quantity;
    const parsed: OffProduct = {
      name: name.trim(),
      barcode: productBarcode,
      kcalPer100g: per100Reference.kcal,
      proteinPer100g: per100Reference.proteinG,
      carbsPer100g: per100Reference.carbsG,
      fatPer100g: per100Reference.fatG,
      per100Reference,
    };
    if (typeof rawQuantity === 'string' && rawQuantity.trim().length > 0) {
      parsed.rawQuantity = rawQuantity.trim();
    }
    const hasStructuredQuantity = Object.prototype.hasOwnProperty.call(product, 'product_quantity');
    const hasStructuredUnit = Object.prototype.hasOwnProperty.call(
      product,
      'product_quantity_unit',
    );
    if (unit !== null && quantity !== null) {
      parsed.productQuantity = { amount: quantity, unit };
    } else if (typeof product.product_quantity_unit === 'string' && unit === null) {
      parsed.productQuantityIssue = 'unsupported_unit';
    } else if (hasStructuredQuantity || hasStructuredUnit) {
      parsed.productQuantityIssue = 'invalid';
    }
    if (servingReference) parsed.servingReference = servingReference;
    if (product.nutrition_data_per === '100g' || product.nutrition_data_per === 'serving') {
      parsed.nutritionDataPer = product.nutrition_data_per;
    }
    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
