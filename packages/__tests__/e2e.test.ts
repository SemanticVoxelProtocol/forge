// E2E tests — exercise the full SVP pipeline across layers
// Uses real temp directories, no mocks.

import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCheckInput } from "../cli/load.js";
import { check } from "../core/check.js";
import { compilePlan } from "../core/compile-plan.js";
import { hashL2, hashL3, hashL4 } from "../core/hash.js";
import { init } from "../core/init.js";
import { writeL2, writeL3, writeL4, writeL5 } from "../core/store.js";
import { rehashL2, rehashL3, rehashL4, rehashL5 } from "../skills/rehash.js";
import type { L2CodeBlock } from "../core/l2.js";
import type { L3Block } from "../core/l3.js";
import type { L4Flow } from "../core/l4.js";
import type { L5Blueprint } from "../core/l5.js";
import type { ArtifactVersion } from "../core/version.js";

// ── Shared helpers ──

const TEST_ROOT = path.resolve(import.meta.dirname, "../../.test-e2e");

const REV1: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00Z",
};

let tmpDir: string;

function makeL3(overrides: Partial<L3Block> = {}): L3Block {
  const base = {
    id: "validate-order",
    name: "validate-order",
    input: [{ name: "request", type: "OrderRequest" }],
    output: [{ name: "result", type: "ValidationResult" }],
    validate: {},
    constraints: [],
    description: "Validates incoming order requests",
    ...overrides,
  };
  const { revision: _r, contentHash: _ch, ...hashInput } = base as L3Block;
  return {
    ...base,
    revision: overrides.revision ?? REV1,
    contentHash: overrides.contentHash ?? hashL3(hashInput),
  };
}

function makeL4(overrides: Partial<L4Flow> = {}): L4Flow {
  const base = {
    id: "order-flow",
    name: "order-flow",
    steps: [
      {
        id: "s1",
        action: "process" as const,
        blockRef: "validate-order",
        next: null,
      },
    ],
    dataFlows: [],
    ...overrides,
  };
  const { revision: _r, contentHash: _ch, ...hashInput } = base as L4Flow;
  return {
    ...base,
    revision: overrides.revision ?? REV1,
    contentHash: overrides.contentHash ?? hashL4(hashInput),
  };
}

function makeL2(overrides: Partial<L2CodeBlock> = {}): L2CodeBlock {
  const base = {
    id: "validate-order-ts",
    blockRef: "validate-order",
    language: "typescript",
    files: ["src/validate-order.ts"],
    ...overrides,
  };
  const { sourceHash: _s, revision: _r, contentHash: _ch, ...hashInput } = base as L2CodeBlock;
  return {
    ...base,
    revision: overrides.revision ?? REV1,
    sourceHash: overrides.sourceHash ?? "placeholder",
    contentHash: overrides.contentHash ?? hashL2(hashInput),
  };
}

// ── Test suites ──

describe("E2E: SVP Pipeline", () => {
  beforeEach(async () => {
    tmpDir = path.join(
      TEST_ROOT,
      `e2e-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── Scenario 1: Init → Check (empty project is healthy) ──

  describe("1. Init → Check (empty project is healthy)", () => {
    it("init produces a valid, consistent starting state", async () => {
      const result = await init(tmpDir, {
        name: "My E2E Project",
        intent: "test the pipeline",
      });

      expect(result.created).toBe(true);
      expect(result.l5).toBeDefined();
      expect(existsSync(path.join(tmpDir, ".svp", "l5.json"))).toBe(true);
      expect(existsSync(path.join(tmpDir, ".svp", "l2"))).toBe(true);
      expect(existsSync(path.join(tmpDir, ".svp", "l3"))).toBe(true);
      expect(existsSync(path.join(tmpDir, ".svp", "l4"))).toBe(true);

      const input = await loadCheckInput(tmpDir);
      expect(input.l5).toBeDefined();
      expect(input.l5!.name).toBe("My E2E Project");

      const report = check(input);
      expect(report.issues).toEqual([]);
      expect(report.summary.errors).toBe(0);
      expect(report.summary.warnings).toBe(0);
    });
  });

  // ── Scenario 2: Drift detection: modify L3 → check detects SOURCE_DRIFT ──

  describe("2. Drift detection: modify L3 → SOURCE_DRIFT", () => {
    it("hash-based change tracking works across layers", async () => {
      await init(tmpDir, { name: "drift-test" });

      // Create synced L3 + L2
      const l3 = makeL3({ id: "my-block", name: "my-block" });
      await writeL3(tmpDir, l3);

      const l2 = makeL2({
        id: "my-block-ts",
        blockRef: "my-block",
        sourceHash: l3.contentHash,
      });
      await writeL2(tmpDir, l2);

      // Verify initially no issues
      let input = await loadCheckInput(tmpDir);
      let report = check(input);
      expect(report.summary.errors).toBe(0);
      expect(report.summary.warnings).toBe(0);

      // Modify L3 content (add a constraint) and rehash
      const modifiedL3 = makeL3({
        id: "my-block",
        name: "my-block",
        constraints: ["must respond within 100ms"],
      });
      // Rehash to get correct new hash
      const { data: rehashedL3 } = rehashL3(modifiedL3);
      await writeL3(tmpDir, rehashedL3);

      // Now L2's sourceHash no longer matches L3's contentHash
      input = await loadCheckInput(tmpDir);
      report = check(input);

      const driftIssues = report.issues.filter((i) => i.code === "SOURCE_DRIFT");
      expect(driftIssues).toHaveLength(1);
      expect(driftIssues[0].severity).toBe("warning");
      expect(driftIssues[0].layer).toBe("l2");
      expect(driftIssues[0].entityId).toBe("my-block-ts");
    });
  });

  // ── Scenario 3: Referential integrity: L4 references missing L3 ──

  describe("3. Referential integrity: L4 references missing L3", () => {
    it("cross-layer reference validation catches dangling refs", async () => {
      await init(tmpDir, { name: "ref-test" });

      // Create L4 flow with reference to nonexistent L3 block
      const l4 = makeL4({
        id: "bad-flow",
        name: "bad-flow",
        steps: [
          {
            id: "s1",
            action: "process",
            blockRef: "nonexistent-block",
            next: null,
          },
        ],
      });
      await writeL4(tmpDir, l4);

      const input = await loadCheckInput(tmpDir);
      const report = check(input);

      const missingRefErrors = report.issues.filter((i) => i.code === "MISSING_BLOCK_REF");
      expect(missingRefErrors.length).toBeGreaterThan(0);
      expect(missingRefErrors[0].severity).toBe("error");
      expect(missingRefErrors[0].message).toContain("nonexistent-block");
    });
  });

  // ── Scenario 4: Hash mismatch detection ──

  describe("4. Hash mismatch detection and rehash recovery", () => {
    it("tampering is detected and rehash recovers", async () => {
      await init(tmpDir, { name: "hash-test" });

      // Write L3 block with correct hash
      const l3 = makeL3({ id: "tampered-block", name: "tampered-block" });
      await writeL3(tmpDir, l3);

      // Verify initially correct
      let input = await loadCheckInput(tmpDir);
      let report = check(input);
      const initialHashErrors = report.issues.filter(
        (i) => i.code === "HASH_MISMATCH" && i.entityId === "tampered-block",
      );
      expect(initialHashErrors).toHaveLength(0);

      // Manually tamper: modify a field without updating contentHash
      const tamperedL3: L3Block = {
        ...l3,
        constraints: ["new constraint that was not hashed"],
        // contentHash is stale — still the old value
      };
      await writeL3(tmpDir, tamperedL3);

      // Check should detect HASH_MISMATCH
      input = await loadCheckInput(tmpDir);
      report = check(input);
      const hashErrors = report.issues.filter(
        (i) => i.code === "HASH_MISMATCH" && i.entityId === "tampered-block",
      );
      expect(hashErrors).toHaveLength(1);
      expect(hashErrors[0].severity).toBe("error");

      // Rehash to fix
      const { data: fixedL3, result: rehashResult } = rehashL3(tamperedL3);
      expect(rehashResult.changed).toBe(true);
      expect(rehashResult.newHash).not.toBe(rehashResult.oldHash);
      await writeL3(tmpDir, fixedL3);

      // Check again — zero hash errors
      input = await loadCheckInput(tmpDir);
      report = check(input);
      const postFixErrors = report.issues.filter(
        (i) => i.code === "HASH_MISMATCH" && i.entityId === "tampered-block",
      );
      expect(postFixErrors).toHaveLength(0);
    });
  });

  // ── Scenario 5: Compile plan generation from real project state ──

  describe("5. Compile plan generation from real project state", () => {
    it("change detection → task generation pipeline", async () => {
      await init(tmpDir, { name: "plan-test" });

      // Create two L3 blocks
      const l3a = makeL3({ id: "block-a", name: "block-a" });
      const l3b = makeL3({
        id: "block-b",
        name: "block-b",
        description: "Block B logic",
      });
      await writeL3(tmpDir, l3a);
      await writeL3(tmpDir, l3b);

      // Create L4 referencing both + a missing block
      const l4 = makeL4({
        id: "main-flow",
        name: "main-flow",
        steps: [
          { id: "s1", action: "process", blockRef: "block-a", next: "s2" },
          { id: "s2", action: "process", blockRef: "block-b", next: "s3" },
          {
            id: "s3",
            action: "process",
            blockRef: "missing-block",
            next: null,
          },
        ],
      });
      await writeL4(tmpDir, l4);

      // Create L2 for block-a with STALE sourceHash (simulate drift)
      const l2a = makeL2({
        id: "block-a-ts",
        blockRef: "block-a",
        sourceHash: "stale-old-hash", // does not match l3a.contentHash
      });
      await writeL2(tmpDir, l2a);

      // block-b has NO L2 → should trigger "compile"
      // block-a L2 has stale sourceHash → should trigger "recompile"
      // missing-block doesn't exist as L3 → should trigger "update-ref"

      const input = await loadCheckInput(tmpDir);
      const plan = compilePlan(input);

      expect(plan.summary.total).toBeGreaterThan(0);

      // Check for "compile" task (missing L2 for block-b)
      const compileTasks = plan.tasks.filter((t) => t.action === "compile");
      expect(compileTasks.some((t) => t.targetId === "block-b")).toBe(true);

      // Check for "recompile" task (stale L2 for block-a)
      const recompileTasks = plan.tasks.filter((t) => t.action === "recompile");
      expect(recompileTasks.some((t) => t.targetId === "block-a-ts")).toBe(true);

      // Check for "update-ref" task (missing L3 for missing-block)
      const updateRefTasks = plan.tasks.filter((t) => t.action === "update-ref");
      expect(updateRefTasks.some((t) => t.targetId === "main-flow")).toBe(true);
    });
  });

  // ── Scenario 6: Rehash round-trip across all layers ──

  describe("6. Rehash round-trip across all layers", () => {
    it("rehash fixes all layers, check confirms consistency", async () => {
      await init(tmpDir, { name: "rehash-test" });

      // Create all layers with placeholder contentHash
      const l5: L5Blueprint = {
        id: "rehash-project",
        name: "Rehash Project",
        version: "1.0",
        intent: "test rehashing",
        constraints: [],
        domains: [],
        integrations: [],
        contentHash: "placeholder",
        revision: REV1,
      };

      const l4: L4Flow = {
        id: "rehash-flow",
        name: "rehash-flow",
        steps: [
          {
            id: "s1",
            action: "process",
            blockRef: "rehash-block",
            next: null,
          },
        ],
        dataFlows: [],
        contentHash: "placeholder",
        revision: REV1,
      };

      const l3: L3Block = {
        id: "rehash-block",
        name: "rehash-block",
        input: [{ name: "in", type: "string" }],
        output: [{ name: "out", type: "string" }],
        validate: {},
        constraints: [],
        description: "A block for rehash testing",
        contentHash: "placeholder",
        revision: REV1,
      };

      const l2: L2CodeBlock = {
        id: "rehash-block-ts",
        blockRef: "rehash-block",
        language: "typescript",
        files: ["src/rehash-block.ts"],
        sourceHash: "placeholder",
        contentHash: "placeholder",
        revision: REV1,
      };

      // Write all with bad hashes
      await writeL5(tmpDir, l5);
      await writeL4(tmpDir, l4);
      await writeL3(tmpDir, l3);
      await writeL2(tmpDir, l2);

      // Check should report HASH_MISMATCH for all
      let input = await loadCheckInput(tmpDir);
      let report = check(input);
      const hashMismatches = report.issues.filter((i) => i.code === "HASH_MISMATCH");
      // L5 + L4 + L3 + L2 = at least 4 hash mismatches
      expect(hashMismatches.length).toBeGreaterThanOrEqual(4);

      // Rehash all layers
      const { data: fixedL5, result: r5 } = rehashL5(l5);
      const { data: fixedL4, result: r4 } = rehashL4(l4);
      const { data: fixedL3, result: r3 } = rehashL3(l3);
      // For L2, also fix sourceHash to match L3
      const l2WithCorrectSource: L2CodeBlock = {
        ...l2,
        sourceHash: fixedL3.contentHash,
      };
      const { data: fixedL2, result: r2 } = rehashL2(l2WithCorrectSource);

      expect(r5.changed).toBe(true);
      expect(r4.changed).toBe(true);
      expect(r3.changed).toBe(true);
      expect(r2.changed).toBe(true);

      // Verify revision bumps
      expect(fixedL5.revision.rev).toBe(2);
      expect(fixedL4.revision.rev).toBe(2);
      expect(fixedL3.revision.rev).toBe(2);
      expect(fixedL2.revision.rev).toBe(2);

      // Write fixed versions
      await writeL5(tmpDir, fixedL5);
      await writeL4(tmpDir, fixedL4);
      await writeL3(tmpDir, fixedL3);
      await writeL2(tmpDir, fixedL2);

      // Check → zero HASH_MISMATCH errors
      input = await loadCheckInput(tmpDir);
      report = check(input);
      const remainingHashErrors = report.issues.filter((i) => i.code === "HASH_MISMATCH");
      expect(remainingHashErrors).toHaveLength(0);
    });
  });
});
