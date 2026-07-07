import { describe, expect, it } from 'vitest';
import { buildDailyLogDelta, utcDateKey } from '../src/aggregation';

describe('utcDateKey', () => {
  it('formats the UTC calendar day', () => {
    expect(utcDateKey(new Date('2026-07-07T10:00:00Z'))).toBe('2026-07-07');
  });

  it('documents the historical UTC-vs-local behavior preserved by the port', () => {
    // 23:30 local in UTC+2 is 21:30Z the same day, but 01:30 local next day
    // in UTC+2 is 23:30Z the previous day: the UTC key misfiles it. Stage 4
    // replaces this with the client-owned dateKey.
    expect(utcDateKey(new Date('2026-07-07T23:30:00Z'))).toBe('2026-07-07');
  });
});

describe('buildDailyLogDelta', () => {
  it('maps nutrition onto the daily-log increment fields', () => {
    expect(
      buildDailyLogDelta({
        foodName: 'Oatmeal',
        kcal: 350,
        protein: 12,
        carbs: 60,
        fat: 7,
        confidence: 0.9,
        detectedItems: [],
        boundingBox: null,
      }),
    ).toEqual({ kcal: 350, protein: 12, carbs: 60, fat: 7, entryCount: 1 });
  });
});
