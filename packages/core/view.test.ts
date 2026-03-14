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

// ── L5 edge cases ──

describe("viewL5Overview — edge cases", () => {
  it("L5 with empty constraints, domains, integrations omits those sections", () => {
    const bp: L5Blueprint = {
      id: "empty-bp",
      name: "Empty BP",
      version: "1.0.0",
      intent: "A minimal blueprint",
      constraints: [],
      domains: [],
      integrations: [],
      revision: REV1,
      contentHash: "h1",
    };
    const output = viewL5Overview(bp);
    expect(output).toContain("Empty BP v1.0.0");
    expect(output).toContain("intent: A minimal blueprint");
    expect(output).not.toContain("constraints:");
    expect(output).not.toContain("domains");
    expect(output).not.toContain("integrations");
  });

  it("L5 with very long intent renders without truncation", () => {
    const longIntent = "A".repeat(120);
    const bp: L5Blueprint = {
      id: "long-intent",
      name: "Long Intent",
      version: "1.0.0",
      intent: longIntent,
      constraints: [],
      domains: [],
      integrations: [],
      revision: REV1,
      contentHash: "h2",
    };
    const output = viewL5Overview(bp);
    expect(output).toContain(`intent: ${longIntent}`);
  });

  it("L5 with multiple domains shows dependency arrows", () => {
    const bp: L5Blueprint = {
      id: "multi-domain",
      name: "Multi Domain",
      version: "1.0.0",
      intent: "test",
      constraints: [],
      domains: [
        { name: "alpha", description: "first", dependencies: [] },
        { name: "beta", description: "second", dependencies: ["alpha"] },
        { name: "gamma", description: "third", dependencies: ["alpha", "beta"] },
      ],
      integrations: [],
      revision: REV1,
      contentHash: "h3",
    };
    const output = viewL5Overview(bp);
    expect(output).toContain("domains (3):");
    expect(output).toContain("  alpha");
    expect(output).toContain("  beta → alpha");
    expect(output).toContain("  gamma → alpha, beta");
  });

  it("L5 with all integration types renders each type tag", () => {
    const bp: L5Blueprint = {
      id: "all-integrations",
      name: "All Integrations",
      version: "1.0.0",
      intent: "test",
      constraints: [],
      domains: [],
      integrations: [
        { name: "pg", type: "database", description: "db" },
        { name: "ext-api", type: "api", description: "api" },
        { name: "rabbit", type: "messageQueue", description: "mq" },
        { name: "s3", type: "storage", description: "blob" },
      ],
      revision: REV1,
      contentHash: "h4",
    };
    const output = viewL5Overview(bp);
    expect(output).toContain("integrations (4):");
    expect(output).toContain("pg [database]");
    expect(output).toContain("ext-api [api]");
    expect(output).toContain("rabbit [messageQueue]");
    expect(output).toContain("s3 [storage]");
  });

  it("L5 domain with dependencies on other domains shows arrows", () => {
    const bp: L5Blueprint = {
      id: "dep-domain",
      name: "Dep Domain",
      version: "1.0.0",
      intent: "test",
      constraints: [],
      domains: [{ name: "shipping", description: "shipping", dependencies: ["order", "payment"] }],
      integrations: [],
      revision: REV1,
      contentHash: "h5",
    };
    const output = viewL5Overview(bp);
    expect(output).toContain("shipping → order, payment");
  });
});

// ── L4 Overview edge cases ──

describe("viewL4Overview — edge cases", () => {
  it("flow with trigger field is shown", () => {
    const output = viewL4Overview([l4Flow]);
    expect(output).toContain("create-order [flow]  POST /orders");
  });

  it("flow with no trigger — trigger section omitted from overview line", () => {
    const output = viewL4Overview([l4FlowNoTrigger]);
    expect(output).toContain("notify-user [flow]");
    expect(output).not.toContain("POST");
    expect(output).not.toContain("trigger:");
  });

  it("flow with multiple steps shows chain", () => {
    const output = viewL4Overview([l4Flow]);
    expect(output).toContain("validate-order → calc-total");
  });

  it("mixed L4 variants overview — flow, event-graph, state-machine together", () => {
    const output = viewL4Overview([l4Flow, l4EventGraph, l4StateMachine]);
    expect(output).toContain("L4 Logic Chains (3 artifacts)");
    expect(output).toContain("create-order [flow]");
    expect(output).toContain("doc-collab [event-graph]");
    expect(output).toContain("po-lifecycle [state-machine]");
  });

  it("StateMachine overview shows entity name and state count", () => {
    const output = viewL4Overview([l4StateMachine]);
    expect(output).toContain("po-lifecycle [state-machine]");
    expect(output).toContain("states: 4");
    expect(output).toContain("initial: draft");
  });
});

// ── L4 Detail edge cases ──

describe("viewL4Detail — edge cases", () => {
  it("flow detail without L5 — no '↑ L5:' line", () => {
    const output = viewL4Detail(l4Flow, [l3Block, l3Block2]);
    expect(output).not.toContain("↑ L5:");
  });

  it("flow detail with L5 — shows '↑ L5:' line", () => {
    const output = viewL4Detail(l4Flow, [l3Block, l3Block2], l5);
    expect(output).toContain("↑ L5: My Project");
  });

  it("flow with missing L3 block refs — shows [not found]", () => {
    const output = viewL4Detail(l4Flow, [], l5);
    expect(output).toContain("validate-order: [not found]");
    expect(output).toContain("calc-total: [not found]");
  });

  it("flow with no dataFlows — dataFlows section omitted", () => {
    const output = viewL4Detail(l4FlowNoTrigger, [l3Block]);
    expect(output).not.toContain("dataFlows:");
  });

  it("EventGraph detail shows state fields", () => {
    const output = viewL4Detail(l4EventGraph, [l3Block, l3Block2]);
    expect(output).toContain("state (2 keys):");
    expect(output).toContain("document: CRDTDocument");
    expect(output).toContain("cursors: CursorMap");
  });

  it("EventGraph detail shows handler structure", () => {
    const output = viewL4Detail(l4EventGraph, [l3Block, l3Block2]);
    expect(output).toContain("handlers (1):");
    expect(output).toContain('[on-local-edit] on "user.local_edit"');
  });

  it("StateMachine detail shows transitions", () => {
    const output = viewL4Detail(l4StateMachine, [l3Block, l3Block2]);
    expect(output).toContain("transitions (3):");
    expect(output).toContain('draft → pending_approval  on "submit"');
    expect(output).toContain("[guard: validate-order]");
  });
});

// ── L3 Overview edge cases ──

describe("viewL3Overview — edge cases", () => {
  it("empty blocks array produces empty body", () => {
    const output = viewL3Overview([]);
    expect(output).toContain("L3 Logic Blocks (0 blocks)");
    // no block lines beyond the header
    const lines = output.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(2); // header + separator
  });

  it("block with very long description — truncated at 40 chars in overview", () => {
    const longDesc = "B".repeat(80);
    const block: L3Block = {
      id: "long-desc-block",
      name: "Long Desc",
      input: [],
      output: [],
      validate: {},
      constraints: [],
      description: longDesc,
      revision: REV1,
      contentHash: "ldh",
    };
    const output = viewL3Overview([block]);
    expect(output).toContain("...");
    expect(output).not.toContain(longDesc);
  });

  it("block with empty description — no crash and renders cleanly", () => {
    const block: L3Block = {
      id: "empty-desc",
      name: "Empty Desc",
      input: [],
      output: [],
      validate: {},
      constraints: [],
      description: "",
      revision: REV1,
      contentHash: "edh",
    };
    const output = viewL3Overview([block]);
    expect(output).toContain("empty-desc");
    expect(output).not.toContain("...");
  });
});

// ── L3 Detail edge cases ──

describe("viewL3Detail — edge cases", () => {
  const minimalBlock: L3Block = {
    id: "minimal-block",
    name: "Minimal",
    input: [],
    output: [],
    validate: {},
    constraints: [],
    description: "A minimal block",
    revision: REV1,
    contentHash: "minh",
  };

  it("block with no input pins — no 'in:' lines", () => {
    const output = viewL3Detail(minimalBlock, [], []);
    expect(output).not.toContain("in:");
  });

  it("block with no output pins — no 'out:' lines", () => {
    const output = viewL3Detail(minimalBlock, [], []);
    expect(output).not.toContain("out:");
  });

  it("block with optional pins — shows '?' marker", () => {
    const output = viewL3Detail(l3Block2, [], []);
    expect(output).toContain("[optional]");
    expect(output).toContain("[required]");
  });

  it("block with no referencing L4 flows — no '↑ L4:' line", () => {
    const output = viewL3Detail(minimalBlock, [l4Flow], []);
    expect(output).not.toContain("↑ L4:");
  });

  it("block with paired L2 in sync — shows 'synced ✓'", () => {
    const output = viewL3Detail(l3Block, [], [l2Block]);
    expect(output).toContain("↓ L2: validate-order [synced ✓]");
  });

  it("block with paired L2 in drift — shows 'drift ⚠'", () => {
    const output = viewL3Detail(l3Block2, [], [l2BlockDrift]);
    expect(output).toContain("↓ L2: calc-total [drift ⚠]");
  });

  it("block with no paired L2 — no '↓ L2:' line", () => {
    const output = viewL3Detail(l3Block, [], []);
    expect(output).not.toContain("↓ L2:");
  });
});

// ── L2 Overview edge cases ──

describe("viewL2Overview — edge cases", () => {
  it("L2 with single file shows path directly", () => {
    const output = viewL2Overview([l2Block], [l3Block]);
    expect(output).toContain("src/validate-order.ts");
    expect(output).not.toContain("1 files");
  });

  it("L2 with multiple files shows count", () => {
    const output = viewL2Overview([l2BlockDrift], [l3Block2]);
    expect(output).toContain("2 files");
  });

  it("L2 with zero files shows '0 files'", () => {
    const zeroFiles: L2CodeBlock = {
      id: "no-files",
      blockRef: "validate-order",
      language: "typescript",
      files: [],
      sourceHash: "l3hash1",
      contentHash: "zfh",
      revision: REV1,
    };
    const output = viewL2Overview([zeroFiles], [l3Block]);
    expect(output).toContain("0 files");
  });

  it("L2 where L3 not found — shows 'drift'", () => {
    const output = viewL2Overview([l2Block], []);
    expect(output).toContain("(drift)");
  });
});

// ── L2 Detail edge cases ──

describe("viewL2Detail — edge cases", () => {
  it("L2 detail with L3 found — shows signature in '↑ L3:' line", () => {
    const output = viewL2Detail(l2Block, [l3Block]);
    expect(output).toContain("↑ L3: validate-order");
    expect(output).toContain("(OrderRequest) → ValidationResult");
  });

  it("L2 detail with L3 not found — shows 'drift' status and no '↑ L3:' line", () => {
    const output = viewL2Detail(l2Block, []);
    expect(output).toContain("status:   drift ⚠");
    expect(output).not.toContain("↑ L3:");
  });

  it("L2 with empty files array — files section is empty", () => {
    const emptyFiles: L2CodeBlock = {
      id: "empty-files",
      blockRef: "validate-order",
      language: "typescript",
      files: [],
      sourceHash: "l3hash1",
      contentHash: "efh",
      revision: REV1,
    };
    const output = viewL2Detail(emptyFiles, [l3Block]);
    expect(output).toContain("files:");
    expect(output).toContain("status:   synced ✓");
  });
});

// ── viewL4Detail — non-http triggers ──

describe("viewL4Detail — non-http triggers", () => {
  it("schedule trigger renders as [schedule]", () => {
    const flow: L4Flow = {
      id: "scheduled-job",
      name: "Scheduled Job",
      trigger: { type: "schedule", config: { cron: "* * * * *" } },
      steps: [{ id: "s0", action: "process", blockRef: "validate-order", next: null }],
      dataFlows: [],
      revision: REV1,
      contentHash: "sch1",
    };
    const output = viewL4Detail(flow, [l3Block]);
    expect(output).toContain("[schedule]");
  });

  it("event trigger renders as [event]", () => {
    const flow: L4Flow = {
      id: "event-handler",
      name: "Event Handler",
      trigger: { type: "event", config: { topic: "orders" } },
      steps: [{ id: "s0", action: "process", blockRef: "validate-order", next: null }],
      dataFlows: [],
      revision: REV1,
      contentHash: "evt1",
    };
    const output = viewL4Detail(flow, [l3Block]);
    expect(output).toContain("[event]");
  });
});

// ── viewL4Detail — call, parallel, wait steps ──

describe("viewL4Detail — call, parallel, wait steps", () => {
  it("call step renders as 'call <flowRef>'", () => {
    const flow: L4Flow = {
      id: "caller-flow",
      name: "Caller Flow",
      steps: [{ id: "s0", action: "call", flowRef: "sub-flow", next: null }],
      dataFlows: [],
      revision: REV1,
      contentHash: "call1",
    };
    const output = viewL4Detail(flow, []);
    expect(output).toContain("call sub-flow");
  });

  it("parallel step renders as 'parallel [a, b]'", () => {
    const flow: L4Flow = {
      id: "parallel-flow",
      name: "Parallel Flow",
      steps: [{ id: "s0", action: "parallel", branches: ["a", "b"] }],
      dataFlows: [],
      revision: REV1,
      contentHash: "par1",
    };
    const output = viewL4Detail(flow, []);
    expect(output).toContain("parallel [a, b]");
  });

  it("wait step renders as 'wait [x, y]'", () => {
    const flow: L4Flow = {
      id: "wait-flow",
      name: "Wait Flow",
      steps: [{ id: "s0", action: "wait", waitFor: ["x", "y"], next: "final" }],
      dataFlows: [],
      revision: REV1,
      contentHash: "wait1",
    };
    const output = viewL4Detail(flow, []);
    expect(output).toContain("wait [x, y]");
  });
});

// ── viewL3Summary / viewL3Detail — zero output pins ──

describe("viewL3Overview / viewL3Detail — zero output pins", () => {
  const zeroOutputBlock: L3Block = {
    id: "no-output",
    name: "No Output",
    input: [{ name: "cmd", type: "Command" }],
    output: [],
    validate: {},
    constraints: [],
    description: "A block that produces no output",
    revision: REV1,
    contentHash: "zo1",
  };

  it("viewL3Overview shows 'void' for output signature when output is empty", () => {
    const output = viewL3Overview([zeroOutputBlock]);
    expect(output).toContain("void");
  });

  it("viewL3Detail shows 'void' in signature when output is empty", () => {
    const output = viewL3Detail(zeroOutputBlock, [], []);
    expect(output).toContain("void");
  });
});
