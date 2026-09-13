import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SETTLEMENT_MS_BY_STATE, clockAdvanceMsFor } from '../harness/settlement.mjs';

const EXPECTED_IDS = ['loading', 'login', 'permission', 'scan_idle', 'scan_capturing', 'processing', 'review', 'manual', 'today', 'today_empty', 'food', 'food_edit', 'history_week', 'history_month', 'goals', 'goals_select', 'ai', 'ai_history', 'profile'];

test('settlement map is exhaustive over inventory IDs', () => {
  assert.deepEqual(Object.keys(SETTLEMENT_MS_BY_STATE).sort(), EXPECTED_IDS.sort());
  const inventory = JSON.parse(readFileSync(new URL('../../../../docs/design-handoff/placeholder-app/visual-state-inventory.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(SETTLEMENT_MS_BY_STATE).sort(), inventory.states.map((s) => s.id).sort());
  assert.equal(SETTLEMENT_MS_BY_STATE.today, 1600);
  assert.equal(SETTLEMENT_MS_BY_STATE.today_empty, 1600);
  for (const id of EXPECTED_IDS) { if (id !== 'today' && id !== 'today_empty') assert.equal(SETTLEMENT_MS_BY_STATE[id], 0); }
});

test('clockAdvanceMsFor maps and rejects unknown', () => {
  assert.equal(clockAdvanceMsFor('today'), 1600);
  assert.equal(clockAdvanceMsFor('today_empty'), 1600);
  assert.equal(clockAdvanceMsFor('loading'), 0);
  assert.equal(clockAdvanceMsFor('scan_idle'), 0);
  assert.throws(() => clockAdvanceMsFor('unknown'), /RENDER_INVALID_INPUT/);
});
