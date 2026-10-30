import {
  StrictCalibrationManifestV2Schema,
  canonicalizeForHash,
  type StrictCalibrationManifestV2,
} from './schema';

// Recursively sorted-key, array-order-preserving canonical JSON text for a
// strict v2 manifest. Strict-validates its input first so a serialized
// manifest is always a schema-valid one, and reuses the schema module's
// canonicalization (no duplicated canonicalization algorithm here).
export function serializeCalibrationV2Manifest(manifest: StrictCalibrationManifestV2): string {
  const parsed = StrictCalibrationManifestV2Schema.parse(manifest);
  const canonical = canonicalizeForHash(parsed);
  return JSON.stringify(canonical);
}
