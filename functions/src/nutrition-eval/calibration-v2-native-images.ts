/** Runtime-only, context-bound qualified image access; never downloads or creates a client. */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { CalibrationV2PreparedContext } from './calibration-protocol-bindings';
import { requireCalibrationV2Context } from './calibration-protocol-bindings';
import { StrictCalibrationManifestV2Schema } from './schema';
import { QUALITY_WORKING_ROOT } from './calibration-corpus-quality-audit';
import { inspectImage } from './image-metadata';
import { readCalibrationV2BoundedFile } from './calibration-v2-native-read';
import { CalibrationFatalError } from './fatal-error';

export async function readNativeCalibrationV2CaseImage(
  context: Readonly<CalibrationV2PreparedContext>, caseId: unknown,
): Promise<Uint8Array> {
  const owned = requireCalibrationV2Context(context);
  try {
    if (typeof caseId !== 'string' || caseId.length === 0) throw new Error();
    const training = StrictCalibrationManifestV2Schema.parse(JSON.parse(owned.files['calibration-manifest']));
    const row = training.cases.find(value => value.id === caseId);
    if (row === undefined) throw new Error();
    const image = row.image;
    const bytes = await readCalibrationV2BoundedFile(owned.baseDir,
      join(QUALITY_WORKING_ROOT, 'images', image.sha256 + '.bin'), 5 * 1024 * 1024);
    if (createHash('sha256').update(bytes).digest('hex') !== image.sha256) throw new Error();
    const meta = inspectImage(bytes);
    if (meta.mediaType !== image.mediaType || meta.width !== image.width || meta.height !== image.height) throw new Error();
    return Uint8Array.from(bytes);
  } catch {
    // Never expose paths, content, native errno or foreign error properties.
    throw new CalibrationFatalError('calibration:v2-case-image-invalid');
  }
}
