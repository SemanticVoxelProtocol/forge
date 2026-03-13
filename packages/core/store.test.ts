import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listL3, listL4, readL3, readL4, writeL3, writeL4 } from "./store.js";
import type { L3Block } from "./l3.js";
import type { L4Flow } from "./l4.js";

const makeL3 = (id: string): L3Block => ({
  id,
  name: "Test Block",
  input: [{ name: "req", type: "Request" }],
  output: [{ name: "res", type: "Response" }],
  validate: { "req.id": "required" },
  constraints: ["output.res is not empty"],
  description: "test block",
  revision: {
    rev: 1,
    parentRev: null,
    source: { type: "init" },
    timestamp: "2024-01-01T00:00:00.000Z",
  },
  contentHash: "def",
});

const makeL4 = (id: string): L4Flow => ({
  id,
  name: "Test Flow",
  steps: [{ id: "s1", action: "process", blockRef: "test-block", next: null }],
  dataFlows: [],
  revision: {
    rev: 1,
    parentRev: null,
    source: { type: "init" },
    timestamp: "2024-01-01T00:00:00.000Z",
  },
  contentHash: "def",
});

describe("store L3", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-test-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("write then read", async () => {
    const block = makeL3("my-block");
    await writeL3(root, block);
    const loaded = await readL3(root, "my-block");
    expect(loaded).toEqual(block);
  });

  it("read non-existent returns null", async () => {
    const result = await readL3(root, "nope");
    expect(result).toBeNull();
  });

  it("list returns written IDs", async () => {
    await writeL3(root, makeL3("block-a"));
    await writeL3(root, makeL3("block-b"));
    const ids = await listL3(root);
    expect(ids).toContain("block-a");
    expect(ids).toContain("block-b");
  });
});

describe("store L4", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-test-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("write then read", async () => {
    const flow = makeL4("my-flow");
    await writeL4(root, flow);
    const loaded = await readL4(root, "my-flow");
    expect(loaded).toEqual(flow);
  });

  it("list returns written IDs", async () => {
    await writeL4(root, makeL4("flow-a"));
    const ids = await listL4(root);
    expect(ids).toContain("flow-a");
  });
});
