import { describe, expect, it } from "vitest";
import { hashL2 } from "../../core/hash.js";
import { createL2Link, relinkL2 } from "../link.js";
import type { L3Block } from "../../core/l3.js";

const baseRevision = {
  rev: 1,
  parentRev: null as number | null,
  source: { type: "init" as const },
  timestamp: "2024-01-01T00:00:00.000Z",
};

function makeL3(overrides?: Partial<L3Block>): L3Block {
  return {
    id: "validate-order",
    name: "验证订单请求",
    input: [{ name: "request", type: "OrderRequest" }],
    output: [{ name: "result", type: "ValidationResult" }],
    validate: { request: "required" },
    constraints: ["output.result.valid iff output.result.errors is empty"],
    description: "逐项校验所有字段",
    contentHash: "abc123def456",
    revision: baseRevision,
    ...overrides,
  };
}

describe("createL2Link", () => {
  it("creates L2 with correct id and blockRef matching L3", () => {
    const l3 = makeL3();
    const l2 = createL2Link({ l3Block: l3, files: ["src/validate-order.ts"] });

    expect(l2.id).toBe(l3.id);
    expect(l2.blockRef).toBe(l3.id);
  });

  it("sets sourceHash to L3 contentHash", () => {
    const l3 = makeL3();
    const l2 = createL2Link({ l3Block: l3, files: ["src/validate-order.ts"] });

    expect(l2.sourceHash).toBe(l3.contentHash);
  });

  it("computes correct contentHash", () => {
    const l3 = makeL3();
    const l2 = createL2Link({ l3Block: l3, files: ["src/validate-order.ts"] });

    const expected = hashL2({
      id: l3.id,
      blockRef: l3.id,
      language: "typescript",
      files: ["src/validate-order.ts"],
    });
    expect(l2.contentHash).toBe(expected);
  });

  it("defaults language to typescript", () => {
    const l3 = makeL3();
    const l2 = createL2Link({ l3Block: l3, files: ["src/validate-order.ts"] });

    expect(l2.language).toBe("typescript");
  });

  it("accepts custom language", () => {
    const l3 = makeL3();
    const l2 = createL2Link({ l3Block: l3, files: ["validate_order.py"], language: "python" });

    expect(l2.language).toBe("python");
  });

  it("stores file list correctly", () => {
    const l3 = makeL3();
    const files = ["src/validate-order.ts", "src/validate-order.test.ts"];
    const l2 = createL2Link({ l3Block: l3, files });

    expect(l2.files).toEqual(files);
  });

  it("creates revision with rev 1 and ai source", () => {
    const l3 = makeL3();
    const l2 = createL2Link({ l3Block: l3, files: ["src/validate-order.ts"] });

    expect(l2.revision.rev).toBe(1);
    expect(l2.revision.parentRev).toBeNull();
    expect(l2.revision.source).toEqual({ type: "ai", action: "compile" });
  });
});

describe("relinkL2", () => {
  it("updates files and sourceHash", () => {
    const l3 = makeL3();
    const existing = createL2Link({ l3Block: l3, files: ["src/old.ts"] });

    const updatedL3 = makeL3({ contentHash: "new-l3-hash" });
    const relinked = relinkL2(existing, updatedL3, ["src/new.ts", "src/new.test.ts"]);

    expect(relinked.files).toEqual(["src/new.ts", "src/new.test.ts"]);
    expect(relinked.sourceHash).toBe("new-l3-hash");
  });

  it("bumps revision", () => {
    const l3 = makeL3();
    const existing = createL2Link({ l3Block: l3, files: ["src/old.ts"] });
    const relinked = relinkL2(existing, l3, ["src/new.ts"]);

    expect(relinked.revision.rev).toBe(2);
    expect(relinked.revision.parentRev).toBe(1);
    expect(relinked.revision.source).toEqual({ type: "ai", action: "recompile" });
  });
});

// ── Additional tests ──

describe("createL2Link — additional", () => {
  it("creates L2 with empty files array", () => {
    const l3 = makeL3();
    const l2 = createL2Link({ l3Block: l3, files: [] });

    expect(l2.files).toEqual([]);
    // contentHash must still be computed without error
    expect(l2.contentHash).toBeDefined();
    expect(typeof l2.contentHash).toBe("string");
  });

  it("L2 id matches L3 block id exactly", () => {
    const l3 = makeL3({ id: "compute-discount" });
    const l2 = createL2Link({ l3Block: l3, files: ["src/compute-discount.ts"] });

    expect(l2.id).toBe("compute-discount");
    expect(l2.blockRef).toBe("compute-discount");
  });

  it("revision source is ai/compile", () => {
    const l3 = makeL3();
    const l2 = createL2Link({ l3Block: l3, files: ["src/validate-order.ts"] });

    expect(l2.revision.source).toEqual({ type: "ai", action: "compile" });
  });
});

describe("relinkL2 — additional", () => {
  it("revision source is ai/recompile", () => {
    const l3 = makeL3();
    const existing = createL2Link({ l3Block: l3, files: ["src/old.ts"] });
    const relinked = relinkL2(existing, l3, ["src/new.ts"]);

    expect(relinked.revision.source).toEqual({ type: "ai", action: "recompile" });
  });

  it("handles different number of files than original", () => {
    const l3 = makeL3();
    const existing = createL2Link({ l3Block: l3, files: ["src/a.ts"] });
    const newFiles = ["src/a.ts", "src/a.test.ts", "src/a.helper.ts"];
    const relinked = relinkL2(existing, l3, newFiles);

    expect(relinked.files).toEqual(newFiles);
    expect(relinked.files.length).toBe(3);
  });

  it("contentHash changes when files change", () => {
    const l3 = makeL3();
    const existing = createL2Link({ l3Block: l3, files: ["src/old.ts"] });
    const relinked = relinkL2(existing, l3, ["src/new.ts"]);

    expect(relinked.contentHash).not.toBe(existing.contentHash);
  });
});
