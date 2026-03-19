import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeBaselineFromArtifacts, computeDiff, formatDiffSummary } from "./changeset.js";
import {
  deleteChangeset,
  findActiveChangeset,
  listChangesets,
  readChangeset,
  writeChangeset,
} from "./store.js";
import type { Changeset } from "./changeset.js";
import type { CheckInput } from "./check.js";
import type { ArtifactVersion } from "./version.js";

// ── Helpers ──

const REV: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00.000Z",
};

const makeRev = (rev: number): ArtifactVersion => ({
  ...REV,
  rev,
});

const makeInput = (overrides?: Partial<CheckInput>): CheckInput => ({
  l5: {
    id: "my-project",
    name: "My Project",
    version: "1.0.0",
    intent: "test",
    constraints: [],
    domains: [],
    integrations: [],
    revision: makeRev(3),
    contentHash: "h5",
  },
  l4Flows: [
    {
      id: "checkout-flow",
      name: "Checkout",
      steps: [{ id: "s1", action: "process", blockRef: "validate-order", next: null }],
      dataFlows: [],
      revision: makeRev(2),
      contentHash: "h4",
    },
  ],
  l3Blocks: [
    {
      id: "validate-order",
      name: "Validate Order",
      input: [{ name: "order", type: "Order" }],
      output: [{ name: "result", type: "ValidationResult" }],
      validate: {},
      constraints: [],
      description: "Validates an order",
      revision: makeRev(2),
      contentHash: "h3",
    },
  ],
  l2Blocks: [],
  ...overrides,
});

// ── computeBaselineFromArtifacts ──

describe("computeBaselineFromArtifacts", () => {
  it("captures all artifact revs", () => {
    const input = makeInput();
    const baseline = computeBaselineFromArtifacts(input);

    expect(baseline).toEqual({
      "l5:my-project": 3,
      "l4:checkout-flow": 2,
      "l3:validate-order": 2,
    });
  });

  it("handles empty input", () => {
    const input: CheckInput = {
      l4Flows: [],
      l3Blocks: [],
      l2Blocks: [],
    };
    const baseline = computeBaselineFromArtifacts(input);
    expect(baseline).toEqual({});
  });

  it("includes L2 blocks when present", () => {
    const input = makeInput({
      l2Blocks: [
        {
          id: "validate-order-impl",
          blockRef: "validate-order",
          language: "typescript",
          files: ["src/validate.ts"],
          sourceHash: "sh",
          contentHash: "ch",
          revision: makeRev(1),
        },
      ],
    });
    const baseline = computeBaselineFromArtifacts(input);
    expect(baseline["l2:validate-order-impl"]).toBe(1);
  });
});

// ── computeDiff ──

describe("computeDiff", () => {
  it("detects created artifacts", () => {
    const baseline = { "l5:proj": 1 };
    const current = { "l5:proj": 1, "l3:new-block": 1 };
    const diff = computeDiff(baseline, current);

    expect(diff.created).toEqual([{ layer: "l3", id: "new-block", currentRev: 1 }]);
    expect(diff.unchanged).toEqual([{ layer: "l5", id: "proj", rev: 1 }]);
    expect(diff.modified).toEqual([]);
  });

  it("detects modified artifacts", () => {
    const baseline = { "l3:validate-order": 2 };
    const current = { "l3:validate-order": 4 };
    const diff = computeDiff(baseline, current);

    expect(diff.modified).toEqual([{ layer: "l3", id: "validate-order", fromRev: 2, toRev: 4 }]);
    expect(diff.created).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("detects unchanged artifacts", () => {
    const baseline = { "l5:proj": 3, "l4:flow": 2 };
    const current = { "l5:proj": 3, "l4:flow": 2 };
    const diff = computeDiff(baseline, current);

    expect(diff.unchanged).toHaveLength(2);
    expect(diff.created).toEqual([]);
    expect(diff.modified).toEqual([]);
  });

  it("handles empty baseline (all created)", () => {
    const baseline = {};
    const current = { "l5:proj": 1, "l3:block": 1 };
    const diff = computeDiff(baseline, current);

    expect(diff.created).toHaveLength(2);
    expect(diff.modified).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("handles empty current", () => {
    const baseline = { "l5:proj": 1 };
    const current = {};
    const diff = computeDiff(baseline, current);

    expect(diff.created).toEqual([]);
    expect(diff.modified).toEqual([]);
    expect(diff.unchanged).toEqual([]);
  });

  it("handles mixed scenario", () => {
    const baseline = { "l5:proj": 1, "l3:a": 2, "l4:flow": 3 };
    const current = { "l5:proj": 1, "l3:a": 5, "l4:flow": 3, "l3:b": 1 };
    const diff = computeDiff(baseline, current);

    expect(diff.created).toEqual([{ layer: "l3", id: "b", currentRev: 1 }]);
    expect(diff.modified).toEqual([{ layer: "l3", id: "a", fromRev: 2, toRev: 5 }]);
    expect(diff.unchanged).toHaveLength(2);
  });
});

// ── formatDiffSummary ──

describe("formatDiffSummary", () => {
  it("formats created, modified, unchanged", () => {
    const output = formatDiffSummary({
      created: [{ layer: "l3", id: "new-block", currentRev: 1 }],
      modified: [{ layer: "l3", id: "old-block", fromRev: 1, toRev: 3 }],
      unchanged: [{ layer: "l5", id: "proj", rev: 2 }],
    });

    expect(output).toContain("Created (1):");
    expect(output).toContain("+ l3/new-block");
    expect(output).toContain("Modified (1):");
    expect(output).toContain("~ l3/old-block");
    expect(output).toContain("Unchanged (1):");
    expect(output).toContain(". l5/proj");
  });

  it("shows 'No artifacts' for empty diff", () => {
    const output = formatDiffSummary({ created: [], modified: [], unchanged: [] });
    expect(output).toContain("No artifacts in scope.");
  });
});

// ── Store: changeset CRUD ──

const makeChangeset = (id: string, status: "active" | "completed" = "active"): Changeset => ({
  id,
  name: id,
  reason: "test reason",
  status,
  baseline: { "l5:proj": 1, "l3:block": 2 },
  createdAt: "2024-06-01T00:00:00.000Z",
  ...(status === "completed" ? { completedAt: "2024-06-02T00:00:00.000Z" } : {}),
});

describe("store changeset", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "svp-changeset-"));
    await mkdir(path.join(root, ".svp", "changesets"), { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true });
  });

  it("write then read roundtrip", async () => {
    const cs = makeChangeset("test-cs");
    await writeChangeset(root, cs);
    const loaded = await readChangeset(root, "test-cs");
    expect(loaded).toEqual(cs);
  });

  it("read non-existent returns null", async () => {
    const result = await readChangeset(root, "nope");
    expect(result).toBeNull();
  });

  it("list returns written ids", async () => {
    await writeChangeset(root, makeChangeset("cs-a"));
    await writeChangeset(root, makeChangeset("cs-b"));
    const ids = await listChangesets(root);
    expect(ids).toContain("cs-a");
    expect(ids).toContain("cs-b");
  });

  it("delete removes changeset", async () => {
    await writeChangeset(root, makeChangeset("cs-del"));
    await deleteChangeset(root, "cs-del");
    const loaded = await readChangeset(root, "cs-del");
    expect(loaded).toBeNull();
  });

  it("delete non-existent is a no-op", async () => {
    await expect(deleteChangeset(root, "no-such-cs")).resolves.toBeUndefined();
  });

  it("findActiveChangeset returns active", async () => {
    const isoRoot = await mkdtemp(path.join(tmpdir(), "svp-cs-find-"));
    try {
      await mkdir(path.join(isoRoot, ".svp", "changesets"), { recursive: true });
      await writeChangeset(isoRoot, makeChangeset("cs-completed", "completed"));
      await writeChangeset(isoRoot, makeChangeset("cs-active", "active"));
      const active = await findActiveChangeset(isoRoot);
      expect(active).not.toBeNull();
      expect(active!.id).toBe("cs-active");
    } finally {
      await rm(isoRoot, { recursive: true });
    }
  });

  it("findActiveChangeset returns null when none active", async () => {
    const isolatedRoot = await mkdtemp(path.join(tmpdir(), "svp-cs-none-"));
    try {
      await mkdir(path.join(isolatedRoot, ".svp", "changesets"), { recursive: true });
      await writeChangeset(isolatedRoot, makeChangeset("done-cs", "completed"));
      const active = await findActiveChangeset(isolatedRoot);
      expect(active).toBeNull();
    } finally {
      await rm(isolatedRoot, { recursive: true });
    }
  });

  it("findActiveChangeset returns null on empty dir", async () => {
    const emptyRoot = await mkdtemp(path.join(tmpdir(), "svp-cs-empty-"));
    try {
      const active = await findActiveChangeset(emptyRoot);
      expect(active).toBeNull();
    } finally {
      await rm(emptyRoot, { recursive: true });
    }
  });
});
