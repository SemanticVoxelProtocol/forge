import { describe, expect, it } from "vitest";
import { compileCompositeNode, compileGraph } from "./compile-graph.js";
import { parseGraphYaml } from "./parse-graph.js";
import { parseNodeYaml } from "./parse-node.js";

describe("compileGraph", () => {
  it("简单链式：hello-world (greet → uppercase)", () => {
    const yaml = `
name: hello-world
description: 接收名字，生成大写问候语
input:
  - name: name
    type: string
output:
  - name: result
    type: Greeting
nodes:
  - id: g
    type: greet
  - id: u
    type: uppercase
wires:
  - from: input.name       → to: g.name
  - from: g.greeting       → to: u.greeting
  - from: u.result         → to: output.result
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;
    expect(flow.id).toBe("hello-world");
    expect(flow.name).toBe("hello-world");

    // 应该有 2 个 process step：g → u
    const processSteps = flow.steps.filter((s) => s.action === "process");
    expect(processSteps).toHaveLength(2);

    // g 的 next 应该是 u
    const gStep = flow.steps.find((s) => s.id === "g");
    expect(gStep?.action).toBe("process");
    expect(gStep?.blockRef).toBe("greet");
    expect(gStep?.next).toBe("u");

    // u 是最后一步，没有 next
    const uStep = flow.steps.find((s) => s.id === "u");
    expect(uStep?.action).toBe("process");
    expect(uStep?.blockRef).toBe("uppercase");
    expect(uStep?.next).toBeUndefined();

    // dataFlows：只有 g.greeting → u.greeting（排除了 input.*/output.*）
    expect(flow.dataFlows).toHaveLength(1);
    expect(flow.dataFlows[0]).toEqual({
      from: "g.greeting",
      to: "u.greeting",
    });

    // hash 存在
    expect(flow.contentHash).toBeTruthy();
    expect(flow.revision.rev).toBe(1);
  });

  it("扇出检测：一个节点有多个下游", () => {
    const yaml = `
name: fan-out
nodes:
  - id: source
    type: producer
  - id: branch1
    type: consumer1
  - id: branch2
    type: consumer2
wires:
  - from: source.out → to: branch1.in
  - from: source.out → to: branch2.in
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;

    // source step 的 next 应该指向 parallel step
    const sourceStep = flow.steps.find((s) => s.id === "source");
    expect(sourceStep?.next).toBe("parallel-after-source");

    // 应该有一个 parallel step
    const parallelStep = flow.steps.find((s) => s.action === "parallel");
    expect(parallelStep).toBeTruthy();
    expect(parallelStep?.branches).toEqual(expect.arrayContaining(["branch1", "branch2"]));
  });

  it("汇聚检测：一个节点有多个上游", () => {
    const yaml = `
name: fan-in
nodes:
  - id: a
    type: nodeA
  - id: b
    type: nodeB
  - id: merge
    type: merger
wires:
  - from: a.out → to: merge.in1
  - from: b.out → to: merge.in2
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;

    // 应该有 wait step
    const waitStep = flow.steps.find((s) => s.action === "wait");
    expect(waitStep).toBeTruthy();
    expect(waitStep?.id).toBe("wait-merge");
    expect(waitStep?.waitFor).toEqual(expect.arrayContaining(["a", "b"]));
    expect(waitStep?.next).toBe("merge");
  });

  it("复合节点引用：生成 call step", () => {
    const yaml = `
name: with-composite
nodes:
  - id: pipeline
    type: order-pipeline
wires: []
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const compositeNames = new Set(["order-pipeline"]);
    const result = compileGraph(parseResult.value, compositeNames);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;
    const callStep = flow.steps.find((s) => s.action === "call");
    expect(callStep).toBeTruthy();
    expect(callStep?.flowRef).toBe("order-pipeline");
  });

  it("环检测：构造有环图报错", () => {
    const yaml = `
name: cyclic
nodes:
  - id: a
    type: nodeA
  - id: b
    type: nodeB
  - id: c
    type: nodeC
wires:
  - from: a.out → to: b.in
  - from: b.out → to: c.in
  - from: c.out → to: a.in
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CYCLE_DETECTED");
  });

  it("hash 稳定性", () => {
    const yaml = `
name: stable
nodes:
  - id: a
    type: nodeA
  - id: b
    type: nodeB
wires:
  - from: a.out → to: b.in
`;
    const parse1 = parseGraphYaml(yaml, "a.yaml");
    const parse2 = parseGraphYaml(yaml, "b.yaml");
    expect(parse1.ok && parse2.ok).toBe(true);
    if (!parse1.ok || !parse2.ok) return;

    const result1 = compileGraph(parse1.value);
    const result2 = compileGraph(parse2.value);
    expect(result1.ok && result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    expect(result1.value.contentHash).toBe(result2.value.contentHash);
  });
});

describe("compileCompositeNode", () => {
  it("编译 order-pipeline 复合节点为子 L4Flow", () => {
    const yaml = `
name: order-pipeline
description: 完整的下单流程
type: composite
pins:
  input:
    - name: request
      type: OrderRequest
  output:
    - name: result
      type: OrderResult
nodes:
  - id: val
    type: validate-order
  - id: inv
    type: check-inventory
  - id: proc
    type: process-order
wires:
  - from: input.request      → to: val.request
  - from: val.result         → to: inv.items
  - from: input.request      → to: proc.request
  - from: inv.status         → to: proc.inventory
  - from: proc.result        → to: output.result
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileCompositeNode(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;
    expect(flow.id).toBe("order-pipeline");
    expect(flow.name).toBe("order-pipeline");
    expect(flow.steps.length).toBeGreaterThan(0);

    // val 和 inv/proc 之间有依赖关系
    // val → inv, val+inv → proc (proc 有两个上游：input 直连 和 inv)
    const processSteps = flow.steps.filter((s) => s.action === "process");
    expect(processSteps.length).toBeGreaterThanOrEqual(3);
  });

  it("缺少 nodes/wires 的复合节点报错", () => {
    const yaml = `
name: broken
type: composite
pins:
  input: []
  output: []
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileCompositeNode(parseResult.value);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_COMPOSITE");
  });
});
