import { describe, expect, it } from 'vitest';
import { buildAiChatContextFromData } from '../src/ai-chat-firestore';

describe('buildAiChatContextFromData', () => {
  it('returns documented defaults when profile, plan, consumed, recentMeals, and history are absent', () => {
    const result = buildAiChatContextFromData({
      profile: null,
      plan: null,
      consumed: null,
      recentMeals: null,
      history: null,
      clientMessageId: 'msg-new',
    });

    expect(result).toEqual({
      profile: {},
      plan: {
        planName: 'Custom',
        kcal: 2400,
        protein: 170,
        carbs: 250,
        fat: 70,
      },
      consumed: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      recentMeals: [],
      history: [],
    });
  });
});
