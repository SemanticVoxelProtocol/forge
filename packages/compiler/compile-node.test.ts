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

  // --- edge case tests ---

  it("a) node with empty validate → empty validate object in L3", () => {
    const yaml = `
name: empty-validate
pins:
  input: []
  output: []
validate: {}
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileNode(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.validate).toEqual({});
  });

  it("b) node with empty constraints → empty array in L3", () => {
    const yaml = `
name: empty-constraints
pins:
  input: []
  output: []
constraints: []
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileNode(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.constraints).toEqual([]);
  });

  it("c) node with empty description → empty string in L3", () => {
    const yaml = `
name: empty-desc
pins:
  input: []
  output: []
description: ""
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileNode(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.description).toBe("");
  });

  it("d) node with multiple validate rules", () => {
    const yaml = `
name: multi-validate
pins:
  input:
    - name: a
      type: string
    - name: b
      type: number
  output: []
validate:
  a: string
  b: number
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileNode(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.validate).toEqual({ a: "string", b: "number" });
  });

  it("e) node with multiple constraints", () => {
    const yaml = `
name: multi-constraints
pins:
  input:
    - name: x
      type: number
  output:
    - name: y
      type: number
constraints:
  - x > 0
  - x < 100
  - y is not null
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileNode(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.constraints).toEqual(["x > 0", "x < 100", "y is not null"]);
  });

  it("f) node name used as both id and name in resulting L3Block", () => {
    const yaml = `
name: my-node
pins:
  input: []
  output: []
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileNode(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("my-node");
    expect(result.value.name).toBe("my-node");
  });

  it("g) revision is always rev:1, parentRev:null, source:init for fresh compile", () => {
    const yaml = `
name: rev-check
pins:
  input: []
  output: []
`;
    const parseResult = parseNodeYaml(yaml, "test.yaml");
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const result = compileNode(parseResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.revision.rev).toBe(1);
    expect(result.value.revision.parentRev).toBeNull();
    expect(result.value.revision.source).toEqual({ type: "init" });
  });

  it("h) contentHash is consistent (compile same node twice → same hash)", () => {
    const yaml = `
name: hash-stable
pins:
  input:
    - name: p
      type: string
  output:
    - name: q
      type: string
validate:
  p: string
constraints:
  - p is not empty
description: stable node
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
});
