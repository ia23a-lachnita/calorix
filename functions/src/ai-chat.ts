import { z } from 'zod';
import type { ModelConfig } from './model-config';

const macroShape = {
  kcal: z.number().finite().nonnegative().max(20000),
  protein: z.number().finite().nonnegative().max(2000),
  carbs: z.number().finite().nonnegative().max(2000),
  fat: z.number().finite().nonnegative().max(2000),
};

export const aiChatInputSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        text: z.string().min(1).max(4000),
      }),
    )
    .max(12)
    .default([]),
  plan: z.object({
    ...macroShape,
    planName: z.string().max(120).default('Custom'),
  }),
  consumed: z.object(macroShape),
});

export type AiChatInput = z.infer<typeof aiChatInputSchema>;

export interface ChatContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/** Raised for malformed client payloads; mapped to invalid-argument. */
export class AiChatInputError extends Error {}

export function buildChatSystemPrompt(
  input: AiChatInput,
  appDisplayName: string,
): string {
  const { plan, consumed } = input;
  return `You are ${appDisplayName} AI, an in-app nutrition coach. Be concise and practical.
Current daily targets: ${plan.kcal} kcal, ${plan.protein}g protein, ${plan.carbs}g carbs, ${plan.fat}g fat (plan: ${plan.planName}).
Consumed so far today: ${Math.round(consumed.kcal)} kcal, ${Math.round(consumed.protein)}g protein, ${Math.round(consumed.carbs)}g carbs, ${Math.round(consumed.fat)}g fat.
Answer in plain sentences; you may use **bold** for key numbers. No headings, no tables, at most four short bullet points.
If you recommend changing a single calorie or macro target, end your reply with exactly one line of JSON:
{"action":{"field":"Protein","macro":"protein","old":${plan.protein},"new":190}}
where "macro" is one of kcal, protein, carbs, fat. Otherwise do not output JSON.`;
}

/**
 * Replays prior turns as-is and merges the coaching context into the final
 * user turn, so the model always answers against current targets/intake.
 */
export function buildChatContents(
  input: AiChatInput,
  appDisplayName: string,
): ChatContent[] {
  const contents: ChatContent[] = input.history.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));
  contents.push({
    role: 'user',
    parts: [{ text: `${buildChatSystemPrompt(input, appDisplayName)}\n\n${input.message}` }],
  });
  return contents;
}

export interface AiChatDeps {
  getModelConfig(): Promise<ModelConfig>;
  generateChat(model: string, contents: ChatContent[]): Promise<string>;
  appDisplayName: string;
}

export async function handleAiChat(
  rawInput: unknown,
  deps: AiChatDeps,
): Promise<{ reply: string }> {
  const parsed = aiChatInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AiChatInputError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  const config = await deps.getModelConfig();
  const reply = await deps.generateChat(
    config.chatModel,
    buildChatContents(parsed.data, deps.appDisplayName),
  );
  const trimmed = reply.trim();
  if (trimmed.length === 0) {
    throw new Error('Empty model response');
  }
  return { reply: trimmed };
}
