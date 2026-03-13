// NodeIR → L3Block 编译

import { hashL3 } from "../core/hash.js";
import { ok } from "../core/result.js";
import type { CompileError, NodeIr } from "./types.js";
import type { L3Block, Pin } from "../core/l3.js";
import type { Result } from "../core/result.js";
import type { ArtifactVersion } from "../core/version.js";

/** 将原子节点 IR 编译为 L3Block */
export function compileNode(node: NodeIr): Result<L3Block, CompileError> {
  const inputPins: Pin[] = node.pins.input.map((p) => ({
    name: p.name,
    type: p.type,
    ...(p.optional === true ? { optional: true } : {}),
  }));

  const outputPins: Pin[] = node.pins.output.map((p) => ({
    name: p.name,
    type: p.type,
    ...(p.optional === true ? { optional: true } : {}),
  }));

  const revision: ArtifactVersion = {
    rev: 1,
    parentRev: null,
    source: { type: "init" },
    timestamp: new Date().toISOString(),
  };

  // 先构建不含 hash 的对象，再计算 hash
  const partial = {
    id: node.name,
    name: node.name,
    input: inputPins,
    output: outputPins,
    validate: node.validate ?? {},
    constraints: node.constraints ?? [],
    description: node.description ?? "",
  };

  const contentHash = hashL3(partial);

  const block: L3Block = {
    ...partial,
    revision,
    contentHash,
  };

  return ok(block);
}
