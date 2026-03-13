// svp check CLI 命令的集成测试
// 创建临时 .svp/ 目录，写入测试数据，调用 check 命令逻辑

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { check } from "../../core/check.js";
import { computeHash } from "../../core/hash.js";
import {
  listL2,
  listL3,
  listL4,
  readL2,
  readL3,
  readL4,
  readL5,
  writeL2,
  writeL3,
  writeL4,
  writeL5,
} from "../../core/store.js";
import type { CheckInput } from "../../core/check.js";
import type { L2CodeBlock } from "../../core/l2.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Flow } from "../../core/l4.js";
import type { L5Blueprint } from "../../core/l5.js";
import type { ArtifactVersion } from "../../core/version.js";

// ── 测试用的 fixture 工厂 ──

const REV1: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00Z",
};

function makeL3(overrides: Partial<L3Block> = {}): L3Block {
  const base: Omit<L3Block, "contentHash" | "revision"> = {
    id: "validate-order",
    name: "Validate Order",
    input: [{ name: "request", type: "OrderRequest" }],
    output: [{ name: "result", type: "ValidationResult" }],
    validate: { request: "required" },
    constraints: ["output.result.valid iff output.result.errors is empty"],
    description: "Validate the order request",
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, contentHash };
}

function makeL4(blockIds: string[], overrides: Partial<L4Flow> = {}): L4Flow {
  const steps = blockIds.map((blockId, index) => ({
    id: `s${String(index)}`,
    action: "process" as const,
    blockRef: blockId,
    next: index < blockIds.length - 1 ? `s${String(index + 1)}` : null,
  }));

  const base: Omit<L4Flow, "contentHash" | "revision"> = {
    id: "create-order",
    name: "Create Order",
    steps,
    dataFlows: [],
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, contentHash };
}

function makeL5(overrides: Partial<L5Blueprint> = {}): L5Blueprint {
  const base: Omit<L5Blueprint, "contentHash" | "revision"> = {
    id: "my-project",
    name: "My Project",
    version: "0.1.0",
    intent: "An order management system",
    constraints: ["Must handle 1000 orders/sec"],
    domains: [{ name: "order", description: "订单域", dependencies: [] }],
    integrations: [{ name: "stripe", type: "api", description: "Payment gateway" }],
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, contentHash };
}

function makeL2(l3: L3Block, overrides: Partial<L2CodeBlock> = {}): L2CodeBlock {
  const base: Omit<L2CodeBlock, "contentHash" | "sourceHash" | "revision"> = {
    id: l3.id,
    blockRef: l3.id,
    language: "typescript",
    files: [`src/${l3.id}.ts`],
    ...overrides,
  };
  const contentHash = computeHash(base as Record<string, unknown>);
  return { ...base, revision: REV1, sourceHash: l3.contentHash, contentHash };
}

// ── 集成测试 ──

describe("svp check CLI integration", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = path.join(
      tmpdir(),
      `svp-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    );
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("loads data from .svp/ and passes clean check", async () => {
    const l3 = makeL3();
    const l4 = makeL4(["validate-order"]);
    const l5 = makeL5();
    const l2 = makeL2(l3);

    await writeL5(testRoot, l5);
    await writeL3(testRoot, l3);
    await writeL4(testRoot, l4);
    await writeL2(testRoot, l2);

    // 验证 store 写入成功
    const loadedL5 = await readL5(testRoot);
    expect(loadedL5).not.toBeNull();

    const l3Ids = await listL3(testRoot);
    expect(l3Ids).toContain("validate-order");

    const l4Ids = await listL4(testRoot);
    expect(l4Ids).toContain("create-order");

    const l2Ids = await listL2(testRoot);
    expect(l2Ids).toContain("validate-order");

    // 加载全部数据并 check
    const l4Results = await Promise.all(l4Ids.map(async (id) => readL4(testRoot, id)));
    const l3Results = await Promise.all(l3Ids.map(async (id) => readL3(testRoot, id)));
    const l2Results = await Promise.all(l2Ids.map(async (id) => readL2(testRoot, id)));

    const input: CheckInput = {
      l5: loadedL5 ?? undefined,
      l4Flows: l4Results.filter((f): f is L4Flow => f !== null),
      l3Blocks: l3Results.filter((b): b is L3Block => b !== null),
      l2Blocks: l2Results.filter((c): c is L2CodeBlock => c !== null),
    };

    const report = check(input);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
  });

  it("detects hash mismatch after manual JSON edit", async () => {
    const l3 = makeL3();
    await writeL3(testRoot, l3);

    // 手动篡改 JSON 文件，不更新 hash
    const filePath = path.join(testRoot, ".svp", "l3", "validate-order.json");
    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    data.description = "TAMPERED";
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");

    const tampered = await readL3(testRoot, "validate-order");
    expect(tampered).not.toBeNull();

    const report = check({
      l4Flows: [],
      l3Blocks: [tampered!],
      l2Blocks: [],
    });

    expect(report.summary.errors).toBe(1);
    expect(report.issues[0].code).toBe("HASH_MISMATCH");
  });

  it("detects source drift (L3 changed after L2 generated)", async () => {
    const l3Original = makeL3();
    const l2 = makeL2(l3Original);

    // L3 后来改了（新版本），但 L2 还是旧的 sourceHash
    const l3Updated = makeL3({ description: "Updated validation logic" });

    await writeL3(testRoot, l3Updated);
    await writeL2(testRoot, l2);

    const report = check({
      l4Flows: [],
      l3Blocks: [l3Updated],
      l2Blocks: [l2],
    });

    expect(report.summary.warnings).toBe(1);
    expect(report.issues[0].code).toBe("SOURCE_DRIFT");
  });

  it("returns empty report for empty .svp/ directory", async () => {
    // 不写任何数据
    const l3Ids = await listL3(testRoot);
    const l4Ids = await listL4(testRoot);
    const l2Ids = await listL2(testRoot);
    const l5 = await readL5(testRoot);

    expect(l3Ids).toEqual([]);
    expect(l4Ids).toEqual([]);
    expect(l2Ids).toEqual([]);
    expect(l5).toBeNull();

    const report = check({
      l5: undefined,
      l4Flows: [],
      l3Blocks: [],
      l2Blocks: [],
    });

    expect(report.issues).toEqual([]);
    expect(report.summary.errors).toBe(0);
  });

  it("detects missing block ref when L3 is deleted", async () => {
    const _l3 = makeL3();
    const l4 = makeL4(["validate-order"]);

    // 只写 L4，不写 L3（模拟 L3 被删除的场景）
    await writeL4(testRoot, l4);

    const loadedL4 = await readL4(testRoot, "create-order");
    expect(loadedL4).not.toBeNull();

    const report = check({
      l4Flows: [loadedL4!],
      l3Blocks: [],
      l2Blocks: [],
    });

    expect(report.summary.errors).toBe(1);
    expect(report.issues[0].code).toBe("MISSING_BLOCK_REF");
  });
});
