// L4 variant 工具函数测试：extractBlockRefs, getL4Kind

import { describe, it, expect } from "vitest";
import { extractBlockRefs, getL4Kind } from "./l4.js";
import type { L4EventGraph, L4Flow, L4StateMachine } from "./l4.js";
import type { ArtifactVersion } from "./version.js";

const REV1: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00Z",
};

// ── getL4Kind ──

describe("getL4Kind", () => {
  it("returns 'flow' for L4Flow with explicit kind", () => {
    const flow: L4Flow = {
      kind: "flow",
      id: "f1",
      name: "F1",
      steps: [],
      dataFlows: [],
      revision: REV1,
      contentHash: "h",
    };
    expect(getL4Kind(flow)).toBe("flow");
  });

  it("returns 'flow' for L4Flow without kind (backward compat)", () => {
    const flow: L4Flow = {
      id: "f1",
      name: "F1",
      steps: [],
      dataFlows: [],
      revision: REV1,
      contentHash: "h",
    };
    expect(getL4Kind(flow)).toBe("flow");
  });

  it("returns 'event-graph' for L4EventGraph", () => {
    const eg: L4EventGraph = {
      kind: "event-graph",
      id: "eg1",
      name: "EG1",
      state: {},
      handlers: [],
      revision: REV1,
      contentHash: "h",
    };
    expect(getL4Kind(eg)).toBe("event-graph");
  });

  it("returns 'state-machine' for L4StateMachine", () => {
    const sm: L4StateMachine = {
      kind: "state-machine",
      id: "sm1",
      name: "SM1",
      entity: "Order",
      initialState: "draft",
      states: { draft: {} },
      transitions: [],
      revision: REV1,
      contentHash: "h",
    };
    expect(getL4Kind(sm)).toBe("state-machine");
  });
});

// ── extractBlockRefs ──

describe("extractBlockRefs", () => {
  it("extracts blockRefs from Flow steps", () => {
    const flow: L4Flow = {
      id: "f1",
      name: "F1",
      steps: [
        { id: "s1", action: "process", blockRef: "validate-order", next: "s2" },
        { id: "s2", action: "process", blockRef: "calc-total", next: null },
        { id: "s3", action: "call", flowRef: "other-flow" },
      ],
      dataFlows: [],
      revision: REV1,
      contentHash: "h",
    };
    const refs = extractBlockRefs(flow);
    expect(refs).toContain("validate-order");
    expect(refs).toContain("calc-total");
    expect(refs).not.toContain("other-flow");
    expect(refs).toHaveLength(2);
  });

  it("deduplicates blockRefs in Flow", () => {
    const flow: L4Flow = {
      id: "f1",
      name: "F1",
      steps: [
        { id: "s1", action: "process", blockRef: "validate-order" },
        { id: "s2", action: "process", blockRef: "validate-order" },
      ],
      dataFlows: [],
      revision: REV1,
      contentHash: "h",
    };
    expect(extractBlockRefs(flow)).toHaveLength(1);
  });

  it("extracts blockRefs from EventGraph handlers", () => {
    const eg: L4EventGraph = {
      kind: "event-graph",
      id: "eg1",
      name: "EG1",
      state: { doc: { type: "Doc", description: "d" } },
      handlers: [
        {
          id: "h1",
          event: "edit",
          steps: [
            { id: "s1", action: "process", blockRef: "validate-edit" },
            { id: "s2", action: "process", blockRef: "apply-op" },
          ],
          dataFlows: [],
        },
        {
          id: "h2",
          event: "sync",
          steps: [{ id: "s1", action: "process", blockRef: "merge-remote" }],
          dataFlows: [],
        },
      ],
      revision: REV1,
      contentHash: "h",
    };
    const refs = extractBlockRefs(eg);
    expect(refs).toContain("validate-edit");
    expect(refs).toContain("apply-op");
    expect(refs).toContain("merge-remote");
    expect(refs).toHaveLength(3);
  });

  it("extracts blockRefs from StateMachine states and transitions", () => {
    const sm: L4StateMachine = {
      kind: "state-machine",
      id: "sm1",
      name: "SM1",
      entity: "PO",
      initialState: "draft",
      states: {
        draft: {},
        pending: { onEntry: { blockRef: "notify-approver" } },
        approved: {
          onEntry: { blockRef: "create-record" },
          onExit: { blockRef: "cleanup" },
        },
      },
      transitions: [
        { from: "draft", to: "pending", event: "submit" },
        { from: "pending", to: "approved", event: "approve", guard: "check-budget" },
      ],
      revision: REV1,
      contentHash: "h",
    };
    const refs = extractBlockRefs(sm);
    expect(refs).toContain("notify-approver");
    expect(refs).toContain("create-record");
    expect(refs).toContain("cleanup");
    expect(refs).toContain("check-budget");
    expect(refs).toHaveLength(4);
  });

  it("returns empty array for Flow with no blockRefs", () => {
    const flow: L4Flow = {
      id: "f1",
      name: "F1",
      steps: [{ id: "s1", action: "call", flowRef: "other" }],
      dataFlows: [],
      revision: REV1,
      contentHash: "h",
    };
    expect(extractBlockRefs(flow)).toHaveLength(0);
  });

  it("returns empty array for StateMachine with no blockRefs", () => {
    const sm: L4StateMachine = {
      kind: "state-machine",
      id: "sm1",
      name: "SM1",
      entity: "Order",
      initialState: "draft",
      states: { draft: {}, done: {} },
      transitions: [{ from: "draft", to: "done", event: "finish" }],
      revision: REV1,
      contentHash: "h",
    };
    expect(extractBlockRefs(sm)).toHaveLength(0);
  });
});
