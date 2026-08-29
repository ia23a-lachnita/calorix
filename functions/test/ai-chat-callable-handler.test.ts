import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import type { AiChatDeps, AiChatResponse } from '../src/ai-chat';
import { AiChatInputError } from '../src/ai-chat';
import { createAiChatCallableHandler } from '../src/ai-chat-callable';

const coreDeps = {} as AiChatDeps;

const anonymousAuth = {
  uid: 'anonymous-uid',
  token: { firebase: { sign_in_provider: 'anonymous' } },
};

function capturingLogger() {
  const entries: Array<Record<string, unknown>> = [];
  return {
    entries,
    logger: {
      log(entry: Record<string, unknown>) {
        entries.push(entry);
      },
    },
  };
}

async function expectHttpsError(run: () => Promise<unknown>): Promise<HttpsError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpsError);
    return error as HttpsError;
  }
  throw new Error('expected HttpsError');
}

describe('createAiChatCallableHandler', () => {
  it('anonymous auth-shaped request reaches injected coreHandler and returns its response', async () => {
    const calls: Array<{ uid: string; data: unknown }> = [];
    const response: AiChatResponse = {
      threadId: 'thread-1',
      reply: 'Reply from core handler',
    };
    const data = {
      message: 'Bump my protein, I train 5x per week now.',
      clientMessageId: 'msg_01JABCDEF0123456789',
    };
    const handler = createAiChatCallableHandler({
      coreDeps,
      coreHandler: async (uid, payload) => {
        calls.push({ uid, data: payload });
        return response;
      },
      logger: capturingLogger().logger,
    });

    const result = await handler({
      auth: anonymousAuth,
      data,
    });

    expect(result).toEqual(response);
    expect(calls).toEqual([{ uid: 'anonymous-uid', data }]);
  });

  it('missing auth rejects with HttpsError unauthenticated and does not call coreHandler', async () => {
    const calls: Array<{ uid: string; data: unknown }> = [];
    const handler = createAiChatCallableHandler({
      coreDeps,
      coreHandler: async (uid, payload) => {
        calls.push({ uid, data: payload });
        return { threadId: 'thread-1', reply: 'should not run' };
      },
      logger: capturingLogger().logger,
    });

    const error = await expectHttpsError(() =>
      handler({
        data: {
          message: 'hello',
          clientMessageId: 'msg_01MISSINGAUTH',
        },
      }),
    );

    expect(error.code).toBe('unauthenticated');
    expect(error.message).toBe('Authentication required.');
    expect(calls).toEqual([]);
  });

  it('unknown provider error maps to unavailable with exact safe log keys', async () => {
    const requestMessage = 'user-request-body-SHOULD-NOT-LOG';
    const providerSecret = 'provider-secret-SHOULD-NOT-LOG';
    const authToken = 'auth-token-SHOULD-NOT-LOG';
    const clientMessageId = 'msg_01SAFE_CORR';
    const { entries, logger } = capturingLogger();
    const handler = createAiChatCallableHandler({
      coreDeps,
      coreHandler: async () => {
        throw new Error(providerSecret);
      },
      logger,
    });

    const error = await expectHttpsError(() =>
      handler({
        auth: {
          uid: 'user-1',
          token: {
            firebase: { sign_in_provider: 'password' },
            raw: authToken,
          },
        },
        data: { message: requestMessage, clientMessageId },
      }),
    );

    expect(error.code).toBe('unavailable');
    expect(error.message).toBe(
      'The assistant is temporarily unavailable. Please try again.',
    );
    expect(error.details).toEqual({ correlationId: clientMessageId });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(Object.keys(entry ?? {}).sort()).toEqual(
      ['category', 'code', 'correlationId', 'errorName'].sort(),
    );
    expect(entry).toEqual({
      category: 'provider_unavailable',
      code: 'unavailable',
      correlationId: clientMessageId,
      errorName: 'Error',
    });

    const serialized = JSON.stringify({ details: error.details, logs: entries });
    expect(serialized).not.toContain(requestMessage);
    expect(serialized).not.toContain(providerSecret);
    expect(serialized).not.toContain(authToken);
    expect(serialized).not.toContain('password');
  });

  it('safe client ID may be correlation; unsafe or missing IDs are not echoed', async () => {
    const { entries, logger } = capturingLogger();
    const handler = createAiChatCallableHandler({
      coreDeps,
      coreHandler: async () => {
        throw new Error('provider down');
      },
      logger,
    });

    const safeId = 'msg_01SAFEID';
    const safeError = await expectHttpsError(() =>
      handler({
        auth: anonymousAuth,
        data: { message: 'hello', clientMessageId: safeId },
      }),
    );
    expect(safeError.details).toEqual({ correlationId: safeId });
    expect(JSON.stringify(entries)).toContain(safeId);

    entries.length = 0;
    const unsafeId = '../unsafe-id';
    const unsafeError = await expectHttpsError(() =>
      handler({
        auth: anonymousAuth,
        data: { message: 'hello', clientMessageId: unsafeId },
      }),
    );
    expect(JSON.stringify(unsafeError.details ?? {})).not.toContain(unsafeId);
    expect(JSON.stringify(entries)).not.toContain(unsafeId);

    entries.length = 0;
    const missingError = await expectHttpsError(() =>
      handler({
        auth: anonymousAuth,
        data: { message: 'hello' },
      }),
    );
    const missingDetails = JSON.stringify(missingError.details ?? {});
    const missingLogs = JSON.stringify(entries);
    expect(missingDetails).not.toMatch(/"correlationId"\s*:\s*(""|null)/);
    expect(missingLogs).not.toMatch(/"correlationId"\s*:\s*(""|null)/);
    expect(missingDetails).not.toContain('undefined');
    expect(missingLogs).not.toContain('undefined');
  });

  it('AiChatInputError logs structured invalid_request with sanitized issues and safe correlationId', async () => {
    const clientMessageId = 'msg_01SAFE_CORR';
    const { entries, logger } = capturingLogger();
    const inputError = new AiChatInputError('validation failed', [
      { path: 'message', code: 'too_small' },
      { path: 'clientMessageId', code: 'invalid_string' },
    ]);

    const handler = createAiChatCallableHandler({
      coreDeps,
      coreHandler: async () => {
        throw inputError;
      },
      logger,
    });

    const error = await expectHttpsError(() =>
      handler({
        auth: anonymousAuth,
        data: { message: '', clientMessageId },
      }),
    );

    expect(error.code).toBe('invalid-argument');
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(Object.keys(entry).sort()).toEqual(
      ['category', 'code', 'correlationId', 'errorName', 'issues'].sort(),
    );
    expect(entry).toEqual({
      category: 'invalid_request',
      code: 'invalid-argument',
      correlationId: clientMessageId,
      errorName: 'AiChatInputError',
      issues: [
        { path: 'message', code: 'too_small' },
        { path: 'clientMessageId', code: 'invalid_string' },
      ],
    });
  });

  it('AiChatInputError with unsafe correlationId logs without correlationId', async () => {
    const unsafeId = '../unsafe-id';
    const { entries, logger } = capturingLogger();
    const inputError = new AiChatInputError('validation failed', [
      { path: 'message', code: 'too_small' },
    ]);

    const handler = createAiChatCallableHandler({
      coreDeps,
      coreHandler: async () => {
        throw inputError;
      },
      logger,
    });

    const error = await expectHttpsError(() =>
      handler({
        auth: anonymousAuth,
        data: { message: '', clientMessageId: unsafeId },
      }),
    );

    expect(error.code).toBe('invalid-argument');
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.category).toBe('invalid_request');
    expect(entry.code).toBe('invalid-argument');
    expect(entry).not.toHaveProperty('correlationId');
    expect(entry.errorName).toBe('AiChatInputError');
    expect(entry.issues).toEqual([{ path: 'message', code: 'too_small' }]);
  });
});
