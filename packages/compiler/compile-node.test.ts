import { describe, expect, it } from "vitest";
import { compileNode } from "./compile-node.js";
import { parseNodeYaml } from "./parse-node.js";

describe("compileNode", () => {
  it("编译 greet 节点为 L3Block", () => {
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
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileNode(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const block = result.value;
    expect(block.id).toBe("greet");
    expect(block.name).toBe("greet");
    expect(block.input).toHaveLength(1);
    expect(block.input[0]?.name).toBe("name");
    expect(block.input[0]?.type).toBe("string");
    expect(block.output).toHaveLength(1);
    expect(block.output[0]?.name).toBe("greeting");
    expect(block.output[0]?.type).toBe("Greeting");
    expect(block.validate).toEqual({ name: "string" });
    expect(block.constraints).toEqual(["output.greeting.message is not empty"]);
    expect(block.description).toContain("接收名字");
    expect(block.revision.rev).toBe(1);
    expect(block.revision.source).toEqual({ type: "init" });
    expect(block.contentHash).toBeTruthy();
  });

  it("hash 稳定性：相同输入产生相同 hash", () => {
    const yaml = `
name: stable
pins:
  input:
    - name: x
      type: string
  output:
    - name: y
      type: string
validate: {}
constraints: []
description: test
`;
    const parse1 = parseNodeYaml(yaml, "a.yaml");
    const parse2 = parseNodeYaml(yaml, "b.yaml");
    expect(parse1.ok && parse2.ok).toBe(true);
    if (!parse1.ok || !parse2.ok) return;

    const result1 = compileNode(parse1.value);
    const result2 = compileNode(parse2.value);
    expect(result1.ok && result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    expect(result1.value.contentHash).toBe(result2.value.contentHash);
  });

  it("不同输入产生不同 hash", () => {
    const yaml1 = `
name: node-a
pins:
  input:
    - name: x
      type: string
  output:
    - name: y
      type: string
description: version 1
`;
    const yaml2 = `
name: node-a
pins:
  input:
    - name: x
      type: string
  output:
    - name: y
      type: string
description: version 2
`;
    const parse1 = parseNodeYaml(yaml1, "a.yaml");
    const parse2 = parseNodeYaml(yaml2, "b.yaml");
    expect(parse1.ok && parse2.ok).toBe(true);
    if (!parse1.ok || !parse2.ok) return;

    const result1 = compileNode(parse1.value);
    const result2 = compileNode(parse2.value);
    expect(result1.ok && result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    expect(result1.value.contentHash).not.toBe(result2.value.contentHash);
  });

  it("可选 pin 正确映射", () => {
    const yaml = `
name: optional-test
pins:
  input:
    - name: required
      type: string
    - name: maybe
      type: string
      optional: true
  output:
    - name: out
      type: string
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileNode(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.input[1]?.optional).toBe(true);
    expect(result.value.input[0]?.optional).toBeUndefined();
  });
});
