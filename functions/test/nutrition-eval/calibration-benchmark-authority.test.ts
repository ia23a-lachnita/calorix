/**
 * Calibration benchmark authority native foundation and feature RED
 * (Task 2 Step 1 and Step 2).
 *
 * Qualifies buildBenchmarkTemplate against the existing native
 * preparer/preflight/publication/ledger APIs only (Step 1). Step 2 opens
 * the already-qualified LOW/MEDIUM templates through the planned
 * copyBenchmarkTemplate/openBenchmarkTemplate/openBenchmarkBase surface and
 * calls prepareNativeCalibrationBenchmarkAuthorityLedger, which does not
 * exist in frozen source yet. That import and its call sites are an
 * intentional feature RED; no production source is implemented or
 * stubbed in this file.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CALIBRATION_ROOT } from "../../src/nutrition-eval/calibration";
import type { CalibrationProfile } from "../../src/nutrition-eval/calibration";
import { createCalibrationBootstrapReadDeps, prepareCalibrationBootstrapContext } from "../../src/nutrition-eval/calibration-bootstrap";
import {
  prepareNativeCalibrationBenchmarkAuthorityLedger,
  prepareNativeCalibrationRuntimeEvidenceLedger,
} from "../../src/nutrition-eval/calibration-runtime-evidence-ledger";
import { measureCalibrationStageReport } from "../../src/nutrition-eval/calibration-report-measurements";
import type { CalibrationStageGateMetrics } from "../../src/nutrition-eval/calibration-report-measurements";
import { buildBenchmarkTemplate, copyBenchmarkTemplate, openBenchmarkTemplate } from "./calibration-benchmark-authority-fixtures";
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
