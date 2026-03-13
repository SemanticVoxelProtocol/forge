import { describe, expect, it } from "vitest";
import { hashL3, hashL4, hashL5 } from "../../core/hash.js";
import { rehashL2, rehashL3, rehashL4, rehashL5 } from "../rehash.js";
import type { L2CodeBlock } from "../../core/l2.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Flow } from "../../core/l4.js";
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
