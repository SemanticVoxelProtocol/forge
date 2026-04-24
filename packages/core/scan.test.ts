import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectScanContext } from "./scan.js";

// ── Helpers ──

let tempDir: string;

async function makeTempProject(files: Record<string, string>): Promise<string> {
  tempDir = path.join(
    tmpdir(),
    `svp-scan-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
  );
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tempDir, filePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
  }
  return tempDir;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(tempDir, { recursive: true, force: true }).catch((error: unknown) => error);
});

// ── Tests ──

describe("collectScanContext", () => {
  it("collects .ts files", async () => {
    const root = await makeTempProject({
      "src/index.ts": "export function hello() {}",
      "src/utils.ts": "export const FOO = 1;",
    });

    const result = await collectScanContext({ root, dir: "src", maxFiles: 50 });

    expect(result.files).toHaveLength(2);
    expect(result.summary.totalFiles).toBe(2);
    expect(result.summary.truncated).toBe(false);
  });

  it("includes non-.ts files for directory awareness", async () => {
    const root = await makeTempProject({
      "src/config.json": "{}",
      "src/readme.md": "# Hello",
      "src/index.ts": "export const x = 1;",
    });

    const result = await collectScanContext({ root, dir: "src", maxFiles: 50 });

    expect(result.files).toHaveLength(3);

    const jsonFile = result.files.find((f) => f.filePath.endsWith(".json"));
    expect(jsonFile).toBeDefined();

    const tsFile = result.files.find((f) => f.filePath.endsWith(".ts"));
    expect(tsFile).toBeDefined();
  });

  it("respects maxFiles cap and sets truncated flag", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      files[`src/file${String(i).padStart(2, "0")}.ts`] =
        `export const x${String(i)} = ${String(i)};`;
    }
    const root = await makeTempProject(files);

    const result = await collectScanContext({ root, dir: "src", maxFiles: 3 });

    expect(result.files).toHaveLength(3);
    expect(result.summary.totalFiles).toBe(3);
    expect(result.summary.truncated).toBe(true);
  });

  it("excludes node_modules, dist, build directories", async () => {
    const root = await makeTempProject({
      "src/index.ts": "export const a = 1;",
      "src/node_modules/dep/index.ts": "export const b = 2;",
      "src/dist/bundle.js": "var x = 1;",
      "src/build/output.js": "var y = 2;",
    });

    const result = await collectScanContext({ root, dir: "src", maxFiles: 50 });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].filePath).toContain("index.ts");
  });

  it("excludes test and spec files", async () => {
    const root = await makeTempProject({
      "src/handler.ts": "export function handle() {}",
      "src/handler.test.ts": "test('it works', () => {});",
      "src/handler.spec.ts": "describe('handler', () => {});",
      "src/utils.test.tsx": "test('renders', () => {});",
    });

    const result = await collectScanContext({ root, dir: "src", maxFiles: 50 });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].filePath).toContain("handler.ts");
    expect(result.files[0].filePath).not.toContain("test");
  });

  it("excludes .d.ts files", async () => {
    const root = await makeTempProject({
      "src/index.ts": "export const a = 1;",
      "src/types.d.ts": "declare module 'foo' {}",
    });

    const result = await collectScanContext({ root, dir: "src", maxFiles: 50 });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].filePath).not.toContain(".d.ts");
  });

  it("returns empty when dir does not exist", async () => {
    const root = await makeTempProject({});

    const result = await collectScanContext({ root, dir: "nonexistent", maxFiles: 50 });

    expect(result.files).toHaveLength(0);
    expect(result.summary.totalFiles).toBe(0);
  });

  it("sorts files by path", async () => {
    const root = await makeTempProject({
      "src/z.ts": "",
      "src/a.ts": "",
      "src/m.ts": "",
    });

    const result = await collectScanContext({ root, dir: "src", maxFiles: 50 });

    const paths = result.files.map((f) => f.filePath);
    expect(paths).toEqual([...paths].toSorted());
  });

  it("does not infer function names from source text", async () => {
    const root = await makeTempProject({
      "src/index.ts": [
        "export const alpha = 1;",
        "export function beta() {",
        "  return alpha;",
        "}",
        "export class Gamma {}",
        "export { delta, epsilon as renamedEpsilon };",
        "const hidden = 3;",
      ].join("\n"),
    });

    const result = await collectScanContext({ root, dir: "src", maxFiles: 50 });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEqual({ filePath: "src/index.ts" });
  });

  it("leaves language-specific entry point detection to AI scan prompts", async () => {
    const root = await makeTempProject({
      "src/index.ts": "export async function runTask() { return true; }",
      "src/main.py": "def run_task():\n    return True\n",
    });

    const result = await collectScanContext({ root, dir: "src", maxFiles: 50 });

    expect(result.files).toEqual([{ filePath: "src/index.ts" }, { filePath: "src/main.py" }]);
  });
});
