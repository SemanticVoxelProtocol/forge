import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeHash } from "../../core/hash.js";
import { writeFileManifest, writeL2, writeL3 } from "../../core/store.js";
import { governedFileManifestId } from "../../skills/link.js";
import { registerCompilePlan } from "./compile-plan.js";
import type { FileManifest } from "../../core/file.js";
import type { L2CodeBlock } from "../../core/l2.js";
import type { L3Block } from "../../core/l3.js";
import type { ArtifactVersion } from "../../core/version.js";

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
    constraints: [],
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
    files: ["src/validate-order.ts"],
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, sourceHash: l3.contentHash, contentHash };
}

function makeFileManifest(l2: L2CodeBlock, overrides: Partial<FileManifest> = {}): FileManifest {
  const base: Omit<FileManifest, "contentHash" | "revision"> = {
    id: governedFileManifestId(l2.files[0]),
    path: l2.files[0],
    purpose: `Govern ${l2.files[0]} for L2 ${l2.id}`,
    l2BlockRef: l2.id,
    blockRefs: [l2.blockRef],
    exports: ["validateOrder"],
    ownership: ["packages/orders"],
    dependencyBoundary: ["packages/orders/*"],
    pluginGroups: ["governance"],
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, contentHash };
}

function readExitCode(): number {
  return Number(process.exitCode ?? 0);
}

async function runCompilePlan(
  testRoot: string,
  args: string[] = [],
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
  registerCompilePlan(program);

  try {
    await program.parseAsync(["compile-plan", ...args, "-r", testRoot], { from: "user" });
  } catch {
    // commander may throw on exitOverride
  }

  console.log = originalLog;
  console.error = originalError;

  const exitCode = readExitCode();
  process.exitCode = undefined;

  return {
    stdout: logs.join("\n"),
    stderr: errors.join("\n"),
    exitCode,
  };
}

describe("forge compile-plan", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = path.join(
      tmpdir(),
      `svp-compile-plan-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    );
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("shows governed file counts and fn review tasks in human-readable output", async () => {
    const l3 = makeL3();
    const l2 = makeL2(l3);
    const file = makeFileManifest(l2);

    await writeL3(testRoot, l3);
    await writeL2(testRoot, l2);
    await writeFileManifest(testRoot, file);

    const { stdout, exitCode } = await runCompilePlan(testRoot);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("forge compile-plan — scanned 3 entities: L3(1) L2(1) FILE(1)");
    expect(stdout).toContain("REVIEW fn/file-src-validate-order-ts.validate-order");
    expect(stdout).toContain("Summary: 1 review");
  });
});
