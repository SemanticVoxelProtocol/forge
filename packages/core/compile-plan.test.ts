// compile-plan.ts 单元测试

import { describe, it, expect } from "vitest";
import { compilePlan } from "./compile-plan.js";
import { computeHash } from "./hash.js";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4Flow } from "./l4.js";
import type { L5Blueprint } from "./l5.js";
import type { ArtifactVersion } from "./version.js";

// ── fixtures ──

const REV1: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00Z",
};

function makeL3(id: string, name: string, overrides: Partial<L3Block> = {}): L3Block {
  const base: Omit<L3Block, "contentHash" | "revision"> = {
    id,
    name,
    input: [{ name: "request", type: "Request" }],
    output: [{ name: "result", type: "Result" }],
    validate: {},
    constraints: [],
    description: `${name} logic`,
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, contentHash };
}

function makeL4(id: string, blockIds: string[]): L4Flow {
  const steps = blockIds.map((blockId, index) => ({
    id: `s${String(index)}`,
    action: "process" as const,
    blockRef: blockId,
    next: index < blockIds.length - 1 ? `s${String(index + 1)}` : null,
  }));

  const base: Omit<L4Flow, "contentHash" | "revision"> = {
    id,
    name: id,
    steps,
    dataFlows: [],
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

function makeL5(): L5Blueprint {
  const base: Omit<L5Blueprint, "contentHash" | "revision"> = {
    id: "test-project",
    name: "Test Project",
    version: "0.1.0",
    intent: "Testing",
    constraints: [],
    domains: [],
    integrations: [],
  };
  return { ...base, revision: REV1, contentHash: computeHash(base as Record<string, unknown>) };
}

// ── tests ──

describe("compilePlan", () => {
  it("returns empty plan when everything is in sync", () => {
    const l3 = makeL3("validate", "Validate");
    const l2 = makeL2(l3);
    const l4 = makeL4("flow-a", ["validate"]);

    const plan = compilePlan({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [l2] });

    expect(plan.tasks).toEqual([]);
    expect(plan.summary.total).toBe(0);
  });

  it("detects missing L2 compilation (L3 without L2)", () => {
    const l3 = makeL3("validate", "Validate");
    const l4 = makeL4("flow-a", ["validate"]);

    const plan = compilePlan({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });

    expect(plan.summary.compile).toBe(1);
    expect(plan.tasks[0].action).toBe("compile");
    expect(plan.tasks[0].targetLayer).toBe("l2");
    expect(plan.tasks[0].targetId).toBe("validate");
    expect(plan.tasks[0].issueCode).toBe("MISSING_L2");

    // context should reference the L3 block and the L4 flow
    const contextLayers = plan.tasks[0].context.map((c) => c.layer);
    expect(contextLayers).toContain("l3");
    expect(contextLayers).toContain("l4");
  });

  it("detects source drift (L3 changed, L2 stale)", () => {
    const l3Original = makeL3("validate", "Validate");
    const l2 = makeL2(l3Original); // L2 was compiled from original

    // L3 changes
    const l3Updated = makeL3("validate", "Validate", {
      description: "Updated validation logic",
    });

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [l3Updated],
      l2Blocks: [l2],
    });

    expect(plan.summary.recompile).toBe(1);
    expect(plan.tasks[0].action).toBe("recompile");
    expect(plan.tasks[0].targetId).toBe("validate");
    expect(plan.tasks[0].issueCode).toBe("SOURCE_DRIFT");
  });

  it("detects broken L4 → L3 reference", () => {
    // L4 references "validate" but L3 doesn't exist
    const l4 = makeL4("flow-a", ["validate"]);
    const l5 = makeL5();

    const plan = compilePlan({
      l5,
      l4Flows: [l4],
      l3Blocks: [],
      l2Blocks: [],
    });

    expect(plan.summary.updateRef).toBe(1);
    expect(plan.tasks[0].action).toBe("update-ref");
    expect(plan.tasks[0].targetLayer).toBe("l4");
    expect(plan.tasks[0].targetId).toBe("flow-a");
    expect(plan.tasks[0].issueCode).toBe("MISSING_BLOCK_REF");

    // context should include L5 blueprint
    const contextLayers = plan.tasks[0].context.map((c) => c.layer);
    expect(contextLayers).toContain("l5");
  });

  it("detects orphaned L2 (L3 deleted)", () => {
    const l3 = makeL3("validate", "Validate");
    const l2 = makeL2(l3);

    // L3 is gone, L2 remains
    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [],
      l2Blocks: [l2],
    });

    expect(plan.summary.review).toBe(1);
    expect(plan.tasks[0].action).toBe("review");
    expect(plan.tasks[0].targetLayer).toBe("l2");
    expect(plan.tasks[0].issueCode).toBe("MISSING_BLOCK_REF");
  });

  it("handles multiple issues across layers", () => {
    const l3a = makeL3("validate", "Validate");
    const l3b = makeL3("calc", "Calculate");
    // l3a has no L2 (needs compile), l3b has stale L2 (needs recompile)
    const l2b = makeL2(makeL3("calc", "Calculate Old")); // stale sourceHash

    const l4 = makeL4("flow-a", ["validate", "calc"]);

    const plan = compilePlan({
      l4Flows: [l4],
      l3Blocks: [l3a, l3b],
      l2Blocks: [l2b],
    });

    expect(plan.summary.total).toBe(2);
    expect(plan.summary.compile).toBe(1);
    expect(plan.summary.recompile).toBe(1);

    const actions = plan.tasks.map((t) => `${t.action}:${t.targetId}`);
    expect(actions).toContain("compile:validate");
    expect(actions).toContain("recompile:calc");
  });

  it("deduplicates tasks for the same target", () => {
    const l3 = makeL3("validate", "Validate");
    // Two L4 flows reference the same missing L3
    const l4a = makeL4("flow-a", ["validate"]);
    const l4b = makeL4("flow-b", ["validate"]);

    const plan = compilePlan({
      l4Flows: [l4a, l4b],
      l3Blocks: [l3],
      l2Blocks: [],
    });

    // Only 1 compile task for validate, not 2
    const compileTasks = plan.tasks.filter(
      (t) => t.action === "compile" && t.targetId === "validate",
    );
    expect(compileTasks).toHaveLength(1);
  });

  it("detects content drift (L1 signatures changed)", () => {
    const l3 = makeL3("validate", "Validate");
    const l2: L2CodeBlock = {
      ...makeL2(l3),
      signatureHash: "old-sig",
    };

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [l3],
      l2Blocks: [l2],
      l1SignatureHashes: new Map([["validate", "new-sig"]]),
    });

    expect(plan.summary.review).toBe(1);
    const task = plan.tasks.find((t) => t.issueCode === "CONTENT_DRIFT");
    expect(task).toBeDefined();
    expect(task?.action).toBe("review");
    expect(task?.targetLayer).toBe("l3");
    expect(task?.reason).toContain("L1 exported signatures changed");
  });

  it("no content drift task when signatures match", () => {
    const l3 = makeL3("validate", "Validate");
    const l2: L2CodeBlock = {
      ...makeL2(l3),
      signatureHash: "same-sig",
    };

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [l3],
      l2Blocks: [l2],
      l1SignatureHashes: new Map([["validate", "same-sig"]]),
    });

    const task = plan.tasks.find((t) => t.issueCode === "CONTENT_DRIFT");
    expect(task).toBeUndefined();
  });

  it("returns empty plan for empty input", () => {
    const plan = compilePlan({ l4Flows: [], l3Blocks: [], l2Blocks: [] });
    expect(plan.tasks).toEqual([]);
    expect(plan.summary.total).toBe(0);
  });
});
