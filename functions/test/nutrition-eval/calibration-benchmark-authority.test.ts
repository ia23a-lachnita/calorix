/**
 * Calibration benchmark authority native foundation (Task 2 Step 1).
 *
 * Qualifies buildBenchmarkTemplate against the existing native
 * preparer/preflight/publication/ledger APIs only. No new factory imports:
 * openBenchmarkBase, openBenchmarkTemplate and BenchmarkNativeCase are
 * Step 2 and later and are intentionally absent here.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CALIBRATION_ROOT } from "../../src/nutrition-eval/calibration";
import type { CalibrationProfile } from "../../src/nutrition-eval/calibration";
import { measureCalibrationStageReport } from "../../src/nutrition-eval/calibration-report-measurements";
import type { CalibrationStageGateMetrics } from "../../src/nutrition-eval/calibration-report-measurements";
import { buildBenchmarkTemplate } from "./calibration-benchmark-authority-fixtures";
import type { BenchmarkTemplate } from "./calibration-benchmark-authority-fixtures";

const TEST_TIMEOUT = 600000;

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

describe.sequential("native foundation", () => {
  const roots: string[] = [];
  let lowTemplate: BenchmarkTemplate | undefined;
  let mediumTemplate: BenchmarkTemplate | undefined;

  afterAll(() => {
    for (const root of roots) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Best-effort owned cleanup only; registered roots are task-owned temp dirs.
      }
    }
  });

  it("builds a prior-failure LOW-selected benchmark template", async () => {
    lowTemplate = await buildBenchmarkTemplate(roots, "LOW");
    expect(lowTemplate).toBeDefined();
    assertNativeFoundation(lowTemplate, "MEDIUM");
  }, TEST_TIMEOUT);

  it("builds a prior-failure MEDIUM-selected benchmark template", async () => {
    mediumTemplate = await buildBenchmarkTemplate(roots, "MEDIUM");
    expect(mediumTemplate).toBeDefined();
    assertNativeFoundation(mediumTemplate, "LOW");
  }, TEST_TIMEOUT);
});
