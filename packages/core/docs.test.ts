import { describe, expect, it } from "vitest";
import { checkDocs } from "./docs.js";
import type { DocsCheckInput } from "./docs.js";
import type { L3Block } from "./l3.js";
import type { L4Flow } from "./l4.js";
import type { L5Blueprint } from "./l5.js";
import type { ArtifactVersion } from "./version.js";

const REV: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00.000Z",
};

const makeL5 = (id: string): L5Blueprint => ({
  id,
  name: "Test",
  version: "1.0.0",
  intent: "test",
  constraints: [],
  domains: [],
  integrations: [],
  revision: REV,
  contentHash: "abc",
});

const makeL3 = (id: string): L3Block => ({
  id,
  name: "Test Block",
  input: [{ name: "req", type: "Request" }],
  output: [{ name: "res", type: "Response" }],
  validate: {},
  constraints: [],
  description: "test",
  revision: REV,
  contentHash: "abc",
});

const makeL4 = (id: string): L4Flow => ({
  id,
  name: "Test Flow",
  steps: [{ id: "s1", action: "process", blockRef: "b1", next: null }],
  dataFlows: [],
  revision: REV,
  contentHash: "def",
});

describe("checkDocs", () => {
  it("returns no issues when all docs exist", () => {
    const input: DocsCheckInput = {
      l5: makeL5("my-project"),
      l4Flows: [makeL4("flow-a")],
      l3Blocks: [makeL3("block-a")],
      l2Blocks: [],
      existingDocs: {
        l5: true,
        nodes: new Map([["block-a", true]]),
        graphs: new Map([["flow-a", true]]),
      },
    };
    const issues = checkDocs(input);
    expect(issues).toEqual([]);
  });

  it("reports missing L5 docs", () => {
    const input: DocsCheckInput = {
      l5: makeL5("my-project"),
      l4Flows: [],
      l3Blocks: [],
      l2Blocks: [],
      existingDocs: { l5: false, nodes: new Map(), graphs: new Map() },
    };
    const issues = checkDocs(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].layer).toBe("l5");
    expect(issues[0].code).toBe("MISSING_DOCS");
  });

  it("does not report L5 docs when no L5 exists", () => {
    const input: DocsCheckInput = {
      l5: undefined,
      l4Flows: [],
      l3Blocks: [],
      l2Blocks: [],
      existingDocs: { l5: false, nodes: new Map(), graphs: new Map() },
    };
    const issues = checkDocs(input);
    expect(issues).toEqual([]);
  });

  it("reports missing L3 node docs", () => {
    const input: DocsCheckInput = {
      l5: undefined,
      l4Flows: [],
      l3Blocks: [makeL3("block-a"), makeL3("block-b")],
      l2Blocks: [],
      existingDocs: {
        l5: false,
        nodes: new Map([["block-a", true]]),
        graphs: new Map(),
      },
    };
    const issues = checkDocs(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].entityId).toBe("block-b");
    expect(issues[0].layer).toBe("l3");
  });

  it("reports missing L4 graph docs", () => {
    const input: DocsCheckInput = {
      l5: undefined,
      l4Flows: [makeL4("flow-a"), makeL4("flow-b")],
      l3Blocks: [],
      l2Blocks: [],
      existingDocs: {
        l5: false,
        nodes: new Map(),
        graphs: new Map([["flow-b", true]]),
      },
    };
    const issues = checkDocs(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].entityId).toBe("flow-a");
    expect(issues[0].layer).toBe("l4");
  });

  it("reports all missing docs across layers", () => {
    const input: DocsCheckInput = {
      l5: makeL5("proj"),
      l4Flows: [makeL4("flow-a")],
      l3Blocks: [makeL3("block-a")],
      l2Blocks: [],
      existingDocs: { l5: false, nodes: new Map(), graphs: new Map() },
    };
    const issues = checkDocs(input);
    expect(issues).toHaveLength(3);
    for (const issue of issues) {
      expect(issue.severity).toBe("warning");
      expect(issue.code).toBe("MISSING_DOCS");
    }
  });
});
