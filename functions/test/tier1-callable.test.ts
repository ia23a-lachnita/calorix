import { expect, it, vi } from 'vitest';
import * as logger from 'firebase-functions/logger';
import { Tier1InferenceFailure, type Tier1Estimate } from '../src/tier1-analysis';

vi.mock('firebase-functions/logger', () => ({info:vi.fn(),error:vi.fn()}));
import { createTier1Handler } from '../src/tier1-callable';
import { validateTier1Photo } from '../src/tier1-callable';

const jpg=Buffer.from([255,216,255,224,0,2,255,217]).toString('base64');
it('accepts a bounded large JPEG envelope without regex stack failure', () => {
  const image=Buffer.alloc(1024*1024,0);
  image.set([255,216,255]);image.set([255,217],image.length-2);
  const encoded=image.toString('base64');
  expect(validateTier1Photo({cloudConsent:'tier1-v1',imageBase64:encoded})).toBe(encoded);
});
it('requires auth and explicit versioned photo consent before invoking model', async () => {
  let calls=0;
  const handle=createTier1Handler(async () => {calls++; throw new Error('model unavailable');});
  await expect(handle({auth:null,data:{}})).rejects.toMatchObject({code:'unauthenticated'});
  await expect(handle({auth:{uid:'test'},data:{imageBase64:jpg}})).rejects.toMatchObject({code:'permission-denied'});
  await expect(handle({auth:{uid:'test'},data:{cloudConsent:'tier1-v1',imageBase64:'bad'}})).rejects.toMatchObject({code:'invalid-argument'});
  expect(calls).toBe(0);
  await expect(handle({auth:{uid:'test'},data:{cloudConsent:'tier1-v1',imageBase64:jpg}})).rejects.toMatchObject({code:'unavailable'});
  expect(calls).toBe(1);
});


const authorized = {auth:{uid:'private-user'}, data:{cloudConsent:'tier1-v1',imageBase64:jpg}};
it.each([
  [null, 'unauthenticated', 'auth', 'info'],
  [{auth:authorized.auth,data:{}}, 'consent_required', 'consent', 'info'],
  [{auth:authorized.auth,data:{cloudConsent:'tier1-v1',imageBase64:'private-invalid'}}, 'invalid_photo', 'input', 'info'],
  [new Tier1InferenceFailure('no_food'), 'no_food', 'inference', 'info'],
  [Object.assign(new Error('private-provider-text'),{status:429}), 'http_429', 'inference', 'error'],
  [Object.assign(new Error('private-provider-text'),{status:6.5}), 'inference_failure', 'inference', 'error'],
] as const)('records a redacted and correlated rejection %s', async (failure, category, stage, severity) => {
  vi.clearAllMocks();
  const handle=createTier1Handler(async () => {throw failure;});
  const request=failure instanceof Error ? authorized : failure ?? {auth:null,data:{}};
  const err=await handle(request).catch((error:unknown)=>error);
  const log=vi.mocked(logger[severity]).mock.calls;
  expect(log).toHaveLength(1);
  expect(vi.mocked(logger[severity==='info'?'error':'info'])).not.toHaveBeenCalled();
  const fields=log[0][1] as Record<string,unknown>;
  expect(log[0]).toEqual(['tier1_analysis_failed',{
    stage, failureCategory:category, reference:expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/),
    elapsedMs:expect.any(Number)
  }]);
  expect(Number.isSafeInteger(fields.elapsedMs)).toBe(true);
  expect(fields.elapsedMs).toBeGreaterThanOrEqual(0);
  expect(err).toMatchObject({details:{failureCategory:category,reference:fields.reference}});
  expect(JSON.stringify([log,err])).not.toContain('private-');
});

it('leaves successful estimates untouched and emits no failure event',async()=>{
  vi.clearAllMocks();
  const result={} as Tier1Estimate;
  expect(await createTier1Handler(async()=>result)(authorized)).toBe(result);
  expect(logger.info).not.toHaveBeenCalled();
  expect(logger.error).not.toHaveBeenCalled();
});
