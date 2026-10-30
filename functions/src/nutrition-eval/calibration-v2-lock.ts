import { z } from 'zod';

// Fixed raw-byte trust; the lock contains neither this digest nor a derived manifest/current commit pin.
export const CALIBRATION_ACTIVATION_LOCK_V2_SHA256 = 'fc61701815b950f5574dd1a70056787cea4423477321448526ef850f984bd0bd';
export const CALIBRATION_ACTIVATION_LOCK_V2_PATH = 'functions/eval/nutrition/calibration-activation-lock-v2.json';
export const CALIBRATION_V2_PRIOR_EVIDENCE_PATHS = Object.freeze([
  'ledger.json', 'journal.json', 'lock.json',
  'reports/development-low.md', 'reports/development-medium.md',
  'reports/preflight-medium.md', 'reports/preflight-medium.json',
  'reports/preflight-low.md', 'reports/preflight-low.json',
  'reports/development-medium.json', 'reports/development-low.json',
] as const);

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const gitSha = z.string().regex(/^[a-f0-9]{40}$/);
const evidencePins = Object.fromEntries(CALIBRATION_V2_PRIOR_EVIDENCE_PATHS.map(path => [path, sha])) as
  Record<(typeof CALIBRATION_V2_PRIOR_EVIDENCE_PATHS)[number], typeof sha>;

export const CalibrationActivationLockV2Schema = z.strictObject({
  version: z.literal(1), protocolVersion: z.literal('calorix-gemini-38-calibration-v2'),
  ledgerProtocolVersion: z.literal('v2'),
  candidate: z.strictObject({
    candidateId: z.literal('calorix-n5k-quality-candidate-v2'), checklistVersion: z.literal('single-container-v1'),
    rawSha256: sha, producer: z.strictObject({ implementationCommit: gitSha, functionsTreeId: gitSha }),
    corpusLockRawSha256: sha, quarantineDigest: sha,
  }),
  shared: z.strictObject({ publicManifestHash: sha, promptHash: sha, responseSchemaHash: sha,
    offLockRawSha256: sha, historicalReferenceRawSha256: sha }),
  prior: z.strictObject({ root: z.literal('.nutrition-eval/calibration/calorix-gemini-38-calibration-v1/'),
    protocolVersion: z.literal('calorix-gemini-38-calibration-v1'), imageReservations: z.literal(50),
    tokenReservations: z.literal(1), evidenceSha256: z.strictObject(evidencePins) }),
  route: z.strictObject({ provider: z.literal('vertex-ai'), project: z.literal('calorix-xurschnell'),
    location: z.literal('us'), model: z.literal('gemini-3.8-flash'), apiVersion: z.literal('v1'),
    httpTimeoutMs: z.literal(30_000) }),
  budget: z.strictObject({ priorImageReservations: z.literal(50), plannedImageCalls: z.literal(146),
    hardImageCeiling: z.literal(146), tokenCountCalls: z.literal(1), workstreamImageCeiling: z.literal(196),
    containmentImageCeiling: z.literal(300) }),
});
export type CalibrationActivationLockV2 = z.infer<typeof CalibrationActivationLockV2Schema>;
