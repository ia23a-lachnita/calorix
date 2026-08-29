import { HttpsError } from 'firebase-functions/v2/https';
import type { AiChatDeps, AiChatResponse } from './ai-chat';
import {
  AiChatBusyError,
  AiChatInputError,
  AiChatNotFoundError,
  handleAiChat,
} from './ai-chat';

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface AiChatCallableLogger {
  log(entry: Record<string, unknown>): void;
}

export interface CreateAiChatCallableHandlerOptions {
  coreDeps: AiChatDeps;
  coreHandler?: (uid: string, data: unknown) => Promise<AiChatResponse>;
  logger: AiChatCallableLogger;
}

interface CallableRequestLike {
  auth?: { uid: string; token?: Record<string, unknown> } | null;
  data: unknown;
}

function isSafeCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID_RE.test(value);
}

function extractClientMessageId(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'clientMessageId' in data) {
    const id = (data as Record<string, unknown>).clientMessageId;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

export function createAiChatCallableHandler(
  options: CreateAiChatCallableHandlerOptions,
): (request: CallableRequestLike) => Promise<AiChatResponse> {
  const { coreDeps, coreHandler, logger } = options;
  const handler =
    coreHandler ??
    ((uid: string, data: unknown) => handleAiChat(uid, data, coreDeps));

  return async (request: CallableRequestLike): Promise<AiChatResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = request.auth.uid;
    const clientMessageId = extractClientMessageId(request.data);

    try {
      return await handler(uid, request.data);
    } catch (error) {
      if (error instanceof AiChatInputError) {
        const logEntry: Record<string, unknown> = {
          category: 'invalid_request',
          code: 'invalid-argument',
          errorName: 'AiChatInputError',
          issues: error.issues,
        };
        if (isSafeCorrelationId(clientMessageId)) {
          logEntry.correlationId = clientMessageId;
        }
        logger.log(logEntry);
        throw new HttpsError('invalid-argument', error.message);
      }
      if (error instanceof AiChatNotFoundError) {
        throw new HttpsError('not-found', error.message);
      }
      if (error instanceof AiChatBusyError) {
        throw new HttpsError('aborted', error.message);
      }

      const errorName =
        error instanceof Error ? error.constructor.name : 'Error';
      const logEntry: Record<string, unknown> = {
        category: 'provider_unavailable',
        code: 'unavailable',
        errorName,
      };

      if (isSafeCorrelationId(clientMessageId)) {
        logEntry.correlationId = clientMessageId;
      }

      logger.log(logEntry);

      const details: Record<string, unknown> = {};
      if (isSafeCorrelationId(clientMessageId)) {
        details.correlationId = clientMessageId;
      }

      throw new HttpsError(
        'unavailable',
        'The assistant is temporarily unavailable. Please try again.',
        Object.keys(details).length > 0 ? details : undefined,
      );
    }
  };
}
