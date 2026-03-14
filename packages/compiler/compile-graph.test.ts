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

describe("compileGraph - single-node graph", () => {
  it("compiles single-node graph with no wires", () => {
    const yaml = `
name: solo
nodes:
  - id: only
    type: doSomething
wires: []
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;
    expect(flow.steps).toHaveLength(1);

    const step = flow.steps[0];
    expect(step.id).toBe("only");
    expect(step.action).toBe("process");
    expect(step.blockRef).toBe("doSomething");
    expect(step.next).toBeUndefined();
  });
});

describe("compileGraph - diamond DAG", () => {
  it("handles diamond pattern (A->B, A->C, B->D, C->D)", () => {
    const yaml = `
name: diamond
nodes:
  - id: a
    type: nodeA
  - id: b
    type: nodeB
  - id: c
    type: nodeC
  - id: d
    type: nodeD
wires:
  - from: a.out → to: b.in
  - from: a.out → to: c.in
  - from: b.out → to: d.in
  - from: c.out → to: d.in
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;

    // A fans out: should have parallel step after A
    const parallelStep = flow.steps.find((s) => s.id === "parallel-after-a");
    expect(parallelStep).toBeTruthy();
    expect(parallelStep?.action).toBe("parallel");
    expect(parallelStep?.branches).toEqual(["b", "c"]);

    // A's next should point to the parallel step
    const aStep = flow.steps.find((s) => s.id === "a");
    expect(aStep?.next).toBe("parallel-after-a");

    // D has two upstreams (b and c): should have a wait step
    const waitStep = flow.steps.find((s) => s.id === "wait-d");
    expect(waitStep).toBeTruthy();
    expect(waitStep?.action).toBe("wait");
    expect(waitStep?.waitFor).toEqual(expect.arrayContaining(["b", "c"]));
    expect(waitStep?.next).toBe("d");

    // D step itself should exist
    const dStep = flow.steps.find((s) => s.id === "d");
    expect(dStep).toBeTruthy();
    expect(dStep?.action).toBe("process");
    expect(dStep?.next).toBeUndefined();
  });
});

describe("compileGraph - disconnected graph", () => {
  it("handles two disconnected nodes with no wires", () => {
    const yaml = `
name: disconnected
nodes:
  - id: alpha
    type: typeA
  - id: beta
    type: typeB
wires: []
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;
    const stepIds = flow.steps.map((s) => s.id);
    expect(stepIds).toContain("alpha");
    expect(stepIds).toContain("beta");

    const alphaStep = flow.steps.find((s) => s.id === "alpha");
    const betaStep = flow.steps.find((s) => s.id === "beta");
    expect(alphaStep?.action).toBe("process");
    expect(betaStep?.action).toBe("process");
  });
});

describe("compileGraph - long linear chain", () => {
  it("handles long linear chain A->B->C->D->E", () => {
    const yaml = `
name: long-chain
nodes:
  - id: a
    type: nodeA
  - id: b
    type: nodeB
  - id: c
    type: nodeC
  - id: d
    type: nodeD
  - id: e
    type: nodeE
wires:
  - from: a.out → to: b.in
  - from: b.out → to: c.in
  - from: c.out → to: d.in
  - from: d.out → to: e.in
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;
    const processSteps = flow.steps.filter((s) => s.action === "process");
    expect(processSteps).toHaveLength(5);

    const aStep = flow.steps.find((s) => s.id === "a");
    expect(aStep?.next).toBe("b");

    const bStep = flow.steps.find((s) => s.id === "b");
    expect(bStep?.next).toBe("c");

    const cStep = flow.steps.find((s) => s.id === "c");
    expect(cStep?.next).toBe("d");

    const dStep = flow.steps.find((s) => s.id === "d");
    expect(dStep?.next).toBe("e");

    const eStep = flow.steps.find((s) => s.id === "e");
    expect(eStep?.next).toBeUndefined();
  });
});

describe("compileGraph - composite node fan-out", () => {
  it("handles composite node that fans out to multiple downstream", () => {
    const yaml = `
name: composite-fanout
nodes:
  - id: pipeline
    type: order-pipeline
  - id: nodeA
    type: consumerA
  - id: nodeB
    type: consumerB
wires:
  - from: pipeline.out → to: nodeA.in
  - from: pipeline.out → to: nodeB.in
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const compositeNames = new Set(["order-pipeline"]);
    const result = compileGraph(parseResult.value, compositeNames);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;

    // Composite node should use action="call" with flowRef
    const pipelineStep = flow.steps.find((s) => s.id === "pipeline");
    expect(pipelineStep?.action).toBe("call");
    expect(pipelineStep?.flowRef).toBe("order-pipeline");

    // pipeline fans out: next should point to a parallel step
    expect(pipelineStep?.next).toBe("parallel-after-pipeline");

    const parallelStep = flow.steps.find((s) => s.id === "parallel-after-pipeline");
    expect(parallelStep).toBeTruthy();
    expect(parallelStep?.action).toBe("parallel");
    expect(parallelStep?.branches).toEqual(expect.arrayContaining(["nodeA", "nodeB"]));
  });
});

describe("compileGraph - hash stability with wire ordering", () => {
  it("produces same contentHash regardless of wire declaration order", () => {
    const yaml1 = `
name: order-test
nodes:
  - id: a
    type: nodeA
  - id: b
    type: nodeB
  - id: c
    type: nodeC
wires:
  - from: a.out → to: b.in
  - from: a.out → to: c.in
`;
    const yaml2 = `
name: order-test
nodes:
  - id: a
    type: nodeA
  - id: b
    type: nodeB
  - id: c
    type: nodeC
wires:
  - from: a.out → to: c.in
  - from: a.out → to: b.in
`;
    const parse1 = parseGraphYaml(yaml1, "a.yaml");
    const parse2 = parseGraphYaml(yaml2, "b.yaml");
    expect(parse1.ok && parse2.ok).toBe(true);
    if (!parse1.ok || !parse2.ok) return;

    const result1 = compileGraph(parse1.value);
    const result2 = compileGraph(parse2.value);
    expect(result1.ok && result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    expect(result1.value.contentHash).toBe(result2.value.contentHash);
  });
});

describe("compileGraph - topo sort tie-breaking", () => {
  it("breaks ties alphabetically in topological sort", () => {
    const yaml = `
name: tie-break
nodes:
  - id: charlie
    type: typeC
  - id: alpha
    type: typeA
  - id: bravo
    type: typeB
wires: []
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;
    const stepIds = flow.steps.map((s) => s.id);
    const alphaIdx = stepIds.indexOf("alpha");
    const bravoIdx = stepIds.indexOf("bravo");
    const charlieIdx = stepIds.indexOf("charlie");

    expect(alphaIdx).toBeLessThan(bravoIdx);
    expect(bravoIdx).toBeLessThan(charlieIdx);
  });
});

describe("compileCompositeNode - error cases", () => {
  it("returns error when composite node has no wires", () => {
    const yaml = `
name: missing-wires
type: composite
pins:
  input: []
  output: []
nodes:
  - id: a
    type: nodeA
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileCompositeNode(parseResult.value);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_COMPOSITE");
  });

  it("returns error when composite node has no nodes", () => {
    const yaml = `
name: missing-nodes
type: composite
pins:
  input: []
  output: []
wires:
  - from: input.x → to: output.y
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

describe("compileGraph - dataFlow generation", () => {
  it("generates dataFlows from wires between node ports", () => {
    const yaml = `
name: dataflow-test
nodes:
  - id: nodeA
    type: typeA
  - id: nodeB
    type: typeB
wires:
  - from: nodeA.output → to: nodeB.input
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;
    expect(flow.dataFlows).toHaveLength(1);
    expect(flow.dataFlows[0]).toEqual({
      from: "nodeA.output",
      to: "nodeB.input",
    });
  });

  it("filters out input/output port wires from dataFlows", () => {
    const yaml = `
name: filter-ports
input:
  - name: data
    type: string
output:
  - name: result
    type: string
nodes:
  - id: nodeA
    type: typeA
  - id: nodeB
    type: typeB
wires:
  - from: input.data     → to: nodeA.data
  - from: nodeA.out      → to: nodeB.in
  - from: nodeB.result   → to: output.result
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;
    // Only inter-node wire should be in dataFlows
    expect(flow.dataFlows).toHaveLength(1);
    expect(flow.dataFlows[0]).toEqual({
      from: "nodeA.out",
      to: "nodeB.in",
    });
  });
});

describe("compileGraph - triple fan-out", () => {
  it("handles triple fan-out (A->B, A->C, A->D)", () => {
    const yaml = `
name: triple-fanout
nodes:
  - id: a
    type: source
  - id: b
    type: consumerB
  - id: c
    type: consumerC
  - id: d
    type: consumerD
wires:
  - from: a.out → to: b.in
  - from: a.out → to: c.in
  - from: a.out → to: d.in
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileGraph(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;

    const aStep = flow.steps.find((s) => s.id === "a");
    expect(aStep?.next).toBe("parallel-after-a");

    const parallelStep = flow.steps.find((s) => s.id === "parallel-after-a");
    expect(parallelStep).toBeTruthy();
    expect(parallelStep?.action).toBe("parallel");
    expect(parallelStep?.branches).toHaveLength(3);
    expect(parallelStep?.branches).toEqual(["b", "c", "d"]);
  });
});

describe("compileGraph - 3-node cycle detection", () => {
  it("detects cycle in A->B->C->A", () => {
    const yaml = `
name: three-cycle
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
});

describe("compileGraph - mixed atomic and composite nodes", () => {
  it("handles mix of atomic and composite nodes", () => {
    const yaml = `
name: mixed
nodes:
  - id: atomic1
    type: plain-processor
  - id: composite1
    type: sub-flow
  - id: atomic2
    type: final-step
wires:
  - from: atomic1.out → to: composite1.in
  - from: composite1.out → to: atomic2.in
`;
    const parseResult = parseGraphYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const compositeNames = new Set(["sub-flow"]);
    const result = compileGraph(parseResult.value, compositeNames);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flow = result.value;

    const atomic1Step = flow.steps.find((s) => s.id === "atomic1");
    expect(atomic1Step?.action).toBe("process");
    expect(atomic1Step?.blockRef).toBe("plain-processor");

    const compositeStep = flow.steps.find((s) => s.id === "composite1");
    expect(compositeStep?.action).toBe("call");
    expect(compositeStep?.flowRef).toBe("sub-flow");

    const atomic2Step = flow.steps.find((s) => s.id === "atomic2");
    expect(atomic2Step?.action).toBe("process");
    expect(atomic2Step?.blockRef).toBe("final-step");
  });
});
