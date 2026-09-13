export const SETTLEMENT_MS_BY_STATE = Object.freeze({
  today: 1600,
  today_empty: 1600,
  loading: 0,
  login: 0,
  permission: 0,
  scan_idle: 0,
  scan_capturing: 0,
  processing: 0,
  review: 0,
  manual: 0,
  food: 0,
  food_edit: 0,
  history_week: 0,
  history_month: 0,
  goals: 0,
  goals_select: 0,
  ai: 0,
  ai_history: 0,
  profile: 0,
});

export function clockAdvanceMsFor(stateId) {
  if (!Object.hasOwn(SETTLEMENT_MS_BY_STATE, stateId)) {
    throw new Error(`RENDER_INVALID_INPUT: unknown stateId '${String(stateId)}'`);
  }
  return SETTLEMENT_MS_BY_STATE[stateId];
}
