import { describe, expect, it } from "vitest";
import { buildScanL3Prompt, buildScanL4Prompt, buildScanL5Prompt } from "../prompts/scan.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Flow } from "../../core/l4.js";
import type { ScanContext } from "../../core/scan.js";

// ── Fixtures ──

const baseRevision = {
  rev: 1,
  parentRev: null as number | null,
  source: { type: "init" as const },
  timestamp: "2024-01-01T00:00:00Z",
};

const makeScanContext = (
  files: Array<{ filePath: string }>,
  truncated = false,
): ScanContext => {
  const scannedFiles = files.map((f) => ({ filePath: f.filePath }));
  return {
    files: scannedFiles,
    summary: {
      totalFiles: scannedFiles.length,
      truncated,
    },
  };
};

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

// ── buildScanL3Prompt (Phase 1) ──

describe("buildScanL3Prompt", () => {
  it("produces valid markdown with complexity header", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL3Prompt({ scanContext: ctx });

    expect(result).toMatch(/^---\ncomplexity: heavy\n---/);
    expect(result).toContain("# Reverse-Engineer L3 Contracts");
  });

  it("includes scanned file list", () => {
    const ctx = makeScanContext([{ filePath: "src/handler.ts" }]);

    const result = buildScanL3Prompt({ scanContext: ctx });

    expect(result).toContain("src/handler.ts");
  });

  it("includes user intent when provided", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL3Prompt({ scanContext: ctx, userIntent: "order management system" });

    expect(result).toContain("System Intent");
    expect(result).toContain("order management system");
  });

  it("omits user intent section when not provided", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL3Prompt({ scanContext: ctx });

    expect(result).not.toContain("System Intent");
  });

  it("includes language directive for non-English", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL3Prompt({ scanContext: ctx, language: "zh" });

    expect(result).toContain("Chinese");
    expect(result).toContain("IMPORTANT");
  });

  it("does not include language directive for English", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL3Prompt({ scanContext: ctx, language: "en" });

    expect(result).not.toContain("IMPORTANT: All human-readable text");
  });

  it("shows truncation notice when files are truncated", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }], true);

    const result = buildScanL3Prompt({ scanContext: ctx });

    expect(result).toContain("truncated");
  });

  it("includes summary line with file count", () => {
    const ctx = makeScanContext([{ filePath: "src/a.ts" }, { filePath: "src/b.ts" }]);

    const result = buildScanL3Prompt({ scanContext: ctx });

    expect(result).toContain("2 files");
  });

  it("includes L3 schema example", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL3Prompt({ scanContext: ctx });

    expect(result).toContain('"id": "<block-id>"');
    expect(result).toContain("validate");
    expect(result).toContain("constraints");
  });

  it("instructs to run forge rehash after writing", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL3Prompt({ scanContext: ctx });

    expect(result).toContain("forge rehash l3");
    expect(result).toContain("forge prompt scan");
  });
});

// ── buildScanL4Prompt (Phase 2) ──

describe("buildScanL4Prompt", () => {
  it("produces valid markdown with complexity header", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);
    const blocks = [makeL3("validate-order")];

    const result = buildScanL4Prompt({ scanContext: ctx, l3Blocks: blocks });

    expect(result).toMatch(/^---\ncomplexity: standard\n---/);
    expect(result).toContain("# Infer L4 Flows");
  });

  it("includes L3 block summary with signatures", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);
    const blocks = [makeL3("validate-order"), makeL3("process-payment")];

    const result = buildScanL4Prompt({ scanContext: ctx, l3Blocks: blocks });

    expect(result).toContain("validate-order");
    expect(result).toContain("process-payment");
    expect(result).toContain("Request");
    expect(result).toContain("Response");
  });

  it("includes code structure for import pattern analysis", () => {
    const ctx = makeScanContext([{ filePath: "src/order.ts" }, { filePath: "src/payment.ts" }]);
    const blocks = [makeL3("order")];

    const result = buildScanL4Prompt({ scanContext: ctx, l3Blocks: blocks });

    expect(result).toContain("src/order.ts");
    expect(result).toContain("src/payment.ts");
  });

  it("includes user intent when provided", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL4Prompt({
      scanContext: ctx,
      l3Blocks: [makeL3("x")],
      userIntent: "e-commerce platform",
    });

    expect(result).toContain("e-commerce platform");
  });

  it("includes L4 flow schema example", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL4Prompt({ scanContext: ctx, l3Blocks: [makeL3("x")] });

    expect(result).toContain('"kind": "flow"');
    expect(result).toContain("dataFlows");
    expect(result).toContain("blockRef");
  });

  it("instructs to run forge rehash after writing", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL4Prompt({ scanContext: ctx, l3Blocks: [makeL3("x")] });

    expect(result).toContain("forge rehash l4");
    expect(result).toContain("forge prompt scan");
  });
});

// ── buildScanL5Prompt (Phase 3) ──

describe("buildScanL5Prompt", () => {
  it("produces valid markdown with complexity header", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);
    const blocks = [makeL3("x")];
    const flows = [makeFlow("f1", ["x"])];

    const result = buildScanL5Prompt({ scanContext: ctx, l3Blocks: blocks, l4Flows: flows });

    expect(result).toMatch(/^---\ncomplexity: standard\n---/);
    expect(result).toContain("# Synthesize L5 Blueprint");
  });

  it("includes L4 flow summary", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);
    const flows = [makeFlow("order-flow", ["validate"]), makeFlow("payment-flow", ["charge"])];

    const result = buildScanL5Prompt({
      scanContext: ctx,
      l3Blocks: [makeL3("validate"), makeL3("charge")],
      l4Flows: flows,
    });

    expect(result).toContain("order-flow");
    expect(result).toContain("payment-flow");
  });

  it("includes L3 block summary", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);
    const blocks = [makeL3("validate-order"), makeL3("process-payment")];

    const result = buildScanL5Prompt({
      scanContext: ctx,
      l3Blocks: blocks,
      l4Flows: [makeFlow("f1", ["validate-order"])],
    });

    expect(result).toContain("validate-order");
    expect(result).toContain("process-payment");
  });

  it("includes user intent when provided", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL5Prompt({
      scanContext: ctx,
      l3Blocks: [makeL3("x")],
      l4Flows: [makeFlow("f1", ["x"])],
      userIntent: "SaaS billing platform",
    });

    expect(result).toContain("SaaS billing platform");
  });

  it("includes L5 schema example", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL5Prompt({
      scanContext: ctx,
      l3Blocks: [makeL3("x")],
      l4Flows: [makeFlow("f1", ["x"])],
    });

    expect(result).toContain('"intent"');
    expect(result).toContain('"domains"');
    expect(result).toContain('"integrations"');
  });

  it("instructs to run forge rehash and forge check after writing", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL5Prompt({
      scanContext: ctx,
      l3Blocks: [makeL3("x")],
      l4Flows: [makeFlow("f1", ["x"])],
    });

    expect(result).toContain("forge rehash l5");
    expect(result).toContain("forge check");
  });

  it("includes language directive for non-English", () => {
    const ctx = makeScanContext([{ filePath: "src/index.ts" }]);

    const result = buildScanL5Prompt({
      scanContext: ctx,
      l3Blocks: [makeL3("x")],
      l4Flows: [makeFlow("f1", ["x"])],
      language: "zh",
    });

    expect(result).toContain("Chinese");
  });
});
