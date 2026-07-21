import { describe, expect, it, vi } from 'vitest';
import { fetchOffProduct } from '../src/off-client';

const foundPayload = {
  status: 'success',
  result: { id: 'product_found' },
  product: {
    product_name: 'Nutella',
    nutriments: {
      'energy-kcal_100g': 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
    },
  },
};

describe('fetchOffProduct', () => {
  it('uses the current v3 GET contract and parses per-100g nutrition', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify(foundPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const product = await fetchOffProduct('3017624010701', { fetchFn });

    expect(product).toEqual({
      name: 'Nutella',
      kcalPer100g: 539,
      proteinPer100g: 6.3,
      carbsPer100g: 57.5,
      fatPer100g: 30.9,
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toContain('/api/v3/product/3017624010701');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('user-agent')).toContain('Calorix');
  });

  it.each([
    new Response('', { status: 404 }),
    new Response(JSON.stringify({ status: 'failure', result: { id: 'product_not_found' } })),
    new Response(JSON.stringify({ ...foundPayload, product: { product_name: 'Bad', nutriments: { fat_100g: 'NaN' } } })),
  ])('returns null for non-successful or malformed responses', async (response) => {
    expect(
      await fetchOffProduct('3017624010701', {
        fetchFn: async () => response,
      }),
    ).toBeNull();
  });

  it('returns null on transport failure and abort timeout', async () => {
    expect(
      await fetchOffProduct('3017624010701', {
        fetchFn: async () => {
          throw new Error('offline');
        },
      }),
    ).toBeNull();

    expect(
      await fetchOffProduct('3017624010701', {
        timeoutMs: 1,
        fetchFn: (_, init) =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      }),
    ).toBeNull();
  });

  it('rejects non-barcode input without making a request', async () => {
    const fetchFn = vi.fn();
    expect(await fetchOffProduct('../bad', { fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
