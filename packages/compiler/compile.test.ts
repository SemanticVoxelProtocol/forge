import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileBlueprint } from "./compile.js";
import type { L3Block } from "../core/l3.js";
import type { L4Flow } from "../core/l4.js";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "../../examples");
const TEMP_DIR = path.resolve(import.meta.dirname, "../../.test-output");

describe("compileBlueprint", () => {
  beforeEach(async () => {
    // 创建临时输出目录（复制 example 结构）
    await mkdir(TEMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEMP_DIR, { recursive: true, force: true });
  });

  it("端到端：编译 hello-world 项目", async () => {
    const projectRoot = path.join(FIXTURES_DIR, "hello-world");
    const result = await compileBlueprint(projectRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.l3Blocks).toContain("greet");
    expect(result.value.l3Blocks).toContain("uppercase");
    expect(result.value.l4Flows).toContain("hello-world");

    // 验证 .svp/l3/greet.json 生成了
    const greetPath = path.join(projectRoot, ".svp", "l3", "greet.json");
    expect(existsSync(greetPath)).toBe(true);

    const greetBlock = JSON.parse(await readFile(greetPath, "utf8")) as L3Block;
    expect(greetBlock.id).toBe("greet");
    expect(greetBlock.input).toHaveLength(1);
    expect(greetBlock.output).toHaveLength(1);
    expect(greetBlock.contentHash).toBeTruthy();

    // 验证 .svp/l4/hello-world.json 生成了
    const flowPath = path.join(projectRoot, ".svp", "l4", "hello-world.json");
    expect(existsSync(flowPath)).toBe(true);

    const flow = JSON.parse(await readFile(flowPath, "utf8")) as L4Flow;
    expect(flow.id).toBe("hello-world");
    expect(flow.steps.length).toBeGreaterThan(0);
    expect(flow.contentHash).toBeTruthy();
  });

  it("端到端：编译 order-service 项目", async () => {
    const projectRoot = path.join(FIXTURES_DIR, "order-service");
    const result = await compileBlueprint(projectRoot);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 原子节点应生成 L3
    expect(result.value.l3Blocks).toContain("validate-order");
    expect(result.value.l3Blocks).toContain("check-inventory");
    expect(result.value.l3Blocks).toContain("process-order");

    // 复合节点生成 L4
    expect(result.value.l4Flows).toContain("order-pipeline");
    // 图也生成 L4
    expect(result.value.l4Flows).toContain("order-service");

    // 验证 order-pipeline L4 中引用了子节点
    const pipelinePath = path.join(projectRoot, ".svp", "l4", "order-pipeline.json");
    expect(existsSync(pipelinePath)).toBe(true);

    const pipeline = JSON.parse(await readFile(pipelinePath, "utf8")) as L4Flow;
    expect(pipeline.steps.length).toBeGreaterThan(0);

    // order-service 图引用了 order-pipeline 复合节点，应生成 call step
    const servicePath = path.join(projectRoot, ".svp", "l4", "order-service.json");
    expect(existsSync(servicePath)).toBe(true);

    const service = JSON.parse(await readFile(servicePath, "utf8")) as L4Flow;
    const callStep = service.steps.find((s) => s.action === "call");
    expect(callStep).toBeTruthy();
    expect(callStep?.flowRef).toBe("order-pipeline");
  });

  it("空项目不报错", async () => {
    const result = await compileBlueprint(TEMP_DIR);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.l3Blocks).toHaveLength(0);
    expect(result.value.l4Flows).toHaveLength(0);
  });

  it("幂等性：多次编译结果一致", async () => {
    const projectRoot = path.join(FIXTURES_DIR, "hello-world");

    const result1 = await compileBlueprint(projectRoot);
    expect(result1.ok).toBe(true);

    const greetPath = path.join(projectRoot, ".svp", "l3", "greet.json");
    const content1 = await readFile(greetPath, "utf8");

    const result2 = await compileBlueprint(projectRoot);
    expect(result2.ok).toBe(true);

    const content2 = await readFile(greetPath, "utf8");

    // contentHash 应该一致（revision.timestamp 会变，但 hash 基于内容）
    const block1 = JSON.parse(content1) as L3Block;
    const block2 = JSON.parse(content2) as L3Block;
    expect(block1.contentHash).toBe(block2.contentHash);
  });
});

// ---------------------------------------------------------------------------
// Error path and edge case tests
// ---------------------------------------------------------------------------

describe("compileBlueprint – error paths", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      TEMP_DIR,
      `err-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Helper: write a file, creating parent dirs as needed
  async function writeAt(rel: string, content: string): Promise<void> {
    const full = path.join(tmpDir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }

  it("returns error when node.yaml has invalid YAML syntax", async () => {
    await writeAt("nodes/bad-node/node.yaml", "key: [unclosed bracket");

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("YAML_PARSE_ERROR");
  });

  it("returns error when node.yaml missing name", async () => {
    await writeAt(
      "nodes/no-name/node.yaml",
      ["pins:", "  input:", "    - name: x", "      type: string", "  output: []"].join("\n"),
    );

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("returns error when graph file has invalid YAML", async () => {
    await writeAt("graphs/bad.yaml", "key: [unclosed bracket");

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("YAML_PARSE_ERROR");
  });

  it("returns error when graph file missing required nodes field", async () => {
    await writeAt("graphs/no-nodes.yaml", ["name: no-nodes", "wires: []"].join("\n"));

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("returns error when graph has cyclic dependencies", async () => {
    // node a → b → a forms a cycle
    await writeAt(
      "graphs/cycle.yaml",
      [
        "name: cycle-graph",
        "nodes:",
        "  - id: a",
        "    type: alpha",
        "  - id: b",
        "    type: beta",
        "wires:",
        "  - from: a.out",
        "    to: b.in",
        "  - from: b.out",
        "    to: a.in",
      ].join("\n"),
    );

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CYCLE_DETECTED");
  });
});

describe("compileBlueprint – edge cases", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      TEMP_DIR,
      `edge-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeAt(rel: string, content: string): Promise<void> {
    const full = path.join(tmpDir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }

  const ATOMIC_NODE_YAML = [
    "name: alpha",
    "pins:",
    "  input:",
    "    - name: x",
    "      type: string",
    "  output:",
    "    - name: y",
    "      type: string",
  ].join("\n");

  it("skips node subdirectory without node.yaml", async () => {
    // empty-node dir has no node.yaml; valid-node has one
    await mkdir(path.join(tmpDir, "nodes", "empty-node"), { recursive: true });
    await writeAt("nodes/valid-node/node.yaml", ATOMIC_NODE_YAML);

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.l3Blocks).toContain("alpha");
    expect(result.value.l3Blocks).toHaveLength(1);
  });

  it("accepts .yml extension for graph files", async () => {
    await writeAt("nodes/alpha-node/node.yaml", ATOMIC_NODE_YAML);
    await writeAt(
      "graphs/flow.yml",
      ["name: flow", "nodes:", "  - id: a", "    type: alpha", "wires: []"].join("\n"),
    );

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.l4Flows).toContain("flow");
  });

  it("compiles project with only nodes/ directory (no graphs/)", async () => {
    await writeAt("nodes/alpha-node/node.yaml", ATOMIC_NODE_YAML);

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.l3Blocks).toContain("alpha");
    expect(result.value.l4Flows).toHaveLength(0);
  });

  it("compiles project with only graphs/ directory (no nodes/)", async () => {
    // Graph with a single node, no separate node files
    await writeAt(
      "graphs/standalone.yaml",
      ["name: standalone", "nodes:", "  - id: a", "    type: some-external-node", "wires: []"].join(
        "\n",
      ),
    );

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.l4Flows).toContain("standalone");
    expect(result.value.l3Blocks).toHaveLength(0);
  });

  it("compiles composite node into L4Flow", async () => {
    // Two atomic sub-nodes
    await writeAt(
      "nodes/step-a/node.yaml",
      [
        "name: step-a",
        "pins:",
        "  input:",
        "    - name: in",
        "      type: string",
        "  output:",
        "    - name: out",
        "      type: string",
      ].join("\n"),
    );
    await writeAt(
      "nodes/step-b/node.yaml",
      [
        "name: step-b",
        "pins:",
        "  input:",
        "    - name: in",
        "      type: string",
        "  output:",
        "    - name: out",
        "      type: string",
      ].join("\n"),
    );
    // Composite node referencing them
    await writeAt(
      "nodes/my-pipeline/node.yaml",
      [
        "name: my-pipeline",
        "type: composite",
        "pins:",
        "  input:",
        "    - name: data",
        "      type: string",
        "  output:",
        "    - name: result",
        "      type: string",
        "nodes:",
        "  - id: sa",
        "    type: step-a",
        "  - id: sb",
        "    type: step-b",
        "wires:",
        "  - from: input.data",
        "    to: sa.in",
        "  - from: sa.out",
        "    to: sb.in",
        "  - from: sb.out",
        "    to: output.result",
      ].join("\n"),
    );

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.l3Blocks).toContain("step-a");
    expect(result.value.l3Blocks).toContain("step-b");
    expect(result.value.l4Flows).toContain("my-pipeline");
  });

  it("compiles project with multiple nodes and graphs", async () => {
    // 3 atomic nodes
    for (const n of ["node-x", "node-y", "node-z"]) {
      await writeAt(
        `nodes/${n}/node.yaml`,
        [
          `name: ${n}`,
          "pins:",
          "  input:",
          "    - name: in",
          "      type: string",
          "  output:",
          "    - name: out",
          "      type: string",
        ].join("\n"),
      );
    }
    // 1 graph referencing all three in a chain
    await writeAt(
      "graphs/multi.yaml",
      [
        "name: multi-flow",
        "nodes:",
        "  - id: x",
        "    type: node-x",
        "  - id: y",
        "    type: node-y",
        "  - id: z",
        "    type: node-z",
        "wires:",
        "  - from: x.out",
        "    to: y.in",
        "  - from: y.out",
        "    to: z.in",
      ].join("\n"),
    );

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.l3Blocks).toContain("node-x");
    expect(result.value.l3Blocks).toContain("node-y");
    expect(result.value.l3Blocks).toContain("node-z");
    expect(result.value.l4Flows).toContain("multi-flow");
  });

  it("writes compiled output to .svp/l3/ and .svp/l4/", async () => {
    await writeAt(
      "nodes/writer-node/node.yaml",
      [
        "name: writer-node",
        "pins:",
        "  input:",
        "    - name: in",
        "      type: string",
        "  output:",
        "    - name: out",
        "      type: string",
      ].join("\n"),
    );
    await writeAt(
      "graphs/writer-flow.yaml",
      ["name: writer-flow", "nodes:", "  - id: w", "    type: writer-node", "wires: []"].join("\n"),
    );

    const result = await compileBlueprint(tmpDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const l3Path = path.join(tmpDir, ".svp", "l3", "writer-node.json");
    const l4Path = path.join(tmpDir, ".svp", "l4", "writer-flow.json");

    expect(existsSync(l3Path)).toBe(true);
    expect(existsSync(l4Path)).toBe(true);

    const l3Block = JSON.parse(await readFile(l3Path, "utf8")) as L3Block;
    expect(l3Block.id).toBe("writer-node");
    expect(l3Block.contentHash).toBeTruthy();

    const l4Flow = JSON.parse(await readFile(l4Path, "utf8")) as L4Flow;
    expect(l4Flow.id).toBe("writer-flow");
    expect(l4Flow.contentHash).toBeTruthy();
  });
});
