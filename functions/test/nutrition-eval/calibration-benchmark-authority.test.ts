/**
 * Calibration benchmark authority native foundation and feature RED
 * (Task 2 Step 1 and Step 2).
 *
 * Qualifies buildBenchmarkTemplate against the existing native
 * preparer/preflight/publication/ledger APIs only (Step 1). Step 2 opens
 * the already-qualified LOW/MEDIUM templates through the planned
 * copyBenchmarkTemplate/openBenchmarkTemplate/openBenchmarkBase surface and
 * calls prepareNativeCalibrationBenchmarkAuthorityLedger. At the original
 * Step 2 handoff that export did not exist in frozen source yet; the import
 * and its call sites were an intentional feature RED and never a stub. The
 * opt-in native benchmark-authority factory is now implemented, so those
 * cases qualify the real export. The Step 4 matrix below appends
 * compatibility/prefix/before-idempotence controls; no production source is
 * implemented or stubbed in this file.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CALIBRATION_ROOT } from "../../src/nutrition-eval/calibration";
import type { CalibrationProfile } from "../../src/nutrition-eval/calibration";
import {
  createCalibrationBootstrapReadDeps,
  prepareCalibrationBootstrapContext,
} from "../../src/nutrition-eval/calibration-bootstrap";
import {
  prepareNativeCalibrationBenchmarkAuthorityLedger,
  prepareNativeCalibrationRuntimeEvidenceLedger,
} from "../../src/nutrition-eval/calibration-runtime-evidence-ledger";
import { measureCalibrationStageReport } from "../../src/nutrition-eval/calibration-report-measurements";
import type { CalibrationStageGateMetrics } from "../../src/nutrition-eval/calibration-report-measurements";
import {
  buildBenchmarkTemplate,
  copyBenchmarkTemplate,
  openBenchmarkBase,
  openBenchmarkTemplate,
} from "./calibration-benchmark-authority-fixtures";
import type { BenchmarkTemplate } from "./calibration-benchmark-authority-fixtures";
import { makeMiniGitRepoTask4 } from "./calibration-runtime-evidence-fixtures";

const TEST_TIMEOUT = 600000;
const SMALL_TEST_TIMEOUT = 5000;

type RawRow = Record<string, unknown>;

function readRawEvents(baseDir: string): RawRow[] {
  const text = readFileSync(resolve(baseDir, CALIBRATION_ROOT, "ledger.json"), "utf8");
  return JSON.parse(text) as RawRow[];
}

function rowType(row: RawRow): string {
  const value = row["type"];
  return typeof value === "string" ? value : "";
}

function rowKeyStage(row: RawRow): string | undefined {
  const key = row["key"];
  if (typeof key !== "object" || key === null) return undefined;
  const stage = (key as RawRow)["stage"];
  return typeof stage === "string" ? stage : undefined;
}

function rowString(row: RawRow, field: string): string | undefined {
  const value = row[field];
  return typeof value === "string" ? value : undefined;
}

function rowBoolean(row: RawRow, field: string): boolean | undefined {
  const value = row[field];
  return typeof value === "boolean" ? value : undefined;
}

function readReportMeasuredStage(baseDir: string, stage: string, profile: string): Readonly<CalibrationStageGateMetrics> {
  const path = resolve(baseDir, CALIBRATION_ROOT, "reports", `${stage}-${profile.toLowerCase()}.json`);
  const report: unknown = JSON.parse(readFileSync(path, "utf8"));
  return measureCalibrationStageReport(report).stage;
}

function assertNativeFoundation(template: Readonly<BenchmarkTemplate>, losingProfile: CalibrationProfile): void {
  const events = readRawEvents(template.baseDir);

  const started = events.filter((row) => rowType(row) === "runtime_attempt_started");
  const finished = events.filter((row) => rowType(row) === "runtime_attempt_finished");
  expect(started.length).toBe(158);
  expect(finished.length).toBe(158);

  const completed = events.filter((row) => rowType(row) === "completed");
  const nonReservation = events.filter((row) => rowType(row) === "non_reservation_result");
  expect(completed.length).toBe(146);
  expect(nonReservation.length).toBe(12);
  expect(completed.length + nonReservation.length).toBe(158);
  expect(nonReservation.every((row) => rowKeyStage(row) === "benchmark")).toBe(true);

  const stageCount = (rows: RawRow[], stage: string): number =>
    rows.filter((row) => rowKeyStage(row) === stage).length;
  expect(stageCount(completed, "preflight") + stageCount(nonReservation, "preflight")).toBe(2);
  expect(stageCount(completed, "development") + stageCount(nonReservation, "development")).toBe(48);
  expect(stageCount(completed, "validation") + stageCount(nonReservation, "validation")).toBe(48);
  expect(stageCount(completed, "benchmark")).toBe(48);
  expect(stageCount(nonReservation, "benchmark")).toBe(12);

  const bound = events.filter((row) => rowType(row) === "runtime_report_bound");
  expect(bound.length).toBe(6);
  for (const row of bound) {
    expect(rowString(row, "bindingSha256")).toMatch(/^[0-9a-f]{64}$/);
  }
  const boundPairs = new Set(bound.map((row) => `${rowString(row, "stage")}|${rowString(row, "profile")}`));
  expect(boundPairs).toEqual(new Set([
    "preflight|LOW", "preflight|MEDIUM", "development|LOW", "development|MEDIUM",
    `validation|${template.profile}`, `benchmark|${template.profile}`,
  ]));

  const tokenCompleted = events.filter((row) => rowType(row) === "token_count_completed");
  expect(tokenCompleted.length).toBe(1);

  const stageCompleted = events.filter((row) => rowType(row) === "stage_completed");
  expect(stageCompleted.map((row) => rowString(row, "stage"))).toEqual(["preflight", "development", "validation"]);
  expect(stageCompleted.every((row) => rowBoolean(row, "passed") === true)).toBe(true);

  const profileSelected = events.filter((row) => rowType(row) === "profile_selected");
  expect(profileSelected.length).toBe(1);
  const selectedRow = profileSelected[0] as RawRow;
  expect(rowString(selectedRow, "profile")).toBe(template.profile);
  expect(rowString(selectedRow, "reason")).toBe("higher_parse");

  const lockPath = resolve(template.baseDir, CALIBRATION_ROOT, "lock.json");
  expect(existsSync(lockPath)).toBe(false);

  const onDiskEventBytes = readFileSync(resolve(template.baseDir, CALIBRATION_ROOT, "ledger.json"));
  expect(template.eventBytes.equals(onDiskEventBytes)).toBe(true);
  const onDiskJournalBytes = readFileSync(resolve(template.baseDir, CALIBRATION_ROOT, "journal.json"));
  expect(template.journalBytes.equals(onDiskJournalBytes)).toBe(true);

  const winningDevelopment = readReportMeasuredStage(template.baseDir, "development", template.profile);
  expect(winningDevelopment.failureCount).toBe(0);
  const losingDevelopment = readReportMeasuredStage(template.baseDir, "development", losingProfile);
  expect(losingDevelopment.failureCount).toBe(1);

  for (const profile of ["LOW", "MEDIUM"] as const) {
    const preflight = readReportMeasuredStage(template.baseDir, "preflight", profile);
    expect(preflight.totalOutcomes).toBe(1);
    expect(preflight.parseCases).toBe(1);
    expect(preflight.failureCount).toBe(0);
    expect(preflight.unsafeCompletionCount).toBe(0);
  }
}

interface CalibrationRootEntrySnapshot {
  readonly kind: "file" | "directory" | "symlink";
  readonly mode: number;
  readonly sha256?: string;
}

interface CalibrationRootSnapshot {
  readonly rootExists: boolean;
  readonly entries: Readonly<Record<string, CalibrationRootEntrySnapshot>>;
}

/**
 * Actual recursive directory/file/symlink inventory under .calibration:
 * root existence, every entry kind and mode bits, and sha256 of real file
 * bytes for regular files. Never follows symlinks (lstat-based). Excludes
 * atime/mtime/ctime/inode, which are not native-authority signal here.
 */
function snapshotCalibrationRoot(baseDir: string): CalibrationRootSnapshot {
  const root = resolve(baseDir, CALIBRATION_ROOT);
  const rootExists = existsSync(root);
  const entries: Record<string, CalibrationRootEntrySnapshot> = {};
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const full = resolve(dir, entry.name);
      const stat = lstatSync(full);
      if (entry.isSymbolicLink()) {
        entries[rel] = { kind: "symlink", mode: stat.mode };
      } else if (entry.isDirectory()) {
        entries[rel] = { kind: "directory", mode: stat.mode };
        walk(full, rel);
      } else if (entry.isFile()) {
        entries[rel] = {
          kind: "file", mode: stat.mode,
          sha256: createHash("sha256").update(readFileSync(full)).digest("hex"),
        };
      }
    }
  };
  if (rootExists) {
    walk(root, "");
  }
  return Object.freeze({ rootExists, entries: Object.freeze(entries) });
}

const sharedRoots: string[] = [];
let lowTemplate: BenchmarkTemplate | undefined;
let mediumTemplate: BenchmarkTemplate | undefined;

afterAll(() => {
  for (const root of sharedRoots) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Best-effort owned cleanup only; registered roots are task-owned temp dirs.
    }
  }
});

describe.sequential("native foundation", () => {
  it("builds a prior-failure LOW-selected benchmark template", async () => {
    lowTemplate = await buildBenchmarkTemplate(sharedRoots, "LOW");
    expect(lowTemplate).toBeDefined();
    assertNativeFoundation(lowTemplate, "MEDIUM");
  }, TEST_TIMEOUT);

  it("builds a prior-failure MEDIUM-selected benchmark template", async () => {
    mediumTemplate = await buildBenchmarkTemplate(sharedRoots, "MEDIUM");
    expect(mediumTemplate).toBeDefined();
    assertNativeFoundation(mediumTemplate, "LOW");
  }, TEST_TIMEOUT);
});

function requireTemplate(profile: CalibrationProfile): Readonly<BenchmarkTemplate> {
  const template = profile === "LOW" ? lowTemplate : mediumTemplate;
  if (template === undefined) {
    throw new Error(
      `${profile} template was not assigned by the native foundation suite; it must run first and succeed.`,
    );
  }
  return template;
}

describe.sequential("native benchmark authority (feature RED)", () => {
  it("completes a verified LOW benchmark once through the new native factory", async () => {
    const template = requireTemplate("LOW");
    const f = await openBenchmarkTemplate(sharedRoots, template);
    const before = f.readEvents();
    f.ledger.completeStage("benchmark", {
      stage: "benchmark", passed: true,
      completedStages: ["preflight", "development", "validation"],
    });
    const after = f.readEvents();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toEqual([
      expect.objectContaining({ type: "stage_completed", stage: "benchmark", passed: true }),
    ]);
    expect(f.ledger.getCompletedStages()).toEqual(["preflight", "development", "validation", "benchmark"]);
    f.ledger.releaseLock({ ...f.context.owner });
  }, TEST_TIMEOUT);

  it("completes a verified MEDIUM benchmark once through the new native factory", async () => {
    const template = requireTemplate("MEDIUM");
    const f = await openBenchmarkTemplate(sharedRoots, template);
    const before = f.readEvents();
    f.ledger.completeStage("benchmark", {
      stage: "benchmark", passed: true,
      completedStages: ["preflight", "development", "validation"],
    });
    const after = f.readEvents();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toEqual([
      expect.objectContaining({ type: "stage_completed", stage: "benchmark", passed: true }),
    ]);
    expect(f.ledger.getCompletedStages()).toEqual(["preflight", "development", "validation", "benchmark"]);
    f.ledger.releaseLock({ ...f.context.owner });
  }, TEST_TIMEOUT);

  it("leaves a fresh bootstrap base untouched by read-only context preparation", async () => {
    const mini = makeMiniGitRepoTask4(sharedRoots);
    const before = snapshotCalibrationRoot(mini.root);
    const readDeps = createCalibrationBootstrapReadDeps(mini.root);
    await prepareCalibrationBootstrapContext(readDeps);
    const after = snapshotCalibrationRoot(mini.root);
    expect(after).toEqual(before);
    expect(after.rootExists).toBe(false);
  }, SMALL_TEST_TIMEOUT);

  it("performs zero-effect new-preparer construction on a fresh root", async () => {
    const mini = makeMiniGitRepoTask4(sharedRoots);
    const readDeps = createCalibrationBootstrapReadDeps(mini.root);
    const context = await prepareCalibrationBootstrapContext(readDeps);
    const before = snapshotCalibrationRoot(mini.root);
    await prepareNativeCalibrationBenchmarkAuthorityLedger({ context });
    const after = snapshotCalibrationRoot(mini.root);
    expect(after).toEqual(before);
    expect(after.rootExists).toBe(false);
  }, SMALL_TEST_TIMEOUT);

  it("performs zero-effect new-preparer construction on a copied full released template", async () => {
    const template = requireTemplate("LOW");
    const baseDir = copyBenchmarkTemplate(sharedRoots, template);
    const readDeps = createCalibrationBootstrapReadDeps(baseDir);
    const context = await prepareCalibrationBootstrapContext(readDeps);
    const before = snapshotCalibrationRoot(baseDir);
    await prepareNativeCalibrationBenchmarkAuthorityLedger({ context });
    const after = snapshotCalibrationRoot(baseDir);
    expect(after).toEqual(before);
  }, TEST_TIMEOUT);

  it.each([
    ["referencePath", { referencePath: "/tmp/calorix-benchmark-authority-reference" }],
    ["verifier", { verifier: {} }],
    ["plans", { plans: {} }],
    ["permission", { permission: true }],
  ])("rejects an existing-factory opt-in attempt via an extra %s field", async (_label, extra) => {
    const mini = makeMiniGitRepoTask4(sharedRoots);
    const readDeps = createCalibrationBootstrapReadDeps(mini.root);
    const context = await prepareCalibrationBootstrapContext(readDeps);
    const before = snapshotCalibrationRoot(mini.root);
    await expect(
      prepareNativeCalibrationRuntimeEvidenceLedger({ context, ...extra } as unknown),
    ).rejects.toThrow();
    const after = snapshotCalibrationRoot(mini.root);
    expect(after).toEqual(before);
    expect(after.rootExists).toBe(false);
    const lockPath = resolve(mini.root, CALIBRATION_ROOT, "lock.json");
    expect(existsSync(lockPath)).toBe(false);
  }, SMALL_TEST_TIMEOUT);

  it.each([
    ["referencePath", { referencePath: "/tmp/calorix-benchmark-authority-reference" }],
    ["verifier", { verifier: {} }],
    ["plans", { plans: {} }],
    ["permission", { permission: true }],
  ])("rejects a new-preparer opt-in attempt via an extra %s field", async (_label, extra) => {
    const mini = makeMiniGitRepoTask4(sharedRoots);
    const readDeps = createCalibrationBootstrapReadDeps(mini.root);
    const context = await prepareCalibrationBootstrapContext(readDeps);
    const before = snapshotCalibrationRoot(mini.root);
    await expect(
      prepareNativeCalibrationBenchmarkAuthorityLedger({ context, ...extra } as unknown),
    ).rejects.toThrow("calibration:benchmark-authority-native-input-invalid");
    const after = snapshotCalibrationRoot(mini.root);
    expect(after).toEqual(before);
    expect(after.rootExists).toBe(false);
    const lockPath = resolve(mini.root, CALIBRATION_ROOT, "lock.json");
    expect(existsSync(lockPath)).toBe(false);
  }, SMALL_TEST_TIMEOUT);
});

// ── Task 2 Step 4: pinned compatibility, prefix and before-idempotence controls ──
//
// Every case below operates on a fresh copy of an actual released LOW/MEDIUM
// template built by the two explicit native-foundation cases above. A targeted
// tamper edits one independently identified real record in the copy and then
// invokes the real native constructor (constructor-replay boundary) or the
// explicit native acquisition/completion boundary. These are tamper-rejection
// controls: they assert the constructor refuses malformed history, leaves the
// tampered bytes and creates no lock. They never recompute, relabel or repair
// hashes, journals, receipts or bindings, and a genuine positive authority is
// never synthesized from caller-shaped data.

type LedgerRow = Record<string, unknown>;

function readLedgerRows(baseDir: string): LedgerRow[] {
  const path = resolve(baseDir, CALIBRATION_ROOT, "ledger.json");
  return JSON.parse(readFileSync(path, "utf8")) as LedgerRow[];
}

function writeLedgerRows(baseDir: string, rows: readonly LedgerRow[]): void {
  const path = resolve(baseDir, CALIBRATION_ROOT, "ledger.json");
  writeFileSync(path, JSON.stringify(rows), { mode: 0o600 });
}

function ledgerPathOf(baseDir: string): string {
  return resolve(baseDir, CALIBRATION_ROOT, "ledger.json");
}

function lockPathOf(baseDir: string): string {
  return resolve(baseDir, CALIBRATION_ROOT, "lock.json");
}

async function expectConstructorRejectionLeavesHistoryIntact(
  baseDir: string,
  before: Buffer,
): Promise<void> {
  const beforeSnapshot = snapshotCalibrationRoot(baseDir);
  const context = await prepareCalibrationBootstrapContext(
    createCalibrationBootstrapReadDeps(baseDir),
  );
  await expect(
    prepareNativeCalibrationBenchmarkAuthorityLedger({ context }),
  ).rejects.toThrow();
  expect(readFileSync(ledgerPathOf(baseDir))).toEqual(before);
  expect(existsSync(lockPathOf(baseDir))).toBe(false);
  expect(snapshotCalibrationRoot(baseDir)).toEqual(beforeSnapshot);
}

function indicesOf(rows: readonly LedgerRow[], predicate: (row: LedgerRow) => boolean): number[] {
  const found: number[] = [];
  rows.forEach((row, index) => {
    if (predicate(row)) found.push(index);
  });
  return found;
}

function requireExactlyOneIndex(rows: readonly LedgerRow[], predicate: (row: LedgerRow) => boolean, label: string): number {
  const found = indicesOf(rows, predicate);
  if (found.length !== 1) {
    throw new Error(`expected exactly one ${label} row, found ${found.length}`);
  }
  return found[0] as number;
}

function stageProfileOf(row: LedgerRow): string {
  return `${String(row["stage"])}|${String(row["profile"])}`;
}

function sameReservationKey(a: LedgerRow, b: LedgerRow): boolean {
  return a["stage"] === b["stage"] && a["profile"] === b["profile"]
    && a["caseId"] === b["caseId"] && a["sampleIndex"] === b["sampleIndex"];
}

// Population of the 48 real benchmark `completed` (image) rows. Selecting
// index 0 only after this population assertion is the independent
// literal-population check the Step 4 correction requires: it proves 48
// real rows exist, then a single canonical key is derived from one of them
// and every further lookup is keyed on that exact stage/profile/caseId/
// sampleIndex tuple, never on a bare stage filter that could match many rows.
function benchmarkCompletedIndices(rows: readonly LedgerRow[]): number[] {
  return indicesOf(
    rows,
    (row) => row["type"] === "completed"
      && row["key"] !== null && typeof row["key"] === "object"
      && (row["key"] as LedgerRow)["stage"] === "benchmark",
  );
}

function oneBenchmarkCanonicalKey(rows: readonly LedgerRow[]): LedgerRow {
  const indices = benchmarkCompletedIndices(rows);
  expect(indices.length).toBe(48);
  return (rows[indices[0] as number] as LedgerRow)["key"] as LedgerRow;
}

function journalPathOf(baseDir: string): string {
  return resolve(baseDir, CALIBRATION_ROOT, "journal.json");
}

function readJournalRows(baseDir: string): LedgerRow[] {
  return JSON.parse(readFileSync(journalPathOf(baseDir), "utf8")) as LedgerRow[];
}

function writeJournalRows(baseDir: string, rows: readonly LedgerRow[]): void {
  writeFileSync(journalPathOf(baseDir), JSON.stringify(rows), { mode: 0o600 });
}

function journalHashOf(entry: LedgerRow): string {
  return createHash("sha256").update(JSON.stringify(entry)).digest("hex");
}

/** Fresh copy, acquire, complete benchmark once, release. Used by controls
 * that need an independently constructed object over a released, completed
 * history (Matrix items 9 and 10). */
async function seedHealthyCompletedBenchmarkCopy(): Promise<string> {
  const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
  const seed = await openBenchmarkBase(baseDir);
  seed.ledger.completeStage("benchmark", {
    stage: "benchmark", passed: true,
    completedStages: ["preflight", "development", "validation"],
  });
  seed.ledger.releaseLock({ ...seed.context.owner });
  return baseDir;
}

/** Fresh copy, acquire, complete benchmark, then repeat completion on the
 * SAME acquired instance (idempotent for the completion record) while the
 * lock is still held. The returned instance keeps its lock; callers that
 * further poison it must not release it as cleanup (Matrix item 8). */
async function openAndIdempotentlyCompleteBenchmark() {
  const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
  const f = await openBenchmarkBase(baseDir);
  f.ledger.completeStage("benchmark", {
    stage: "benchmark", passed: true,
    completedStages: ["preflight", "development", "validation"],
  });
  const afterFirst = readLedgerRows(baseDir);
  const firstCompletions = afterFirst.filter(
    (row) => row["type"] === "stage_completed" && row["stage"] === "benchmark",
  );
  expect(firstCompletions.length).toBe(1);
  const beforeRepeat = snapshotCalibrationRoot(baseDir);
  f.ledger.completeStage("benchmark", {
    stage: "benchmark", passed: true,
    completedStages: ["preflight", "development", "validation"],
  });
  expect(readLedgerRows(baseDir)).toEqual(afterFirst);
  expect(snapshotCalibrationRoot(baseDir)).toEqual(beforeRepeat);
  return { baseDir, f };
}

const SIX_PAIRS: readonly (readonly [string, string])[] = [
  ["preflight", "LOW"],
  ["preflight", "MEDIUM"],
  ["development", "LOW"],
  ["development", "MEDIUM"],
  ["validation", "MEDIUM"],
  ["benchmark", "MEDIUM"],
];

describe.sequential("native benchmark authority compatibility controls (feature RED)", () => {
  // Matrix item 1: removing any one of the six real artifact_receipt_admitted
  // records must make the constructor reject without touching the copy.
  it.each(SIX_PAIRS)(
    "rejects constructor replay when the %s|%s receipt-admission record is removed",
    async (stage, profile) => {
      const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
      const rows = readLedgerRows(baseDir);
      const target = requireExactlyOneIndex(
        rows,
        (row) => row["type"] === "artifact_receipt_admitted"
          && row["receipt"] !== null && typeof row["receipt"] === "object"
          && (row["receipt"] as LedgerRow)["stage"] === stage
          && (row["receipt"] as LedgerRow)["profile"] === profile,
        `artifact_receipt_admitted ${stage}|${profile}`,
      );
      rows.splice(target, 1);
      writeLedgerRows(baseDir, rows);
      const before = readFileSync(ledgerPathOf(baseDir));
      await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
    },
    TEST_TIMEOUT,
  );

  // Matrix item 3a: a wrong stored throughSequence in the real benchmark bound
  // record is tamper, not positive authority.
  it("rejects constructor replay when a stored throughSequence is wrong", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "runtime_report_bound"
        && row["stage"] === "benchmark" && row["profile"] === "MEDIUM",
      "benchmark runtime_report_bound",
    );
    const original = rows[target] as LedgerRow;
    expect(typeof original["throughSequence"]).toBe("number");
    (rows[target] as LedgerRow)["throughSequence"] = (original["throughSequence"] as number) + 1;
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 7: a healthy clean release/reopen through the current native
  // preparer/acquisition leaves the original six binding records/cutoffs/digests
  // unchanged and completion still succeeds.
  it("reopens a released template and completes while preserving binding cutoffs", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const before = readLedgerRows(baseDir);
    const bindingDigestsBefore = before
      .filter((row) => row["type"] === "runtime_report_bound")
      .map((row) => `${stageProfileOf(row)}|${String(row["throughSequence"])}|${String(row["bindingSha256"])}`);
    expect(bindingDigestsBefore.length).toBe(6);
    const f = await openBenchmarkBase(baseDir);
    f.ledger.completeStage("benchmark", {
      stage: "benchmark", passed: true,
      completedStages: ["preflight", "development", "validation"],
    });
    const after = readLedgerRows(baseDir);
    const bindingDigestsAfter = after
      .filter((row) => row["type"] === "runtime_report_bound")
      .map((row) => `${stageProfileOf(row)}|${String(row["throughSequence"])}|${String(row["bindingSha256"])}`);
    expect(bindingDigestsAfter).toEqual(bindingDigestsBefore);
    expect(f.ledger.getCompletedStages()).toEqual(["preflight", "development", "validation", "benchmark"]);
    const benchmarkCompletions = after.filter(
      (row) => row["type"] === "stage_completed" && row["stage"] === "benchmark",
    );
    expect(benchmarkCompletions.length).toBe(1);
    f.ledger.releaseLock({ ...f.context.owner });
  }, TEST_TIMEOUT);

  // Matrix item 8a: healthy repeated completion on the SAME acquired instance
  // is idempotent for the completion record, exercised before any corruption.
  it("repeated completion on the same healthy acquired ledger is idempotent before any corruption", async () => {
    await openAndIdempotentlyCompleteBenchmark();
  }, TEST_TIMEOUT);

  // Matrix item 8b: after the same healthy acquired instance has already
  // completed (and idempotently repeated), corrupting the benchmark JSON
  // artifact while the legitimate lock is still held must reject completion,
  // retain the corruption and the existing completion, and the poisoned
  // instance must have no further effect on a second poisoned call. A
  // poisoned instance is never released as cleanup.
  it("rejects repeated completion and repairs nothing when the benchmark JSON artifact is corrupted while the lock is held", async () => {
    const { baseDir, f } = await openAndIdempotentlyCompleteBenchmark();
    const jsonPath = resolve(baseDir, CALIBRATION_ROOT, "reports", "benchmark-medium.json");
    expect(existsSync(jsonPath)).toBe(true);
    const corruptJson = Buffer.from("{\"corrupted\":true}", "utf8");
    writeFileSync(jsonPath, corruptJson, { mode: 0o600 });
    const ledgerBefore = readFileSync(ledgerPathOf(baseDir));
    const rootAfterCorruption = snapshotCalibrationRoot(baseDir);

    expect(() => f.ledger.completeStage("benchmark", {
      stage: "benchmark", passed: true,
      completedStages: ["preflight", "development", "validation"],
    })).toThrow();
    expect(readFileSync(jsonPath)).toEqual(corruptJson);
    expect(readFileSync(ledgerPathOf(baseDir))).toEqual(ledgerBefore);
    expect(snapshotCalibrationRoot(baseDir)).toEqual(rootAfterCorruption);

    expect(() => f.ledger.completeStage("benchmark", {
      stage: "benchmark", passed: true,
      completedStages: ["preflight", "development", "validation"],
    })).toThrow();
    expect(readFileSync(jsonPath)).toEqual(corruptJson);
    expect(readFileSync(ledgerPathOf(baseDir))).toEqual(ledgerBefore);
    expect(snapshotCalibrationRoot(baseDir)).toEqual(rootAfterCorruption);
    const rows = readLedgerRows(baseDir);
    const benchmarkCompletions = rows.filter(
      (row) => row["type"] === "stage_completed" && row["stage"] === "benchmark",
    );
    expect(benchmarkCompletions.length).toBe(1);
  }, TEST_TIMEOUT);

  // Matrix item 8c: the Markdown artifact corruption is an independent fresh
  // copy/case from the JSON corruption above, not combined with it.
  it("rejects repeated completion and repairs nothing when the benchmark Markdown artifact is corrupted while the lock is held", async () => {
    const { baseDir, f } = await openAndIdempotentlyCompleteBenchmark();
    const mdPath = resolve(baseDir, CALIBRATION_ROOT, "reports", "benchmark-medium.md");
    expect(existsSync(mdPath)).toBe(true);
    const corruptMd = Buffer.from("corrupted markdown", "utf8");
    writeFileSync(mdPath, corruptMd, { mode: 0o600 });
    const ledgerBefore = readFileSync(ledgerPathOf(baseDir));
    const rootAfterCorruption = snapshotCalibrationRoot(baseDir);

    expect(() => f.ledger.completeStage("benchmark", {
      stage: "benchmark", passed: true,
      completedStages: ["preflight", "development", "validation"],
    })).toThrow();
    expect(readFileSync(mdPath)).toEqual(corruptMd);
    expect(readFileSync(ledgerPathOf(baseDir))).toEqual(ledgerBefore);
    expect(snapshotCalibrationRoot(baseDir)).toEqual(rootAfterCorruption);

    expect(() => f.ledger.completeStage("benchmark", {
      stage: "benchmark", passed: true,
      completedStages: ["preflight", "development", "validation"],
    })).toThrow();
    expect(readFileSync(mdPath)).toEqual(corruptMd);
    expect(readFileSync(ledgerPathOf(baseDir))).toEqual(ledgerBefore);
    expect(snapshotCalibrationRoot(baseDir)).toEqual(rootAfterCorruption);
    const rows = readLedgerRows(baseDir);
    const benchmarkCompletions = rows.filter(
      (row) => row["type"] === "stage_completed" && row["stage"] === "benchmark",
    );
    expect(benchmarkCompletions.length).toBe(1);
  }, TEST_TIMEOUT);

  // Matrix item 9: a fresh new constructor over structurally completed history
  // provisionally accepts it (constructor replay grants no current-owner
  // authority). Three independent instances isolate each boundary: (1) a
  // query-only instance proves an authority query before acquisition rejects
  // on its own; (2) an uncorrupted control instance proves acquisition is
  // otherwise genuinely reachable and successful; (3) a query-free instance
  // that is corrupted only AFTER construction proves the changed artifact
  // alone blocks authority at explicit acquisition. None of these instances
  // is reused across boundaries, so no check can pass for the wrong reason.
  it("changed benchmark artifact blocks authority at explicit acquisition", async () => {
    const queryBaseDir = await seedHealthyCompletedBenchmarkCopy();
    const queryContext = await prepareCalibrationBootstrapContext(
      createCalibrationBootstrapReadDeps(queryBaseDir),
    );
    const query = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context: queryContext });
    expect(() => query.getCompletedStages()).toThrow(
      "calibration:runtime-operation-failed",
    );

    const controlBaseDir = await seedHealthyCompletedBenchmarkCopy();
    const controlContext = await prepareCalibrationBootstrapContext(
      createCalibrationBootstrapReadDeps(controlBaseDir),
    );
    const control = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context: controlContext });
    expect(() => control.acquireLock({ ...controlContext.owner })).not.toThrow();
    expect(control.getCompletedStages()).toEqual(
      ["preflight", "development", "validation", "benchmark"],
    );
    control.releaseLock({ ...controlContext.owner });

    const poisonedBaseDir = await seedHealthyCompletedBenchmarkCopy();
    const poisonedContext = await prepareCalibrationBootstrapContext(
      createCalibrationBootstrapReadDeps(poisonedBaseDir),
    );
    const poisoned = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context: poisonedContext });
    const jsonPath = resolve(poisonedBaseDir, CALIBRATION_ROOT, "reports", "benchmark-medium.json");
    const original = readFileSync(jsonPath);
    const corrupted = Buffer.from(`${original.toString("utf8")} `, "utf8");
    writeFileSync(jsonPath, corrupted, { mode: 0o600 });
    const ledgerBefore = readFileSync(ledgerPathOf(poisonedBaseDir));
    expect(() => poisoned.acquireLock({ ...poisonedContext.owner })).toThrow();
    expect(readFileSync(ledgerPathOf(poisonedBaseDir))).toEqual(ledgerBefore);
    expect(readFileSync(jsonPath)).toEqual(corrupted);
  }, TEST_TIMEOUT);

  // Matrix item 10: the old runtime/native factory cannot gain benchmark
  // authority over a released, newly completed extended history. Replaying a
  // history whose benchmark stage is already completed trips the old mode's
  // benchmark gate during construction itself (the native preparer wraps that
  // rejection statically before ever returning a usable ledger), so the old
  // factory never actually constructs here; completeStage is never reached
  // and is never asserted through `.rejects`, since it is a synchronous void
  // API, not an async one.
  it("old runtime factory cannot gain benchmark authority over a completed history", async () => {
    const baseDir = await seedHealthyCompletedBenchmarkCopy();
    const ledgerBefore = readFileSync(ledgerPathOf(baseDir));

    const context = await prepareCalibrationBootstrapContext(
      createCalibrationBootstrapReadDeps(baseDir),
    );
    await expect(
      prepareNativeCalibrationRuntimeEvidenceLedger({ context }),
    ).rejects.toThrow();
    expect(readFileSync(ledgerPathOf(baseDir))).toEqual(ledgerBefore);
    const rows = readLedgerRows(baseDir);
    const benchmarkCompletions = rows.filter(
      (row) => row["type"] === "stage_completed" && row["stage"] === "benchmark",
    );
    expect(benchmarkCompletions.length).toBe(1);
  }, TEST_TIMEOUT);

  // Matrix item 5a: removing a real predecessor stage_completed record is
  // tamper (the selected-profile predecessor is no longer complete).
  it("rejects constructor replay when a predecessor stage_completed is removed", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "stage_completed" && row["stage"] === "development",
      "development stage_completed",
    );
    rows.splice(target, 1);
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 5b: a wrong stored selected profile is tamper.
  it("rejects constructor replay when the selected profile is wrong", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "profile_selected",
      "profile_selected",
    );
    expect(rows[target]?.["profile"]).toBe("MEDIUM");
    (rows[target] as LedgerRow)["profile"] = "LOW";
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 5c: a wrong model-version pin is tamper.
  it("rejects constructor replay when the pinned model version is wrong", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "model_version_pinned",
      "model_version_pinned",
    );
    expect(typeof rows[target]?.["responseModelVersion"]).toBe("string");
    (rows[target] as LedgerRow)["responseModelVersion"] = "gemini-2.5-flash";
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 5d: a changed header source/identity field is tamper;
  // constructor replay re-derives source facts from the actual Git tree.
  it("rejects constructor replay when the header source identity is wrong", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const header = rows[0] as LedgerRow;
    expect(header["type"]).toBe("protocol_identity");
    const identity = header["identity"] as LedgerRow;
    expect(identity["functionsTreeId"]).toMatch(/^[0-9a-f]{40,64}$/);
    identity["functionsTreeId"] = "0".repeat(40);
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 5d (live source-drift completion rejection): after a healthy
  // acquisition on a benchmark-ready template, a NEW non-pinned file is
  // committed under the already-tracked functions/ tree; no pinned asset is
  // touched. HEAD:functions genuinely drifts from the identity already
  // captured at acquisition. Completion on that ORIGINAL acquired instance
  // must then reject, retaining the lock and every calibration-root byte;
  // a poisoned repeat has no further effect and is never released.
  it("rejects live benchmark completion when the tracked functions source genuinely drifted after acquisition", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const f = await openBenchmarkBase(baseDir);
    const capturedFunctionsTreeId = f.context.identity.functionsTreeId;
    const probePath = resolve(baseDir, "functions", "eval", "nutrition", "calibration-step4-source-drift-probe.ts");
    writeFileSync(probePath, "export const CALIBRATION_STEP4_SOURCE_DRIFT_PROBE = true;\n", { flag: "wx" });
    execFileSync("git", ["add", "functions/eval/nutrition/calibration-step4-source-drift-probe.ts"], { cwd: baseDir });
    execFileSync("git", ["commit", "-m", "Add calibration benchmark authority step4 source drift probe"], { cwd: baseDir });
    const driftedState = createCalibrationBootstrapReadDeps(baseDir).readGitState();
    expect(driftedState.functionsTreeId).not.toBe(capturedFunctionsTreeId);
    const ledgerBefore = readFileSync(ledgerPathOf(baseDir));
    const lockBefore = readFileSync(lockPathOf(baseDir));
    const rootAfterSourceDrift = snapshotCalibrationRoot(baseDir);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(() => f.ledger.completeStage("benchmark", {
        stage: "benchmark", passed: true,
        completedStages: ["preflight", "development", "validation"],
      })).toThrow();
      expect(readFileSync(ledgerPathOf(baseDir))).toEqual(ledgerBefore);
      expect(readFileSync(lockPathOf(baseDir))).toEqual(lockBefore);
      expect(snapshotCalibrationRoot(baseDir)).toEqual(rootAfterSourceDrift);
    }
  }, TEST_TIMEOUT);

  // Matrix item 5e: a changed physical-owner header field is tamper. This is
  // a historical header-owner control, kept separate from the real lock-file
  // ownership control below.
  it("rejects constructor replay when the header physical owner is wrong", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const header = rows[0] as LedgerRow;
    const owner = header["owner"] as LedgerRow;
    expect(typeof owner["pid"]).toBe("number");
    owner["pid"] = (owner["pid"] as number) + 1;
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 5e (real lock ownership): the ACTUAL held lock file, not just
  // a historical header owner, becomes a schema-valid foreign owner after a
  // genuine acquisition. Completion must reject, the bad lock is retained,
  // and a poisoned repeat has no further effect. The poisoned instance is
  // never released as cleanup.
  it("rejects completion and repeats with no new effects when the real lock file owner becomes foreign after acquisition", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const f = await openBenchmarkBase(baseDir);
    const lockPath = lockPathOf(baseDir);
    const realLock = JSON.parse(readFileSync(lockPath, "utf8")) as LedgerRow;
    expect(typeof realLock["pid"]).toBe("number");
    const foreignLock = { ...realLock, pid: (realLock["pid"] as number) + 1 };
    const foreignLockBytes = Buffer.from(JSON.stringify(foreignLock), "utf8");
    writeFileSync(lockPath, foreignLockBytes, { mode: 0o600 });
    const ledgerBefore = readFileSync(ledgerPathOf(baseDir));
    const rootAfterOwnerChange = snapshotCalibrationRoot(baseDir);

    expect(() => f.ledger.completeStage("benchmark", {
      stage: "benchmark", passed: true,
      completedStages: ["preflight", "development", "validation"],
    })).toThrow();
    expect(readFileSync(lockPath)).toEqual(foreignLockBytes);
    expect(readFileSync(ledgerPathOf(baseDir))).toEqual(ledgerBefore);
    expect(snapshotCalibrationRoot(baseDir)).toEqual(rootAfterOwnerChange);

    expect(() => f.ledger.completeStage("benchmark", {
      stage: "benchmark", passed: true,
      completedStages: ["preflight", "development", "validation"],
    })).toThrow();
    expect(readFileSync(lockPath)).toEqual(foreignLockBytes);
    expect(readFileSync(ledgerPathOf(baseDir))).toEqual(ledgerBefore);
    expect(snapshotCalibrationRoot(baseDir)).toEqual(rootAfterOwnerChange);
  }, TEST_TIMEOUT);

  // Matrix item 5f: removing the separately tracked token-count readiness is
  // tamper; benchmark authority needs token readiness preserved.
  it("rejects constructor replay when token readiness is removed", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "token_count_completed",
      "token_count_completed",
    );
    rows.splice(target, 1);
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 6: inserting a protocol stage_completed benchmark record
  // immediately BEFORE the existing benchmark binding, keeping every binding
  // cutoff number and digest unchanged. The inserted no-op completion cannot
  // fabricate a valid earlier prefix, so the constructor must reject.
  it("rejects completion before a later binding during constructor replay", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const bindingIndex = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "runtime_report_bound"
        && row["stage"] === "benchmark" && row["profile"] === "MEDIUM",
      "benchmark runtime_report_bound",
    );
    expect(bindingIndex).toBeGreaterThan(0);
    rows.splice(bindingIndex, 0, {
      type: "stage_completed", stage: "benchmark", passed: true,
      at: "2026-10-19T00:00:00.000Z",
    });
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 4a: removing a finished attempt for ONE real canonical
  // benchmark key leaves an incomplete terminal accounting. The population
  // of benchmark `completed` rows (48) and the matching `runtime_attempt_
  // finished` row for that exact key are each independently verified unique
  // before any mutation, never a bare stage filter that matches many rows.
  it("rejects constructor replay when a finished benchmark attempt is removed", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const targetKey = oneBenchmarkCanonicalKey(rows);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "runtime_attempt_finished"
        && row["key"] !== null && typeof row["key"] === "object"
        && sameReservationKey(row["key"] as LedgerRow, targetKey),
      "runtime_attempt_finished for one canonical benchmark key",
    );
    rows.splice(target, 1);
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 4b: removing the `completed` terminal row for that SAME
  // independently verified single canonical key corrupts the keyed image
  // reservation reconciliation.
  it("rejects constructor replay when a benchmark completed terminal is removed", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const targetKey = oneBenchmarkCanonicalKey(rows);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "completed"
        && row["key"] !== null && typeof row["key"] === "object"
        && sameReservationKey(row["key"] as LedgerRow, targetKey),
      "completed for one canonical benchmark key",
    );
    rows.splice(target, 1);
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 5 (missing journal): the real journal entry a benchmark
  // `completed` row references by journalHash is removed from journal.json
  // itself (not the ledger). The real production reducer rejects a
  // `completed` event whose journalHash has no matching journal entry.
  it("rejects constructor replay when a real benchmark image journal entry is removed", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const targetKey = oneBenchmarkCanonicalKey(rows);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "completed"
        && row["key"] !== null && typeof row["key"] === "object"
        && sameReservationKey(row["key"] as LedgerRow, targetKey),
      "completed for one canonical benchmark key",
    );
    const journalHash = (rows[target] as LedgerRow)["journalHash"];
    expect(typeof journalHash).toBe("string");
    const journalRows = readJournalRows(baseDir);
    const journalIndex = journalRows.findIndex((entry) => journalHashOf(entry) === journalHash);
    expect(journalIndex).toBeGreaterThanOrEqual(0);
    journalRows.splice(journalIndex, 1);
    writeJournalRows(baseDir, journalRows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 5 (missing canonical key): every event carrying one real
  // canonical benchmark key (reserved, started, operations, completed,
  // finished) is removed, as if the plan's key had never been processed at
  // all. This is a stronger control than removing a single terminal.
  it("rejects constructor replay when every event for a real canonical benchmark key is removed", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const targetKey = oneBenchmarkCanonicalKey(rows);
    const keyRowIndices = indicesOf(
      rows,
      (row) => row["key"] !== null && typeof row["key"] === "object"
        && sameReservationKey(row["key"] as LedgerRow, targetKey),
    );
    expect(keyRowIndices.length).toBeGreaterThan(1);
    const keyRowIndexSet = new Set(keyRowIndices);
    const remaining = rows.filter((_row, index) => !keyRowIndexSet.has(index));
    writeLedgerRows(baseDir, remaining);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 5 (independent duplicate key, image path): a second real
  // benchmark `completed` event is made to duplicate another already-
  // completed canonical key. This is the image-path counterpart to the
  // barcode non_reservation_result duplicate control below.
  it("rejects constructor replay when a second completed event duplicates a real benchmark canonical key", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const indices = benchmarkCompletedIndices(rows);
    const first = indices[0] as number;
    const second = indices[1] as number;
    const firstKey = (rows[first] as LedgerRow)["key"] as LedgerRow;
    const secondKey = (rows[second] as LedgerRow)["key"] as LedgerRow;
    expect(sameReservationKey(firstKey, secondKey)).toBe(false);
    (rows[second] as LedgerRow)["key"] = { ...firstKey };
    expect(sameReservationKey((rows[second] as LedgerRow)["key"] as LedgerRow, firstKey)).toBe(true);
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 5 (pending canonical image reservation / active attempt): a
  // real canonical benchmark key keeps its `reserved` and `runtime_attempt_
  // started` rows but loses BOTH its `completed` terminal and its
  // `runtime_attempt_finished` row, leaving it genuinely reserved with an
  // open, never-finished attempt. Unlike the invented-caseId control this
  // replaces, every row here is a real, independently confirmed key/event.
  it("rejects constructor replay when a real canonical benchmark image key is left reserved with an active, never-finished attempt", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const targetKey = oneBenchmarkCanonicalKey(rows);
    const completedIndex = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "completed"
        && row["key"] !== null && typeof row["key"] === "object"
        && sameReservationKey(row["key"] as LedgerRow, targetKey),
      "completed for one canonical benchmark key",
    );
    const finishedIndex = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "runtime_attempt_finished"
        && row["key"] !== null && typeof row["key"] === "object"
        && sameReservationKey(row["key"] as LedgerRow, targetKey),
      "runtime_attempt_finished for one canonical benchmark key",
    );
    for (const index of [completedIndex, finishedIndex].sort((a, b) => b - a)) {
      rows.splice(index, 1);
    }
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 4c: substituting a real benchmark barcode non-reservation
  // outcome with a duplicate of another canonical key is tamper.
  it("rejects constructor replay when a barcode canonical key is substituted", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const targets = indicesOf(
      rows,
      (row) => row["type"] === "non_reservation_result"
        && row["key"] !== null && typeof row["key"] === "object"
        && (row["key"] as LedgerRow)["stage"] === "benchmark",
    );
    expect(targets.length).toBe(12);
    const first = targets[0] as number;
    const second = targets[1] as number;
    const firstKey = (rows[first] as LedgerRow)["key"] as LedgerRow;
    const secondKey = (rows[second] as LedgerRow)["key"] as LedgerRow;
    expect(sameReservationKey(firstKey, secondKey)).toBe(false);
    (rows[second] as LedgerRow)["key"] = { ...firstKey };
    expect(sameReservationKey((rows[second] as LedgerRow)["key"] as LedgerRow, firstKey)).toBe(true);
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 3b: a wrong stored binding digest is tamper.
  it("rejects constructor replay when a stored bindingSha256 digest is wrong", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "runtime_report_bound"
        && row["stage"] === "benchmark" && row["profile"] === "MEDIUM",
      "benchmark runtime_report_bound",
    );
    expect(rows[target]?.["bindingSha256"]).toMatch(/^[0-9a-f]{64}$/);
    (rows[target] as LedgerRow)["bindingSha256"] = "0".repeat(64);
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 3c: a wrong stored bound receipt (its jsonSha256 digest) is
  // tamper and must not be relabelled or repaired.
  it("rejects constructor replay when a stored bound receipt digest is wrong", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "runtime_report_bound"
        && row["stage"] === "benchmark" && row["profile"] === "MEDIUM",
      "benchmark runtime_report_bound",
    );
    const receipt = (rows[target] as LedgerRow)["receipt"] as LedgerRow;
    expect(receipt["jsonSha256"]).toMatch(/^[0-9a-f]{64}$/);
    receipt["jsonSha256"] = "f".repeat(64);
    writeLedgerRows(baseDir, rows);
    const before = readFileSync(ledgerPathOf(baseDir));
    await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
  }, TEST_TIMEOUT);

  // Matrix item 2 (first five pairs only): removing any of these five real
  // runtime_report_bound records must make the constructor reject without
  // touching the copy. The sixth pair (benchmark|MEDIUM) has its own test
  // below, since the template is benchmark-READY, not benchmark-COMPLETED.
  it.each(SIX_PAIRS.filter(([stage, profile]) => !(stage === "benchmark" && profile === "MEDIUM")))(
    "rejects constructor replay when the %s|%s runtime_report_bound record is removed",
    async (stage, profile) => {
      const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
      const rows = readLedgerRows(baseDir);
      const target = requireExactlyOneIndex(
        rows,
        (row) => row["type"] === "runtime_report_bound"
          && row["stage"] === stage && row["profile"] === profile,
        `runtime_report_bound ${stage}|${profile}`,
      );
      rows.splice(target, 1);
      writeLedgerRows(baseDir, rows);
      const before = readFileSync(ledgerPathOf(baseDir));
      await expectConstructorRejectionLeavesHistoryIntact(baseDir, before);
    },
    TEST_TIMEOUT,
  );

  // Matrix item 2 (benchmark|MEDIUM boundary correction): removing ONLY the
  // sixth, never-completed benchmark binding leaves a structurally valid
  // receipt-admitted/unbound prefix (like a fresh root or receipt-before-bind
  // history), so construction must resolve with zero effects. Legitimate
  // acquisition may create its lock/owner transition; snapshot after it.
  // Only the live completion attempt, which actually needs that binding,
  // must reject: zero new effects, a retained lock, and a poisoned repeat
  // with no further effect. No automatic bind/admit/publish call is made.
  it("resolves construction and acquisition but rejects live completion when the benchmark|MEDIUM binding is removed", async () => {
    const baseDir = copyBenchmarkTemplate(sharedRoots, requireTemplate("MEDIUM"));
    const rows = readLedgerRows(baseDir);
    const target = requireExactlyOneIndex(
      rows,
      (row) => row["type"] === "runtime_report_bound"
        && row["stage"] === "benchmark" && row["profile"] === "MEDIUM",
      "runtime_report_bound benchmark|MEDIUM",
    );
    rows.splice(target, 1);
    writeLedgerRows(baseDir, rows);
    const beforeConstruct = snapshotCalibrationRoot(baseDir);
    const context = await prepareCalibrationBootstrapContext(
      createCalibrationBootstrapReadDeps(baseDir),
    );
    const ledger = await prepareNativeCalibrationBenchmarkAuthorityLedger({ context });
    expect(snapshotCalibrationRoot(baseDir)).toEqual(beforeConstruct);
    ledger.acquireLock({ ...context.owner });
    const afterAcquire = snapshotCalibrationRoot(baseDir);
    const ledgerBefore = readFileSync(ledgerPathOf(baseDir));
    const lockBefore = readFileSync(lockPathOf(baseDir));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(() => ledger.completeStage("benchmark", {
        stage: "benchmark", passed: true,
        completedStages: ["preflight", "development", "validation"],
      })).toThrow("calibration:benchmark-authority-failed");
      expect(snapshotCalibrationRoot(baseDir)).toEqual(afterAcquire);
      expect(readFileSync(ledgerPathOf(baseDir))).toEqual(ledgerBefore);
      expect(readFileSync(lockPathOf(baseDir))).toEqual(lockBefore);
    }
  }, TEST_TIMEOUT);
});
