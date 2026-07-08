import { describe, expect, it, vi } from 'vitest';
import {
  AiChatInputError,
  aiChatInputSchema,
  buildChatContents,
  handleAiChat,
  type AiChatDeps,
} from '../src/ai-chat';
import { DEFAULT_MODEL_CONFIG } from '../src/model-config';

const validInput = {
  message: 'Bump my protein, I train 5x per week now.',
  history: [
    { role: 'model', text: 'Hi! How can I help?' },
    { role: 'user', text: 'hello' },
  ],
  plan: { kcal: 2400, protein: 170, carbs: 250, fat: 70, planName: 'Cut phase' },
  consumed: { kcal: 845.4, protein: 52.2, carbs: 90.1, fat: 31.8 },
};

function deps(overrides: Partial<AiChatDeps> = {}): AiChatDeps {
  return {
    getModelConfig: async () => ({ ...DEFAULT_MODEL_CONFIG, chatModel: 'test-chat-model' }),
    generateChat: async () => 'Sure — raise protein to **190 g**.',
    appDisplayName: 'AppName',
    ...overrides,
  };
}

describe('aiChatInputSchema', () => {
  it('accepts a valid payload and defaults optional fields', () => {
    const parsed = aiChatInputSchema.parse({
      message: 'hi',
      plan: { kcal: 2400, protein: 170, carbs: 250, fat: 70 },
      consumed: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    });
    expect(parsed.history).toEqual([]);
    expect(parsed.plan.planName).toBe('Custom');
  });

  it('rejects empty and oversized messages', () => {
    expect(aiChatInputSchema.safeParse({ ...validInput, message: '   ' }).success).toBe(false);
    expect(
      aiChatInputSchema.safeParse({ ...validInput, message: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });

  it('rejects more than 12 history turns and negative macros', () => {
    const turns = Array.from({ length: 13 }, () => ({ role: 'user', text: 'hi' }));
    expect(aiChatInputSchema.safeParse({ ...validInput, history: turns }).success).toBe(false);
    expect(
      aiChatInputSchema.safeParse({
        ...validInput,
        consumed: { ...validInput.consumed, kcal: -1 },
      }).success,
    ).toBe(false);
  });
});

describe('buildChatContents', () => {
  it('replays history and merges coaching context into the final user turn', () => {
    const input = aiChatInputSchema.parse(validInput);
    const contents = buildChatContents(input, 'AppName');

    expect(contents).toHaveLength(3);
    expect(contents[0]).toEqual({ role: 'model', parts: [{ text: 'Hi! How can I help?' }] });
    expect(contents[1]).toEqual({ role: 'user', parts: [{ text: 'hello' }] });

    const finalTurn = contents[2];
    expect(finalTurn.role).toBe('user');
    const text = finalTurn.parts[0].text;
    expect(text).toContain('AppName AI');
    expect(text).toContain('2400 kcal, 170g protein, 250g carbs, 70g fat (plan: Cut phase)');
    expect(text).toContain('845 kcal, 52g protein, 90g carbs, 32g fat');
    expect(text).toContain('"macro" is one of kcal, protein, carbs, fat');
    expect(text.endsWith(validInput.message)).toBe(true);
  });
});

describe('handleAiChat', () => {
  it('asks the configured chat model and returns the trimmed reply', async () => {
    const generateChat = vi.fn(async () => '  Raise protein to **190 g**.  ');
    const result = await handleAiChat(validInput, deps({ generateChat }));

    expect(result).toEqual({ reply: 'Raise protein to **190 g**.' });
    expect(generateChat).toHaveBeenCalledTimes(1);
    expect(generateChat.mock.calls[0][0]).toBe('test-chat-model');
  });

  it('throws AiChatInputError for malformed payloads without calling the model', async () => {
    const generateChat = vi.fn(async () => 'unused');
    await expect(handleAiChat({ message: '' }, deps({ generateChat }))).rejects.toBeInstanceOf(
      AiChatInputError,
    );
    expect(generateChat).not.toHaveBeenCalled();
  });

  it('treats an empty model reply as an error', async () => {
    await expect(
      handleAiChat(validInput, deps({ generateChat: async () => '   ' })),
    ).rejects.toThrow('Empty model response');
  });
});
