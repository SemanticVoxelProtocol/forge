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
});
