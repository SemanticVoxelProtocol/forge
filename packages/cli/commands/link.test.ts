// forge link CLI 命令的集成测试

import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeHash } from "../../core/hash.js";
import {
  readFileManifest,
  readFunctionManifest,
  readL2,
  writeFunctionManifest,
  writeL2,
  writeL3,
} from "../../core/store.js";
import { registerLink } from "./link.js";
import type { L2CodeBlock } from "../../core/l2.js";
import type { L3Block } from "../../core/l3.js";
import type { ArtifactVersion } from "../../core/version.js";

// ── Fixture 工厂 ──

const REV1: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00Z",
};

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

/** 捕获 console.log/error 并运行 link 子命令 */
async function runLink(
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
  registerLink(program);

  try {
    await program.parseAsync(["link", ...args, "-r", testRoot], { from: "user" });
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

describe("forge link", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = path.join(
      tmpdir(),
      `svp-link-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    );
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("creates new L2 link when L3 exists and no L2 exists", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    const { stdout, exitCode } = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Linked");
    expect(stdout).toContain("validate-order");

    const l2 = await readL2(testRoot, "validate-order");
    expect(l2).not.toBeNull();
    expect(l2?.id).toBe("validate-order");
    expect(l2?.blockRef).toBe("validate-order");
    expect(l2?.revision.rev).toBe(1);
  });

  it("sourceHash is set to the L3 contentHash", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    await runLink(testRoot, ["validate-order", "--files", "src/validate-order.ts"]);

    const l2 = await readL2(testRoot, "validate-order");
    expect(l2?.sourceHash).toBe(l3.contentHash);
  });

  it("stores multiple files correctly", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "src/validate-order.test.ts",
      "src/types.ts",
    ]);

    const l2 = await readL2(testRoot, "validate-order");
    expect(l2?.files).toEqual([
      "src/validate-order.ts",
      "src/validate-order.test.ts",
      "src/types.ts",
    ]);
  });

  it("defaults language to typescript when --language not provided", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    await runLink(testRoot, ["validate-order", "--files", "src/validate-order.ts"]);

    const l2 = await readL2(testRoot, "validate-order");
    expect(l2?.language).toBe("typescript");
  });

  it("uses custom language when --language is provided", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate_order.py",
      "--language",
      "python",
    ]);

    const l2 = await readL2(testRoot, "validate-order");
    expect(l2?.language).toBe("python");
  });

  it("relinks existing L2: updates files, sourceHash, bumps revision", async () => {
    const l3 = makeL3();
    const existingL2 = makeL2(l3);
    await writeL3(testRoot, l3);
    await writeL2(testRoot, existingL2);

    expect(existingL2.revision.rev).toBe(1);
    expect(existingL2.files).toEqual(["src/validate-order.ts"]);

    const { stdout, exitCode } = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "src/validate-order.helper.ts",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Relinked");

    const l2After = await readL2(testRoot, "validate-order");
    expect(l2After?.revision.rev).toBe(2);
    expect(l2After?.revision.parentRev).toBe(1);
    expect(l2After?.files).toEqual(["src/validate-order.ts", "src/validate-order.helper.ts"]);
    expect(l2After?.sourceHash).toBe(l3.contentHash);
  });

  it("errors with exit code 1 when L3 not found", async () => {
    const { stderr, exitCode } = await runLink(testRoot, [
      "nonexistent-l3",
      "--files",
      "src/foo.ts",
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("nonexistent-l3");
    expect(stderr).toContain("not found");
  });

  it("--json flag: outputs the governed link result for agents", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    const { stdout, exitCode } = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "--json",
    ]);

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout) as {
      action: string;
      l2: Record<string, unknown>;
      fileManifests: unknown[];
      functionManifests: unknown[];
      deleted: { fileManifests: unknown[]; functionManifests: unknown[] };
    };
    expect(parsed).toHaveProperty("action", "linked");
    expect(parsed.l2).toHaveProperty("id", "validate-order");
    expect(parsed.l2).toHaveProperty("blockRef", "validate-order");
    expect(parsed.l2).toHaveProperty("language", "typescript");
    expect(parsed.l2).toHaveProperty("files");
    expect(parsed.l2).toHaveProperty("sourceHash");
    expect(parsed.l2).toHaveProperty("contentHash");
    expect(parsed.l2).toHaveProperty("revision");
    expect(parsed.fileManifests).toHaveLength(1);
    expect(parsed.functionManifests).toHaveLength(0);
    expect(parsed.deleted).toEqual({ fileManifests: [], functionManifests: [] });
  });

  it("writes governed file manifests alongside the L2 link", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    const { exitCode } = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "src/validate-order.types.ts",
    ]);

    expect(exitCode).toBe(0);

    const mainFile = await readFileManifest(testRoot, "file-src-validate-order-ts");
    const typesFile = await readFileManifest(testRoot, "file-src-validate-order-types-ts");

    expect(mainFile).toMatchObject({
      path: "src/validate-order.ts",
      l2BlockRef: "validate-order",
      blockRefs: ["validate-order"],
      exports: [],
      pluginGroups: ["governance"],
    });
    expect(typesFile).toMatchObject({
      path: "src/validate-order.types.ts",
      exports: [],
    });
  });

  it("writes function manifests when governed exports are provided", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    const { exitCode } = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "--exports",
      "src/validate-order.ts=validateOrder,normalizeOrder",
    ]);

    expect(exitCode).toBe(0);

    const fileManifest = await readFileManifest(testRoot, "file-src-validate-order-ts");
    const validateOrder = await readFunctionManifest(
      testRoot,
      "file-src-validate-order-ts.validate-order",
    );
    const normalizeOrder = await readFunctionManifest(
      testRoot,
      "file-src-validate-order-ts.normalize-order",
    );

    expect(fileManifest?.exports).toEqual(["validateOrder", "normalizeOrder"]);
    expect(validateOrder).toMatchObject({
      fileRef: "file-src-validate-order-ts",
      exportName: "validateOrder",
      pluginPolicy: ["governance"],
    });
    expect(normalizeOrder).toMatchObject({
      fileRef: "file-src-validate-order-ts",
      exportName: "normalizeOrder",
      pluginPolicy: ["governance"],
    });
  });

  it("preserves existing governed function manifests on relink when --exports is omitted", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    const initial = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "--exports",
      "src/validate-order.ts=validateOrder",
    ]);

    expect(initial.exitCode).toBe(0);

    const customizedBase = {
      id: "file-src-validate-order-ts.validate-order",
      fileRef: "file-src-validate-order-ts",
      exportName: "validateOrder",
      signature: "validateOrder(request: OrderRequest): ValidationResult",
      preconditions: ["request contains an order id"],
      postconditions: ["returns a validation result"],
      pluginPolicy: ["trace"],
    };
    const customizedManifest = {
      ...customizedBase,
      revision: {
        rev: 3,
        parentRev: 2,
        source: { type: "human" as const },
        timestamp: "2024-01-03T00:00:00.000Z",
      },
      contentHash: computeHash(customizedBase as Record<string, unknown>),
    };
    await writeFunctionManifest(testRoot, customizedManifest);

    const relink = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "src/validate-order.helper.ts",
    ]);

    expect(relink.exitCode).toBe(0);
    expect(relink.stdout).toContain("Relinked");

    const functionManifest = await readFunctionManifest(
      testRoot,
      "file-src-validate-order-ts.validate-order",
    );
    expect(functionManifest).toMatchObject({
      id: "file-src-validate-order-ts.validate-order",
      fileRef: "file-src-validate-order-ts",
      exportName: "validateOrder",
      signature: "validateOrder(request: OrderRequest): ValidationResult",
      preconditions: ["request contains an order id"],
      postconditions: ["returns a validation result"],
      pluginPolicy: ["trace"],
    });
    expect(functionManifest?.revision).toEqual(customizedManifest.revision);
  });

  it("removes stale governed file and function manifests when relink shrinks the file set", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    const initial = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "src/validate-order.helper.ts",
      "--exports",
      "src/validate-order.ts=validateOrder",
      "--exports",
      "src/validate-order.helper.ts=normalizeOrder",
    ]);

    expect(initial.exitCode).toBe(0);

    const relink = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "--exports",
      "src/validate-order.ts=validateOrder",
    ]);

    expect(relink.exitCode).toBe(0);
    expect(relink.stdout).toContain("Relinked");

    expect(await readFileManifest(testRoot, "file-src-validate-order-ts")).not.toBeNull();
    expect(
      await readFunctionManifest(testRoot, "file-src-validate-order-ts.validate-order"),
    ).not.toBeNull();
    expect(await readFileManifest(testRoot, "file-src-validate-order-helper-ts")).toBeNull();
    expect(
      await readFunctionManifest(testRoot, "file-src-validate-order-helper-ts.normalize-order"),
    ).toBeNull();
  });

  it("treats explicit relink exports for a kept file as authoritative", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    const initial = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "--exports",
      "src/validate-order.ts=runA,runB",
    ]);

    expect(initial.exitCode).toBe(0);

    const relink = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "--exports",
      "src/validate-order.ts=runA",
    ]);

    expect(relink.exitCode).toBe(0);
    expect(relink.stdout).toContain("Relinked");

    const fileManifest = await readFileManifest(testRoot, "file-src-validate-order-ts");
    expect(fileManifest?.exports).toEqual(["runA"]);

    expect(await readFunctionManifest(testRoot, "file-src-validate-order-ts.run-a")).not.toBeNull();
    expect(await readFunctionManifest(testRoot, "file-src-validate-order-ts.run-b")).toBeNull();
  });

  it("rejects governed exports for files outside the link set", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    const { stderr, exitCode } = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "--exports",
      "src/other.ts=validateOrder",
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("src/other.ts");
    expect(stderr).toContain("--files");
  });

  it("rejects malformed --exports entries", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    const { stderr, exitCode } = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "--exports",
      "src/validate-order.ts",
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("--exports");
    expect(stderr).toContain("file=export1,export2");
  });
});
