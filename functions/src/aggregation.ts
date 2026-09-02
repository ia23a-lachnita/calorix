import {scaleCanonicalNutrition} from './nutrition-contract';

export interface AggregatableEntry {
  status: string;
  baseKcal?: number;
  baseProtein?: number;
  baseCarbs?: number;
  baseFat?: number;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  servingMultiplier?: number;
  nutritionBasis?: unknown;
  nutritionAmount?: unknown;
  nutritionUnit?: unknown;
  consumedAmount?: unknown;
}

export interface DailyTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  entryCount: number;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value);
}

/**
 * The date keys whose daily logs must be recomputed for one entry write.
 * Covers create (no before), delete (no after), and edits that move an entry
 * to a different calendar day (both days recomputed).
 */
export function affectedDateKeys(beforeDate: unknown, afterDate: unknown): string[] {
  const keys = new Set<string>();
  if (isValidDateKey(beforeDate)) keys.add(beforeDate);
  if (isValidDateKey(afterDate)) keys.add(afterDate);
  return [...keys];
}

/**
 * Absolute daily totals from every `complete` entry of one calendar day.
 * Canonical entries scale by their consumed amount; legacy records retain the
 * servingMultiplier behavior. Idempotent by construction: recomputing from
 * current state can never double-count, regardless of trigger retries or event order.
 */
export function summarizeCompleteEntries(entries: AggregatableEntry[]): DailyTotals {
  const totals: DailyTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, entryCount: 0 };
  for (const entry of entries) {
    if (entry.status !== 'complete') continue;
    const scaled = scaleCanonicalNutrition(entry);
    totals.kcal += scaled.kcal;
    totals.protein += scaled.proteinG;
    totals.carbs += scaled.carbsG;
    totals.fat += scaled.fatG;
    totals.entryCount += 1;
  }
  return totals;
}
