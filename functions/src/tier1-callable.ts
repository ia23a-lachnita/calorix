import { HttpsError } from 'firebase-functions/v2/https';
import { inferTier1, type Tier1Estimate } from './tier1-analysis';

export const MAX_PHOTO_BYTES=4*1024*1024;
export function validateTier1Photo(data:unknown):string {
  if(!data||typeof data!=='object'||(data as Record<string,unknown>).cloudConsent!=='tier1-v1')throw new HttpsError('permission-denied','Confirm cloud photo processing first.');
  const encoded=(data as Record<string,unknown>).imageBase64;
  if(typeof encoded!=='string'||encoded.length>Math.ceil(MAX_PHOTO_BYTES/3)*4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new HttpsError('invalid-argument','A JPEG photo up to 4 MiB is required.');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length<8||bytes.length>MAX_PHOTO_BYTES||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw new HttpsError('invalid-argument','Invalid JPEG photo.');
  return encoded;
}
export function createTier1Handler(infer:(image:string)=>Promise<Tier1Estimate>=inferTier1) {
  return async(request:{auth?:{uid:string}|null;data:unknown}):Promise<Tier1Estimate>=>{
    if(!request.auth?.uid)throw new HttpsError('unauthenticated','Sign in for optional cloud analysis.');
    const photo=validateTier1Photo(request.data);
    try{return await infer(photo);}catch{throw new HttpsError('unavailable','Photo analysis failed. Your photo stays on this phone; edit the meal manually or try again.');}
  };
}
