// forge link CLI 命令的集成测试

import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeHash } from "../../core/hash.js";
import { readL2, writeL2, writeL3 } from "../../core/store.js";
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

  it("--json flag: outputs valid JSON of the L2 object", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    const { stdout, exitCode } = await runLink(testRoot, [
      "validate-order",
      "--files",
      "src/validate-order.ts",
      "--json",
    ]);

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty("id", "validate-order");
    expect(parsed).toHaveProperty("blockRef", "validate-order");
    expect(parsed).toHaveProperty("language", "typescript");
    expect(parsed).toHaveProperty("files");
    expect(parsed).toHaveProperty("sourceHash");
    expect(parsed).toHaveProperty("contentHash");
    expect(parsed).toHaveProperty("revision");
  });
});
