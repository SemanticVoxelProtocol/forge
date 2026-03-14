import { describe, expect, it } from "vitest";
import { buildDesignL3Prompt } from "../prompts/design-l3.js";
import { buildDesignL4EventGraphPrompt } from "../prompts/design-l4-event-graph.js";
import { buildDesignL4StateMachinePrompt } from "../prompts/design-l4-state-machine.js";
import { buildDesignL4Prompt } from "../prompts/design-l4.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Flow } from "../../core/l4.js";
import type { L5Blueprint } from "../../core/l5.js";
import type { DesignL3Input } from "../prompts/design-l3.js";
import type { DesignL4EventGraphInput } from "../prompts/design-l4-event-graph.js";
import type { DesignL4StateMachineInput } from "../prompts/design-l4-state-machine.js";
import type { DesignL4Input } from "../prompts/design-l4.js";

// ── Fixtures ──

const baseRevision = {
  rev: 1,
  parentRev: null as number | null,
  source: { type: "init" as const },
  timestamp: "2024-01-01T00:00:00Z",
};

const makeL5 = (): L5Blueprint => ({
  id: "test-project",
  name: "Test",
  version: "0.1.0",
  intent: "Test intent",
  constraints: [],
  domains: [],
  integrations: [],
  contentHash: "abc",
  revision: baseRevision,
});

const makeL3 = (id: string): L3Block => ({
  id,
  name: `Block ${id}`,
  input: [{ name: "req", type: "Request" }],
  output: [{ name: "res", type: "Response" }],
  validate: {},
  constraints: [],
  description: "test",
  contentHash: "hash123",
  revision: baseRevision,
});

const makeFlow = (id: string, blockRefs: string[]): L4Flow => ({
  kind: "flow" as const,
  id,
  name: `Flow ${id}`,
  steps: blockRefs.map((ref, i) => ({
    id: `step-${String(i)}`,
    action: "process" as const,
    blockRef: ref,
    next: i < blockRefs.length - 1 ? `step-${String(i + 1)}` : null,
  })),
  dataFlows: [],
  contentHash: "hash456",
  revision: baseRevision,
});

// ── buildDesignL3Prompt ──

describe("buildDesignL3Prompt", () => {
  it("creates new L3 prompt when no existingBlock — contains 'Create', block id, user intent, schema example", () => {
    const flow = makeFlow("order-flow", ["validate-order"]);
    const input: DesignL3Input = {
      l4Context: { flow, stepIndex: 0 },
      userIntent: "validate incoming orders",
    };

    const result = buildDesignL3Prompt(input);

    expect(result).toContain("Create");
    expect(result).toContain("validate-order");
    expect(result).toContain("validate incoming orders");
    expect(result).toContain("validate-order");
    expect(result).toContain('"id": "validate-order"');
  });

  it("updates existing L3 prompt when existingBlock provided — contains 'Update' and existing block JSON", () => {
    const flow = makeFlow("order-flow", ["validate-order"]);
    const existing = makeL3("validate-order");
    const input: DesignL3Input = {
      l4Context: { flow, stepIndex: 0 },
      existingBlock: existing,
      userIntent: "update the validation logic",
    };

    const result = buildDesignL3Prompt(input);

    expect(result).toContain("Update");
    expect(result).toContain(JSON.stringify(existing, null, 2));
  });

  it("includes upstream neighbor context when prevBlock is provided", () => {
    const flow = makeFlow("order-flow", ["prev-block", "target-block"]);
    const prev = makeL3("prev-block");
    const input: DesignL3Input = {
      l4Context: { flow, stepIndex: 1, prevBlock: prev },
      userIntent: "design target block",
    };

    const result = buildDesignL3Prompt(input);

    expect(result).toContain("Upstream Block");
    expect(result).toContain("prev-block");
    expect(result).toContain("Response");
  });

  it("includes downstream neighbor context when nextBlock is provided", () => {
    const flow = makeFlow("order-flow", ["target-block", "next-block"]);
    const next = makeL3("next-block");
    const input: DesignL3Input = {
      l4Context: { flow, stepIndex: 0, nextBlock: next },
      userIntent: "design target block",
    };

    const result = buildDesignL3Prompt(input);

    expect(result).toContain("Downstream Block");
    expect(result).toContain("next-block");
    expect(result).toContain("Request");
  });

  it("includes both prev and next neighbor context when both are provided", () => {
    const flow = makeFlow("order-flow", ["prev-block", "target-block", "next-block"]);
    const prev = makeL3("prev-block");
    const next = makeL3("next-block");
    const input: DesignL3Input = {
      l4Context: { flow, stepIndex: 1, prevBlock: prev, nextBlock: next },
      userIntent: "design middle block",
    };

    const result = buildDesignL3Prompt(input);

    expect(result).toContain("Upstream Block");
    expect(result).toContain("Downstream Block");
    expect(result).toContain("prev-block");
    expect(result).toContain("next-block");
  });

  it("omits neighbor section entirely when no neighbors are provided", () => {
    const flow = makeFlow("order-flow", ["solo-block"]);
    const input: DesignL3Input = {
      l4Context: { flow, stepIndex: 0 },
      userIntent: "design solo block",
    };

    const result = buildDesignL3Prompt(input);

    expect(result).not.toContain("Neighbor Context");
    expect(result).not.toContain("Upstream Block");
    expect(result).not.toContain("Downstream Block");
  });

  it("uses 'unknown' as blockId when stepIndex is out of range", () => {
    const flow = makeFlow("order-flow", ["validate-order"]);
    const input: DesignL3Input = {
      l4Context: { flow, stepIndex: 99 },
      userIntent: "design some block",
    };

    const result = buildDesignL3Prompt(input);

    expect(result).toContain("unknown");
  });
});

// ── buildDesignL4Prompt ──

describe("buildDesignL4Prompt", () => {
  it("creates new flow prompt when no targetFlowId — contains 'Create', L5 overview, user intent", () => {
    const input: DesignL4Input = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "create order processing flow",
    };

    const result = buildDesignL4Prompt(input);

    expect(result).toContain("Create");
    expect(result).toContain("Test");
    expect(result).toContain("create order processing flow");
  });

  it("updates existing flow prompt when targetFlowId is set — contains 'Update'", () => {
    const input: DesignL4Input = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "update the flow",
      targetFlowId: "order-flow",
    };

    const result = buildDesignL4Prompt(input);

    expect(result).toContain("Update");
  });

  it("lists existing flows with kind and block ref count", () => {
    const flow = makeFlow("order-flow", ["block-a", "block-b"]);
    const input: DesignL4Input = {
      l5: makeL5(),
      existingFlows: [flow],
      existingBlocks: [],
      userIntent: "add another flow",
    };

    const result = buildDesignL4Prompt(input);

    expect(result).toContain("order-flow");
    expect(result).toContain("flow");
    expect(result).toContain("2");
  });

  it("lists existing L3 blocks with type signatures", () => {
    const block = makeL3("validate-order");
    const input: DesignL4Input = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [block],
      userIntent: "reuse existing block",
    };

    const result = buildDesignL4Prompt(input);

    expect(result).toContain("validate-order");
    expect(result).toContain("Request");
    expect(result).toContain("Response");
  });

  it("shows 'No existing flows' when existingFlows is empty", () => {
    const input: DesignL4Input = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "first flow",
    };

    const result = buildDesignL4Prompt(input);

    expect(result).toContain("No existing flows.");
  });

  it("shows 'No existing L3 blocks' when existingBlocks is empty", () => {
    const input: DesignL4Input = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "no blocks yet",
    };

    const result = buildDesignL4Prompt(input);

    expect(result).toContain("No existing L3 blocks.");
  });
});

// ── buildDesignL4EventGraphPrompt ──

describe("buildDesignL4EventGraphPrompt", () => {
  it("creates new EventGraph prompt when no targetId — contains 'Create', 'event-graph', examples", () => {
    const input: DesignL4EventGraphInput = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "design a chat room event graph",
    };

    const result = buildDesignL4EventGraphPrompt(input);

    expect(result).toContain("Create");
    expect(result).toContain("event-graph");
    expect(result).toContain("design a chat room event graph");
  });

  it("updates existing EventGraph when targetId is set — contains 'Update'", () => {
    const input: DesignL4EventGraphInput = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "update chat room handlers",
      targetId: "chat-room",
    };

    const result = buildDesignL4EventGraphPrompt(input);

    expect(result).toContain("Update");
  });

  it("lists existing L4 artifacts with kind and block ref count", () => {
    const flow = makeFlow("existing-flow", ["block-x"]);
    const input: DesignL4EventGraphInput = {
      l5: makeL5(),
      existingFlows: [flow],
      existingBlocks: [],
      userIntent: "add event graph alongside flow",
    };

    const result = buildDesignL4EventGraphPrompt(input);

    expect(result).toContain("existing-flow");
    expect(result).toContain("flow");
    expect(result).toContain("1");
  });

  it("contains 'EventGraph' in the section title", () => {
    const input: DesignL4EventGraphInput = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "check title",
    };

    const result = buildDesignL4EventGraphPrompt(input);

    expect(result).toContain("EventGraph");
  });

  it("contains few-shot examples (chat room and IoT sensor)", () => {
    const input: DesignL4EventGraphInput = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "needs examples",
    };

    const result = buildDesignL4EventGraphPrompt(input);

    expect(result).toContain("chat room");
    expect(result).toContain("IoT sensor");
  });
});

// ── buildDesignL4StateMachinePrompt ──

describe("buildDesignL4StateMachinePrompt", () => {
  it("creates new StateMachine prompt when no targetId — contains 'Create', 'state-machine', examples", () => {
    const input: DesignL4StateMachineInput = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "design support ticket lifecycle",
    };

    const result = buildDesignL4StateMachinePrompt(input);

    expect(result).toContain("Create");
    expect(result).toContain("state-machine");
    expect(result).toContain("design support ticket lifecycle");
  });

  it("updates existing StateMachine when targetId is set — contains 'Update'", () => {
    const input: DesignL4StateMachineInput = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "add a new transition",
      targetId: "support-ticket-lifecycle",
    };

    const result = buildDesignL4StateMachinePrompt(input);

    expect(result).toContain("Update");
  });

  it("contains 'StateMachine' in the section title", () => {
    const input: DesignL4StateMachineInput = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "check title",
    };

    const result = buildDesignL4StateMachinePrompt(input);

    expect(result).toContain("StateMachine");
  });

  it("contains few-shot examples (support ticket and blog post publishing)", () => {
    const input: DesignL4StateMachineInput = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [],
      userIntent: "needs examples",
    };

    const result = buildDesignL4StateMachinePrompt(input);

    expect(result).toContain("Support ticket");
    expect(result).toContain("publishing");
  });

  it("lists existing L3 blocks with type signatures", () => {
    const block = makeL3("check-budget");
    const input: DesignL4StateMachineInput = {
      l5: makeL5(),
      existingFlows: [],
      existingBlocks: [block],
      userIntent: "reuse guard block",
    };

    const result = buildDesignL4StateMachinePrompt(input);

    expect(result).toContain("check-budget");
    expect(result).toContain("Request");
    expect(result).toContain("Response");
  });
});
