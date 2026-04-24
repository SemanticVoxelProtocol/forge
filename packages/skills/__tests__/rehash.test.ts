import { describe, expect, it } from "vitest";
import { computeHash, hashL3, hashL4, hashL5 } from "../../core/hash.js";
import {
  rehashFileManifest,
  rehashFunctionManifest,
  rehashL2,
  rehashL3,
  rehashL4,
  rehashL5,
} from "../rehash.js";
import type { FileManifest } from "../../core/file.js";
import type { FunctionManifest } from "../../core/function.js";
import type { L2CodeBlock } from "../../core/l2.js";
import type { L3Block } from "../../core/l3.js";
import type { L4EventGraph, L4Flow, L4StateMachine } from "../../core/l4.js";
import type { L5Blueprint } from "../../core/l5.js";

const baseRevision = {
  rev: 1,
  parentRev: null as number | null,
  source: { type: "init" as const },
  timestamp: "2024-01-01T00:00:00.000Z",
};

function makeL5(overrides?: Partial<L5Blueprint>): L5Blueprint {
  return {
    id: "test-project",
    name: "Test Project",
    version: "0.1.0",
    intent: "Test intent",
    constraints: [],
    domains: [],
    integrations: [],
    contentHash: "placeholder",
    revision: baseRevision,
    ...overrides,
  };
}

function makeL4(overrides?: Partial<L4Flow>): L4Flow {
  return {
    id: "test-flow",
    name: "Test Flow",
    steps: [{ id: "s1", action: "process", blockRef: "test-block", next: null }],
    dataFlows: [],
    contentHash: "placeholder",
    revision: baseRevision,
    ...overrides,
  };
}

function makeL3(overrides?: Partial<L3Block>): L3Block {
  return {
    id: "test-block",
    name: "Test Block",
    input: [{ name: "request", type: "TestInput" }],
    output: [{ name: "result", type: "TestOutput" }],
    validate: { request: "required" },
    constraints: ["output must be valid"],
    description: "A test block",
    contentHash: "placeholder",
    revision: baseRevision,
    ...overrides,
  };
}

function makeL2(overrides?: Partial<L2CodeBlock>): L2CodeBlock {
  return {
    id: "test-block",
    blockRef: "test-block",
    language: "typescript",
    files: ["src/test-block.ts"],
    sourceHash: "abc123",
    contentHash: "placeholder",
    revision: baseRevision,
    ...overrides,
  };
}

function makeFileManifest(overrides?: Partial<FileManifest>): FileManifest {
  return {
    id: "file-src-test-block-ts",
    path: "src/test-block.ts",
    purpose: "Govern src/test-block.ts",
    l2BlockRef: "test-block",
    blockRefs: ["test-block"],
    exports: ["runTestBlock"],
    ownership: ["src"],
    dependencyBoundary: ["src/*"],
    pluginGroups: ["governance"],
    contentHash: "placeholder",
    revision: baseRevision,
    ...overrides,
  };
}

function makeFunctionManifest(overrides?: Partial<FunctionManifest>): FunctionManifest {
  return {
    id: "file-src-test-block-ts.run-test-block",
    fileRef: "file-src-test-block-ts",
    exportName: "runTestBlock",
    signature: "runTestBlock(…): unknown",
    preconditions: [],
    postconditions: [],
    pluginPolicy: ["governance"],
    contentHash: "placeholder",
    revision: baseRevision,
    ...overrides,
  };
}

describe("rehashL5", () => {
  it("computes correct contentHash for L5", () => {
    const l5 = makeL5();
    const { data, result } = rehashL5(l5);

    expect(result.changed).toBe(true);
    expect(result.oldHash).toBe("placeholder");
    expect(result.newHash).not.toBe("placeholder");
    expect(data.contentHash).toBe(result.newHash);
    // Verify against direct hash computation
    const { contentHash: _, revision: _r, ...rest } = l5;
    expect(data.contentHash).toBe(hashL5(rest));
  });

  it("bumps revision when hash changes", () => {
    const l5 = makeL5();
    const { data } = rehashL5(l5);

    expect(data.revision.rev).toBe(2);
    expect(data.revision.parentRev).toBe(1);
    expect(data.revision.source).toEqual({ type: "human" });
  });

  it("is idempotent — no rev bump when hash unchanged", () => {
    const l5 = makeL5();
    // First rehash to get correct hash
    const { data: first } = rehashL5(l5);
    // Second rehash should be no-op
    const { data: second, result } = rehashL5(first);

    expect(result.changed).toBe(false);
    expect(second.revision.rev).toBe(first.revision.rev);
    expect(second.contentHash).toBe(first.contentHash);
  });
});

describe("rehashL4", () => {
  it("computes correct contentHash for L4", () => {
    const flow = makeL4();
    const { data, result } = rehashL4(flow);

    expect(result.changed).toBe(true);
    expect(data.contentHash).toBe(result.newHash);
    const { contentHash: _, revision: _r, ...rest } = flow;
    expect(data.contentHash).toBe(hashL4(rest));
  });

  it("is idempotent", () => {
    const { data: first } = rehashL4(makeL4());
    const { result } = rehashL4(first);
    expect(result.changed).toBe(false);
  });
});

describe("rehashL3", () => {
  it("computes correct contentHash for L3", () => {
    const block = makeL3();
    const { data, result } = rehashL3(block);

    expect(result.changed).toBe(true);
    expect(data.contentHash).toBe(result.newHash);
    const { contentHash: _, revision: _r, ...rest } = block;
    expect(data.contentHash).toBe(hashL3(rest));
  });

  it("is idempotent", () => {
    const { data: first } = rehashL3(makeL3());
    const { result } = rehashL3(first);
    expect(result.changed).toBe(false);
  });

  it("detects content change", () => {
    const { data: original } = rehashL3(makeL3());
    // Modify content
    const modified = {
      ...original,
      description: "Updated description",
      contentHash: original.contentHash,
    };
    const { result } = rehashL3(modified);

    expect(result.changed).toBe(true);
    expect(result.newHash).not.toBe(result.oldHash);
  });
});

describe("rehashL2", () => {
  it("computes correct contentHash for L2 without changing sourceHash", () => {
    const cb = makeL2();
    const { data, result } = rehashL2(cb);

    expect(result.changed).toBe(true);
    expect(data.contentHash).toBe(result.newHash);
    // sourceHash should be preserved
    expect(data.sourceHash).toBe(cb.sourceHash);
  });

  it("is idempotent", () => {
    const { data: first } = rehashL2(makeL2());
    const { result } = rehashL2(first);
    expect(result.changed).toBe(false);
  });
});

describe("rehashFileManifest", () => {
  it("computes correct contentHash for file manifest", () => {
    const manifest = makeFileManifest();
    const { data, result } = rehashFileManifest(manifest);

    expect(result.changed).toBe(true);
    expect(result.layer).toBe("file");
    expect(data.contentHash).toBe(result.newHash);
    const { contentHash: _, revision: _r, ...rest } = manifest;
    expect(data.contentHash).toBe(computeHash(rest as Record<string, unknown>));
  });

  it("is idempotent", () => {
    const { data: first } = rehashFileManifest(makeFileManifest());
    const { result } = rehashFileManifest(first);
    expect(result.changed).toBe(false);
  });
});

describe("rehashFunctionManifest", () => {
  it("computes correct contentHash for function manifest", () => {
    const manifest = makeFunctionManifest();
    const { data, result } = rehashFunctionManifest(manifest);

    expect(result.changed).toBe(true);
    expect(result.layer).toBe("fn");
    expect(data.contentHash).toBe(result.newHash);
    const { contentHash: _, revision: _r, ...rest } = manifest;
    expect(data.contentHash).toBe(computeHash(rest as Record<string, unknown>));
  });

  it("is idempotent", () => {
    const { data: first } = rehashFunctionManifest(makeFunctionManifest());
    const { result } = rehashFunctionManifest(first);
    expect(result.changed).toBe(false);
  });
});

// ── Additional tests ──

function makeEventGraph(overrides?: Partial<L4EventGraph>): L4EventGraph {
  return {
    kind: "event-graph",
    id: "eg-checkout",
    name: "Checkout Event Graph",
    state: {
      cartTotal: { type: "number", description: "Running cart total" },
    },
    handlers: [
      {
        id: "h1",
        event: "user.add_item",
        steps: [{ id: "s1", action: "process", blockRef: "add-item-block", next: null }],
        dataFlows: [],
      },
    ],
    contentHash: "placeholder",
    revision: baseRevision,
    ...overrides,
  };
}

describe("rehashL4 — EventGraph variant", () => {
  it("computes correct contentHash for EventGraph", () => {
    const eg = makeEventGraph();
    const { data, result } = rehashL4(eg);

    expect(result.changed).toBe(true);
    expect(data.contentHash).toBe(result.newHash);
    const { contentHash: _, revision: _r, ...rest } = eg;
    expect(data.contentHash).toBe(hashL4(rest));
  });

  it("bumps revision when EventGraph hash changes", () => {
    const eg = makeEventGraph();
    const { data } = rehashL4(eg);

    expect(data.revision.rev).toBe(2);
    expect(data.revision.parentRev).toBe(1);
    expect(data.revision.source).toEqual({ type: "human" });
  });

  it("is idempotent for EventGraph", () => {
    const { data: first } = rehashL4(makeEventGraph());
    const { result } = rehashL4(first);
    expect(result.changed).toBe(false);
  });
});

function makeStateMachine(overrides?: Partial<L4StateMachine>): L4StateMachine {
  return {
    kind: "state-machine",
    id: "sm-order",
    name: "Order State Machine",
    entity: "PurchaseOrder",
    initialState: "draft",
    states: {
      draft: { onEntry: { blockRef: "init-order" } },
      confirmed: {},
      cancelled: { onEntry: { blockRef: "cancel-order" } },
    },
    transitions: [
      { from: "draft", to: "confirmed", event: "confirm" },
      { from: "draft", to: "cancelled", event: "cancel", guard: "can-cancel" },
    ],
    contentHash: "placeholder",
    revision: baseRevision,
    ...overrides,
  };
}

describe("rehashL4 — StateMachine variant", () => {
  it("computes correct contentHash for StateMachine", () => {
    const sm = makeStateMachine();
    const { data, result } = rehashL4(sm);

    expect(result.changed).toBe(true);
    expect(data.contentHash).toBe(result.newHash);
    const { contentHash: _, revision: _r, ...rest } = sm;
    expect(data.contentHash).toBe(hashL4(rest));
  });

  it("bumps revision when StateMachine hash changes", () => {
    const sm = makeStateMachine();
    const { data } = rehashL4(sm);

    expect(data.revision.rev).toBe(2);
    expect(data.revision.parentRev).toBe(1);
  });

  it("is idempotent for StateMachine", () => {
    const { data: first } = rehashL4(makeStateMachine());
    const { result } = rehashL4(first);
    expect(result.changed).toBe(false);
  });
});

describe("rehashL3 — revision bumping", () => {
  it("increments rev and sets parentRev when hash changes", () => {
    const block = makeL3({
      revision: {
        rev: 3,
        parentRev: 2,
        source: { type: "init" as const },
        timestamp: "2024-01-01T00:00:00.000Z",
      },
    });
    const { data, result } = rehashL3(block);

    expect(result.changed).toBe(true);
    expect(data.revision.rev).toBe(4);
    expect(data.revision.parentRev).toBe(3);
  });

  it("does not bump rev when hash is already correct", () => {
    const { data: first } = rehashL3(makeL3());
    const { data: second, result } = rehashL3(first);

    expect(result.changed).toBe(false);
    expect(second.revision.rev).toBe(first.revision.rev);
    expect(second.revision.parentRev).toBe(first.revision.parentRev);
  });
});

describe("rehashL2 — revision bumping", () => {
  it("increments rev and sets parentRev when hash changes", () => {
    const cb = makeL2({
      revision: {
        rev: 5,
        parentRev: 4,
        source: { type: "init" as const },
        timestamp: "2024-01-01T00:00:00.000Z",
      },
    });
    const { data, result } = rehashL2(cb);

    expect(result.changed).toBe(true);
    expect(data.revision.rev).toBe(6);
    expect(data.revision.parentRev).toBe(5);
  });

  it("does not bump rev when hash is already correct", () => {
    const { data: first } = rehashL2(makeL2());
    const { data: second, result } = rehashL2(first);

    expect(result.changed).toBe(false);
    expect(second.revision.rev).toBe(first.revision.rev);
  });
});

describe("rehashL5 — empty constraints/domains/integrations", () => {
  it("computes contentHash with all arrays empty", () => {
    const l5 = makeL5({ constraints: [], domains: [], integrations: [] });
    const { data, result } = rehashL5(l5);

    expect(result.changed).toBe(true);
    expect(data.contentHash).toBe(result.newHash);
    const { contentHash: _, revision: _r, ...rest } = l5;
    expect(data.contentHash).toBe(hashL5(rest));
  });

  it("is idempotent with empty arrays", () => {
    const l5 = makeL5({ constraints: [], domains: [], integrations: [] });
    const { data: first } = rehashL5(l5);
    const { result } = rehashL5(first);
    expect(result.changed).toBe(false);
  });
});

describe("rehashL2 — preserves sourceHash", () => {
  it("does not change sourceHash when hash changes", () => {
    const cb = makeL2({ sourceHash: "original-source-hash" });
    const { data } = rehashL2(cb);
    expect(data.sourceHash).toBe("original-source-hash");
  });

  it("does not change sourceHash when hash is already correct", () => {
    const { data: first } = rehashL2(makeL2({ sourceHash: "kept-source-hash" }));
    expect(first.sourceHash).toBe("kept-source-hash");
    const { data: second } = rehashL2(first);
    expect(second.sourceHash).toBe("kept-source-hash");
  });
});

describe("rehashL3 — unicode content", () => {
  it("handles unicode in name and description", () => {
    const block = makeL3({
      name: "验证订单请求",
      description: "逐项校验所有字段，确保 ✓ 符合规范",
      constraints: ["输出必须有效", "错误信息不能为空"],
    });
    const { data, result } = rehashL3(block);

    expect(result.changed).toBe(true);
    expect(data.contentHash).toBe(result.newHash);
    const { contentHash: _, revision: _r, ...rest } = block;
    expect(data.contentHash).toBe(hashL3(rest));
  });

  it("is idempotent with unicode content", () => {
    const block = makeL3({ name: "验证订单", description: "校验字段 🚀" });
    const { data: first } = rehashL3(block);
    const { result } = rehashL3(first);
    expect(result.changed).toBe(false);
  });
});
