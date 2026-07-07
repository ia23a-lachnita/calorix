import type { NutritionResult } from './nutrition';

export interface DailyLogDelta {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  entryCount: number;
}

/**
 * UTC-based day key. This preserves the historical behavior for the Stage 2
 * port; Stage 4 replaces timestamp-derived keys with the client-owned
 * `dateKey` field (device-local calendar day), which fixes the documented
 * misfiling bug for entries logged when local date != UTC date.
 */
export function utcDateKey(date: Date): string {
  return date.toISOString().substring(0, 10);
}

export function buildDailyLogDelta(nutrition: NutritionResult): DailyLogDelta {
  return {
    kcal: nutrition.kcal,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
    entryCount: 1,
  };
}
