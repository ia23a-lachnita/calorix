export interface OffProduct {
  name: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface OffClientOptions {
  fetchFn?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
}

const DEFAULT_USER_AGENT =
  'Calorix/1.0 (https://github.com/ia23a-lachnita/calorix)';

function finiteNutrition(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
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
    const fields = encodeURIComponent('product_name,nutriments');
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
    const kcal = finiteNutrition(nutrients['energy-kcal_100g']);
    const protein = finiteNutrition(nutrients.proteins_100g);
    const carbs = finiteNutrition(nutrients.carbohydrates_100g);
    const fat = finiteNutrition(nutrients.fat_100g);
    if (kcal === null || protein === null || carbs === null || fat === null) {
      return null;
    }
    return {
      name: name.trim(),
      kcalPer100g: kcal,
      proteinPer100g: protein,
      carbsPer100g: carbs,
      fatPer100g: fat,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
