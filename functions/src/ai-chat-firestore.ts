import {
  FieldValue,
  Timestamp,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import {
  AiChatNotFoundError,
  aiChatActionSchema,
  selectMessagesToArchive,
  truncateThreadTitle,
  type AiChatContext,
  type AiChatDeps,
  type AiChatInput,
  type AiChatResponse,
  type ChatContent,
} from './ai-chat';
import type { ModelConfig } from './model-config';

const CLAIM_LEASE_MS = 2 * 60 * 1000;
const ARCHIVE_CHUNK_SIZE = 250;

interface FirestoreAiChatOptions {
  db: Firestore;
  getModelConfig(): Promise<ModelConfig>;
  generateChat(model: string, contents: ChatContent[]): Promise<string>;
  appDisplayName: string;
  nowMs?: () => number;
}

function responseFromSnapshot(
  threadId: string,
  data: Record<string, unknown>,
): AiChatResponse | null {
  const reply = data.content;
  if (typeof reply !== 'string' || reply.trim().length === 0) return null;
  const action = aiChatActionSchema.safeParse(data.action);
  return {
    threadId,
    reply,
    ...(action.success ? { action: action.data } : {}),
  };
}

function dateKeyForTimeZone(nowMs: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(nowMs));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) {
      return `${values.year}-${values.month}-${values.day}`;
    }
  } catch {
    // Invalid or absent profile timezone falls back to UTC.
  }
  return new Date(nowMs).toISOString().slice(0, 10);
}

function numberField(
  data: Record<string, unknown> | undefined,
  key: string,
  fallback = 0,
): number {
  const value = data?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringField(
  data: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = data?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function mealSummary(data: Record<string, unknown>): string {
  const name = stringField(data, 'foodName', 'Meal');
  const multiplier = numberField(data, 'servingMultiplier', 1);
  const kcal =
    numberField(data, 'baseKcal', numberField(data, 'kcal')) * multiplier;
  return `${name} · ${Math.round(kcal)} kcal`;
}

async function archiveDocuments(
  db: Firestore,
  threadPath: string,
  documents: QueryDocumentSnapshot[],
): Promise<void> {
  for (let offset = 0; offset < documents.length; offset += ARCHIVE_CHUNK_SIZE) {
    const batch = db.batch();
    for (const document of documents.slice(offset, offset + ARCHIVE_CHUNK_SIZE)) {
      const archiveRef = db.doc(`${threadPath}/messageArchive/${document.id}`);
      batch.set(archiveRef, {
        ...document.data(),
        archivedAt: FieldValue.serverTimestamp(),
      });
      batch.delete(document.ref);
    }
    await batch.commit();
  }
}

export function createFirestoreAiChatDeps(
  options: FirestoreAiChatOptions,
): AiChatDeps {
  const { db } = options;
  const nowMs = options.nowMs ?? Date.now;

  return {
    getModelConfig: options.getModelConfig,
    generateChat: options.generateChat,
    appDisplayName: options.appDisplayName,

    async claimExchange(uid: string, input: AiChatInput) {
      const threads = db.collection('users').doc(uid).collection('aiThreads');
      // A deterministic first-thread id makes retry of the very first send
      // idempotent even before the client has received a thread id.
      const threadId = input.threadId ?? input.clientMessageId;
      const threadRef = threads.doc(threadId);
      const userRef = threadRef.collection('messages').doc(input.clientMessageId);
      const replyRef = threadRef
        .collection('messages')
        .doc(`reply_${input.clientMessageId}`);
      const mealRef = input.linkedMealId
        ? db.collection('users').doc(uid).collection('entries').doc(input.linkedMealId)
        : null;

      return db.runTransaction(async (transaction) => {
        const [threadSnapshot, userSnapshot, replySnapshot, mealSnapshot] =
          await Promise.all([
            transaction.get(threadRef),
            transaction.get(userRef),
            transaction.get(replyRef),
            mealRef ? transaction.get(mealRef) : Promise.resolve(null),
          ]);

        if (input.threadId && !threadSnapshot.exists) {
          throw new AiChatNotFoundError('The requested conversation does not exist.');
        }

        if (replySnapshot.exists) {
          const response = responseFromSnapshot(threadId, replySnapshot.data() ?? {});
          if (response) return { status: 'completed' as const, response };
        }

        const now = Timestamp.fromMillis(nowMs());
        const existingUser = userSnapshot.data();
        const lease = existingUser?.claimExpiresAt;
        if (
          existingUser?.status === 'processing' &&
          lease instanceof Timestamp &&
          lease.toMillis() > now.toMillis()
        ) {
          return { status: 'in_progress' as const };
        }

        if (!threadSnapshot.exists) {
          transaction.create(threadRef, {
            uid,
            title: truncateThreadTitle(input.message),
            createdAt: now,
            updatedAt: now,
            ...(mealSnapshot?.exists && input.linkedMealId
              ? { linkedMealId: input.linkedMealId }
              : {}),
          });
        }

        transaction.set(
          userRef,
          {
            role: 'user',
            content: input.message,
            createdAt:
              existingUser?.createdAt instanceof Timestamp
                ? existingUser.createdAt
                : now,
            status: 'processing',
            claimExpiresAt: Timestamp.fromMillis(now.toMillis() + CLAIM_LEASE_MS),
            clientMessageId: input.clientMessageId,
          },
          { merge: true },
        );
        transaction.set(threadRef, { updatedAt: now }, { merge: true });
        return { status: 'claimed' as const, threadId };
      });
    },

    async loadContext(
      uid: string,
      threadId: string,
      clientMessageId: string,
    ): Promise<AiChatContext> {
      const userRef = db.collection('users').doc(uid);
      const threadRef = userRef.collection('aiThreads').doc(threadId);
      const [profileSnapshot, planSnapshot, historySnapshot, recentMealsSnapshot] =
        await Promise.all([
          userRef.get(),
          userRef
            .collection('targets')
            .where('isActive', '==', true)
            .limit(1)
            .get(),
          threadRef
            .collection('messages')
            .orderBy('createdAt', 'desc')
            .limit(13)
            .get(),
          userRef
            .collection('entries')
            .where('status', '==', 'complete')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get(),
        ]);

      const profile = profileSnapshot.data();
      const timeZone = stringField(profile, 'timeZone', 'UTC');
      const dailySnapshot = await userRef
        .collection('dailyLogs')
        .doc(dateKeyForTimeZone(nowMs(), timeZone))
        .get();
      const plan = planSnapshot.docs[0]?.data();
      const consumed = dailySnapshot.data();
      const history = historySnapshot.docs
        .filter((document) => document.id !== clientMessageId)
        .map((document) => document.data())
        .filter(
          (
            data,
          ): data is Record<string, unknown> & {
            role: 'user' | 'assistant';
            content: string;
          } =>
            (data.role === 'user' || data.role === 'assistant') &&
            typeof data.content === 'string' &&
            data.content.length > 0,
        )
        .reverse()
        .slice(-12)
        .map((data) => ({
          role: data.role === 'assistant' ? ('model' as const) : ('user' as const),
          text: data.content,
        }));

      return {
        profile: {
          ...(typeof profile?.displayName === 'string'
            ? { displayName: profile.displayName }
            : {}),
        },
        plan: {
          kcal: numberField(plan, 'kcal', 2400),
          protein: numberField(plan, 'protein', 170),
          carbs: numberField(plan, 'carbs', 250),
          fat: numberField(plan, 'fat', 70),
          planName: stringField(plan, 'planName', 'Custom'),
        },
        consumed: {
          kcal: numberField(consumed, 'kcal'),
          protein: numberField(consumed, 'protein'),
          carbs: numberField(consumed, 'carbs'),
          fat: numberField(consumed, 'fat'),
        },
        recentMeals: recentMealsSnapshot.docs.map((document) =>
          mealSummary(document.data()),
        ),
        history,
      };
    },

    async completeExchange(
      uid: string,
      threadId: string,
      clientMessageId: string,
      response: AiChatResponse,
    ) {
      const threadRef = db
        .collection('users')
        .doc(uid)
        .collection('aiThreads')
        .doc(threadId);
      const userRef = threadRef.collection('messages').doc(clientMessageId);
      const replyRef = threadRef
        .collection('messages')
        .doc(`reply_${clientMessageId}`);
      const batch = db.batch();
      batch.set(replyRef, {
        role: 'assistant',
        content: response.reply,
        createdAt: FieldValue.serverTimestamp(),
        status: 'complete',
        inReplyTo: clientMessageId,
        ...(response.action ? { action: response.action } : {}),
      });
      batch.set(
        userRef,
        {
          status: 'complete',
          claimExpiresAt: FieldValue.delete(),
        },
        { merge: true },
      );
      batch.set(
        threadRef,
        { updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      await batch.commit();
    },

    async failExchange(uid: string, threadId: string, clientMessageId: string) {
      await db
        .collection('users')
        .doc(uid)
        .collection('aiThreads')
        .doc(threadId)
        .collection('messages')
        .doc(clientMessageId)
        .set(
          {
            status: 'failed',
            claimExpiresAt: FieldValue.delete(),
          },
          { merge: true },
        );
    },

    async enforceMessageCap(uid: string, threadId: string) {
      const threadRef = db
        .collection('users')
        .doc(uid)
        .collection('aiThreads')
        .doc(threadId);
      const snapshot = await threadRef
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .get();
      const ids = selectMessagesToArchive(
        snapshot.docs.map((document) => document.id),
      );
      if (ids.length === 0) return;
      const selected = new Set(ids);
      await archiveDocuments(
        db,
        threadRef.path,
        snapshot.docs.filter((document) => selected.has(document.id)),
      );
    },
  };
}
