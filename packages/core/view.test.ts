// view.ts 渲染函数的单元测试

import { describe, it, expect } from "vitest";
import {
  viewL5Overview,
  viewL4Overview,
  viewL4Detail,
  viewL3Overview,
  viewL3Detail,
  viewL2Overview,
  viewL2Detail,
} from "./view.js";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4EventGraph, L4Flow, L4StateMachine } from "./l4.js";
import type { L5Blueprint } from "./l5.js";
import type { ArtifactVersion } from "./version.js";

// ── fixtures ──

const REV1: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00Z",
};

const l5: L5Blueprint = {
  id: "my-project",
  name: "My Project",
  version: "0.1.0",
  intent: "An order management system",
  constraints: ["Must handle 1000 orders/sec", "99.9% uptime"],
  domains: [
    { name: "order", description: "Order processing", dependencies: [] },
    { name: "payment", description: "Payment handling", dependencies: ["order"] },
  ],
  integrations: [
    { name: "stripe", type: "api", description: "Payment gateway" },
    { name: "postgres", type: "database", description: "Primary DB" },
  ],
  revision: REV1,
  contentHash: "abc123",
};

const l3Block: L3Block = {
  id: "validate-order",
  name: "Validate Order",
  input: [{ name: "request", type: "OrderRequest" }],
  output: [{ name: "result", type: "ValidationResult" }],
  validate: { request: "required", "request.items": "non-empty array" },
  constraints: ["output.result.valid iff output.result.errors is empty"],
  description: "Validate the order request against business rules",
  revision: REV1,
  contentHash: "l3hash1",
};

const l3Block2: L3Block = {
  id: "calc-total",
  name: "Calculate Total",
  input: [
    { name: "items", type: "OrderItem[]" },
    { name: "discount", type: "Discount", optional: true },
  ],
  output: [{ name: "total", type: "Money" }],
  validate: {},
  constraints: [],
  description: "Sum item prices and apply discount",
  revision: REV1,
  contentHash: "l3hash2",
};

const l4Flow: L4Flow = {
  id: "create-order",
  name: "Create Order",
  trigger: { type: "http", config: { method: "POST", path: "/orders" } },
  steps: [
    { id: "s0", action: "process", blockRef: "validate-order", next: "s1" },
    { id: "s1", action: "process", blockRef: "calc-total", next: null },
  ],
  dataFlows: [{ from: "s0.result", to: "s1.items" }],
  revision: REV1,
  contentHash: "l4hash1",
};

const l4FlowNoTrigger: L4Flow = {
  id: "notify-user",
  name: "Notify User",
  steps: [{ id: "s0", action: "process", blockRef: "validate-order", next: null }],
  dataFlows: [],
  revision: REV1,
  contentHash: "l4hash2",
};

const l2Block: L2CodeBlock = {
  id: "validate-order",
  blockRef: "validate-order",
  language: "typescript",
  files: ["src/validate-order.ts"],
  sourceHash: "l3hash1",
  contentHash: "l2hash1",
  revision: REV1,
};

const l2BlockDrift: L2CodeBlock = {
  id: "calc-total",
  blockRef: "calc-total",
  language: "typescript",
  files: ["src/calc-total.ts", "src/calc-total.test.ts"],
  sourceHash: "old-hash",
  contentHash: "l2hash2",
  revision: REV1,
};

// ── L5 tests ──

describe("viewL5Overview", () => {
  it("renders full L5 with all sections", () => {
    const output = viewL5Overview(l5);
    expect(output).toContain("My Project v0.1.0");
    expect(output).toContain("intent: An order management system");
    expect(output).toContain("constraints:");
    expect(output).toContain("• Must handle 1000 orders/sec");
    expect(output).toContain("domains (2):");
    expect(output).toContain("order");
    expect(output).toContain("payment → order");
    expect(output).toContain("integrations (2):");
    expect(output).toContain("stripe [api]");
  });

  it("omits empty sections", () => {
    const minimal: L5Blueprint = {
      id: "x",
      name: "X",
      version: "1.0",
      intent: "test",
      constraints: [],
      domains: [],
      integrations: [],
      revision: REV1,
      contentHash: "h",
    };
    const output = viewL5Overview(minimal);
    expect(output).not.toContain("constraints:");
    expect(output).not.toContain("domains");
    expect(output).not.toContain("integrations");
  });
});

// ── L4 tests ──

describe("viewL4Overview", () => {
  it("renders flow list with trigger and chain", () => {
    const output = viewL4Overview([l4Flow, l4FlowNoTrigger]);
    expect(output).toContain("L4 Logic Chains (2 artifacts)");
    expect(output).toContain("create-order [flow]  POST /orders");
    expect(output).toContain("validate-order → calc-total");
    expect(output).toContain("notify-user");
  });

  it("renders empty list", () => {
    const output = viewL4Overview([]);
    expect(output).toContain("L4 Logic Chains (0 artifacts)");
  });
});

describe("viewL4Detail", () => {
  it("renders full flow detail with navigation", () => {
    const output = viewL4Detail(l4Flow, [l3Block, l3Block2], l5);
    expect(output).toContain("create-order");
    expect(output).toContain("trigger:  POST /orders");
    expect(output).toContain("steps (2):");
    expect(output).toContain("[s0] process validate-order");
    expect(output).toContain("[s1] process calc-total");
    expect(output).toContain("dataFlows:");
    expect(output).toContain("s0.result → s1.items");
    expect(output).toContain("↑ L5: My Project");
    expect(output).toContain("↓ L3 blocks (2):");
    expect(output).toContain("validate-order:");
    expect(output).toContain("calc-total:");
  });

  it("shows [not found] for missing L3 refs", () => {
    const output = viewL4Detail(l4Flow, [], l5);
    expect(output).toContain("validate-order: [not found]");
  });

  it("omits L5 nav when not provided", () => {
    const output = viewL4Detail(l4FlowNoTrigger, [l3Block]);
    expect(output).not.toContain("↑ L5:");
  });
});

// ── EventGraph fixtures ──

const l4EventGraph: L4EventGraph = {
  kind: "event-graph",
  id: "doc-collab",
  name: "Document Collaboration",
  state: {
    document: { type: "CRDTDocument", description: "Shared document state" },
    cursors: { type: "CursorMap", description: "Active user cursor positions" },
  },
  handlers: [
    {
      id: "on-local-edit",
      event: "user.local_edit",
      steps: [
        { id: "validate", action: "process", blockRef: "validate-order", next: "apply" },
        { id: "apply", action: "process", blockRef: "calc-total", next: null },
      ],
      dataFlows: [
        { from: "$event.operation", to: "validate.input" },
        { from: "validate.result", to: "apply.input" },
      ],
    },
  ],
  revision: REV1,
  contentHash: "eghash1",
};

const l4StateMachine: L4StateMachine = {
  kind: "state-machine",
  id: "po-lifecycle",
  name: "Purchase Order Lifecycle",
  entity: "PurchaseOrder",
  initialState: "draft",
  states: {
    draft: {},
    pending_approval: { onEntry: { blockRef: "validate-order" } },
    approved: { onEntry: { blockRef: "calc-total" } },
    rejected: {},
  },
  transitions: [
    { from: "draft", to: "pending_approval", event: "submit" },
    { from: "pending_approval", to: "approved", event: "approve", guard: "validate-order" },
    { from: "pending_approval", to: "rejected", event: "reject" },
  ],
  revision: REV1,
  contentHash: "smhash1",
};

// ── EventGraph view tests ──

describe("viewL4Overview — EventGraph", () => {
  it("renders event-graph with state and handler info", () => {
    const output = viewL4Overview([l4EventGraph]);
    expect(output).toContain("L4 Logic Chains (1 artifacts)");
    expect(output).toContain("doc-collab [event-graph]");
    expect(output).toContain("state: 2 keys");
    expect(output).toContain("handlers: 1");
    expect(output).toContain("events: user.local_edit");
  });
});

describe("viewL4Detail — EventGraph", () => {
  it("renders event-graph detail with state and handlers", () => {
    const output = viewL4Detail(l4EventGraph, [l3Block, l3Block2], l5);
    expect(output).toContain("doc-collab");
    expect(output).toContain("kind: event-graph");
    expect(output).toContain("state (2 keys):");
    expect(output).toContain("document: CRDTDocument");
    expect(output).toContain("cursors: CursorMap");
    expect(output).toContain("handlers (1):");
    expect(output).toContain('[on-local-edit] on "user.local_edit"');
    expect(output).toContain("↑ L5: My Project");
    expect(output).toContain("↓ L3 blocks");
  });
});

// ── StateMachine view tests ──

describe("viewL4Overview — StateMachine", () => {
  it("renders state-machine with state and transition counts", () => {
    const output = viewL4Overview([l4StateMachine]);
    expect(output).toContain("L4 Logic Chains (1 artifacts)");
    expect(output).toContain("po-lifecycle [state-machine]");
    expect(output).toContain("states: 4");
    expect(output).toContain("transitions: 3");
    expect(output).toContain("initial: draft");
  });
});

describe("viewL4Detail — StateMachine", () => {
  it("renders state-machine detail with states and transitions", () => {
    const output = viewL4Detail(l4StateMachine, [l3Block, l3Block2], l5);
    expect(output).toContain("po-lifecycle");
    expect(output).toContain("kind: state-machine");
    expect(output).toContain("entity: PurchaseOrder");
    expect(output).toContain("initialState: draft");
    expect(output).toContain("states (4):");
    expect(output).toContain("pending_approval");
    expect(output).toContain("onEntry");
    expect(output).toContain("transitions (3):");
    expect(output).toContain('draft → pending_approval  on "submit"');
    expect(output).toContain("[guard: validate-order]");
    expect(output).toContain("↑ L5: My Project");
    expect(output).toContain("↓ L3 blocks");
  });
});

describe("viewL4Overview — mixed variants", () => {
  it("renders all three variant types together", () => {
    const output = viewL4Overview([l4Flow, l4EventGraph, l4StateMachine]);
    expect(output).toContain("L4 Logic Chains (3 artifacts)");
    expect(output).toContain("create-order [flow]");
    expect(output).toContain("doc-collab [event-graph]");
    expect(output).toContain("po-lifecycle [state-machine]");
  });
});

// ── L3 tests ──

describe("viewL3Overview", () => {
  it("renders block list with signatures and stats", () => {
    const output = viewL3Overview([l3Block, l3Block2]);
    expect(output).toContain("L3 Logic Blocks (2 blocks)");
    expect(output).toContain("validate-order");
    expect(output).toContain("(OrderRequest) → ValidationResult");
    expect(output).toContain("validate: 2");
    expect(output).toContain("calc-total");
    expect(output).toContain("(OrderItem[], Discount) → Money");
  });
});

describe("viewL3Detail", () => {
  it("renders full block detail with pins", () => {
    const output = viewL3Detail(l3Block, [l4Flow], [l2Block]);
    expect(output).toContain("validate-order");
    expect(output).toContain("pins:");
    expect(output).toContain("in:  request: OrderRequest  [required]");
    expect(output).toContain("out: result: ValidationResult");
    expect(output).toContain("validate:");
    expect(output).toContain("request");
    expect(output).toContain("constraints:");
    expect(output).toContain("• output.result.valid iff output.result.errors is empty");
    expect(output).toContain("description:");
    expect(output).toContain("Validate the order request against business rules");
  });

  it("shows L4 back-references", () => {
    const output = viewL3Detail(l3Block, [l4Flow], []);
    expect(output).toContain("↑ L4: used in create-order [flow]");
  });

  it("shows L2 sync status", () => {
    const output = viewL3Detail(l3Block, [], [l2Block]);
    expect(output).toContain("↓ L2: validate-order [synced ✓]");
  });

  it("shows L2 drift status", () => {
    const output = viewL3Detail(l3Block2, [], [l2BlockDrift]);
    expect(output).toContain("↓ L2: calc-total [drift ⚠]");
  });

  it("shows optional pin marker", () => {
    const output = viewL3Detail(l3Block2, [], []);
    expect(output).toContain("[optional]");
    expect(output).toContain("[required]");
  });
});

// ── L2 tests ──

describe("viewL2Overview", () => {
  it("renders code block list with sync status", () => {
    const output = viewL2Overview([l2Block, l2BlockDrift], [l3Block, l3Block2]);
    expect(output).toContain("L2 Code Blocks (2 blocks)");
    expect(output).toContain("validate-order  [typescript] src/validate-order.ts  (synced)");
    expect(output).toContain("calc-total  [typescript] 2 files  (drift)");
  });
});

describe("viewL2Detail", () => {
  it("renders full code block detail", () => {
    const output = viewL2Detail(l2Block, [l3Block]);
    expect(output).toContain("validate-order");
    expect(output).toContain("language: typescript");
    expect(output).toContain("blockRef: validate-order");
    expect(output).toContain("status:   synced ✓");
    expect(output).toContain("files:");
    expect(output).toContain("src/validate-order.ts");
    expect(output).toContain("↑ L3: validate-order");
    expect(output).toContain("↓ L1: src/validate-order.ts");
  });

  it("shows drift status when hashes differ", () => {
    const output = viewL2Detail(l2BlockDrift, [l3Block2]);
    expect(output).toContain("status:   drift ⚠");
  });

  it("shows drift when L3 not found", () => {
    const output = viewL2Detail(l2Block, []);
    expect(output).toContain("drift ⚠");
    expect(output).not.toContain("↑ L3:");
  });
});
