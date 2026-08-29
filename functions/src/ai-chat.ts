import { z } from 'zod';
import type { ModelConfig } from './model-config';

const documentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'must be a safe document identifier');

export const aiChatInputSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    clientMessageId: documentIdSchema,
    threadId: documentIdSchema.optional(),
    linkedMealId: documentIdSchema.optional(),
  })
  .strict();

export type AiChatInput = z.infer<typeof aiChatInputSchema>;

export const aiChatActionSchema = z
  .object({
    field: z.string().trim().min(1).max(40),
    macro: z.enum(['kcal', 'protein', 'carbs', 'fat']),
    old: z.number().int().nonnegative().max(20000),
    new: z.number().int().positive().max(20000),
  })
  .superRefine((action, ctx) => {
    if (action.macro !== 'kcal' && (action.old > 2000 || action.new > 2000)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'macro gram values must not exceed 2000',
      });
    }
  });

export type AiChatAction = z.infer<typeof aiChatActionSchema>;

export interface AiChatResponse {
  threadId: string;
  reply: string;
  action?: AiChatAction;
}

export interface ChatContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface AiChatContext {
  profile: { displayName?: string };
  plan: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    planName: string;
  };
  consumed: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  recentMeals: string[];
  history: Array<{ role: 'user' | 'model'; text: string }>;
}

export type ExchangeClaim =
  | { status: 'claimed'; threadId: string }
  | { status: 'completed'; response: AiChatResponse }
  | { status: 'in_progress' };

export interface AiChatDeps {
  getModelConfig(): Promise<ModelConfig>;
  generateChat(model: string, contents: ChatContent[]): Promise<string>;
  appDisplayName: string;
  claimExchange(uid: string, input: AiChatInput): Promise<ExchangeClaim>;
  loadContext(
    uid: string,
    threadId: string,
    clientMessageId: string,
  ): Promise<AiChatContext>;
  completeExchange(
    uid: string,
    threadId: string,
    clientMessageId: string,
    response: AiChatResponse,
  ): Promise<void>;
  failExchange(uid: string, threadId: string, clientMessageId: string): Promise<void>;
  enforceMessageCap(uid: string, threadId: string): Promise<void>;
}

export interface AiChatInputIssue {
  readonly path: string;
  readonly code: string;
}

/** Raised for malformed client payloads; mapped to invalid-argument. */
export class AiChatInputError extends Error {
  readonly issues: readonly AiChatInputIssue[];

  constructor(message: string, issues: readonly AiChatInputIssue[] = []) {
    super(message);
    this.name = 'AiChatInputError';
    this.issues = issues;
  }
}

function sanitizeZodIssues(issues: z.ZodIssue[]): AiChatInputIssue[] {
  const sanitized: AiChatInputIssue[] = [];
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        sanitized.push({
          path: [...issue.path, key].map(String).join('.'),
          code: issue.code,
        });
      }
    } else {
      sanitized.push({
        path: issue.path.map(String).join('.'),
        code: issue.code,
      });
    }
  }
  return sanitized;
}

/** Raised while another invocation owns the same idempotency key. */
export class AiChatBusyError extends Error {}

/** Raised when a requested thread does not exist for the authenticated user. */
export class AiChatNotFoundError extends Error {}

export function truncateThreadTitle(message: string): string {
  return Array.from(message.trim()).slice(0, 60).join('');
}

export function selectMessagesToArchive(
  oldestFirstIds: string[],
  cap = 200,
): string[] {
  return oldestFirstIds.slice(0, Math.max(0, oldestFirstIds.length - cap));
}

export function buildChatSystemPrompt(
  context: AiChatContext,
  appDisplayName: string,
): string {
  const { plan, consumed } = context;
  const profileLine = context.profile.displayName
    ? `User display name: ${context.profile.displayName}.`
    : 'User display name is unavailable.';
  const mealsLine =
    context.recentMeals.length > 0
      ? `Recent complete meals: ${context.recentMeals.join('; ')}.`
      : 'No recent complete meals are available.';
  return `You are ${appDisplayName} AI, an in-app nutrition coach. Be concise and practical.
${profileLine}
Current daily targets: ${plan.kcal} kcal, ${plan.protein}g protein, ${plan.carbs}g carbs, ${plan.fat}g fat (plan: ${plan.planName}).
Consumed so far today: ${Math.round(consumed.kcal)} kcal, ${Math.round(consumed.protein)}g protein, ${Math.round(consumed.carbs)}g carbs, ${Math.round(consumed.fat)}g fat.
${mealsLine}
Answer in plain sentences; you may use **bold** for key numbers. No headings, no tables, at most four short bullet points.
If you recommend changing one calorie or macro target, end the reply with exactly one JSON line:
{"action":{"field":"Protein","macro":"protein","old":${plan.protein},"new":190}}
where macro is one of kcal, protein, carbs, fat. Otherwise do not output JSON.`;
}

export function buildChatContents(
  message: string,
  context: AiChatContext,
  appDisplayName: string,
): ChatContent[] {
  const contents: ChatContent[] = context.history.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));
  contents.push({
    role: 'user',
    parts: [{ text: `${buildChatSystemPrompt(context, appDisplayName)}\n\n${message}` }],
  });
  return contents;
}

const trailingActionPattern = /\s*(\{"action":\{[\s\S]*\}\})\s*$/;

export function parseModelReply(raw: string): Omit<AiChatResponse, 'threadId'> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new Error('Empty model response');

  const match = trailingActionPattern.exec(trimmed);
  if (!match) return { reply: trimmed };

  const reply = trimmed.slice(0, match.index).trim();
  try {
    const parsed = z
      .object({ action: aiChatActionSchema })
      .strict()
      .safeParse(JSON.parse(match[1] ?? ''));
    if (!parsed.success) return { reply: reply || 'Here is my recommendation.' };
    return {
      reply: reply || 'Here is a suggested change.',
      action: parsed.data.action,
    };
  } catch {
    return { reply: reply || trimmed };
  }
}

export async function handleAiChat(
  uid: string,
  rawInput: unknown,
  deps: AiChatDeps,
): Promise<AiChatResponse> {
  const parsed = aiChatInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AiChatInputError(
      'Request payload is invalid',
      sanitizeZodIssues(parsed.error.issues),
    );
  }

  const input = parsed.data;
  const claim = await deps.claimExchange(uid, input);
  if (claim.status === 'completed') return claim.response;
  if (claim.status === 'in_progress') {
    throw new AiChatBusyError('This message is already being processed.');
  }

  try {
    const [config, context] = await Promise.all([
      deps.getModelConfig(),
      deps.loadContext(uid, claim.threadId, input.clientMessageId),
    ]);
    const rawReply = await deps.generateChat(
      config.chatModel,
      buildChatContents(input.message, context, deps.appDisplayName),
    );
    const parsedReply = parseModelReply(rawReply);
    const response: AiChatResponse = {
      threadId: claim.threadId,
      reply: parsedReply.reply,
      ...(parsedReply.action ? { action: parsedReply.action } : {}),
    };
    await deps.completeExchange(
      uid,
      claim.threadId,
      input.clientMessageId,
      response,
    );
    await deps.enforceMessageCap(uid, claim.threadId);
    return response;
  } catch (error) {
    await deps
      .failExchange(uid, claim.threadId, input.clientMessageId)
      .catch(() => undefined);
    throw error;
  }
}
