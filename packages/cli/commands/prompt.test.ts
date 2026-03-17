// svp prompt CLI 命令的集成测试
// 创建临时 .svp/ 目录，写入测试数据，验证 prompt 输出

import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeHash } from "../../core/hash.js";
import { writeL3, writeL4, writeL5, writeL2 } from "../../core/store.js";
import { registerPrompt } from "./prompt.js";
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

function makeL4(blockIds: string[], overrides: Partial<L4Flow> = {}): L4Flow {
  const steps = blockIds.map((blockId, index) => ({
    id: `s${String(index)}`,
    action: "process" as const,
    blockRef: blockId,
    next: index < blockIds.length - 1 ? `s${String(index + 1)}` : null,
  }));

  const base: Omit<L4Flow, "contentHash" | "revision"> = {
    id: "order-flow",
    name: "Order Flow",
    steps,
    dataFlows: [],
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, contentHash };
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

/** 捕获 console.log 输出并运行 prompt 子命令 */
async function runPrompt(
  testRoot: string,
  args: string[],
): Promise<{ stdout: string; exitCode: number }> {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const errors: string[] = [];

  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => errors.push(a.map(String).join(" "));

  // Reset process.exitCode
  process.exitCode = undefined;

  const program = new Command();
  program.exitOverride(); // prevent process.exit
  registerPrompt(program);

  try {
    await program.parseAsync(["prompt", ...args], { from: "user" });
  } catch {
    // commander may throw on exitOverride
  }

  console.log = originalLog;
  console.error = originalError;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- process.exitCode is runtime-mutable
  const exitCode = process.exitCode ?? 0;
  process.exitCode = undefined;

  return {
    stdout: logs.length > 0 ? logs.join("\n") : errors.join("\n"),
    exitCode,
  };
}

// ── Tests ──

describe("svp prompt", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = path.join(
      tmpdir(),
      `svp-prompt-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    );
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  describe("compile", () => {
    it("generates a compile prompt with role, L3 contract, and output spec", async () => {
      const l5 = makeL5();
      const l3 = makeL3();
      const l4 = makeL4(["validate-order"]);

      await writeL5(testRoot, l5);
      await writeL3(testRoot, l3);
      await writeL4(testRoot, l4);

      const { stdout, exitCode } = await runPrompt(testRoot, [
        "compile",
        "validate-order",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("SVP compiler subagent");
      expect(stdout).toContain("validate-order");
      expect(stdout).toContain("L3 Contract");
      expect(stdout).toContain("Output Spec");
      expect(stdout).toContain("svp link");
    });

    it("includes L4 flow context when block is referenced", async () => {
      const l3 = makeL3();
      const l4 = makeL4(["validate-order"]);

      await writeL3(testRoot, l3);
      await writeL4(testRoot, l4);

      const { stdout, exitCode } = await runPrompt(testRoot, [
        "compile",
        "validate-order",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("order-flow");
    });
  });

  describe("recompile", () => {
    it("generates a recompile prompt with L3 + L2 + L1 context", async () => {
      const l3 = makeL3();
      const l2 = makeL2(l3);
      const l4 = makeL4(["validate-order"]);

      await writeL3(testRoot, l3);
      await writeL2(testRoot, l2);
      await writeL4(testRoot, l4);

      const { stdout, exitCode } = await runPrompt(testRoot, [
        "recompile",
        "validate-order",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("SVP recompiler subagent");
      expect(stdout).toContain("L3 Contract");
      expect(stdout).toContain("L2 Mapping");
    });
  });

  describe("review", () => {
    it("generates a review prompt", async () => {
      const l3 = makeL3();
      const l2 = makeL2(l3);

      await writeL3(testRoot, l3);
      await writeL2(testRoot, l2);

      const { stdout, exitCode } = await runPrompt(testRoot, [
        "review",
        "validate-order",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("SVP review subagent");
      expect(stdout).toContain("L3 Contract");
    });
  });

  describe("update-ref", () => {
    it("generates an update-ref prompt for an L4 flow", async () => {
      const l5 = makeL5();
      const l4 = makeL4(["validate-order"]);

      await writeL5(testRoot, l5);
      await writeL4(testRoot, l4);

      const { stdout, exitCode } = await runPrompt(testRoot, [
        "update-ref",
        "order-flow",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("SVP reference repair subagent");
      expect(stdout).toContain("L4 Flow");
    });
  });

  describe("design-l5", () => {
    it("generates an L5 design prompt with user intent", async () => {
      const { stdout, exitCode } = await runPrompt(testRoot, [
        "design-l5",
        "--intent",
        "Build an order management system",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("L5 Blueprint");
      expect(stdout).toContain("Build an order management system");
      expect(stdout).toContain("intent");
    });

    it("includes current L5 when one exists", async () => {
      const l5 = makeL5();
      await writeL5(testRoot, l5);

      const { stdout, exitCode } = await runPrompt(testRoot, [
        "design-l5",
        "--intent",
        "Update the system",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Update L5 Blueprint");
      expect(stdout).toContain("Current L5 Blueprint");
    });
  });

  describe("design-l4", () => {
    it("generates an L4 design prompt", async () => {
      const l5 = makeL5();
      await writeL5(testRoot, l5);

      const { stdout, exitCode } = await runPrompt(testRoot, [
        "design-l4",
        "--intent",
        "Create order processing flow",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("L4 Flow");
      expect(stdout).toContain("Create order processing flow");
      expect(stdout).toContain("My Project");
    });

    it("generates an EventGraph design prompt with --kind event-graph", async () => {
      const l5 = makeL5();
      await writeL5(testRoot, l5);

      const { stdout, exitCode } = await runPrompt(testRoot, [
        "design-l4",
        "--intent",
        "Real-time document collaboration",
        "--kind",
        "event-graph",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("EventGraph");
      expect(stdout).toContain("Real-time document collaboration");
      expect(stdout).toContain("event-graph");
      expect(stdout).toContain("My Project");
    });

    it("generates a StateMachine design prompt with --kind state-machine", async () => {
      const l5 = makeL5();
      await writeL5(testRoot, l5);

      const { stdout, exitCode } = await runPrompt(testRoot, [
        "design-l4",
        "--intent",
        "Purchase order approval workflow",
        "--kind",
        "state-machine",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("StateMachine");
      expect(stdout).toContain("Purchase order approval workflow");
      expect(stdout).toContain("state-machine");
      expect(stdout).toContain("My Project");
    });

    it("rejects invalid --kind value", async () => {
      const l5 = makeL5();
      await writeL5(testRoot, l5);

      const { exitCode, stdout } = await runPrompt(testRoot, [
        "design-l4",
        "--intent",
        "test",
        "--kind",
        "invalid",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain("invalid --kind");
    });

    it("errors when L5 is missing", async () => {
      const { exitCode, stdout } = await runPrompt(testRoot, [
        "design-l4",
        "--intent",
        "test",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain("L5 blueprint not found");
    });
  });

  describe("design-l3", () => {
    it("generates an L3 design prompt with L4 context", async () => {
      const l4 = makeL4(["validate-order", "process-order"]);
      await writeL4(testRoot, l4);

      const { stdout, exitCode } = await runPrompt(testRoot, [
        "design-l3",
        "validate-order",
        "--flow",
        "order-flow",
        "--step",
        "0",
        "--intent",
        "Validate incoming order requests",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("L3 Contract");
      expect(stdout).toContain("Validate incoming order requests");
      expect(stdout).toContain("order-flow");
    });

    it("errors when L4 flow not found", async () => {
      const { exitCode, stdout } = await runPrompt(testRoot, [
        "design-l3",
        "validate-order",
        "--flow",
        "nonexistent",
        "--step",
        "0",
        "--intent",
        "test",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('L4 artifact "nonexistent" not found');
    });

    it("errors when step index out of range", async () => {
      const l4 = makeL4(["validate-order"]);
      await writeL4(testRoot, l4);

      const { exitCode, stdout } = await runPrompt(testRoot, [
        "design-l3",
        "validate-order",
        "--flow",
        "order-flow",
        "--step",
        "99",
        "--intent",
        "test",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain("out of range");
    });
  });

  describe("error handling", () => {
    it("errors when L3 block not found for compile", async () => {
      const l5 = makeL5();
      await writeL5(testRoot, l5);

      const { exitCode, stdout } = await runPrompt(testRoot, [
        "compile",
        "nonexistent-id",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('L3 block "nonexistent-id" not found');
    });

    it("errors when L4 flow not found for update-ref", async () => {
      const l5 = makeL5();
      await writeL5(testRoot, l5);

      const { exitCode, stdout } = await runPrompt(testRoot, [
        "update-ref",
        "nonexistent-flow",
        "-r",
        testRoot,
      ]);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('L4 flow "nonexistent-flow" not found');
    });
  });
});
