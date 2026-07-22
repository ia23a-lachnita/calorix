import { describe, expect, it } from 'vitest';
import {
  affectedDateKeys,
  isValidDateKey,
  summarizeCompleteEntries,
} from '../src/aggregation';

describe('isValidDateKey', () => {
  it('accepts YYYY-MM-DD and rejects everything else', () => {
    expect(isValidDateKey('2026-07-07')).toBe(true);
    expect(isValidDateKey('2026-7-7')).toBe(false);
    expect(isValidDateKey('20260707')).toBe(false);
    expect(isValidDateKey(undefined)).toBe(false);
    expect(isValidDateKey(20260707)).toBe(false);
  });
});

describe('affectedDateKeys', () => {
  it('returns one key for create and delete', () => {
    expect(affectedDateKeys(undefined, '2026-07-07')).toEqual(['2026-07-07']);
    expect(affectedDateKeys('2026-07-07', undefined)).toEqual(['2026-07-07']);
  });

  it('returns both days when an edit moves the entry to another day', () => {
    expect(affectedDateKeys('2026-07-06', '2026-07-07')).toEqual([
      '2026-07-06',
      '2026-07-07',
    ]);
  });

  it('deduplicates unchanged days', () => {
    expect(affectedDateKeys('2026-07-07', '2026-07-07')).toEqual(['2026-07-07']);
  });
});

describe('summarizeCompleteEntries', () => {
  it('sums only complete entries, scaled by servingMultiplier', () => {
    const totals = summarizeCompleteEntries([
      { status: 'complete', baseKcal: 620, baseProtein: 48, baseCarbs: 72, baseFat: 16 },
      { status: 'complete', baseKcal: 100, baseProtein: 10, baseCarbs: 5, baseFat: 2, servingMultiplier: 2 },
      { status: 'needs_review', kcal: 400, protein: 30, carbs: 40, fat: 12 },
      { status: 'pending', kcal: 999 },
    ]);
    expect(totals).toEqual({ kcal: 820, protein: 68, carbs: 82, fat: 20, entryCount: 2 });
  });

  it('prefers canonical base fields and falls back to legacy fields', () => {
    const totals = summarizeCompleteEntries([
      {
        status: 'complete',
        baseKcal: 100,
        baseProtein: 10,
        baseCarbs: 20,
        baseFat: 5,
        kcal: 999,
        protein: 999,
        carbs: 999,
        fat: 999,
        servingMultiplier: 2,
      },
      { status: 'complete', kcal: 50, protein: 5, carbs: 4, fat: 3 },
    ]);
    expect(totals).toEqual({
      kcal: 250,
      protein: 25,
      carbs: 44,
      fat: 13,
      entryCount: 2,
    });
  });

  it('returns zero totals for an empty day so the daily log can be deleted', () => {
    expect(summarizeCompleteEntries([])).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      entryCount: 0,
    });
  });

  it('is idempotent: recomputing the same state yields the same totals', () => {
    const entries = [
      { status: 'complete', kcal: 620, protein: 48, carbs: 72, fat: 16 },
    ];
    expect(summarizeCompleteEntries(entries)).toEqual(summarizeCompleteEntries(entries));
  });
});
