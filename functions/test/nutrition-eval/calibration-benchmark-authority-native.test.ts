/**
 * Synthetic PREFIX_ROWS, raw-hook, and file-port controls qualify only the
 * benchmark completion witness syscall plumbing. They are not actual runtime
 * history, native ledger admission, SDK behavior, physical power-loss proof,
 * or whole Task 3 completion. No full158-history setup lives in this slice.
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
import type { CalibrationOwner } from "../../src/nutrition-eval/calibration";
import { createBenchmarkAuthorityFileCalibrationLedgerDeps } from "../../src/nutrition-eval/calibration-file-store";
import { makeBenchmarkCompletionWitness } from "./calibration-benchmark-authority-fixtures";
import type {
  BenchmarkCompletionWitness,
  BenchmarkCutOperation,
} from "./calibration-benchmark-authority-fixtures";

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
