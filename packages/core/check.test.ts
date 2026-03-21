import { describe, expect, it } from "vitest";
import { check } from "./check.js";
import { hashL2, hashL3, hashL4, hashL5 } from "./hash.js";
import type { CheckInput } from "./check.js";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4EventGraph, L4Flow, L4StateMachine } from "./l4.js";
import type { L5Blueprint } from "./l5.js";
import type { ArtifactVersion } from "./version.js";

// ── 工厂函数 ──

const REV1: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00Z",
};

function makeL3(overrides: Partial<L3Block> = {}): L3Block {
  const base = {
    id: "validate-order",
    name: "验证订单",
    input: [{ name: "request", type: "OrderRequest" }],
    output: [{ name: "result", type: "ValidationResult" }],
    validate: {},
    constraints: [],
    description: "校验订单",
    ...overrides,
  };
  const { revision: _r, ...hashInput } = base;
  return { ...base, revision: REV1, contentHash: overrides.contentHash ?? hashL3(hashInput) };
}

function makeL4(overrides: Partial<L4Flow> = {}): L4Flow {
  const base = {
    id: "order-flow",
    name: "订单流程",
    steps: [{ id: "s1", action: "process" as const, blockRef: "validate-order", next: null }],
    dataFlows: [],
    ...overrides,
  };
  const { revision: _r, ...hashInput } = base;
  return { ...base, revision: REV1, contentHash: overrides.contentHash ?? hashL4(hashInput) };
}

function makeL5(overrides: Partial<L5Blueprint> = {}): L5Blueprint {
  const base = {
    id: "my-project",
    name: "My Project",
    version: "1.0",
    intent: "do stuff",
    constraints: [],
    domains: [{ name: "order", description: "订单域", dependencies: [] }],
    integrations: [],
    language: "en",
    ...overrides,
  };
  const { revision: _r, ...hashInput } = base;
  return { ...base, revision: REV1, contentHash: overrides.contentHash ?? hashL5(hashInput) };
}

function makeL2(overrides: Partial<L2CodeBlock> = {}): L2CodeBlock {
  const base = {
    id: "validate-order-ts",
    blockRef: "validate-order",
    language: "typescript",
    files: ["src/validate-order.ts"],
    ...overrides,
  };
  const { sourceHash: _s, revision: _r, ...hashInput } = base;
  return {
    ...base,
    revision: REV1,
    sourceHash: overrides.sourceHash ?? "will-be-set",
    contentHash: overrides.contentHash ?? hashL2(hashInput),
  };
}

function validInput(): CheckInput {
  const l3 = makeL3();
  const l4 = makeL4();
  const l5 = makeL5();
  const l2 = makeL2({ sourceHash: l3.contentHash });
  return { l5, l4Flows: [l4], l3Blocks: [l3], l2Blocks: [l2] };
}

// ── 测试 ──

describe("check — clean project", () => {
  it("reports no issues for valid input", () => {
    const report = check(validInput());
    expect(report.issues).toEqual([]);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
  });
});

describe("check — hash consistency", () => {
  it("detects L3 contentHash mismatch", () => {
    const l3 = makeL3({ contentHash: "wrong" });
    const report = check({ l4Flows: [], l3Blocks: [l3], l2Blocks: [] });
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe("HASH_MISMATCH");
    expect(report.issues[0].layer).toBe("l3");
  });

  it("detects L4 contentHash mismatch", () => {
    const l3 = makeL3();
    const l4 = makeL4({ contentHash: "wrong" });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const hashIssues = report.issues.filter((i) => i.code === "HASH_MISMATCH");
    expect(hashIssues).toHaveLength(1);
    expect(hashIssues[0].layer).toBe("l4");
  });

  it("detects L5 contentHash mismatch", () => {
    const l5 = makeL5({ contentHash: "wrong" });
    const report = check({ l5, l4Flows: [], l3Blocks: [], l2Blocks: [] });
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0].code).toBe("HASH_MISMATCH");
    expect(report.issues[0].layer).toBe("l5");
  });

  it("detects L2 contentHash mismatch", () => {
    const l3 = makeL3();
    const l2 = makeL2({ sourceHash: l3.contentHash, contentHash: "wrong" });
    const report = check({ l4Flows: [], l3Blocks: [l3], l2Blocks: [l2] });
    const hashIssues = report.issues.filter((i) => i.code === "HASH_MISMATCH");
    expect(hashIssues).toHaveLength(1);
    expect(hashIssues[0].layer).toBe("l2");
  });
});

describe("check — referential integrity", () => {
  it("detects missing L3 block referenced by L4 step", () => {
    const l4 = makeL4({
      steps: [{ id: "s1", action: "process", blockRef: "non-existent" }],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [], l2Blocks: [] });
    const refIssues = report.issues.filter((i) => i.code === "MISSING_BLOCK_REF");
    expect(refIssues).toHaveLength(1);
    expect(refIssues[0].message).toContain("non-existent");
  });

  it("detects missing L4 flow referenced by call step", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [{ id: "s1", action: "call", flowRef: "non-existent" }],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const refIssues = report.issues.filter((i) => i.code === "MISSING_FLOW_REF");
    expect(refIssues).toHaveLength(1);
  });

  it("detects missing step in next chain", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [{ id: "s1", action: "process", blockRef: "validate-order", next: "ghost" }],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const stepIssues = report.issues.filter((i) => i.code === "MISSING_STEP_REF");
    expect(stepIssues).toHaveLength(1);
  });

  it("detects missing step in parallel branches", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [
        { id: "s1", action: "process", blockRef: "validate-order" },
        { id: "p1", action: "parallel", branches: ["s1", "ghost"] },
      ],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const stepIssues = report.issues.filter((i) => i.code === "MISSING_STEP_REF");
    expect(stepIssues).toHaveLength(1);
  });

  it("detects missing step in waitFor", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [
        { id: "s1", action: "process", blockRef: "validate-order" },
        { id: "w1", action: "wait", waitFor: ["ghost"] },
      ],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const stepIssues = report.issues.filter((i) => i.code === "MISSING_STEP_REF");
    expect(stepIssues).toHaveLength(1);
  });

  it("detects missing L3 block referenced by L2", () => {
    const l2 = makeL2({ blockRef: "non-existent", sourceHash: "abc" });
    const report = check({ l4Flows: [], l3Blocks: [], l2Blocks: [l2] });
    const refIssues = report.issues.filter((i) => i.code === "MISSING_BLOCK_REF");
    expect(refIssues).toHaveLength(1);
    expect(refIssues[0].layer).toBe("l2");
  });

  it("detects invalid dataFlow format", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [{ id: "s1", action: "process", blockRef: "validate-order" }],
      dataFlows: [{ from: "bad-format", to: "s1.request" }],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const fmtIssues = report.issues.filter((i) => i.code === "INVALID_DATAFLOW_FORMAT");
    expect(fmtIssues).toHaveLength(1);
  });

  it("detects missing pin in dataFlow", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [
        { id: "s1", action: "process", blockRef: "validate-order" },
        { id: "s2", action: "process", blockRef: "validate-order" },
      ],
      dataFlows: [{ from: "s1.nonExistentPin", to: "s2.request" }],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const pinIssues = report.issues.filter((i) => i.code === "MISSING_PIN");
    expect(pinIssues).toHaveLength(1);
    expect(pinIssues[0].message).toContain("nonExistentPin");
  });
});

describe("check — drift detection", () => {
  it("detects L2 sourceHash drift from L3 contentHash", () => {
    const l3 = makeL3();
    const l2 = makeL2({ sourceHash: "old-hash" });
    const report = check({ l4Flows: [], l3Blocks: [l3], l2Blocks: [l2] });
    const driftIssues = report.issues.filter((i) => i.code === "SOURCE_DRIFT");
    expect(driftIssues).toHaveLength(1);
    expect(driftIssues[0].severity).toBe("warning");
  });

  it("no drift when sourceHash matches L3 contentHash", () => {
    const l3 = makeL3();
    const l2 = makeL2({ sourceHash: l3.contentHash });
    const report = check({ l4Flows: [], l3Blocks: [l3], l2Blocks: [l2] });
    const driftIssues = report.issues.filter((i) => i.code === "SOURCE_DRIFT");
    expect(driftIssues).toHaveLength(0);
  });
});

describe("check — graph structure", () => {
  it("detects cycle in next chain", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [
        { id: "s1", action: "process", blockRef: "validate-order", next: "s2" },
        { id: "s2", action: "process", blockRef: "validate-order", next: "s1" },
      ],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const cycleIssues = report.issues.filter((i) => i.code === "NEXT_CYCLE");
    expect(cycleIssues).toHaveLength(1);
    expect(cycleIssues[0].severity).toBe("error");
  });

  it("no cycle for linear next chain", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [
        { id: "s1", action: "process", blockRef: "validate-order", next: "s2" },
        { id: "s2", action: "process", blockRef: "validate-order", next: null },
      ],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const cycleIssues = report.issues.filter((i) => i.code === "NEXT_CYCLE");
    expect(cycleIssues).toHaveLength(0);
  });

  it("detects orphan step", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [
        { id: "s1", action: "process", blockRef: "validate-order", next: null },
        { id: "s2", action: "process", blockRef: "validate-order" }, // 孤立：没人引用
      ],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const orphanIssues = report.issues.filter((i) => i.code === "ORPHAN_STEP");
    expect(orphanIssues).toHaveLength(1);
    expect(orphanIssues[0].severity).toBe("warning");
    expect(orphanIssues[0].message).toContain("s2");
  });

  it("no orphan when all steps reachable via next", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [
        { id: "s1", action: "process", blockRef: "validate-order", next: "s2" },
        { id: "s2", action: "process", blockRef: "validate-order", next: null },
      ],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const orphanIssues = report.issues.filter((i) => i.code === "ORPHAN_STEP");
    expect(orphanIssues).toHaveLength(0);
  });

  it("no orphan when reachable via parallel branches", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [
        { id: "p1", action: "parallel", branches: ["s1", "s2"] },
        { id: "s1", action: "process", blockRef: "validate-order" },
        { id: "s2", action: "process", blockRef: "validate-order" },
      ],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const orphanIssues = report.issues.filter((i) => i.code === "ORPHAN_STEP");
    expect(orphanIssues).toHaveLength(0);
  });

  it("detects self-referencing flowRef", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      id: "order-flow",
      steps: [{ id: "s1", action: "call", flowRef: "order-flow" }],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const selfRefIssues = report.issues.filter((i) => i.code === "SELF_REFERENCING_FLOW");
    expect(selfRefIssues).toHaveLength(1);
    expect(selfRefIssues[0].severity).toBe("warning");
  });
});

// ── EventGraph 校验 ──

function makeEventGraph(overrides: Partial<L4EventGraph> = {}): L4EventGraph {
  const base: Omit<L4EventGraph, "contentHash" | "revision"> = {
    kind: "event-graph",
    id: "doc-collab",
    name: "Document Collaboration",
    state: { document: { type: "CRDTDocument", description: "Shared doc state" } },
    handlers: [
      {
        id: "on-edit",
        event: "user.local_edit",
        steps: [{ id: "s1", action: "process" as const, blockRef: "validate-order", next: null }],
        dataFlows: [],
      },
    ],
    ...overrides,
  };
  const { revision: _r, ...hashInput } = { ...base, revision: REV1, contentHash: "placeholder" };
  return {
    ...base,
    revision: REV1,
    contentHash:
      overrides.contentHash ?? hashL4(hashInput as Omit<L4EventGraph, "contentHash" | "revision">),
  };
}

describe("check — EventGraph referential integrity", () => {
  it("detects missing blockRef in EventGraph handler", () => {
    const eg = makeEventGraph({
      handlers: [
        {
          id: "h1",
          event: "edit",
          steps: [{ id: "s1", action: "process", blockRef: "non-existent" }],
          dataFlows: [],
        },
      ],
    });
    const report = check({ l4Flows: [eg], l3Blocks: [], l2Blocks: [] });
    const refIssues = report.issues.filter(
      (i) => i.code === "MISSING_BLOCK_REF" && i.layer === "l4",
    );
    expect(refIssues).toHaveLength(1);
    expect(refIssues[0].message).toContain("non-existent");
  });

  it("detects invalid $state reference in EventGraph dataFlow", () => {
    const l3 = makeL3();
    const eg = makeEventGraph({
      state: { document: { type: "Doc", description: "d" } },
      handlers: [
        {
          id: "h1",
          event: "edit",
          steps: [{ id: "s1", action: "process", blockRef: "validate-order" }],
          dataFlows: [{ from: "$state.nonExistent", to: "s1.request" }],
        },
      ],
    });
    const report = check({ l4Flows: [eg], l3Blocks: [l3], l2Blocks: [] });
    const stateIssues = report.issues.filter((i) => i.code === "MISSING_STATE_REF");
    expect(stateIssues).toHaveLength(1);
    expect(stateIssues[0].message).toContain("nonExistent");
  });

  it("allows valid $state and $event references", () => {
    const l3 = makeL3();
    const eg = makeEventGraph({
      state: { document: { type: "Doc", description: "d" } },
      handlers: [
        {
          id: "h1",
          event: "edit",
          steps: [{ id: "s1", action: "process", blockRef: "validate-order" }],
          dataFlows: [
            { from: "$event.payload", to: "s1.request" },
            { from: "s1.result", to: "$state.document" },
          ],
        },
      ],
    });
    const report = check({ l4Flows: [eg], l3Blocks: [l3], l2Blocks: [] });
    const stateIssues = report.issues.filter((i) => i.code === "MISSING_STATE_REF");
    expect(stateIssues).toHaveLength(0);
  });
});

describe("check — EventGraph graph structure", () => {
  it("detects duplicate event handlers", () => {
    const l3 = makeL3();
    const eg = makeEventGraph({
      handlers: [
        {
          id: "h1",
          event: "edit",
          steps: [{ id: "s1", action: "process", blockRef: "validate-order" }],
          dataFlows: [],
        },
        {
          id: "h2",
          event: "edit",
          steps: [{ id: "s1", action: "process", blockRef: "validate-order" }],
          dataFlows: [],
        },
      ],
    });
    const report = check({ l4Flows: [eg], l3Blocks: [l3], l2Blocks: [] });
    const dupIssues = report.issues.filter((i) => i.code === "DUPLICATE_EVENT");
    expect(dupIssues).toHaveLength(1);
  });

  it("detects empty state declaration", () => {
    const l3 = makeL3();
    const eg = makeEventGraph({ state: {} });
    const report = check({ l4Flows: [eg], l3Blocks: [l3], l2Blocks: [] });
    const emptyIssues = report.issues.filter((i) => i.code === "EMPTY_STATE");
    expect(emptyIssues).toHaveLength(1);
    expect(emptyIssues[0].severity).toBe("warning");
  });

  it("detects cycle in EventGraph handler step chain", () => {
    const l3 = makeL3();
    const eg = makeEventGraph({
      handlers: [
        {
          id: "h1",
          event: "edit",
          steps: [
            { id: "s1", action: "process", blockRef: "validate-order", next: "s2" },
            { id: "s2", action: "process", blockRef: "validate-order", next: "s1" },
          ],
          dataFlows: [],
        },
      ],
    });
    const report = check({ l4Flows: [eg], l3Blocks: [l3], l2Blocks: [] });
    const cycleIssues = report.issues.filter((i) => i.code === "NEXT_CYCLE");
    expect(cycleIssues).toHaveLength(1);
  });
});

// ── StateMachine 校验 ──

function makeStateMachine(overrides: Partial<L4StateMachine> = {}): L4StateMachine {
  const base: Omit<L4StateMachine, "contentHash" | "revision"> = {
    kind: "state-machine",
    id: "po-lifecycle",
    name: "Purchase Order Lifecycle",
    entity: "PurchaseOrder",
    initialState: "draft",
    states: {
      draft: {},
      pending: { onEntry: { blockRef: "validate-order" } },
      approved: {},
    },
    transitions: [
      { from: "draft", to: "pending", event: "submit" },
      { from: "pending", to: "approved", event: "approve" },
    ],
    ...overrides,
  };
  const { revision: _r, ...hashInput } = { ...base, revision: REV1, contentHash: "placeholder" };
  return {
    ...base,
    revision: REV1,
    contentHash:
      overrides.contentHash ??
      hashL4(hashInput as Omit<L4StateMachine, "contentHash" | "revision">),
  };
}

describe("check — StateMachine referential integrity", () => {
  it("detects missing blockRef in onEntry", () => {
    const sm = makeStateMachine({
      states: {
        draft: {},
        pending: { onEntry: { blockRef: "non-existent" } },
      },
      transitions: [{ from: "draft", to: "pending", event: "submit" }],
    });
    const report = check({ l4Flows: [sm], l3Blocks: [], l2Blocks: [] });
    const refIssues = report.issues.filter(
      (i) => i.code === "MISSING_BLOCK_REF" && i.layer === "l4",
    );
    expect(refIssues).toHaveLength(1);
    expect(refIssues[0].message).toContain("non-existent");
    expect(refIssues[0].message).toContain("onEntry");
  });

  it("detects missing blockRef in guard", () => {
    const l3 = makeL3();
    const sm = makeStateMachine({
      states: { draft: {}, approved: {} },
      transitions: [
        { from: "draft", to: "approved", event: "approve", guard: "non-existent-guard" },
      ],
    });
    const report = check({ l4Flows: [sm], l3Blocks: [l3], l2Blocks: [] });
    const refIssues = report.issues.filter(
      (i) => i.code === "MISSING_BLOCK_REF" && i.message.includes("guard"),
    );
    expect(refIssues).toHaveLength(1);
    expect(refIssues[0].message).toContain("non-existent-guard");
  });

  it("passes with valid blockRefs", () => {
    const l3 = makeL3();
    const sm = makeStateMachine({
      states: {
        draft: {},
        pending: { onEntry: { blockRef: "validate-order" } },
      },
      transitions: [{ from: "draft", to: "pending", event: "submit" }],
    });
    const report = check({ l4Flows: [sm], l3Blocks: [l3], l2Blocks: [] });
    const refIssues = report.issues.filter(
      (i) => i.code === "MISSING_BLOCK_REF" && i.layer === "l4",
    );
    expect(refIssues).toHaveLength(0);
  });
});

describe("check — StateMachine graph structure", () => {
  it("detects invalid initialState", () => {
    const sm = makeStateMachine({
      initialState: "non-existent",
      states: { draft: {} },
      transitions: [],
    });
    const report = check({ l4Flows: [sm], l3Blocks: [], l2Blocks: [] });
    const initIssues = report.issues.filter((i) => i.code === "INVALID_INITIAL_STATE");
    expect(initIssues).toHaveLength(1);
    expect(initIssues[0].severity).toBe("error");
  });

  it("detects invalid transition from/to", () => {
    const sm = makeStateMachine({
      states: { draft: {} },
      transitions: [{ from: "draft", to: "ghost", event: "go" }],
    });
    const report = check({ l4Flows: [sm], l3Blocks: [], l2Blocks: [] });
    const transIssues = report.issues.filter((i) => i.code === "INVALID_TRANSITION");
    expect(transIssues).toHaveLength(1);
    expect(transIssues[0].message).toContain("ghost");
  });

  it("detects unreachable state", () => {
    const sm = makeStateMachine({
      states: { draft: {}, approved: {}, isolated: {} },
      transitions: [{ from: "draft", to: "approved", event: "approve" }],
    });
    const report = check({ l4Flows: [sm], l3Blocks: [], l2Blocks: [] });
    const unreachable = report.issues.filter((i) => i.code === "UNREACHABLE_STATE");
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0].severity).toBe("warning");
    expect(unreachable[0].message).toContain("isolated");
  });

  it("no unreachable state when all reachable", () => {
    const sm = makeStateMachine({
      states: { draft: {}, pending: {}, approved: {} },
      transitions: [
        { from: "draft", to: "pending", event: "submit" },
        { from: "pending", to: "approved", event: "approve" },
      ],
    });
    const report = check({ l4Flows: [sm], l3Blocks: [], l2Blocks: [] });
    const unreachable = report.issues.filter((i) => i.code === "UNREACHABLE_STATE");
    expect(unreachable).toHaveLength(0);
  });
});

describe("check — summary", () => {
  it("counts errors and warnings separately", () => {
    const l3 = makeL3({ contentHash: "wrong" }); // error: hash mismatch
    const l2 = makeL2({ blockRef: l3.id, sourceHash: "stale" }); // warning: drift

    const report = check({ l4Flows: [], l3Blocks: [l3], l2Blocks: [l2] });
    expect(report.summary.errors).toBeGreaterThanOrEqual(1);
    expect(report.summary.warnings).toBeGreaterThanOrEqual(1);
  });
});

// ── Additional branch-coverage tests ──

describe("check — EventGraph $state ref in 'to' direction", () => {
  it("detects MISSING_STATE_REF when $state.xxx used in 'to' endpoint", () => {
    const l3 = makeL3();
    const eg = makeEventGraph({
      state: { document: { type: "Doc", description: "d" } },
      handlers: [
        {
          id: "h1",
          event: "edit",
          steps: [{ id: "s1", action: "process" as const, blockRef: "validate-order" }],
          dataFlows: [{ from: "s1.result", to: "$state.nonExistent" }],
        },
      ],
    });
    const report = check({ l4Flows: [eg], l3Blocks: [l3], l2Blocks: [] });
    const stateIssues = report.issues.filter((i) => i.code === "MISSING_STATE_REF");
    expect(stateIssues).toHaveLength(1);
    expect(stateIssues[0].message).toContain("nonExistent");
  });
});

describe("check — EventGraph dataFlow format", () => {
  it("detects INVALID_DATAFLOW_FORMAT in EventGraph handler (no dot)", () => {
    const l3 = makeL3();
    const eg = makeEventGraph({
      handlers: [
        {
          id: "h1",
          event: "edit",
          steps: [{ id: "s1", action: "process" as const, blockRef: "validate-order" }],
          dataFlows: [{ from: "bad-format", to: "s1.request" }],
        },
      ],
    });
    const report = check({ l4Flows: [eg], l3Blocks: [l3], l2Blocks: [] });
    const fmtIssues = report.issues.filter((i) => i.code === "INVALID_DATAFLOW_FORMAT");
    expect(fmtIssues).toHaveLength(1);
    expect(fmtIssues[0].message).toContain("bad-format");
  });
});

describe("check — Flow dataFlow step ref", () => {
  it("detects MISSING_STEP_REF when dataFlow references non-existent step", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [{ id: "s1", action: "process" as const, blockRef: "validate-order" }],
      dataFlows: [{ from: "nonExistentStep.result", to: "s1.request" }],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const stepRefIssues = report.issues.filter((i) => i.code === "MISSING_STEP_REF");
    expect(stepRefIssues).toHaveLength(1);
    expect(stepRefIssues[0].message).toContain("nonExistentStep");
    // format is valid (has dot), so no INVALID_DATAFLOW_FORMAT
    const fmtIssues = report.issues.filter((i) => i.code === "INVALID_DATAFLOW_FORMAT");
    expect(fmtIssues).toHaveLength(0);
  });
});

describe("check — StateMachine onExit ref", () => {
  it("detects missing blockRef in onExit", () => {
    const sm = makeStateMachine({
      states: {
        draft: {},
        pending: { onExit: { blockRef: "non-existent" } },
      },
      transitions: [{ from: "draft", to: "pending", event: "submit" }],
    });
    const report = check({ l4Flows: [sm], l3Blocks: [], l2Blocks: [] });
    const refIssues = report.issues.filter(
      (i) => i.code === "MISSING_BLOCK_REF" && i.layer === "l4",
    );
    expect(refIssues).toHaveLength(1);
    expect(refIssues[0].message).toContain("non-existent");
    expect(refIssues[0].message).toContain("onExit");
  });
});

describe("check — multiple parallel branch issues", () => {
  it("reports MISSING_STEP_REF for each invalid branch independently", () => {
    const l3 = makeL3();
    const l4 = makeL4({
      steps: [{ id: "p1", action: "parallel" as const, branches: ["ghost1", "ghost2"] }],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const stepRefIssues = report.issues.filter((i) => i.code === "MISSING_STEP_REF");
    expect(stepRefIssues).toHaveLength(2);
    const messages = stepRefIssues.map((i) => i.message);
    expect(messages.some((m) => m.includes("ghost1"))).toBe(true);
    expect(messages.some((m) => m.includes("ghost2"))).toBe(true);
  });
});

describe("check — mixed L4 variants", () => {
  it("validates Flow + EventGraph + StateMachine simultaneously", () => {
    const l3 = makeL3();
    const flow = makeL4();
    const eg = makeEventGraph();
    const sm = makeStateMachine();
    const report = check({ l4Flows: [flow, eg, sm], l3Blocks: [l3], l2Blocks: [] });
    // All three are valid — no issues
    expect(report.issues).toHaveLength(0);
  });
});

describe("check — EventGraph edge cases", () => {
  it("handles EventGraph with empty handlers array", () => {
    const eg = makeEventGraph({ handlers: [] });
    // Should not crash; EMPTY_STATE warning expected since state has one key but no handlers
    const report = check({ l4Flows: [eg], l3Blocks: [], l2Blocks: [] });
    // No NEXT_CYCLE or ORPHAN_STEP since there are no steps
    const cycleIssues = report.issues.filter((i) => i.code === "NEXT_CYCLE");
    const orphanIssues = report.issues.filter((i) => i.code === "ORPHAN_STEP");
    expect(cycleIssues).toHaveLength(0);
    expect(orphanIssues).toHaveLength(0);
  });
});

describe("check — EventGraph multi-handler cycle", () => {
  it("detects cycle in one handler while other handler is clean", () => {
    const l3 = makeL3();
    const eg = makeEventGraph({
      handlers: [
        {
          id: "h1-cyclic",
          event: "edit",
          steps: [
            { id: "a1", action: "process" as const, blockRef: "validate-order", next: "a2" },
            { id: "a2", action: "process" as const, blockRef: "validate-order", next: "a1" },
          ],
          dataFlows: [],
        },
        {
          id: "h2-clean",
          event: "save",
          steps: [
            { id: "b1", action: "process" as const, blockRef: "validate-order", next: "b2" },
            { id: "b2", action: "process" as const, blockRef: "validate-order", next: null },
          ],
          dataFlows: [],
        },
      ],
    });
    const report = check({ l4Flows: [eg], l3Blocks: [l3], l2Blocks: [] });
    const cycleIssues = report.issues.filter((i) => i.code === "NEXT_CYCLE");
    expect(cycleIssues).toHaveLength(1);
    expect(cycleIssues[0].message).toContain("h1-cyclic");
  });
});

describe("check — orphan detection via waitFor", () => {
  it("steps reachable via waitFor are not orphans", () => {
    const l3 = makeL3();
    // w1 is the entry step (steps[0]); it waits for s1, making s1 reachable.
    // Neither step should be flagged as orphan.
    const l4 = makeL4({
      steps: [
        { id: "w1", action: "wait" as const, waitFor: ["s1"] },
        { id: "s1", action: "process" as const, blockRef: "validate-order" },
      ],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const orphanIssues = report.issues.filter((i) => i.code === "ORPHAN_STEP");
    expect(orphanIssues).toHaveLength(0);
  });
});

describe("check — empty steps", () => {
  it("flow with empty steps produces no graph structure issues", () => {
    const l3 = makeL3();
    const l4 = makeL4({ steps: [] });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const cycleIssues = report.issues.filter((i) => i.code === "NEXT_CYCLE");
    const orphanIssues = report.issues.filter((i) => i.code === "ORPHAN_STEP");
    expect(cycleIssues).toHaveLength(0);
    expect(orphanIssues).toHaveLength(0);
  });
});

describe("check — SOURCE_DRIFT edge cases", () => {
  it("skips SOURCE_DRIFT when L3 not found for blockRef", () => {
    // L2 references a blockRef that does not exist in l3Blocks
    // checkDrift: l3HashById.get(cb.blockRef) === undefined → no SOURCE_DRIFT emitted
    // checkReferentialIntegrity will emit MISSING_BLOCK_REF instead
    const l2 = makeL2({ blockRef: "no-such-block", sourceHash: "some-hash" });
    const report = check({ l4Flows: [], l3Blocks: [], l2Blocks: [l2] });
    const sourceDrift = report.issues.filter((i) => i.code === "SOURCE_DRIFT");
    expect(sourceDrift).toHaveLength(0);
    const missingRef = report.issues.filter((i) => i.code === "MISSING_BLOCK_REF");
    expect(missingRef).toHaveLength(1);
  });
});

describe("check — multiple flows with different issues", () => {
  it("reports issues from each flow independently", () => {
    const l3 = makeL3();
    // flow1 has a MISSING_BLOCK_REF
    const flow1 = makeL4({
      id: "flow1",
      name: "Flow One",
      steps: [{ id: "s1", action: "process" as const, blockRef: "non-existent" }],
    });
    // flow2 has a NEXT_CYCLE
    const flow2 = makeL4({
      id: "flow2",
      name: "Flow Two",
      steps: [
        { id: "a", action: "process" as const, blockRef: "validate-order", next: "b" },
        { id: "b", action: "process" as const, blockRef: "validate-order", next: "a" },
      ],
    });
    const report = check({ l4Flows: [flow1, flow2], l3Blocks: [l3], l2Blocks: [] });
    const refIssues = report.issues.filter((i) => i.code === "MISSING_BLOCK_REF");
    const cycleIssues = report.issues.filter((i) => i.code === "NEXT_CYCLE");
    expect(refIssues).toHaveLength(1);
    expect(cycleIssues).toHaveLength(1);
  });
});

describe("check — dataFlow pin check skip", () => {
  it("skips MISSING_PIN when step has no blockRef (e.g., parallel step)", () => {
    const l3 = makeL3();
    // p1 is a parallel step — no blockRef. dataFlow referencing p1.somePin should not
    // emit MISSING_PIN because there is no L3 to check against.
    const l4 = makeL4({
      steps: [
        { id: "s1", action: "process" as const, blockRef: "validate-order" },
        { id: "p1", action: "parallel" as const, branches: ["s1"] },
      ],
      dataFlows: [{ from: "p1.somePin", to: "s1.request" }],
    });
    const report = check({ l4Flows: [l4], l3Blocks: [l3], l2Blocks: [] });
    const pinIssues = report.issues.filter((i) => i.code === "MISSING_PIN");
    expect(pinIssues).toHaveLength(0);
  });
});

describe("check — EventGraph regular step dataFlow", () => {
  it("detects MISSING_PIN for regular step.pin ref in EventGraph handler", () => {
    const l3 = makeL3(); // output pin is "result", input pin is "request"
    const eg = makeEventGraph({
      state: { document: { type: "Doc", description: "d" } },
      handlers: [
        {
          id: "h1",
          event: "edit",
          steps: [{ id: "s1", action: "process" as const, blockRef: "validate-order" }],
          // "nonExistentOutput" is not in l3.output
          dataFlows: [{ from: "s1.nonExistentOutput", to: "$state.document" }],
        },
      ],
    });
    const report = check({ l4Flows: [eg], l3Blocks: [l3], l2Blocks: [] });
    const pinIssues = report.issues.filter((i) => i.code === "MISSING_PIN");
    expect(pinIssues).toHaveLength(1);
    expect(pinIssues[0].message).toContain("nonExistentOutput");
  });
});
