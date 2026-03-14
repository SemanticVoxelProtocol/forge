// svp rehash CLI 命令的集成测试

import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeHash } from "../../core/hash.js";
import {
  readL2,
  readL3,
  readL4,
  readL5,
  writeL2,
  writeL3,
  writeL4,
  writeL5,
} from "../../core/store.js";
import { registerRehash } from "./rehash.js";
import type { L2CodeBlock } from "../../core/l2.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Flow } from "../../core/l4.js";
import type { L5Blueprint } from "../../core/l5.js";
import type { ArtifactVersion } from "../../core/version.js";

// ── Fixture 工厂 ──

const REV1: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00Z",
};

const WRONG_HASH = "0000000000000000";

function makeL3(overrides: Partial<L3Block> = {}): L3Block {
  const base: Omit<L3Block, "contentHash" | "revision"> = {
    id: "validate-order",
    name: "Validate Order",
    input: [{ name: "request", type: "OrderRequest" }],
    output: [{ name: "result", type: "ValidationResult" }],
    validate: { request: "required" },
    constraints: ["output.result.valid iff output.result.errors is empty"],
    description: "Validate the order request",
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, contentHash };
}

function makeL3WithWrongHash(overrides: Partial<L3Block> = {}): L3Block {
  const correct = makeL3(overrides);
  return { ...correct, contentHash: WRONG_HASH };
}

function makeL4(blockIds: string[], overrides: Partial<L4Flow> = {}): L4Flow {
  const steps = blockIds.map((blockId, index) => ({
    id: `s${String(index)}`,
    action: "process" as const,
    blockRef: blockId,
    next: index < blockIds.length - 1 ? `s${String(index + 1)}` : null,
  }));

  const base: Omit<L4Flow, "contentHash" | "revision"> = {
    id: "create-order",
    name: "Create Order",
    steps,
    dataFlows: [],
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, contentHash };
}

function makeL4WithWrongHash(blockIds: string[], overrides: Partial<L4Flow> = {}): L4Flow {
  const correct = makeL4(blockIds, overrides);
  return { ...correct, contentHash: WRONG_HASH };
}

function makeL5(overrides: Partial<L5Blueprint> = {}): L5Blueprint {
  const base: Omit<L5Blueprint, "contentHash" | "revision"> = {
    id: "my-project",
    name: "My Project",
    version: "0.1.0",
    intent: "An order management system",
    constraints: ["Must handle 1000 orders/sec"],
    domains: [{ name: "order", description: "订单域", dependencies: [] }],
    integrations: [{ name: "stripe", type: "api", description: "Payment gateway" }],
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, contentHash };
}

function makeL5WithWrongHash(overrides: Partial<L5Blueprint> = {}): L5Blueprint {
  const correct = makeL5(overrides);
  return { ...correct, contentHash: WRONG_HASH };
}

function makeL2(l3: L3Block, overrides: Partial<L2CodeBlock> = {}): L2CodeBlock {
  const base: Omit<L2CodeBlock, "contentHash" | "sourceHash" | "revision"> = {
    id: l3.id,
    blockRef: l3.id,
    language: "typescript",
    files: [`src/${l3.id}.ts`],
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, sourceHash: l3.contentHash, contentHash };
}

function makeL2WithWrongHash(l3: L3Block, overrides: Partial<L2CodeBlock> = {}): L2CodeBlock {
  const correct = makeL2(l3, overrides);
  return { ...correct, contentHash: WRONG_HASH };
}

/** 捕获 console.log/error 并运行 rehash 子命令 */
async function runRehash(
  testRoot: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => errors.push(a.map(String).join(" "));

  process.exitCode = undefined;

  const program = new Command();
  program.exitOverride();
  registerRehash(program);

  try {
    await program.parseAsync(["rehash", ...args, "-r", testRoot], { from: "user" });
  } catch {
    // commander may throw on exitOverride
  }

  console.log = originalLog;
  console.error = originalError;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const exitCode = process.exitCode ?? 0;
  process.exitCode = undefined;

  return {
    stdout: logs.join("\n"),
    stderr: errors.join("\n"),
    exitCode,
  };
}

// ── Tests ──

describe("svp rehash", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = path.join(
      tmpdir(),
      `svp-rehash-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    );
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("rehash all layers: corrects wrong hashes on L5+L4+L3+L2", async () => {
    const l3 = makeL3();
    const l5Wrong = makeL5WithWrongHash();
    const l4Wrong = makeL4WithWrongHash(["validate-order"]);
    const l3Wrong = makeL3WithWrongHash();
    const l2Wrong = makeL2WithWrongHash(l3);

    await writeL5(testRoot, l5Wrong);
    await writeL4(testRoot, l4Wrong);
    await writeL3(testRoot, l3Wrong);
    await writeL2(testRoot, l2Wrong);

    const { exitCode } = await runRehash(testRoot, []);
    expect(exitCode).toBe(0);

    const l5After = await readL5(testRoot);
    const l4After = await readL4(testRoot, "create-order");
    const l3After = await readL3(testRoot, "validate-order");
    const l2After = await readL2(testRoot, "validate-order");

    expect(l5After?.contentHash).not.toBe(WRONG_HASH);
    expect(l4After?.contentHash).not.toBe(WRONG_HASH);
    expect(l3After?.contentHash).not.toBe(WRONG_HASH);
    expect(l2After?.contentHash).not.toBe(WRONG_HASH);
  });

  it("rehash specific layer (l5): only L5 hash corrected", async () => {
    const l3 = makeL3();
    const l5Wrong = makeL5WithWrongHash();
    const l3Wrong = makeL3WithWrongHash();
    const l2Wrong = makeL2WithWrongHash(l3);

    await writeL5(testRoot, l5Wrong);
    await writeL3(testRoot, l3Wrong);
    await writeL2(testRoot, l2Wrong);

    const { exitCode } = await runRehash(testRoot, ["l5"]);
    expect(exitCode).toBe(0);

    const l5After = await readL5(testRoot);
    const l3After = await readL3(testRoot, "validate-order");
    const l2After = await readL2(testRoot, "validate-order");

    expect(l5After?.contentHash).not.toBe(WRONG_HASH);
    // L3 and L2 not touched
    expect(l3After?.contentHash).toBe(WRONG_HASH);
    expect(l2After?.contentHash).toBe(WRONG_HASH);
  });

  it("rehash specific layer (l4): only L4 hash corrected", async () => {
    const l4Wrong = makeL4WithWrongHash(["validate-order"]);
    const l3Wrong = makeL3WithWrongHash();

    await writeL4(testRoot, l4Wrong);
    await writeL3(testRoot, l3Wrong);

    const { exitCode } = await runRehash(testRoot, ["l4"]);
    expect(exitCode).toBe(0);

    const l4After = await readL4(testRoot, "create-order");
    const l3After = await readL3(testRoot, "validate-order");

    expect(l4After?.contentHash).not.toBe(WRONG_HASH);
    // L3 not touched
    expect(l3After?.contentHash).toBe(WRONG_HASH);
  });

  it("rehash specific layer (l3): only L3 hash corrected", async () => {
    const l3 = makeL3();
    const l3Wrong = makeL3WithWrongHash();
    const l2Wrong = makeL2WithWrongHash(l3);

    await writeL3(testRoot, l3Wrong);
    await writeL2(testRoot, l2Wrong);

    const { exitCode } = await runRehash(testRoot, ["l3"]);
    expect(exitCode).toBe(0);

    const l3After = await readL3(testRoot, "validate-order");
    const l2After = await readL2(testRoot, "validate-order");

    expect(l3After?.contentHash).not.toBe(WRONG_HASH);
    // L2 not touched
    expect(l2After?.contentHash).toBe(WRONG_HASH);
  });

  it("rehash specific layer (l2): only L2 hash corrected", async () => {
    const l3 = makeL3();
    const l3Wrong = makeL3WithWrongHash();
    const l2Wrong = makeL2WithWrongHash(l3);

    await writeL3(testRoot, l3Wrong);
    await writeL2(testRoot, l2Wrong);

    const { exitCode } = await runRehash(testRoot, ["l2"]);
    expect(exitCode).toBe(0);

    const l3After = await readL3(testRoot, "validate-order");
    const l2After = await readL2(testRoot, "validate-order");

    // L3 not touched
    expect(l3After?.contentHash).toBe(WRONG_HASH);
    expect(l2After?.contentHash).not.toBe(WRONG_HASH);
  });

  it("rehash l3/<id>: specific L3 block rehashed", async () => {
    const l3aWrong = makeL3WithWrongHash({ id: "validate-order", name: "Validate Order" });
    const l3bWrong = makeL3WithWrongHash({ id: "process-order", name: "Process Order" });

    await writeL3(testRoot, l3aWrong);
    await writeL3(testRoot, l3bWrong);

    const { exitCode } = await runRehash(testRoot, ["l3/validate-order"]);
    expect(exitCode).toBe(0);

    const l3aAfter = await readL3(testRoot, "validate-order");
    const l3bAfter = await readL3(testRoot, "process-order");

    expect(l3aAfter?.contentHash).not.toBe(WRONG_HASH);
    // The other block untouched
    expect(l3bAfter?.contentHash).toBe(WRONG_HASH);
  });

  it("rehash l4/<id>: specific L4 flow rehashed", async () => {
    const l4aWrong = makeL4WithWrongHash(["validate-order"], {
      id: "create-order",
      name: "Create Order",
    });
    const l4bWrong = makeL4WithWrongHash(["validate-order"], {
      id: "delete-order",
      name: "Delete Order",
    });

    await writeL4(testRoot, l4aWrong);
    await writeL4(testRoot, l4bWrong);

    const { exitCode } = await runRehash(testRoot, ["l4/create-order"]);
    expect(exitCode).toBe(0);

    const l4aAfter = await readL4(testRoot, "create-order");
    const l4bAfter = await readL4(testRoot, "delete-order");

    expect(l4aAfter?.contentHash).not.toBe(WRONG_HASH);
    // The other flow untouched
    expect(l4bAfter?.contentHash).toBe(WRONG_HASH);
  });

  it("rehash l2/<id>: specific L2 block rehashed", async () => {
    const l3a = makeL3({ id: "validate-order", name: "Validate Order" });
    const l3b = makeL3({ id: "process-order", name: "Process Order" });
    const l2aWrong = makeL2WithWrongHash(l3a, { id: "validate-order", blockRef: "validate-order" });
    const l2bWrong = makeL2WithWrongHash(l3b, { id: "process-order", blockRef: "process-order" });

    await writeL2(testRoot, l2aWrong);
    await writeL2(testRoot, l2bWrong);

    const { exitCode } = await runRehash(testRoot, ["l2/validate-order"]);
    expect(exitCode).toBe(0);

    const l2aAfter = await readL2(testRoot, "validate-order");
    const l2bAfter = await readL2(testRoot, "process-order");

    expect(l2aAfter?.contentHash).not.toBe(WRONG_HASH);
    // The other block untouched
    expect(l2bAfter?.contentHash).toBe(WRONG_HASH);
  });

  it("idempotency: second rehash reports no changes", async () => {
    const l3Wrong = makeL3WithWrongHash();
    await writeL3(testRoot, l3Wrong);

    // First run — changes hash
    await runRehash(testRoot, ["l3"]);

    // Second run — nothing to change
    const { stdout, exitCode } = await runRehash(testRoot, ["l3"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("SKIP");
    expect(stdout).not.toContain("-> ");
  });

  it("invalid target: reports error and sets exit code 1", async () => {
    const { exitCode, stderr } = await runRehash(testRoot, ["invalid-target"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid target");
  });

  it("empty .svp/: no crash on empty project", async () => {
    const { stdout, exitCode } = await runRehash(testRoot, []);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No artifacts found");
  });

  it("revision bump on change: rev increments after rehash with wrong hash", async () => {
    const l3Wrong = makeL3WithWrongHash();
    expect(l3Wrong.revision.rev).toBe(1);

    await writeL3(testRoot, l3Wrong);

    await runRehash(testRoot, ["l3"]);

    const l3After = await readL3(testRoot, "validate-order");
    expect(l3After?.revision.rev).toBe(2);
    expect(l3After?.revision.parentRev).toBe(1);
  });

  it("--json flag: outputs valid JSON array with result objects", async () => {
    const l3Wrong = makeL3WithWrongHash();
    await writeL3(testRoot, l3Wrong);

    const { stdout, exitCode } = await runRehash(testRoot, ["l3", "--json"]);
    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);

    const result = parsed[0] as Record<string, unknown>;
    expect(result).toHaveProperty("id", "validate-order");
    expect(result).toHaveProperty("layer", "l3");
    expect(result).toHaveProperty("oldHash");
    expect(result).toHaveProperty("newHash");
    expect(result).toHaveProperty("changed", true);
  });
});
