import { randomUUID } from 'node:crypto';
import * as logger from 'firebase-functions/logger';
import { HttpsError } from 'firebase-functions/v2/https';
import { inferTier1, Tier1InferenceFailure, type Tier1Estimate } from './tier1-analysis';

export const MAX_PHOTO_BYTES=4*1024*1024;
export function validateTier1Photo(data:unknown):string {
  if(!data||typeof data!=='object'||(data as Record<string,unknown>).cloudConsent!=='tier1-v1')throw new HttpsError('permission-denied','Confirm cloud photo processing first.');
  const encoded=(data as Record<string,unknown>).imageBase64;
  if(typeof encoded!=='string'||encoded.length>Math.ceil(MAX_PHOTO_BYTES/3)*4||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new HttpsError('invalid-argument','A JPEG photo up to 4 MiB is required.');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64')!==encoded||bytes.length<8||bytes.length>MAX_PHOTO_BYTES||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw new HttpsError('invalid-argument','Invalid JPEG photo.');
  return encoded;
}
export function createTier1Handler(infer:(image:string)=>Promise<Tier1Estimate>=inferTier1) {
  return async (request: {auth?: {uid: string} | null; data: unknown}): Promise<Tier1Estimate> => {
    const started = Date.now();
    function reject(stage: 'auth' | 'consent' | 'input' | 'inference', category: string,
                    code: HttpsError['code'], message: string): never {
      const reference = randomUUID();
      const fields = {stage, failureCategory: category, reference, elapsedMs: Math.max(0, Date.now() - started)};
      // Exceptions from the provider can contain the entire request. Log only these fields.
      if (code === 'unavailable') logger.error('tier1_analysis_failed', fields);
      else logger.info('tier1_analysis_failed', fields);
      throw new HttpsError(code, message, {failureCategory: category, reference});
    }
    if (!request.auth?.uid) {
      reject('auth', 'unauthenticated', 'unauthenticated', 'Sign in for optional cloud analysis.');
    }
    let photo: string;
    try {
      photo = validateTier1Photo(request.data);
    } catch (error) {
      if (error instanceof HttpsError && error.code === 'permission-denied') {
        return reject('consent', 'consent_required', error.code, error.message);
      }
      return reject('input', 'invalid_photo', 'invalid-argument', 'Invalid JPEG photo.');
    }
    try {
      return await infer(photo);
    } catch (error) {
      if (error instanceof Tier1InferenceFailure) {
        return reject('inference', 'no_food', 'failed-precondition',
          'No food could be estimated. Retake the photo or enter the meal manually.');
      }
      const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
      const category = typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
        ? `http_${status}` : 'inference_failure';
      return reject('inference', category, 'unavailable',
        'Photo analysis failed. Your photo stays on this phone; edit the meal manually or try again.');
    }
  };
}
