// fingerprint.ts + extractors/typescript.ts 测试

import { writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTypescriptExtractor } from "./extractors/typescript.js";
import { buildFingerprint, computeSignatureHash } from "./fingerprint.js";
import type { FileFingerprint } from "./fingerprint.js";

// ── computeSignatureHash 纯函数测试 ──

describe("computeSignatureHash", () => {
  it("produces stable hash for same input", () => {
    const files: FileFingerprint[] = [
      {
        filePath: "src/a.ts",
        exports: [
          { name: "foo", kind: "function", signature: "(x: number) => string" },
          { name: "Bar", kind: "interface", signature: "Bar" },
        ],
      },
    ];

    const hash1 = computeSignatureHash(files);
    const hash2 = computeSignatureHash(files);
    expect(hash1).toBe(hash2);
  });

  it("is order-independent for files", () => {
    const fileA: FileFingerprint = {
      filePath: "src/a.ts",
      exports: [{ name: "foo", kind: "function", signature: "(x: number) => void" }],
    };
    const fileB: FileFingerprint = {
      filePath: "src/b.ts",
      exports: [{ name: "bar", kind: "function", signature: "() => string" }],
    };

    const hash1 = computeSignatureHash([fileA, fileB]);
    const hash2 = computeSignatureHash([fileB, fileA]);
    expect(hash1).toBe(hash2);
  });

  it("is order-independent for exports within a file", () => {
    const v1: FileFingerprint = {
      filePath: "src/a.ts",
      exports: [
        { name: "foo", kind: "function", signature: "() => void" },
        { name: "bar", kind: "function", signature: "() => string" },
      ],
    };
    const v2: FileFingerprint = {
      filePath: "src/a.ts",
      exports: [
        { name: "bar", kind: "function", signature: "() => string" },
        { name: "foo", kind: "function", signature: "() => void" },
      ],
    };

    expect(computeSignatureHash([v1])).toBe(computeSignatureHash([v2]));
  });

  it("changes when a signature changes", () => {
    const v1: FileFingerprint = {
      filePath: "src/a.ts",
      exports: [{ name: "foo", kind: "function", signature: "(x: number) => void" }],
    };
    const v2: FileFingerprint = {
      filePath: "src/a.ts",
      exports: [{ name: "foo", kind: "function", signature: "(x: string) => void" }],
    };

    expect(computeSignatureHash([v1])).not.toBe(computeSignatureHash([v2]));
  });
});

describe("buildFingerprint", () => {
  it("builds fingerprint with hash", () => {
    const files: FileFingerprint[] = [
      {
        filePath: "src/a.ts",
        exports: [{ name: "foo", kind: "function", signature: "() => void" }],
      },
    ];
    const fp = buildFingerprint(files);
    expect(fp.files).toEqual(files);
    expect(fp.hash).toBeTruthy();
    expect(fp.hash).toBe(computeSignatureHash(files));
  });
});

// ── TypeScript 提取器集成测试 ──

describe("createTypescriptExtractor", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `svp-fp-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("extracts exported function signatures", async () => {
    const filePath = path.join(testDir, "module.ts");
    await writeFile(
      filePath,
      `
export function greet(name: string): string {
  return "hello " + name;
}

export function add(a: number, b: number): number {
  return a + b;
}

// 内部函数，不应被提取
function internal(): void {}
`,
      "utf8",
    );

    const extractor = createTypescriptExtractor();
    const fp = await extractor.extract(filePath);

    expect(fp.exports).toHaveLength(2);

    const names = fp.exports.map((e) => e.name);
    expect(names).toContain("greet");
    expect(names).toContain("add");
    expect(names).not.toContain("internal");

    const greet = fp.exports.find((e) => e.name === "greet");
    expect(greet?.kind).toBe("function");
    expect(greet?.signature).toContain("string");
  });

  it("extracts exported interfaces and types", async () => {
    const filePath = path.join(testDir, "types.ts");
    await writeFile(
      filePath,
      `
export interface User {
  readonly id: string;
  readonly name: string;
}

export type Status = "active" | "inactive";

// 非导出不应出现
interface Internal {
  x: number;
}
`,
      "utf8",
    );

    const extractor = createTypescriptExtractor();
    const fp = await extractor.extract(filePath);

    const names = fp.exports.map((e) => e.name);
    expect(names).toContain("User");
    expect(names).toContain("Status");
    expect(names).not.toContain("Internal");
  });

  it("same hash when only implementation changes", async () => {
    const filePath = path.join(testDir, "calc.ts");

    // 版本1：原始实现
    await writeFile(filePath, `export function calc(x: number): number { return x * 2; }`, "utf8");
    const extractor = createTypescriptExtractor();
    const fp1 = await extractor.extract(filePath);

    // 版本2：改了内部实现，签名不变
    await writeFile(
      filePath,
      `export function calc(x: number): number { return x + x; /* optimized */ }`,
      "utf8",
    );
    const fp2 = await extractor.extract(filePath);

    expect(computeSignatureHash([fp1])).toBe(computeSignatureHash([fp2]));
  });

  it("different hash when signature changes", async () => {
    const filePath = path.join(testDir, "calc.ts");

    // 版本1
    await writeFile(filePath, `export function calc(x: number): number { return x * 2; }`, "utf8");
    const extractor = createTypescriptExtractor();
    const fp1 = await extractor.extract(filePath);

    // 版本2：参数类型变了
    await writeFile(filePath, `export function calc(x: string): string { return x + x; }`, "utf8");
    const fp2 = await extractor.extract(filePath);

    expect(computeSignatureHash([fp1])).not.toBe(computeSignatureHash([fp2]));
  });

  it("same hash when comments and formatting change", async () => {
    const filePath = path.join(testDir, "util.ts");

    await writeFile(
      filePath,
      `export function hello(name: string): string { return name; }`,
      "utf8",
    );
    const extractor = createTypescriptExtractor();
    const fp1 = await extractor.extract(filePath);

    // 加了注释和空行
    await writeFile(
      filePath,
      `
// This is a greeting function
// Added lots of comments

export function hello(
  name: string,
): string {
  // internal comment
  return name;
}
`,
      "utf8",
    );
    const fp2 = await extractor.extract(filePath);

    expect(computeSignatureHash([fp1])).toBe(computeSignatureHash([fp2]));
  });
});
