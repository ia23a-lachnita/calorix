/** Original-reference descriptor capture only; never an SDK admission grant. */
import type { CalibrationV2PreparedContext } from './calibration-protocol-bindings';
import { requireCalibrationV2Context } from './calibration-protocol-bindings';
import { requireMatchingCalibrationV2Ledger } from './calibration';
import { CalibrationFatalError } from './fatal-error';

export interface CalibrationV2ExecutionBinding {
  readonly context: Readonly<CalibrationV2PreparedContext>;
  readonly ledger: unknown;
}

export function captureCalibrationV2ExecutionBinding(deps: unknown): Readonly<CalibrationV2ExecutionBinding> {
  const read = (field: 'context' | 'ledger'): unknown => {
    try {
      if (deps === null || typeof deps !== 'object') throw new Error();
      const descriptor = Object.getOwnPropertyDescriptor(deps, field);
      if (descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)
        || descriptor.value === undefined) throw new Error();
      return descriptor.value;
    } catch { throw new CalibrationFatalError('calibration:v2-execution-binding-invalid'); }
  };
  const context = requireCalibrationV2Context(read('context'));
  const ledger = read('ledger');
  requireMatchingCalibrationV2Ledger(context, ledger);
  return Object.freeze({ context, ledger });
}
