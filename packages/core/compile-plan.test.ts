// compile-plan.ts 单元测试

import { describe, it, expect } from "vitest";
import { compilePlan, getDefaultComplexity } from "./compile-plan.js";
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
    expect(plan.tasks[0].complexity).toBe("standard");

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
    expect(plan.tasks[0].complexity).toBe("standard");
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
    expect(plan.tasks[0].complexity).toBe("light");

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

// ── additional tests ──

describe("compilePlan — cross-type deduplication", () => {
  it("preserves tasks with same targetId but different actions", () => {
    // block-a has an L3 but no L2 → compile task
    // block-b's L2 references a missing L3 → review task
    // Both survive dedup because action differs (even if targetLayer matches)
    const l3a = makeL3("block-a", "Block A");
    const orphanL2b: L2CodeBlock = (() => {
      const base = makeL2(makeL3("block-b-orig", "Block B Orig"));
      return { ...base, id: "block-b", blockRef: "block-b-missing" };
    })();

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [l3a], // block-a has no L2 → compile
      l2Blocks: [orphanL2b], // block-b refs missing L3 → review
    });

    const compileTask = plan.tasks.find((t) => t.action === "compile" && t.targetId === "block-a");
    const reviewTask = plan.tasks.find((t) => t.action === "review" && t.targetId === "block-b");
    expect(compileTask).toBeDefined();
    expect(reviewTask).toBeDefined();
    expect(plan.tasks.length).toBeGreaterThanOrEqual(2);
  });

  it("deduplicates tasks with same targetLayer/targetId/action", () => {
    // Two L4 flows reference the same missing L3 block → only one compile task
    const l3 = makeL3("shared", "Shared");
    const l4a = makeL4("flow-x", ["shared"]);
    const l4b = makeL4("flow-y", ["shared"]);

    const plan = compilePlan({
      l4Flows: [l4a, l4b],
      l3Blocks: [l3],
      l2Blocks: [],
    });

    const compileTasks = plan.tasks.filter(
      (t) => t.action === "compile" && t.targetId === "shared",
    );
    expect(compileTasks).toHaveLength(1);
  });
});

describe("compilePlan — broken refs context", () => {
  it("excludes L5 from context when L5 is undefined", () => {
    const l4 = makeL4("flow-no-l5", ["nonexistent-block"]);

    const plan = compilePlan({
      // no l5
      l4Flows: [l4],
      l3Blocks: [],
      l2Blocks: [],
    });

    const task = plan.tasks.find((t) => t.action === "update-ref" && t.targetId === "flow-no-l5");
    expect(task).toBeDefined();
    const contextLayers = task!.context.map((c) => c.layer);
    expect(contextLayers).not.toContain("l5");
    expect(contextLayers).toContain("l4");
  });

  it("includes L5 in context when L5 is defined", () => {
    const l4 = makeL4("flow-with-l5", ["nonexistent-block"]);
    const l5 = makeL5();

    const plan = compilePlan({
      l5,
      l4Flows: [l4],
      l3Blocks: [],
      l2Blocks: [],
    });

    const task = plan.tasks.find((t) => t.action === "update-ref" && t.targetId === "flow-with-l5");
    expect(task).toBeDefined();
    const contextLayers = task!.context.map((c) => c.layer);
    expect(contextLayers).toContain("l5");
    expect(contextLayers).toContain("l4");
  });
});

describe("compilePlan — recompile context", () => {
  it("includes both L3 and L2 in recompile task context", () => {
    const l3Original = makeL3("process", "Process");
    const l2 = makeL2(l3Original);
    const l3Updated = makeL3("process", "Process", { description: "Updated logic" });

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [l3Updated],
      l2Blocks: [l2],
    });

    const task = plan.tasks.find((t) => t.action === "recompile" && t.targetId === "process");
    expect(task).toBeDefined();
    const contextLayers = task!.context.map((c) => c.layer);
    expect(contextLayers).toContain("l3");
    expect(contextLayers).toContain("l2");
  });

  it("includes L4 refs that reference the L3 block in recompile context", () => {
    const l3Original = makeL3("worker", "Worker");
    const l2 = makeL2(l3Original);
    const l3Updated = makeL3("worker", "Worker", { description: "Changed" });
    const l4 = makeL4("flow-uses-worker", ["worker"]);

    const plan = compilePlan({
      l4Flows: [l4],
      l3Blocks: [l3Updated],
      l2Blocks: [l2],
    });

    const task = plan.tasks.find((t) => t.action === "recompile" && t.targetId === "worker");
    expect(task).toBeDefined();
    const contextLayers = task!.context.map((c) => c.layer);
    expect(contextLayers).toContain("l3");
    expect(contextLayers).toContain("l4");
    expect(contextLayers).toContain("l2");

    const l4ContextEntry = task!.context.find((c) => c.layer === "l4");
    expect(l4ContextEntry?.id).toBe("flow-uses-worker");
  });
});

describe("compilePlan — content drift context", () => {
  it("includes L2 and L3 in review task for CONTENT_DRIFT", () => {
    const l3 = makeL3("svc", "Service");
    const l2: L2CodeBlock = { ...makeL2(l3), signatureHash: "old-hash" };

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [l3],
      l2Blocks: [l2],
      l1SignatureHashes: new Map([["svc", "new-hash"]]),
    });

    const task = plan.tasks.find((t) => t.issueCode === "CONTENT_DRIFT");
    expect(task).toBeDefined();
    const contextLayers = task!.context.map((c) => c.layer);
    expect(contextLayers).toContain("l2");
    expect(contextLayers).toContain("l3");
  });

  it("uses L3 id as targetId when L3 exists", () => {
    const l3 = makeL3("handler", "Handler");
    const l2: L2CodeBlock = { ...makeL2(l3), signatureHash: "stale" };

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [l3],
      l2Blocks: [l2],
      l1SignatureHashes: new Map([["handler", "fresh"]]),
    });

    const task = plan.tasks.find((t) => t.issueCode === "CONTENT_DRIFT");
    expect(task).toBeDefined();
    expect(task!.targetId).toBe("handler"); // L3 id
    expect(task!.targetLayer).toBe("l3");
  });

  it("falls back to entityId when L3 not found for CONTENT_DRIFT", () => {
    // L2 references a missing L3 (blockRef points nowhere) AND has CONTENT_DRIFT
    // We need to craft this carefully: the L2 must have a signatureHash mismatch,
    // but its blockRef must not match any L3 in the input.
    // The L2 id must be in l1SignatureHashes to trigger CONTENT_DRIFT.
    const ghostL3 = makeL3("ghost-l3", "Ghost");
    const l2: L2CodeBlock = {
      ...makeL2(ghostL3),
      id: "orphan-block",
      blockRef: "ghost-l3", // references L3 not in input
      signatureHash: "outdated",
    };

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [], // ghost-l3 is absent
      l2Blocks: [l2],
      l1SignatureHashes: new Map([["orphan-block", "current"]]),
    });

    const task = plan.tasks.find((t) => t.issueCode === "CONTENT_DRIFT");
    expect(task).toBeDefined();
    // l3 not found → targetId falls back to issue.entityId which is the L2 block id
    expect(task!.targetId).toBe("orphan-block");
  });
});

describe("compilePlan — orphaned L2", () => {
  it("generates review task for L2 with MISSING_BLOCK_REF", () => {
    const ghostL3 = makeL3("deleted-block", "Deleted Block");
    const l2 = makeL2(ghostL3); // blockRef="deleted-block", but L3 absent

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [], // L3 is gone
      l2Blocks: [l2],
    });

    const task = plan.tasks.find(
      (t) => t.action === "review" && t.issueCode === "MISSING_BLOCK_REF",
    );
    expect(task).toBeDefined();
    expect(task!.targetLayer).toBe("l2");
    expect(task!.targetId).toBe("deleted-block");
  });

  it("context includes orphaned L2 block ref", () => {
    const ghostL3 = makeL3("gone", "Gone");
    const l2 = makeL2(ghostL3);

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [],
      l2Blocks: [l2],
    });

    const task = plan.tasks.find(
      (t) => t.action === "review" && t.issueCode === "MISSING_BLOCK_REF",
    );
    expect(task).toBeDefined();
    const l2ContextEntry = task!.context.find((c) => c.layer === "l2");
    expect(l2ContextEntry).toBeDefined();
    expect(l2ContextEntry!.label).toBe("orphaned L2 code block");
  });
});

describe("compilePlan — multiple missing compilations", () => {
  it("generates compile task for each L3 without matching L2", () => {
    const l3a = makeL3("alpha", "Alpha");
    const l3b = makeL3("beta", "Beta");
    const l3c = makeL3("gamma", "Gamma");

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [l3a, l3b, l3c],
      l2Blocks: [],
    });

    expect(plan.summary.compile).toBe(3);
    const compiledIds = plan.tasks.filter((t) => t.action === "compile").map((t) => t.targetId);
    expect(compiledIds).toContain("alpha");
    expect(compiledIds).toContain("beta");
    expect(compiledIds).toContain("gamma");
  });

  it("skips L3 blocks that already have matching L2", () => {
    const l3a = makeL3("alpha", "Alpha");
    const l3b = makeL3("beta", "Beta");
    const l3c = makeL3("gamma", "Gamma");
    const l2a = makeL2(l3a); // alpha is covered
    const l2b = makeL2(l3b); // beta is covered

    const plan = compilePlan({
      l4Flows: [],
      l3Blocks: [l3a, l3b, l3c],
      l2Blocks: [l2a, l2b],
    });

    expect(plan.summary.compile).toBe(1);
    const compileTask = plan.tasks.find((t) => t.action === "compile");
    expect(compileTask?.targetId).toBe("gamma");
  });
});

describe("compilePlan — summary", () => {
  it("correctly counts each action type in summary", () => {
    // compile: l3 "new-block" has no L2
    const l3New = makeL3("new-block", "New Block");

    // recompile: l3 "stale-block" changed since l2 was compiled
    const l3StaleOrig = makeL3("stale-block", "Stale Block");
    const l2Stale = makeL2(l3StaleOrig);
    const l3StaleUpdated = makeL3("stale-block", "Stale Block", { description: "Changed" });

    // review (CONTENT_DRIFT): "drift-block" has signature mismatch
    const l3Drift = makeL3("drift-block", "Drift Block");
    const l2Drift: L2CodeBlock = { ...makeL2(l3Drift), signatureHash: "old" };

    // update-ref: L4 flow references missing L3 block
    const l4Broken = makeL4("broken-flow", ["nonexistent"]);

    const plan = compilePlan({
      l4Flows: [l4Broken],
      l3Blocks: [l3New, l3StaleUpdated, l3Drift],
      l2Blocks: [l2Stale, l2Drift],
      l1SignatureHashes: new Map([["drift-block", "new"]]),
    });

    expect(plan.summary.compile).toBe(1);
    expect(plan.summary.recompile).toBe(1);
    expect(plan.summary.review).toBe(1);
    expect(plan.summary.updateRef).toBe(1);
    expect(plan.summary.total).toBe(4);
  });

  it("returns zero counts for empty input", () => {
    const plan = compilePlan({ l4Flows: [], l3Blocks: [], l2Blocks: [] });
    expect(plan.summary.compile).toBe(0);
    expect(plan.summary.recompile).toBe(0);
    expect(plan.summary.review).toBe(0);
    expect(plan.summary.updateRef).toBe(0);
    expect(plan.summary.total).toBe(0);
  });
});

describe("compilePlan — L3 context with L4 backref", () => {
  it("includes all L4 flows that reference the L3 block in context", () => {
    const l3 = makeL3("shared-block", "Shared Block");
    const l4a = makeL4("flow-one", ["shared-block"]);
    const l4b = makeL4("flow-two", ["shared-block"]);
    // flow-three does NOT reference shared-block
    const l4c = makeL4("flow-three", ["other-block"]);

    const plan = compilePlan({
      l4Flows: [l4a, l4b, l4c],
      l3Blocks: [l3],
      l2Blocks: [], // no L2 → compile task
    });

    const task = plan.tasks.find((t) => t.action === "compile" && t.targetId === "shared-block");
    expect(task).toBeDefined();

    const l4ContextEntries = task!.context.filter((c) => c.layer === "l4");
    const l4ContextIds = l4ContextEntries.map((c) => c.id);
    expect(l4ContextIds).toContain("flow-one");
    expect(l4ContextIds).toContain("flow-two");
    expect(l4ContextIds).not.toContain("flow-three");
  });

  it("L3 not referenced by any L4 → only L3 in context", () => {
    const l3 = makeL3("isolated-block", "Isolated Block");
    const l4 = makeL4("unrelated-flow", ["other-id"]);

    const plan = compilePlan({
      l4Flows: [l4],
      l3Blocks: [l3],
      l2Blocks: [], // no L2 → compile task
    });

    const task = plan.tasks.find((t) => t.action === "compile" && t.targetId === "isolated-block");
    expect(task).toBeDefined();
    const contextLayers = task!.context.map((c) => c.layer);
    expect(contextLayers).toContain("l3");
    expect(contextLayers).not.toContain("l4");
  });
});

describe("compilePlan — complexity", () => {
  it("assigns correct complexity per action type", () => {
    const l3New = makeL3("new-block", "New Block");

    const l3StaleOrig = makeL3("stale-block", "Stale Block");
    const l2Stale = makeL2(l3StaleOrig);
    const l3StaleUpdated = makeL3("stale-block", "Stale Block", { description: "Changed" });

    const l3Drift = makeL3("drift-block", "Drift Block");
    const l2Drift: L2CodeBlock = { ...makeL2(l3Drift), signatureHash: "old" };

    const l4Broken = makeL4("broken-flow", ["nonexistent"]);

    const plan = compilePlan({
      l4Flows: [l4Broken],
      l3Blocks: [l3New, l3StaleUpdated, l3Drift],
      l2Blocks: [l2Stale, l2Drift],
      l1SignatureHashes: new Map([["drift-block", "new"]]),
    });

    const compileTask = plan.tasks.find((t) => t.action === "compile");
    expect(compileTask?.complexity).toBe("standard");

    const recompileTask = plan.tasks.find((t) => t.action === "recompile");
    expect(recompileTask?.complexity).toBe("standard");

    const reviewTask = plan.tasks.find((t) => t.action === "review");
    expect(reviewTask?.complexity).toBe("standard");

    const updateRefTask = plan.tasks.find((t) => t.action === "update-ref");
    expect(updateRefTask?.complexity).toBe("light");
  });

  it("summary includes correct complexityCounts", () => {
    const l3New = makeL3("new-block", "New Block");

    const l3StaleOrig = makeL3("stale-block", "Stale Block");
    const l2Stale = makeL2(l3StaleOrig);
    const l3StaleUpdated = makeL3("stale-block", "Stale Block", { description: "Changed" });

    const l3Drift = makeL3("drift-block", "Drift Block");
    const l2Drift: L2CodeBlock = { ...makeL2(l3Drift), signatureHash: "old" };

    const l4Broken = makeL4("broken-flow", ["nonexistent"]);

    const plan = compilePlan({
      l4Flows: [l4Broken],
      l3Blocks: [l3New, l3StaleUpdated, l3Drift],
      l2Blocks: [l2Stale, l2Drift],
      l1SignatureHashes: new Map([["drift-block", "new"]]),
    });

    expect(plan.summary.complexityCounts).toEqual({
      heavy: 0,
      standard: 3, // compile + recompile + review
      light: 1, // update-ref
    });
  });

  it("returns zero complexityCounts for empty input", () => {
    const plan = compilePlan({ l4Flows: [], l3Blocks: [], l2Blocks: [] });
    expect(plan.summary.complexityCounts).toEqual({
      heavy: 0,
      standard: 0,
      light: 0,
    });
  });
});

describe("compilePlan — language parameter", () => {
  it("uses Chinese text in reason/label fields when language is 'zh'", () => {
    const l3 = makeL3("validate", "Validate");
    const l4 = makeL4("flow-a", ["validate"]);

    const plan = compilePlan(
      { l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] },
      "zh",
    );

    expect(plan.summary.compile).toBe(1);
    const task = plan.tasks[0];
    // Chinese locale: reason should contain Chinese characters
    expect(task.reason).toMatch(/[\u4E00-\u9FFF]/);
  });
});

describe("getDefaultComplexity", () => {
  it("returns standard for compile", () => {
    expect(getDefaultComplexity("compile")).toBe("standard");
  });

  it("returns standard for recompile", () => {
    expect(getDefaultComplexity("recompile")).toBe("standard");
  });

  it("returns standard for review", () => {
    expect(getDefaultComplexity("review")).toBe("standard");
  });

  it("returns light for update-ref", () => {
    expect(getDefaultComplexity("update-ref")).toBe("light");
  });
});
