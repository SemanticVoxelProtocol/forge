import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
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
