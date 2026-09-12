import { describe, expect, it, vi } from 'vitest';
import * as offClient from '../src/off-client';

const { fetchOffProduct } = offClient;

async function expectProviderRequestFailure(
  request: Promise<unknown>,
  forbiddenDiagnostics: readonly string[],
): Promise<void> {
  const error = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  const providerError = Reflect.get(offClient, 'OffProviderError');

  expect(error).toMatchObject({
    name: 'OffProviderError',
    code: 'provider_request_failed',
  });
  expect(String(error)).toBe('OffProviderError: Open Food Facts provider request failed');
  expect(error).not.toHaveProperty('cause');
  const serialized = JSON.stringify(error);
  for (const diagnostic of forbiddenDiagnostics) {
    expect(String(error)).not.toContain(diagnostic);
    expect(serialized).not.toContain(diagnostic);
  }
  expect(providerError).toBeTypeOf('function');
  if (typeof providerError === 'function') {
    expect(error).toBeInstanceOf(providerError as typeof Error);
  }
}

const foundPayload = {
  status: 'success',
  result: { id: 'product_found' },
  product: {
    code: '3017624010701',
    product_name: 'Nutella',
    quantity: '400 g',
    product_quantity: 400,
    product_quantity_unit: 'g',
    serving_size: '15 g',
    serving_quantity: 15,
    serving_quantity_unit: 'g',
    nutrition_data_per: '100g',
    nutriments: {
      'energy-kcal_100g': 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      'energy-kcal_serving': 80.85,
      proteins_serving: 0.945,
      carbohydrates_serving: 8.625,
      fat_serving: 4.635,
    },
  },
};

describe('fetchOffProduct', () => {
  it('requests only the approved v3 fields and parses package/reference nutrition', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify(foundPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const product = await fetchOffProduct('3017624010701', { fetchFn });

    expect(product).toMatchObject({
      name: 'Nutella',
      barcode: '3017624010701',
      rawQuantity: '400 g',
      kcalPer100g: 539,
      proteinPer100g: 6.3,
      carbsPer100g: 57.5,
      fatPer100g: 30.9,
      per100Reference: {
        kcal: 539,
        proteinG: 6.3,
        carbsG: 57.5,
        fatG: 30.9,
        amount: 100,
        unit: 'g',
      },
      servingReference: {
        kcal: 80.85,
        proteinG: 0.945,
        carbsG: 8.625,
        fatG: 4.635,
        amount: 15,
        unit: 'g',
      },
      productQuantity: { amount: 400, unit: 'g' },
      nutritionDataPer: '100g',
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    const parsedUrl = new URL(String(url));
    expect(parsedUrl.pathname).toBe('/api/v3/product/3017624010701');
    expect(parsedUrl.searchParams.get('fields')?.split(',').sort()).toEqual([
      'code',
      'nutriments',
      'nutrition_data_per',
      'product_name',
      'product_quantity',
      'product_quantity_unit',
      'quantity',
      'serving_quantity',
      'serving_quantity_unit',
      'serving_size',
    ].sort());
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('user-agent')).toContain('Calorix');
  });

  it('preserves finite decimal nutrients without rounding', async () => {
    const decimalPayload = {
      ...foundPayload,
      product: {
        ...foundPayload.product,
        nutriments: {
          ...foundPayload.product.nutriments,
          'energy-kcal_100g': 17.125,
          proteins_100g: 0.0075,
          carbohydrates_100g: 4.205,
          fat_100g: 0.00125,
        },
      },
    };
    const product = await fetchOffProduct('3017624010701', {
      fetchFn: async () =>
        new Response(JSON.stringify(decimalPayload), { status: 200 }),
    });

    expect(product?.per100Reference).toEqual({
      kcal: 17.125,
      proteinG: 0.0075,
      carbsG: 4.205,
      fatG: 0.00125,
      amount: 100,
      unit: 'g',
    });
  });

  it('uses the product quantity unit for a liquid per-100 reference', async () => {
    const liquidPayload = {
      ...foundPayload,
      product: {
        ...foundPayload.product,
        quantity: '500 ml',
        product_quantity: 500,
        product_quantity_unit: 'ml',
        nutriments: {
          ...foundPayload.product.nutriments,
          'energy-kcal_100g': 17.125,
          proteins_100g: 0.0075,
          carbohydrates_100g: 4.205,
          fat_100g: 0.00125,
        },
      },
    };

    const product = await fetchOffProduct('3017624010701', {
      fetchFn: async () => new Response(JSON.stringify(liquidPayload), { status: 200 }),
    });

    expect(product?.per100Reference).toEqual({
      kcal: 17.125,
      proteinG: 0.0075,
      carbsG: 4.205,
      fatG: 0.00125,
      amount: 100,
      unit: 'ml',
    });
  });

  it('retains valid nutrition when the package unit is unsupported for normalization', async () => {
    const unsupportedUnitPayload = {
      ...foundPayload,
      product: {
        ...foundPayload.product,
        quantity: '16 oz',
        product_quantity: 16,
        product_quantity_unit: 'oz',
      },
    };

    const product = await fetchOffProduct('3017624010701', {
      fetchFn: async () =>
        new Response(JSON.stringify(unsupportedUnitPayload), { status: 200 }),
    });

    expect(product).toMatchObject({
      name: 'Nutella',
      rawQuantity: '16 oz',
      productQuantityIssue: 'unsupported_unit',
      per100Reference: {
        kcal: 539,
        proteinG: 6.3,
        carbsG: 57.5,
        fatG: 30.9,
        amount: 100,
        unit: 'g',
      },
    });
    expect(product).not.toHaveProperty('productQuantity');
  });

  it.each([0, -1, Number.NaN, Infinity, 'not-a-number'])(
    'preserves invalid structured quantity state for %p',
    async (productQuantity) => {
      const invalidQuantityPayload = {
        ...foundPayload,
        product: {
          ...foundPayload.product,
          quantity: '500 ml',
          product_quantity: productQuantity,
          product_quantity_unit: 'ml',
        },
      };

      const product = await fetchOffProduct('3017624010701', {
        fetchFn: async () =>
          new Response(JSON.stringify(invalidQuantityPayload), { status: 200 }),
      });

      expect(product).toMatchObject({
        rawQuantity: '500 ml',
        productQuantityIssue: 'invalid',
        per100Reference: { amount: 100, unit: 'ml' },
      });
      expect(product).not.toHaveProperty('productQuantity');
    },
  );

  it('keeps genuinely absent package quantity distinct from a rejected structured value', async () => {
    const absentQuantityPayload = {
      ...foundPayload,
      product: {
        ...foundPayload.product,
        quantity: undefined,
        product_quantity: undefined,
        product_quantity_unit: undefined,
      },
    };

    const product = await fetchOffProduct('3017624010701', {
      fetchFn: async () =>
        new Response(JSON.stringify(absentQuantityPayload), { status: 200 }),
    });

    expect(product).toMatchObject({
      name: 'Nutella',
      per100Reference: { amount: 100, unit: 'g' },
    });
    expect(product).not.toHaveProperty('rawQuantity');
    expect(product).not.toHaveProperty('productQuantity');
    expect(product).not.toHaveProperty('productQuantityIssue');
  });

  it.each([
    { product_quantity: 400, product_quantity_unit: undefined },
    { product_quantity: undefined, product_quantity_unit: 'g' },
  ])('marks partial structured quantity evidence invalid', async (partialQuantity) => {
    const partialQuantityPayload = {
      ...foundPayload,
      product: {
        ...foundPayload.product,
        ...partialQuantity,
      },
    };

    const product = await fetchOffProduct('3017624010701', {
      fetchFn: async () =>
        new Response(JSON.stringify(partialQuantityPayload), { status: 200 }),
    });

    expect(product).toMatchObject({
      rawQuantity: '400 g',
      productQuantityIssue: 'invalid',
      per100Reference: { amount: 100, unit: 'g' },
    });
    expect(product).not.toHaveProperty('productQuantity');
  });

  it('omits malformed optional serving metadata without rejecting valid per-100 nutrition', async () => {
    const payloadWithInvalidServing = {
      ...foundPayload,
      product: {
        ...foundPayload.product,
        serving_quantity: 0,
        serving_quantity_unit: 'g',
        nutriments: {
          ...foundPayload.product.nutriments,
          'energy-kcal_serving': 'not-a-number',
        },
      },
    };

    const product = await fetchOffProduct('3017624010701', {
      fetchFn: async () =>
        new Response(JSON.stringify(payloadWithInvalidServing), { status: 200 }),
    });

    expect(product).toMatchObject({
      name: 'Nutella',
      productQuantity: { amount: 400, unit: 'g' },
      per100Reference: { kcal: 539, amount: 100, unit: 'g' },
    });
    expect(product).not.toHaveProperty('servingReference');
  });

  it('omits incomplete optional serving metadata without rejecting valid per-100 nutrition', async () => {
    const payloadWithIncompleteServing = {
      ...foundPayload,
      product: {
        ...foundPayload.product,
        serving_quantity_unit: undefined,
      },
    };

    const product = await fetchOffProduct('3017624010701', {
      fetchFn: async () =>
        new Response(JSON.stringify(payloadWithIncompleteServing), { status: 200 }),
    });

    expect(product).toMatchObject({
      name: 'Nutella',
      productQuantity: { amount: 400, unit: 'g' },
      per100Reference: { kcal: 539, amount: 100, unit: 'g' },
    });
    expect(product).not.toHaveProperty('servingReference');
  });

  it('returns null for an exact HTTP 404', async () => {
    vi.useFakeTimers();
    try {
      await expect(fetchOffProduct('3017624010701', {
        fetchFn: async () => new Response('', { status: 404 }),
      })).resolves.toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null for a parseable OFF product_not_found payload', async () => {
    await expect(fetchOffProduct('3017624010701', {
      fetchFn: async () => new Response(
        JSON.stringify({ status: 'failure', result: { id: 'product_not_found' } }),
        { status: 200 },
      ),
    })).resolves.toBeNull();
  });

  it('throws the provider error for a recognized 2xx rate_limited failure envelope and clears its timer', async () => {
    const rateLimitedBody = JSON.stringify({
      status: 'failure',
      result: {
        id: 'rate_limited',
        message: 'retry https://private.example/off?token=secret',
      },
    });
    vi.useFakeTimers();
    try {
      const request = fetchOffProduct('3017624010701', {
        fetchFn: async () => new Response(rateLimitedBody, { status: 200 }),
      });
      const providerFailure = expectProviderRequestFailure(request, [
        rateLimitedBody,
        'rate_limited',
        'https://private.example/off?token=secret',
        'token=secret',
      ]);

      await providerFailure;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    new Response(JSON.stringify({ ...foundPayload, product: { product_name: 'Bad', nutriments: { fat_100g: 'NaN' } } })),
    new Response(JSON.stringify({
      ...foundPayload,
      product: {
        ...foundPayload.product,
        nutriments: { ...foundPayload.product.nutriments, 'energy-kcal_100g': 'Infinity' },
      },
    })),
    new Response(JSON.stringify({
      ...foundPayload,
      product: {
        ...foundPayload.product,
        nutriments: { ...foundPayload.product.nutriments, proteins_100g: -0.001 },
      },
    })),
    new Response(JSON.stringify({
      ...foundPayload,
      product: {
        ...foundPayload.product,
        nutriments: { ...foundPayload.product.nutriments, fat_100g: Number.NaN },
      },
    })),
  ])('returns null for malformed successful product payloads', async (response) => {
    expect(
      await fetchOffProduct('3017624010701', {
        fetchFn: async () => response,
      }),
    ).toBeNull();
  });

  it('throws an exported privacy-safe provider error for a transport rejection', async () => {
    const transportDetail = 'transport ECONNRESET at https://private.example/off?token=secret';

    const request = fetchOffProduct('3017624010701', {
      fetchFn: async () => { throw new Error(transportDetail); },
    });

    await expectProviderRequestFailure(request, [
      transportDetail,
      'ECONNRESET',
      'https://private.example/off?token=secret',
      'token=secret',
    ]);
  });

  it('throws the provider error after timeout and cleans up its timer', async () => {
    vi.useFakeTimers();
    try {
      const request = fetchOffProduct('3017624010701', {
        timeoutMs: 1,
        fetchFn: (_, init) =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error(
              'abort timeout at https://private.example/off?token=secret',
            )));
          }),
      });
      const providerFailure = expectProviderRequestFailure(request, [
        'abort timeout at https://private.example/off?token=secret',
        'abort timeout',
        'https://private.example/off?token=secret',
        'token=secret',
      ]);

      await vi.advanceTimersByTimeAsync(1);
      await providerFailure;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cleans up its timer after a successful product response', async () => {
    vi.useFakeTimers();
    try {
      await expect(fetchOffProduct('3017624010701', {
        fetchFn: async () => new Response(JSON.stringify(foundPayload), { status: 200 }),
      })).resolves.toMatchObject({ name: 'Nutella', barcode: '3017624010701' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([429, 500, 503])('throws the provider error for HTTP %i without exposing its body', async (status) => {
    const providerBody = `HTTP ${status} at https://private.example/off?token=secret; provider body=raw-detail`;
    vi.useFakeTimers();
    try {
      const request = fetchOffProduct('3017624010701', {
        fetchFn: async () => new Response(providerBody, { status }),
      });

      await expectProviderRequestFailure(request, [
        providerBody,
        `HTTP ${status}`,
        'https://private.example/off?token=secret',
        'token=secret',
        'raw-detail',
      ]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects non-barcode input without making a request', async () => {
    const fetchFn = vi.fn();
    expect(await fetchOffProduct('../bad', { fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
