/**
 * Stage 0 preflight file-ledger bridge (Task 7 bounded slice).
 *
 * Adapts an already lock-held `CalibrationLedger` to the injected
 * `CalibrationPreflightHooks` shape consumed by `executeCalibrationPreflight`.
 * The caller owns lock acquisition and release; this adapter never acquires or
 * releases the lock and never creates a file store. Token-count reservation
 * keys route to `ledger.reserveTokenCount`; image keys route to
 * `ledger.reserve`. Terminal and journal hooks delegate verbatim to the ledger.
 */
import type {
  CalibrationLedger,
  ReservationKey,
  TokenCountReservationKey,
} from './calibration';
import type { CalibrationPreflightHooks } from './calibration-cli';
import { CalibrationFatalError } from './fatal-error';

export type CalibrationPreflightLedgerProviderHooks = Pick<
  CalibrationPreflightHooks,
  'countTokens' | 'generateImage' | 'recordSafeError'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTokenCountKey(
  key: TokenCountReservationKey | ReservationKey,
): key is TokenCountReservationKey {
  return isRecord(key) && key['kind'] === 'token_count';
}

function hasKindField(key: TokenCountReservationKey | ReservationKey): boolean {
  return isRecord(key) && 'kind' in key;
}

function assertBridgeInputs(
  ledger: CalibrationLedger,
  providerHooks: CalibrationPreflightLedgerProviderHooks,
): void {
  const ledgerOk =
    isRecord(ledger) &&
    typeof (ledger as Record<string, unknown>)['reserve'] === 'function' &&
    typeof (ledger as Record<string, unknown>)['reserveTokenCount'] === 'function' &&
    typeof (ledger as Record<string, unknown>)['completeTokenCount'] === 'function' &&
    typeof (ledger as Record<string, unknown>)['failTokenCount'] === 'function' &&
    typeof (ledger as Record<string, unknown>)['appendResultJournal'] === 'function' &&
    typeof (ledger as Record<string, unknown>)['complete'] === 'function';
  const providersOk =
    isRecord(providerHooks) &&
    typeof (providerHooks as Record<string, unknown>)['countTokens'] === 'function' &&
    typeof (providerHooks as Record<string, unknown>)['generateImage'] === 'function' &&
    typeof (providerHooks as Record<string, unknown>)['recordSafeError'] === 'function';
  if (!ledgerOk || !providersOk) {
    throw new CalibrationFatalError('calibration:preflight-ledger-hooks-invalid');
  }
}

/**
 * Creates Stage 0 preflight hooks over an already lock-held ledger.
 *
 * `reserveCall` routes an exact `kind: 'token_count'` key to
 * `ledger.reserveTokenCount` and any key without a `kind` field to
 * `ledger.reserve`. A present but non-`token_count` kind is rejected with a
 * fresh `CalibrationFatalError` instead of being silently treated as image.
 */
export function createCalibrationPreflightLedgerHooks(
  ledger: CalibrationLedger,
  providerHooks: CalibrationPreflightLedgerProviderHooks,
): CalibrationPreflightHooks {
  assertBridgeInputs(ledger, providerHooks);
  return {
    reserveCall: (key: TokenCountReservationKey | ReservationKey): void => {
      if (isTokenCountKey(key)) {
        ledger.reserveTokenCount(key);
        return;
      }
      if (hasKindField(key)) {
        throw new CalibrationFatalError('calibration:preflight-reservation-kind-invalid');
      }
      ledger.reserve(key);
    },
    countTokens: providerHooks.countTokens,
    completeTokenCount: (key: TokenCountReservationKey, count: number): void => {
      ledger.completeTokenCount(key, count);
    },
    failTokenCount: (
      key: TokenCountReservationKey,
      errorCategory: Parameters<CalibrationLedger['failTokenCount']>[1],
    ): void => {
      ledger.failTokenCount(key, errorCategory);
    },
    generateImage: providerHooks.generateImage,
    appendResultJournal: (entry: Parameters<CalibrationLedger['appendResultJournal']>[0]): string => {
      return ledger.appendResultJournal(entry);
    },
    completeImage: (key: ReservationKey, journalHash: string): void => {
      ledger.complete(key, journalHash);
    },
    recordSafeError: providerHooks.recordSafeError,
  };
}
