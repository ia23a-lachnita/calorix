import { describe, expect, it, vi } from 'vitest';
import {
  AiChatBusyError,
  AiChatInputError,
  aiChatInputSchema,
  buildChatContents,
  handleAiChat,
  parseModelReply,
  selectMessagesToArchive,
  truncateThreadTitle,
  type AiChatDeps,
  type AiChatResponse,
} from '../src/ai-chat';
import { DEFAULT_MODEL_CONFIG } from '../src/model-config';

const validInput = {
  message: 'Bump my protein, I train 5x per week now.',
  clientMessageId: 'msg_01JABCDEF0123456789',
};

const context = {
  profile: { displayName: 'Eli' },
  plan: {
    kcal: 2400,
    protein: 170,
    carbs: 250,
    fat: 70,
    planName: 'Cut phase',
  },
  consumed: { kcal: 845.4, protein: 52.2, carbs: 90.1, fat: 31.8 },
  recentMeals: ['Greek yogurt · 320 kcal', 'Chicken bowl · 525 kcal'],
  history: [
    { role: 'model' as const, text: 'Hi! How can I help?' },
    { role: 'user' as const, text: 'hello' },
  ],
};

function deps(overrides: Partial<AiChatDeps> = {}): AiChatDeps {
  return {
    getModelConfig: async () => ({
      ...DEFAULT_MODEL_CONFIG,
      chatModel: 'test-chat-model',
    }),
    generateChat: async () => 'Sure — raise protein to **190 g**.',
    appDisplayName: 'AppName',
    claimExchange: async () => ({
      status: 'claimed',
      threadId: 'thread-1',
    }),
    loadContext: async () => context,
    completeExchange: async () => undefined,
    failExchange: async () => undefined,
    enforceMessageCap: async () => undefined,
    ...overrides,
  };
}

describe('aiChatInputSchema', () => {
  it('accepts only message plus persistence identifiers', () => {
    expect(
      aiChatInputSchema.parse({
        ...validInput,
        threadId: 'thread-1',
        linkedMealId: 'meal-1',
      }),
    ).toEqual({
      ...validInput,
      threadId: 'thread-1',
      linkedMealId: 'meal-1',
    });
  });

  it('rejects client-supplied plan, intake, and history', () => {
    expect(
      aiChatInputSchema.safeParse({
        ...validInput,
        plan: context.plan,
        consumed: context.consumed,
        history: context.history,
      }).success,
    ).toBe(false);
  });

  it('rejects empty, oversized, and unsafe identifiers', () => {
    expect(aiChatInputSchema.safeParse({ ...validInput, message: '   ' }).success).toBe(false);
    expect(
      aiChatInputSchema.safeParse({ ...validInput, message: 'x'.repeat(2001) }).success,
    ).toBe(false);
    expect(
      aiChatInputSchema.safeParse({ ...validInput, clientMessageId: '../escape' }).success,
    ).toBe(false);
  });
});

describe('server-derived context', () => {
  it('builds the model request from loaded server context', () => {
    const contents = buildChatContents(validInput.message, context, 'AppName');

    expect(contents).toHaveLength(3);
    expect(contents[0]).toEqual({
      role: 'model',
      parts: [{ text: 'Hi! How can I help?' }],
    });
    expect(contents[1]).toEqual({
      role: 'user',
      parts: [{ text: 'hello' }],
    });
    const finalText = contents[2]?.parts[0]?.text ?? '';
    expect(finalText).toContain('Eli');
    expect(finalText).toContain(
      '2400 kcal, 170g protein, 250g carbs, 70g fat (plan: Cut phase)',
    );
    expect(finalText).toContain('845 kcal, 52g protein, 90g carbs, 32g fat');
    expect(finalText).toContain('Greek yogurt · 320 kcal');
    expect(finalText.endsWith(validInput.message)).toBe(true);
  });
});

describe('handleAiChat', () => {
  it('persists one structured completed exchange', async () => {
    const completeExchange = vi.fn(async () => undefined);
    const enforceMessageCap = vi.fn(async () => undefined);
    const generateChat = vi.fn(
      async () =>
        'Raise protein today.\n{"action":{"field":"Protein","macro":"protein","old":170,"new":190}}',
    );

    const result = await handleAiChat(
      'user-1',
      validInput,
      deps({ completeExchange, enforceMessageCap, generateChat }),
    );

    expect(result).toEqual({
      threadId: 'thread-1',
      reply: 'Raise protein today.',
      action: {
        field: 'Protein',
        macro: 'protein',
        old: 170,
        new: 190,
      },
    });
    expect(generateChat).toHaveBeenCalledTimes(1);
    expect(completeExchange).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      validInput.clientMessageId,
      result,
    );
    expect(enforceMessageCap).toHaveBeenCalledWith('user-1', 'thread-1');
  });

  it('returns a completed retry without loading context or calling the model', async () => {
    const completed: AiChatResponse = {
      threadId: 'thread-1',
      reply: 'Persisted reply',
    };
    const loadContext = vi.fn(async () => context);
    const generateChat = vi.fn(async () => 'must not run');

    const result = await handleAiChat(
      'user-1',
      validInput,
      deps({
        claimExchange: async () => ({ status: 'completed', response: completed }),
        loadContext,
        generateChat,
      }),
    );

    expect(result).toEqual(completed);
    expect(loadContext).not.toHaveBeenCalled();
    expect(generateChat).not.toHaveBeenCalled();
  });

  it('rejects a concurrent duplicate before model inference', async () => {
    const generateChat = vi.fn(async () => 'must not run');
    await expect(
      handleAiChat(
        'user-1',
        validInput,
        deps({
          claimExchange: async () => ({ status: 'in_progress' }),
          generateChat,
        }),
      ),
    ).rejects.toBeInstanceOf(AiChatBusyError);
    expect(generateChat).not.toHaveBeenCalled();
  });

  it('marks a claimed exchange failed when inference throws', async () => {
    const failExchange = vi.fn(async () => undefined);
    await expect(
      handleAiChat(
        'user-1',
        validInput,
        deps({
          generateChat: async () => {
            throw new Error('provider down');
          },
          failExchange,
        }),
      ),
    ).rejects.toThrow('provider down');
    expect(failExchange).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      validInput.clientMessageId,
    );
  });

  it('rejects malformed payloads without claiming an exchange', async () => {
    const claimExchange = vi.fn();
    await expect(
      handleAiChat('user-1', { message: '' }, deps({ claimExchange })),
    ).rejects.toBeInstanceOf(AiChatInputError);
    expect(claimExchange).not.toHaveBeenCalled();
  });
});

describe('AiChatInputError carries sanitized Zod issues', () => {
  it('exposes issues as path/code pairs only, no private/raw fields', async () => {
    const claimExchange = vi.fn();
    const result = await handleAiChat(
      'user-1',
      { message: '   ', clientMessageId: 'msg_01VALID' },
      deps({ claimExchange }),
    ).catch((e) => e as AiChatInputError);

    expect(result).toBeInstanceOf(AiChatInputError);
    expect(result.issues).toBeDefined();
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);

    for (const issue of result.issues) {
      expect(Object.keys(issue).sort()).toEqual(['code', 'path'].sort());
      expect(typeof issue.path).toBe('string');
      expect(typeof issue.code).toBe('string');
      expect(issue).not.toHaveProperty('message');
      expect(issue).not.toHaveProperty('received');
      expect(issue).not.toHaveProperty('expected');
    }

    // Verify path points to the correct field
    expect(result.issues.some((i) => i.path === 'message')).toBe(true);
  });

  it('includes path/code for all validation failures including nested identifiers', async () => {
    const claimExchange = vi.fn();
    const result = await handleAiChat(
      'user-1',
      {
        message: 'valid message',
        clientMessageId: '../unsafe',
        threadId: 'also/unsafe',
      },
      deps({ claimExchange }),
    ).catch((e) => e as AiChatInputError);

    expect(result).toBeInstanceOf(AiChatInputError);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);

    const clientMsgIssue = result.issues.find((i) => i.path === 'clientMessageId');
    const threadIdIssue = result.issues.find((i) => i.path === 'threadId');
    expect(clientMsgIssue).toBeDefined();
    expect(threadIdIssue).toBeDefined();
    expect(clientMsgIssue?.code).toBeTruthy();
    expect(threadIdIssue?.code).toBeTruthy();
  });
});

describe('input validation: current vs obsolete payload', () => {
  it('accepts current payload with message, clientMessageId, optional threadId, linkedMealId', async () => {
    const claimExchange = vi.fn(async () => ({
      status: 'claimed' as const,
      threadId: 'thread-1',
    }));
    const generateChat = vi.fn(async () => 'Reply');

    await expect(
      handleAiChat(
        'user-1',
        {
          message: 'Hello',
          clientMessageId: 'msg_01VALID',
          threadId: 'thread-1',
          linkedMealId: 'meal-1',
        },
        deps({ claimExchange, generateChat }),
      ),
    ).resolves.toBeDefined();

    expect(claimExchange).toHaveBeenCalled();
    expect(generateChat).toHaveBeenCalled();
  });

  it('rejects obsolete history field', async () => {
    const claimExchange = vi.fn();
    const result = await handleAiChat(
      'user-1',
      {
        message: 'Hello',
        clientMessageId: 'msg_01VALID',
        history: [{ role: 'user', text: 'old' }],
      },
      deps({ claimExchange }),
    ).catch((e) => e as AiChatInputError);

    expect(result).toBeInstanceOf(AiChatInputError);
    expect(result.issues.some((i) => i.path === 'history')).toBe(true);
    expect(claimExchange).not.toHaveBeenCalled();
  });

  it('rejects obsolete plan field', async () => {
    const claimExchange = vi.fn();
    const result = await handleAiChat(
      'user-1',
      {
        message: 'Hello',
        clientMessageId: 'msg_01VALID',
        plan: { kcal: 2000, protein: 150, carbs: 200, fat: 65, planName: 'Test' },
      },
      deps({ claimExchange }),
    ).catch((e) => e as AiChatInputError);

    expect(result).toBeInstanceOf(AiChatInputError);
    expect(result.issues.some((i) => i.path === 'plan')).toBe(true);
    expect(claimExchange).not.toHaveBeenCalled();
  });

  it('rejects obsolete consumed field', async () => {
    const claimExchange = vi.fn();
    const result = await handleAiChat(
      'user-1',
      {
        message: 'Hello',
        clientMessageId: 'msg_01VALID',
        consumed: { kcal: 500, protein: 30, carbs: 50, fat: 15 },
      },
      deps({ claimExchange }),
    ).catch((e) => e as AiChatInputError);

    expect(result).toBeInstanceOf(AiChatInputError);
    expect(result.issues.some((i) => i.path === 'consumed')).toBe(true);
    expect(claimExchange).not.toHaveBeenCalled();
  });
});

describe('response and retention helpers', () => {
  it('parses only a valid structured target action', () => {
    expect(
      parseModelReply(
        'Do it.\n{"action":{"field":"Protein","macro":"protein","old":170,"new":190}}',
      ),
    ).toEqual({
      reply: 'Do it.',
      action: {
        field: 'Protein',
        macro: 'protein',
        old: 170,
        new: 190,
      },
    });
    expect(
      parseModelReply(
        'Unsafe.\n{"action":{"field":"Unknown","macro":"admin","old":0,"new":1}}',
      ),
    ).toEqual({ reply: 'Unsafe.' });
  });

  it('truncates titles at 60 Unicode code points without splitting emoji', () => {
    const title = truncateThreadTitle(`${'a'.repeat(59)}🧠tail`);
    expect(Array.from(title)).toHaveLength(60);
    expect(title.endsWith('🧠')).toBe(true);
  });

  it('selects only the oldest active messages beyond the 200-message cap', () => {
    const ids = Array.from({ length: 203 }, (_, index) => `m-${index}`);
    expect(selectMessagesToArchive(ids)).toEqual(['m-0', 'm-1', 'm-2']);
    expect(selectMessagesToArchive(ids.slice(0, 200))).toEqual([]);
  });
});
