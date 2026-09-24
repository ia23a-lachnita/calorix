import { createHash, randomBytes } from 'crypto';
import { readFile, writeFile, rename, unlink, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { inspectImage } from './image-metadata';
import {
  CalibrationSourceLockSchema,
  StrictCalibrationManifestSchema,
  hashCalibrationSourceLock,
} from './schema';

import type { CalibrationSourceLock, StrictCalibrationManifest } from './schema';

// ── Source lock: exact paths and URL construction ───────────────────────────

export const CALIBRATION_DATASET_ID = 'calorix-n5k-calibration-v1';

export const NUTRITION5K_BASE_URL = 'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/';

export const CALIBRATION_SOURCE_PATHS = {
  trainSplit: 'dish_ids/splits/rgb_train_ids.txt',
  metadataCafe1: 'metadata/dish_metadata_cafe1.csv',
  metadataCafe2: 'metadata/dish_metadata_cafe2.csv',
} as const;

export function buildSourceUrl(path: string): string {
  return `${NUTRITION5K_BASE_URL}${path}`;
}

export function buildOverheadImageUrl(dishId: string): string {
  return `${NUTRITION5K_BASE_URL}imagery/realsense_overhead/${dishId}/rgb.png`;
}

// ── Hash-before-parse source verification ───────────────────────────────────

export interface ExpectedSourceBytes {
  sha256: string;
  byteLength: number;
}

export function verifyPinnedSourceBytes(bytes: Uint8Array, expected: ExpectedSourceBytes): void {
  if (bytes.length !== expected.byteLength) {
    throw new Error(
      `calibration source byte-length mismatch: expected ${expected.byteLength}, got ${bytes.length}`,
    );
  }
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== expected.sha256) {
    throw new Error(
      `calibration source sha256 mismatch: expected ${expected.sha256}, got ${actualSha256}`,
    );
  }
}

export function parseAndVerifySource<T>(
  bytes: Uint8Array,
  expected: ExpectedSourceBytes,
  parse: (text: string) => T,
): T {
  verifyPinnedSourceBytes(bytes, expected);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return parse(text);
}

// ── Train-split parsing ──────────────────────────────────────────────────────

export function parseTrainSplit(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (!/^dish_[0-9]+$/.test(line)) {
      throw new Error(`invalid train-split line (format drift): ${JSON.stringify(line)}`);
    }
    if (seen.has(line)) {
      throw new Error(`duplicate dish ID in train split: ${line}`);
    }
    seen.add(line);
    result.push(line);
  }
  return result;
}

// ── RFC 4180 dish-metadata CSV parsing ──────────────────────────────────────

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  // True once a closing quote has ended the current field's quoted run;
  // RFC 4180 only permits a delimiter to follow, never more characters.
  let quoteClosedPendingDelimiter = false;
  // True once any character (an opening quote, or a plain character) has
  // been consumed for the current field; a quote may only open a field, it
  // may never appear mid-way through an already-started unquoted field.
  let fieldStarted = false;
  let i = 0;
  const n = text.length;

  function pushField(): void {
    record.push(field);
    field = '';
    fieldStarted = false;
    quoteClosedPendingDelimiter = false;
  }

  function endRecord(): void {
    pushField();
    records.push(record);
    record = [];
  }

  while (i < n) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        quoteClosedPendingDelimiter = true;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (quoteClosedPendingDelimiter && ch !== ',' && ch !== '\r' && ch !== '\n') {
      throw new Error('trailing characters after a closing quote in calibration CSV source');
    }

    if (ch === '"') {
      if (fieldStarted) {
        throw new Error('quote character starting mid-way through an unquoted field in calibration CSV source');
      }
      inQuotes = true;
      fieldStarted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      endRecord();
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      endRecord();
      i += 1;
      continue;
    }
    field += ch;
    fieldStarted = true;
    i += 1;
  }

  if (inQuotes) {
    throw new Error('unclosed quoted field in calibration CSV source');
  }

  if (field !== '' || record.length > 0 || quoteClosedPendingDelimiter) {
    record.push(field);
    records.push(record);
  }

  return records.filter((r) => !(r.length === 1 && r[0] === ''));
}

export interface CalibrationIngredientRow {
  ingredientId: string;
  name: string;
  grams: number;
  calories: number;
  fat: number;
  carb: number;
  protein: number;
}

export interface DishMetadataRow {
  dishId: string;
  totalCalories: number;
  totalMass: number;
  totalFat: number;
  totalCarb: number;
  totalProtein: number;
  ingredients: CalibrationIngredientRow[];
}

function parseFiniteNumber(value: string, fieldName: string): number {
  if (value.trim() === '') {
    throw new Error(`empty numeric field ${fieldName}`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid numeric field ${fieldName}: ${JSON.stringify(value)}`);
  }
  return parsed;
}

function parseDishMetadataRow(fields: string[]): DishMetadataRow {
  if (fields.length < 6) {
    throw new Error('dish metadata row has fewer than the 6 fixed fields');
  }
  const trailingCount = fields.length - 6;
  const componentCount = trailingCount / 7;
  if (trailingCount === 0 || !Number.isInteger(componentCount) || componentCount <= 0) {
    throw new Error(
      `dish metadata row trailing field count (${trailingCount}) is not a positive multiple of 7 (format drift)`,
    );
  }

  const dishId = fields[0]!;
  if (!/^dish_[0-9]+$/.test(dishId)) {
    throw new Error(`invalid dish id in metadata row: ${JSON.stringify(dishId)}`);
  }

  const totalCalories = parseFiniteNumber(fields[1]!, 'total_calories');
  const totalMass = parseFiniteNumber(fields[2]!, 'total_mass');
  const totalFat = parseFiniteNumber(fields[3]!, 'total_fat');
  const totalCarb = parseFiniteNumber(fields[4]!, 'total_carb');
  const totalProtein = parseFiniteNumber(fields[5]!, 'total_protein');

  // Total-nutrition semantics are eligibility, not parse errors: structurally
  // valid finite zero/negative totals parse here and are excluded later via
  // buildExcludedDishes / buildEligibleDishes. Ingredient-level validation
  // below stays strict.

  const ingredients: CalibrationIngredientRow[] = [];
  for (let group = 0; group < componentCount; group++) {
    const base = 6 + group * 7;
    const ingredientId = fields[base]!;
    const name = fields[base + 1]!;
    const grams = parseFiniteNumber(fields[base + 2]!, 'ingredient grams');
    const calories = parseFiniteNumber(fields[base + 3]!, 'ingredient calories');
    const fat = parseFiniteNumber(fields[base + 4]!, 'ingredient fat');
    const carb = parseFiniteNumber(fields[base + 5]!, 'ingredient carb');
    const protein = parseFiniteNumber(fields[base + 6]!, 'ingredient protein');

    if (ingredientId.trim() === '') throw new Error(`ingredient id must not be empty for ${dishId}`);
    // Official Nutrition5k ingredient names are optional descriptive metadata preserved as ''.
    if (grams <= 0) throw new Error(`ingredient grams must be positive for ${dishId}`);
    if (calories < 0) throw new Error(`ingredient calories must be non-negative for ${dishId}`);
    if (fat < 0) throw new Error(`ingredient fat must be non-negative for ${dishId}`);
    if (carb < 0) throw new Error(`ingredient carb must be non-negative for ${dishId}`);
    if (protein < 0) throw new Error(`ingredient protein must be non-negative for ${dishId}`);

    ingredients.push({ ingredientId, name, grams, calories, fat, carb, protein });
  }

  return { dishId, totalCalories, totalMass, totalFat, totalCarb, totalProtein, ingredients };
}

export function parseDishMetadataCsv(text: string): DishMetadataRow[] {
  const records = parseCsvRecords(text);
  const rows: DishMetadataRow[] = [];
  const seen = new Set<string>();
  for (const fields of records) {
    const row = parseDishMetadataRow(fields);
    if (seen.has(row.dishId)) {
      throw new Error(`duplicate dish ID in metadata CSV: ${row.dishId}`);
    }
    seen.add(row.dishId);
    rows.push(row);
  }
  return rows;
}

export function mergeDishMetadata(
  cafe1Rows: DishMetadataRow[],
  cafe2Rows: DishMetadataRow[],
): Map<string, DishMetadataRow> {
  const merged = new Map<string, DishMetadataRow>();
  for (const rows of [cafe1Rows, cafe2Rows]) {
    const seenInThisCafe = new Set<string>();
    for (const row of rows) {
      if (seenInThisCafe.has(row.dishId)) {
        throw new Error(`duplicate dish ID within one cafe metadata list: ${row.dishId}`);
      }
      seenInThisCafe.add(row.dishId);
      if (merged.has(row.dishId)) {
        throw new Error(`duplicate dish ID present in both cafe1 and cafe2 metadata: ${row.dishId}`);
      }
      merged.set(row.dishId, row);
    }
  }
  return merged;
}

// ── Bins ─────────────────────────────────────────────────────────────────────

export type CalibrationBin = 0 | 1 | 2;

export function componentBinOf(ingredientCount: number): CalibrationBin {
  if (!Number.isInteger(ingredientCount) || ingredientCount <= 0) {
    throw new Error('ingredient count must be a positive integer');
  }
  if (ingredientCount === 1) return 0;
  if (ingredientCount === 2) return 1;
  return 2;
}

export function calorieBinOf(totalCalories: number): CalibrationBin {
  if (totalCalories < 150) return 0;
  if (totalCalories <= 400) return 1;
  return 2;
}

export function macroDominanceBinOf(proteinG: number, carbsG: number, fatG: number): CalibrationBin {
  const proteinEnergy = 4 * proteinG;
  const carbEnergy = 4 * carbsG;
  const fatEnergy = 9 * fatG;
  if (proteinEnergy >= carbEnergy && proteinEnergy >= fatEnergy) return 0;
  if (carbEnergy >= fatEnergy) return 1;
  return 2;
}

// ── Rank ─────────────────────────────────────────────────────────────────────

const RANK_PREFIX = 'calorix-n5k-calibration-v1:';

export function rankHash(dishId: string): string {
  return createHash('sha256').update(`${RANK_PREFIX}${dishId}`).digest('hex');
}

// ── Frozen public-manifest exclusion and eligible-dish construction ─────────

export const FROZEN_PUBLIC_MANIFEST_DISH_IDS: readonly string[] = [
  'dish_1558549605',
  'dish_1558639787',
  'dish_1558639818',
  'dish_1560456326',
  'dish_1561663580',
  'dish_1562788601',
  'dish_1564427430',
  'dish_1565035746',
  'dish_1565898402',
  'dish_1566328724',
  'dish_1566838351',
  'dish_1567107839',
];

const FROZEN_PUBLIC_MANIFEST_DISH_ID_SET = new Set(FROZEN_PUBLIC_MANIFEST_DISH_IDS);

// ── Typed semantic exclusions (train-only, canonical) ───────────────────────

export type ExcludedDishReason =
  | 'non_positive_calories'
  | 'non_positive_mass'
  | 'negative_macros'
  | 'missing_metadata';

export interface ExcludedDish {
  dishId: string;
  reason: ExcludedDishReason;
}

interface ExclusionTotals {
  totalCalories: number;
  totalMass: number;
  totalFat: number;
  totalCarb: number;
  totalProtein: number;
}

function exclusionReasonForRow(row: ExclusionTotals): ExcludedDishReason | undefined {
  if (row.totalCalories <= 0) return 'non_positive_calories';
  if (row.totalMass <= 0) return 'non_positive_mass';
  if (row.totalFat < 0 || row.totalCarb < 0 || row.totalProtein < 0) return 'negative_macros';
  return undefined;
}

// Canonical train-only exclusion builder: only non-frozen train IDs are ever
// considered; precedence is calories then mass then macros then missing
// metadata as applicable; output is sorted strictly ascending by dishId.
export function buildExcludedDishes(
  trainSplitIds: string[],
  metadataById: Map<string, ExclusionTotals>,
): ExcludedDish[] {
  const seenTrain = new Set<string>();
  const excluded: ExcludedDish[] = [];
  for (const dishId of trainSplitIds) {
    if (seenTrain.has(dishId)) continue;
    seenTrain.add(dishId);
    if (FROZEN_PUBLIC_MANIFEST_DISH_ID_SET.has(dishId)) continue;
    const row = metadataById.get(dishId);
    if (!row) {
      excluded.push({ dishId, reason: 'missing_metadata' });
      continue;
    }
    const reason = exclusionReasonForRow(row);
    if (reason) excluded.push({ dishId, reason });
  }
  excluded.sort((a, b) => (a.dishId < b.dishId ? -1 : a.dishId > b.dishId ? 1 : 0));
  return excluded;
}

export interface EligibleDish {
  dishId: string;
  componentBin: CalibrationBin;
  calorieBin: CalibrationBin;
  macroBin: CalibrationBin;
  totalCalories: number;
  totalMass: number;
  totalFat: number;
  totalCarb: number;
  totalProtein: number;
}

export function buildEligibleDishes(
  trainSplitIds: string[],
  metadataById: Map<string, DishMetadataRow>,
): EligibleDish[] {
  const eligible: EligibleDish[] = [];
  for (const dishId of trainSplitIds) {
    const row = metadataById.get(dishId);
    if (FROZEN_PUBLIC_MANIFEST_DISH_ID_SET.has(dishId) || !row) continue;
    if (row.totalCalories <= 0 || row.totalMass <= 0) continue;
    if (row.totalFat < 0 || row.totalCarb < 0 || row.totalProtein < 0) continue;
    eligible.push({
      dishId,
      componentBin: componentBinOf(row.ingredients.length),
      calorieBin: calorieBinOf(row.totalCalories),
      macroBin: macroDominanceBinOf(row.totalProtein, row.totalCarb, row.totalFat),
      totalCalories: row.totalCalories,
      totalMass: row.totalMass,
      totalFat: row.totalFat,
      totalCarb: row.totalCarb,
      totalProtein: row.totalProtein,
    });
  }
  return eligible;
}

// ── Generic slot-filling engine ─────────────────────────────────────────────

export interface CalibrationStratum {
  componentBin: CalibrationBin;
  calorieBin: CalibrationBin;
  macroBin: CalibrationBin;
}

export interface CalibrationSlotSchedule {
  development: readonly CalibrationStratum[];
  validation: readonly CalibrationStratum[];
}

export interface CalibrationSlotFillOptions {
  skipDishIds?: Set<string>;
}

export interface CalibrationSlotFillResult {
  development: EligibleDish[];
  validation: EligibleDish[];
}

function stratumKey(s: CalibrationStratum): string {
  return `${s.componentBin},${s.calorieBin},${s.macroBin}`;
}

function buildRankedStrataIndex(
  pool: EligibleDish[],
  skipDishIds?: Set<string>,
): Map<string, EligibleDish[]> {
  const byStratum = new Map<string, EligibleDish[]>();
  for (const candidate of pool) {
    if (skipDishIds?.has(candidate.dishId)) continue;
    const key = stratumKey(candidate);
    const list = byStratum.get(key);
    if (list) list.push(candidate);
    else byStratum.set(key, [candidate]);
  }
  for (const list of byStratum.values()) {
    list.sort((a, b) => {
      const ha = rankHash(a.dishId);
      const hb = rankHash(b.dishId);
      if (ha < hb) return -1;
      if (ha > hb) return 1;
      return a.dishId < b.dishId ? -1 : a.dishId > b.dishId ? 1 : 0;
    });
  }
  return byStratum;
}

export function fillCalibrationSlots(
  pool: EligibleDish[],
  schedule: CalibrationSlotSchedule,
  options: CalibrationSlotFillOptions = {},
): CalibrationSlotFillResult {
  const byStratum = buildRankedStrataIndex(pool, options.skipDishIds);
  const usedIds = new Set<string>();

  function fillGroup(slots: readonly CalibrationStratum[]): EligibleDish[] {
    const result: EligibleDish[] = [];
    for (const slot of slots) {
      const key = stratumKey(slot);
      const candidates = byStratum.get(key) ?? [];
      const chosen = candidates.find((candidate) => !usedIds.has(candidate.dishId));
      if (!chosen) {
        throw new Error(
          `calibration stratum exhausted with no neighboring-stratum fallback: (${key})`,
        );
      }
      usedIds.add(chosen.dishId);
      result.push(chosen);
    }
    return result;
  }

  const development = fillGroup(schedule.development);
  const validation = fillGroup(schedule.validation);
  return { development, validation };
}

// ── Exact plan-pinned schedules ──────────────────────────────────────────────

function stratum(componentBin: CalibrationBin, calorieBin: CalibrationBin, macroBin: CalibrationBin): CalibrationStratum {
  return { componentBin, calorieBin, macroBin };
}

export const DEVELOPMENT_SLOT_SCHEDULE: readonly CalibrationStratum[] = [
  stratum(0, 0, 0), stratum(1, 1, 1), stratum(2, 2, 2),
  stratum(0, 0, 0), stratum(1, 1, 2), stratum(2, 2, 1),
  stratum(0, 0, 1), stratum(1, 1, 0), stratum(2, 2, 2),
  stratum(0, 0, 1), stratum(1, 1, 2), stratum(2, 2, 0),
  stratum(0, 0, 2), stratum(1, 1, 0), stratum(2, 2, 1),
  stratum(0, 0, 2), stratum(1, 1, 1), stratum(2, 2, 0),
  stratum(0, 1, 1), stratum(1, 0, 2), stratum(2, 2, 0),
  stratum(0, 2, 2), stratum(1, 0, 1), stratum(2, 1, 0),
];

export const VALIDATION_SLOT_SCHEDULE: readonly CalibrationStratum[] = [
  stratum(0, 0, 0), stratum(1, 2, 2), stratum(2, 1, 1),
  stratum(0, 0, 1), stratum(1, 2, 2), stratum(2, 1, 0),
  stratum(0, 1, 0), stratum(1, 0, 1), stratum(2, 2, 2),
  stratum(0, 1, 0), stratum(1, 0, 2), stratum(2, 2, 1),
  stratum(0, 1, 2), stratum(1, 0, 1), stratum(2, 2, 0),
  stratum(0, 2, 1),
];

const CALIBRATION_SCHEDULE: CalibrationSlotSchedule = {
  development: DEVELOPMENT_SLOT_SCHEDULE,
  validation: VALIDATION_SLOT_SCHEDULE,
};

export function selectCalibrationCorpus(pool: EligibleDish[]): CalibrationSlotFillResult {
  return fillCalibrationSlots(pool, CALIBRATION_SCHEDULE);
}

// ── Image verification ───────────────────────────────────────────────────────

export interface FetchImageResult {
  status: number;
  bytes: Uint8Array;
}

export type FetchImageFn = (url: string) => Promise<FetchImageResult>;

export interface VerifiedCalibrationImage {
  sha256: string;
  mediaType: 'image/png';
  width: number;
  height: number;
}

// The exact stable, enumerated set of reasons a candidate's overhead image
// may be recorded as skipped/failed. `http_error` always carries the exact
// numeric HTTP status; every other reason never carries one. `fetch_error`
// is the stable record for a thrown image fetch or thrown image-byte read
// (network/transport failure before any HTTP status or byte inspection was
// possible). This union is the only vocabulary ever surfaced outward — raw
// provider/network error text and local filesystem paths are never recorded.
export type SkippedImageReason =
  | 'http_error'
  | 'fetch_error'
  | 'invalid_signature'
  | 'invalid_media_type'
  | 'invalid_dimensions';

export class OverheadImageCheckError extends Error {
  readonly reason: SkippedImageReason;
  readonly status: number | undefined;
  constructor(reason: SkippedImageReason, status?: number) {
    super(`overhead image check failed: ${reason}`);
    this.name = 'OverheadImageCheckError';
    this.reason = reason;
    this.status = status;
  }
}

// inspectImage itself already rejects zero/negative decoded dimensions
// before returning (for both PNG and JPEG), so a thrown dimension error
// must be classified as invalid_dimensions rather than invalid_signature;
// every other thrown error means the bytes never parsed as a recognized
// image at all.
function isImageDimensionError(error: unknown): boolean {
  return error instanceof Error && /dimensions must be positive/i.test(error.message);
}

export async function verifyOverheadImage(
  dishId: string,
  fetchImage: FetchImageFn,
): Promise<VerifiedCalibrationImage> {
  const url = buildOverheadImageUrl(dishId);
  let response: FetchImageResult;
  try {
    response = await fetchImage(url);
  } catch {
    throw new OverheadImageCheckError('fetch_error');
  }
  if (response.status !== 200) {
    throw new OverheadImageCheckError('http_error', response.status);
  }
  let meta;
  try {
    meta = inspectImage(response.bytes);
  } catch (error) {
    throw new OverheadImageCheckError(isImageDimensionError(error) ? 'invalid_dimensions' : 'invalid_signature');
  }
  if (meta.mediaType !== 'image/png') {
    throw new OverheadImageCheckError('invalid_media_type');
  }
  if (meta.width <= 0 || meta.height <= 0) {
    throw new OverheadImageCheckError('invalid_dimensions');
  }
  const sha256 = createHash('sha256').update(response.bytes).digest('hex');
  return { sha256, mediaType: 'image/png', width: meta.width, height: meta.height };
}

export interface CheckImageOk {
  ok: true;
  sha256: string;
  width: number;
  height: number;
}

export interface CheckImageFail {
  ok: false;
  reason: SkippedImageReason;
  status?: number;
}

export type CheckImageFn = (dishId: string) => Promise<CheckImageOk | CheckImageFail>;

// Wraps verifyOverheadImage into the CheckImageFn shape used by pin/verify:
// never throws, always resolves to the exact stable ok/fail union. A thrown
// image fetch or thrown image-byte read (transport failure before any HTTP
// status or byte inspection) becomes the stable `fetch_error` record without
// a status field; raw error text is never surfaced.
export function buildCheckImage(fetchImage: FetchImageFn): CheckImageFn {
  return async (dishId: string) => {
    try {
      const verified = await verifyOverheadImage(dishId, fetchImage);
      return { ok: true, sha256: verified.sha256, width: verified.width, height: verified.height };
    } catch (error) {
      if (error instanceof OverheadImageCheckError) {
        return error.status !== undefined
          ? { ok: false, reason: error.reason, status: error.status }
          : { ok: false, reason: error.reason };
      }
      return { ok: false, reason: 'fetch_error' };
    }
  };
}

export interface SkippedCalibrationImage {
  dishId: string;
  stratum: CalibrationStratum;
  reason: SkippedImageReason;
  status?: number;
}

export interface CalibrationSlotFillWithImagesResult extends CalibrationSlotFillResult {
  images: Map<string, { sha256: string; width: number; height: number }>;
  skippedImages: SkippedCalibrationImage[];
}

export async function fillCalibrationSlotsWithImageVerification(
  pool: EligibleDish[],
  schedule: CalibrationSlotSchedule,
  checkImage: CheckImageFn,
): Promise<CalibrationSlotFillWithImagesResult> {
  const byStratum = buildRankedStrataIndex(pool);
  const usedIds = new Set<string>();
  const failedIds = new Set<string>();
  const images = new Map<string, { sha256: string; width: number; height: number }>();
  const skippedImages: SkippedCalibrationImage[] = [];

  async function fillGroup(slots: readonly CalibrationStratum[]): Promise<EligibleDish[]> {
    const result: EligibleDish[] = [];
    for (const slot of slots) {
      const key = stratumKey(slot);
      const candidates = byStratum.get(key) ?? [];
      let chosen: EligibleDish | undefined;
      for (const candidate of candidates) {
        if (usedIds.has(candidate.dishId) || failedIds.has(candidate.dishId)) continue;
        const checked = await checkImage(candidate.dishId);
        if (checked.ok) {
          images.set(candidate.dishId, {
            sha256: checked.sha256,
            width: checked.width,
            height: checked.height,
          });
          chosen = candidate;
          break;
        }
        failedIds.add(candidate.dishId);
        const stratum: CalibrationStratum = {
          componentBin: candidate.componentBin,
          calorieBin: candidate.calorieBin,
          macroBin: candidate.macroBin,
        };
        skippedImages.push(
          checked.status !== undefined
            ? { dishId: candidate.dishId, stratum, reason: checked.reason, status: checked.status }
            : { dishId: candidate.dishId, stratum, reason: checked.reason },
        );
      }
      if (!chosen) {
        throw new Error(
          `calibration stratum exhausted with no neighboring-stratum fallback during image verification: (${key})`,
        );
      }
      usedIds.add(chosen.dishId);
      result.push(chosen);
    }
    return result;
  }

  const development = await fillGroup(schedule.development);
  const validation = await fillGroup(schedule.validation);
  return { development, validation, images, skippedImages };
}

// ── Canonical byte encoding (the actual schema-validated hash values come
// from schema.ts's hashCalibrationSourceLock / hashStrictCalibrationManifest;
// this local canonicalization only produces the deterministic bytes written
// to / compared against the committed artifact files) ───────────────────────

function canonicalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalizeForHash(item));
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = canonicalizeForHash(source[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalizeForHash(value));
}

// ── --pin / --verify pipeline ────────────────────────────────────────────────

export interface CalibrationPublishPaths {
  sourceLockPath: string;
  manifestPath: string;
}

export interface CalibrationPublishDeps {
  readArtifact: (path: string) => Promise<Uint8Array | undefined>;
  writeTempFile: (finalPath: string, bytes: Uint8Array) => Promise<string>;
  renameToFinal: (tempPath: string, finalPath: string) => Promise<void>;
  removeFile: (path: string) => Promise<void>;
  buildSourceLock: () => Promise<unknown>;
  buildCandidatePool: () => Promise<EligibleDish[]>;
  checkImage: CheckImageFn;
}

function buildStrictCalibrationCase(
  dish: EligibleDish,
  group: 'development' | 'validation',
  slotIndex: number,
  image: { sha256: string; width: number; height: number },
): Record<string, unknown> {
  return {
    id: `calibration-${dish.dishId}`,
    visibility: 'public',
    scanMode: 'meal',
    source: { dataset: 'nutrition5k', objectId: dish.dishId },
    image: {
      url: buildOverheadImageUrl(dish.dishId),
      sha256: image.sha256,
      mediaType: 'image/png',
      width: image.width,
      height: image.height,
    },
    truth: {
      basis: 'portion',
      amount: 1,
      unit: 'portion',
      kcal: dish.totalCalories,
      proteinG: dish.totalProtein,
      carbsG: dish.totalCarb,
      fatG: dish.totalFat,
      referenceMassG: dish.totalMass,
    },
    toleranceClass: 'meal-estimate',
    attributionId: 'nutrition5k-cc-by-4.0',
    group,
    stratum: {
      componentBin: dish.componentBin,
      calorieBin: dish.calorieBin,
      macroBin: dish.macroBin,
    },
    rank: rankHash(dish.dishId),
    slotIndex,
  };
}

// Pin-time artifact construction: derives the source lock and manifest from
// a *fresh* selection (including its own image checks, which may skip and
// advance within a stratum — see fillCalibrationSlotsWithImageVerification).
// Both the source lock and the manifest are parsed/validated against their
// strict schemas before hashing or encoding, and the lock hash always comes
// from schema.ts's hashCalibrationSourceLock (never a locally re-derived
// hash), so the strict schema is the sole authority over what counts as a
// well-formed committed artifact. The committed lock preserves the canonical
// `excludedDishes` derived from the exact parsed pinned sources (see runPin);
// pin rejects any exclusion overlapping a selected case.
async function buildCalibrationArtifactBytes(
  deps: Pick<CalibrationPublishDeps, 'buildSourceLock' | 'buildCandidatePool' | 'checkImage'>,
): Promise<{ sourceLockBytes: Uint8Array; manifestBytes: Uint8Array }> {
  const sourceLock = await deps.buildSourceLock();
  const pool = await deps.buildCandidatePool();
  const { development, validation, images, skippedImages } = await fillCalibrationSlotsWithImageVerification(
    pool,
    CALIBRATION_SCHEDULE,
    deps.checkImage,
  );

  const rawExcluded = ((sourceLock as Record<string, unknown>)['excludedDishes'] as
    | Array<{ dishId: string }>
    | undefined) ?? [];
  const selectedIds = new Set(
    [...development, ...validation].map((dish) => dish.dishId),
  );
  for (const excluded of rawExcluded) {
    if (selectedIds.has(excluded.dishId)) {
      throw new Error(
        `calibration pin failed: excluded dish ${excluded.dishId} overlaps a selected case (exclusion conflict)`,
      );
    }
  }

  const sourceLockWithSkips = {
    ...(sourceLock as Record<string, unknown>),
    skippedImages,
  };
  const validatedSourceLock = CalibrationSourceLockSchema.parse(sourceLockWithSkips);
  const sourceLockHash = hashCalibrationSourceLock(validatedSourceLock);

  const cases = [
    ...development.map((dish, index) =>
      buildStrictCalibrationCase(dish, 'development', index, images.get(dish.dishId)!),
    ),
    ...validation.map((dish, index) =>
      buildStrictCalibrationCase(dish, 'validation', 24 + index, images.get(dish.dishId)!),
    ),
  ];
  const manifest = {
    version: 1,
    datasetId: CALIBRATION_DATASET_ID,
    sourceLockHash,
    cases,
  };
  const validatedManifest = StrictCalibrationManifestSchema.parse(manifest);

  const encoder = new TextEncoder();
  return {
    sourceLockBytes: encoder.encode(canonicalJsonStringify(validatedSourceLock)),
    manifestBytes: encoder.encode(canonicalJsonStringify(validatedManifest)),
  };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function pinCalibrationCorpus(
  deps: CalibrationPublishDeps,
  paths: CalibrationPublishPaths,
): Promise<void> {
  const [existingLock, existingManifest] = await Promise.all([
    deps.readArtifact(paths.sourceLockPath),
    deps.readArtifact(paths.manifestPath),
  ]);
  if (existingLock !== undefined || existingManifest !== undefined) {
    throw new Error('calibration source lock or manifest already exists; refusing to overwrite');
  }

  const { sourceLockBytes, manifestBytes } = await buildCalibrationArtifactBytes(deps);

  const artifacts: Array<{ path: string; bytes: Uint8Array }> = [
    { path: paths.sourceLockPath, bytes: sourceLockBytes },
    { path: paths.manifestPath, bytes: manifestBytes },
  ];

  // Phase 1: write every temp file first. A real filesystem never performs
  // a rename until every artifact has a temp file safely on disk, so if any
  // temp write fails, clean up whatever temp files were already written and
  // finalize nothing — no rename is ever attempted mid-batch.
  const tempPaths: string[] = [];
  try {
    for (const artifact of artifacts) {
      tempPaths.push(await deps.writeTempFile(artifact.path, artifact.bytes));
    }
  } catch (error) {
    for (const tempPath of tempPaths) {
      await deps.removeFile(tempPath);
    }
    throw error;
  }

  // Phase 2: rename each temp file to its final path, strictly in order. On
  // the first rename failure, stop immediately (the next rename is never
  // attempted), roll back every artifact already finalized in this batch,
  // and clean up every temp file still on disk — the failed rename's own
  // temp file (a failed rename leaves it in place) plus any temp file for
  // an artifact whose rename was never reached.
  const finalizedPaths: string[] = [];
  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i]!;
    const tempPath = tempPaths[i]!;
    try {
      await deps.renameToFinal(tempPath, artifact.path);
      finalizedPaths.push(artifact.path);
    } catch (error) {
      for (const finalizedPath of finalizedPaths) {
        await deps.removeFile(finalizedPath);
      }
      for (let j = i; j < tempPaths.length; j++) {
        await deps.removeFile(tempPaths[j]!);
      }
      throw error;
    }
  }
}

// Verify-time artifact reconstruction: unlike pin, this never performs its
// own fresh selection with image-check-driven substitution. It instead
// reconstructs the deterministic selection by excluding exactly the dish
// IDs the committed source lock already recorded as skipped (never
// re-deriving new skips), confirms that reconstruction matches the
// committed manifest's dish sequence exactly, and then verifies every
// committed *selected* image one at a time — failing immediately on the
// first mismatch without ever considering another candidate.
//
// Before any of that, the caller (verifyCalibrationCorpus) confirms the
// committed manifest's `sourceLockHash` equals
// `hashCalibrationSourceLock(committedSourceLock)` — see below — so a
// tampered lock or stale hash never reaches a source/pool/image call. Every
// committed skip is then proven plausible: present in the eligible pool,
// carrying its actual nested stratum, targeting a schedule-required
// stratum, and ranking before an actually-selected member of that same
// stratum (so a fabricated skip for an irrelevant dish fails closed).
function validateCommittedSkips(
  pool: EligibleDish[],
  committedSkips: CalibrationSourceLock['skippedImages'],
  selected: EligibleDish[],
): void {
  const poolById = new Map(pool.map((dish) => [dish.dishId, dish]));
  const requiredKeys = new Set<string>();
  for (const slot of [...DEVELOPMENT_SLOT_SCHEDULE, ...VALIDATION_SLOT_SCHEDULE]) {
    requiredKeys.add(stratumKey(slot));
  }
  const selectedKeysByStratum = new Map<string, Array<{ rank: string; dishId: string }>>();
  for (const dish of selected) {
    const key = stratumKey(dish);
    const list = selectedKeysByStratum.get(key);
    const entry = { rank: rankHash(dish.dishId), dishId: dish.dishId };
    if (list) list.push(entry);
    else selectedKeysByStratum.set(key, [entry]);
  }
  for (const skipped of committedSkips) {
    const dish = poolById.get(skipped.dishId);
    if (!dish) {
      throw new Error(
        `calibration verification failed: committed skipped dish ${skipped.dishId} is absent from the eligible pool`,
      );
    }
    if (
      dish.componentBin !== skipped.stratum.componentBin ||
      dish.calorieBin !== skipped.stratum.calorieBin ||
      dish.macroBin !== skipped.stratum.macroBin
    ) {
      throw new Error(
        `calibration verification failed: committed skipped dish ${skipped.dishId} stratum does not match its pool stratum`,
      );
    }
    const key = stratumKey(skipped.stratum);
    if (!requiredKeys.has(key)) {
      throw new Error(
        `calibration verification failed: committed skipped dish ${skipped.dishId} stratum is not required by the schedule`,
      );
    }
    const selectedInStratum = selectedKeysByStratum.get(key) ?? [];
    if (selectedInStratum.length === 0) {
      throw new Error(
        `calibration verification failed: committed skipped dish ${skipped.dishId} has no selected member in its stratum`,
      );
    }
    const skippedRank = rankHash(skipped.dishId);
    const ranksBeforeSelected = selectedInStratum.some(
      (entry) => skippedRank < entry.rank || (skippedRank === entry.rank && skipped.dishId < entry.dishId),
    );
    if (!ranksBeforeSelected) {
      throw new Error(
        `calibration verification failed: committed skipped dish ${skipped.dishId} does not rank before a selected member of its stratum`,
      );
    }
  }
}

async function reconstructAndVerifyCommittedArtifacts(
  deps: Pick<CalibrationPublishDeps, 'buildSourceLock' | 'buildCandidatePool' | 'checkImage'>,
  committedManifest: StrictCalibrationManifest,
  committedSourceLock: CalibrationSourceLock,
): Promise<{ sourceLockBytes: Uint8Array; manifestBytes: Uint8Array }> {
  // Fresh exclusion reconstruction comes from the exact pinned source bytes
  // via buildSourceLock (see runVerify); never echo the committed list. This
  // exact canonical comparison runs before any candidate-pool/image work or
  // write, and selected-case overlap is rejected before any image check.
  const freshSourceLock = (await deps.buildSourceLock()) as Record<string, unknown>;
  const freshExcluded = (freshSourceLock['excludedDishes'] as
    | Array<{ dishId: string; reason: string }>
    | undefined) ?? [];
  const committedExcluded = (committedSourceLock.excludedDishes as
    | Array<{ dishId: string; reason: string }>
    | undefined) ?? [];
  const exclusionsMatch =
    freshExcluded.length === committedExcluded.length &&
    freshExcluded.every(
      (entry, index) =>
        entry.dishId === committedExcluded[index]!.dishId &&
        entry.reason === committedExcluded[index]!.reason,
    );
  if (!exclusionsMatch) {
    throw new Error(
      'calibration verification failed: reconstructed excludedDishes do not match the committed exclusions (exclusion mismatch)',
    );
  }

  const committedSelectedIds = new Set(
    committedManifest.cases.map((calibrationCase) => calibrationCase.source.objectId),
  );
  for (const excluded of committedExcluded) {
    if (committedSelectedIds.has(excluded.dishId)) {
      throw new Error(
        `calibration verification failed: excluded dish ${excluded.dishId} overlaps a selected case (exclusion conflict)`,
      );
    }
  }

  const pool = await deps.buildCandidatePool();

  const skipDishIds = new Set(committedSourceLock.skippedImages.map((skipped) => skipped.dishId));
  const { development, validation } = fillCalibrationSlots(pool, CALIBRATION_SCHEDULE, { skipDishIds });
  const selected = [...development, ...validation];

  validateCommittedSkips(pool, committedSourceLock.skippedImages, selected);

  const committedDishIds = committedManifest.cases.map((calibrationCase) => calibrationCase.source.objectId);
  const reconstructedDishIds = selected.map((dish) => dish.dishId);
  const selectionMatches =
    committedDishIds.length === reconstructedDishIds.length &&
    committedDishIds.every((dishId, index) => dishId === reconstructedDishIds[index]);
  if (!selectionMatches) {
    throw new Error(
      'calibration verification failed: the reconstructed selection does not match the committed manifest',
    );
  }

  const images = new Map<string, { sha256: string; width: number; height: number }>();
  for (const calibrationCase of committedManifest.cases) {
    const dishId = calibrationCase.source.objectId;
    const checked = await deps.checkImage(dishId);
    if (!checked.ok) {
      throw new Error(
        `calibration verification failed: committed image for ${dishId} no longer verifies (${checked.reason})`,
      );
    }
    if (
      checked.sha256 !== calibrationCase.image.sha256 ||
      checked.width !== calibrationCase.image.width ||
      checked.height !== calibrationCase.image.height
    ) {
      throw new Error(`calibration verification failed: committed image bytes for ${dishId} do not match`);
    }
    images.set(dishId, { sha256: checked.sha256, width: checked.width, height: checked.height });
  }

  // Rebuild bytes from the freshly derived lock (never merely echo the
  // committed exclusions): fresh and committed exclusion lists were already
  // proven exactly equal above, so this preserves byte equality while proving
  // provenance.
  const sourceLockWithSkips = {
    ...freshSourceLock,
    excludedDishes: freshExcluded,
    skippedImages: committedSourceLock.skippedImages,
  };
  const validatedSourceLock = CalibrationSourceLockSchema.parse(sourceLockWithSkips);
  const sourceLockHash = hashCalibrationSourceLock(validatedSourceLock);

  const cases = [
    ...development.map((dish, index) =>
      buildStrictCalibrationCase(dish, 'development', index, images.get(dish.dishId)!),
    ),
    ...validation.map((dish, index) =>
      buildStrictCalibrationCase(dish, 'validation', 24 + index, images.get(dish.dishId)!),
    ),
  ];
  const manifest = {
    version: 1,
    datasetId: CALIBRATION_DATASET_ID,
    sourceLockHash,
    cases,
  };
  const validatedManifest = StrictCalibrationManifestSchema.parse(manifest);

  const encoder = new TextEncoder();
  return {
    sourceLockBytes: encoder.encode(canonicalJsonStringify(validatedSourceLock)),
    manifestBytes: encoder.encode(canonicalJsonStringify(validatedManifest)),
  };
}

export async function verifyCalibrationCorpus(
  deps: CalibrationPublishDeps,
  paths: CalibrationPublishPaths,
): Promise<{ sourceLockBytes: Uint8Array; manifestBytes: Uint8Array }> {
  const [existingLockBytes, existingManifestBytes] = await Promise.all([
    deps.readArtifact(paths.sourceLockPath),
    deps.readArtifact(paths.manifestPath),
  ]);
  if (existingLockBytes === undefined || existingManifestBytes === undefined) {
    throw new Error('calibration source lock and manifest must both already exist to verify');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let committedSourceLock: CalibrationSourceLock;
  let committedManifest: StrictCalibrationManifest;
  try {
    committedSourceLock = CalibrationSourceLockSchema.parse(JSON.parse(decoder.decode(existingLockBytes)));
    committedManifest = StrictCalibrationManifestSchema.parse(JSON.parse(decoder.decode(existingManifestBytes)));
  } catch (error) {
    throw new Error(
      `committed calibration lock/manifest failed schema validation: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Fail closed before any source/pool/image dependency call: the committed
  // manifest must reference exactly the hash of the committed lock.
  const committedLockHash = hashCalibrationSourceLock(committedSourceLock);
  if (committedManifest.sourceLockHash !== committedLockHash) {
    throw new Error(
      'calibration verification failed: committed sourceLockHash does not match the committed source lock',
    );
  }

  const { sourceLockBytes, manifestBytes } = await reconstructAndVerifyCommittedArtifacts(
    deps,
    committedManifest,
    committedSourceLock,
  );

  if (!bytesEqual(existingLockBytes, sourceLockBytes)) {
    throw new Error('calibration source lock verification failed: rebuilt bytes do not match the committed lock');
  }
  if (!bytesEqual(existingManifestBytes, manifestBytes)) {
    throw new Error('calibration manifest verification failed: rebuilt bytes do not match the committed manifest');
  }

  return { sourceLockBytes, manifestBytes };
}

// ── Real filesystem/fetch orchestration and CLI ─────────────────────────────

export interface CalibrationCorpusRuntimePaths {
  repoRoot: string;
  sourceLockPath: string;
  manifestPath: string;
}

export function resolveCalibrationCorpusRuntimePaths(
  moduleDir = __dirname,
): CalibrationCorpusRuntimePaths {
  const repoRoot = resolve(moduleDir, '../../..');
  return {
    repoRoot,
    sourceLockPath: resolve(repoRoot, 'functions/eval/nutrition/calibration-source-lock.json'),
    manifestPath: resolve(repoRoot, 'functions/eval/nutrition/calibration-manifest.json'),
  };
}

async function realReadArtifact(path: string): Promise<Uint8Array | undefined> {
  try {
    const buf = await readFile(path);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function realWriteTempFile(finalPath: string, bytes: Uint8Array): Promise<string> {
  await mkdir(dirname(finalPath), { recursive: true });
  const tempPath = `${finalPath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  await writeFile(tempPath, bytes, { flag: 'wx' });
  return tempPath;
}

async function realRenameToFinal(tempPath: string, finalPath: string): Promise<void> {
  await rename(tempPath, finalPath);
}

async function realRemoveFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
  }
}

function forbidWrite(): never {
  throw new Error('calibration --verify must perform zero writes');
}

function toFetchImageFn(fetchFn: typeof fetch): FetchImageFn {
  return async (url: string) => {
    let response: Response;
    try {
      response = await fetchFn(url);
    } catch {
      throw new OverheadImageCheckError('fetch_error');
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new OverheadImageCheckError('fetch_error');
    }
    return { status: response.status, bytes };
  };
}

interface FetchedSource {
  bytes: Uint8Array;
  sha256: string;
  byteLength: number;
}

async function fetchSource(
  fetchFn: typeof fetch,
  path: string,
  expected?: ExpectedSourceBytes,
): Promise<FetchedSource> {
  const url = buildSourceUrl(path);
  const response = await fetchFn(url);
  if (response.status !== 200) {
    throw new Error(`calibration source fetch failed for ${path}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Hash-before-parse: the caller never parses these bytes before this
  // check has run (see runPin/runVerify below, which parse only after
  // fetchSource returns).
  if (expected) {
    verifyPinnedSourceBytes(bytes, expected);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { bytes, sha256, byteLength: bytes.length };
}

// Fetches each of the exact three pinned sources exactly once no matter how
// many times the returned function is called for the same path (buildLock
// and buildPool both need all three), keyed by path.
function createMemoizedSourceFetcher(
  fetchFn: typeof fetch,
  expectedByPath?: Partial<Record<string, ExpectedSourceBytes>>,
): (path: string) => Promise<FetchedSource> {
  const cache = new Map<string, Promise<FetchedSource>>();
  return (path: string) => {
    let promise = cache.get(path);
    if (!promise) {
      promise = fetchSource(fetchFn, path, expectedByPath?.[path]);
      cache.set(path, promise);
    }
    return promise;
  };
}

async function buildCandidatePoolFromFetchedSources(
  fetchOne: (path: string) => Promise<FetchedSource>,
): Promise<EligibleDish[]> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const [trainSplitFetched, cafe1Fetched, cafe2Fetched] = await Promise.all([
    fetchOne(CALIBRATION_SOURCE_PATHS.trainSplit),
    fetchOne(CALIBRATION_SOURCE_PATHS.metadataCafe1),
    fetchOne(CALIBRATION_SOURCE_PATHS.metadataCafe2),
  ]);
  const trainSplitIds = parseTrainSplit(decoder.decode(trainSplitFetched.bytes));
  const cafe1Rows = parseDishMetadataCsv(decoder.decode(cafe1Fetched.bytes));
  const cafe2Rows = parseDishMetadataCsv(decoder.decode(cafe2Fetched.bytes));
  const merged = mergeDishMetadata(cafe1Rows, cafe2Rows);
  return buildEligibleDishes(trainSplitIds, merged);
}

async function buildExcludedDishesFromFetchedSources(
  fetchOne: (path: string) => Promise<FetchedSource>,
): Promise<ExcludedDish[]> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const [trainSplitFetched, cafe1Fetched, cafe2Fetched] = await Promise.all([
    fetchOne(CALIBRATION_SOURCE_PATHS.trainSplit),
    fetchOne(CALIBRATION_SOURCE_PATHS.metadataCafe1),
    fetchOne(CALIBRATION_SOURCE_PATHS.metadataCafe2),
  ]);
  const trainSplitIds = parseTrainSplit(decoder.decode(trainSplitFetched.bytes));
  const cafe1Rows = parseDishMetadataCsv(decoder.decode(cafe1Fetched.bytes));
  const cafe2Rows = parseDishMetadataCsv(decoder.decode(cafe2Fetched.bytes));
  const merged = mergeDishMetadata(cafe1Rows, cafe2Rows);
  return buildExcludedDishes(trainSplitIds, merged);
}

async function runPin(paths: CalibrationCorpusRuntimePaths, fetchFn: typeof fetch): Promise<void> {
  const now = new Date();
  const fetchOne = createMemoizedSourceFetcher(fetchFn);

  const deps: CalibrationPublishDeps = {
    readArtifact: realReadArtifact,
    writeTempFile: realWriteTempFile,
    renameToFinal: realRenameToFinal,
    removeFile: realRemoveFile,
    buildSourceLock: async () => {
      const [trainSplitFetched, cafe1Fetched, cafe2Fetched] = await Promise.all([
        fetchOne(CALIBRATION_SOURCE_PATHS.trainSplit),
        fetchOne(CALIBRATION_SOURCE_PATHS.metadataCafe1),
        fetchOne(CALIBRATION_SOURCE_PATHS.metadataCafe2),
      ]);
      // Derive the canonical exclusions from the exact parsed pinned bytes;
      // totals are eligibility here, not parse errors, so structurally valid
      // zero/negative totals become typed exclusions rather than failures.
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const trainSplitIds = parseTrainSplit(decoder.decode(trainSplitFetched.bytes));
      const cafe1Rows = parseDishMetadataCsv(decoder.decode(cafe1Fetched.bytes));
      const cafe2Rows = parseDishMetadataCsv(decoder.decode(cafe2Fetched.bytes));
      const merged = mergeDishMetadata(cafe1Rows, cafe2Rows);
      const excludedDishes = buildExcludedDishes(trainSplitIds, merged);
      return {
        version: 1,
        datasetId: CALIBRATION_DATASET_ID,
        baseUrl: NUTRITION5K_BASE_URL,
        retrievalProvenance: { retrievedAt: now.toISOString(), baseUrl: NUTRITION5K_BASE_URL },
        sources: {
          trainSplit: {
            path: CALIBRATION_SOURCE_PATHS.trainSplit,
            url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.trainSplit),
            sha256: trainSplitFetched.sha256,
            byteLength: trainSplitFetched.byteLength,
          },
          metadataCafe1: {
            path: CALIBRATION_SOURCE_PATHS.metadataCafe1,
            url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe1),
            sha256: cafe1Fetched.sha256,
            byteLength: cafe1Fetched.byteLength,
          },
          metadataCafe2: {
            path: CALIBRATION_SOURCE_PATHS.metadataCafe2,
            url: buildSourceUrl(CALIBRATION_SOURCE_PATHS.metadataCafe2),
            sha256: cafe2Fetched.sha256,
            byteLength: cafe2Fetched.byteLength,
          },
        },
        excludedDishes,
      };
    },
    buildCandidatePool: () => buildCandidatePoolFromFetchedSources(fetchOne),
    checkImage: buildCheckImage(toFetchImageFn(fetchFn)),
  };

  await pinCalibrationCorpus(deps, { sourceLockPath: paths.sourceLockPath, manifestPath: paths.manifestPath });
}

async function runVerify(paths: CalibrationCorpusRuntimePaths, fetchFn: typeof fetch): Promise<void> {
  const existingLockBytes = await realReadArtifact(paths.sourceLockPath);
  if (existingLockBytes === undefined) {
    throw new Error('calibration source lock must already exist to verify');
  }
  const committedLock = CalibrationSourceLockSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(existingLockBytes)),
  );

  const fetchOne = createMemoizedSourceFetcher(fetchFn, {
    [CALIBRATION_SOURCE_PATHS.trainSplit]: committedLock.sources.trainSplit,
    [CALIBRATION_SOURCE_PATHS.metadataCafe1]: committedLock.sources.metadataCafe1,
    [CALIBRATION_SOURCE_PATHS.metadataCafe2]: committedLock.sources.metadataCafe2,
  });

  const deps: CalibrationPublishDeps = {
    readArtifact: realReadArtifact,
    writeTempFile: forbidWrite,
    renameToFinal: forbidWrite,
    removeFile: forbidWrite,
    // Verify never re-timestamps or re-derives the lock's own provenance or
    // sources; it only fetches fresh bytes to confirm they still hash-match
    // (done inside fetchOne/fetchSource), freshly reconstructs the canonical
    // exclusions from those exact pinned bytes, and reuses the committed
    // record verbatim for everything else.
    buildSourceLock: async () => {
      const excludedDishes = await buildExcludedDishesFromFetchedSources(fetchOne);
      return { ...committedLock, excludedDishes };
    },
    buildCandidatePool: () => buildCandidatePoolFromFetchedSources(fetchOne),
    checkImage: buildCheckImage(toFetchImageFn(fetchFn)),
  };

  await verifyCalibrationCorpus(deps, { sourceLockPath: paths.sourceLockPath, manifestPath: paths.manifestPath });
}

export interface CalibrationCorpusCliDependencies {
  fetchFn?: typeof fetch;
  runtimePaths?: CalibrationCorpusRuntimePaths;
}

export interface CalibrationCorpusCliResult {
  exitCode: 0 | 1;
  message?: string;
}

export async function runCalibrationCorpusCli(
  argv: readonly string[],
  deps: CalibrationCorpusCliDependencies = {},
): Promise<CalibrationCorpusCliResult> {
  // Strict argv contract, checked before resolving paths or touching the
  // network: exactly one argument, and it must be exactly `--pin` or exactly
  // `--verify`. Unknown flags, positional arguments, empty strings, and
  // duplicates (which necessarily have length !== 1) all fail here.
  if (argv.length !== 1 || (argv[0] !== '--pin' && argv[0] !== '--verify')) {
    return { exitCode: 1, message: 'exactly one of --pin or --verify is required' };
  }
  const wantsPin = argv[0] === '--pin';

  const paths = deps.runtimePaths ?? resolveCalibrationCorpusRuntimePaths();
  const fetchFn = deps.fetchFn ?? fetch;

  try {
    if (wantsPin) {
      await runPin(paths, fetchFn);
    } else {
      await runVerify(paths, fetchFn);
    }
    return { exitCode: 0 };
  } catch (error) {
    return { exitCode: 1, message: error instanceof Error ? error.message : String(error) };
  }
}

if (require.main === module) {
  void runCalibrationCorpusCli(process.argv.slice(2)).then((result) => {
    if (result.exitCode !== 0) {
      console.error(result.message ?? 'calibration corpus failed');
    }
    process.exitCode = result.exitCode;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : 'calibration corpus failed');
    process.exitCode = 1;
  });
}
