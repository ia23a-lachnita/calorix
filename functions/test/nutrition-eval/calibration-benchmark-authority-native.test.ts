/**
 * Synthetic PREFIX_ROWS, raw-hook, and file-port controls qualify only the
 * benchmark completion witness syscall plumbing. They are not actual runtime
 * history, native ledger admission, SDK behavior, physical power-loss proof,
 * or whole Task 3 completion. Full-history foundations are separate below.
 */
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CALIBRATION_ROOT } from "../../src/nutrition-eval/calibration";
import { CalibrationFatalError } from "../../src/nutrition-eval/fatal-error";
import type { CalibrationOwner } from "../../src/nutrition-eval/calibration";
import { createBenchmarkAuthorityFileCalibrationLedgerDeps } from "../../src/nutrition-eval/calibration-file-store";
import { makeBenchmarkCompletionWitness } from "./calibration-benchmark-authority-fixtures";
import type {
  BenchmarkCompletionWitness,
  BenchmarkCutOperation,
} from "./calibration-benchmark-authority-fixtures";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { evaluateCalibrationStageGate } from "../../src/nutrition-eval/calibration";
import type { CalibrationProfile, StageName } from "../../src/nutrition-eval/calibration";
import { deriveCanonicalReportOutcomePlan } from "../../src/nutrition-eval/calibration-bootstrap";
import type { CalibrationPreparedContext } from "../../src/nutrition-eval/calibration-bootstrap";
import { prepareCalibrationBenchmarkHistory } from "../../src/nutrition-eval/calibration-benchmark-history";
import { prepareCalibrationStageReportArtifactVerifier } from "../../src/nutrition-eval/calibration-report-artifact-verification";
import { measureCalibrationStageReport } from "../../src/nutrition-eval/calibration-report-measurements";
import type { CalibrationStageGateMetrics } from "../../src/nutrition-eval/calibration-report-measurements";
import type { CalibrationReportOutcomeKey } from "../../src/nutrition-eval/calibration-report-state";
import { hashCalibrationRuntimeEvidenceBinding } from "../../src/nutrition-eval/calibration-runtime-evidence-codec";
import type { RuntimeEvidenceEvent, RuntimePairEvent } from "../../src/nutrition-eval/calibration-runtime-evidence-codec";
import { buildBenchmarkTemplate, openBenchmarkTemplate, copyBenchmarkTemplate, openBenchmarkBase } from "./calibration-benchmark-authority-fixtures";
import type { BenchmarkTemplate } from "./calibration-benchmark-authority-fixtures";
import { SUPPORTED_HISTORICAL_DELTA_FIELDS } from "../../src/nutrition-eval/historical-reference-pure";
import type { JournalEntry } from "../../src/nutrition-eval/calibration";
import { captureCalibrationReportJournalEntry } from "../../src/nutrition-eval/calibration-report-journal";
import type { BenchmarkNativeCase } from "./calibration-benchmark-authority-fixtures";

const roots: string[] = [];

const owner: CalibrationOwner = {
  hostname: "benchmark-native-witness",
  bootId: "benchmark-native-boot",
  pid: 24680,
  startTicks: 13579,
  acquiredAt: "2026-10-19T00:00:00.000Z",
};

const PREFIX_ROWS = [
  { type: "stage_completed", stage: "preflight", passed: true, at: "2026-10-18T00:00:00.000Z" },
  { type: "stage_completed", stage: "development", passed: true, at: "2026-10-18T01:00:00.000Z" },
  { type: "stage_completed", stage: "validation", passed: true, at: "2026-10-18T02:00:00.000Z" },
];

const COMPLETION_ROW = {
  type: "stage_completed",
  stage: "benchmark",
  passed: true,
  at: "2026-10-19T00:00:00.000Z",
};

const CUT_OPERATIONS: readonly BenchmarkCutOperation[] = [
  "write",
  "file-fsync",
  "close",
  "rename",
  "directory-fsync",
];

const CUT_SIDES = ["before", "after"] as const;

const OPEN_WRITABLE_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "calorix-benchmark-native-"));
  roots.push(root);
  return root;
}

function privateCanonical(root: string): string {
  const canonical = resolve(root, CALIBRATION_ROOT);
  mkdirSync(canonical, { recursive: true, mode: 0o700 });
  chmodSync(canonical, 0o700);
  return canonical;
}

function fullOperationTrace(): string[] {
  return CUT_OPERATIONS.flatMap((op) => [`${op}:before`, `${op}:after`]);
}

function expectFdClosed(fd: number): void {
  let code: string | undefined;
  try {
    fstatSync(fd);
  } catch (error) {
    code = (error as NodeJS.ErrnoException).code;
  }
  expect(code).toBe("EBADF");
}

function cleanupOwnFd(fd: number, dev: number, ino: number): void {
  try {
    const current = fstatSync(fd);
    if (current.dev === dev && current.ino === ino) closeSync(fd);
  } catch (error) {
    expect((error as NodeJS.ErrnoException).code).toBe("EBADF");
  }
}

function publicationSteps(
  witness: BenchmarkCompletionWitness,
  fd: number,
  buffer: Buffer,
  tempPath: string,
  finalPath: string,
  canonical: string,
): (() => unknown)[] {
  return [
    () => witness.overrides.fdWriteSync!(fd, buffer, 0, buffer.length),
    () => witness.overrides.fdFsyncSync!(fd),
    () => witness.overrides.fdCloseSync!(fd),
    () => witness.overrides.renameSync!(tempPath, finalPath),
    () => witness.overrides.fsyncDirSync!(canonical),
  ];
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
describe.sequential("benchmark completion native witness controls", () => {
  it("extends a locked native ledger by one benchmark stage_completed event while disarmed", () => {
    const root = makeRoot();
    const canonical = privateCanonical(root);
    writeFileSync(join(canonical, "ledger.json"), JSON.stringify(PREFIX_ROWS), { mode: 0o600 });
    writeFileSync(join(canonical, "journal.json"), "[]", { mode: 0o600 });
    const witness = makeBenchmarkCompletionWitness(canonical);
    try {
      expect(witness.hitCount).toBe(0);
      const deps = createBenchmarkAuthorityFileCalibrationLedgerDeps(
        root,
        owner,
        witness.overrides,
      );
      deps.writeLockExclusive(owner);
      const lockBytes = readFileSync(join(canonical, "lock.json"));
      const journalBytes = readFileSync(join(canonical, "journal.json"));
      expect(deps.readLedgerEvents()).toEqual(PREFIX_ROWS);
      const cut = witness.trace.length;
      expect(witness.trace.slice(0, cut).filter((entry) => entry.includes("fault"))).toEqual([]);
      deps.appendLedgerEvent(COMPLETION_ROW);
      deps.fsyncLedgerFile();
      deps.fsyncLedgerDir();
      expect(witness.hitCount).toBe(0);
      expect(witness.trace.slice(cut)).toEqual(fullOperationTrace());
      expect(readFileSync(join(canonical, "ledger.json"), "utf8")).toBe(
        JSON.stringify([...PREFIX_ROWS, COMPLETION_ROW]),
      );
      expect(deps.readLedgerEvents()).toEqual([...PREFIX_ROWS, COMPLETION_ROW]);
      expect(readFileSync(join(canonical, "lock.json"))).toEqual(lockBytes);
      expect(readFileSync(join(canonical, "journal.json"))).toEqual(journalBytes);
    } finally {
      witness.disarm();
    }
  }, 5000);

  it("publishes a standalone ledger payload through all five delegated syscalls while disarmed", () => {
    const root = makeRoot();
    const canonical = privateCanonical(root);
    writeFileSync(join(canonical, "ledger.json"), JSON.stringify(PREFIX_ROWS), { mode: 0o600 });
    const finalPath = join(canonical, "ledger.json");
    const tempPath = join(canonical, `ledger.json.tmp.${process.pid}.2.json`);
    const payload = JSON.stringify([...PREFIX_ROWS, COMPLETION_ROW]);
    const buffer = Buffer.from(payload, "utf8");
    const witness = makeBenchmarkCompletionWitness(canonical);
    let fd: number | undefined;
    let opened: { dev: number; ino: number } | undefined;
    try {
      fd = openSync(tempPath, OPEN_WRITABLE_FLAGS, 0o600);
      opened = fstatSync(fd);
      expect(witness.overrides.fdWriteSync!(fd, buffer, 0, buffer.length)).toBe(buffer.length);
      witness.overrides.fdFsyncSync!(fd);
      witness.overrides.fdCloseSync!(fd);
      witness.overrides.renameSync!(tempPath, finalPath);
      witness.overrides.fsyncDirSync!(canonical);
      expect(witness.hitCount).toBe(0);
      expect(witness.trace).toEqual(fullOperationTrace());
      expect(readFileSync(finalPath, "utf8")).toBe(payload);
      expect(existsSync(tempPath)).toBe(false);
      expectFdClosed(fd);
    } finally {
      try {
        witness.disarm();
      } finally {
        if (fd !== undefined) {
          if (opened !== undefined) cleanupOwnFd(fd, opened.dev, opened.ino);
          else closeSync(fd);
        }
      }
    }
  }, 5000);

  it.each(
    CUT_OPERATIONS.flatMap((operation) => CUT_SIDES.map((side) => ({ operation, side }))),
  )(
    "cuts $operation/$side on a fresh standalone ledger publication",
    ({ operation, side }: { operation: BenchmarkCutOperation; side: "before" | "after" }) => {
      const root = makeRoot();
      const canonical = privateCanonical(root);
      writeFileSync(join(canonical, "ledger.json"), JSON.stringify(PREFIX_ROWS), { mode: 0o600 });
      const finalPath = join(canonical, "ledger.json");
      const tempPath = join(canonical, `ledger.json.tmp.${process.pid}.3.json`);
      const payload = JSON.stringify([...PREFIX_ROWS, COMPLETION_ROW]);
      const buffer = Buffer.from(payload, "utf8");
      const witness = makeBenchmarkCompletionWitness(canonical);
      let fd: number | undefined;
      let opened: { dev: number; ino: number } | undefined;
      try {
        fd = openSync(tempPath, OPEN_WRITABLE_FLAGS, 0o600);
        opened = fstatSync(fd);
        witness.arm(operation, side);
        const steps = publicationSteps(witness, fd, buffer, tempPath, finalPath, canonical);
        const operationIndex = CUT_OPERATIONS.indexOf(operation);
        let completed = 0;
        let threw = false;
        for (const step of steps) {
          try {
            step();
            completed += 1;
          } catch {
            threw = true;
            break;
          }
        }
        expect(threw).toBe(true);
        expect(completed).toBe(operationIndex);
        expect(witness.hitCount).toBe(1);
        const expectedTrace: string[] = [];
        for (let i = 0; i < operationIndex; i += 1) {
          expectedTrace.push(`${CUT_OPERATIONS[i]}:before`, `${CUT_OPERATIONS[i]}:after`);
        }
        if (side === "before") {
          expectedTrace.push(`${operation}:before`, `${operation}:fault-before`);
        } else {
          expectedTrace.push(
            `${operation}:before`,
            `${operation}:after`,
            `${operation}:fault-after`,
          );
        }
        expect(witness.trace).toEqual(expectedTrace);
        const published =
          operation === "directory-fsync" || (operation === "rename" && side === "after");
        if (published) {
          expect(existsSync(tempPath)).toBe(false);
          expect(readFileSync(finalPath, "utf8")).toBe(payload);
        } else {
          expect(existsSync(tempPath)).toBe(true);
          const expectedTemp =
            operation === "write" && side === "before" ? "" : payload;
          expect(readFileSync(tempPath, "utf8")).toBe(expectedTemp);
          expect(readFileSync(finalPath, "utf8")).toBe(JSON.stringify(PREFIX_ROWS));
        }
        const fdClosed =
          operationIndex > CUT_OPERATIONS.indexOf("close") ||
          (operation === "close" && side === "after");
        if (fdClosed) {
          expectFdClosed(fd);
        } else {
          const current = fstatSync(fd);
          expect(current.dev).toBe(opened.dev);
          expect(current.ino).toBe(opened.ino);
        }
      } finally {
        try {
          witness.disarm();
        } finally {
          if (fd !== undefined) {
            if (opened !== undefined) cleanupOwnFd(fd, opened.dev, opened.ino);
            else closeSync(fd);
          }
        }
      }
    },
    5000,
  );

  it("does not select a journal temporary payload containing benchmark text", () => {
    const root = makeRoot();
    const canonical = privateCanonical(root);
    const foreignRows = [
      { type: "stage_completed", stage: "benchmark", passed: true, at: "2026-10-19T03:00:00.000Z" },
    ];
    const foreign = JSON.stringify(foreignRows);
    const buffer = Buffer.from(foreign, "utf8");
    const tempPath = join(canonical, `journal.json.tmp.${process.pid}.8.json`);
    const witness = makeBenchmarkCompletionWitness(canonical);
    let fd: number | undefined;
    let opened: { dev: number; ino: number } | undefined;
    try {
      fd = openSync(tempPath, OPEN_WRITABLE_FLAGS, 0o600);
      opened = fstatSync(fd);
      witness.arm("write", "after");
      let writeThrew = false;
      try {
        witness.overrides.fdWriteSync!(fd, buffer, 0, buffer.length);
      } catch {
        writeThrew = true;
      }
      expect(writeThrew).toBe(false);
      expect(witness.hitCount).toBe(0);
      expect(witness.trace).toEqual([]);
      expect(readFileSync(tempPath, "utf8")).toBe(foreign);
      expect(existsSync(join(canonical, "ledger.json"))).toBe(false);
    } finally {
      try {
        witness.disarm();
      } finally {
        if (fd !== undefined) {
          if (opened !== undefined) cleanupOwnFd(fd, opened.dev, opened.ino);
          else closeSync(fd);
        }
      }
    }
  }, 5000);

  it("does not select an existing-completion ledger payload without one new row", () => {
    const root = makeRoot();
    const canonical = privateCanonical(root);
    const existingRows = [...PREFIX_ROWS, COMPLETION_ROW];
    const existingText = JSON.stringify(existingRows);
    writeFileSync(join(canonical, "ledger.json"), existingText, { mode: 0o600 });
    const buffer = Buffer.from(existingText, "utf8");
    const tempPath = join(canonical, `ledger.json.tmp.${process.pid}.9.json`);
    const witness = makeBenchmarkCompletionWitness(canonical);
    let fd: number | undefined;
    let opened: { dev: number; ino: number } | undefined;
    try {
      fd = openSync(tempPath, OPEN_WRITABLE_FLAGS, 0o600);
      opened = fstatSync(fd);
      witness.arm("write", "after");
      let writeThrew = false;
      try {
        witness.overrides.fdWriteSync!(fd, buffer, 0, buffer.length);
      } catch {
        writeThrew = true;
      }
      expect(writeThrew).toBe(false);
      expect(witness.hitCount).toBe(0);
      expect(witness.trace).toEqual([]);
      expect(readFileSync(tempPath, "utf8")).toBe(existingText);
      expect(readFileSync(join(canonical, "ledger.json"), "utf8")).toBe(existingText);
    } finally {
      try {
        witness.disarm();
      } finally {
        if (fd !== undefined) {
          if (opened !== undefined) cleanupOwnFd(fd, opened.dev, opened.ino);
          else closeSync(fd);
        }
      }
    }
  }, 5000);

  it("delegates a chunked publication payload across multiple write syscalls while disarmed", () => {
    const root = makeRoot();
    const canonical = privateCanonical(root);
    writeFileSync(join(canonical, "ledger.json"), JSON.stringify(PREFIX_ROWS), { mode: 0o600 });
    const finalPath = join(canonical, "ledger.json");
    const tempPath = join(canonical, `ledger.json.tmp.${process.pid}.10.json`);
    const payload = JSON.stringify([...PREFIX_ROWS, COMPLETION_ROW]);
    const buffer = Buffer.from(payload, "utf8");
    const witness = makeBenchmarkCompletionWitness(canonical);
    const first = Math.floor(buffer.length / 3);
    const second = Math.floor((buffer.length * 2) / 3);
    let fd: number | undefined;
    let opened: { dev: number; ino: number } | undefined;
    try {
      fd = openSync(tempPath, OPEN_WRITABLE_FLAGS, 0o600);
      opened = fstatSync(fd);
      expect(witness.overrides.fdWriteSync!(fd, buffer, 0, first)).toBe(first);
      expect(witness.overrides.fdWriteSync!(fd, buffer, first, second - first)).toBe(
        second - first,
      );
      expect(
        witness.overrides.fdWriteSync!(fd, buffer, second, buffer.length - second),
      ).toBe(buffer.length - second);
      witness.overrides.fdFsyncSync!(fd);
      witness.overrides.fdCloseSync!(fd);
      witness.overrides.renameSync!(tempPath, finalPath);
      witness.overrides.fsyncDirSync!(canonical);
      expect(witness.hitCount).toBe(0);
      expect(witness.trace).toEqual([
        "write:before",
        "write:after",
        "write:before",
        "write:after",
        "write:before",
        "write:after",
        "file-fsync:before",
        "file-fsync:after",
        "close:before",
        "close:after",
        "rename:before",
        "rename:after",
        "directory-fsync:before",
        "directory-fsync:after",
      ]);
      expect(readFileSync(finalPath, "utf8")).toBe(payload);
      expect(existsSync(tempPath)).toBe(false);
    } finally {
      try {
        witness.disarm();
      } finally {
        if (fd !== undefined) {
          if (opened !== undefined) cleanupOwnFd(fd, opened.dev, opened.ino);
          else closeSync(fd);
        }
      }
    }
  }, 5000);

  it("delegates a wrong-destination rename without selecting the target publication", () => {
    const canonical = privateCanonical(makeRoot());
    const finalPath = join(canonical, "ledger.json");
    const tempPath = join(canonical, `ledger.json.tmp.${process.pid}.101.json`);
    const foreignPath = join(canonical, "foreign.json");
    const payload = JSON.stringify([...PREFIX_ROWS, COMPLETION_ROW]);
    const buffer = Buffer.from(payload);
    writeFileSync(finalPath, JSON.stringify(PREFIX_ROWS), { mode: 0o600 });
    const witness = makeBenchmarkCompletionWitness(canonical);
    let fd: number | undefined;
    let opened: { dev: number; ino: number } | undefined;
    try {
      fd = openSync(tempPath, OPEN_WRITABLE_FLAGS, 0o600);
      opened = fstatSync(fd);
      witness.overrides.fdWriteSync!(fd, buffer, 0, buffer.length);
      witness.overrides.fdFsyncSync!(fd);
      witness.overrides.fdCloseSync!(fd);
      const cut = witness.trace.length;
      witness.arm("rename", "before");
      let threw = false;
      try { witness.overrides.renameSync!(tempPath, foreignPath); } catch { threw = true; }
      expect(threw).toBe(false);
      expect(witness.hitCount).toBe(0);
      expect(witness.trace.slice(cut)).toEqual([]);
      expect(existsSync(tempPath)).toBe(false);
      expect(readFileSync(foreignPath, "utf8")).toBe(payload);
      expect(readFileSync(finalPath, "utf8")).toBe(JSON.stringify(PREFIX_ROWS));
    } finally {
      try { witness.disarm(); } finally {
        if (fd !== undefined) {
          if (opened !== undefined) cleanupOwnFd(fd, opened.dev, opened.ino);
          else closeSync(fd);
        }
      }
    }
  }, 5000);

  it("delegates a replaced-source-inode rename without selecting the old target", () => {
    const canonical = privateCanonical(makeRoot());
    const finalPath = join(canonical, "ledger.json");
    const tempPath = join(canonical, `ledger.json.tmp.${process.pid}.102.json`);
    const replacementPath = join(canonical, "replacement.json");
    const payload = JSON.stringify([...PREFIX_ROWS, COMPLETION_ROW]);
    const replacementPayload = "replacement bytes, not a benchmark publication";
    const buffer = Buffer.from(payload);
    writeFileSync(finalPath, JSON.stringify(PREFIX_ROWS), { mode: 0o600 });
    const witness = makeBenchmarkCompletionWitness(canonical);
    let fd: number | undefined;
    let opened: { dev: number; ino: number } | undefined;
    try {
      fd = openSync(tempPath, OPEN_WRITABLE_FLAGS, 0o600);
      opened = fstatSync(fd);
      witness.overrides.fdWriteSync!(fd, buffer, 0, buffer.length);
      witness.overrides.fdFsyncSync!(fd);
      witness.overrides.fdCloseSync!(fd);
      // Allocate the replacement before unlinking: the original inode still exists.
      writeFileSync(replacementPath, replacementPayload, { mode: 0o600 });
      const replacement = lstatSync(replacementPath);
      expect(replacement.dev === opened.dev && replacement.ino === opened.ino).toBe(false);
      unlinkSync(tempPath);
      renameSync(replacementPath, tempPath);
      expect(lstatSync(tempPath).ino).toBe(replacement.ino);
      const cut = witness.trace.length;
      witness.arm("rename", "before");
      let threw = false;
      try { witness.overrides.renameSync!(tempPath, finalPath); } catch { threw = true; }
      expect(threw).toBe(false);
      expect(witness.hitCount).toBe(0);
      expect(witness.trace.slice(cut)).toEqual([]);
      expect(existsSync(tempPath)).toBe(false);
      expect(readFileSync(finalPath, "utf8")).toBe(replacementPayload);
    } finally {
      try { witness.disarm(); } finally {
        if (fd !== undefined) {
          if (opened !== undefined) cleanupOwnFd(fd, opened.dev, opened.ino);
          else closeSync(fd);
        }
      }
    }
  }, 5000);

  it("retains both directory-fsync observations after a rename-after fault", () => {
    const canonical = privateCanonical(makeRoot());
    const finalPath = join(canonical, "ledger.json");
    const tempPath = join(canonical, `ledger.json.tmp.${process.pid}.103.json`);
    const payload = JSON.stringify([...PREFIX_ROWS, COMPLETION_ROW]);
    const buffer = Buffer.from(payload);
    writeFileSync(finalPath, JSON.stringify(PREFIX_ROWS), { mode: 0o600 });
    const witness = makeBenchmarkCompletionWitness(canonical);
    let fd: number | undefined;
    let opened: { dev: number; ino: number } | undefined;
    try {
      fd = openSync(tempPath, OPEN_WRITABLE_FLAGS, 0o600);
      opened = fstatSync(fd);
      witness.overrides.fdWriteSync!(fd, buffer, 0, buffer.length);
      witness.overrides.fdFsyncSync!(fd);
      witness.overrides.fdCloseSync!(fd);
      witness.arm("rename", "after");
      let threw = false;
      try { witness.overrides.renameSync!(tempPath, finalPath); } catch { threw = true; }
      expect(threw).toBe(true);
      expect(witness.hitCount).toBe(1);
      expect(witness.trace.slice(-3)).toEqual(["rename:before", "rename:after", "rename:fault-after"]);
      const cut = witness.trace.length;
      witness.overrides.fsyncDirSync!(canonical);
      witness.overrides.fsyncDirSync!(canonical);
      expect(witness.trace.slice(cut)).toEqual([
        "directory-fsync:before", "directory-fsync:after",
        "directory-fsync:before", "directory-fsync:after",
      ]);
      expect(witness.hitCount).toBe(1);
      expect(existsSync(tempPath)).toBe(false);
      expect(readFileSync(finalPath, "utf8")).toBe(payload);
    } finally {
      try { witness.disarm(); } finally {
        if (fd !== undefined) {
          if (opened !== undefined) cleanupOwnFd(fd, opened.dev, opened.ino);
          else closeSync(fd);
        }
      }
    }
  }, 5000);

  it("does not close a reopened same-inode descriptor during disarm after close-after", () => {
    const canonical = privateCanonical(makeRoot());
    const finalPath = join(canonical, "ledger.json");
    const tempPath = join(canonical, `ledger.json.tmp.${process.pid}.104.json`);
    const payload = JSON.stringify([...PREFIX_ROWS, COMPLETION_ROW]);
    const buffer = Buffer.from(payload);
    writeFileSync(finalPath, JSON.stringify(PREFIX_ROWS), { mode: 0o600 });
    const witness = makeBenchmarkCompletionWitness(canonical);
    let fd: number | undefined;
    let reopenedFd: number | undefined;
    let opened: { dev: number; ino: number } | undefined;
    try {
      fd = openSync(tempPath, OPEN_WRITABLE_FLAGS, 0o600);
      opened = fstatSync(fd);
      witness.overrides.fdWriteSync!(fd, buffer, 0, buffer.length);
      witness.overrides.fdFsyncSync!(fd);
      witness.arm("close", "after");
      let threw = false;
      try { witness.overrides.fdCloseSync!(fd); } catch { threw = true; }
      // No intervening syscall/assertion: Linux immediately reuses the free fd.
      reopenedFd = openSync(tempPath, constants.O_WRONLY | constants.O_NOFOLLOW);
      expect(reopenedFd).toBe(fd);
      expect(threw).toBe(true);
      expect(witness.hitCount).toBe(1);
      const reopened = fstatSync(reopenedFd);
      expect(reopened.dev).toBe(opened.dev);
      expect(reopened.ino).toBe(opened.ino);
      const trace = [...witness.trace];
      witness.disarm();
      const retained = fstatSync(reopenedFd);
      expect(retained.dev).toBe(opened.dev);
      expect(retained.ino).toBe(opened.ino);
      expect(witness.trace).toEqual(trace);
      expect(witness.hitCount).toBe(1);
      expect(readFileSync(tempPath, "utf8")).toBe(payload);
    } finally {
      try { witness.disarm(); } finally {
        if (opened !== undefined) {
          if (reopenedFd !== undefined) cleanupOwnFd(reopenedFd, opened.dev, opened.ino);
          if (fd !== undefined && fd !== reopenedFd) cleanupOwnFd(fd, opened.dev, opened.ino);
        } else if (fd !== undefined) closeSync(fd);
      }
    }
  }, 5000);

  it.each(CUT_SIDES)("does not cut a later offset-0 write armed for %s", (side) => {
    const canonical = privateCanonical(makeRoot());
    const finalPath = join(canonical, "ledger.json");
    const tempPath = join(canonical, `ledger.json.tmp.${process.pid}.105.json`);
    const payload = JSON.stringify([...PREFIX_ROWS, COMPLETION_ROW]);
    const buffer = Buffer.from(payload);
    writeFileSync(finalPath, JSON.stringify(PREFIX_ROWS), { mode: 0o600 });
    const witness = makeBenchmarkCompletionWitness(canonical);
    let fd: number | undefined;
    let opened: { dev: number; ino: number } | undefined;
    try {
      fd = openSync(tempPath, OPEN_WRITABLE_FLAGS, 0o600);
      opened = fstatSync(fd);
      expect(witness.overrides.fdWriteSync!(fd, buffer, 0, buffer.length)).toBe(buffer.length);
      witness.arm("write", side);
      let threw = false;
      let count: number | undefined;
      try { count = witness.overrides.fdWriteSync!(fd, buffer, 0, buffer.length); } catch { threw = true; }
      expect(threw).toBe(false);
      expect(count).toBe(buffer.length);
      expect(witness.hitCount).toBe(0);
      expect(witness.trace).toEqual(["write:before", "write:after", "write:before", "write:after"]);
      expect(readFileSync(tempPath, "utf8")).toBe(payload + payload);
    } finally {
      try { witness.disarm(); } finally {
        if (fd !== undefined) {
          if (opened !== undefined) cleanupOwnFd(fd, opened.dev, opened.ino);
          else closeSync(fd);
        }
      }
    }
  }, 5000);
});

// ── Task 3 Step 2: native benchmark foundations (full native qualification) ──
//
// The three cases below are full-native foundations: buildBenchmarkTemplate
// builds a real released LOW/MEDIUM template through the actual native
// runtime-evidence preparer/preflight/publication/ledger APIs, and each case
// reopens it through the actual openBenchmarkTemplate/native current-owner
// acquisition and verifies real on-disk bytes, the actual artifact verifier,
// and the public binding-hash contract. This is independent of, and claims
// no equivalence with, the synthetic syscall witness controls above: no SDK,
// live network, or physical power-loss behavior is exercised or implied by
// either section.

type FoundationScenario = "prior-failure" | "benchmark-meal-protein";

const foundationTemplates = new Map<string, Readonly<BenchmarkTemplate>>();

function foundationTemplateRegistryKey(profile: CalibrationProfile, scenario: FoundationScenario): string {
  return `${profile}:${scenario}`;
}

function saveFoundationTemplate(
  profile: CalibrationProfile,
  scenario: FoundationScenario,
  template: Readonly<BenchmarkTemplate>,
): void {
  foundationTemplates.set(foundationTemplateRegistryKey(profile, scenario), template);
}

function requireFoundationTemplate(
  profile: CalibrationProfile,
  scenario: FoundationScenario,
): Readonly<BenchmarkTemplate> {
  const template = foundationTemplates.get(foundationTemplateRegistryKey(profile, scenario));
  if (template === undefined) {
    throw new Error(
      `${profile}:${scenario} native foundation template was not saved; it must build and qualify first.`,
    );
  }
  return template;
}

function foundationCanonicalKeyId(key: Readonly<CalibrationReportOutcomeKey>): string {
  return `${key.stage}|${key.profile}|${key.caseId}|${key.sampleIndex}`;
}

function foundationModeBits(stat: { mode: number }): number {
  return stat.mode & 0o777;
}

function assertFoundationCanonicalRootPermissions(baseDir: string): void {
  const canonical = resolve(baseDir, CALIBRATION_ROOT);
  const rootStat = lstatSync(canonical);
  expect(rootStat.isSymbolicLink()).toBe(false);
  expect(rootStat.isDirectory()).toBe(true);
  expect(foundationModeBits(rootStat)).toBe(0o700);
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      const stat = lstatSync(full);
      expect(stat.isSymbolicLink()).toBe(false);
      if (entry.isDirectory()) {
        expect(foundationModeBits(stat)).toBe(0o700);
        walk(full);
      } else {
        expect(stat.isFile()).toBe(true);
        expect(foundationModeBits(stat)).toBe(0o600);
      }
    }
  };
  walk(canonical);
}

type FoundationRawRow = Record<string, unknown>;

function readFoundationLedgerRows(baseDir: string): FoundationRawRow[] {
  return JSON.parse(readFileSync(resolve(baseDir, CALIBRATION_ROOT, "ledger.json"), "utf8")) as FoundationRawRow[];
}

function foundationRowType(row: FoundationRawRow): string {
  const value = row["type"];
  return typeof value === "string" ? value : "";
}

function readFoundationMeasuredStage(
  baseDir: string,
  stage: StageName,
  profile: CalibrationProfile,
): Readonly<CalibrationStageGateMetrics> {
  const path = resolve(baseDir, CALIBRATION_ROOT, "reports", `${stage}-${profile.toLowerCase()}.json`);
  const report: unknown = JSON.parse(readFileSync(path, "utf8"));
  return measureCalibrationStageReport(report).stage;
}

function pairPlanFor(
  context: Readonly<CalibrationPreparedContext>,
  stage: StageName,
  profile: CalibrationProfile,
): readonly { key: Readonly<CalibrationReportOutcomeKey>; scanMode: "meal" | "label" | "barcode" }[] {
  const source = stage === "preflight" || stage === "development"
    ? deriveCanonicalReportOutcomePlan(context.files)
    : deriveCanonicalReportOutcomePlan(context.files, profile);
  return source.filter((row) => row.key.stage === stage && row.key.profile === profile);
}

function readFoundationTypedJournalEntries(baseDir: string): readonly JournalEntry[] {
  const rows = JSON.parse(readFileSync(resolve(baseDir, CALIBRATION_ROOT, "journal.json"), "utf8")) as unknown[];
  return rows.map((row) => captureCalibrationReportJournalEntry(row));
}

function foundationTypedJournalByKey(baseDir: string): Map<string, JournalEntry> {
  const map = new Map<string, JournalEntry>();
  for (const entry of readFoundationTypedJournalEntries(baseDir)) {
    expect(map.has(foundationCanonicalKeyId(entry.key))).toBe(false);
    map.set(foundationCanonicalKeyId(entry.key), entry);
  }
  return map;
}

function assertFoundationLosingFailureJournal(
  template: Readonly<BenchmarkTemplate>,
  losingProfile: CalibrationProfile,
): void {
  const entries = readFoundationTypedJournalEntries(template.baseDir);
  const failures = entries.filter((entry) => entry.errorCategory === "http_5xx");
  expect(failures.length).toBe(1);
  const failure = failures[0];
  if (failure === undefined) {
    throw new Error("missing provider-failure journal entry");
  }
  expect(failure.key.stage).toBe("development");
  expect(failure.key.profile).toBe(losingProfile);
  expect(failure.reportPrediction?.parseStatus).toBe("failure");
  expect(failure.reportPrediction?.failureCategory).toBe("provider");
  expect(entries.filter((entry) => entry.reportPrediction?.parseStatus === "failure")).toHaveLength(1);
}

function assertFoundationTemplateUnchanged(template: Readonly<BenchmarkTemplate>): void {
  const ledgerBytes = readFileSync(resolve(template.baseDir, CALIBRATION_ROOT, "ledger.json"));
  expect(ledgerBytes.equals(template.eventBytes)).toBe(true);
  const journalBytes = readFileSync(resolve(template.baseDir, CALIBRATION_ROOT, "journal.json"));
  expect(journalBytes.equals(template.journalBytes)).toBe(true);
  expect(existsSync(resolve(template.baseDir, CALIBRATION_ROOT, "lock.json"))).toBe(false);
}

function assertFoundationProteinPerturbation(
  proteinTemplate: Readonly<BenchmarkTemplate>,
  baseTemplate: Readonly<BenchmarkTemplate>,
  benchmarkMealKeys: readonly Readonly<CalibrationReportOutcomeKey>[],
): void {
  expect(benchmarkMealKeys.length).toBe(36);
  const proteinByKey = foundationTypedJournalByKey(proteinTemplate.baseDir);
  const baseByKey = foundationTypedJournalByKey(baseTemplate.baseDir);
  expect(new Set(proteinByKey.keys())).toEqual(new Set(baseByKey.keys()));
  const baseBarcodes = readFoundationLedgerRows(baseTemplate.baseDir)
    .filter((row) => foundationRowType(row) === "non_reservation_result");
  const proteinBarcodes = readFoundationLedgerRows(proteinTemplate.baseDir)
    .filter((row) => foundationRowType(row) === "non_reservation_result");
  expect(baseBarcodes).toHaveLength(12);
  expect(proteinBarcodes).toHaveLength(12);
  assertFoundationKeyInventory(proteinBarcodes.map(foundationRowKey), baseBarcodes.map(foundationRowKey));
  const baseBarcodePredictions = new Map(baseBarcodes.map((row) =>
    [foundationCanonicalKeyId(foundationRowKey(row)), row["prediction"]] as const));
  for (const row of proteinBarcodes) {
    const id = foundationCanonicalKeyId(foundationRowKey(row));
    expect(baseBarcodePredictions.has(id)).toBe(true);
    expect(row["prediction"]).toBeDefined();
    expect(row["prediction"]).toEqual(baseBarcodePredictions.get(id));
  }
  const mealIds = new Set(benchmarkMealKeys.map(foundationCanonicalKeyId));
  expect(mealIds.size).toBe(36);
  for (const [id, entry] of proteinByKey) {
    if (!mealIds.has(id)) expect(entry.reportPrediction).toEqual(baseByKey.get(id)?.reportPrediction);
  }
  for (const key of benchmarkMealKeys) {
    const id = foundationCanonicalKeyId(key);
    const proteinEntry = proteinByKey.get(id);
    const baseEntry = baseByKey.get(id);
    if (proteinEntry === undefined || baseEntry === undefined) {
      throw new Error(`missing journal entry for canonical key ${id}`);
    }
    const proteinPrediction = proteinEntry.reportPrediction;
    const basePrediction = baseEntry.reportPrediction;
    if (proteinPrediction === undefined || basePrediction === undefined) {
      throw new Error(`missing reportPrediction for canonical key ${id}`);
    }
    const { proteinG: proteinProteinG, diagnostics: proteinDiagnostics, ...proteinPredictionRest } = proteinPrediction;
    const { proteinG: baseProteinG, diagnostics: baseDiagnostics, ...basePredictionRest } = basePrediction;
    expect(proteinPredictionRest).toEqual(basePredictionRest);
    if (typeof baseProteinG !== "number" || !Number.isFinite(baseProteinG)
      || typeof proteinProteinG !== "number" || !Number.isFinite(proteinProteinG)) {
      throw new Error(`missing finite meal protein for canonical key ${id}`);
    }
    expect(proteinProteinG).toBe(baseProteinG * 1.4);

    if (proteinDiagnostics === undefined || baseDiagnostics === undefined) {
      throw new Error(`missing diagnostics for canonical key ${id}`);
    }
    const { rawNutrients: proteinRawNutrients, ...proteinDiagnosticsRest } = proteinDiagnostics;
    const { rawNutrients: baseRawNutrients, ...baseDiagnosticsRest } = baseDiagnostics;
    expect(proteinDiagnosticsRest).toEqual(baseDiagnosticsRest);

    if (proteinRawNutrients === undefined || baseRawNutrients === undefined) {
      throw new Error(`missing diagnostics.rawNutrients for canonical key ${id}`);
    }
    const { proteinG: proteinRawProteinG, ...proteinRawNutrientsRest } = proteinRawNutrients;
    const { proteinG: baseRawProteinG, ...baseRawNutrientsRest } = baseRawNutrients;
    expect(proteinRawNutrientsRest).toEqual(baseRawNutrientsRest);
    expect(proteinRawProteinG).toBe(baseRawProteinG * 1.4);
  }
}

function assertFoundationTemplateShape(
  template: Readonly<BenchmarkTemplate>,
  losingProfile: CalibrationProfile,
): void {
  assertFoundationCanonicalRootPermissions(template.baseDir);

  const onDiskLedgerBytes = readFileSync(resolve(template.baseDir, CALIBRATION_ROOT, "ledger.json"));
  expect(onDiskLedgerBytes.equals(template.eventBytes)).toBe(true);
  const onDiskJournalBytes = readFileSync(resolve(template.baseDir, CALIBRATION_ROOT, "journal.json"));
  expect(onDiskJournalBytes.equals(template.journalBytes)).toBe(true);

  const lockPath = resolve(template.baseDir, CALIBRATION_ROOT, "lock.json");
  expect(existsSync(lockPath)).toBe(false);

  const rows = readFoundationLedgerRows(template.baseDir);

  const stageCompleted = rows.filter((row) => foundationRowType(row) === "stage_completed");
  expect(stageCompleted.map((row) => row["stage"])).toEqual(["preflight", "development", "validation"]);
  expect(stageCompleted.every((row) => row["passed"] === true)).toBe(true);

  const profileSelected = rows.filter((row) => foundationRowType(row) === "profile_selected");
  expect(profileSelected.length).toBe(1);
  expect(profileSelected[0]?.["profile"]).toBe(template.profile);
  expect(profileSelected[0]?.["reason"]).toBe("higher_parse");

  const bound = rows.filter((row) => foundationRowType(row) === "runtime_report_bound");
  expect(bound.length).toBe(6);

  const tokenCountCompleted = rows.filter((row) => foundationRowType(row) === "token_count_completed");
  expect(tokenCountCompleted.length).toBe(1);

  const winnerDevelopment = readFoundationMeasuredStage(template.baseDir, "development", template.profile);
  expect(winnerDevelopment.failureCount).toBe(0);
  const loserDevelopment = readFoundationMeasuredStage(template.baseDir, "development", losingProfile);
  expect(loserDevelopment.failureCount).toBe(1);
  assertFoundationLosingFailureJournal(template, losingProfile);
}

function foundationRowKey(row: FoundationRawRow): CalibrationReportOutcomeKey {
  const value = row["key"];
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("missing outcome key");
  const key = value as Record<string, unknown>;
  const stage = key["stage"];
  const profile = key["profile"];
  const caseId = key["caseId"];
  const sampleIndex = key["sampleIndex"];
  if ((stage !== "preflight" && stage !== "development" && stage !== "validation" && stage !== "benchmark")
    || (profile !== "LOW" && profile !== "MEDIUM") || typeof caseId !== "string"
    || typeof sampleIndex !== "number" || !Number.isSafeInteger(sampleIndex) || sampleIndex < 0) {
    throw new Error("invalid outcome key");
  }
  return { stage, profile, caseId, sampleIndex };
}

function assertFoundationKeyInventory(
  actual: readonly Readonly<CalibrationReportOutcomeKey>[],
  expected: readonly Readonly<CalibrationReportOutcomeKey>[],
): void {
  expect(actual).toHaveLength(expected.length);
  const actualIds = new Set(actual.map(foundationCanonicalKeyId));
  expect(actualIds.size).toBe(actual.length);
  expect(actualIds).toEqual(new Set(expected.map(foundationCanonicalKeyId)));
}

function assertFoundationActualInventory(f: Readonly<BenchmarkNativeCase>, profile: CalibrationProfile): void {
  const plan = deriveCanonicalReportOutcomePlan(f.context.files, profile);
  const expectedKeys = plan.map((row) => row.key);
  const imageKeys = plan.filter((row) => row.scanMode !== "barcode").map((row) => row.key);
  const barcodeKeys = plan.filter((row) => row.scanMode === "barcode").map((row) => row.key);
  expect(imageKeys).toHaveLength(146);
  expect(barcodeKeys).toHaveLength(12);
  expect(imageKeys.filter((key) => key.stage === "benchmark")).toHaveLength(48);
  const snapshot = f.ledger.getRuntimeEvidenceSnapshot();
  expect(snapshot.owner).toEqual(f.context.owner);
  expect(snapshot.activeAttempt).toBeNull();
  expect(snapshot.events.filter((event) => event.type === "runtime_attempt_abandoned")).toHaveLength(0);
  const started = snapshot.events.filter((event) => event.type === "runtime_attempt_started");
  const finished = snapshot.events.filter(isFoundationFinishedEvent);
  expect(started).toHaveLength(158);
  expect(finished).toHaveLength(158);
  assertFoundationKeyInventory(started.map((event) => event.key), expectedKeys);
  assertFoundationKeyInventory(finished.map((event) => event.key), expectedKeys);
  const rows = readFoundationLedgerRows(f.baseDir);
  const completed = rows.filter((row) => foundationRowType(row) === "completed").map(foundationRowKey);
  const barcodes = rows.filter((row) => foundationRowType(row) === "non_reservation_result");
  expect(completed).toHaveLength(146);
  expect(barcodes).toHaveLength(12);
  expect(barcodes.every((row) => row["reason"] === "barcode")).toBe(true);
  assertFoundationKeyInventory(completed, imageKeys);
  assertFoundationKeyInventory(barcodes.map(foundationRowKey), barcodeKeys);
  assertFoundationKeyInventory([...completed, ...barcodes.map(foundationRowKey)], expectedKeys);
  assertFoundationKeyInventory(f.ledger.getCompletedReportPredictions().map((row) => row.key), imageKeys);
  const journals = readFoundationTypedJournalEntries(f.baseDir);
  assertFoundationKeyInventory(journals.map((row) => row.key), imageKeys);
  expect(f.ledger.getCounts()).toEqual({ imageReserved: 146, tokenCountReserved: 1 });
  for (const [stage, total, images] of [
    ["preflight", 2, 2], ["development", 48, 48], ["validation", 48, 48], ["benchmark", 60, 48],
  ] as const) {
    expect(started.filter((event) => event.key.stage === stage)).toHaveLength(total);
    expect(finished.filter((event) => event.key.stage === stage)).toHaveLength(total);
    expect(completed.filter((key) => key.stage === stage)).toHaveLength(images);
  }
}

function assertFoundationMeasuredPopulations(metrics: Readonly<CalibrationStageGateMetrics>): void {
  expect(metrics.mealCarbDensityEligibleCount).toBe(33);
  expect(metrics.mealMassEligibleCount).toBe(36);
  expect(metrics.mealDensityCoverageCount).toBe(36);
  expect(metrics.mealFatDensityEligibleCount).toBe(36);
  expect(metrics.mealOutcomeCount).toBe(36);
  expect(metrics.parsedMealCount).toBe(36);
  expect(metrics.labelOutcomeCount).toBe(12);
  expect(metrics.suppliedBarcodeOutcomeCount).toBe(12);
}

function assertFoundationOutcomePlanPopulations(
  context: Readonly<CalibrationPreparedContext>,
  profile: CalibrationProfile,
): void {
  const plan = deriveCanonicalReportOutcomePlan(context.files, profile);
  const byStage = (stage: StageName): number => plan.filter((row) => row.key.stage === stage).length;
  expect(byStage("preflight")).toBe(2);
  expect(byStage("development")).toBe(48);
  expect(byStage("validation")).toBe(48);
  expect(byStage("benchmark")).toBe(60);
  const barcode = plan.filter((row) => row.scanMode === "barcode");
  expect(barcode.length).toBe(12);
  expect(barcode.every((row) => row.key.stage === "benchmark")).toBe(true);
  const keyIds = new Set(plan.map((row) => foundationCanonicalKeyId(row.key)));
  expect(keyIds.size).toBe(158);
}

function isFoundationPairEvent(event: RuntimeEvidenceEvent): event is RuntimePairEvent {
  return event.type !== "runtime_report_bound";
}

function isFoundationFinishedEvent(
  event: RuntimeEvidenceEvent,
): event is RuntimeEvidenceEvent & { type: "runtime_attempt_finished" } {
  return event.type === "runtime_attempt_finished";
}

/** Independent original-cutoff digest check mirroring the public hash contract. */
function assertFoundationBindingDigest(
  context: Readonly<CalibrationPreparedContext>,
  snapshot: { readonly events: readonly RuntimeEvidenceEvent[] },
  binding: RuntimeEvidenceEvent & { type: "runtime_report_bound" },
): readonly RuntimePairEvent[] {
  const plan = pairPlanFor(context, binding.stage, binding.profile);
  expect(plan.length).toBeGreaterThan(0);

  const pairEvents = snapshot.events.filter(isFoundationPairEvent).filter(
    (event) =>
      event.sequence <= binding.throughSequence &&
      event.key.stage === binding.stage &&
      event.key.profile === binding.profile,
  );
  assertFoundationKeyInventory(
    pairEvents.filter(isFoundationFinishedEvent).map((event) => event.key),
    plan.map((row) => row.key),
  );

  const terminals = plan
    .map((row) => {
      const finished = pairEvents.find(
        (event) =>
          isFoundationFinishedEvent(event) && foundationCanonicalKeyId(event.key) === foundationCanonicalKeyId(row.key),
      );
      if (finished === undefined || !isFoundationFinishedEvent(finished)) {
        throw new Error(`missing finished attempt for canonical key ${foundationCanonicalKeyId(row.key)}`);
      }
      return { key: { ...row.key }, terminal: finished.terminal };
    })
    .sort((a, b) => {
      const idA = foundationCanonicalKeyId(a.key);
      const idB = foundationCanonicalKeyId(b.key);
      if (idA < idB) return -1;
      if (idA > idB) return 1;
      return 0;
    });

  const digest = hashCalibrationRuntimeEvidenceBinding({
    version: 1,
    identity: context.identity,
    stage: binding.stage,
    profile: binding.profile,
    throughSequence: binding.throughSequence,
    events: pairEvents,
    terminals,
    receipt: binding.receipt,
  });
  expect(digest).toBe(binding.bindingSha256);
  return pairEvents;
}

/** Opens a fresh released copy natively, verifies all six receipts/bindings
 * read-only, then releases the exact acquired owner. */
async function assertFoundationNativeOpenAndBindings(
  roots: string[],
  template: Readonly<BenchmarkTemplate>,
): Promise<void> {
  const f = await openBenchmarkTemplate(roots, template);
  try {
    assertFoundationOutcomePlanPopulations(f.context, template.profile);
    assertFoundationActualInventory(f, template.profile);

    const snapshot = f.ledger.getRuntimeEvidenceSnapshot();
    expect(snapshot.activeAttempt).toBeNull();

    const bound = snapshot.events.filter(
      (event): event is RuntimeEvidenceEvent & { type: "runtime_report_bound" } =>
        event.type === "runtime_report_bound",
    );
    expect(bound.length).toBe(6);
    const expectedPairs = new Set([
      "preflight|LOW", "preflight|MEDIUM", "development|LOW", "development|MEDIUM",
      `validation|${template.profile}`, `benchmark|${template.profile}`,
    ]);
    expect(new Set(bound.map((binding) => `${binding.stage}|${binding.profile}`))).toEqual(expectedPairs);
    const receipts = readFoundationLedgerRows(f.baseDir)
      .filter((row) => foundationRowType(row) === "artifact_receipt_admitted").map((row) => row["receipt"]);
    expect(receipts).toHaveLength(6);
    const ledgerBefore = readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "ledger.json"));
    const journalBefore = readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "journal.json"));
    const lockBefore = f.readLockBytes();
    const artifactBytes = bound.flatMap((binding) => ["json", "md"].map((extension) => {
      const path = resolve(f.baseDir, CALIBRATION_ROOT, "reports",
        `${binding.stage}-${binding.profile.toLowerCase()}.${extension}`);
      return { path, bytes: readFileSync(path) };
    }));

    const verifier = await prepareCalibrationStageReportArtifactVerifier(f.context);
    for (const binding of bound) {
      expect(receipts).toContainEqual(binding.receipt);
      const reportSnapshot = f.ledger.getStageReportSnapshot(binding.stage, binding.profile);
      expect(reportSnapshot.counts.imageCallsPending).toBe(0);
      const verified = verifier.verify({
        stage: binding.stage,
        profile: binding.profile,
        snapshot: reportSnapshot,
      });
      expect(verified.receipt).toEqual(binding.receipt);
      if (binding.stage === "benchmark") {
        assertFoundationMeasuredPopulations(measureCalibrationStageReport(verified.report).stage);
      }

      const jsonPath = resolve(
        f.baseDir, CALIBRATION_ROOT, "reports", `${binding.stage}-${binding.profile.toLowerCase()}.json`,
      );
      const mdPath = resolve(
        f.baseDir, CALIBRATION_ROOT, "reports", `${binding.stage}-${binding.profile.toLowerCase()}.md`,
      );
      expect(createHash("sha256").update(readFileSync(jsonPath)).digest("hex")).toBe(binding.receipt.jsonSha256);
      expect(createHash("sha256").update(readFileSync(mdPath)).digest("hex")).toBe(binding.receipt.markdownSha256);

      assertFoundationBindingDigest(f.context, snapshot, binding);
    }
    expect(readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "ledger.json")).equals(ledgerBefore)).toBe(true);
    expect(readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "journal.json")).equals(journalBefore)).toBe(true);
    expect(f.readLockBytes()).toEqual(lockBefore);
    for (const artifact of artifactBytes) expect(readFileSync(artifact.path).equals(artifact.bytes)).toBe(true);
  } finally {
    f.ledger.releaseLock({ ...f.context.owner });
  }
  expect(existsSync(resolve(f.baseDir, CALIBRATION_ROOT, "lock.json"))).toBe(false);
  assertFoundationTemplateUnchanged(template);
}

describe.sequential("native benchmark foundations", () => {
  it("builds and releases a full prior-failure LOW native template", async () => {
    saveFoundationTemplate("LOW", "prior-failure", await buildBenchmarkTemplate(roots, "LOW"));
    const template = requireFoundationTemplate("LOW", "prior-failure");
    assertFoundationTemplateShape(template, "MEDIUM");
    await assertFoundationNativeOpenAndBindings(roots, template);
  }, 600000);

  it("builds and releases a full prior-failure MEDIUM native template", async () => {
    saveFoundationTemplate("MEDIUM", "prior-failure", await buildBenchmarkTemplate(roots, "MEDIUM"));
    const template = requireFoundationTemplate("MEDIUM", "prior-failure");
    assertFoundationTemplateShape(template, "LOW");
    await assertFoundationNativeOpenAndBindings(roots, template);
  }, 600000);

  it("builds a full protein-negative native template with a passing historical subset", async () => {
    saveFoundationTemplate("MEDIUM", "benchmark-meal-protein",
      await buildBenchmarkTemplate(roots, "MEDIUM", "benchmark-meal-protein"));
    const template = requireFoundationTemplate("MEDIUM", "benchmark-meal-protein");
    assertFoundationTemplateShape(template, "LOW");
    await assertFoundationNativeOpenAndBindings(roots, template);

    const f = await openBenchmarkTemplate(roots, template);
    try {
      const verifier = await prepareCalibrationStageReportArtifactVerifier(f.context);
      const verifiedBenchmark = verifier.verify({
        stage: "benchmark",
        profile: "MEDIUM",
        snapshot: f.ledger.getStageReportSnapshot("benchmark", "MEDIUM"),
      });

      const history = prepareCalibrationBenchmarkHistory({
        historicalReferenceBytes: f.context.files["historical-reference"],
        historicalReferenceHash: f.context.identity.historicalReferenceHash,
      });
      const assessment = history.assess(verifiedBenchmark.report);
      expect(assessment.comparison.compatible).toBe(true);
      expect(
        SUPPORTED_HISTORICAL_DELTA_FIELDS.every((field) => {
          const value = assessment.comparison.deltas?.[field];
          return typeof value === "number" && Number.isFinite(value);
        }),
      ).toBe(true);
      expect(assessment.subset.passed).toBe(true);
      expect(assessment.measurements.stage.medianMealProteinRelativeError).toBeGreaterThan(0.35);
      expect(assessment.measurements.stage.meanMacroRelativeError).toBeLessThan(0.45);

      const snapshot = f.ledger.getRuntimeEvidenceSnapshot();
      const binding = snapshot.events.find(
        (event): event is RuntimeEvidenceEvent & { type: "runtime_report_bound" } =>
          event.type === "runtime_report_bound" && event.stage === "benchmark" && event.profile === "MEDIUM",
      );
      if (binding === undefined) throw new Error("missing benchmark|MEDIUM runtime_report_bound event");

      const plan = deriveCanonicalReportOutcomePlan(f.context.files, "MEDIUM").filter(
        (row) => row.key.stage === "benchmark",
      );
      assertFoundationProteinPerturbation(template, requireFoundationTemplate("MEDIUM", "prior-failure"),
        plan.filter((row) => row.scanMode === "meal").map((row) => row.key));
      const imageKeys = new Set(
        plan.filter((row) => row.scanMode !== "barcode").map((row) => foundationCanonicalKeyId(row.key)),
      );
      const barcodeKeys = new Set(
        plan.filter((row) => row.scanMode === "barcode").map((row) => foundationCanonicalKeyId(row.key)),
      );
      const pairEvents = assertFoundationBindingDigest(f.context, snapshot, binding);

      // Structural fact of this mediated image/vision/snapshot protocol only:
      // not an SDK or network-isolation proof.
      for (const event of pairEvents) {
        if (event.type !== "runtime_operation_started") continue;
        expect(["image", "vision", "snapshot"]).toContain(event.operation);
        if (barcodeKeys.has(foundationCanonicalKeyId(event.key))) {
          expect(event.operation).toBe("snapshot");
        }
      }

      let visionCallCount = 0;
      let suppliedBarcodeImageCallCount = 0;
      let suppliedBarcodeVisionCallCount = 0;
      for (const event of pairEvents) {
        const id = foundationCanonicalKeyId(event.key);
        if (barcodeKeys.has(id)) {
          if (event.type === "runtime_operation_started" && event.operation === "image") {
            suppliedBarcodeImageCallCount += 1;
          }
          if (
            (event.type === "runtime_operation_started" && event.operation === "vision") ||
            event.type === "runtime_request_authorized"
          ) {
            suppliedBarcodeVisionCallCount += 1;
          }
        }
        if (event.type === "runtime_operation_started" && event.operation === "vision" && imageKeys.has(id)) {
          visionCallCount += 1;
        }
      }
      expect(visionCallCount).toBe(48);
      expect(suppliedBarcodeImageCallCount).toBe(0);
      expect(suppliedBarcodeVisionCallCount).toBe(0);

      const metrics: CalibrationStageGateMetrics = {
        ...assessment.measurements.stage,
        visionCallCount,
        suppliedBarcodeImageCallCount,
        suppliedBarcodeVisionCallCount,
        suppliedBarcodeLiveOffCallCount: 0,
      };
      const gate = evaluateCalibrationStageGate("benchmark", metrics);
      expect(gate.passed).toBe(false);
      expect(gate.failedChecks).toContain("medianMealProteinRelativeError");
      expect(gate.failedChecks).not.toContain("visionCallCount");
      expect(gate.failedChecks).not.toContain("suppliedBarcodeImageCallCount");
      expect(gate.failedChecks).not.toContain("suppliedBarcodeVisionCallCount");
      expect(gate.failedChecks).not.toContain("suppliedBarcodeLiveOffCallCount");
    } finally {
      f.ledger.releaseLock({ ...f.context.owner });
    }

    expect(existsSync(resolve(f.baseDir, CALIBRATION_ROOT, "lock.json"))).toBe(false);
    assertFoundationTemplateUnchanged(template);
  }, 600000);
});

interface BenchmarkReportBinding {
  readonly jsonPath: string;
  readonly mdPath: string;
}

function captureBenchmarkReportBindings(
  f: Readonly<BenchmarkNativeCase>,
): ReadonlyMap<string, BenchmarkReportBinding> {
  const snapshot = f.ledger.getRuntimeEvidenceSnapshot();
  const bound = snapshot.events.filter(
    (event): event is RuntimeEvidenceEvent & { type: "runtime_report_bound" } =>
      event.type === "runtime_report_bound",
  );
  expect(bound).toHaveLength(6);
  const bindings = new Map<string, BenchmarkReportBinding>();
  for (const event of bound) {
    const pairId = `${event.stage}|${event.profile}`;
    const base = resolve(f.baseDir, CALIBRATION_ROOT, "reports", `${event.stage}-${event.profile.toLowerCase()}`);
    bindings.set(pairId, { jsonPath: `${base}.json`, mdPath: `${base}.md` });
  }
  expect(bindings.size).toBe(6);
  return bindings;
}

interface BenchmarkDiskInvariantSnapshot {
  readonly ledgerBytes: Buffer;
  readonly journalBytes: Buffer;
  readonly lockBytes: Buffer;
  readonly events: readonly Record<string, unknown>[];
  readonly journals: readonly Record<string, unknown>[];
  readonly reportBytes: ReadonlyMap<string, Buffer>;
}

function captureBenchmarkDiskInvariants(
  f: Readonly<BenchmarkNativeCase>,
  bindings: ReadonlyMap<string, BenchmarkReportBinding>,
): BenchmarkDiskInvariantSnapshot {
  const reportBytes = new Map<string, Buffer>();
  for (const binding of bindings.values()) {
    reportBytes.set(binding.jsonPath, readFileSync(binding.jsonPath));
    reportBytes.set(binding.mdPath, readFileSync(binding.mdPath));
  }
  expect(reportBytes.size).toBe(12);
  return {
    ledgerBytes: readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "ledger.json")),
    journalBytes: readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "journal.json")),
    lockBytes: f.readLockBytes(),
    events: f.readEvents(),
    journals: f.readJournals(),
    reportBytes,
  };
}

function assertBenchmarkDiskInvariantsUnchanged(
  before: Readonly<BenchmarkDiskInvariantSnapshot>,
  f: Readonly<BenchmarkNativeCase>,
): void {
  expect(f.readLockBytes().equals(before.lockBytes)).toBe(true);
  expect(readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "ledger.json")).equals(before.ledgerBytes)).toBe(true);
  expect(readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "journal.json")).equals(before.journalBytes)).toBe(true);
  expect(f.readEvents()).toEqual(before.events);
  expect(f.readJournals()).toEqual(before.journals);
  for (const [path, bytes] of before.reportBytes) {
    expect(readFileSync(path).equals(bytes)).toBe(true);
  }
}

function assertOwnedCalibrationFatal(error: unknown): void {
  if (!(error instanceof CalibrationFatalError)) {
    throw new Error("expected an owned CalibrationFatalError");
  }
  expect(error.message).toBe("calibration:benchmark-authority-failed");
  expect(Object.hasOwn(error, "cause")).toBe(false);
}

function captureThrown(run: () => void): unknown {
  try {
    run();
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected completeStage to reject");
}

describe.sequential("task3 native completion", () => {
  it("actual healthy LOW completion", async () => {
    const profile = "LOW";
    const template = requireFoundationTemplate(profile, "prior-failure");
    const baseDir = copyBenchmarkTemplate(roots, template);
    const witness = makeBenchmarkCompletionWitness(resolve(baseDir, CALIBRATION_ROOT));
    const f = await openBenchmarkBase(baseDir, witness.overrides);
    try {
      expect(witness.trace).toEqual([]);
      expect(witness.hitCount).toBe(0);
      const bindings = captureBenchmarkReportBindings(f);
      const before = captureBenchmarkDiskInvariants(f, bindings);
      expect(
        before.events.some((event) => event["type"] === "stage_completed" && event["stage"] === "benchmark"),
      ).toBe(false);

      const firstResult = f.ledger.completeStage("benchmark", {
        stage: "benchmark",
        passed: true,
        completedStages: ["preflight", "development", "validation"],
      });
      expect(firstResult).toBeUndefined();

      const afterFirstEvents = f.readEvents();
      expect(afterFirstEvents).toHaveLength(before.events.length + 1);
      expect(afterFirstEvents.slice(0, before.events.length)).toEqual(before.events);
      const lastEvent = afterFirstEvents[afterFirstEvents.length - 1];
      if (lastEvent === undefined) throw new Error("missing stage_completed benchmark event");
      expect(lastEvent).toEqual({
        type: "stage_completed",
        stage: "benchmark",
        passed: true,
        at: expect.any(String),
      });
      expect(before.ledgerBytes.equals(Buffer.from(JSON.stringify(before.events)))).toBe(true);
      const ledgerAfterFirst = readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "ledger.json"));
      expect(ledgerAfterFirst.equals(Buffer.from(JSON.stringify([...before.events, lastEvent])))).toBe(true);

      expect(readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "journal.json")).equals(before.journalBytes)).toBe(true);
      expect(f.readJournals()).toEqual(before.journals);
      for (const [path, bytes] of before.reportBytes) {
        expect(readFileSync(path).equals(bytes)).toBe(true);
      }
      expect(f.readLockBytes().equals(before.lockBytes)).toBe(true);
      expect(witness.trace).toEqual(fullOperationTrace());
      expect(witness.hitCount).toBe(0);

      const secondResult = f.ledger.completeStage("benchmark", {
        stage: "benchmark",
        passed: true,
        completedStages: ["preflight", "development", "validation"],
      });
      expect(secondResult).toBeUndefined();
      expect(readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "ledger.json")).equals(ledgerAfterFirst)).toBe(true);
      expect(f.readEvents()).toEqual(afterFirstEvents);
      expect(readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "journal.json")).equals(before.journalBytes)).toBe(true);
      expect(f.readJournals()).toEqual(before.journals);
      for (const [path, bytes] of before.reportBytes) {
        expect(readFileSync(path).equals(bytes)).toBe(true);
      }
      expect(f.readLockBytes().equals(before.lockBytes)).toBe(true);
      expect(witness.trace).toEqual(fullOperationTrace());
      expect(witness.hitCount).toBe(0);
    } finally {
      witness.disarm();
      f.ledger.releaseLock({ ...f.context.owner });
    }
    expect(existsSync(resolve(f.baseDir, CALIBRATION_ROOT, "lock.json"))).toBe(false);
    assertFoundationTemplateUnchanged(template);
  }, 600000);

  it("actual healthy MEDIUM completion", async () => {
    const profile = "MEDIUM";
    const template = requireFoundationTemplate(profile, "prior-failure");
    const baseDir = copyBenchmarkTemplate(roots, template);
    const witness = makeBenchmarkCompletionWitness(resolve(baseDir, CALIBRATION_ROOT));
    const f = await openBenchmarkBase(baseDir, witness.overrides);
    try {
      expect(witness.trace).toEqual([]);
      expect(witness.hitCount).toBe(0);
      const bindings = captureBenchmarkReportBindings(f);
      const before = captureBenchmarkDiskInvariants(f, bindings);
      expect(
        before.events.some((event) => event["type"] === "stage_completed" && event["stage"] === "benchmark"),
      ).toBe(false);

      const firstResult = f.ledger.completeStage("benchmark", {
        stage: "benchmark",
        passed: true,
        completedStages: ["preflight", "development", "validation"],
      });
      expect(firstResult).toBeUndefined();

      const afterFirstEvents = f.readEvents();
      expect(afterFirstEvents).toHaveLength(before.events.length + 1);
      expect(afterFirstEvents.slice(0, before.events.length)).toEqual(before.events);
      const lastEvent = afterFirstEvents[afterFirstEvents.length - 1];
      if (lastEvent === undefined) throw new Error("missing stage_completed benchmark event");
      expect(lastEvent).toEqual({
        type: "stage_completed",
        stage: "benchmark",
        passed: true,
        at: expect.any(String),
      });
      expect(before.ledgerBytes.equals(Buffer.from(JSON.stringify(before.events)))).toBe(true);
      const ledgerAfterFirst = readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "ledger.json"));
      expect(ledgerAfterFirst.equals(Buffer.from(JSON.stringify([...before.events, lastEvent])))).toBe(true);

      expect(readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "journal.json")).equals(before.journalBytes)).toBe(true);
      expect(f.readJournals()).toEqual(before.journals);
      for (const [path, bytes] of before.reportBytes) {
        expect(readFileSync(path).equals(bytes)).toBe(true);
      }
      expect(f.readLockBytes().equals(before.lockBytes)).toBe(true);
      expect(witness.trace).toEqual(fullOperationTrace());
      expect(witness.hitCount).toBe(0);

      const secondResult = f.ledger.completeStage("benchmark", {
        stage: "benchmark",
        passed: true,
        completedStages: ["preflight", "development", "validation"],
      });
      expect(secondResult).toBeUndefined();
      expect(readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "ledger.json")).equals(ledgerAfterFirst)).toBe(true);
      expect(f.readEvents()).toEqual(afterFirstEvents);
      expect(readFileSync(resolve(f.baseDir, CALIBRATION_ROOT, "journal.json")).equals(before.journalBytes)).toBe(true);
      expect(f.readJournals()).toEqual(before.journals);
      for (const [path, bytes] of before.reportBytes) {
        expect(readFileSync(path).equals(bytes)).toBe(true);
      }
      expect(f.readLockBytes().equals(before.lockBytes)).toBe(true);
      expect(witness.trace).toEqual(fullOperationTrace());
      expect(witness.hitCount).toBe(0);
    } finally {
      witness.disarm();
      f.ledger.releaseLock({ ...f.context.owner });
    }
    expect(existsSync(resolve(f.baseDir, CALIBRATION_ROOT, "lock.json"))).toBe(false);
    assertFoundationTemplateUnchanged(template);
  }, 600000);

  it("actual protein-negative completion rejection and permanent poison", async () => {
    const profile = "MEDIUM";
    const template = requireFoundationTemplate(profile, "benchmark-meal-protein");
    const baseDir = copyBenchmarkTemplate(roots, template);
    const witness = makeBenchmarkCompletionWitness(resolve(baseDir, CALIBRATION_ROOT));
    const f = await openBenchmarkBase(baseDir, witness.overrides);
    try {
      const verifier = await prepareCalibrationStageReportArtifactVerifier(f.context);
      const verifiedBenchmark = verifier.verify({
        stage: "benchmark",
        profile: "MEDIUM",
        snapshot: f.ledger.getStageReportSnapshot("benchmark", "MEDIUM"),
      });
      const history = prepareCalibrationBenchmarkHistory({
        historicalReferenceBytes: f.context.files["historical-reference"],
        historicalReferenceHash: f.context.identity.historicalReferenceHash,
      });
      const assessment = history.assess(verifiedBenchmark.report);
      expect(assessment.comparison.compatible).toBe(true);
      expect(
        SUPPORTED_HISTORICAL_DELTA_FIELDS.every((field) => {
          const value = assessment.comparison.deltas?.[field];
          return typeof value === "number" && Number.isFinite(value);
        }),
      ).toBe(true);
      expect(assessment.subset.passed).toBe(true);
      expect(assessment.measurements.stage.medianMealProteinRelativeError).toBeGreaterThan(0.35);
      expect(assessment.measurements.stage.meanMacroRelativeError).toBeLessThan(0.45);

      expect(witness.trace).toEqual([]);
      expect(witness.hitCount).toBe(0);
      const bindings = captureBenchmarkReportBindings(f);
      const before = captureBenchmarkDiskInvariants(f, bindings);
      expect(
        before.events.some((event) => event["type"] === "stage_completed" && event["stage"] === "benchmark"),
      ).toBe(false);

      const completeOnce = (): unknown =>
        captureThrown(() => {
          f.ledger.completeStage("benchmark", {
            stage: "benchmark",
            passed: true,
            completedStages: ["preflight", "development", "validation"],
          });
        });

      assertOwnedCalibrationFatal(completeOnce());
      assertBenchmarkDiskInvariantsUnchanged(before, f);
      expect(witness.trace).toEqual([]);
      expect(witness.hitCount).toBe(0);

      witness.disarm();

      assertOwnedCalibrationFatal(completeOnce());
      assertBenchmarkDiskInvariantsUnchanged(before, f);
      expect(witness.trace).toEqual([]);
      expect(witness.hitCount).toBe(0);

      assertFoundationTemplateUnchanged(template);
    } finally {
      witness.disarm();
    }
  }, 600000);
});

function expectedCompletionCutTrace(
  operation: BenchmarkCutOperation,
  side: "before" | "after",
): string[] {
  const trace: string[] = [];
  const operationIndex = CUT_OPERATIONS.indexOf(operation);
  for (let i = 0; i < operationIndex; i += 1) {
    trace.push(`${CUT_OPERATIONS[i]}:before`, `${CUT_OPERATIONS[i]}:after`);
  }
  if (side === "before") {
    trace.push(`${operation}:before`, `${operation}:fault-before`);
  } else {
    trace.push(`${operation}:before`, `${operation}:after`, `${operation}:fault-after`);
  }
  if (operation === "write" || operation === "file-fsync") {
    trace.push("cleanup:close:before", "cleanup:close:after");
  }
  return trace;
}

function isCompletionCutPublished(operation: BenchmarkCutOperation, side: "before" | "after"): boolean {
  return operation === "directory-fsync" || (operation === "rename" && side === "after");
}

describe.sequential("task3 native completion cuts", () => {
  for (const operation of CUT_OPERATIONS) {
    for (const side of CUT_SIDES) {
      it(`task3 native completeStage fault cut ${operation} ${side}`, async () => {
        const profile = "MEDIUM";
        const template = requireFoundationTemplate(profile, "prior-failure");
        const baseDir = copyBenchmarkTemplate(roots, template);
        const canonical = resolve(baseDir, CALIBRATION_ROOT);
        const witness = makeBenchmarkCompletionWitness(canonical);
        const f = await openBenchmarkBase(baseDir, witness.overrides);
        try {
          expect(witness.trace).toEqual([]);
          expect(witness.hitCount).toBe(0);
          const bindings = captureBenchmarkReportBindings(f);
          const before = captureBenchmarkDiskInvariants(f, bindings);
          expect(
            before.events.some((event) => event["type"] === "stage_completed" && event["stage"] === "benchmark"),
          ).toBe(false);
          expect(before.ledgerBytes.equals(Buffer.from(JSON.stringify(before.events)))).toBe(true);
          const ledgerPath = resolve(canonical, "ledger.json");
          const journalPath = resolve(canonical, "journal.json");
          const inventoryBefore = readdirSync(canonical).sort();

          witness.arm(operation, side);
          const thrown = captureThrown(() => {
            f.ledger.completeStage("benchmark", {
              stage: "benchmark",
              passed: true,
              completedStages: ["preflight", "development", "validation"],
            });
          });
          assertOwnedCalibrationFatal(thrown);
          expect(witness.hitCount).toBe(1);
          expect(witness.trace).toEqual(expectedCompletionCutTrace(operation, side));

          const postFaultLedgerBytes = readFileSync(ledgerPath);
          const postFaultEvents = f.readEvents();
          if (isCompletionCutPublished(operation, side)) {
            expect(postFaultEvents).toHaveLength(before.events.length + 1);
            expect(postFaultEvents.slice(0, before.events.length)).toEqual(before.events);
            const lastEvent = postFaultEvents[postFaultEvents.length - 1];
            if (lastEvent === undefined) throw new Error("missing stage_completed benchmark event");
            expect(lastEvent).toEqual({
              type: "stage_completed",
              stage: "benchmark",
              passed: true,
              at: expect.any(String),
            });
            expect(
              postFaultLedgerBytes.equals(Buffer.from(JSON.stringify([...before.events, lastEvent]))),
            ).toBe(true);
          } else {
            expect(postFaultEvents).toEqual(before.events);
            expect(postFaultLedgerBytes.equals(before.ledgerBytes)).toBe(true);
          }

          expect(readFileSync(journalPath).equals(before.journalBytes)).toBe(true);
          expect(f.readJournals()).toEqual(before.journals);
          for (const [path, bytes] of before.reportBytes) {
            expect(readFileSync(path).equals(bytes)).toBe(true);
          }
          expect(f.readLockBytes().equals(before.lockBytes)).toBe(true);
          expect(readdirSync(canonical).sort()).toEqual(inventoryBefore);

          const postFaultTrace = [...witness.trace];
          witness.disarm();

          const secondThrown = captureThrown(() => {
            f.ledger.completeStage("benchmark", {
              stage: "benchmark",
              passed: true,
              completedStages: ["preflight", "development", "validation"],
            });
          });
          assertOwnedCalibrationFatal(secondThrown);
          expect(witness.hitCount).toBe(1);
          expect(witness.trace).toEqual(postFaultTrace);
          expect(readFileSync(ledgerPath).equals(postFaultLedgerBytes)).toBe(true);
          expect(f.readEvents()).toEqual(postFaultEvents);
          expect(readFileSync(journalPath).equals(before.journalBytes)).toBe(true);
          expect(f.readJournals()).toEqual(before.journals);
          for (const [path, bytes] of before.reportBytes) {
            expect(readFileSync(path).equals(bytes)).toBe(true);
          }
          expect(f.readLockBytes().equals(before.lockBytes)).toBe(true);
          expect(readdirSync(canonical).sort()).toEqual(inventoryBefore);

          assertFoundationTemplateUnchanged(template);
        } finally {
          witness.disarm();
        }
      }, 600000);
    }
  }
});

interface RenameCutOldState {
  readonly template: Readonly<BenchmarkTemplate>;
  readonly baseDir: string;
  readonly canonical: string;
  readonly f: Readonly<BenchmarkNativeCase>;
  readonly oldWitness: BenchmarkCompletionWitness;
  readonly oldOwner: CalibrationOwner;
  readonly before: BenchmarkDiskInvariantSnapshot;
  readonly inventoryBefore: string[];
  readonly postFaultLedgerBytes: Buffer;
  readonly postFaultEvents: readonly Record<string, unknown>[];
  readonly originalBindings: readonly (RuntimeEvidenceEvent & { type: "runtime_report_bound" })[];
}

async function setupRenameCutOldState(
  roots: string[],
  side: "before" | "after",
): Promise<RenameCutOldState> {
  const template = requireFoundationTemplate("MEDIUM", "prior-failure");
  const baseDir = copyBenchmarkTemplate(roots, template);
  const canonical = resolve(baseDir, CALIBRATION_ROOT);
  const oldWitness = makeBenchmarkCompletionWitness(canonical);
  const f = await openBenchmarkBase(baseDir, oldWitness.overrides);
  const oldOwner = f.context.owner;
  expect(oldWitness.trace).toEqual([]);
  expect(oldWitness.hitCount).toBe(0);
  const bindings = captureBenchmarkReportBindings(f);
  const before = captureBenchmarkDiskInvariants(f, bindings);
  expect(
    before.events.some((event) => event["type"] === "stage_completed" && event["stage"] === "benchmark"),
  ).toBe(false);
  expect(before.ledgerBytes.equals(Buffer.from(JSON.stringify(before.events)))).toBe(true);
  const inventoryBefore = readdirSync(canonical).sort();

  const originalBindings = f.ledger.getRuntimeEvidenceSnapshot().events.filter(
    (event): event is RuntimeEvidenceEvent & { type: "runtime_report_bound" } =>
      event.type === "runtime_report_bound",
  );
  expect(originalBindings.length).toBe(6);

  oldWitness.arm("rename", side);
  const thrown = captureThrown(() => {
    f.ledger.completeStage("benchmark", {
      stage: "benchmark",
      passed: true,
      completedStages: ["preflight", "development", "validation"],
    });
  });
  assertOwnedCalibrationFatal(thrown);
  expect(oldWitness.hitCount).toBe(1);
  expect(oldWitness.trace).toEqual(expectedCompletionCutTrace("rename", side));

  const ledgerPath = resolve(canonical, "ledger.json");
  const postFaultLedgerBytes = readFileSync(ledgerPath);
  const postFaultEvents = f.readEvents();
  if (isCompletionCutPublished("rename", side)) {
    expect(postFaultEvents).toHaveLength(before.events.length + 1);
    expect(postFaultEvents.slice(0, before.events.length)).toEqual(before.events);
    const lastEvent = postFaultEvents[postFaultEvents.length - 1];
    if (lastEvent === undefined) throw new Error("missing stage_completed benchmark event");
    expect(lastEvent).toEqual({
      type: "stage_completed", stage: "benchmark", passed: true, at: expect.any(String),
    });
    expect(postFaultLedgerBytes.equals(Buffer.from(JSON.stringify([...before.events, lastEvent])))).toBe(true);
  } else {
    expect(postFaultEvents).toEqual(before.events);
    expect(postFaultLedgerBytes.equals(before.ledgerBytes)).toBe(true);
  }
  expect(readFileSync(resolve(canonical, "journal.json")).equals(before.journalBytes)).toBe(true);
  expect(f.readJournals()).toEqual(before.journals);
  for (const [path, bytes] of before.reportBytes) {
    expect(readFileSync(path).equals(bytes)).toBe(true);
  }
  expect(f.readLockBytes().equals(before.lockBytes)).toBe(true);
  expect(readdirSync(canonical).sort()).toEqual(inventoryBefore);

  oldWitness.disarm();

  return {
    template, baseDir, canonical, f, oldWitness, oldOwner, before,
    inventoryBefore, postFaultLedgerBytes, postFaultEvents, originalBindings,
  };
}

function procStatLine(pid: number, startTicks: number): string {
  return `${pid} (comm) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 ${startTicks}`;
}

async function captureRejected(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

function assertOwnedRuntimeOperationFailed(error: unknown): void {
  if (!(error instanceof CalibrationFatalError)) {
    throw new Error("expected an owned CalibrationFatalError");
  }
  expect(error.message).toBe("calibration:runtime-operation-failed");
  expect(Object.hasOwn(error, "cause")).toBe(false);
}

interface RawCalibrationOwnerShape {
  readonly hostname: string;
  readonly bootId: string;
  readonly pid: number;
  readonly startTicks: number;
  readonly acquiredAt: string;
}

function readOwnedLockJson(lockBytes: Buffer): RawCalibrationOwnerShape {
  const parsed: unknown = JSON.parse(lockBytes.toString("utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("expected lock bytes to decode to an owner object");
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 5 ||
    typeof record["hostname"] !== "string" ||
    typeof record["bootId"] !== "string" ||
    typeof record["pid"] !== "number" ||
    typeof record["startTicks"] !== "number" ||
    typeof record["acquiredAt"] !== "string"
  ) {
    throw new Error("expected a closed five-field calibration owner shape");
  }
  return {
    hostname: record["hostname"],
    bootId: record["bootId"],
    pid: record["pid"],
    startTicks: record["startTicks"],
    acquiredAt: record["acquiredAt"],
  };
}

async function assertRecoveredBenchmarkBindings(
  f: Readonly<BenchmarkNativeCase>,
  profile: CalibrationProfile,
  originalBindings: readonly (RuntimeEvidenceEvent & { type: "runtime_report_bound" })[],
): Promise<void> {
  assertFoundationActualInventory(f, profile);
  const snapshot = f.ledger.getRuntimeEvidenceSnapshot();
  expect(snapshot.activeAttempt).toBeNull();
  const bound = snapshot.events.filter(
    (event): event is RuntimeEvidenceEvent & { type: "runtime_report_bound" } =>
      event.type === "runtime_report_bound",
  );
  expect(bound.length).toBe(6);
  expect(bound).toEqual(originalBindings);
  const verifier = await prepareCalibrationStageReportArtifactVerifier(f.context);
  for (const binding of bound) {
    assertFoundationBindingDigest(f.context, snapshot, binding);
    const reportSnapshot = f.ledger.getStageReportSnapshot(binding.stage, binding.profile);
    const verified = verifier.verify({ stage: binding.stage, profile: binding.profile, snapshot: reportSnapshot });
    expect(verified.receipt).toEqual(binding.receipt);
  }
}

describe.sequential("task3 native recovery", () => {
  for (const side of CUT_SIDES) {
    for (const livenessMode of ["enoent", "pid-reused"] as const) {
      it(`task3 native recovery ${livenessMode} rename ${side}`, async () => {
        const old = await setupRenameCutOldState(roots, side);
        const {
          template, baseDir, canonical, f, oldWitness, oldOwner, before,
          inventoryBefore, postFaultEvents, originalBindings,
        } = old;
        const oldLockBytes = f.readLockBytes();
        const seenPids: number[] = [];
        const procStatReader = (pid: number): string => {
          seenPids.push(pid);
          if (livenessMode === "enoent") {
            throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
          }
          return procStatLine(pid, oldOwner.startTicks + 1);
        };
        const freshWitness = makeBenchmarkCompletionWitness(canonical);
        const f2 = await openBenchmarkBase(baseDir, { ...freshWitness.overrides, procStatReader });
        try {
          expect(seenPids).toEqual([oldOwner.pid]);
          expect(f2.context.owner).not.toEqual(oldOwner);
          expect(f2.context.owner.acquiredAt).not.toBe(oldOwner.acquiredAt);

          const archiveName = `lock.archive.${oldOwner.pid}.${oldOwner.startTicks}.json`;
          const archivePath = resolve(canonical, archiveName);
          expect(readFileSync(archivePath).equals(oldLockBytes)).toBe(true);

          const newLockBytes = f2.readLockBytes();
          expect(newLockBytes.equals(oldLockBytes)).toBe(false);
          expect(JSON.parse(newLockBytes.toString("utf8"))).toEqual(f2.context.owner);

          const eventsAfterRecovery = f2.readEvents();
          expect(eventsAfterRecovery).toHaveLength(postFaultEvents.length + 1);
          expect(eventsAfterRecovery.slice(0, postFaultEvents.length)).toEqual(postFaultEvents);
          const recoveryEvent = eventsAfterRecovery[eventsAfterRecovery.length - 1];
          if (recoveryEvent === undefined) throw new Error("missing lock_recovery event");
          expect(recoveryEvent).toEqual({
            type: "lock_recovery",
            staleOwner: oldOwner,
            recoveringOwner: f2.context.owner,
            at: expect.any(String),
          });
          const ledgerAfterRecoveryBytes = readFileSync(resolve(canonical, "ledger.json"));
          expect(ledgerAfterRecoveryBytes.equals(Buffer.from(JSON.stringify(eventsAfterRecovery)))).toBe(true);

          expect(readFileSync(resolve(canonical, "journal.json")).equals(before.journalBytes)).toBe(true);
          expect(f2.readJournals()).toEqual(before.journals);
          for (const [path, bytes] of before.reportBytes) {
            expect(readFileSync(path).equals(bytes)).toBe(true);
          }
          expect(readdirSync(canonical).sort()).toEqual([...inventoryBefore, archiveName].sort());

          await assertRecoveredBenchmarkBindings(f2, template.profile, originalBindings);
          expect(f2.readLockBytes().equals(newLockBytes)).toBe(true);

          const expectedCompletedStages = side === "before"
            ? ["preflight", "development", "validation"]
            : ["preflight", "development", "validation", "benchmark"];
          expect(f2.ledger.getCompletedStages()).toEqual(expectedCompletedStages);

          const firstResult = f2.ledger.completeStage("benchmark", {
            stage: "benchmark",
            passed: true,
            completedStages: ["preflight", "development", "validation"],
          });
          expect(firstResult).toBeUndefined();

          const eventsAfterFirstComplete = f2.readEvents();
          if (side === "before") {
            expect(eventsAfterFirstComplete).toHaveLength(eventsAfterRecovery.length + 1);
            expect(eventsAfterFirstComplete.slice(0, eventsAfterRecovery.length)).toEqual(eventsAfterRecovery);
            const newCompletion = eventsAfterFirstComplete[eventsAfterFirstComplete.length - 1];
            if (newCompletion === undefined) throw new Error("missing stage_completed benchmark event");
            expect(newCompletion).toEqual({
              type: "stage_completed", stage: "benchmark", passed: true, at: expect.any(String),
            });
            expect(freshWitness.trace).toEqual(fullOperationTrace());
          } else {
            expect(eventsAfterFirstComplete).toEqual(eventsAfterRecovery);
            expect(freshWitness.trace).toEqual([]);
          }
          const benchmarkCompletions = eventsAfterFirstComplete.filter(
            (event) => event["type"] === "stage_completed" && event["stage"] === "benchmark",
          );
          expect(benchmarkCompletions).toHaveLength(1);
          expect(f2.ledger.getCompletedStages()).toEqual(["preflight", "development", "validation", "benchmark"]);
          expect(freshWitness.hitCount).toBe(0);
          const ledgerAfterFirstComplete = readFileSync(resolve(canonical, "ledger.json"));
          expect(ledgerAfterFirstComplete.equals(Buffer.from(JSON.stringify(eventsAfterFirstComplete)))).toBe(true);
          expect(f2.readLockBytes().equals(newLockBytes)).toBe(true);

          const secondResult = f2.ledger.completeStage("benchmark", {
            stage: "benchmark",
            passed: true,
            completedStages: ["preflight", "development", "validation"],
          });
          expect(secondResult).toBeUndefined();
          expect(f2.readEvents()).toEqual(eventsAfterFirstComplete);
          expect(readFileSync(resolve(canonical, "ledger.json")).equals(ledgerAfterFirstComplete)).toBe(true);
          expect(freshWitness.trace).toEqual(side === "before" ? fullOperationTrace() : []);
          expect(freshWitness.hitCount).toBe(0);
          expect(f2.readLockBytes().equals(newLockBytes)).toBe(true);

          expect(readFileSync(resolve(canonical, "journal.json")).equals(before.journalBytes)).toBe(true);
          expect(f2.readJournals()).toEqual(before.journals);
          for (const [path, bytes] of before.reportBytes) {
            expect(readFileSync(path).equals(bytes)).toBe(true);
          }
          expect(readdirSync(canonical).sort()).toEqual([...inventoryBefore, archiveName].sort());

          expect(readFileSync(archivePath).equals(oldLockBytes)).toBe(true);
          f2.ledger.releaseLock({ ...f2.context.owner });
          expect(existsSync(resolve(canonical, "lock.json"))).toBe(false);
          expect(readFileSync(archivePath).equals(oldLockBytes)).toBe(true);

          assertFoundationTemplateUnchanged(template);
        } finally {
          oldWitness.disarm();
          freshWitness.disarm();
        }
      }, 600000);
    }
  }

  for (const refusal of [
    { name: "live", mode: "live" as const },
    { name: "unknown-eacces", mode: "eacces" as const },
    { name: "malformed-proc-stat", mode: "malformed" as const },
  ]) {
    it(`task3 native recovery refusal ${refusal.name} rename after`, async () => {
      const old = await setupRenameCutOldState(roots, "after");
      const {
        template, canonical, baseDir, f, oldWitness, oldOwner, before,
        inventoryBefore, postFaultEvents, postFaultLedgerBytes,
      } = old;
      const oldLockBytes = f.readLockBytes();
      const seenPids: number[] = [];
      const procStatReader = (pid: number): string => {
        seenPids.push(pid);
        if (refusal.mode === "eacces") {
          throw Object.assign(new Error("EACCES"), { code: "EACCES" });
        }
        if (refusal.mode === "malformed") {
          return "no-paren-at-all";
        }
        return procStatLine(pid, oldOwner.startTicks);
      };
      const freshWitness = makeBenchmarkCompletionWitness(canonical);
      try {
        const rejected = await captureRejected(() =>
          openBenchmarkBase(baseDir, { ...freshWitness.overrides, procStatReader }),
        );
        assertOwnedRuntimeOperationFailed(rejected);
        expect(seenPids).toEqual([oldOwner.pid]);

        expect(f.readEvents()).toEqual(postFaultEvents);
        expect(readFileSync(resolve(canonical, "ledger.json")).equals(postFaultLedgerBytes)).toBe(true);
        expect(readFileSync(resolve(canonical, "journal.json")).equals(before.journalBytes)).toBe(true);
        expect(f.readJournals()).toEqual(before.journals);
        for (const [path, bytes] of before.reportBytes) {
          expect(readFileSync(path).equals(bytes)).toBe(true);
        }
        expect(f.readLockBytes().equals(oldLockBytes)).toBe(true);
        expect(readdirSync(canonical).sort()).toEqual(inventoryBefore);
        const archivePath = resolve(canonical, `lock.archive.${oldOwner.pid}.${oldOwner.startTicks}.json`);
        expect(existsSync(archivePath)).toBe(false);
        expect(freshWitness.trace).toEqual([]);
        expect(freshWitness.hitCount).toBe(0);

        assertFoundationTemplateUnchanged(template);
      } finally {
        oldWitness.disarm();
        freshWitness.disarm();
      }
    }, 600000);
  }

  it("task3 native recovery tampered artifact rejection rename after", async () => {
    const old = await setupRenameCutOldState(roots, "after");
    const {
      template, canonical, baseDir, f, oldWitness, oldOwner, before,
      inventoryBefore, postFaultEvents, postFaultLedgerBytes,
    } = old;
    const oldLockBytes = f.readLockBytes();
    const artifactPath = resolve(canonical, "reports", "benchmark-medium.json");
    const originalArtifactBytes = readFileSync(artifactPath);
    const seenPids: number[] = [];
    let tamperCount = 0;
    const procStatReader = (pid: number): string => {
      seenPids.push(pid);
      if (tamperCount === 0) {
        writeFileSync(artifactPath, `${readFileSync(artifactPath, "utf8")} `);
        tamperCount += 1;
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    };
    const freshWitness = makeBenchmarkCompletionWitness(canonical);
    try {
      const rejected = await captureRejected(() =>
        openBenchmarkBase(baseDir, { ...freshWitness.overrides, procStatReader }),
      );
      assertOwnedRuntimeOperationFailed(rejected);
      expect(seenPids).toEqual([oldOwner.pid]);
      expect(tamperCount).toBe(1);

      const archivePath = resolve(canonical, `lock.archive.${oldOwner.pid}.${oldOwner.startTicks}.json`);
      expect(readFileSync(archivePath).equals(oldLockBytes)).toBe(true);

      const newLockBytes = f.readLockBytes();
      expect(newLockBytes.equals(oldLockBytes)).toBe(false);
      const newOwnerShape = readOwnedLockJson(newLockBytes);
      expect(newOwnerShape.hostname).toBe(oldOwner.hostname);
      expect(newOwnerShape.bootId).toBe(oldOwner.bootId);
      expect(newOwnerShape.pid).toBe(oldOwner.pid);
      expect(newOwnerShape.startTicks).toBe(oldOwner.startTicks);
      expect(typeof newOwnerShape.acquiredAt).toBe("string");
      expect(newOwnerShape.acquiredAt).not.toBe(oldOwner.acquiredAt);

      expect(f.readEvents()).toEqual(postFaultEvents);
      expect(readFileSync(resolve(canonical, "ledger.json")).equals(postFaultLedgerBytes)).toBe(true);
      expect(readFileSync(resolve(canonical, "journal.json")).equals(before.journalBytes)).toBe(true);
      expect(f.readJournals()).toEqual(before.journals);
      for (const [path, bytes] of before.reportBytes) {
        if (path === artifactPath) continue;
        expect(readFileSync(path).equals(bytes)).toBe(true);
      }
      const tamperedBytes = readFileSync(artifactPath);
      expect(tamperedBytes.equals(originalArtifactBytes)).toBe(false);
      expect(tamperedBytes.equals(Buffer.from(`${originalArtifactBytes.toString("utf8")} `))).toBe(true);

      expect(freshWitness.trace).toEqual([]);
      expect(freshWitness.hitCount).toBe(0);
      const archiveName = `lock.archive.${oldOwner.pid}.${oldOwner.startTicks}.json`;
      expect(readdirSync(canonical).sort()).toEqual([...inventoryBefore, archiveName].sort());

      assertFoundationTemplateUnchanged(template);
    } finally {
      oldWitness.disarm();
      freshWitness.disarm();
    }
  }, 600000);
});
