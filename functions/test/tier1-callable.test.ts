import { expect, it } from 'vitest';
import { createTier1Handler } from '../src/tier1-callable';

const jpg=Buffer.from([255,216,255,224,0,2,255,217]).toString('base64');
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
