import { describe, expect, it } from "vitest";
import { parseNodeYaml } from "./parse-node.js";

describe("parseNodeYaml", () => {
  it("解析 greet 节点", () => {
    const yaml = `
name: greet
pins:
  input:
    - name: name
      type: string
  output:
    - name: greeting
      type: Greeting
validate:
  name: string
constraints:
  - output.greeting.message is not empty
description: |
  接收名字，生成问候消息。
`;
    const result = parseNodeYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.name).toBe("greet");
    expect(result.value.pins.input).toHaveLength(1);
    expect(result.value.pins.input[0]?.name).toBe("name");
    expect(result.value.pins.input[0]?.type).toBe("string");
    expect(result.value.pins.output).toHaveLength(1);
    expect(result.value.pins.output[0]?.name).toBe("greeting");
    expect(result.value.validate).toEqual({ name: "string" });
    expect(result.value.constraints).toEqual(["output.greeting.message is not empty"]);
    expect(result.value.description).toContain("接收名字");
  });

  it("解析复合节点 order-pipeline", () => {
    const yaml = `
name: order-pipeline
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
wires:
  - from: input.request      → to: val.request
  - from: val.result         → to: inv.items
`;
    const result = parseNodeYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.name).toBe("order-pipeline");
    expect(result.value.type).toBe("composite");
    expect(result.value.nodes).toHaveLength(2);
    expect(result.value.nodes?.[0]?.id).toBe("val");
    expect(result.value.nodes?.[0]?.type).toBe("validate-order");
    expect(result.value.wires).toHaveLength(2);
    expect(result.value.wires?.[0]?.from).toBe("input.request");
    expect(result.value.wires?.[0]?.to).toBe("val.request");
  });

  it("缺少 name 字段报错", () => {
    const yaml = `
pins:
  input: []
  output: []
`;
    const result = parseNodeYaml(yaml, "bad.yaml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("缺少 pins 字段报错", () => {
    const yaml = `
name: broken
`;
    const result = parseNodeYaml(yaml, "bad.yaml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("无效 YAML 报错", () => {
    const result = parseNodeYaml("{{invalid", "bad.yaml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("YAML_PARSE_ERROR");
  });

  it("解析箭头语法的 wires", () => {
    const yaml = `
name: test
type: composite
pins:
  input:
    - name: x
      type: string
  output:
    - name: y
      type: string
nodes:
  - id: a
    type: foo
wires:
  - from: input.x       → to: a.x
  - from: a.y           → to: output.y
`;
    const result = parseNodeYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.wires).toHaveLength(2);
    expect(result.value.wires?.[0]).toEqual({ from: "input.x", to: "a.x" });
    expect(result.value.wires?.[1]).toEqual({ from: "a.y", to: "output.y" });
  });

  // --- edge case tests ---

  it("a) empty YAML content (null raw) → INVALID_NODE error", () => {
    const result = parseNodeYaml("", "empty.yaml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_NODE");
  });

  it("b) node with empty name string → MISSING_FIELD", () => {
    const yaml = `
name: ""
pins:
  input: []
  output: []
`;
    const result = parseNodeYaml(yaml, "bad.yaml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("c) composite node with type: composite field", () => {
    const yaml = `
name: my-composite
type: composite
pins:
  input:
    - name: in
      type: string
  output:
    - name: out
      type: string
nodes:
  - id: step
    type: do-thing
wires:
  - from: input.in      → to: step.in
`;
    const result = parseNodeYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe("composite");
  });

  it("d) wire parsing with arrow syntax (→ character)", () => {
    const yaml = `
name: arrow-test
type: composite
pins:
  input:
    - name: src
      type: string
  output:
    - name: dst
      type: string
nodes:
  - id: n
    type: pass
wires:
  - from: input.src     → to: n.src
  - from: n.dst         → to: output.dst
`;
    const result = parseNodeYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.wires?.[0]).toEqual({ from: "input.src", to: "n.src" });
    expect(result.value.wires?.[1]).toEqual({ from: "n.dst", to: "output.dst" });
  });

  it("e) node with all optional fields present (validate, constraints, description)", () => {
    const yaml = `
name: full-node
pins:
  input:
    - name: x
      type: string
  output:
    - name: y
      type: number
validate:
  x: string
constraints:
  - x is not empty
  - y > 0
description: A fully specified node.
`;
    const result = parseNodeYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.validate).toEqual({ x: "string" });
    expect(result.value.constraints).toEqual(["x is not empty", "y > 0"]);
    expect(result.value.description).toBe("A fully specified node.");
  });

  it("f) node with no optional fields (only name and pins)", () => {
    const yaml = `
name: minimal
pins:
  input:
    - name: a
      type: string
  output:
    - name: b
      type: string
`;
    const result = parseNodeYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.validate).toBeUndefined();
    expect(result.value.constraints).toBeUndefined();
    expect(result.value.description).toBeUndefined();
    expect(result.value.type).toBeUndefined();
  });

  it("g) pins with optional: true field", () => {
    const yaml = `
name: opt-pins
pins:
  input:
    - name: required
      type: string
    - name: optional-in
      type: string
      optional: true
  output:
    - name: out
      type: string
`;
    const result = parseNodeYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pins.input[0]?.optional).toBeUndefined();
    expect(result.value.pins.input[1]?.optional).toBe(true);
  });

  it("h) multiple input and output pins", () => {
    const yaml = `
name: multi-pins
pins:
  input:
    - name: a
      type: string
    - name: b
      type: number
    - name: c
      type: boolean
  output:
    - name: x
      type: string
    - name: y
      type: number
`;
    const result = parseNodeYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pins.input).toHaveLength(3);
    expect(result.value.pins.output).toHaveLength(2);
    expect(result.value.pins.input[1]?.name).toBe("b");
    expect(result.value.pins.output[1]?.name).toBe("y");
  });

  it("i) empty pins object (input: [], output: [])", () => {
    const yaml = `
name: empty-pins
pins:
  input: []
  output: []
`;
    const result = parseNodeYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pins.input).toHaveLength(0);
    expect(result.value.pins.output).toHaveLength(0);
  });
});
