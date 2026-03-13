import { describe, expect, it } from "vitest";
import { parseGraphYaml } from "./parse-graph.js";

describe("parseGraphYaml", () => {
  it("解析 hello-world 图", () => {
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
    const result = parseGraphYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.name).toBe("hello-world");
    expect(result.value.description).toBe("接收名字，生成大写问候语");
    expect(result.value.input).toHaveLength(1);
    expect(result.value.output).toHaveLength(1);
    expect(result.value.nodes).toHaveLength(2);
    expect(result.value.nodes[0]?.id).toBe("g");
    expect(result.value.nodes[0]?.type).toBe("greet");
  });

  it("解析箭头语法的 wires", () => {
    const yaml = `
name: test
nodes:
  - id: a
    type: foo
  - id: b
    type: bar
wires:
  - from: a.out       → to: b.in
`;
    const result = parseGraphYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.wires).toHaveLength(1);
    expect(result.value.wires[0]).toEqual({ from: "a.out", to: "b.in" });
  });

  it("缺少 name 报错", () => {
    const yaml = `
nodes:
  - id: a
    type: foo
wires: []
`;
    const result = parseGraphYaml(yaml, "bad.yaml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("缺少 nodes 报错", () => {
    const yaml = `
name: broken
wires: []
`;
    const result = parseGraphYaml(yaml, "bad.yaml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("缺少 wires 报错", () => {
    const yaml = `
name: broken
nodes:
  - id: a
    type: foo
`;
    const result = parseGraphYaml(yaml, "bad.yaml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("解析带 trigger 的图", () => {
    const yaml = `
name: api-flow
trigger:
  type: http
  config:
    method: POST
    path: /api/orders
nodes:
  - id: handler
    type: handle-request
wires: []
`;
    const result = parseGraphYaml(yaml, "test.yaml");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.trigger?.type).toBe("http");
    expect(result.value.trigger?.config).toEqual({
      method: "POST",
      path: "/api/orders",
    });
  });
});
