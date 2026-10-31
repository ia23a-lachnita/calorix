export { prepareCalibrationV2BootstrapContext } from './calibration-protocol-bindings';
export type {
  CalibrationV2BootstrapReadDeps,
  CalibrationV2PreparedContext,
  CalibrationV2SharedAssetPath,
} from './calibration-protocol-bindings';

import type { CalibrationV2BootstrapReadDeps } from './calibration-protocol-bindings';
import { createCalibrationBootstrapReadDeps } from './calibration-bootstrap';
import { readNativeCalibrationV2AdmissionInput } from './calibration-v2-inputs';
import { CalibrationFatalError } from './fatal-error';

const HEX40_LOWER = /^[0-9a-f]{40}$/;
const V2_SHARED_ASSET_PATHS: ReadonlySet<string> = new Set([
  'functions/eval/nutrition/public-manifest.json',
  'functions/eval/nutrition/off-snapshot-lock.json',
  'functions/eval/nutrition/historical-reference-v1.json',
]);

export function createCalibrationV2BootstrapReadDeps(repoRoot?: string): CalibrationV2BootstrapReadDeps {
  const native = createCalibrationBootstrapReadDeps(repoRoot);
  const baseDir = native.baseDir;
  return {
    baseDir,
    readGitState: () => native.readGitState(),
    readAdmissionInputs: () => readNativeCalibrationV2AdmissionInput(baseDir),
    readCommittedSharedFile: (path, commit) => {
      if (typeof path !== 'string' || !V2_SHARED_ASSET_PATHS.has(path)) {
        throw new CalibrationFatalError('calibration:bootstrap-file-failed');
      }
      if (typeof commit !== 'string' || !HEX40_LOWER.test(commit)) {
        throw new CalibrationFatalError('calibration:bootstrap-file-failed');
      }
      return native.readCommittedFile(path, commit);
    },
    readOwner: () => native.readOwner(),
  };
}
