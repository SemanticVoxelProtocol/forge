import { describe, expect, it } from "vitest";
import { computeHash, hashL2, hashL3, hashL4, hashL5 } from "./hash.js";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4EventGraph, L4Flow, L4StateMachine } from "./l4.js";
import type { L5Blueprint } from "./l5.js";
import type { ArtifactVersion } from "./version.js";

// ── Factories ──────────────────────────────────────────────────────────────

function makeRevision(rev = 1): ArtifactVersion {
  return {
    rev,
    parentRev: rev === 1 ? null : rev - 1,
    source: { type: "human" },
    timestamp: "2024-01-01T00:00:00Z",
  };
}

function makeL3Block(overrides?: Partial<L3Block>): L3Block {
  return {
    id: "validate-order",
    name: "Validate Order",
    input: [{ name: "request", type: "OrderRequest" }],
    output: [{ name: "result", type: "ValidationResult" }],
    validate: { "request.items": "array, min 1" },
    constraints: ["output.result.total >= 0"],
    description: "Validates all fields of the order",
    revision: makeRevision(),
    contentHash: "abc123",
    ...overrides,
  };
}

function makeL4Flow(overrides?: Partial<L4Flow>): L4Flow {
  return {
    id: "order-flow",
    name: "Order Flow",
    steps: [
      { id: "step-1", action: "process", blockRef: "validate-order", next: "step-2" },
      { id: "step-2", action: "process", blockRef: "save-order", next: null },
    ],
    dataFlows: [{ from: "step-1.result", to: "step-2.input" }],
    revision: makeRevision(),
    contentHash: "def456",
    ...overrides,
  };
}

function makeL4EventGraph(overrides?: Partial<L4EventGraph>): L4EventGraph {
  return {
    kind: "event-graph",
    id: "collab-graph",
    name: "Collaboration Graph",
    state: {
      document: { type: "Document", description: "Shared document state" },
    },
    handlers: [
      {
        id: "on-edit",
        event: "user.local_edit",
        steps: [{ id: "s1", action: "process", blockRef: "apply-edit" }],
        dataFlows: [{ from: "$event.delta", to: "s1.delta" }],
      },
    ],
    revision: makeRevision(),
    contentHash: "ghi789",
    ...overrides,
  };
}

function makeL4StateMachine(overrides?: Partial<L4StateMachine>): L4StateMachine {
  return {
    kind: "state-machine",
    id: "order-sm",
    name: "Order State Machine",
    entity: "PurchaseOrder",
    initialState: "pending",
    states: {
      pending: { onEntry: { blockRef: "init-order" } },
      confirmed: {},
      cancelled: {},
    },
    transitions: [
      { from: "pending", to: "confirmed", event: "confirm" },
      { from: "pending", to: "cancelled", event: "cancel", guard: "can-cancel" },
    ],
    revision: makeRevision(),
    contentHash: "jkl012",
    ...overrides,
  };
}

function makeL5Blueprint(overrides?: Partial<L5Blueprint>): L5Blueprint {
  return {
    id: "shop-blueprint",
    name: "Shop Blueprint",
    version: "1.0.0",
    intent: "Build an e-commerce order management system",
    constraints: ["max latency 200ms", "GDPR compliant"],
    domains: [
      { name: "orders", description: "Order management", dependencies: [] },
      { name: "payments", description: "Payment processing", dependencies: ["orders"] },
    ],
    integrations: [{ name: "postgres", type: "database", description: "Primary store" }],
    revision: makeRevision(),
    contentHash: "mno345",
    ...overrides,
  };
}

function makeL2CodeBlock(overrides?: Partial<L2CodeBlock>): L2CodeBlock {
  return {
    id: "l2-validate-order",
    blockRef: "validate-order",
    language: "typescript",
    files: ["src/orders/validate.ts", "src/orders/types.ts"],
    sourceHash: "l3hash001",
    contentHash: "l2hash001",
    revision: makeRevision(),
    ...overrides,
  };
}

// ── computeHash ────────────────────────────────────────────────────────────
//
// Key behavior: JSON.stringify(record, sortedTopLevelKeys) uses the top-level
// keys array as a whitelist for ALL levels of the object graph. Nested object
// properties are serialized only if their key name also appears as a top-level
// key of the input object. This means nested-only fields (e.g. Pin.type,
// DataFlow.from/to) are silently omitted from the hash input.

describe("computeHash", () => {
  it("produces consistent hash for same content", () => {
    const obj = { a: 1, b: "hello" };
    const h1 = computeHash(obj);
    const h2 = computeHash(obj);
    expect(h1).toBe(h2);
  });

  it("produces different hash for different content", () => {
    const h1 = computeHash({ a: 1 });
    const h2 = computeHash({ a: 2 });
    expect(h1).not.toBe(h2);
  });

  it("ignores contentHash field", () => {
    const h1 = computeHash({ a: 1, contentHash: "old" });
    const h2 = computeHash({ a: 1, contentHash: "new" });
    expect(h1).toBe(h2);
  });

  it("source.hash nested key is preserved and affects hash", () => {
    const h1 = computeHash({ a: 1, source: { type: "l4", ref: "x", hash: "old" } });
    const h2 = computeHash({ a: 1, source: { type: "l4", ref: "x", hash: "new" } });
    expect(h1).not.toBe(h2);
  });

  it("returns 16 char hex string", () => {
    const h = computeHash({ x: 42 });
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("key ordering independence — same fields in different insertion order produce same hash", () => {
    const h1 = computeHash({ a: 1, b: 2 });
    const h2 = computeHash({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it("empty object produces a valid 16-char hex hash", () => {
    const h = computeHash({});
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ignores sourceHash field at top level", () => {
    const h1 = computeHash({ a: 1, sourceHash: "v1" });
    const h2 = computeHash({ a: 1, sourceHash: "v2" });
    expect(h1).toBe(h2);
  });

  it("ignores revision field at top level", () => {
    const h1 = computeHash({ a: 1, revision: { rev: 1, parentRev: null } });
    const h2 = computeHash({ a: 1, revision: { rev: 99, parentRev: 98 } });
    expect(h1).toBe(h2);
  });

  it("strips contentHash recursively in nested objects", () => {
    const h1 = computeHash({ outer: { contentHash: "x", data: "hello" } });
    const h2 = computeHash({ outer: { contentHash: "y", data: "hello" } });
    // 'data' is not a top-level key so it's omitted; only 'outer' key is serialized
    // Both objects after stripping produce { outer: { data: 'hello' } } but 'data'
    // is excluded by the replacer — so both hash to the same value
    expect(h1).toBe(h2);
  });

  it("strips sourceHash recursively in nested objects", () => {
    const h1 = computeHash({ outer: { sourceHash: "x", id: "foo" } });
    const h2 = computeHash({ outer: { sourceHash: "y", id: "foo" } });
    // 'id' is not a top-level key here, so nested id is also omitted
    expect(h1).toBe(h2);
  });

  it("preserves array values — different array contents produce different hashes", () => {
    const h1 = computeHash({ items: ["a", "b", "c"] });
    const h2 = computeHash({ items: ["a", "b", "c"] });
    const h3 = computeHash({ items: ["a", "b"] });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it("handles null values in objects", () => {
    const h1 = computeHash({ a: null });
    const h2 = computeHash({ a: null });
    const h3 = computeHash({ a: 1 });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it("deeply nested values affect hash", () => {
    const h1 = computeHash({ l1: { l2: { l3: { value: 42 } } } });
    const h2 = computeHash({ l1: { l2: { l3: { value: 99 } } } });
    expect(h1).not.toBe(h2);
  });

  it("adding a new top-level key changes the hash", () => {
    const h1 = computeHash({ a: 1 });
    const h2 = computeHash({ a: 1, b: 2 });
    expect(h1).not.toBe(h2);
  });

  it("object with only stripped fields hashes the same as empty object after stripping", () => {
    const hEmpty = computeHash({});
    const hStripped = computeHash({
      contentHash: "any",
      sourceHash: "any",
      revision: { rev: 5 },
    });
    expect(hStripped).toBe(hEmpty);
  });

  it("hash is deterministic across 100 repeated calls", () => {
    const obj = { x: 1, y: "test", z: [1, 2, 3] };
    const first = computeHash(obj);
    for (let i = 0; i < 99; i++) {
      expect(computeHash(obj)).toBe(first);
    }
  });
});

// ── hashL3 ─────────────────────────────────────────────────────────────────
//
// L3 top-level keys (after stripping): constraints, description, id, input,
// name, output, validate.
// Pin.type is NOT a top-level key so it is omitted from the hash.
// validate record values are also omitted (nested keys not top-level).
// Pin.name IS serialized because 'name' is a top-level L3 key.

describe("hashL3", () => {
  it("hashes L3Block fields and returns 16-char hex", () => {
    const block = makeL3Block();
    const h = hashL3(block);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("same content produces same hash", () => {
    const block = makeL3Block();
    expect(hashL3(block)).toBe(hashL3({ ...block }));
  });

  it("different description produces different hash", () => {
    const block = makeL3Block();
    expect(hashL3(block)).not.toBe(hashL3({ ...block, description: "Different desc" }));
  });

  it("same content with different contentHash produces same hash", () => {
    const h1 = hashL3({ ...makeL3Block(), contentHash: "hash-v1" } as never);
    const h2 = hashL3({ ...makeL3Block(), contentHash: "hash-v2" } as never);
    expect(h1).toBe(h2);
  });

  it("same content with different revision produces same hash", () => {
    const h1 = hashL3({ ...makeL3Block(), revision: makeRevision(1) } as never);
    const h2 = hashL3({ ...makeL3Block(), revision: makeRevision(99) } as never);
    expect(h1).toBe(h2);
  });

  it("different input pin name produces different hash ('name' is a top-level key)", () => {
    const block = makeL3Block();
    const modified = makeL3Block({
      input: [{ name: "differentName", type: "OrderRequest" }],
    });
    expect(hashL3(block)).not.toBe(hashL3(modified));
  });

  it("different input pin type produces different hash", () => {
    const block = makeL3Block();
    const modified = makeL3Block({
      input: [{ name: "request", type: "DifferentType" }],
    });
    expect(hashL3(block)).not.toBe(hashL3(modified));
  });

  it("adding an extra input pin changes hash (array length changes)", () => {
    const block = makeL3Block();
    const modified = makeL3Block({
      input: [
        { name: "request", type: "OrderRequest" },
        { name: "context", type: "Context" },
      ],
    });
    expect(hashL3(block)).not.toBe(hashL3(modified));
  });

  it("different output pin name produces different hash", () => {
    const block = makeL3Block();
    const modified = makeL3Block({
      output: [{ name: "differentResult", type: "ValidationResult" }],
    });
    expect(hashL3(block)).not.toBe(hashL3(modified));
  });

  it("different output pin type produces different hash", () => {
    const block = makeL3Block();
    const modified = makeL3Block({
      output: [{ name: "result", type: "AnotherResult" }],
    });
    expect(hashL3(block)).not.toBe(hashL3(modified));
  });

  it("different validate rule values produce different hash", () => {
    const block = makeL3Block();
    const modified = makeL3Block({ validate: { "request.items": "array, min 5" } });
    expect(hashL3(block)).not.toBe(hashL3(modified));
  });

  it("validate with vs without entries produces different hash", () => {
    const block = makeL3Block();
    const modified = makeL3Block({ validate: {} });
    expect(hashL3(block)).not.toBe(hashL3(modified));
  });

  it("different constraints produce different hash", () => {
    const block = makeL3Block();
    const modified = makeL3Block({ constraints: ["output.result.total > 100"] });
    expect(hashL3(block)).not.toBe(hashL3(modified));
  });

  it("empty validate, constraints, and description produce a valid hash", () => {
    const block = makeL3Block({ validate: {}, constraints: [], description: "" });
    expect(hashL3(block)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("optional pin field produces different hash", () => {
    const withoutOptional = makeL3Block({
      input: [{ name: "req", type: "Req" }],
    });
    const withOptional = makeL3Block({
      input: [{ name: "req", type: "Req", optional: true }],
    });
    expect(hashL3(withoutOptional)).not.toBe(hashL3(withOptional));
  });

  it("different id produces different hash", () => {
    const block = makeL3Block();
    expect(hashL3(block)).not.toBe(hashL3({ ...block, id: "other-block" }));
  });

  it("different name produces different hash", () => {
    const block = makeL3Block();
    expect(hashL3(block)).not.toBe(hashL3({ ...block, name: "Other Name" }));
  });
});

// ── hashL4 ─────────────────────────────────────────────────────────────────
//
// L4Flow top-level keys (after stripping): dataFlows, id, name, steps.
// Step fields action/blockRef/next/branches/waitFor are NOT top-level keys,
// so they are omitted. Step.id IS serialized because 'id' is top-level.
// DataFlow.from/to are NOT top-level so dataFlow content doesn't affect hash.

describe("hashL4 — L4Flow", () => {
  it("hashes L4Flow fields and returns 16-char hex", () => {
    const flow = makeL4Flow();
    expect(hashL4(flow)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("same flow content produces same hash", () => {
    const flow = makeL4Flow();
    expect(hashL4(flow)).toBe(hashL4({ ...flow }));
  });

  it("adding a step changes the hash (array length changes)", () => {
    const flow = makeL4Flow();
    const modified = makeL4Flow({
      steps: [
        ...flow.steps,
        { id: "step-3", action: "process", blockRef: "extra-block", next: null },
      ],
    });
    expect(hashL4(flow)).not.toBe(hashL4(modified));
  });

  it("changing a step id changes the hash (id is a top-level key)", () => {
    const flow = makeL4Flow();
    const modified = makeL4Flow({
      steps: [
        { id: "CHANGED", action: "process", blockRef: "validate-order", next: "step-2" },
        { id: "step-2", action: "process", blockRef: "save-order", next: null },
      ],
    });
    expect(hashL4(flow)).not.toBe(hashL4(modified));
  });

  it("changing step blockRef produces different hash", () => {
    const flow = makeL4Flow();
    const modified = makeL4Flow({
      steps: [
        { id: "step-1", action: "process", blockRef: "DIFFERENT-BLOCK", next: "step-2" },
        { id: "step-2", action: "process", blockRef: "save-order", next: null },
      ],
    });
    expect(hashL4(flow)).not.toBe(hashL4(modified));
  });

  it("changing dataFlow content produces different hash", () => {
    const flow = makeL4Flow();
    const modified = makeL4Flow({
      dataFlows: [{ from: "step-1.output", to: "step-2.other" }],
    });
    expect(hashL4(flow)).not.toBe(hashL4(modified));
  });

  it("adding a dataFlow entry changes hash (array length changes)", () => {
    const flow = makeL4Flow();
    const modified = makeL4Flow({
      dataFlows: [
        { from: "step-1.result", to: "step-2.input" },
        { from: "step-1.extra", to: "step-2.other" },
      ],
    });
    expect(hashL4(flow)).not.toBe(hashL4(modified));
  });

  it("different flow id produces different hash", () => {
    const flow = makeL4Flow();
    expect(hashL4(flow)).not.toBe(hashL4({ ...flow, id: "other-flow" }));
  });

  it("different flow name produces different hash", () => {
    const flow = makeL4Flow();
    expect(hashL4(flow)).not.toBe(hashL4({ ...flow, name: "Other Flow" }));
  });

  it("ignores contentHash and revision in L4Flow", () => {
    const flow = makeL4Flow();
    const h1 = hashL4({ ...flow, contentHash: "v1", revision: makeRevision(1) } as never);
    const h2 = hashL4({ ...flow, contentHash: "v2", revision: makeRevision(50) } as never);
    expect(h1).toBe(h2);
  });
});

describe("hashL4 — L4EventGraph", () => {
  it("hashes L4EventGraph fields and returns 16-char hex", () => {
    const eg = makeL4EventGraph();
    expect(hashL4(eg)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("same event graph content produces same hash", () => {
    const eg = makeL4EventGraph();
    expect(hashL4(eg)).toBe(hashL4({ ...eg }));
  });

  it("different event graph id produces different hash", () => {
    const eg = makeL4EventGraph();
    expect(hashL4(eg)).not.toBe(hashL4({ ...eg, id: "other-graph" }));
  });

  it("different event graph name produces different hash", () => {
    const eg = makeL4EventGraph();
    expect(hashL4(eg)).not.toBe(hashL4({ ...eg, name: "Other Graph" }));
  });

  it("adding a handler changes hash (handlers array length changes)", () => {
    const eg = makeL4EventGraph();
    const modified = makeL4EventGraph({
      handlers: [
        ...eg.handlers,
        {
          id: "on-delete",
          event: "user.delete",
          steps: [{ id: "s2", action: "process", blockRef: "delete-doc" }],
          dataFlows: [],
        },
      ],
    });
    expect(hashL4(eg)).not.toBe(hashL4(modified));
  });

  it("ignores contentHash and revision in L4EventGraph", () => {
    const eg = makeL4EventGraph();
    const h1 = hashL4({ ...eg, contentHash: "old", revision: makeRevision(1) } as never);
    const h2 = hashL4({ ...eg, contentHash: "new", revision: makeRevision(7) } as never);
    expect(h1).toBe(h2);
  });

  it("L4EventGraph and L4Flow with same id/name produce different hashes (kind field differs)", () => {
    const eg = makeL4EventGraph({ id: "shared-id", name: "Shared" });
    const flow = makeL4Flow({ id: "shared-id", name: "Shared" });
    expect(hashL4(eg)).not.toBe(hashL4(flow));
  });
});

describe("hashL4 — L4StateMachine", () => {
  it("hashes L4StateMachine fields and returns 16-char hex", () => {
    const sm = makeL4StateMachine();
    expect(hashL4(sm)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("same state machine content produces same hash", () => {
    const sm = makeL4StateMachine();
    expect(hashL4(sm)).toBe(hashL4({ ...sm }));
  });

  it("different state machine id produces different hash", () => {
    const sm = makeL4StateMachine();
    expect(hashL4(sm)).not.toBe(hashL4({ ...sm, id: "other-sm" }));
  });

  it("different initialState produces different hash", () => {
    const sm = makeL4StateMachine();
    expect(hashL4(sm)).not.toBe(hashL4({ ...sm, initialState: "confirmed" } as never));
  });

  it("adding a transition changes hash (array length changes)", () => {
    const sm = makeL4StateMachine();
    const modified = makeL4StateMachine({
      transitions: [...sm.transitions, { from: "confirmed", to: "cancelled", event: "refund" }],
    });
    expect(hashL4(sm)).not.toBe(hashL4(modified));
  });

  it("ignores contentHash and revision in L4StateMachine", () => {
    const sm = makeL4StateMachine();
    const h1 = hashL4({ ...sm, contentHash: "old", revision: makeRevision(1) } as never);
    const h2 = hashL4({ ...sm, contentHash: "new", revision: makeRevision(10) } as never);
    expect(h1).toBe(h2);
  });
});

// ── hashL5 ─────────────────────────────────────────────────────────────────
//
// L5Blueprint top-level keys (after stripping): constraints, domains, id,
// integrations, intent, name, version.
// Domain.description/dependencies and Integration.type/description are only
// serialized if their key names appear at the top level — 'name' does (top-level),
// 'description' does NOT (not a top-level L5 key), 'type' does NOT.

describe("hashL5", () => {
  it("hashes L5Blueprint fields and returns 16-char hex", () => {
    const bp = makeL5Blueprint();
    expect(hashL5(bp)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("same content produces same hash", () => {
    const bp = makeL5Blueprint();
    expect(hashL5(bp)).toBe(hashL5({ ...bp }));
  });

  it("different intent produces different hash", () => {
    const bp = makeL5Blueprint();
    const modified = makeL5Blueprint({ intent: "Build a logistics system" });
    expect(hashL5(bp)).not.toBe(hashL5(modified));
  });

  it("different constraints produce different hash", () => {
    const bp = makeL5Blueprint();
    const modified = makeL5Blueprint({ constraints: ["max latency 500ms"] });
    expect(hashL5(bp)).not.toBe(hashL5(modified));
  });

  it("different domain name produces different hash (name is a top-level key)", () => {
    const bp = makeL5Blueprint();
    const modified = makeL5Blueprint({
      domains: [{ name: "inventory", description: "Inventory mgmt", dependencies: [] }],
    });
    expect(hashL5(bp)).not.toBe(hashL5(modified));
  });

  it("different integration name produces different hash (name is a top-level key)", () => {
    const bp = makeL5Blueprint();
    const modified = makeL5Blueprint({
      integrations: [{ name: "redis", type: "database", description: "Cache" }],
    });
    expect(hashL5(bp)).not.toBe(hashL5(modified));
  });

  it("adding a domain changes hash (array length changes)", () => {
    const bp = makeL5Blueprint();
    const modified = makeL5Blueprint({
      domains: [
        ...bp.domains,
        { name: "notifications", description: "Notifications", dependencies: [] },
      ],
    });
    expect(hashL5(bp)).not.toBe(hashL5(modified));
  });

  it("adding an integration changes hash (array length changes)", () => {
    const bp = makeL5Blueprint();
    const modified = makeL5Blueprint({
      integrations: [
        ...bp.integrations,
        { name: "redis", type: "storage", description: "Cache layer" },
      ],
    });
    expect(hashL5(bp)).not.toBe(hashL5(modified));
  });

  it("empty constraints, domains, and integrations produce a valid hash", () => {
    const bp = makeL5Blueprint({ constraints: [], domains: [], integrations: [] });
    expect(hashL5(bp)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ignores contentHash and revision in L5Blueprint", () => {
    const bp = makeL5Blueprint();
    const h1 = hashL5({ ...bp, contentHash: "v1", revision: makeRevision(1) } as never);
    const h2 = hashL5({ ...bp, contentHash: "v2", revision: makeRevision(42) } as never);
    expect(h1).toBe(h2);
  });

  it("different version produces different hash", () => {
    const bp = makeL5Blueprint();
    expect(hashL5(bp)).not.toBe(hashL5({ ...bp, version: "2.0.0" }));
  });
});

// ── hashL2 ─────────────────────────────────────────────────────────────────
//
// L2CodeBlock top-level keys (after stripping contentHash/sourceHash/revision):
// blockRef, files, id, language.

describe("hashL2", () => {
  it("hashes L2CodeBlock fields and returns 16-char hex", () => {
    const block = makeL2CodeBlock();
    expect(hashL2(block)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("same content produces same hash", () => {
    const block = makeL2CodeBlock();
    expect(hashL2(block)).toBe(hashL2({ ...block }));
  });

  it("different files produce different hash", () => {
    const block = makeL2CodeBlock();
    const modified = makeL2CodeBlock({ files: ["src/other/file.ts"] });
    expect(hashL2(block)).not.toBe(hashL2(modified));
  });

  it("different language produces different hash", () => {
    const block = makeL2CodeBlock();
    const modified = makeL2CodeBlock({ language: "python" });
    expect(hashL2(block)).not.toBe(hashL2(modified));
  });

  it("ignores contentHash, sourceHash, AND revision (all three stripped)", () => {
    const block = makeL2CodeBlock();
    const h1 = hashL2({
      ...block,
      contentHash: "c1",
      sourceHash: "s1",
      revision: makeRevision(1),
    } as never);
    const h2 = hashL2({
      ...block,
      contentHash: "c2",
      sourceHash: "s2",
      revision: makeRevision(99),
    } as never);
    expect(h1).toBe(h2);
  });

  it("empty files array produces a valid hash", () => {
    const block = makeL2CodeBlock({ files: [] });
    expect(hashL2(block)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("different blockRef produces different hash", () => {
    const h1 = hashL2(makeL2CodeBlock({ blockRef: "block-a" }));
    const h2 = hashL2(makeL2CodeBlock({ blockRef: "block-b" }));
    expect(h1).not.toBe(h2);
  });

  it("different id produces different hash", () => {
    const h1 = hashL2(makeL2CodeBlock({ id: "l2-a" }));
    const h2 = hashL2(makeL2CodeBlock({ id: "l2-b" }));
    expect(h1).not.toBe(h2);
  });
});
