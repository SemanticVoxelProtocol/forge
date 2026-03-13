// 解析图 YAML → GraphIR

import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";
import { err, ok } from "../core/result.js";
import { parseWires } from "./parse-node.js";
import type { CompileError, GraphIr, PinIr } from "./types.js";
import type { Result } from "../core/result.js";

/** 从 YAML 字符串解析图 */
export function parseGraphYaml(content: string, filePath: string): Result<GraphIr, CompileError> {
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
      code: "INVALID_GRAPH",
      message: `图文件内容不是对象: ${filePath}`,
      path: filePath,
    });
  }

  const name = raw.name;
  if (typeof name !== "string" || name === "") {
    return err({
      code: "MISSING_FIELD",
      message: `缺少 name 字段: ${filePath}`,
      path: filePath,
    });
  }

  const nodesRaw = raw.nodes;
  if (!Array.isArray(nodesRaw)) {
    return err({
      code: "MISSING_FIELD",
      message: `缺少 nodes 字段: ${filePath}`,
      path: filePath,
    });
  }

  const wiresRaw = raw.wires;
  if (!Array.isArray(wiresRaw)) {
    return err({
      code: "MISSING_FIELD",
      message: `缺少 wires 字段: ${filePath}`,
      path: filePath,
    });
  }

  const graph: GraphIr = {
    name: name,
    ...(raw.description === undefined ? {} : { description: (raw.description as string).trim() }),
    ...(raw.input === undefined ? {} : { input: parsePins(raw.input) }),
    ...(raw.output === undefined ? {} : { output: parsePins(raw.output) }),
    ...(raw.trigger === undefined
      ? {}
      : {
          trigger: raw.trigger as {
            type: "http" | "event" | "schedule" | "manual";
            config: Record<string, unknown>;
          },
        }),
    nodes: (nodesRaw as Array<Record<string, string>>).map((n) => ({
      id: n.id,
      type: n.type,
    })),
    wires: parseWires(wiresRaw as unknown[]),
  };

  return ok(graph);
}

/** 从文件路径读取并解析图 */
export async function parseGraphFile(filePath: string): Promise<Result<GraphIr, CompileError>> {
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
  return parseGraphYaml(content, filePath);
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
