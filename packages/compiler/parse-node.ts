// 解析节点 YAML → NodeIR

import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";
import { err, ok } from "../core/result.js";
import type { CompileError, NodeIr, PinIr, WireIr } from "./types.js";
import type { Result } from "../core/result.js";

/** 从 YAML 字符串解析节点 */
export function parseNodeYaml(content: string, filePath: string): Result<NodeIr, CompileError> {
  const doc = parseDocument(content);

  // 只检查非箭头语法相关的致命错误
  const fatalErrors = doc.errors.filter((e) => e.code !== "BLOCK_AS_IMPLICIT_KEY");
  if (fatalErrors.length > 0) {
    return err({
      code: "YAML_PARSE_ERROR",
      message: `YAML 解析失败: ${filePath}: ${fatalErrors[0].message}`,
      path: filePath,
    });
  }

  const raw = doc.toJS() as Record<string, unknown> | null;

  if (typeof raw !== "object" || raw === null) {
    return err({
      code: "INVALID_NODE",
      message: `节点文件内容不是对象: ${filePath}`,
      path: filePath,
    });
  }

  // 校验必需字段
  const name = raw.name;
  if (typeof name !== "string" || name === "") {
    return err({
      code: "MISSING_FIELD",
      message: `缺少 name 字段: ${filePath}`,
      path: filePath,
    });
  }

  const pins = raw.pins;
  if (typeof pins !== "object" || pins === null) {
    return err({
      code: "MISSING_FIELD",
      message: `缺少 pins 字段: ${filePath}`,
      path: filePath,
    });
  }

  const pinsRecord = pins as Record<string, unknown>;
  const inputPins = parsePins(pinsRecord.input);
  const outputPins = parsePins(pinsRecord.output);

  const nodeType = raw.type === "composite" ? "composite" : undefined;

  const node: NodeIr = {
    name: name,
    ...(nodeType === undefined ? {} : { type: nodeType }),
    pins: { input: inputPins, output: outputPins },
    ...(raw.validate === undefined ? {} : { validate: raw.validate as Record<string, string> }),
    ...(raw.constraints === undefined ? {} : { constraints: raw.constraints as string[] }),
    ...(raw.description === undefined ? {} : { description: (raw.description as string).trim() }),
    ...(raw.nodes === undefined
      ? {}
      : {
          nodes: (raw.nodes as Array<Record<string, string>>).map((n) => ({
            id: n.id,
            type: n.type,
          })),
        }),
    ...(raw.wires === undefined ? {} : { wires: parseWires(raw.wires as unknown[]) }),
  };

  return ok(node);
}

/** 从文件路径读取并解析节点 */
export async function parseNodeFile(filePath: string): Promise<Result<NodeIr, CompileError>> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return err({
      code: "FILE_READ_ERROR",
      message: `无法读取文件: ${filePath}`,
      path: filePath,
    });
  }
  return parseNodeYaml(content, filePath);
}

/** 解析 pin 数组 */
function parsePins(raw: unknown): PinIr[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((p) => ({
    name: p.name as string,
    type: p.type as string,
    ...(p.optional === true ? { optional: true } : {}),
  }));
}

/**
 * 解析 wire 数组，处理 → 箭头语法。
 *
 * YAML 将 `- from: input.name → to: g.name` 解析为嵌套映射：
 * `{ from: { "input.name       → to": "g.name" } }`
 *
 * 也支持普通对象语法：`{ from: "a.x", to: "b.y" }`
 */
export function parseWires(raw: unknown[]): WireIr[] {
  return raw.map((w) => {
    const wire = w as Record<string, unknown>;
    const fromValue = wire.from;

    // 箭头语法：from 是一个嵌套对象 { "input.name → to": "g.name" }
    if (typeof fromValue === "object" && fromValue !== null) {
      const nested = fromValue as Record<string, string>;
      const entries = Object.entries(nested);
      if (entries.length > 0) {
        const [key, value] = entries[0];
        // key 形如 "input.name       → to"，拆分取 from
        const arrowIndex = key.indexOf("→");
        if (arrowIndex !== -1) {
          const from = key.slice(0, arrowIndex).trim();
          return { from, to: value };
        }
      }
    }

    // 普通语法：{ from: "a.x", to: "b.y" }
    const fromStr = typeof fromValue === "string" ? fromValue.trim() : "";
    const toRaw = wire.to;
    const toStr = typeof toRaw === "string" ? toRaw.trim() : "";
    return { from: fromStr, to: toStr };
  });
}
