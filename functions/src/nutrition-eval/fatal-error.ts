/**
 * Typed fatal for fail-closed calibration stages (Task 6 Step 5 slice 1).
 *
 * Represents ceiling, identity, lock, persistence, and illegal-transition
 * failures. Runner and live-adapter catch layers must rethrow this exact
 * instance unchanged instead of mapping it to a scored outcome; ordinary
 * provider errors remain scored outcomes.
 */
export class CalibrationFatalError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CalibrationFatalError';
    Object.setPrototypeOf(this, CalibrationFatalError.prototype);
  }
}
