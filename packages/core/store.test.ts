import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteFileManifest,
  deleteFunctionManifest,
  listL2,
  listL3,
  listL4,
  readL2,
  readL3,
  readL4,
  readL5,
  readNodeDocs,
  readGraphDocs,
  readL5Docs,
  readL2Docs,
  readNodeRefs,
  readGraphRefs,
  writeL2,
  writeL3,
  writeL4,
  writeL5,
} from "./store.js";
import * as store from "./store.js";
import type { FileManifest } from "./file.js";
import type { FunctionManifest } from "./function.js";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { L4EventGraph, L4Flow, L4StateMachine } from "./l4.js";
import type { L5Blueprint } from "./l5.js";
import type { ArtifactVersion } from "./version.js";

// ── Shared helpers ──

const REV: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00.000Z",
};

const makeL3 = (id: string, overrides?: Partial<L3Block>): L3Block => ({
  id,
  name: "Test Block",
  input: [{ name: "req", type: "Request" }],
  output: [{ name: "res", type: "Response" }],
  validate: { "req.id": "required" },
  constraints: ["output.res is not empty"],
  description: "test block",
  revision: REV,
  contentHash: "abc123",
  ...overrides,
});

const makeL4Flow = (id: string): L4Flow => ({
  id,
  name: "Test Flow",
  steps: [{ id: "s1", action: "process", blockRef: "test-block", next: null }],
  dataFlows: [],
  revision: REV,
  contentHash: "def456",
});

const makeL4EventGraph = (id: string): L4EventGraph => ({
  kind: "event-graph",
  id,
  name: "Test Event Graph",
  state: {
    counter: { type: "number", description: "A counter" },
  },
  handlers: [
    {
      id: "h1",
      event: "user.action",
      steps: [{ id: "s1", action: "process", blockRef: "some-block", next: null }],
      dataFlows: [],
    },
  ],
  revision: REV,
  contentHash: "ghi789",
});

const makeL4StateMachine = (id: string): L4StateMachine => ({
  kind: "state-machine",
  id,
  name: "Test State Machine",
  entity: "Order",
  initialState: "pending",
  states: {
    pending: { onEntry: { blockRef: "init-block" } },
    active: {},
    closed: { onExit: { blockRef: "close-block" } },
  },
  transitions: [
    { from: "pending", to: "active", event: "activate", guard: "check-block" },
    { from: "active", to: "closed", event: "close" },
  ],
  revision: REV,
  contentHash: "jkl012",
});

const makeL5 = (id: string, overrides?: Partial<L5Blueprint>): L5Blueprint => ({
  id,
  name: "Test Blueprint",
  version: "1.0.0",
  intent: "Core intent description",
  constraints: ["must be fast", "must be reliable"],
  domains: [
    { name: "auth", description: "Authentication domain", dependencies: [] },
    { name: "billing", description: "Billing domain", dependencies: ["auth"] },
  ],
  integrations: [{ name: "postgres", type: "database", description: "Primary DB" }],
  revision: REV,
  contentHash: "mno345",
  ...overrides,
});

const makeL2 = (id: string, overrides?: Partial<L2CodeBlock>): L2CodeBlock => ({
  id,
  blockRef: `l3-${id}`,
  language: "typescript",
  files: ["src/foo.ts", "src/bar.ts"],
  sourceHash: "src-hash-abc",
  contentHash: "content-hash-xyz",
  revision: REV,
  ...overrides,
});

const makeFileManifest = (id: string, overrides?: Partial<FileManifest>): FileManifest => ({
  id,
  path: `packages/core/${id}.ts`,
  purpose: "Govern a source file",
  l2BlockRef: `l2-${id}`,
  blockRefs: [`l3-${id}`],
  exports: ["main"],
  ownership: ["packages/core"],
  dependencyBoundary: ["packages/core/*", "node:*"],
  pluginGroups: ["governance"],
  revision: REV,
  contentHash: `file-manifest-${id}`,
  ...overrides,
});

const makeFunctionManifest = (
  id: string,
  overrides?: Partial<FunctionManifest>,
): FunctionManifest => ({
  id,
  fileRef: `file-${id}`,
  exportName: "main",
  signature: "main(): Promise<void>",
  preconditions: ["runtime context is ready"],
  postconditions: ["returns after pipeline execution"],
  pluginPolicy: ["trace"],
  revision: REV,
  contentHash: `function-manifest-${id}`,
  ...overrides,
});

// ── store L3 ──

describe("store L3", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-test-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("write then read roundtrip", async () => {
    const block = makeL3("roundtrip-l3");
    await writeL3(root, block);
    const loaded = await readL3(root, "roundtrip-l3");
    expect(loaded).toEqual(block);
  });

  it("read non-existent returns null", async () => {
    const result = await readL3(root, "does-not-exist");
    expect(result).toBeNull();
  });

  it("list returns written IDs", async () => {
    await writeL3(root, makeL3("block-a"));
    await writeL3(root, makeL3("block-b"));
    const ids = await listL3(root);
    expect(ids).toContain("block-a");
    expect(ids).toContain("block-b");
  });

  it("list on empty dir returns empty array", async () => {
    const emptyRoot = await mkdtemp(path.join(tmpdir(), "svp-empty-"));
    try {
      // Create the l3 dir but leave it empty
      await mkdir(path.join(emptyRoot, ".svp", "l3"), { recursive: true });
      const ids = await listL3(emptyRoot);
      expect(ids).toEqual([]);
    } finally {
      await rm(emptyRoot, { recursive: true });
    }
  });

  it("list on non-existent .svp/ dir returns empty array", async () => {
    const freshRoot = await mkdtemp(path.join(tmpdir(), "svp-nosvp-"));
    try {
      const ids = await listL3(freshRoot);
      expect(ids).toEqual([]);
    } finally {
      await rm(freshRoot, { recursive: true });
    }
  });

  it("overwrite existing L3 with same ID", async () => {
    const original = makeL3("overwrite-l3");
    await writeL3(root, original);
    const updated = makeL3("overwrite-l3", { name: "Updated Name", contentHash: "newhash" });
    await writeL3(root, updated);
    const loaded = await readL3(root, "overwrite-l3");
    expect(loaded).toEqual(updated);
    expect(loaded?.name).toBe("Updated Name");
  });

  it("read malformed JSON returns null", async () => {
    const malformedPath = path.join(root, ".svp", "l3", "malformed-l3.json");
    await mkdir(path.join(root, ".svp", "l3"), { recursive: true });
    await writeFile(malformedPath, "{ this is not valid json !!!}", "utf8");
    const result = await readL3(root, "malformed-l3");
    expect(result).toBeNull();
  });

  it("multiple L3 blocks — list returns all", async () => {
    const multiRoot = await mkdtemp(path.join(tmpdir(), "svp-multi-"));
    try {
      await writeL3(multiRoot, makeL3("m1"));
      await writeL3(multiRoot, makeL3("m2"));
      await writeL3(multiRoot, makeL3("m3"));
      const ids = await listL3(multiRoot);
      expect(ids.toSorted()).toEqual(["m1", "m2", "m3"]);
    } finally {
      await rm(multiRoot, { recursive: true });
    }
  });

  it("L3 block with unicode characters in name/description", async () => {
    const block = makeL3("unicode-l3", {
      name: "用户认证块 🔐",
      description: "处理用户登录、注销和会话管理 — supports émojis & special chars",
    });
    await writeL3(root, block);
    const loaded = await readL3(root, "unicode-l3");
    expect(loaded).toEqual(block);
    expect(loaded?.name).toBe("用户认证块 🔐");
  });
});

describe("store governed manifests", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-store-manifest-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("deletes persisted file and function manifests", async () => {
    const fileManifest = makeFileManifest("governed-file", {
      id: "file-src-governed-file-ts",
      path: "src/governed-file.ts",
    });
    const functionManifest = makeFunctionManifest("governed-file.main", {
      id: "file-src-governed-file-ts.main",
      fileRef: fileManifest.id,
      exportName: "main",
    });

    await store.writeFileManifest(root, fileManifest);
    await store.writeFunctionManifest(root, functionManifest);

    expect(await store.readFileManifest(root, fileManifest.id)).not.toBeNull();
    expect(await store.readFunctionManifest(root, functionManifest.id)).not.toBeNull();

    await deleteFileManifest(root, fileManifest.id);
    await deleteFunctionManifest(root, functionManifest.id);

    expect(await store.readFileManifest(root, fileManifest.id)).toBeNull();
    expect(await store.readFunctionManifest(root, functionManifest.id)).toBeNull();
  });
});

// ── store L4 ──

describe("store L4", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-test-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("write then read roundtrip", async () => {
    const flow = makeL4Flow("roundtrip-flow");
    await writeL4(root, flow);
    const loaded = await readL4(root, "roundtrip-flow");
    expect(loaded).toEqual(flow);
  });

  it("list returns written IDs", async () => {
    await writeL4(root, makeL4Flow("flow-a"));
    await writeL4(root, makeL4Flow("flow-b"));
    const ids = await listL4(root);
    expect(ids).toContain("flow-a");
    expect(ids).toContain("flow-b");
  });

  it("read non-existent returns null", async () => {
    const result = await readL4(root, "no-such-flow");
    expect(result).toBeNull();
  });

  it("list empty dir returns empty array", async () => {
    const emptyRoot = await mkdtemp(path.join(tmpdir(), "svp-l4-empty-"));
    try {
      await mkdir(path.join(emptyRoot, ".svp", "l4"), { recursive: true });
      const ids = await listL4(emptyRoot);
      expect(ids).toEqual([]);
    } finally {
      await rm(emptyRoot, { recursive: true });
    }
  });

  it("overwrite existing L4", async () => {
    const original = makeL4Flow("overwrite-flow");
    await writeL4(root, original);
    const updated: L4Flow = { ...original, name: "Updated Flow Name", contentHash: "updated-hash" };
    await writeL4(root, updated);
    const loaded = await readL4(root, "overwrite-flow");
    expect(loaded).toEqual(updated);
    expect((loaded as L4Flow).name).toBe("Updated Flow Name");
  });

  it("write L4EventGraph variant", async () => {
    const eg = makeL4EventGraph("my-event-graph");
    await writeL4(root, eg);
    const loaded = await readL4(root, "my-event-graph");
    expect(loaded).toEqual(eg);
    expect((loaded as L4EventGraph).kind).toBe("event-graph");
    expect((loaded as L4EventGraph).handlers).toHaveLength(1);
  });

  it("write L4StateMachine variant", async () => {
    const sm = makeL4StateMachine("my-state-machine");
    await writeL4(root, sm);
    const loaded = await readL4(root, "my-state-machine");
    expect(loaded).toEqual(sm);
    expect((loaded as L4StateMachine).kind).toBe("state-machine");
    expect((loaded as L4StateMachine).entity).toBe("Order");
    expect((loaded as L4StateMachine).transitions).toHaveLength(2);
  });

  it("read malformed JSON returns null", async () => {
    const malformedPath = path.join(root, ".svp", "l4", "malformed-flow.json");
    await mkdir(path.join(root, ".svp", "l4"), { recursive: true });
    await writeFile(malformedPath, "not-json-at-all", "utf8");
    const result = await readL4(root, "malformed-flow");
    expect(result).toBeNull();
  });
});

// ── store L5 ──

describe("store L5", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-test-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("write then read roundtrip", async () => {
    const bp = makeL5("my-blueprint");
    await writeL5(root, bp);
    const loaded = await readL5(root);
    expect(loaded).toEqual(bp);
  });

  it("read non-existent returns null", async () => {
    const freshRoot = await mkdtemp(path.join(tmpdir(), "svp-l5-none-"));
    try {
      const result = await readL5(freshRoot);
      expect(result).toBeNull();
    } finally {
      await rm(freshRoot, { recursive: true });
    }
  });

  it("overwrite existing L5", async () => {
    const original = makeL5("bp-overwrite");
    await writeL5(root, original);
    const updated = makeL5("bp-overwrite", {
      name: "Updated Blueprint",
      version: "2.0.0",
      contentHash: "new-hash",
    });
    await writeL5(root, updated);
    const loaded = await readL5(root);
    expect(loaded).toEqual(updated);
    expect(loaded?.name).toBe("Updated Blueprint");
    expect(loaded?.version).toBe("2.0.0");
  });

  it("L5 with empty arrays (constraints, domains, integrations)", async () => {
    const emptyRoot = await mkdtemp(path.join(tmpdir(), "svp-l5-empty-"));
    try {
      const bp = makeL5("empty-arrays-bp", {
        constraints: [],
        domains: [],
        integrations: [],
      });
      await writeL5(emptyRoot, bp);
      const loaded = await readL5(emptyRoot);
      expect(loaded).toEqual(bp);
      expect(loaded?.constraints).toEqual([]);
      expect(loaded?.domains).toEqual([]);
      expect(loaded?.integrations).toEqual([]);
    } finally {
      await rm(emptyRoot, { recursive: true });
    }
  });

  it("L5 with populated domains and integrations", async () => {
    const richRoot = await mkdtemp(path.join(tmpdir(), "svp-l5-rich-"));
    try {
      const bp = makeL5("rich-bp", {
        domains: [
          { name: "auth", description: "Auth domain", dependencies: [] },
          { name: "billing", description: "Billing domain", dependencies: ["auth"] },
          {
            name: "notifications",
            description: "Notifications",
            dependencies: ["auth", "billing"],
          },
        ],
        integrations: [
          { name: "postgres", type: "database", description: "Main DB" },
          { name: "stripe", type: "api", description: "Payment processor" },
          { name: "kafka", type: "messageQueue", description: "Event bus" },
          { name: "s3", type: "storage", description: "File storage" },
        ],
      });
      await writeL5(richRoot, bp);
      const loaded = await readL5(richRoot);
      expect(loaded).toEqual(bp);
      expect(loaded?.domains).toHaveLength(3);
      expect(loaded?.integrations).toHaveLength(4);
      expect(loaded?.domains[2].dependencies).toEqual(["auth", "billing"]);
    } finally {
      await rm(richRoot, { recursive: true });
    }
  });

  it("read malformed JSON returns null", async () => {
    const malformedRoot = await mkdtemp(path.join(tmpdir(), "svp-l5-bad-"));
    try {
      await mkdir(path.join(malformedRoot, ".svp"), { recursive: true });
      await writeFile(path.join(malformedRoot, ".svp", "l5.json"), "{bad json", "utf8");
      const result = await readL5(malformedRoot);
      expect(result).toBeNull();
    } finally {
      await rm(malformedRoot, { recursive: true });
    }
  });
});

// ── store L2 ──

describe("store L2", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-test-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("write then read roundtrip", async () => {
    const block = makeL2("roundtrip-l2");
    await writeL2(root, block);
    const loaded = await readL2(root, "roundtrip-l2");
    expect(loaded).toEqual(block);
  });

  it("read non-existent returns null", async () => {
    const result = await readL2(root, "no-such-l2");
    expect(result).toBeNull();
  });

  it("list returns written IDs", async () => {
    await writeL2(root, makeL2("l2-x"));
    await writeL2(root, makeL2("l2-y"));
    const ids = await listL2(root);
    expect(ids).toContain("l2-x");
    expect(ids).toContain("l2-y");
  });

  it("list empty returns empty array", async () => {
    const emptyRoot = await mkdtemp(path.join(tmpdir(), "svp-l2-empty-"));
    try {
      await mkdir(path.join(emptyRoot, ".svp", "l2"), { recursive: true });
      const ids = await listL2(emptyRoot);
      expect(ids).toEqual([]);
    } finally {
      await rm(emptyRoot, { recursive: true });
    }
  });

  it("overwrite existing L2", async () => {
    const original = makeL2("overwrite-l2");
    await writeL2(root, original);
    const updated = makeL2("overwrite-l2", {
      language: "python",
      contentHash: "updated-content-hash",
    });
    await writeL2(root, updated);
    const loaded = await readL2(root, "overwrite-l2");
    expect(loaded).toEqual(updated);
    expect(loaded?.language).toBe("python");
  });

  it("multiple L2 blocks", async () => {
    const multiRoot = await mkdtemp(path.join(tmpdir(), "svp-l2-multi-"));
    try {
      await writeL2(multiRoot, makeL2("cb1"));
      await writeL2(multiRoot, makeL2("cb2"));
      await writeL2(multiRoot, makeL2("cb3"));
      const ids = await listL2(multiRoot);
      expect(ids.toSorted()).toEqual(["cb1", "cb2", "cb3"]);
    } finally {
      await rm(multiRoot, { recursive: true });
    }
  });

  it("read malformed JSON returns null", async () => {
    const malformedPath = path.join(root, ".svp", "l2", "malformed-l2.json");
    await mkdir(path.join(root, ".svp", "l2"), { recursive: true });
    await writeFile(malformedPath, "{{{{ definitely not json", "utf8");
    const result = await readL2(root, "malformed-l2");
    expect(result).toBeNull();
  });
});

describe("store file/function manifests", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-manifest-store-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("exports file and function manifest store helpers", () => {
    expect("readFileManifest" in store).toBe(true);
    expect("writeFileManifest" in store).toBe(true);
    expect("listFileManifests" in store).toBe(true);
    expect("readFunctionManifest" in store).toBe(true);
    expect("writeFunctionManifest" in store).toBe(true);
    expect("listFunctionManifests" in store).toBe(true);
  });

  it("writes, reads, and lists file manifests under .svp/file", async () => {
    const manifest = makeFileManifest("store");

    await store.writeFileManifest(root, manifest);

    await expect(store.readFileManifest(root, "store")).resolves.toEqual(manifest);
    await expect(store.listFileManifests(root)).resolves.toContain("store");
    expect(manifest.revision).toEqual(REV);
    expect(manifest.contentHash).toBe("file-manifest-store");
  });

  it("writes, reads, and lists function manifests under .svp/fn", async () => {
    const manifest = makeFunctionManifest("store-read", { fileRef: "store" });

    await store.writeFunctionManifest(root, manifest);

    await expect(store.readFunctionManifest(root, "store-read")).resolves.toEqual(manifest);
    await expect(store.listFunctionManifests(root)).resolves.toContain("store-read");
    expect(manifest.revision).toEqual(REV);
    expect(manifest.contentHash).toBe("function-manifest-store-read");
  });

  it("returns null or empty arrays when file/function manifests are missing", async () => {
    const emptyRoot = await mkdtemp(path.join(tmpdir(), "svp-manifest-empty-"));

    try {
      await expect(store.readFileManifest(emptyRoot, "missing")).resolves.toBeNull();
      await expect(store.readFunctionManifest(emptyRoot, "missing")).resolves.toBeNull();
      await expect(store.listFileManifests(emptyRoot)).resolves.toEqual([]);
      await expect(store.listFunctionManifests(emptyRoot)).resolves.toEqual([]);
    } finally {
      await rm(emptyRoot, { recursive: true });
    }
  });
});

// ── Cross-layer ──

describe("cross-layer", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-cross-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("all four layers coexist in same .svp/ directory", async () => {
    const l5 = makeL5("coexist-blueprint");
    const l4 = makeL4Flow("coexist-flow");
    const l3 = makeL3("coexist-block");
    const l2 = makeL2("coexist-code");

    await writeL5(root, l5);
    await writeL4(root, l4);
    await writeL3(root, l3);
    await writeL2(root, l2);

    const loadedL5 = await readL5(root);
    const loadedL4 = await readL4(root, "coexist-flow");
    const loadedL3 = await readL3(root, "coexist-block");
    const loadedL2 = await readL2(root, "coexist-code");

    expect(loadedL5).toEqual(l5);
    expect(loadedL4).toEqual(l4);
    expect(loadedL3).toEqual(l3);
    expect(loadedL2).toEqual(l2);
  });

  it("writing to one layer does not affect other layers", async () => {
    const l3a = makeL3("isolation-block", { contentHash: "original-hash" });
    const l4a = makeL4Flow("isolation-flow");
    const l2a = makeL2("isolation-code");

    await writeL3(root, l3a);
    await writeL4(root, l4a);
    await writeL2(root, l2a);

    // Overwrite L3 with a new version
    const l3b = makeL3("isolation-block", { name: "Changed Name", contentHash: "changed-hash" });
    await writeL3(root, l3b);

    // L4 and L2 should be unaffected
    const loadedL4 = await readL4(root, "isolation-flow");
    const loadedL2 = await readL2(root, "isolation-code");
    const loadedL3 = await readL3(root, "isolation-block");

    expect(loadedL4).toEqual(l4a);
    expect(loadedL2).toEqual(l2a);
    expect(loadedL3?.name).toBe("Changed Name");
    expect(loadedL3?.contentHash).toBe("changed-hash");
  });
});

// ── Docs ──

describe("readNodeDocs", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-docs-node-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("reads existing docs.md", async () => {
    const docsDir = path.join(root, "nodes", "my-node");
    await mkdir(docsDir, { recursive: true });
    await writeFile(path.join(docsDir, "docs.md"), "## Intent\nTest docs content", "utf8");
    const result = await readNodeDocs(root, "my-node");
    expect(result).toBe("## Intent\nTest docs content");
  });

  it("returns null when docs.md does not exist", async () => {
    const result = await readNodeDocs(root, "nonexistent-node");
    expect(result).toBeNull();
  });

  it("returns null when node directory does not exist", async () => {
    const freshRoot = await mkdtemp(path.join(tmpdir(), "svp-docs-empty-"));
    try {
      const result = await readNodeDocs(freshRoot, "no-such-node");
      expect(result).toBeNull();
    } finally {
      await rm(freshRoot, { recursive: true });
    }
  });
});

describe("readGraphDocs", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-docs-graph-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("reads existing graph docs.md", async () => {
    const graphsDir = path.join(root, "graphs");
    await mkdir(graphsDir, { recursive: true });
    await writeFile(path.join(graphsDir, "my-flow.docs.md"), "# Flow Docs\nDetails here", "utf8");
    const result = await readGraphDocs(root, "my-flow");
    expect(result).toBe("# Flow Docs\nDetails here");
  });

  it("returns null when graph docs.md does not exist", async () => {
    const result = await readGraphDocs(root, "nonexistent-graph");
    expect(result).toBeNull();
  });
});

// ── L5 Docs ──

describe("readL5Docs", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-docs-l5-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("reads existing docs/l5.md", async () => {
    const docsDir = path.join(root, "docs");
    await mkdir(docsDir, { recursive: true });
    await writeFile(path.join(docsDir, "l5.md"), "# Architecture\nGlobal constraints", "utf8");
    const result = await readL5Docs(root);
    expect(result).toBe("# Architecture\nGlobal constraints");
  });

  it("returns null when docs/l5.md does not exist", async () => {
    const freshRoot = await mkdtemp(path.join(tmpdir(), "svp-docs-l5-empty-"));
    try {
      const result = await readL5Docs(freshRoot);
      expect(result).toBeNull();
    } finally {
      await rm(freshRoot, { recursive: true });
    }
  });
});

// ── L2 Docs ──

describe("readL2Docs", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-docs-l2-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("reads existing impl.docs.md", async () => {
    const nodeDir = path.join(root, "nodes", "my-block");
    await mkdir(nodeDir, { recursive: true });
    await writeFile(path.join(nodeDir, "impl.docs.md"), "# Deploy Notes\nPerformance tips", "utf8");
    const result = await readL2Docs(root, "my-block");
    expect(result).toBe("# Deploy Notes\nPerformance tips");
  });

  it("returns null when impl.docs.md does not exist", async () => {
    const result = await readL2Docs(root, "nonexistent-block");
    expect(result).toBeNull();
  });
});

// ── Refs ──

describe("readNodeRefs", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-refs-node-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("returns text file with content", async () => {
    const refsDir = path.join(root, "nodes", "my-block", "refs");
    await mkdir(refsDir, { recursive: true });
    await writeFile(path.join(refsDir, "algorithm.md"), "# Luhn Check\nUse mod 10", "utf8");

    const refs = await readNodeRefs(root, "my-block");
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe("algorithm.md");
    expect(refs[0].path).toBe(path.join("nodes", "my-block", "refs", "algorithm.md"));
    expect(refs[0].isText).toBe(true);
    expect(refs[0].content).toBe("# Luhn Check\nUse mod 10");
  });

  it("returns binary file with path only (no content)", async () => {
    const refsDir = path.join(root, "nodes", "img-block", "refs");
    await mkdir(refsDir, { recursive: true });
    await writeFile(path.join(refsDir, "design.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const refs = await readNodeRefs(root, "img-block");
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe("design.png");
    expect(refs[0].isText).toBe(false);
    expect(refs[0].content).toBeUndefined();
  });

  it("returns empty array for missing directory", async () => {
    const refs = await readNodeRefs(root, "nonexistent-block");
    expect(refs).toEqual([]);
  });

  it("sorts files by name", async () => {
    const refsDir = path.join(root, "nodes", "sorted-block", "refs");
    await mkdir(refsDir, { recursive: true });
    await writeFile(path.join(refsDir, "zebra.md"), "z", "utf8");
    await writeFile(path.join(refsDir, "alpha.txt"), "a", "utf8");
    await writeFile(path.join(refsDir, "middle.ts"), "m", "utf8");

    const refs = await readNodeRefs(root, "sorted-block");
    expect(refs.map((r) => r.name)).toEqual(["alpha.txt", "middle.ts", "zebra.md"]);
  });

  it("handles mixed text and binary files", async () => {
    const refsDir = path.join(root, "nodes", "mixed-block", "refs");
    await mkdir(refsDir, { recursive: true });
    await writeFile(path.join(refsDir, "spec.md"), "# Spec", "utf8");
    await writeFile(path.join(refsDir, "mockup.fig"), Buffer.from([0x00]));
    await writeFile(path.join(refsDir, "ref.ts"), "export const x = 1;", "utf8");

    const refs = await readNodeRefs(root, "mixed-block");
    expect(refs).toHaveLength(3);

    const textRefs = refs.filter((r) => r.isText);
    const binaryRefs = refs.filter((r) => !r.isText);
    expect(textRefs).toHaveLength(2);
    expect(binaryRefs).toHaveLength(1);
    expect(binaryRefs[0].name).toBe("mockup.fig");
  });
});

describe("readGraphRefs", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-refs-graph-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("reads refs from graphs/<graphId>/refs/", async () => {
    const refsDir = path.join(root, "graphs", "order-flow", "refs");
    await mkdir(refsDir, { recursive: true });
    await writeFile(path.join(refsDir, "flow-notes.md"), "# Notes", "utf8");

    const refs = await readGraphRefs(root, "order-flow");
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe("flow-notes.md");
    expect(refs[0].isText).toBe(true);
    expect(refs[0].content).toBe("# Notes");
  });

  it("returns empty array for missing graph refs", async () => {
    const refs = await readGraphRefs(root, "no-such-graph");
    expect(refs).toEqual([]);
  });
});
