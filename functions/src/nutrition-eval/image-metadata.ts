export interface ImageMeta {
  mediaType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function inspectPng(bytes: Uint8Array): ImageMeta {
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8) throw new Error('PNG too short');
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIG[i]) throw new Error('Invalid PNG signature');
  }
  if (bytes.length < 24) throw new Error('PNG truncated before IHDR');
  const ihdrLen = readUint32BE(bytes, 8);
  if (ihdrLen !== 13) throw new Error('Unexpected IHDR length');
  const ihdrType =
    String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (ihdrType !== 'IHDR') throw new Error('First chunk is not IHDR');
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  if (width === 0 || height === 0) throw new Error('PNG dimensions must be positive');
  return { mediaType: 'image/png', width, height };
}

function inspectJpeg(bytes: Uint8Array): ImageMeta {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('Invalid JPEG SOI');
  }
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('JPEG marker expected 0xFF');
    const marker = bytes[offset + 1]!;
    if (marker === 0xd9) throw new Error('JPEG EOI before SOF');
    if (marker === 0xda) throw new Error('JPEG SOS before SOF');
    if (marker >= 0xc0 && marker <= 0xc2) {
      if (offset + 9 > bytes.length) throw new Error('JPEG truncated at SOF');
      const height = readUint16BE(bytes, offset + 5);
      const width = readUint16BE(bytes, offset + 7);
      if (width === 0 || height === 0)
        throw new Error('JPEG dimensions must be positive');
      return { mediaType: 'image/jpeg', width, height };
    }
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= bytes.length) throw new Error('JPEG truncated');
    const segLen = readUint16BE(bytes, offset + 2);
    if (segLen < 2) throw new Error('Invalid JPEG segment length');
    offset += 2 + segLen;
  }
  throw new Error('JPEG: no SOF marker found');
}

export function inspectImage(bytes: Uint8Array): ImageMeta {
  if (bytes.length === 0) throw new Error('Empty image bytes');
  if (bytes[0] === 0x89) return inspectPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return inspectJpeg(bytes);
  throw new Error('Unsupported image format');
}
