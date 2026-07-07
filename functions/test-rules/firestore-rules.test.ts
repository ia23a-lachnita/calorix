import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';

let env: RulesTestEnvironment;

const OWNER = 'user-owner';
const OTHER = 'user-other';

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    uid: OWNER,
    date: '2026-07-07',
    status: 'pending',
    scanMode: 'meal',
    imageUrl: 'https://example.com/scan.jpg',
    ...overrides,
  };
}

const completeFields = {
  status: 'complete',
  foodName: 'Chicken Rice Bowl',
  kcal: 620,
  protein: 48,
  carbs: 72,
  fat: 16,
  confidence: 0.91,
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'calorix-rules-test',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function ownerDb() {
  return env.authenticatedContext(OWNER).firestore();
}

function otherDb() {
  return env.authenticatedContext(OTHER).firestore();
}

describe('entries', () => {
  it('lets the owner create a pending scan entry with a valid date', async () => {
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/e1`), validEntry()),
    );
  });

  it('lets the owner create a manual complete entry with full nutrition', async () => {
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/e2`), validEntry(completeFields)),
    );
  });

  it('rejects complete entries missing nutrition fields', async () => {
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/e3`),
        validEntry({ status: 'complete', foodName: 'Mystery' }),
      ),
    );
  });

  it('rejects invalid date keys and out-of-range values', async () => {
    await assertFails(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/e4`), validEntry({ date: '07/07/2026' })),
    );
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/e5`),
        validEntry({ ...completeFields, kcal: 60000 }),
      ),
    );
    await assertFails(
      setDoc(
        doc(ownerDb(), `users/${OWNER}/entries/e6`),
        validEntry({ ...completeFields, confidence: 1.5 }),
      ),
    );
  });

  it('rejects client-side server statuses on create', async () => {
    await assertFails(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/e7`), validEntry({ status: 'processing' })),
    );
    await assertFails(
      setDoc(doc(ownerDb(), `users/${OWNER}/entries/e8`), validEntry({ status: 'needs_review' })),
    );
  });

  it('blocks other users from reading or listing my entries (cross-user regression)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/entries/e1`), validEntry());
    });
    await assertFails(getDoc(doc(otherDb(), `users/${OWNER}/entries/e1`)));
    await assertFails(
      getDocs(query(collection(otherDb(), `users/${OWNER}/entries`), where('date', '==', '2026-07-07'))),
    );
  });

  it('allows confirming a review (needs_review -> complete) but not skipping analysis', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${OWNER}/entries/review1`),
        validEntry({ ...completeFields, status: 'needs_review', confidence: 0.6 }),
      );
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/entries/pend1`), validEntry());
    });
    await assertSucceeds(
      updateDoc(doc(ownerDb(), `users/${OWNER}/entries/review1`), { status: 'complete' }),
    );
    await assertFails(
      updateDoc(doc(ownerDb(), `users/${OWNER}/entries/pend1`), {
        ...completeFields,
      }),
    );
  });

  it('allows retrying a failed scan (error -> pending)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${OWNER}/entries/err1`),
        validEntry({ status: 'error', errorMessage: 'boom' }),
      );
    });
    await assertSucceeds(
      updateDoc(doc(ownerDb(), `users/${OWNER}/entries/err1`), { status: 'pending' }),
    );
  });

  it('lets the owner edit and delete complete entries', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `users/${OWNER}/entries/e9`),
        validEntry(completeFields),
      );
    });
    await assertSucceeds(
      updateDoc(doc(ownerDb(), `users/${OWNER}/entries/e9`), { kcal: 500 }),
    );
    await assertFails(
      updateDoc(doc(otherDb(), `users/${OWNER}/entries/e9`), { kcal: 1 }),
    );
    await assertSucceeds(deleteDoc(doc(ownerDb(), `users/${OWNER}/entries/e9`)));
  });
});

describe('dailyLogs', () => {
  it('is owner-readable but never client-writable', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/dailyLogs/2026-07-07`), {
        kcal: 845,
        protein: 74,
        carbs: 92,
        fat: 20,
        entryCount: 3,
        date: '2026-07-07',
      });
    });
    await assertSucceeds(getDoc(doc(ownerDb(), `users/${OWNER}/dailyLogs/2026-07-07`)));
    await assertFails(getDoc(doc(otherDb(), `users/${OWNER}/dailyLogs/2026-07-07`)));
    await assertFails(
      setDoc(doc(ownerDb(), `users/${OWNER}/dailyLogs/2026-07-07`), { kcal: 1 }),
    );
    await assertFails(deleteDoc(doc(ownerDb(), `users/${OWNER}/dailyLogs/2026-07-07`)));
  });
});

describe('owner-only subcollections', () => {
  it('targets, weightLogs and aiThreads are owner read/write', async () => {
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/targets/plan1`), { kcal: 2400 }),
    );
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/weightLogs/2026-07-07`), { weight: 80.4 }),
    );
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/aiThreads/t1`), { title: 'Macros' }),
    );
    await assertSucceeds(
      setDoc(doc(ownerDb(), `users/${OWNER}/aiThreads/t1/messages/m1`), { text: 'hi' }),
    );
    await assertFails(
      setDoc(doc(otherDb(), `users/${OWNER}/targets/plan1`), { kcal: 1 }),
    );
  });
});

describe('server-owned collections', () => {
  it('denies all client access to catalog, barcode index, and model configs', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'catalog_products/p1'), { canonicalName: 'X' });
      await setDoc(doc(ctx.firestore(), 'barcode_index/123'), { productId: 'p1' });
      await setDoc(doc(ctx.firestore(), 'model_configs/default'), { visionModel: 'm' });
    });
    await assertFails(getDoc(doc(ownerDb(), 'catalog_products/p1')));
    await assertFails(setDoc(doc(ownerDb(), 'catalog_products/p2'), { a: 1 }));
    await assertFails(getDoc(doc(ownerDb(), 'barcode_index/123')));
    await assertFails(setDoc(doc(ownerDb(), 'barcode_index/456'), { a: 1 }));
    await assertFails(getDoc(doc(ownerDb(), 'model_configs/default')));
    await assertFails(setDoc(doc(ownerDb(), 'model_configs/default'), { a: 1 }));
  });
});
